"""
Solar panel listing images - PowerRun Mono PERC panels (450 / 535 / 550 / 580 / 600W).

    python scripts/listing_solar.py            every wattage
    python scripts/listing_solar.py 550        one wattage

There is no product photo yet, so the panel itself is drawn here: a Mono PERC
module (black cells, silver busbars, white backsheet gaps, anodised frame,
AR-glass sheen) with the PowerRun logo on its top margin. Specifications and
features are the ones the website lists for PR-017..PR-021.

Writes  photos/listing/solar/<watt>w/
        0-main-white.jpg  1-main.jpg  2-why-powerrun.jpg
        3-specifications.jpg  4-mono-vs-poly.jpg  5-build.jpg  overview.jpg

Needs Pillow, numpy and opencv-python. Fonts come from C:\\Windows\\Fonts.
"""
import os
import sys
import random
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import listing_erickshaw as lx  # noqa: E402  shared logo, fonts and slide pieces
from listing_erickshaw import (S, ORANGE, ORANGE_SOFT, INK, GREY, WHITE,  # noqa: E402
                               bold, regular, heavy, fit, header, icon_tile,
                               chips_centred, dark_backdrop, shadow)

ROOT = lx.ROOT
OUT_ROOT = os.path.join(ROOT, "photos", "listing", "solar")
WATTS = ["450", "535", "550", "580", "600"]
WARRANTY = "10 Years Product / 25 Years Performance Warranty"


def specs_for(w):
    return [
        ("Peak Power", "{} Wp".format(w), "\ue945"),
        ("Cell Type", "Mono PERC", "\ue9d9"),
        ("Module Efficiency", "Up to 21.3%", "\uec4a"),
        ("Max System Voltage", "1500 V DC", "\ue83e"),
        ("Glass", "3.2 mm tempered, AR coated", "\ue7f8"),
        ("Frame", "Anodised aluminium alloy", "\ue8b9"),
        ("Operating Temperature", "-40 \u00b0C to 85 \u00b0C", "\ue9ca"),
        ("Warranty", "10 Yr Product / 25 Yr Performance", "\uea18"),
    ]


# ---------------------------------------------------------------- the panel
PW, PH = 1100, 2200            # flat front face, portrait, ~1:2 like a 144-cell module
FRAME = 26


def panel_face():
    """Flat front view of the module, RGB."""
    rnd = random.Random(7)
    img = Image.new("RGB", (PW, PH), (228, 230, 234))          # white backsheet
    d = ImageDraw.Draw(img)
    cols, rows = 6, 24                                         # 144 half cells
    gap, mid_gap = 5, 18
    top_m, side_m = 92, 34
    cw = (PW - 2 * FRAME - 2 * side_m - gap * (cols - 1)) / cols
    ch = (PH - 2 * FRAME - 2 * top_m - mid_gap - gap * (rows - 2)) / rows
    bus_x = []
    for c in range(cols):
        x0 = FRAME + side_m + c * (cw + gap)
        xs = [x0 + cw * (i + 0.5) / 9 for i in range(9)]       # 9 busbars per cell
        bus_x.append(xs)
        for r in range(rows):
            y0 = FRAME + top_m + r * (ch + gap) + (mid_gap - gap if r >= rows // 2 else 0)
            x1, y1 = x0 + cw, y0 + ch
            k = rnd.uniform(-4, 4)
            base = (int(13 + k), int(17 + k), int(31 + k * 1.5))
            cut = 9
            # half cells: chamfered corners only on the side that was the wafer edge
            outer_top = (r % 2 == 0)
            if outer_top:
                poly = [(x0 + cut, y0), (x1 - cut, y0), (x1, y0 + cut), (x1, y1), (x0, y1), (x0, y0 + cut)]
            else:
                poly = [(x0, y0), (x1, y0), (x1, y1 - cut), (x1 - cut, y1), (x0 + cut, y1), (x0, y1 - cut)]
            d.polygon(poly, fill=base)
            for yy in range(int(y0) + 6, int(y1) - 4, 7):        # faint fingers
                d.line([(x0 + 2, yy), (x1 - 2, yy)], fill=(base[0] + 4, base[1] + 5, base[2] + 8))
    # busbars + ribbons run the full height of each string
    for xs in bus_x:
        for x in xs:
            d.line([(x, FRAME + top_m - 30), (x, PH - FRAME - top_m + 30)], fill=(112, 118, 132), width=2)
    # string interconnect ribbons in the top / bottom margins and the centre gap
    for y in (FRAME + top_m - 34, PH - FRAME - top_m + 30, PH // 2 - 3):
        d.rectangle([FRAME + side_m - 6, y, PW - FRAME - side_m + 6, y + 6], fill=(150, 155, 166))

    # PowerRun logo printed on the top margin
    lg = fit(lx.logo_rgba(), 340, 58)
    img.paste(lg, ((PW - lg.width) // 2, FRAME + 12), lg)

    # anodised frame: brushed silver with an inner shadow line
    fr = Image.new("RGB", (PW, PH), (0, 0, 0))
    fd = ImageDraw.Draw(fr)
    for i in range(FRAME):
        t = i / FRAME
        c = int(178 + 52 * (1 - abs(t - 0.35) * 2))
        fd.rectangle([i, i, PW - 1 - i, PH - 1 - i], outline=(c, c + 2, c + 6))
    mask = Image.new("L", (PW, PH), 0)
    ImageDraw.Draw(mask).rectangle([0, 0, PW - 1, PH - 1], fill=255)
    ImageDraw.Draw(mask).rectangle([FRAME, FRAME, PW - 1 - FRAME, PH - 1 - FRAME], fill=0)
    img.paste(fr, (0, 0), mask)
    d.rectangle([FRAME, FRAME, PW - 1 - FRAME, PH - 1 - FRAME], outline=(90, 94, 102), width=2)

    # AR glass: soft diagonal sheen over the glass area
    sheen = Image.new("L", (200, 400), 0)
    sp = sheen.load()
    for y in range(400):
        for x in range(200):
            t = (x * 2 + y) / 800.0
            v = 0.0
            v += 40 * np.exp(-((t - 0.32) / 0.07) ** 2)
            v += 18 * np.exp(-((t - 0.55) / 0.16) ** 2)
            sp[x, y] = int(v)
    sheen = sheen.resize((PW - 2 * FRAME, PH - 2 * FRAME), Image.BICUBIC)
    glass = Image.new("RGB", sheen.size, (235, 242, 255))
    img.paste(glass, (FRAME, FRAME), sheen)
    return img


def panel_angle(face):
    """Three-quarter view: the face in perspective plus the frame's side edge, RGBA."""
    W, H = 1500, 2300
    f = np.asarray(face)
    src = np.float32([[0, 0], [PW, 0], [PW, PH], [0, PH]])
    # turned ~25 degrees: right edge further away (shorter), slight lean back
    dst = np.float32([[300, 40], [1180, 150], [1160, 2160], [280, 2270]])
    M = cv2.getPerspectiveTransform(src, dst)
    out = np.zeros((H, W, 4), np.uint8)
    warped = cv2.warpPerspective(np.dstack([f, np.full(f.shape[:2], 255, np.uint8)]), M, (W, H),
                                 flags=cv2.INTER_CUBIC)
    # frame thickness on the right: a narrow darker strip
    side = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(side)
    sd.polygon([(1180, 150), (1222, 162), (1202, 2148), (1160, 2160)], fill=(150, 154, 162, 255))
    sd.line([(1201, 156), (1181, 2154)], fill=(185, 189, 196, 255), width=3)
    img = Image.alpha_composite(Image.fromarray(out), side)
    img = Image.alpha_composite(img, Image.fromarray(warped))
    return img.crop(img.getbbox())


# ---------------------------------------------------------------- slides
def title(d, y, text, sub=None, dark=False):
    d.text((S // 2, y), text, font=heavy(96), fill=WHITE if dark else INK, anchor="mm")
    if sub:
        d.text((S // 2, y + 100), sub, font=regular(42), fill=(190, 190, 190) if dark else GREY,
               anchor="mm")


def main_white(panel):
    img = Image.new("RGBA", (S, S), WHITE)
    lx.place(img, panel, S // 2, 90, 1700, 1800)
    return img


def main_badged(panel, w):
    img = Image.new("RGBA", (S, S), WHITE)
    d = ImageDraw.Draw(img)
    header(img)
    f = heavy(84)
    t = "{} Wp".format(w)
    bw = d.textlength(t, font=f) + 90
    d.rounded_rectangle([S - 80 - bw, 80, S - 80, 210], radius=26, fill=ORANGE)
    d.text((S - 80 - bw / 2, 145), t, font=f, fill=WHITE, anchor="mm")
    d.text((S - 80 - bw / 2, 250), "Mono PERC Solar Panel", font=bold(36), fill=GREY, anchor="mm")
    lx.place(img, panel, S // 2, 290, 1500, 1420)
    chips_centred(d, 1765, ["Mono PERC", "Up to 21.3% Efficiency", "1500 V DC", "25 Yr Performance"])
    d.text((S // 2, 1905), "PowerRun {}W Solar Module".format(w), font=bold(40), fill=INK, anchor="mm")
    return img


def why_powerrun(panel, w):
    img = dark_backdrop()
    d = ImageDraw.Draw(img)
    header(img, dark=True)
    f = heavy(96)
    a, b = "WHY CHOOSE ", "POWERRUN"
    wa, wb = d.textlength(a, font=f), d.textlength(b, font=f)
    x = (S - wa - wb) / 2
    d.text((x, 330), a, font=f, fill=WHITE, anchor="lm")
    d.text((x + wa, 330), b, font=f, fill=ORANGE, anchor="lm")
    d.text((S // 2, 425), "{}W Mono PERC Solar Panel".format(w), font=bold(44),
           fill=(200, 200, 200), anchor="mm")
    lx.place(img, panel, 500, 520, 760, 1320, with_shadow=False)
    feats = [
        ("", "Mono PERC Cells", "High-efficiency monocrystalline PERC"),
        ("", "Up to 21.3% Efficiency", "More power from the same roof area"),
        ("", "Optimised Low-light", "Keeps generating in morning, evening & cloud"),
        ("", "Anti-PID & Salt-mist", "Resistant - made for humid & coastal sites"),
        ("", "2400 Pa Wind Load", "Rated for strong winds"),
        ("", "3.2 mm Tempered AR Glass", "Tough, anti-reflective front"),
        ("", "10 + 25 Year Warranty", "10 yr product, 25 yr performance"),
    ]
    y = 530
    for g, t, sub in feats:
        icon_tile(d, 960, y, g, 104)
        d.text((1095, y + 30), t, font=bold(50), fill=WHITE, anchor="lm")
        d.text((1095, y + 82), sub, font=regular(31), fill=(185, 185, 185), anchor="lm")
        y += 178
    d.rectangle([S // 2 - 60, 1880, S // 2 + 60, 1886], fill=ORANGE)
    d.text((S // 2, 1925), "Backed by PowerRun service • Pan-India delivery",
           font=regular(28), fill=(120, 120, 120), anchor="mm")
    return img


def specifications(face, w):
    img = Image.new("RGBA", (S, S), WHITE)
    d = ImageDraw.Draw(img)
    header(img)
    f = heavy(70)
    t1, t2 = "{} Wp".format(w), "SOLAR PANEL"
    w1 = d.textlength(t1, font=f) + 60
    w2 = d.textlength(t2, font=bold(64))
    x = (S - w1 - 30 - w2) / 2
    d.rounded_rectangle([x, 290, x + w1, 400], radius=22, fill=ORANGE)
    d.text((x + w1 / 2, 345), t1, font=f, fill=WHITE, anchor="mm")
    d.text((x + w1 + 30, 345), t2, font=bold(64), fill=INK, anchor="lm")
    d.text((S // 2, 455), "Mono PERC   •   Up to 21.3%   •   1500 V DC", font=bold(36),
           fill=GREY, anchor="mm")
    y = 520
    for label, value, g in specs_for(w):
        d.rounded_rectangle([80, y, 1180, y + 132], radius=20, fill=(246, 246, 246))
        icon_tile(d, 108, y + 26, g, 80)
        d.text((220, y + 44), label, font=regular(30), fill=GREY, anchor="lm")
        d.text((220, y + 90), value, font=bold(42 if len(value) < 26 else 36), fill=INK, anchor="lm")
        y += 150
    p = fit(face.convert("RGBA"), 560, 1180)
    img.alpha_composite(shadow(p, blur=24, opacity=30), (1560 - p.width // 2 - 72, 520 + p.height - 60))
    img.alpha_composite(p, (1560 - p.width // 2, 520))
    band_y = 1740
    d.rectangle([0, band_y, S, S], fill=(14, 14, 14))
    stats = [("", "{} Wp".format(w)), ("", "21.3%"), ("", "1500 V"),
             ("", "2400 Pa"), ("", "25 Yr")]
    step = S / len(stats)
    for i, (g, t) in enumerate(stats):
        cx = step * i + step / 2
        icon_tile(d, cx - 50, band_y + 50, g, 100)
        d.text((cx, band_y + 200), t, font=bold(40), fill=WHITE, anchor="mm")
    return img


def mono_vs_poly():
    img = Image.new("RGBA", (S, S), WHITE)
    d = ImageDraw.Draw(img)
    header(img)
    title(d, 330, "MONO PERC vs POLY", "Why Mono PERC gives more power from your roof")
    rows = [
        ("Module Efficiency", "~15 – 17%", "Up to 21.3%"),
        ("Power per Panel", "Lower", "450 – 600 W"),
        ("Roof Area Needed", "More", "Less for the same kW"),
        ("Low-light Output", "Weaker", "Optimised"),
        ("Cell Look", "Speckled blue", "Uniform black"),
        ("Cell Technology", "Multi-crystal", "Mono crystal + PERC layer"),
    ]
    x0, x1, x2, x3 = 100, 640, 1220, 1900
    top = 560
    d.rounded_rectangle([x0, top, x3, top + 110], radius=24, fill=INK)
    d.text(((x1 + x2) / 2, top + 55), "POLYCRYSTALLINE", font=bold(40), fill=(200, 200, 200), anchor="mm")
    d.text(((x2 + x3) / 2, top + 55), "POWERRUN MONO PERC", font=bold(40), fill=ORANGE, anchor="mm")
    y = top + 140
    for label, poly, mono in rows:
        d.rounded_rectangle([x0, y, x3, y + 130], radius=20, fill=(247, 247, 247))
        d.rounded_rectangle([x2 + 10, y + 12, x3 - 12, y + 118], radius=16, fill=ORANGE_SOFT)
        d.text((x0 + 40, y + 65), label, font=bold(42), fill=INK, anchor="lm")
        d.text(((x1 + x2) / 2, y + 65), poly, font=regular(36), fill=GREY, anchor="mm")
        d.text(((x2 + x3) / 2, y + 65), mono, font=bold(38), fill=(210, 70, 0), anchor="mm")
        y += 150
    d.rounded_rectangle([300, 1820, 1700, 1900], radius=40, fill=(245, 245, 245))
    d.text((S // 2, 1860), "General mono PERC vs polycrystalline comparison; site results vary.",
           font=regular(30), fill=GREY, anchor="mm")
    return img


def build(face):
    """Exploded layer stack of the module."""
    img = Image.new("RGBA", (S, S), WHITE)
    d = ImageDraw.Draw(img)
    header(img)
    title(d, 330, "BUILT TO LAST", "What's inside a PowerRun module")
    # isometric sheet: a parallelogram, drawn top layer first so lower layers peek out
    sw, sh, skew = 800, 280, 300
    x0, y0, step = 110, 650, 150
    layers = [
        ("3.2 mm Tempered AR Glass", "Tough, anti-reflective front", (205, 225, 245, 150), None),
        ("EVA Encapsulant", "Seals and cushions the cells", (240, 240, 232, 210), None),
        ("Mono PERC Cells", "High-efficiency monocrystalline", None, "cells"),
        ("EVA Encapsulant", "Second sealing layer", (240, 240, 232, 210), None),
        ("Backsheet", "Moisture & UV barrier", (250, 250, 250, 255), None),
        ("Anodised Aluminium Frame", "Rigid, corrosion resistant", None, "frame"),
    ]
    cells = face.crop((FRAME + 34, FRAME + 92, PW - FRAME - 34, FRAME + 92 + 520)).resize((sw, sh), Image.LANCZOS)
    sheets = []
    for i, (_, _, colour, kind) in enumerate(layers):
        y = y0 + i * step
        quad = [(x0 + skew, y), (x0 + skew + sw, y), (x0 + sw, y + sh), (x0, y + sh)]
        sheets.append((quad, colour, kind))
    for quad, colour, kind in reversed(sheets):
        layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        if kind == "cells":
            src = np.float32([[0, 0], [cells.width, 0], [cells.width, cells.height], [0, cells.height]])
            M = cv2.getPerspectiveTransform(src, np.float32(quad))
            warped = cv2.warpPerspective(np.asarray(cells.convert("RGBA")), M, (S, S), flags=cv2.INTER_CUBIC)
            layer = Image.fromarray(warped)
        elif kind == "frame":
            ld.polygon(quad, outline=(160, 165, 175, 255), width=26)
        else:
            ld.polygon(quad, fill=colour, outline=(170, 180, 195, 255), width=3)
        img.alpha_composite(layer)
    d = ImageDraw.Draw(img)
    for i, (name, sub, _, _) in enumerate(layers):
        quad = sheets[i][0]
        ax, ay = quad[1][0] - 30, quad[1][1] + 40
        lx_ = 1390
        ly = 640 + i * 175
        d.line([(ax, ay), (lx_ - 30, ly + 36)], fill=(200, 200, 200), width=3)
        d.ellipse([lx_ - 92, ly, lx_ - 20, ly + 72], fill=ORANGE)
        d.text((lx_ - 56, ly + 36), str(i + 1), font=bold(38), fill=WHITE, anchor="mm")
        d.text((lx_, ly + 20), name, font=bold(40), fill=INK, anchor="lm")
        d.text((lx_, ly + 62), sub, font=regular(30), fill=GREY, anchor="lm")
    d.rounded_rectangle([300, 1820, 1700, 1900], radius=40, fill=(245, 245, 245))
    d.text((S // 2, 1860), "Anti-PID & salt-mist resistant • 2400 Pa wind load",
           font=regular(32), fill=GREY, anchor="mm")
    return img


def render(w, face, panel):
    out = os.path.join(OUT_ROOT, "{}w".format(w))
    os.makedirs(out, exist_ok=True)
    slides = {
        "0-main-white.jpg": main_white(panel),
        "1-main.jpg": main_badged(panel, w),
        "2-why-powerrun.jpg": why_powerrun(panel, w),
        "3-specifications.jpg": specifications(face, w),
        "4-mono-vs-poly.jpg": mono_vs_poly(),
        "5-build.jpg": build(face),
    }
    for name, img in slides.items():
        img.convert("RGB").save(os.path.join(out, name), quality=92, optimize=True)
        print("  ", os.path.relpath(os.path.join(out, name), ROOT))
    sheet = Image.new("RGB", (3000, 2000), (128, 128, 128))
    for i, img in enumerate(slides.values()):
        sheet.paste(img.convert("RGB").resize((990, 990), Image.LANCZOS),
                    ((i % 3) * 1005, (i // 3) * 1005))
    sheet.save(os.path.join(out, "overview.jpg"), quality=85)


def main():
    face = panel_face()
    panel = panel_angle(face)
    for w in [a for a in sys.argv[1:] if a in WATTS] or WATTS:
        render(w, face, panel)


if __name__ == "__main__":
    main()


