# Recordly AI upscale worker: RGBA frames in on stdin, 2x RGBA frames out on stdout.
# Protocol (little-endian u32 triples):
#   request  = (width, height, 0) + width*height*4 RGBA bytes
#   response = (0, width, height) + width*height*4 RGBA bytes, or (1, n, 0) + n bytes utf-8 error
#   on start the worker sends (0, 0, 0) once the model is loaded, or (1, n, 0) + error.
# argv: <model name> <weights path>
# SRVGGNetCompact below re-implements the Real-ESRGAN compact arch (BSD-3, github.com/xinntao/Real-ESRGAN).
import struct
import sys
import time

import torch
import torch.nn.functional as F
from torch import nn


def conv3x3(cin, cout):
    return nn.Conv2d(cin, cout, 3, padding=1)


class SRVGGNetCompact(nn.Module):
    def __init__(self, num_conv, scale=4, ch=64):
        super().__init__()
        body = [conv3x3(3, ch), nn.PReLU(ch)]
        for _ in range(num_conv):
            body += [conv3x3(ch, ch), nn.PReLU(ch)]
        body.append(conv3x3(ch, 3 * scale * scale))
        self.body = nn.Sequential(*body)
        self.up = nn.PixelShuffle(scale)
        self.scale = scale

    def forward(self, x):
        return self.up(self.body(x)) + F.interpolate(x, scale_factor=self.scale, mode="nearest")


def load_model(name, weights):
    sd = torch.load(weights, map_location="cpu", weights_only=True)
    sd = sd.get("params_ema", sd.get("params", sd))
    model = SRVGGNetCompact(num_conv=32 if "general" in name else 16)
    model.load_state_dict(sd)
    return model


def read_exact(stream, n):
    buf = bytearray(n)
    view = memoryview(buf)
    got = 0
    while got < n:
        k = stream.readinto(view[got:])
        if not k:
            raise EOFError
        got += k
    return buf


def send(out, status, a, b, payload=b""):
    out.write(struct.pack("<III", status, a, b))
    if payload:
        out.write(payload)
    out.flush()


def main():
    stdin, stdout = sys.stdin.buffer, sys.stdout.buffer
    try:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        dtype = torch.float16 if device.type == "cuda" else torch.float32
        model = load_model(sys.argv[1], sys.argv[2]).to(device, dtype).eval()
        # No cudnn.benchmark: crop sizes change every frame while zooming and each new size re-tunes (~0.8 s).
        torch.backends.cudnn.benchmark = False
    except Exception as error:  # noqa: BLE001
        msg = str(error).encode()
        send(stdout, 1, len(msg), 0, msg)
        return
    send(stdout, 0, 0, 0)
    sys.stderr.write(f"[upscale] {sys.argv[1]} on {device}\n")
    sys.stderr.flush()
    while True:
        try:
            w, h, _ = struct.unpack("<III", read_exact(stdin, 12))
            data = read_exact(stdin, w * h * 4)
        except EOFError:
            return
        try:
            started = time.perf_counter()
            with torch.inference_mode():
                rgba = torch.frombuffer(data, dtype=torch.uint8).to(device).view(h, w, 4)
                x = rgba[..., :3].permute(2, 0, 1).unsqueeze(0).to(dtype) / 255.0
                y = model(x)
                if model.scale != 2:
                    y = F.interpolate(y.float(), size=(h * 2, w * 2), mode="bicubic", antialias=True)
                y = (y.float().clamp_(0, 1) * 255.0).round_().to(torch.uint8)[0].permute(1, 2, 0)
                out = torch.empty((h * 2, w * 2, 4), dtype=torch.uint8, device=device)
                out[..., :3] = y
                out[..., 3] = 255
                payload = out.cpu().numpy().tobytes()
            send(stdout, 0, w * 2, h * 2, payload)
            sys.stderr.write(f"[upscale] {w}x{h} {1000 * (time.perf_counter() - started):.0f}ms\n")
            sys.stderr.flush()
        except Exception as error:  # noqa: BLE001
            msg = str(error).encode()
            send(stdout, 1, len(msg), 0, msg)


if __name__ == "__main__":
    main()
