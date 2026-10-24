"""Original score for the GH-18 film, synthesised from scratch (numpy only, no samples).

96 BPM, 4/4, D minor. One bar = 2.5 s, matching the shot list in shots.mjs:
  bars 0-1   title (pad swell, reversed swell into the first picture)
  bars 2-10  build: plucked arpeggio, then kick, then hats; riser + one beat of silence before the drop
  bars 11-13 DROP on the exploding dollhouse: impact, four-on-the-floor kick, bass, bright arp
  bars 14-16 rooms: groove continues, short riser into the time-lapse
  bars 17-18 breakdown under the afternoon-to-dusk time-lapse: lush pad, bells, swell
  bars 19-20 finale: impact on the title, long tail, fade
Usage: python3 film/score.py out.wav
"""
import sys
import wave

import numpy as np

SR = 48000
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 21
TAIL = 2.0
N = int((BARS * BAR + TAIL) * SR)
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)


def t_of(bar, beat=0.0):
    return bar * BAR + beat * BEAT


def put(sig, start_s, gain=1.0, pan=0.0):
    i = int(start_s * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    gl, gr = gain * np.sqrt(0.5 * (1 - pan)), gain * np.sqrt(0.5 * (1 + pan))
    if sig.ndim == 2:
        L[i:i + len(sig)] += sig[:, 0] * gain
        R[i:i + len(sig)] += sig[:, 1] * gain
    else:
        L[i:i + len(sig)] += sig * gl
        R[i:i + len(sig)] += sig * gr


def hz(note):
    """'D3', 'Bb2', 'F#4' -> frequency."""
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
    n = names[note[0]]
    rest = note[1:]
    if rest.startswith('b'):
        n -= 1; rest = rest[1:]
    elif rest.startswith('#'):
        n += 1; rest = rest[1:]
    midi = 12 * (int(rest) + 1) + n
    return 440.0 * 2 ** ((midi - 69) / 12)


def env_adsr(n, a, d, s, r, sus_len):
    t = np.arange(n) / SR
    e = np.zeros(n)
    e = np.where(t < a, t / max(a, 1e-6), e)
    dd = (t >= a) & (t < a + d)
    e = np.where(dd, 1 - (1 - s) * (t - a) / max(d, 1e-6), e)
    e = np.where((t >= a + d) & (t < sus_len), s, e)
    rr = t >= sus_len
    e = np.where(rr, s * np.exp(-(t - sus_len) / max(r, 1e-6) * 3), e)
    return e


# ------------------------------------------------------------------ instruments

def pad(freqs, dur, bright=1.0, attack=0.9, release=1.8):
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    for f in freqs:
        for k, det in enumerate((-0.11, 0.0, 0.13)):
            ff = f * 2 ** (det / 12)
            ph = rng.random() * 6.28
            sig = np.zeros(n)
            for h in range(1, 9):                      # warm, soft saw
                sig += np.sin(2 * np.pi * ff * h * t + ph * h) / h ** (1.6 - 0.35 * bright)
            pan = (-0.6, 0.0, 0.6)[k]
            out[:, 0] += sig * np.sqrt(0.5 * (1 - pan))
            out[:, 1] += sig * np.sqrt(0.5 * (1 + pan))
    e = env_adsr(n, attack, 0.5, 0.85, release, dur)
    trem = 1 + 0.06 * np.sin(2 * np.pi * 0.23 * t)
    return out * (e * trem)[:, None] / (len(freqs) * 3)


def pluck(f, dur=0.9, bright=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = (np.sin(2 * np.pi * f * t) + 0.35 * bright * np.sin(4 * np.pi * f * t) * np.exp(-t * 9)
           + 0.15 * bright * np.sin(6 * np.pi * f * t) * np.exp(-t * 14))
    e = np.minimum(t / 0.004, 1) * np.exp(-t * 4.2)
    return sig * e


def bell(f, dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * dcy) for m, a, dcy in ((1, 1, 1.2), (2.76, 0.4, 2.2), (5.4, 0.2, 3.5), (8.9, 0.08, 5)))
    return sig * np.minimum(t / 0.002, 1)


def bass(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(4 * np.pi * f * t) + 0.15 * np.sin(6 * np.pi * f * t)
    e = np.minimum(t / 0.01, 1) * np.exp(-t * 1.2)
    return np.tanh(sig * 1.4) * e


def kick(power=1.0):
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 6.5)
    click = rng.normal(size=n) * np.exp(-t * 300) * 0.25
    return np.tanh((body + click) * 1.6 * power)


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    x = rng.normal(size=n)
    x = np.diff(np.concatenate([[0], x]))             # crude high-pass
    return x * np.exp(-t * (14 if open_ else 70)) * 0.3


def impact(length=4.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 28 + 60 * np.exp(-t * 5)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.1)
    noise = rng.normal(size=n)
    lp = np.zeros(n)                                    # darkened noise burst
    a = 0.02
    acc = 0.0
    for i in range(0, min(n, int(1.2 * SR))):
        acc += a * (noise[i] - acc)
        lp[i] = acc
    burst = lp * np.exp(-t * 3.0) * 6
    return np.tanh((sub * 1.3 + burst) * 1.2)


def riser(length):
    n = int(length * SR)
    t = np.arange(n) / SR
    k = t / length
    noise = rng.normal(size=n)
    out = np.zeros(n)
    acc = 0.0
    for i in range(n):                                  # one-pole low-pass opening up
        a = 0.01 + 0.5 * k[i] ** 2
        acc += a * (noise[i] - acc)
        out[i] = acc
    sweep = np.sin(2 * np.pi * np.cumsum(180 + 900 * k ** 2) / SR) * 0.25
    return (out * 0.9 + sweep) * k ** 2.2


def reverse_swell(length):
    r = riser(length)
    return r * 0.8


def reverb(x, seconds=2.8, seed=1, wet=0.35):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.random.default_rng(seed).normal(size=n) * np.exp(-t * 6.9 / seconds)
    ir[:int(0.012 * SR)] = 0                           # pre-delay
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1
    while size < len(x) + n:
        size *= 2
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return x * (1 - wet) + y * wet * 2.2


# ------------------------------------------------------------------ arrangement

CHORDS = [  # (pad voicing, bass root, arp notes)
    (['D3', 'A3', 'E4', 'F4'], 'D2', ['D4', 'F4', 'A4', 'E5']),      # Dm(add9)
    (['Bb2', 'F3', 'A3', 'D4'], 'Bb1', ['Bb3', 'D4', 'F4', 'A4']),   # Bbmaj7
    (['F3', 'C4', 'E4', 'A4'], 'F2', ['F4', 'A4', 'C5', 'E5']),      # Fmaj7
    (['C3', 'G3', 'D4', 'E4'], 'C2', ['C4', 'E4', 'G4', 'D5']),      # Cadd9
]

pad_bus = np.zeros((N, 2))
fx_bus = np.zeros((N, 2))
drums = np.zeros((N, 2))
low = np.zeros(N)
side = np.ones(N)                                       # sidechain envelope


def add(bus, sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    if sig.ndim == 1:
        gl, gr = gain * np.sqrt(0.5 * (1 - pan)), gain * np.sqrt(0.5 * (1 + pan))
        bus[i:i + len(sig), 0] += sig * gl
        bus[i:i + len(sig), 1] += sig * gr
    else:
        bus[i:i + len(sig)] += sig * gain


for bar in range(BARS):
    voicing, root, arp = CHORDS[bar % 4]
    drop = 11 <= bar <= 16
    breakdown = 17 <= bar <= 18
    finale = bar >= 19
    # pad every bar (fuller in the drop and the breakdown)
    pg = 0.55 if bar < 2 else 0.5
    if drop:
        pg = 0.42
    if breakdown or finale:
        pg = 0.7
    add(pad_bus, pad([hz(n) for n in voicing], BAR, bright=1.3 if drop else 1.0, attack=1.4 if bar < 2 else 0.6), t_of(bar), pg)
    # sub drone
    low_sig = np.sin(2 * np.pi * hz(root) * np.arange(int(BAR * SR)) / SR) * env_adsr(int(BAR * SR), 0.3, 0.2, 0.9, 0.3, BAR - 0.3)
    i0 = int(t_of(bar) * SR)
    low[i0:i0 + len(low_sig)] += low_sig[: N - i0] * (0.18 if bar >= 2 else 0.1)
    # arpeggio (8ths) from bar 2; octave up in the drop
    if 2 <= bar <= 16 or finale and bar == 19:
        for k in range(8):
            if bar == 10 and k >= 6:
                continue                                  # pre-drop gap
            note = arp[k % 4] if k < 4 else arp[(k + 1) % 4]
            f = hz(note) * (2 if drop and k % 2 else 1)
            add(fx_bus, pluck(f, 0.9, 1.4 if drop else 1.0), t_of(bar, k * 0.5), 0.16 if not drop else 0.13, pan=(-0.35 if k % 2 else 0.35))
    # kick: half-time from bar 6, four-on-floor in the drop
    if 6 <= bar <= 10:
        for b in (0, 2):
            if bar == 10 and b == 2:
                continue
            add(drums, kick(0.8), t_of(bar, b), 0.55)
    if drop:
        for b in range(4):
            add(drums, kick(1.0), t_of(bar, b), 0.75)
            s0 = int(t_of(bar, b) * SR)
            dur = int(0.35 * SR)
            env = 1 - 0.55 * np.exp(-np.arange(dur) / SR * 9)
            side[s0:s0 + dur] = np.minimum(side[s0:s0 + dur], env[: max(0, min(dur, N - s0))])
        # bass on the roots, syncopated
        for b, ln in ((0, 1.5), (1.5, 1.0), (2.5, 1.5)):
            add(fx_bus, bass(hz(root), ln * BEAT * 1.1), t_of(bar, b), 0.32)
    # hats from bar 8 through the drop
    if 8 <= bar <= 16:
        for k in range(8):
            if bar == 10 and k >= 6:
                continue
            add(drums, hat(open_=(k % 2 == 1 and drop)), t_of(bar, k * 0.5), 0.35 if k % 2 else 0.22, pan=0.25)
    # breakdown bells
    if breakdown:
        for k, note in enumerate(arp):
            add(fx_bus, bell(hz(note) * 2, 3.0), t_of(bar, k), 0.08, pan=(-0.5 + k * 0.33))

# transitions and hits
add(fx_bus, reverse_swell(BAR * 0.9), t_of(1, 0.4), 0.25)                 # into the first picture
add(fx_bus, riser(BAR * 0.75), t_of(10, 0), 0.32)                         # pre-drop riser (stops at the gap)
add(fx_bus, impact(4.5), t_of(11), 0.9)                                   # DROP
add(fx_bus, riser(BAR * 0.5), t_of(16, 2), 0.22)                          # into the time-lapse
add(fx_bus, riser(BAR * 1.9), t_of(17, 0.4), 0.18)                        # lights coming on
add(fx_bus, impact(6.0), t_of(19), 0.8)                                   # finale / title
for cut_bar in (4, 5, 8, 9, 14, 15, 16):                                  # soft whooshes on cuts
    w = riser(0.45)[::-1] * 0.5
    add(fx_bus, w, t_of(cut_bar) - 0.05, 0.12, pan=0.0)

# ------------------------------------------------------------------ mix
pad_bus *= side[:, None]
fx_l = reverb(fx_bus[:, 0], 2.2, 3, 0.3)
fx_r = reverb(fx_bus[:, 1], 2.2, 4, 0.3)
pad_l = reverb(pad_bus[:, 0], 3.4, 5, 0.45)
pad_r = reverb(pad_bus[:, 1], 3.4, 6, 0.45)
dr_l = reverb(drums[:, 0], 0.9, 7, 0.12)
dr_r = reverb(drums[:, 1], 0.9, 8, 0.12)
mix_l = pad_l + fx_l + dr_l + low * side
mix_r = pad_r + fx_r + dr_r + low * side

# master fade in/out and soft clip
t = np.arange(N) / SR
fade = np.minimum(1, t / 1.5) * np.clip((BARS * BAR + TAIL - t) / 3.5, 0, 1)
mix = np.stack([mix_l, mix_r], 1) * fade[:, None]
mix = np.tanh(mix * 1.1)
mix /= np.max(np.abs(mix)) / 0.89                       # about -1 dBFS peak

out = sys.argv[1] if len(sys.argv) > 1 else 'score.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print('wrote', out, '%.1f s' % (N / SR))
