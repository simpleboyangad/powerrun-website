"""
E-rickshaw battery listing images - PowerRun 51.2V LiFePO4 (110 / 230 / 314Ah).

    python scripts/listing_erickshaw.py            every variant
    python scripts/listing_erickshaw.py 230        one variant

All variants share the same two photos; the capacity printed on the pack
(lid badge, lid panel, rating label, top-view lid) is repainted per variant.

Reads   photos/original/erickshaw-front.png   (front 3/4 view, label + lid print)
        photos/original/erickshaw-top.png     (top view; its lid carried a wrong
                                               "PowerRun Industries" logo)
        photos/original/logo.jpeg             (the real PowerRun logo)
Writes  photos/listing/e-rickshaw/51v-<ah>ah/
        0-main-white.jpg   plain product on pure white (Amazon/Flipkart main)
        1-main.jpg         product + logo + badges
        2-why-powerrun.jpg
        3-specifications.jpg
        4-why-lithium.jpg
        5-build.jpg        top view with callouts

Needs Pillow, numpy and opencv-python. Fonts come from C:\\Windows\\Fonts.
"""
import os
import sys
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "photos", "original")
OUT_ROOT = os.path.join(ROOT, "photos", "listing", "e-rickshaw")
FONTS = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")

ORANGE = (255, 90, 0)
ORANGE_SOFT = (255, 240, 230)
INK = (20, 20, 20)
GREY = (110, 110, 110)
WHITE = (255, 255, 255)
S = 2000

# 110Ah currents are printed on that pack's label; 230/314Ah currents,
# cycle life (4000+) and warranty (3 years) are the owner's figures.
VARIANTS = {
    "110": {"ah": 110, "charge": 50, "discharge": 100},
    "230": {"ah": 230, "charge": 150, "discharge": 150},
    "314": {"ah": 314, "charge": 150, "discharge": 150},
}
for _v in VARIANTS.values():
    _v["kwh"] = "{:.2f} kWh".format(51.2 * _v["ah"] / 1000)
    _v["name"] = "51.2V {}Ah".format(_v["ah"])


def specs_for(v):
    rows = [
        ("Chemistry", "LiFePO4 (Lithium Iron Phosphate)", "\ue945"),
        ("Nominal Voltage", "51.2 V", "\ue945"),
        ("Rated Capacity", "{} Ah".format(v["ah"]), "\ue83f"),
        ("Energy", v["kwh"], "\ue9d9"),
    ]
    if v["charge"]:
        rows += [("Max Charge Current", "{} A".format(v["charge"]), "\ue83e"),
                 ("Max Discharge Current", "{} A".format(v["discharge"]), "\uec4a")]
    else:
        rows += [("BMS", "Integrated, with charge balancing", "\ue83e")]
    rows += [
        ("Cycle Life", "4000+ cycles", "\ue895"),
        ("Warranty", "3 Years", "\uea18"),
        ("Application", "E-Rickshaw / E-Loader", "\ue804"),
    ]
    return rows


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def bold(size):
    return font("segoeuib.ttf", size)


def regular(size):
    return font("segoeui.ttf", size)


def heavy(size):
    return font("ariblk.ttf", size)


def icon(size):
    return font("SegoeIcons.ttf", size)


def condensed(size):
    """Bold condensed face, close to the capacity print on the pack's lid."""
    f = font("bahnschrift.ttf", size)
    f.set_variation_by_name("Bold Condensed")
    return f


def fit(img, box_w, box_h):
    r = min(box_w / img.width, box_h / img.height)
    return img.resize((int(img.width * r), int(img.height * r)), Image.LANCZOS)


# ---------------------------------------------------------------- logo
def logo_rgba(dark_bg=False, ink=INK, accent=ORANGE):
    """The real logo with its white paper keyed out."""
    a = np.asarray(Image.open(os.path.join(SRC, "logo.jpeg")).convert("RGB")).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = (r * 299 + g * 587 + b * 114) // 1000
    orange = (r > 150) & (r - b > 90)
    out = np.zeros((*lum.shape, 4), np.uint8)
    out[..., :3] = WHITE if dark_bg else ink
    out[..., 3] = np.clip((235 - lum) * 255 / 120, 0, 255)
    out[orange, :3] = accent
    out[orange, 3] = np.clip((r - b - 40) * 255 / 120, 0, 255)[orange]
    img = Image.fromarray(out)
    return img.crop(img.getbbox())


def mark_only(logo):
    """The PR monogram: everything above the POWERRUN word."""
    al = np.asarray(logo)[..., 3]
    rows = np.where(al.max(axis=1) > 60)[0]
    gaps = [y for y in range(rows[0], rows[-1]) if al[y].max() < 30]
    cut = gaps[0] if gaps else logo.height
    m = logo.crop((0, 0, logo.width, cut))
    return m.crop(m.getbbox())


# ---------------------------------------------------------------- photo fixes
def fix_top_view(v):
    """Paint out the wrong lid print on the top view and lay the real logo on it."""
    im = cv2.imread(os.path.join(SRC, "erickshaw-top.png"))
    h0, w0 = im.shape[:2]
    # Lid plane: four points on the raised panel -> a flat 1200x620 canvas,
    # shifted 100px down so the old print's swoosh (above the panel) fits too.
    W, H, OY = 1200, 720, 100
    quad = np.float32([[270, 228], [1280, 60], [1435, 232], [500, 490]])
    flat_q = np.float32([[0, OY], [W, OY], [W, 620 + OY], [0, 620 + OY]])
    M = cv2.getPerspectiveTransform(quad, flat_q)
    flat = cv2.warpPerspective(im, M, (W, H), flags=cv2.INTER_CUBIC)

    x0, y0, x1, y1 = 195, 60, 800, 560          # old print, handles excluded
    hole = np.zeros((H, W), np.uint8)
    hole[y0:y1, x0:x1] = 255
    clean = cv2.inpaint(flat, hole, 9, cv2.INPAINT_TELEA)
    soft = cv2.GaussianBlur(hole, (0, 0), 6).astype(np.float32)[..., None] / 255
    clean = (clean * (1 - soft) + cv2.GaussianBlur(clean, (0, 0), 18) * soft)

    # Lid print in deep red-orange + near-black, same as the front view's lid.
    art = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    lg = logo_rgba(ink=(22, 22, 22), accent=(150, 22, 0))
    lg = lg.resize((330, int(lg.height * 330 / lg.width)), Image.LANCZOS)
    cx, ly = (x0 + x1) // 2, y0 + 10
    art.alpha_composite(lg, (cx - lg.width // 2, ly))
    d = ImageDraw.Draw(art)
    ty = ly + lg.height + 62
    d.text((cx, ty), "51.2V  {}Ah  LiFePO4".format(v["ah"]), font=bold(44), fill=(22, 22, 22), anchor="mt")
    d.text((cx, ty + 62), "E-RICKSHAW BATTERY", font=bold(34), fill=(22, 22, 22), anchor="mt")

    an = cv2.GaussianBlur(np.asarray(art).astype(np.float32), (0, 0), 0.6)
    A = an[..., 3:4] / 255
    gloss = np.clip(clean.mean(axis=2, keepdims=True) - 150, 0, 255) * 0.55
    comp = np.clip(clean * (1 - A) + (an[..., [2, 1, 0]] + gloss) * A, 0, 255).astype(np.uint8)

    back = cv2.warpPerspective(comp, np.linalg.inv(M), (w0, h0), flags=cv2.INTER_CUBIC)
    area = np.zeros((H, W), np.uint8)
    area[y0 - 30:y1 + 30, x0 - 30:x1 + 30] = 255
    area = cv2.warpPerspective(cv2.GaussianBlur(area, (0, 0), 8), np.linalg.inv(M), (w0, h0))
    # Only touch the lid itself: grey studio backdrop has almost no saturation.
    sat = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)[..., 1]
    lid = cv2.morphologyEx(np.where(sat > 70, 255, 0).astype(np.uint8),
                           cv2.MORPH_CLOSE, np.ones((31, 31), np.uint8))
    lid = cv2.GaussianBlur(cv2.erode(lid, np.ones((3, 3), np.uint8)), (0, 0), 1.5)
    wa = (area.astype(np.float32) * lid / 255 / 255)[..., None]
    return (im * (1 - wa) + back * wa).astype(np.uint8)


def fix_front_view(v):
    """The front view's lid already carries the real logo; only the small
    mark on the rating label was a look-alike - swap it for the real one.
    Other capacities also get their figures repainted on the lid and label."""
    im = Image.open(os.path.join(SRC, "erickshaw-front.png")).convert("RGB")
    if v["ah"] != 110:
        im = repaint_capacity(im, v)
    # Blank the old mark with label paper, following the label's tilted edges.
    ImageDraw.Draw(im).polygon([(754, 137), (828, 152), (828, 177), (754, 164)],
                               fill=(238, 239, 240))
    lg = logo_rgba()
    lg = lg.resize((42, int(lg.height * 42 / lg.width)), Image.LANCZOS)
    lg = lg.rotate(-5, resample=Image.BICUBIC, expand=True)
    im.paste(lg, (792 - lg.width // 2, 160 - lg.height // 2), lg)
    return cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)


def rotated_text(im, xy, text, fnt, fill, angle):
    """Draw text centred on xy, turned by angle degrees (counter-clockwise)."""
    tmp = Image.new("RGBA", (600, 200), (0, 0, 0, 0))
    ImageDraw.Draw(tmp).text((300, 100), text, font=fnt, fill=fill, anchor="mm")
    tmp = tmp.rotate(angle, resample=Image.BICUBIC)
    im.paste(tmp, (int(xy[0] - 300), int(xy[1] - 100)), tmp)


def repaint_capacity(im, v):
    ah = "{}AH".format(v["ah"])
    d = ImageDraw.Draw(im)
    # Lid badge: "51.2V 110AH" in white on the black plate - redo the "110AH",
    # squeezed to the old glyph box (the print is narrower than Bahnschrift).
    d.rectangle([1048, 456, 1206, 538], fill=(15, 15, 16))
    t = Image.new("L", (900, 300), 0)
    ImageDraw.Draw(t).text((10, 10), ah, font=condensed(200), fill=255)
    t = t.crop(t.getbbox()).resize((150, 80), Image.LANCZOS)
    im.paste(Image.new("RGB", t.size, (250, 250, 250)), (1052, 456), t)
    # Lower panel: "Capacity : 110AH".
    d.polygon([(858, 852), (940, 846), (942, 882), (860, 888)], fill=(17, 17, 18))
    rotated_text(im, (898, 867), ah, font("seguisb.ttf", 27), (240, 240, 240), 3)
    return repaint_label(im, v)


def repaint_label(im, v):
    """Rewrite the rating label's spec lines: flatten the label, repaint, warp back."""
    arr = np.asarray(im).copy()
    quad = np.float32([[662, 112], [835, 143], [835, 402], [662, 384]])
    W, H = 346, 540
    flat_q = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
    M = cv2.getPerspectiveTransform(quad, flat_q)
    flat = Image.fromarray(cv2.warpPerspective(arr, M, (W, H), flags=cv2.INTER_CUBIC))
    d = ImageDraw.Draw(flat)
    box = (12, 98, 334, 290)                         # header rule .. "Warning"
    d.rectangle(box, fill=(237, 238, 239))
    rows = [("Model", "51.2V / {}Ah".format(v["ah"])), ("Nominal Voltage", "51.2V"),
            ("Rated Capacity", "{}Ah".format(v["ah"])), ("Energy", v["kwh"].replace(" ", "")),
            ("Max Charge Current", "{}A".format(v["charge"])),
            ("Max Discharge Current", "{}A".format(v["discharge"])), ("Cell Type", "LiFePO4")]
    f = regular(19)
    y = box[1] + 16
    # The plate is turned away from the camera, so a level row reads as a
    # slope; the values are lifted a little to sit beside their keys.
    for k, val in rows:
        d.text((box[0] + 6, y), k, font=f, fill=(35, 35, 35))
        d.text((198, y - 18), ": " + val, font=f, fill=(35, 35, 35))
        y += 25
    size = (arr.shape[1], arr.shape[0])
    back = cv2.warpPerspective(np.asarray(flat), np.linalg.inv(M), size, flags=cv2.INTER_CUBIC)
    m = np.zeros((H, W), np.uint8)
    m[box[1]:box[3], box[0]:box[2]] = 255
    m = cv2.warpPerspective(m, np.linalg.inv(M), size)
    m = cv2.GaussianBlur(m, (0, 0), 0.8).astype(np.float32)[..., None] / 255
    return Image.fromarray((arr * (1 - m) + back * m).astype(np.uint8))


def cutout(im, rect):
    """GrabCut the pack off the studio backdrop -> (RGBA trimmed, its top-left
    in the source photo) so callouts can keep using photo coordinates."""
    mask = np.zeros(im.shape[:2], np.uint8)
    bg, fg = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.grabCut(im, mask, rect, bg, fg, 8, cv2.GC_INIT_WITH_RECT)
    m = np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    m = np.where(lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]), 255, 0).astype(np.uint8)
    ff = cv2.bitwise_not(m)
    cv2.floodFill(ff, None, (0, 0), 0)
    m = cv2.GaussianBlur(cv2.bitwise_or(m, ff), (0, 0), 1.2)
    rgba = np.dstack([cv2.cvtColor(im, cv2.COLOR_BGR2RGB), m])
    img = Image.fromarray(rgba)
    box = img.getbbox()
    return img.crop(box), box[:2]


def shadow(img, blur=30, opacity=38, squash=0.10):
    """Soft contact shadow sized to the product's footprint."""
    w = img.width
    sh = Image.new("RGBA", (w + blur * 6, int(w * squash) + blur * 6), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([blur * 3, blur * 3, blur * 3 + w, blur * 3 + int(w * squash)],
                               fill=(0, 0, 0, opacity))
    return sh.filter(ImageFilter.GaussianBlur(blur))


def place(canvas, prod, cx, top, box_w, box_h, with_shadow=True):
    p = fit(prod, box_w, box_h)
    x = int(cx - p.width / 2)
    if with_shadow:
        sh = shadow(p)
        canvas.alpha_composite(sh, (int(cx - sh.width / 2), top + p.height - sh.height // 2 - 10))
    canvas.alpha_composite(p, (x, top))
    return x, top, p.width / prod.width


# ---------------------------------------------------------------- pieces
def chip(d, x, y, text, f=None, pad=34, h=76):
    f = f or bold(34)
    w = d.textlength(text, font=f) + pad * 2
    d.rounded_rectangle([x, y, x + w, y + h], radius=h // 2, fill=ORANGE_SOFT)
    d.text((x + w / 2, y + h / 2), text, font=f, fill=(200, 70, 0), anchor="mm")
    return w


def chips_centred(d, y, items, gap=24):
    f = bold(34)
    widths = [d.textlength(t, font=f) + 68 for t in items]
    x = (S - sum(widths) - gap * (len(items) - 1)) / 2
    for t, w in zip(items, widths):
        chip(d, x, y, t, f)
        x += w + gap


def header(img, dark=False):
    lg = fit(logo_rgba(dark_bg=dark), 250, 150)
    img.alpha_composite(lg, (80, 70))


def icon_tile(d, x, y, glyph, size=96, fill=ORANGE, fg=WHITE):
    d.rounded_rectangle([x, y, x + size, y + size], radius=size // 5, fill=fill)
    d.text((x + size / 2, y + size / 2), glyph, font=icon(int(size * 0.5)), fill=fg, anchor="mm")


def dark_backdrop():
    bg = Image.new("RGB", (S, S), (12, 12, 12))
    glow = Image.new("L", (200, 200), 0)
    gp = glow.load()
    for yy in range(200):
        for xx in range(200):
            d2 = ((xx - 60) / 110) ** 2 + ((yy - 120) / 110) ** 2
            gp[xx, yy] = int(70 * max(0, 1 - d2) ** 2)
    glow = glow.resize((S, S), Image.BICUBIC)
    warm = Image.new("RGB", (S, S), ORANGE)
    return Image.composite(warm, bg, glow).convert("RGBA")


# ---------------------------------------------------------------- slides
def main_white(front):
    img = Image.new("RGBA", (S, S), WHITE)
    place(img, front, S // 2, 170, 1800, 1640)
    return img


def main_badged(front, v):
    img = Image.new("RGBA", (S, S), WHITE)
    d = ImageDraw.Draw(img)
    header(img)
    # top-right energy badge
    f = heavy(78)
    t = v["kwh"]
    w = d.textlength(t, font=f) + 90
    d.rounded_rectangle([S - 80 - w, 80, S - 80, 210], radius=26, fill=ORANGE)
    d.text((S - 80 - w / 2, 145), t, font=f, fill=WHITE, anchor="mm")
    d.text((S - 80 - w / 2, 250), v["name"] + " LiFePO4", font=bold(36), fill=GREY, anchor="mm")
    place(img, front, S // 2, 330, 1720, 1350)
    chips_centred(d, 1745, ["LiFePO4", v["name"], "4000+ Cycles", "3 Years Warranty"])
    d.text((S // 2, 1890), "E-Rickshaw Lithium Battery", font=bold(40), fill=INK, anchor="mm")
    return img


def why_powerrun(top, v):
    img = dark_backdrop()
    d = ImageDraw.Draw(img)
    header(img, dark=True)
    f = heavy(96)
    a, b = "WHY CHOOSE ", "POWERRUN"
    wa, wb = d.textlength(a, font=f), d.textlength(b, font=f)
    x = (S - wa - wb) / 2
    d.text((x, 330), a, font=f, fill=WHITE, anchor="lm")
    d.text((x + wa, 330), b, font=f, fill=ORANGE, anchor="lm")
    d.text((S // 2, 425), v["name"] + " LiFePO4 E-Rickshaw Battery", font=bold(44),
           fill=(200, 200, 200), anchor="mm")

    place(img, top, 520, 700, 940, 900, with_shadow=False)

    if v["charge"]:
        power = [("\uec4a", "{}A Max Discharge".format(v["discharge"]),
                  "Strong pickup on climbs & full load"),
                 ("\ue83e", "{}A Charge Current".format(v["charge"]), "Back on the road faster")]
    else:
        power = [("\uec4a", "Integrated Smart BMS", "Charge balancing & full protection"),
                 ("\ue83e", "Fast Charge Capable", "Back on the road faster")]
    feats = [
        ("\ue945", "LiFePO4 Chemistry", "Safer & more stable than lead-acid"),
        ("\ue83f", v["kwh"] + " Energy",
         "51.2V x {}Ah - longer range per charge".format(v["ah"])),
        power[0],
        ("\ue895", "4000+ Cycle Life", "Years of daily deep-cycle duty"),
        power[1],
        ("\ue74d", "Maintenance-free", "No water top-up, no acid, no corrosion"),
        ("\uea18", "3 Years Warranty", "Backed by PowerRun service"),
    ]
    y = 530
    for g, title, sub in feats:
        icon_tile(d, 1060, y, g, 104)
        d.text((1195, y + 30), title, font=bold(52), fill=WHITE, anchor="lm")
        d.text((1195, y + 82), sub, font=regular(32), fill=(185, 185, 185), anchor="lm")
        y += 178
    d.rectangle([S // 2 - 60, 1880, S // 2 + 60, 1886], fill=ORANGE)
    d.text((S // 2, 1925), "Made in India \u2022 Backed by PowerRun service",
           font=regular(28), fill=(120, 120, 120), anchor="mm")
    return img


def specifications(front, v):
    img = Image.new("RGBA", (S, S), WHITE)
    d = ImageDraw.Draw(img)
    header(img)
    f = heavy(70)
    t1, t2 = v["kwh"], "E-RICKSHAW BATTERY"
    w1 = d.textlength(t1, font=f) + 60
    w2 = d.textlength(t2, font=bold(64))
    x = (S - w1 - 30 - w2) / 2
    d.rounded_rectangle([x, 290, x + w1, 400], radius=22, fill=ORANGE)
    d.text((x + w1 / 2, 345), t1, font=f, fill=WHITE, anchor="mm")
    d.text((x + w1 + 30, 345), t2, font=bold(64), fill=INK, anchor="lm")
    d.text((S // 2, 455), "LiFePO4   \u2022   51.2V   \u2022   {}Ah".format(v["ah"]), font=bold(36),
           fill=GREY, anchor="mm")

    y = 515
    for label, value, g in specs_for(v):
        d.rounded_rectangle([80, y, 1040, y + 118], radius=20, fill=(246, 246, 246))
        icon_tile(d, 108, y + 22, g, 74)
        d.text((212, y + 38), label, font=regular(28), fill=GREY, anchor="lm")
        d.text((212, y + 80), value, font=bold(42 if len(value) < 24 else 34), fill=INK, anchor="lm")
        y += 132

    place(img, front, 1510, 720, 860, 900)

    band_y = 1740
    d.rectangle([0, band_y, S, S], fill=(14, 14, 14))
    stats = [("\ue945", "51.2V"), ("\ue83f", "{}Ah".format(v["ah"])), ("\ue9d9", v["kwh"]),
             ("\ue895", "4000+ Cycles"), ("\uea18", "3 Yr Warranty")]
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
    d.text((S // 2, 430), "Why e-rickshaw owners are switching to lithium",
           font=regular(42), fill=GREY, anchor="mm")

    rows = [
        ("Cycle Life", "300 \u2013 500 cycles", "4000+ cycles"),
        ("Usable Capacity", "~50% of rated", "~90% of rated"),
        ("Weight", "Heavy (4 \u2013 5 batteries)", "Up to 60% lighter"),
        ("Maintenance", "Water top-up, acid, corrosion", "Maintenance-free"),
        ("Charging", "8 \u2013 10 hours",
         "Fast (up to {}A)".format(v["charge"]) if v["charge"] else "Fast charge capable"),
        ("Power Delivery", "Drops as charge falls", "Steady till the end"),
        ("Replacement", "Every 8 \u2013 12 months", "Lasts years"),
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


def build(top, origin):
    img = Image.new("RGBA", (S, S), WHITE)
    d = ImageDraw.Draw(img)
    header(img)
    d.text((S // 2, 330), "BUILT FOR THE ROAD", font=heavy(100), fill=INK, anchor="mm")
    d.text((S // 2, 430), "Rugged construction for daily e-rickshaw duty",
           font=regular(42), fill=GREY, anchor="mm")

    px, py, sc = place(img, top, S // 2, 560, 1840, 1000)
    # Points on the original top-view photo (before the cutout trim).
    ox, oy = origin
    to_c = lambda x, y: (px + (x - ox) * sc, py + (y - oy) * sc)
    callouts = [
        (1, (1170, 125), "Steel Carry Handles", "Easy lifting & fitting"),
        (2, (360, 600), "Armoured Output Cables", "Corrugated sleeve protection"),
        (3, (1000, 700), "Heavy-duty Metal Body", "Powder-coated steel casing"),
        (4, (1425, 590), "Mounting Brackets", "Bolt-down base for a secure fit"),
    ]
    for n, (x, y), _, _ in callouts:
        cx, cy = to_c(x, y)
        d.ellipse([cx - 36, cy - 36, cx + 36, cy + 36], fill=ORANGE, outline=WHITE, width=6)
        d.text((cx, cy), str(n), font=bold(40), fill=WHITE, anchor="mm")

    y = 1640
    for i, (n, _, title, sub) in enumerate(callouts):
        x = 140 if i % 2 == 0 else 1060
        yy = y + (i // 2) * 150
        d.ellipse([x, yy, x + 72, yy + 72], fill=ORANGE)
        d.text((x + 36, yy + 36), str(n), font=bold(38), fill=WHITE, anchor="mm")
        d.text((x + 100, yy + 18), title, font=bold(44), fill=INK, anchor="lm")
        d.text((x + 100, yy + 64), sub, font=regular(32), fill=GREY, anchor="lm")
    return img


def render(key):
    v = VARIANTS[key]
    out = os.path.join(OUT_ROOT, "51v-{}ah".format(v["ah"]))
    os.makedirs(out, exist_ok=True)
    front, _ = cutout(fix_front_view(v), (60, 40, 1260, 1020))
    top, top_origin = cutout(fix_top_view(v), (200, 40, 1300, 860))

    slides = {
        "0-main-white.jpg": main_white(front),
        "1-main.jpg": main_badged(front, v),
        "2-why-powerrun.jpg": why_powerrun(top, v),
        "3-specifications.jpg": specifications(front, v),
        "4-why-lithium.jpg": why_lithium(v),
        "5-build.jpg": build(top, top_origin),
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
    keys = [a for a in sys.argv[1:] if a in VARIANTS] or list(VARIANTS)
    for key in keys:
        render(key)


if __name__ == "__main__":
    main()
