"""
E-scooty battery listing images - PowerRun 60V LiFePO4 (30Ah / 45Ah).

    python scripts/listing_escooty.py          both variants
    python scripts/listing_escooty.py 45       one variant

There is no product photo yet, so the pack is drawn here: a compact box with
an orange front (PowerRun logo, capacity plate, spec strip), charcoal sides and
top, a carry handle and an output connector. Specifications are the ones the
website lists for PR-026 / PR-027.

Writes  photos/listing/e-scooty/60v-<ah>ah/
        0-main-white.jpg  1-main.jpg  2-why-powerrun.jpg
        3-specifications.jpg  4-why-lithium.jpg  5-build.jpg  overview.jpg

Needs Pillow, numpy and opencv-python. Fonts come from C:\\Windows\\Fonts.
"""
import os
import sys
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import listing_erickshaw as lx  # noqa: E402  shared logo, fonts and slide pieces
from listing_erickshaw import (S, ORANGE, ORANGE_SOFT, INK, GREY, WHITE,  # noqa: E402
                               bold, regular, heavy, condensed, fit, header, icon_tile,
                               chips_centred, dark_backdrop)

ROOT = lx.ROOT
OUT_ROOT = os.path.join(ROOT, "photos", "listing", "e-scooty")
VARIANTS = {
    "30": {"ah": 30, "kwh": "1.8 kWh", "charge": 15, "discharge": 30},
    "45": {"ah": 45, "kwh": "2.7 kWh", "charge": 23, "discharge": 45},
}
for _v in VARIANTS.values():
    _v["name"] = "60V {}Ah".format(_v["ah"])


def specs_for(v):
    return [
        ("Chemistry", "LiFePO4 (Lithium Iron Phosphate)", "\ue945"),
        ("Nominal Voltage", "60 V", "\ue945"),
        ("Rated Capacity", "{} Ah".format(v["ah"]), "\ue83f"),
        ("Energy", v["kwh"], "\ue9d9"),
        ("Max Charge Current", "{} A".format(v["charge"]), "\ue83e"),
        ("Max Discharge Current", "{} A".format(v["discharge"]), "\uec4a"),
        ("Cycle Life", "4000+ cycles", "\ue895"),
        ("Warranty", "3 Years", "\uea18"),
        ("Application", "E-Scooty / Electric Scooter", "\ue804"),
    ]


# ---------------------------------------------------------------- the pack
FW, FH = 1560, 1440          # front face texture
SW = 700                     # side face texture width (same height)
TH = 700                     # top face texture height (same width as front)
CHARCOAL = (34, 35, 39)
# Box corners on the untrimmed 1600x1500 pack canvas: front A-B-C-D, side
# B-E-F-C, top G-E-B-A.
A, B, C, D = (210, 520), (1000, 630), (990, 1380), (220, 1250)
E, F, G = (1350, 520), (1335, 1230), (560, 420)
FACES = {"front": ((FW, FH), (A, B, C, D)), "side": ((SW, FH), (B, E, F, C)),
         "top": ((FW, TH), (G, E, B, A))}


def on_face(face, x, y):
    """Where texture point (x, y) of a face lands on the pack canvas."""
    (w, h), quad = FACES[face]
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), np.float32(quad))
    q = M @ np.array([x, y, 1.0])
    return (q[0] / q[2], q[1] / q[2])


def lerp(p, q, t):
    return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)


def handle_mounts():
    mid_back, mid_front = lerp(A, G, 0.5), lerp(B, E, 0.5)
    return lerp(mid_back, mid_front, 0.22), lerp(mid_back, mid_front, 0.62)


def screw(d, x, y, r=11):
    d.ellipse([x - r, y - r, x + r, y + r], fill=(196, 199, 205), outline=(120, 124, 130), width=2)
    d.line([(x - r + 4, y), (x + r - 4, y)], fill=(110, 114, 120), width=3)
    d.line([(x, y - r + 4), (x, y + r - 4)], fill=(110, 114, 120), width=3)


def scooter_icon(d, x, y, s, fill):
    """Simple side-on scooter silhouette, s = overall width."""
    k = s / 300.0
    def P(px, py):
        return (x + px * k, y + py * k)
    d.ellipse([*P(10, 110), *P(80, 180)], outline=fill, width=int(12 * k))
    d.ellipse([*P(215, 110), *P(285, 180)], outline=fill, width=int(12 * k))
    d.polygon([P(40, 120), P(120, 120), P(150, 80), P(235, 80), P(250, 140), P(225, 145),
               P(205, 105), P(160, 105), P(140, 150), P(60, 150)], fill=fill)
    d.polygon([P(150, 80), P(170, 60), P(235, 60), P(240, 80)], fill=fill)        # seat
    d.line([P(245, 140), P(270, 20)], fill=fill, width=int(12 * k))               # fork
    d.line([P(250, 20), P(295, 20)], fill=fill, width=int(12 * k))                # bar


def front_face(v):
    img = Image.new("RGB", (FW, FH), ORANGE)
    d = ImageDraw.Draw(img)
    for y in range(FH):                                       # soft vertical sheen
        t = y / FH
        c = (255, int(96 + 22 * (1 - t) - 18 * t), int(10 + 14 * (1 - t)))
        d.line([(0, y), (FW, y)], fill=c)
    d.rounded_rectangle([34, 34, FW - 34, FH - 34], radius=40, outline=(232, 78, 0), width=8)
    for x, y in ((80, 80), (FW - 80, 80), (80, FH - 80), (FW - 80, FH - 80)):
        screw(d, x, y)
    lg = fit(lx.logo_rgba(ink=(18, 18, 18), accent=(160, 30, 0)), 760, 300)
    img.paste(lg, ((FW - lg.width) // 2, 120), lg)
    # capacity plate
    px0, py0, px1, py1 = 230, 470, FW - 230, 700
    d.rounded_rectangle([px0, py0, px1, py1], radius=46, fill=(18, 18, 20))
    d.rounded_rectangle([px0 + 14, py0 + 14, px1 - 14, py1 - 14], radius=36, outline=ORANGE, width=5)
    d.text((FW // 2, (py0 + py1) // 2 + 4), "60V {}AH".format(v["ah"]), font=condensed(190),
           fill=WHITE, anchor="mm")
    d.text((FW // 2, 790), "E-SCOOTY BATTERY", font=condensed(118), fill=(18, 18, 20), anchor="mm")
    # spec strip
    sy = 930
    d.polygon([(70, sy), (FW - 360, sy), (FW - 470, FH - 70), (70, FH - 70)], fill=(18, 18, 20))
    rows = [("\ue945", "Voltage", "60V"), ("\ue83f", "Capacity", "{}AH".format(v["ah"])),
            ("\ue9d9", "Type", "LiFePO4")]
    for i, (g, k, val) in enumerate(rows):
        yy = sy + 80 + i * 120
        d.text((150, yy), g, font=lx.icon(58), fill=ORANGE, anchor="mm")
        d.text((230, yy), k, font=bold(62), fill=WHITE, anchor="lm")
        # the front face falls away to the right, so lift the value column to read level
        d.text((590, yy - 45), ":", font=bold(62), fill=WHITE, anchor="mm")
        d.text((640, yy - 45), val, font=bold(62), fill=WHITE, anchor="lm")
    scooter_icon(d, FW - 350, sy + 150, 290, (18, 18, 20))
    return img


def side_face(v):
    img = Image.new("RGB", (SW, FH), CHARCOAL)
    d = ImageDraw.Draw(img)
    for x in range(60, SW - 40, 46):                           # moulded ribs
        d.rectangle([x, 120, x + 18, FH - 120], fill=(44, 45, 50))
        d.line([(x, 120), (x, FH - 120)], fill=(58, 60, 66), width=2)
    # rating label
    lx0, ly0, lx1, ly1 = 110, 330, SW - 110, 1050
    d.rounded_rectangle([lx0, ly0, lx1, ly1], radius=18, fill=(236, 237, 238))
    lg = fit(lx.logo_rgba(), 300, 110)
    img.paste(lg, ((SW - lg.width) // 2, ly0 + 30), lg)
    lines = [("Model", "60V / {}Ah".format(v["ah"])), ("Nominal Voltage", "60V"),
             ("Rated Capacity", "{}Ah".format(v["ah"])), ("Energy", v["kwh"].replace(" ", "")),
             ("Max Charge", "{}A".format(v["charge"])), ("Max Discharge", "{}A".format(v["discharge"])),
             ("Cell Type", "LiFePO4")]
    y = ly0 + 190
    for k, val in lines:
        d.text((lx0 + 30, y), k, font=regular(30), fill=(40, 40, 40))
        # the side face turns away, so a level row reads as rising; drop the value column to match
        d.text((lx0 + 270, y + 38), ": " + val, font=regular(30), fill=(40, 40, 40))
        y += 50
    d.line([(lx0 + 30, y + 40), (lx1 - 30, y + 40)], fill=(150, 150, 150), width=2)
    d.text((lx1 - 30, ly1 - 40), "Made in India", font=bold(30), fill=(40, 40, 40), anchor="rm")
    return img


def top_face():
    img = Image.new("RGB", (FW, TH), (46, 47, 52))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([30, 30, FW - 30, TH - 30], radius=36, outline=(64, 66, 72), width=6)
    # output connector (two-pole, grey housing) and charge port
    cx, cy = 1180, 360
    d.rounded_rectangle([cx - 150, cy - 95, cx + 150, cy + 95], radius=18, fill=(150, 154, 160))
    d.rounded_rectangle([cx - 120, cy - 60, cx - 20, cy + 60], radius=10, fill=(40, 40, 44))
    d.rounded_rectangle([cx + 20, cy - 60, cx + 120, cy + 60], radius=10, fill=(40, 40, 44))
    d.ellipse([300, 290, 440, 430], fill=(24, 24, 26), outline=(120, 124, 130), width=10)
    d.ellipse([345, 335, 395, 385], fill=(60, 60, 66))
    return img


def warp(tex, quad, size):
    t = np.asarray(tex.convert("RGBA"))
    h, w = t.shape[:2]
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]), np.float32(quad))
    return Image.fromarray(cv2.warpPerspective(t, M, size, flags=cv2.INTER_CUBIC))


def shade(img, k):
    a = np.asarray(img).astype(np.float32)
    a[..., :3] *= k
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def pack(v):
    """Three-quarter view of the pack, RGBA, trimmed."""
    W, H = 1600, 1500
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(shade(warp(top_face(), [G, E, B, A], (W, H)), 1.08))
    canvas.alpha_composite(shade(warp(side_face(v), [B, E, F, C], (W, H)), 0.78))
    canvas.alpha_composite(warp(front_face(v), [A, B, C, D], (W, H)))
    d = ImageDraw.Draw(canvas)
    d.line([A, B, E], fill=(255, 255, 255, 110), width=4)      # catch-light on the edges
    d.line([B, C], fill=(255, 190, 150, 120), width=3)
    # carry handle: two mounts and an arched grip above the top face
    m1, m2 = handle_mounts()
    for m in (m1, m2):
        d.rounded_rectangle([m[0] - 34, m[1] - 18, m[0] + 34, m[1] + 18], radius=10, fill=(20, 20, 22))
    pts = []
    for i in range(41):
        t = i / 40.0
        x = m1[0] + (m2[0] - m1[0]) * t
        y = m1[1] + (m2[1] - m1[1]) * t - 150 * np.sin(np.pi * min(1, max(0, (t - 0.0) / 1.0))) ** 0.6
        pts.append((x, y))
    d.line(pts, fill=(16, 16, 18), width=34, joint="curve")
    d.line([(x, y - 9) for x, y in pts[4:-4]], fill=(70, 72, 78), width=6, joint="curve")
    box = canvas.getbbox()
    return canvas.crop(box), box[:2]


# ---------------------------------------------------------------- slides
def main_white(p):
    img = Image.new("RGBA", (S, S), WHITE)
    lx.place(img, p, S // 2, 180, 1760, 1640)
    return img


def main_badged(p, v):
    img = Image.new("RGBA", (S, S), WHITE)
    d = ImageDraw.Draw(img)
    header(img)
    f = heavy(78)
    bw = d.textlength(v["kwh"], font=f) + 90
    d.rounded_rectangle([S - 80 - bw, 80, S - 80, 210], radius=26, fill=ORANGE)
    d.text((S - 80 - bw / 2, 145), v["kwh"], font=f, fill=WHITE, anchor="mm")
    d.text((S - 80 - bw / 2, 250), v["name"] + " LiFePO4", font=bold(36), fill=GREY, anchor="mm")
    lx.place(img, p, S // 2, 340, 1640, 1340)
    chips_centred(d, 1765, ["LiFePO4", v["name"], "4000+ Cycles", "3 Years Warranty"])
    d.text((S // 2, 1905), "E-Scooty Lithium Battery", font=bold(40), fill=INK, anchor="mm")
    return img


def why_powerrun(p, v):
    img = dark_backdrop()
    d = ImageDraw.Draw(img)
    header(img, dark=True)
    f = heavy(96)
    a, b = "WHY CHOOSE ", "POWERRUN"
    wa = d.textlength(a, font=f)
    x = (S - wa - d.textlength(b, font=f)) / 2
    d.text((x, 330), a, font=f, fill=WHITE, anchor="lm")
    d.text((x + wa, 330), b, font=f, fill=ORANGE, anchor="lm")
    d.text((S // 2, 425), v["name"] + " LiFePO4 E-Scooty Battery", font=bold(44),
           fill=(200, 200, 200), anchor="mm")
    lx.place(img, p, 500, 780, 860, 860, with_shadow=False)
    feats = [
        ("", "LiFePO4 Chemistry", "Safer & more stable than lead-acid"),
        ("", v["kwh"] + " Energy", "60V x {}Ah - more range per charge".format(v["ah"])),
        ("", "{}A Max Discharge".format(v["discharge"]), "Smooth pickup, even with a pillion"),
        ("", "4000+ Cycle Life", "Years of daily rides"),
        ("", "{}A Charge Current".format(v["charge"]), "Fast charge capable"),
        ("", "Maintenance-free", "Integrated BMS, no water top-up"),
        ("", "3 Years Warranty", "Backed by PowerRun service"),
    ]
    y = 530
    for g, t, sub in feats:
        icon_tile(d, 1000, y, g, 104)
        d.text((1135, y + 30), t, font=bold(50), fill=WHITE, anchor="lm")
        d.text((1135, y + 82), sub, font=regular(31), fill=(185, 185, 185), anchor="lm")
        y += 178
    d.rectangle([S // 2 - 60, 1880, S // 2 + 60, 1886], fill=ORANGE)
    d.text((S // 2, 1925), "Made in India • Backed by PowerRun service",
           font=regular(28), fill=(120, 120, 120), anchor="mm")
    return img


def specifications(p, v):
    img = Image.new("RGBA", (S, S), WHITE)
    d = ImageDraw.Draw(img)
    header(img)
    f = heavy(70)
    t1, t2 = v["kwh"], "E-SCOOTY BATTERY"
    w1 = d.textlength(t1, font=f) + 60
    x = (S - w1 - 30 - d.textlength(t2, font=bold(64))) / 2
    d.rounded_rectangle([x, 290, x + w1, 400], radius=22, fill=ORANGE)
    d.text((x + w1 / 2, 345), t1, font=f, fill=WHITE, anchor="mm")
    d.text((x + w1 + 30, 345), t2, font=bold(64), fill=INK, anchor="lm")
    d.text((S // 2, 455), "LiFePO4   •   60V   •   {}Ah".format(v["ah"]), font=bold(36),
           fill=GREY, anchor="mm")
    y = 515
    for label, value, g in specs_for(v):
        d.rounded_rectangle([80, y, 1040, y + 118], radius=20, fill=(246, 246, 246))
        icon_tile(d, 106, y + 22, g, 74)
        d.text((212, y + 38), label, font=regular(28), fill=GREY, anchor="lm")
        d.text((212, y + 80), value, font=bold(42 if len(value) < 24 else 34), fill=INK, anchor="lm")
        y += 132
    lx.place(img, p, 1510, 800, 860, 860)
    band_y = 1740
    d.rectangle([0, band_y, S, S], fill=(14, 14, 14))
    stats = [("", "60V"), ("", "{}Ah".format(v["ah"])), ("", v["kwh"]),
             ("", "4000+ Cycles"), ("", "3 Yr Warranty")]
    step = S / len(stats)
    for i, (g, t) in enumerate(stats):
        cx = step * i + step / 2
        icon_tile(d, cx - 50, band_y + 50, g, 100)
        d.text((cx, band_y + 200), t, font=bold(40), fill=WHITE, anchor="mm")
    return img


def why_lithium(v):
    img = Image.new("RGBA", (S, S), WHITE)
    d = ImageDraw.Draw(img)
    header(img)
    d.text((S // 2, 330), "LiFePO4 vs LEAD-ACID", font=heavy(100), fill=INK, anchor="mm")
    d.text((S // 2, 430), "Why scooter riders are switching to lithium", font=regular(42),
           fill=GREY, anchor="mm")
    rows = [
        ("Cycle Life", "300 – 500 cycles", "4000+ cycles"),
        ("Usable Capacity", "~50% of rated", "~90% of rated"),
        ("Weight", "Heavy (5 batteries)", "Up to 60% lighter"),
        ("Maintenance", "Water top-up, acid, corrosion", "Maintenance-free"),
        ("Charging", "8 – 10 hours", "Fast (up to {}A)".format(v["charge"])),
        ("Power Delivery", "Drops as charge falls", "Steady till the end"),
        ("Replacement", "Every 1 – 1.5 years", "Lasts years"),
    ]
    x0, x1, x2, x3 = 100, 640, 1290, 1900
    top = 560
    d.rounded_rectangle([x0, top, x3, top + 110], radius=24, fill=INK)
    d.text(((x1 + x2) / 2, top + 55), "LEAD-ACID", font=bold(40), fill=(200, 200, 200), anchor="mm")
    d.text(((x2 + x3) / 2, top + 55), "POWERRUN LiFePO4", font=bold(40), fill=ORANGE, anchor="mm")
    y = top + 140
    for label, lead, li in rows:
        d.rounded_rectangle([x0, y, x3, y + 130], radius=20, fill=(247, 247, 247))
        d.rounded_rectangle([x2 + 10, y + 12, x3 - 12, y + 118], radius=16, fill=ORANGE_SOFT)
        d.text((x0 + 40, y + 65), label, font=bold(42), fill=INK, anchor="lm")
        d.text(((x1 + x2) / 2, y + 65), lead, font=regular(36), fill=GREY, anchor="mm")
        d.text(((x2 + x3) / 2, y + 65), li, font=bold(38), fill=(210, 70, 0), anchor="mm")
        y += 150
    d.rounded_rectangle([300, 1820, 1700, 1900], radius=40, fill=(245, 245, 245))
    d.text((S // 2, 1860), "General LiFePO4 vs lead-acid comparison; actual figures vary with usage.",
           font=regular(30), fill=GREY, anchor="mm")
    return img


def build(p, origin):
    img = Image.new("RGBA", (S, S), WHITE)
    d = ImageDraw.Draw(img)
    header(img)
    d.text((S // 2, 330), "BUILT FOR DAILY RIDES", font=heavy(96), fill=INK, anchor="mm")
    d.text((S // 2, 430), "Compact, rugged and ready to fit", font=regular(42), fill=GREY, anchor="mm")
    px, py, sc = lx.place(img, p, S // 2, 560, 1300, 1020)
    # callout points are on the untrimmed 1600x1500 pack canvas
    ox, oy = origin
    to_c = lambda x, y: (px + (x - ox) * sc, py + (y - oy) * sc)
    m1, m2 = handle_mounts()
    grip = lerp(m1, m2, 0.5)
    callouts = [
        (1, (grip[0], grip[1] - 150), "Carry Handle", "Lift in and out easily"),
        (2, on_face("top", 1180, 360), "Output Connector", "Secure, high-current"),
        (3, on_face("side", 350, 1250), "Vibration-resistant Enclosure", "Made for Indian roads"),
        (4, on_face("front", 1390, 880), "Integrated BMS", "Charge balancing & protection"),
    ]
    for n, (x, y), _, _ in callouts:
        cx, cy = to_c(x, y)
        d.ellipse([cx - 36, cy - 36, cx + 36, cy + 36], fill=ORANGE, outline=WHITE, width=6)
        d.text((cx, cy), str(n), font=bold(40), fill=WHITE, anchor="mm")
    y = 1640
    for i, (n, _, t, sub) in enumerate(callouts):
        x = 140 if i % 2 == 0 else 1060
        yy = y + (i // 2) * 150
        d.ellipse([x, yy, x + 72, yy + 72], fill=ORANGE)
        d.text((x + 36, yy + 36), str(n), font=bold(38), fill=WHITE, anchor="mm")
        d.text((x + 100, yy + 18), t, font=bold(44), fill=INK, anchor="lm")
        d.text((x + 100, yy + 64), sub, font=regular(32), fill=GREY, anchor="lm")
    return img


def render(key):
    v = VARIANTS[key]
    out = os.path.join(OUT_ROOT, "60v-{}ah".format(v["ah"]))
    os.makedirs(out, exist_ok=True)
    p, origin = pack(v)
    slides = {
        "0-main-white.jpg": main_white(p),
        "1-main.jpg": main_badged(p, v),
        "2-why-powerrun.jpg": why_powerrun(p, v),
        "3-specifications.jpg": specifications(p, v),
        "4-why-lithium.jpg": why_lithium(v),
        "5-build.jpg": build(p, origin),
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
    for key in [a for a in sys.argv[1:] if a in VARIANTS] or list(VARIANTS):
        render(key)


if __name__ == "__main__":
    main()


