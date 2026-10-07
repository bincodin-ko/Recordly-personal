# Recordly voiceover worker. One process per engine, kept alive between requests.
# stdin: one JSON request per line {"id","text","voice","lang","out"}
# stdout: one JSON reply per line {"id","ok","durationSec","computeSec"} or {"id","ok":false,"error"}
import json
import os
import sys
import time

ENGINE = sys.argv[1]
MODEL_ID = sys.argv[2] if len(sys.argv) > 2 else ""
MODEL_REVISION = sys.argv[3] if len(sys.argv) > 3 else None
MODEL_DIR = sys.argv[4] if len(sys.argv) > 4 else None
# -I ignores PYTHONUTF8, so pin the pipe encodings explicitly (Korean text).
sys.stdin.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")
sys.stdout.reconfigure(encoding="utf-8")
# Libraries print banners/warnings to stdout; keep stdout for replies only.
REPLIES = sys.stdout
sys.stdout = sys.stderr


def reply(payload):
    REPLIES.write(json.dumps(payload) + "\n")
    REPLIES.flush()


def load():
    import soundfile as sf

    if ENGINE == "supertonic":
        from supertonic import TTS

        tts = TTS(model="supertonic-3", auto_download=True)
        styles = {}

        def synth(text, voice, lang, out):
            if voice not in styles:
                styles[voice] = tts.get_voice_style(voice_name=voice)
            wav, _ = tts.synthesize(text, voice_style=styles[voice], lang=lang)
            tts.save_audio(wav, out)
            return wav.shape[-1] / tts.sample_rate

        return synth

    import torch
    from huggingface_hub import snapshot_download
    from qwen_tts import Qwen3TTSModel

    # A flat local folder keeps paths short (the HF cache layout can exceed MAX_PATH on Windows).
    local = snapshot_download(MODEL_ID, revision=MODEL_REVISION, local_dir=MODEL_DIR)
    model = Qwen3TTSModel.from_pretrained(
        local,
        device_map="cuda:0",
        dtype=torch.bfloat16,
        attn_implementation="sdpa",
    )
    languages = {"ko": "Korean", "en": "English"}

    def synth(text, voice, lang, out):
        wavs, sr = model.generate_custom_voice(
            text=text, language=languages.get(lang, "Auto"), speaker=voice
        )
        sf.write(out, wavs[0], sr)
        return len(wavs[0]) / sr

    return synth


def main():
    started = time.perf_counter()
    try:
        synth = load()
    except Exception as error:  # noqa: BLE001 - report any load failure to the app
        reply({"id": "load", "ok": False, "error": f"{type(error).__name__}: {error}"})
        return
    reply({"id": "load", "ok": True, "loadSec": time.perf_counter() - started})
    for line in sys.stdin:
        if not line.strip():
            continue
        request = json.loads(line)
        try:
            os.makedirs(os.path.dirname(request["out"]), exist_ok=True)
            t0 = time.perf_counter()
            duration = synth(request["text"], request["voice"], request["lang"], request["out"])
            reply(
                {
                    "id": request["id"],
                    "ok": True,
                    "durationSec": duration,
                    "computeSec": time.perf_counter() - t0,
                }
            )
        except Exception as error:  # noqa: BLE001
            reply({"id": request["id"], "ok": False, "error": f"{type(error).__name__}: {error}"})


if __name__ == "__main__":
    main()
