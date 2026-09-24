#!/usr/bin/env python3
"""Generate Kindred's original 210 ms, two-note soft pop (no sampled audio)."""
import math
from pathlib import Path
import struct
import wave

RATE = 48000
DURATION = 0.210
DESTINATION = Path(__file__).resolve().parents[1] / 'ui/audio/kindred-pop.wav'


def samples():
    values = []
    for index in range(round(RATE * DURATION)):
        time = index / RATE
        value = 0.0
        for start, frequency, volume, decay in [(0.0, 392.00, 0.74, 0.027), (0.055, 523.25, 0.92, 0.032)]:
            t = time - start
            if t < 0:
                continue
            # A tiny downward bend gives each rounded pluck its bounce.
            phase = 2 * math.pi * frequency * (t + 0.035 * 0.009 * (1 - math.exp(-t / 0.009)))
            attack = 1 - math.exp(-t / 0.0035)
            release = min(1.0, max(0.0, (DURATION - time) / 0.015)) ** 2
            tone = math.sin(phase) + 0.035 * math.sin(2 * phase)
            value += volume * tone * attack * math.exp(-t / decay) * release
        values.append(value)
    scale = 0.38 / max(abs(value) for value in values)
    return [round(32767 * value * scale) for value in values]


if __name__ == '__main__':
    frames = samples()
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(DESTINATION), 'wb') as output:
        output.setparams((1, 2, RATE, len(frames), 'NONE', 'not compressed'))
        output.writeframes(struct.pack('<' + 'h' * len(frames), *frames))
    print(f'{DESTINATION}: {len(frames) / RATE:.3f} seconds, mono PCM, 48 kHz')
