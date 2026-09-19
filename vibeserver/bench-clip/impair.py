#!/usr/bin/env python3
"""impair.py — turn ODR-DabMod's clean IQ into the benchmark's clip: 60 frames, damaged the way a weak signal on
a cheap dongle is, as 8-bit I/Q (VIBEBU81 — see vibe_benchmark_dab.h).

usage: impair.py in.cf32 clean.vbu8 impaired.vbu8 snr_db sid

★ 60 frames exactly (5.76 s at 2.048 MS/s — long enough for station text and slides to complete, Stuart): whole frames AND whole 5-CIF DAB+ superframes, so the loop is
  seamless in timing. Taken from the middle of the run, clear of the multiplexer's start-up.
★ The damage, in the order a receiver meets it:
  - a two-path echo, 20 µs at -6 dB (inside the 246 µs guard — multipath the equaliser must undo, not ISI);
  - three short fades, 30 ms at -15 dB (a bus going past);
  - a 1.8 kHz frequency offset (a dongle's crystal after the ppm setting — sync must track it);
  - white noise at snr_db over the whole 1.536 MHz;
  - 8-bit quantisation at ~30 counts RMS, an RTL's level with its AGC off.
★ The clean file is kept alongside: clean vs impaired on the same box is how we know what the damage costs.
"""
import struct
import sys

import numpy as np

FS = 2048000.0
FRAME = 196608            # mode I, 96 ms
N_FRAMES = 60
CENTRE = 227360000.0      # 12D — a block, so the service tunes by channel like any other

src, clean_out, bad_out, snr_db, sid = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), int(sys.argv[5], 0)
iq = np.fromfile(src, dtype=np.complex64)
start = 30 * FRAME
if len(iq) < start + N_FRAMES * FRAME:
    sys.exit(f"only {len(iq) // FRAME} frames of IQ — need {30 + N_FRAMES}")
x = iq[start:start + N_FRAMES * FRAME].astype(np.complex128)
x /= np.sqrt(np.mean(np.abs(x) ** 2))                        # unit power

rng = np.random.default_rng(20260919)                         # ★ fixed: the same clip every build


def to_u8(v, rms_counts=30.0):
    v = v / np.sqrt(np.mean(np.abs(v) ** 2)) * (rms_counts / np.sqrt(2))
    out = np.empty(2 * len(v), dtype=np.float64)
    out[0::2], out[1::2] = v.real, v.imag
    return np.clip(np.round(out + 127.5), 0, 255).astype(np.uint8)


def write(path, v):
    with open(path, "wb") as f:
        f.write(b"VIBEBU81" + struct.pack("<ddI", FS, CENTRE, sid))
        f.write(to_u8(v).tobytes())


write(clean_out, x)

y = x.copy()
d = int(20e-6 * FS)                                           # echo
y[d:] += 10 ** (-6 / 20) * x[:-d]
for at in (0.43, 1.37, 3.9):                                       # fades, raised-cosine edges
    a, n = int(at * FS), int(0.030 * FS)
    ramp = int(0.005 * FS)
    g = np.ones(n) * 10 ** (-15 / 20)
    edge = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, ramp))
    g[:ramp] = 1 - (1 - 10 ** (-15 / 20)) * edge
    g[-ramp:] = g[:ramp][::-1]
    y[a:a + n] *= g
t = np.arange(len(y)) / FS
y *= np.exp(2j * np.pi * 1800.0 * t)                          # frequency offset
p = np.mean(np.abs(y) ** 2)
noise = (rng.standard_normal(len(y)) + 1j * rng.standard_normal(len(y))) * np.sqrt(p / 2 / 10 ** (snr_db / 10))
y += noise
write(bad_out, y)
print(f"wrote {clean_out} and {bad_out}: {N_FRAMES} frames, SNR {snr_db} dB, sid 0x{sid:04x}")
