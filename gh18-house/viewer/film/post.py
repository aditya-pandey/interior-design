"""Edit, grade, title and encode the GH-18 film.

Reads the rendered shots (film/frames/<shot>/NNNN.png, made by render.mjs) and the score
(score.py), cuts them on the bar lines, grades them (filmic contrast, warm/teal split,
vignette, grain), letterboxes to 2.39:1 inside 1920x1080, adds the title cards and chapter
captions, and pipes the result straight into ffmpeg (H.264 + AAC, loudness-normalised).

Usage: python3 film/post.py out.mp4 [--preview N]   (--preview writes every Nth frame as a JPG instead)
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FPS, BAR_F = 24, 60
W, H, PIC_H = 1920, 1080, 804
TOP = (H - PIC_H) // 2
INTRO = 2 * BAR_F
OUTRO = 36
FONT_DIR = '/usr/share/fonts/opentype/inter'


def font(name, size):
    for p in (os.path.join(HERE, 'fonts', name), os.path.join(FONT_DIR, name)):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


F_TITLE = font('InterDisplay-Thin.otf', 190)
F_SUB = font('InterDisplay-Light.otf', 26)
F_CAP = font('InterDisplay-Light.otf', 30)
F_NUM = font('InterDisplay-Medium.otf', 20)


def ffmpeg_exe():
    """System ffmpeg, else the static build from `pip install imageio-ffmpeg`."""
    import shutil
    exe = shutil.which('ffmpeg')
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit('ffmpeg not found: run `brew install ffmpeg` or `python3 -m pip install --user imageio-ffmpeg`')


def shots():
    js = "import {SHOTS} from './film/shots.mjs'; console.log(JSON.stringify(SHOTS))"
    out = subprocess.run(['node', '--input-type=module', '-e', js], cwd=os.path.dirname(HERE), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


# ------------------------------------------------------------------ grade

YY, XX = np.mgrid[0:PIC_H, 0:W].astype(np.float32)
RAD = np.sqrt(((XX - W / 2) / (W / 2)) ** 2 + ((YY - PIC_H / 2) / (PIC_H / 2)) ** 2)
VIGNETTE = (1 - 0.24 * np.clip(RAD / 1.25, 0, 1) ** 2.3)[..., None]


def grade(img, frame_no):
    x = img.astype(np.float32) / 255.0
    # filmic S-curve
    x = x + 0.32 * (x * x * (3 - 2 * x) - x)
    lum = (0.2126 * x[..., 0] + 0.7152 * x[..., 1] + 0.0722 * x[..., 2])[..., None]
    # split tone: teal shadows, warm highlights
    shadow = np.array([0.975, 1.0, 1.03], np.float32)
    high = np.array([1.035, 1.0, 0.955], np.float32)
    x = x * (shadow + (high - shadow) * np.clip(lum * 1.2, 0, 1))
    # saturation
    x = lum + (x - lum) * 1.07
    x = x * VIGNETTE
    # grain (luminance, stronger in the mids)
    g = np.random.default_rng(frame_no).normal(0, 0.016, (PIC_H, W, 1)).astype(np.float32)
    x = x + g * (1 - np.abs(lum - 0.5))
    return (np.clip(x, 0, 1) * 255).astype(np.uint8)


# ------------------------------------------------------------------ text

def tracked(draw, xy, text, fnt, fill, tracking, anchor='l'):
    """Draw text with letter-spacing; anchor 'l' (left) or 'm' (centre)."""
    widths = [draw.textlength(c, font=fnt) for c in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x, y = xy
    if anchor == 'm':
        x -= total / 2
    for c, w in zip(text, widths):
        draw.text((x, y), c, font=fnt, fill=fill)
        x += w + tracking
    return total


def overlay(canvas, draw_fn, alpha):
    if alpha <= 0.002:
        return canvas
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    draw_fn(d)
    if alpha < 1:
        a = np.array(layer)
        a[..., 3] = (a[..., 3] * alpha).astype(np.uint8)
        layer = Image.fromarray(a)
    base = canvas.convert('RGBA')
    base.alpha_composite(layer)
    return base.convert('RGB')


def ramp(f, a, b):
    return float(np.clip((f - a) / max(1, b - a), 0, 1))


def smooth(v):
    return v * v * (3 - 2 * v)


def title_card(d, a_title, a_sub, scale=1.0, sub='CELEBRITY HOMES  ·  PALAM VIHAR  ·  GURUGRAM'):
    if a_title > 0:
        fnt = font('InterDisplay-Thin.otf', int(190 * scale))
        tracked(d, (W / 2, H / 2 - 150 * scale), 'GH-18', fnt, (245, 240, 232, int(255 * a_title)), int(38 * scale), 'm')
    if a_sub > 0:
        tracked(d, (W / 2, H / 2 + 70), sub, F_SUB, (225, 214, 196, int(255 * a_sub)), 9, 'm')


# ------------------------------------------------------------------ edit

def build_timeline(S):
    tl = []                                       # (kind, data) per output frame
    for f in range(INTRO):
        tl.append(('intro', f))
    cap_no = 0
    for s in S:
        n = s['bars'] * BAR_F
        if s.get('caption'):
            cap_no += 1
        for i in range(n):
            tl.append(('shot', (s, i, n, cap_no if s.get('caption') else None)))
    for f in range(OUTRO):
        tl.append(('outro', f))
    return tl


def render_frame(kind, data, fno, frames_dir):
    canvas = Image.new('RGB', (W, H), (0, 0, 0))
    if kind == 'intro':
        f = data
        a_t = smooth(ramp(f, 14, 46)) * (1 - smooth(ramp(f, 100, 118)))
        a_s = smooth(ramp(f, 58, 80)) * (1 - smooth(ramp(f, 100, 118)))
        scale = 1.0 + 0.035 * f / INTRO
        return overlay(canvas, lambda d: title_card(d, a_t, a_s, scale), 1.0)
    if kind == 'outro':
        f = data
        a = 1 - smooth(ramp(f, 0, OUTRO - 6))
        return overlay(canvas, lambda d: title_card(d, a, a, 0.72, sub='RENOVATION  ·  GROUND, FIRST  +  PROPOSED SECOND FLOOR'), 1.0)

    s, i, n, cap_no = data
    path = os.path.join(frames_dir, s['id'], '%04d.png' % (i + 1))
    if os.path.exists(path):
        pic = np.array(Image.open(path).convert('RGB').resize((W, PIC_H)))
    else:                                           # missing frame (preview while rendering): grey slate
        pic = np.full((PIC_H, W, 3), 40, np.uint8)
    pic = grade(pic, fno).astype(np.float32)
    sid = s['id']
    # cut transitions synced to the score
    if sid == 's01_aerial':
        pic *= smooth(ramp(i, 0, 18))                                 # fade up from the title
    if sid == 's07_mandir' and i >= n - 15:                           # cut to black on the silent beat
        pic *= 1 - smooth(ramp(i, n - 15, n - 11))
    if sid in ('s08_explode', 's13_finale') and i < 10:               # flash on the impact
        k = (1 - i / 10) ** 2 * (0.85 if sid == 's08_explode' else 0.55)
        pic = pic * (1 - k) + 255 * k
    if sid == 's13_finale':
        pic *= 1 - 0.55 * smooth(ramp(i, 40, 90))                     # darken under the end title
    canvas.paste(Image.fromarray(np.clip(pic, 0, 255).astype(np.uint8)), (0, TOP))

    if cap_no and s.get('caption'):
        a = smooth(ramp(i, 8, 22)) * (1 - smooth(ramp(i, n - 16, n - 4)))
        txt = s['caption'].upper()

        def cap(d):
            x, y = 96, TOP + PIC_H - 92
            tracked(d, (x, y + 4), '%02d' % cap_no, F_NUM, (226, 196, 150, 255), 3)
            d.line([(x + 44, y + 16), (x + 92, y + 16)], fill=(226, 196, 150, 220), width=2)
            tracked(d, (x + 108, y), txt, F_CAP, (246, 242, 235, 255), 6)
        canvas = overlay(canvas, cap, a)
    if sid == 's13_finale':
        a = smooth(ramp(i, 50, 80))
        canvas = overlay(canvas, lambda d: title_card(d, a, a, 0.72, sub='RENOVATION  ·  GROUND, FIRST  +  PROPOSED SECOND FLOOR'), 1.0)
    return canvas


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'gh18_film.mp4')
    preview = int(sys.argv[sys.argv.index('--preview') + 1]) if '--preview' in sys.argv else 0
    frames_dir = os.path.join(HERE, 'frames')
    tl = build_timeline(shots())
    print('timeline: %d frames (%.1f s)' % (len(tl), len(tl) / FPS))
    if preview:
        os.makedirs(out, exist_ok=True)
        for fno in range(0, len(tl), preview):
            kind, data = tl[fno]
            render_frame(kind, data, fno, frames_dir).save(os.path.join(out, 'p%05d.jpg' % fno), quality=88)
        return
    score = os.path.join(HERE, 'score.wav')
    if not os.path.exists(score):
        subprocess.run([sys.executable, os.path.join(HERE, 'score.py'), score], check=True)
    cmd = [ffmpeg_exe(), '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '%dx%d' % (W, H), '-r', str(FPS), '-i', '-',
           '-i', score, '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11',
           '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-tune', 'film', '-pix_fmt', 'yuv420p',
           '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for fno, (kind, data) in enumerate(tl):
        p.stdin.write(render_frame(kind, data, fno, frames_dir).tobytes())
        if fno % 120 == 0:
            print('frame', fno, '/', len(tl), flush=True)
    p.stdin.close()
    p.wait()
    print('wrote', out)


if __name__ == '__main__':
    main()
