# Recordly BiRefNet matte worker: webcam video -> grayscale matte video (white = person).
# usage: worker.py <model.onnx> <ffmpeg> <input> <output.mp4> <fpsCap> <maxWidth> [provider]
# The matte keeps the source frame rate (capped at fpsCap) so frame N of the matte is frame N of the camera.
# stdout: JSON lines {"stage":"matting","done":n,"total":n} ... {"stage":"done",...}
import json
import queue
import re
import subprocess
import sys
import threading
import time

import numpy as np
import onnxruntime as ort
from PIL import Image

MODEL, FFMPEG, SRC, OUT = sys.argv[1:5]
FPS_CAP = float(sys.argv[5])
MAX_W = int(sys.argv[6])
PROVIDER = sys.argv[7] if len(sys.argv) > 7 else "dml"
S = 1024  # BiRefNet_lite input size
MEAN = np.array([0.485, 0.456, 0.406], np.float32).reshape(1, 3, 1, 1)
STD = np.array([0.229, 0.224, 0.225], np.float32).reshape(1, 3, 1, 1)
REPLIES = sys.stdout
sys.stdout = sys.stderr


def emit(payload):
    REPLIES.write(json.dumps(payload) + "\n")
    REPLIES.flush()


def probe():
    r = subprocess.run([FFMPEG, "-hide_banner", "-i", SRC], capture_output=True, text=True, encoding="utf-8", errors="replace")
    m = re.search(r"Video:.*?, (\d{2,5})x(\d{2,5})", r.stderr)
    d = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    if not m:
        raise RuntimeError("no video stream: " + r.stderr[-300:])
    w, h = int(m.group(1)), int(m.group(2))
    dur = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3)) if d else 0
    f = re.search(r"([\d.]+) fps", r.stderr) or re.search(r"([\d.]+) tbr", r.stderr)
    return w, h, dur, float(f.group(1)) if f else FPS_CAP


def main():
    w, h, dur, src_fps = probe()
    FPS = min(src_fps, FPS_CAP)
    ow = min(w, MAX_W) // 2 * 2
    oh = max(2, round(h * ow / w / 2) * 2)
    total = max(1, int(dur * FPS))
    providers = ["DmlExecutionProvider", "CPUExecutionProvider"] if PROVIDER == "dml" else ["CPUExecutionProvider"]
    opts = ort.SessionOptions()
    opts.log_severity_level = 3
    t0 = time.time()
    sess = ort.InferenceSession(MODEL, opts, providers=providers)
    emit({"stage": "loaded", "provider": sess.get_providers()[0], "loadSec": time.time() - t0})

    dec = subprocess.Popen(
        [FFMPEG, "-v", "error", "-i", SRC, "-an", "-vf", f"fps={FPS},scale={S}:{S}:flags=bicubic", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE,
    )
    enc = subprocess.Popen(
        [FFMPEG, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{ow}x{oh}", "-r", str(FPS), "-i", "-",
         "-c:v", "libx264", "-crf", "10", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT],
        stdin=subprocess.PIPE,
    )
    frames = queue.Queue(maxsize=4)
    outq = queue.Queue(maxsize=8)

    def reader():
        n = S * S * 3
        while True:
            buf = dec.stdout.read(n)
            if len(buf) < n:
                break
            frames.put(np.frombuffer(buf, np.uint8).reshape(S, S, 3))
        frames.put(None)

    def writer():
        while True:
            a = outq.get()
            if a is None:
                break
            im = Image.fromarray(a).resize((ow, oh), Image.BILINEAR)
            enc.stdin.write(im.tobytes())

    threading.Thread(target=reader, daemon=True).start()
    wt = threading.Thread(target=writer, daemon=True)
    wt.start()
    n = 0
    t0 = time.time()
    while True:
        f = frames.get()
        if f is None:
            break
        x = (f.astype(np.float32).transpose(2, 0, 1)[None] / 255.0 - MEAN) / STD
        y = sess.run(None, {"input_image": x})[0][0, 0]
        a = (1.0 / (1.0 + np.exp(-y)) * 255.0 + 0.5).astype(np.uint8)
        outq.put(a)
        n += 1
        if n % 3 == 0:
            emit({"stage": "matting", "done": n, "total": max(total, n)})
    outq.put(None)
    wt.join()
    enc.stdin.close()
    if enc.wait() != 0 or n == 0:
        raise RuntimeError("matte encode failed")
    emit({"stage": "done", "frames": n, "width": ow, "height": oh, "fps": FPS, "computeSec": time.time() - t0})


try:
    main()
except Exception as e:  # noqa: BLE001
    emit({"stage": "error", "error": str(e)})
    sys.exit(1)
