"""
YouTube channel art generator - PowerRun Industries.

    python scripts/youtube_art.py

Writes into youtube/ :
    powerrun-logo-dark.png        the site logo recoloured for dark backgrounds
    powerrun-profile-picture.png  800x800 channel avatar (the PR mark)
    powerrun-youtube-banner.png   2560x1440 channel art, text inside the safe area
    powerrun-thumbnail-example.png  1280x720 sample thumbnail

Only Pillow is needed. Fonts come from C:\\Windows\\Fonts.
"""
import os
import sys
from PIL import features, Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "youtube")
LOGO = os.path.join(ROOT, "assets", "powerrun-logo.png")

ORANGE = (255, 90, 0)
ORANGE2 = (255, 122, 24)
YELLOW = (255, 212, 0)
WHITE = (255, 255, 255)
GREY = (200, 200, 200)

FONTS = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")


def font(name, size):
    for candidate in (name, "ariblk.ttf", "arialbd.ttf", "arial.ttf"):
        path = os.path.join(FONTS, candidate)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def devanagari(text):
    return any("ऀ" <= ch <= "ॿ" for ch in text)


def black(size, text=""):
    # Arial Black has no Devanagari, so Hindi lines fall back to Nirmala Bold.
    return font("NirmalaB.ttf" if devanagari(text) else "ariblk.ttf", size)


def bold(size, text=""):
    return font("NirmalaB.ttf" if devanagari(text) else "arialbd.ttf", size)


# ---------------------------------------------------------------- dark logo
def dark_logo():
    """White background out, dark strokes to white, orange kept as orange."""
    src = Image.open(LOGO).convert("RGB")
    w, h = src.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sp, op = src.load(), out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = sp[x, y]
            if r > 130 and r - g > 55 and r - b > 75:          # orange accent
                op[x, y] = (r, g, b, 255)
            else:                                              # ink -> white
                lum = (r * 299 + g * 587 + b * 114) // 1000
                # Paper and its soft grey halo drop out; ink stays solid.
                a = int((190 - lum) * 255 / 150)
                op[x, y] = (255, 255, 255, max(0, min(255, a)))
    out = out.crop(out.getbbox())
    return trim_bars(out)


def trim_bars(img):
    """Drop the solid full-width rules the print logo carries top and bottom."""
    w, h = img.size
    a = img.split()[3].load()
    solid = lambda y: sum(1 for x in range(w) if a[x, y] > 70) > w * 0.90
    top = 0
    while top < h and solid(top):
        top += 1
    bottom = h - 1
    while bottom > top and solid(bottom):
        bottom -= 1
    img = img.crop((0, top, w, bottom + 1))
    return img.crop(img.getbbox())


def mark_only(logo):
    """Left-hand PR mark: cut at the first fully empty column after it."""
    w, h = logo.size
    alpha = logo.split()[3].load()
    cut = w
    for x in range(int(w * 0.18), int(w * 0.55)):
        if all(alpha[x, y] < 45 for y in range(h)):
            cut = x
            break
    return logo.crop((0, 0, cut, h)).crop(
        logo.crop((0, 0, cut, h)).getbbox())


def fit(img, box_w, box_h):
    ratio = min(box_w / img.width, box_h / img.height)
    return img.resize((max(1, int(img.width * ratio)),
                       max(1, int(img.height * ratio))), Image.LANCZOS)


# ---------------------------------------------------------------- background
def backdrop(w, h):
    """Dark base + warm diagonal glow + faint orange streaks."""
    bg = Image.new("RGB", (w, h), (9, 9, 9))
    d = ImageDraw.Draw(bg)
    for y in range(h):                                   # top->bottom warmth
        t = y / h
        d.line([(0, y), (w, y)], fill=(int(13 - 4 * t), int(13 - 8 * t), int(13 - 10 * t)))

    # Drawn small and scaled up, so the falloff is smooth instead of banded.
    gw, gh = 160, 90
    glow = Image.new("RGBA", (gw, gh), (0, 0, 0, 0))
    gp = glow.load()
    for y in range(gh):
        for x in range(gw):
            dx = (x - gw / 2) / (gw * 0.46)
            dy = (y - gh / 2) / (gh * 0.46)
            d2 = dx * dx + dy * dy
            if d2 < 1:
                gp[x, y] = (255, 90, 0, int(44 * (1 - d2) ** 2.4))
    glow = glow.resize((w, h), Image.BICUBIC)
    bg = Image.alpha_composite(bg.convert("RGBA"), glow)

    streaks = Image.new("RGBA", (w * 2, h * 2), (0, 0, 0, 0))
    sd = ImageDraw.Draw(streaks)
    for x, thick in ((int(w * 1.40), 70), (int(w * 1.52), 26),
                     (int(w * 0.30), 70), (int(w * 0.20), 26)):
        sd.rectangle([x, 0, x + thick, h * 2], fill=(255, 90, 0, 22))
    streaks = streaks.rotate(-20, resample=Image.BICUBIC, center=(w, h))
    streaks = streaks.crop((w // 2, h // 2, w // 2 + w, h // 2 + h))
    return Image.alpha_composite(bg, streaks)


def centred(draw, text, cx, cy, fnt, fill):
    draw.text((cx, cy), text, font=fnt, fill=fill, anchor="mm")


# ---------------------------------------------------------------- banner
def banner(logo):
    W, H = 2560, 1440
    # YouTube's safe area (visible on every device): 1546 x 423, centred.
    SAFE_TOP, SAFE_BOTTOM = (H - 423) // 2, (H + 423) // 2
    img = backdrop(W, H)
    d = ImageDraw.Draw(img)

    art = fit(logo, 900, 280)
    img.paste(art, ((W - art.width) // 2, SAFE_TOP + 2), art)

    centred(d, "Lithium Batteries  ·  Hybrid Inverters  ·  Solar",
            W // 2, SAFE_TOP + 335, bold(54), WHITE)

    line_y = SAFE_BOTTOM - 26
    parts = [("powerrun.in", ORANGE2), ("  |  ", (120, 120, 120)),
             ("+91 86075 65520", (235, 235, 235)), ("  |  ", (120, 120, 120)),
             ("Pan India Delivery", (235, 235, 235))]
    f = bold(44)
    total = sum(d.textlength(t, font=f) for t, _ in parts)
    x = W // 2 - total / 2
    for text, colour in parts:
        d.text((x, line_y), text, font=f, fill=colour, anchor="lm")
        x += d.textlength(text, font=f)

    img.convert("RGB").save(os.path.join(OUT, "powerrun-youtube-banner.png"))


# ---------------------------------------------------------------- avatar
def profile(logo):
    S = 800
    img = Image.new("RGB", (S, S), (9, 9, 9))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([18, 18, S - 18, S - 18], radius=90,
                        fill=(16, 16, 16), outline=ORANGE, width=10)
    mark = fit(mark_only(logo), 430, 430)
    img.paste(mark, ((S - mark.width) // 2, (S - mark.height) // 2 - 40), mark)
    centred(d, "POWERRUN", S // 2, S - 150, black(74), WHITE)
    centred(d, "I N D U S T R I E S", S // 2, S - 88, bold(38), ORANGE2)
    img.save(os.path.join(OUT, "powerrun-profile-picture.png"))


# ---------------------------------------------------------------- thumbnail
def wrap_font(draw, text, max_w, size):
    """Biggest Arial Black that keeps the line inside max_w."""
    while size > 40:
        f = black(size, text)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 4
    return black(size, text)


def thumbnail(logo, line1="LITHIUM", line2="VS LEAD",
              kicker="5 SAAL KA HISAAB",
              name="powerrun-thumbnail-example.png"):
    W, H = 1280, 720
    TEXT_W = 590                       # left column, photo panel starts at 700
    img = backdrop(W, H)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 26, H], fill=ORANGE)

    d.rounded_rectangle([700, 60, 1240, 660], radius=18,
                        fill=(0, 0, 0), outline=(42, 42, 42), width=3)
    centred(d, "PRODUCT PHOTO", 970, 360, bold(30), (90, 90, 90))

    f1 = wrap_font(d, line1, TEXT_W, 104)
    f2 = wrap_font(d, line2, TEXT_W, 104)
    d.text((70, 170), line1, font=f1, fill=WHITE)
    d.text((70, 290), line2, font=f2, fill=ORANGE)

    rule = min(TEXT_W, max(220, int(d.textlength(line2, font=f2))))
    d.rectangle([70, 418, 70 + rule, 426], fill=YELLOW)
    d.text((70, 448), kicker, font=wrap_font(d, kicker, TEXT_W, 44), fill=YELLOW)

    art = fit(logo, 330, 70)
    img.paste(art, (70, 585), art)

    img.convert("RGB").save(os.path.join(OUT, name))
    return name


def main():
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    logo = dark_logo()

    if len(sys.argv) > 1:              # thumbnail only, text from the command line
        args = sys.argv[1:]
        if any(devanagari(a) for a in args) and not features.check("raqm"):
            # Without libraqm, Pillow places the matras wrong - "हिसाब" comes
            # out as "हसिाब". Better to refuse than to ship a broken thumbnail.
            print("Devanagari yahan theek nahi chhapta (Pillow me raqm nahi hai).")
            print('Roman me likhein, jaise: "LITHIUM" "VS LEAD" "5 SAAL KA HISAAB"')
            return
        line1 = args[0]
        line2 = args[1] if len(args) > 1 else ""
        kicker = args[2] if len(args) > 2 else ""
        name = args[3] if len(args) > 3 else "thumbnail.png"
        if not name.endswith(".png"):
            name += ".png"
        print("  ", thumbnail(logo, line1.upper(), line2.upper(),
                              kicker.upper(), name))
        return

    logo.save(os.path.join(OUT, "powerrun-logo-dark.png"))
    banner(logo)
    profile(logo)
    thumbnail(logo)
    for f in sorted(os.listdir(OUT)):
        if f.endswith(".png"):
            print("  ", f, Image.open(os.path.join(OUT, f)).size)


if __name__ == "__main__":
    main()
