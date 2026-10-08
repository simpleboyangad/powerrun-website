"""
JK BMS resale listing - products, spec-card images and categories.

    python scripts/listing_jkbms.py            render images only (photos/listing/jk-bms/)
    python scripts/listing_jkbms.py --publish  render, upload and upsert to the live catalogue

Source  private/jk_bms_source.json  (gitignored: the supplier's name, page and
        price incl. GST for every in-stock JK item; never commit buying prices)

Selling price = supplier price incl. GST x 1.20, rounded up to end in 9.

A source row with "photo" (a supplier photo of that exact model, used with
the supplier's permission; either its URL, or a copy under private/ with the
supplier's watermark removed, which the supplier also allowed) gets that photo first and a
specifications card second. Rows without one get two spec cards (no drawn
product) that say plainly they are illustrations. Photos are re-encoded on
white, which also drops their metadata. The rows carry brand = 'JK BMS',
which keeps them off the Merchant Center feed and out of PowerRun's warranty
wording (see merchant_feed.py, seo_build.py). Everything shown is read from
the model name; nothing is invented.
"""
import io
import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import listing_erickshaw as lx  # noqa: E402  shared logo, fonts and pieces
from listing_erickshaw import S, ORANGE, ORANGE_SOFT, INK, GREY, WHITE, bold, regular, heavy, header  # noqa: E402

ROOT = lx.ROOT
SOURCE = os.path.join(ROOT, "private", "jk_bms_source.json")
OUT_ROOT = os.path.join(ROOT, "photos", "listing", "jk-bms")
BRAND = "JK BMS"
MAKER = "JK"            # short name in "no warranty on JK parts"
STORAGE = "jk-bms"      # storage folder for the images
MARKUP = 1.20
OUT_SIZE = 1200
BUCKET = "product-images"
WARRANTY = "No warranty - damaged, defective or wrong items replaced within 7 days of delivery"
SORT_BASE = 100

PARENT = {"name": "BMS & Balancers", "slug": "bms-balancers", "sort_order": 5,
          "description": "JK and JBD smart BMS, LiFePO4 and NMC BMS, active balancers, high-voltage BMS and BMS "
                         "displays for lithium battery packs.",
          "meta_title": "JK & JBD BMS, Smart BMS & Active Balancers | PowerRun",
          "meta_description": "Buy JK and JBD smart BMS, LiFePO4 and NMC BMS (4S-32S), ESS BMS, active balancers and "
                              "SOC displays for lithium battery packs. Pan-India delivery from PowerRun.",
          "focus_keyword": "jk bms"}
SUBS = {
    "smart": ("Smart BMS", "jk-smart-bms", 1),
    "hv": ("High Voltage BMS", "high-voltage-bms", 2),
    "balancer": ("Active Balancers", "active-balancers", 3),
    "accessory": ("BMS Displays & Accessories", "bms-displays-accessories", 4),
}


def selling_price(cost):
    return math.ceil(cost * MARKUP / 10) * 10 - 1


def balance_current(model):
    """JK model codes start with the active balance current: B2A = 2 A,
    B1A = 1 A, BD6A = 0.6 A, BD4A = 0.4 A (PB.. = the ESS version)."""
    m = re.match(r"P?B(D?)(\d+)A", model)
    if not m:
        return ""
    return ("0.%s A" if m.group(1) else "%s A") % m.group(2)


def lfp_range(lo, hi):
    return "%.1f V (%dS) to %.1f V (%dS)" % (lo * 3.2, lo, hi * 3.2, hi)


# ---------------------------------------------------------------- parsing
def parse(src):
    """One supplier row -> one PowerRun product dict (without ids)."""
    raw = re.sub(r"\s+", " ", src["supplier_name"].upper().replace("SAMART", "SMART")).strip()
    p = {"cost": src["supplier_price_incl_gst"], "photo": src.get("photo"), "chips": [], "specs": [], "features": []}

    m = re.match(r"JK (SEMI SMART |SMART )(ESS )?BMS (\d+)-(\d+)S (\d+)A(?:MP)? (\w+)( PTMC)?$", raw) or \
        re.match(r"JK BMS (\d+)-(\d+)S (\d+)AMP SEMI SMART\((\w+)\)$", raw)
    if m and raw.startswith("JK BMS"):
        semi, ess, lo, hi, amps, model, ptmc = "SEMI SMART ", None, m.group(1), m.group(2), m.group(3), m.group(4), None
    elif m:
        semi, ess, lo, hi, amps, model, ptmc = m.groups()
    if m:
        lo, hi, amps = int(lo), int(hi), int(amps)
        semi = semi.strip() == "SEMI SMART"
        kind = "Semi-Smart" if semi else "Smart"
        label = "%s %sBMS" % (kind, "ESS " if ess else "")
        code = model + (" PTMC" if ptmc else "")
        bal = balance_current(model)
        p.update(sub="smart", model=code,
                 name="JK %s %dS-%dS %dA (%s)" % (label, lo, hi, amps, code),
                 card_title=label.upper(), card_big="%dS-%dS  |  %dA" % (lo, hi, amps))
        p["specs"] = [("Brand", BRAND), ("Model", code), ("Type", label + " with active balancing"),
                      ("Series (cell count)", "%dS to %dS" % (lo, hi)),
                      ("Continuous Discharge Current", "%d A" % amps)]
        if bal:
            p["specs"].append(("Active Balance Current", bal))
        p["specs"].append(("LiFePO4 pack voltage", lfp_range(lo, hi)))
        p["chips"] = ["%dS-%dS" % (lo, hi), "%dA" % amps] + (["%s Balance" % bal.replace(" ", "")] if bal else [])
        p["features"] = ["Active cell balancing" + (" (%s)" % bal if bal else ""),
                         "For %dS to %dS lithium packs" % (lo, hi), "%d A continuous discharge" % amps]
        if ess:
            p["features"].append("Made for ESS / inverter battery packs")
            p["specs"].append(("Application", "ESS / inverter battery packs"))
        if not semi:
            p["features"].append("Bluetooth app monitoring")
            p["chips"].append("Bluetooth App")
        p["use"] = ("%dS-%dS lithium battery packs - for example a %dS LiFePO4 pack (%.1f V) - drawing up to %d A "
                    "continuously" % (lo, hi, min(max(lo, 16), hi), min(max(lo, 16), hi) * 3.2, amps))
        p["short"] = "JK %s for %dS-%dS lithium packs, %d A continuous%s." % (
            label, lo, hi, amps, ", %s active balancing" % bal if bal else "")
        return p

    m = re.match(r"JK MASTER BMS BCU (\d+)A (\d+)V HIGH VOLTAGE$", raw)
    if m:
        amps, volts = map(int, m.groups())
        p.update(sub="hv", model="BCU %dA" % amps,
                 name="JK High Voltage Master BMS (BCU) %dA %dV" % (amps, volts),
                 card_title="HIGH VOLTAGE MASTER BMS", card_big="%dA  |  %dV" % (amps, volts),
                 chips=["Master (BCU)", "%dA" % amps, "Up to %dV" % volts])
        p["specs"] = [("Brand", BRAND), ("Model", "BCU %dA" % amps), ("Type", "High-voltage master BMS (BCU)"),
                      ("Current", "%d A" % amps), ("Voltage", "Up to %d V" % volts)]
        p["features"] = ["Master control unit for high-voltage battery stacks", "%d A rated" % amps,
                         "Up to %d V systems" % volts, "Works with JK slave BMS modules (BMU)"]
        p["use"] = "high-voltage battery stacks up to %d V, together with JK slave BMS modules" % volts
        p["short"] = "JK high-voltage master BMS (BCU), %d A, for battery stacks up to %d V." % (amps, volts)
        return p

    m = re.match(r"JK SALAVE BMS -(\d+)S (BMU-[\w-]+)$", raw)
    if m:
        cells, model = int(m.group(1)), m.group(2)
        p.update(sub="hv", model=model, name="JK High Voltage Slave BMS %dS (%s)" % (cells, model),
                 card_title="HIGH VOLTAGE SLAVE BMS", card_big="%dS  |  %s" % (cells, model),
                 chips=["Slave (BMU)", "%dS module" % cells])
        p["specs"] = [("Brand", BRAND), ("Model", model), ("Type", "High-voltage slave BMS (BMU)"),
                      ("Cells per module", "%dS" % cells)]
        p["features"] = ["Slave module for JK high-voltage BMS", "Monitors %d cells per module" % cells,
                         "Works with the JK master BMS (BCU)"]
        p["use"] = "high-voltage battery stacks, one module per %dS battery block, with a JK master BMS (BCU)" % cells
        p["short"] = "JK high-voltage slave BMS module (BMU) for %dS battery blocks." % cells
        return p

    m = re.match(r"JK RELAY BMS (\d+)S (\d+)V (\d+)A ([\w-]+)$", raw)
    if m:
        cells, volts, amps, model = int(m.group(1)), int(m.group(2)), int(m.group(3)), m.group(4)
        p.update(sub="hv", model=model, name="JK Relay BMS %dS %dV %dA (%s)" % (cells, volts, amps, model),
                 card_title="RELAY BMS", card_big="%dS  |  %dV  |  %dA" % (cells, volts, amps),
                 chips=["%dS" % cells, "%dV" % volts, "%dA" % amps])
        p["specs"] = [("Brand", BRAND), ("Model", model), ("Type", "Relay BMS"), ("Series", "%dS" % cells),
                      ("Voltage", "%d V" % volts), ("Current", "%d A" % amps)]
        p["features"] = ["Relay-switched BMS", "%dS / %d V packs" % (cells, volts), "%d A rated" % amps]
        p["use"] = "%dS (%d V) battery packs up to %d A" % (cells, volts, amps)
        p["short"] = "JK relay BMS for %dS %d V packs, %d A." % (cells, volts, amps)
        return p

    m = re.match(r"JK SOC DISPLAY ([\d.]+) INCH ?(.*)$", raw)
    if m:
        size, variant = m.group(1), m.group(2).strip()
        model = "SOC Display %s inch%s" % (size, " " + variant if variant else "")
        p.update(sub="accessory", model=model, name="JK BMS %s" % model,
                 card_title="BMS SOC DISPLAY", card_big='%s"%s' % (size, "  |  " + variant if variant else ""),
                 chips=['%s inch' % size, "LCD"] + ([variant] if variant else []))
        p["specs"] = [("Brand", BRAND), ("Model", model), ("Type", "Battery SOC display for JK BMS"),
                      ("Screen", "%s inch LCD" % size)] + ([("Version", variant)] if variant else [])
        p["features"] = ["%s inch LCD screen" % size, "Shows battery state of charge", "For JK BMS"]
        p["use"] = "showing the battery state of charge from a JK BMS on the pack or the vehicle"
        p["short"] = "%s inch LCD state-of-charge display for JK BMS." % size
        return p

    m = re.match(r"JK BALANCER CONNECT BOARD (\d+)S (\d+)AMP$", raw)
    if m:
        cells, amps = map(int, m.groups())
        model = "Balancer Connect Board %dS %dA" % (cells, amps)
        p.update(sub="accessory", model=model, name="JK %s" % model,
                 card_title="BALANCER CONNECT BOARD", card_big="%dS  |  %dA" % (cells, amps),
                 chips=["%dS" % cells, "%dA" % amps])
        p["specs"] = [("Brand", BRAND), ("Model", model), ("Type", "Balancer connection board"),
                      ("Series", "Up to %dS" % cells), ("Rating", "%d A" % amps)]
        p["features"] = ["Connection board for JK balancers", "Up to %dS" % cells, "%d A rated" % amps]
        p["use"] = "wiring a JK active balancer to packs up to %dS" % cells
        p["short"] = "JK balancer connection board, up to %dS, %d A." % (cells, amps)
        return p

    if raw.startswith("JK PARALLEL MOUDEL"):
        model = raw.split()[-1]
        p.update(sub="accessory", model=model, name="JK BMS Parallel Module (%s)" % model,
                 card_title="BMS PARALLEL MODULE", card_big=model, chips=["Parallel module", "5A"])
        p["specs"] = [("Brand", BRAND), ("Model", model), ("Type", "Parallel module for JK BMS"), ("Rating", "5 A")]
        p["features"] = ["Lets battery packs with JK BMS run in parallel", "5 A rated"]
        p["use"] = "connecting several battery packs that each have a JK BMS in parallel"
        p["short"] = "JK parallel module (%s) for running JK BMS packs in parallel." % model
        return p

    m = re.match(r"JK SMART ACTIVE BALANCER (\d+)S (\d+)A (\w+)$", raw)
    if m:
        cells, amps, model = int(m.group(1)), int(m.group(2)), m.group(3)
        p.update(sub="balancer", model=model,
                 name="JK Smart Active Balancer %dS %dA (%s)" % (cells, amps, model),
                 card_title="SMART ACTIVE BALANCER", card_big="%sS  |  %dA" % ("2-%d" % cells if cells > 8 else cells, amps),
                 chips=["Up to %dS" % cells, "%dA balance" % amps, "Bluetooth App"])
        p["specs"] = [("Brand", BRAND), ("Model", model), ("Type", "Smart active balancer / equalizer"),
                      ("Series", "Up to %dS" % cells), ("Balance Current", "%d A" % amps)]
        p["features"] = ["Active balancing up to %d A" % amps, "For packs up to %dS" % cells,
                         "Bluetooth app monitoring", "Keeps cell voltages even for longer pack life"]
        p["use"] = "keeping the cells of a lithium pack (up to %dS) at the same voltage" % cells
        p["short"] = "JK smart active balancer, up to %dS, %d A balancing current." % (cells, amps)
        return p

    raise ValueError("unrecognised JK item: " + src["supplier_name"])


def identity(p):
    """PowerRun SKU and name for a parsed item, with no JK model code anywhere.

    The owner does not want JK's model codes (BD6A24S4PD, DZ08..., LY, V19)
    on the listing: not in the name, SKU, URL, specs or images. The SKU reads
    JK-BMS-<low>S-<high>S-<amps>A-<type>, type being SEMI (semi-smart),
    SMART (0.4-0.6 A balancing), PRO (1-2 A balancing, JK's B1A/B2A series)
    or ESS. Two items that would otherwise share a name get "(Variant B)".
    p["model"] stays as an internal key (icons, balance current); it is never
    shown."""
    code = p["model"]
    p["specs"] = [(k, v) for k, v in p["specs"] if k != "Model"]
    if p["sub"] == "smart":
        lo, hi = re.search(r"(\d+)S-(\d+)S", p["name"]).groups()
        amps = re.search(r" (\d+)A", p["name"]).group(1)
        label = re.match(r"JK (.*?) \d+S-", p["name"]).group(1)
        bal = balance_current(code.split()[0])
        bal_amps = float(bal.split()[0]) if bal else 0.0
        kind = ("SEMI" if "Semi" in label else "ESS" if "ESS" in label else
                "PRO" if bal_amps >= 1 else "SMART")
        name = "JK %s %sS-%sS %sA" % (label, lo, hi, amps)
        if kind == "PRO":
            name += " (%dA Balance)" % bal_amps
        sku = "JK-BMS-%sS-%sS-%sA-%s" % (lo, hi, amps, kind)
    elif p["sub"] == "hv":
        if "Master" in p["name"]:
            name, sku = p["name"], "JK-BMS-HV-MASTER-%sA" % re.search(r"(\d+)A", p["name"]).group(1)
        elif "Slave" in p["name"]:
            cells = re.search(r"(\d+)S", p["name"]).group(1)
            name, sku = "JK High Voltage Slave BMS %sS" % cells, "JK-BMS-HV-SLAVE-%sS" % cells
            p["card_big"] = "%sS" % cells
        else:
            cells, volts, amps = re.search(r"(\d+)S (\d+)V (\d+)A", p["name"]).groups()
            name, sku = "JK Relay BMS %sS %sV %sA" % (cells, volts, amps), "JK-BMS-RELAY-%sS-%sA" % (cells, amps)
    elif p["sub"] == "balancer":
        cells, amps = re.search(r"(\d+)S (\d+)A", p["name"]).groups()
        name, sku = "JK Smart Active Balancer %sS %sA" % (cells, amps), "JK-BAL-%sS-%sA" % (cells, amps)
        if code.startswith("DZ"):
            name, sku = name + " (Variant B)", sku + "-B"
    elif "SOC Display" in p["name"]:
        size, variant = re.search(r"([\d.]+) inch ?(.*)$", p["name"]).groups()
        usb = variant.upper() == "USB"                  # a feature, not a model code
        name = "JK BMS SOC Display %s inch%s" % (size, " USB" if usb else "")
        sku = "JK-DISPLAY-%sIN%s" % (size.replace(".", "-"), "-USB" if usb else "")
        if variant.upper() == "V19":                    # the other 4.3" screen
            name, sku = name + " (Variant B)", sku + "-B"
        p["specs"] = [(k, v) for k, v in p["specs"] if k != "Version" or usb]
        p["chips"] = [c for c in p["chips"] if c in ("LCD", "USB") or "inch" in c]
        p["card_big"] = '%s"%s' % (size, "  |  USB" if usb else "")
    elif "Connect Board" in p["name"]:
        cells, amps = re.search(r"(\d+)S (\d+)A", p["name"]).groups()
        name, sku = p["name"], "JK-BCB-%sS-%sA" % (cells, amps)
    else:                                               # parallel module
        name, sku = "JK BMS Parallel Module 5A", "JK-PARALLEL-5A"
        p["card_big"] = "5A"
        p["short"] = "JK parallel module for running battery packs with JK BMS in parallel, 5 A."
    p["name"], p["sku"] = name, sku
    return p


def finish(p):
    """Slug, price and the shared copy (SKU comes from identity())."""
    p["slug"] = re.sub(r"[^a-z0-9]+", "-", p["name"].lower()).strip("-")
    p["price"] = selling_price(p["cost"])
    p["description"] = (
        "The %s is a %s part for %s. %s\n\n"
        "Sold and shipped by PowerRun Industries with free pan-India delivery. PowerRun does not offer a "
        "separate warranty on %s parts; damaged, defective or wrong items are replaced within 7 days of "
        "delivery as per our refund policy. Not sure which model fits your pack? Send us your cell type, "
        "series count (S) and current on WhatsApp and we will help you choose."
        % (p["name"], BRAND, p["use"], " ".join(f + "." for f in p["features"]), MAKER))
    p["meta_title"] = (p["name"] + " | PowerRun")[:70]
    p["meta_description"] = ("Buy %s - %s Pan-India delivery from PowerRun." % (p["name"], p["short"]))[:160]
    p["focus_keyword"] = re.sub(r"\s*\(.*?\)", "", p["name"]).lower()
    return p


# ---------------------------------------------------------------- images
def board_icon(d, cx, cy, w):
    """Flat, clearly diagrammatic circuit-board glyph (not a product drawing)."""
    h = int(w * 0.62)
    x0, y0 = cx - w // 2, cy - h // 2
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=w // 18, fill=ORANGE_SOFT, outline=ORANGE, width=8)
    for i in range(6):                                   # pins along the top edge
        px = x0 + w * (i + 1) // 7
        d.rectangle([px - 10, y0 - 34, px + 10, y0], fill=ORANGE)
    chip_w = w // 3
    d.rounded_rectangle([cx - chip_w // 2, cy - chip_w // 3, cx + chip_w // 2, cy + chip_w // 3],
                        radius=12, fill=ORANGE)
    for k in range(-2, 3):                               # traces
        y = cy + k * h // 7
        d.line([(x0 + 30, y), (cx - chip_w // 2, y)], fill=ORANGE, width=5)
        d.line([(cx + chip_w // 2, y), (x0 + w - 30, y)], fill=ORANGE, width=5)
        d.ellipse([x0 + 22, y - 10, x0 + 42, y + 10], fill=ORANGE)
        d.ellipse([x0 + w - 42, y - 10, x0 + w - 22, y + 10], fill=ORANGE)


def screen_icon(d, cx, cy, w):
    """Flat display glyph for the SOC screens."""
    h = int(w * 0.62)
    x0, y0 = cx - w // 2, cy - h // 2
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=w // 14, fill=INK)
    d.rounded_rectangle([x0 + 40, y0 + 40, x0 + w - 40, y0 + h - 40], radius=w // 24, fill=ORANGE_SOFT)
    bx0, by0, bx1, by1 = cx - w // 4, cy - h // 6, cx + w // 4 - 30, cy + h // 6
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=14, outline=ORANGE, width=10)
    d.rectangle([bx1, cy - h // 14, bx1 + 26, cy + h // 14], fill=ORANGE)
    d.rounded_rectangle([bx0 + 20, by0 + 20, bx0 + (bx1 - bx0) * 3 // 4, by1 - 20], radius=8, fill=ORANGE)


def brand_badge(d, y):
    f = heavy(64)
    w = d.textlength(BRAND, font=f) + 90
    d.rounded_rectangle([S - 80 - w, y, S - 80, y + 120], radius=24, fill=INK)
    d.text((S - 80 - w / 2, y + 60), BRAND, font=f, fill=WHITE, anchor="mm")


def footnote(d, illustration=True):
    text = "Sold & shipped by PowerRun Industries."
    if illustration:
        text = "Illustration - not a product photo.  " + text
    d.text((S // 2, 1935), text, font=regular(30), fill=GREY, anchor="mm")


def card_main(p):
    img = Image.new("RGBA", (S, S), WHITE)
    d = ImageDraw.Draw(img)
    header(img)
    brand_badge(d, 80)
    d.text((S // 2, 380), p["card_title"], font=heavy(92), fill=INK, anchor="mm")
    (screen_icon if "SOC" in p["model"] else board_icon)(d, S // 2, 760, 820)
    f = heavy(150 if len(p["card_big"]) < 16 else 110)
    d.text((S // 2, 1210), p["card_big"], font=f, fill=ORANGE, anchor="mm")
    d.text((S // 2, 1350), "SKU: " + p["sku"], font=bold(54), fill=INK, anchor="mm")
    lx.chips_centred(d, 1480, p["chips"][:4])
    d.rectangle([0, 1640, S, 1860], fill=(246, 246, 246))
    d.text((S // 2, 1715), "Free pan-India delivery  •  7-day replacement", font=bold(46), fill=INK, anchor="mm")
    d.text((S // 2, 1790), "Help choosing the right model on WhatsApp", font=regular(38), fill=GREY, anchor="mm")
    footnote(d)
    return img


def card_specs(p):
    img = Image.new("RGBA", (S, S), WHITE)
    d = ImageDraw.Draw(img)
    header(img)
    brand_badge(d, 80)
    d.text((S // 2, 360), "SPECIFICATIONS", font=heavy(96), fill=INK, anchor="mm")
    d.text((S // 2, 455), p["name"], font=bold(44 if len(p["name"]) < 52 else 36), fill=GREY, anchor="mm")
    rows = p["specs"]
    step = min(150, 1300 // len(rows))
    y = 540
    for label, value in rows:
        d.rounded_rectangle([140, y, S - 140, y + step - 20], radius=22, fill=(246, 246, 246))
        d.rounded_rectangle([140, y, 160, y + step - 20], radius=10, fill=ORANGE)
        mid = y + (step - 20) // 2
        d.text((210, mid), label, font=regular(42), fill=GREY, anchor="lm")
        d.text((S - 190, mid), value, font=bold(46 if len(value) < 30 else 36), fill=INK, anchor="rm")
        y += step
    footnote(d, illustration=False)
    return img


def photo(src):
    """Supplier photo (URL, or a retouched file under private/) -> square
    JPEG on white, metadata dropped."""
    if src.startswith("http"):
        req = urllib.request.Request(urllib.parse.quote(src, safe=":/"), headers={"User-Agent": "Mozilla/5.0"})
        im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=60).read()))
    else:
        im = Image.open(os.path.join(ROOT, src))
    im = im.convert("RGBA")
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), WHITE)
    sq.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return sq


def render(p):
    out = os.path.join(OUT_ROOT, p["slug"])
    os.makedirs(out, exist_ok=True)
    for old in os.listdir(out):
        os.remove(os.path.join(out, old))
    slides = [("1-main.jpg", card_main(p))] if not p.get("photo") else [("0-photo.jpg", photo(p["photo"]))]
    slides.append(("2-specifications.jpg", card_specs(p)))
    files = []
    for name, img in slides:
        path = os.path.join(out, name)
        img.convert("RGB").resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS).save(path, quality=88, optimize=True)
        files.append(path)
    return files


# ---------------------------------------------------------------- publish
def upload(path, data, content_type="image/jpeg"):
    import pr_data as pd
    key = pd.service_key()
    req = urllib.request.Request(
        "{}/storage/v1/object/{}/{}".format(pd.BASE, BUCKET, urllib.parse.quote(path)),
        data=data, method="POST",
        headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": content_type,
                 "cache-control": "max-age=31536000", "x-upsert": "true"})
    urllib.request.urlopen(req, timeout=120).read()
    return "{}/storage/v1/object/public/{}/{}".format(pd.BASE, BUCKET, urllib.parse.quote(path))


def upsert_category(pd, row):
    found = pd.rest("categories", "select=id&slug=eq." + row["slug"])
    if found:
        pd.rest("categories", "id=eq." + found[0]["id"], "PATCH", row)
        return found[0]["id"]
    return pd.rest("categories", "", "POST", dict(row, is_active=True), prefer="return=representation")[0]["id"]


def publish(products):
    import pr_data as pd
    parent_id = upsert_category(pd, PARENT)
    sub_ids = {k: upsert_category(pd, {"name": n, "slug": s, "sort_order": o, "parent_id": parent_id})
               for k, (n, s, o) in SUBS.items()}
    for i, p in enumerate(products):
        row = {
            "name": p["name"], "slug": p["slug"], "sku": p["sku"], "brand": BRAND,
            "category_id": parent_id, "subcategory_id": sub_ids[p["sub"]],
            "short_description": p["short"], "description": p["description"],
            "price": p["price"], "mrp": p["price"], "compare_price": None,
            "gst_rate": 18, "price_includes_gst": True, "hsn_code": "8507",
            "stock": 5, "availability": "in_stock", "warranty": WARRANTY,
            "specifications": [{"label": k, "value": v} for k, v in p["specs"]],
            "features": p["features"], "is_active": True, "is_featured": False, "is_new": True,
            "sort_order": SORT_BASE + i, "meta_title": p["meta_title"],
            "meta_description": p["meta_description"], "focus_keyword": p["focus_keyword"],
            "image_alt": p["name"],
        }
        found = pd.rest("products", "select=id&sku=eq." + urllib.parse.quote(p["sku"]))
        if found:
            pid = found[0]["id"]
            pd.rest("products", "id=eq." + pid, "PATCH", row)
        else:
            pid = pd.rest("products", "", "POST", row, prefer="return=representation")[0]["id"]
        pd.rest("product_images", "product_id=eq." + pid, "DELETE")
        for n, path in enumerate(p["files"]):
            storage_path = "{}/{}/{}".format(STORAGE, p["slug"], os.path.basename(path))
            with open(path, "rb") as f:
                url = upload(storage_path, f.read())
            pd.rest("product_images", "", "POST", {
                "product_id": pid, "image_url": url, "storage_path": storage_path, "sort_order": n,
                "alt_text": p["name"] + (" - specifications" if n else "")})
        print("  live  {:<26} Rs {:>7,}  {}".format(p["sku"], p["price"], p["name"]))


def main():
    rows = json.load(io.open(SOURCE, encoding="utf-8"))
    products, seen = [], set()
    for src in rows:
        p = finish(identity(parse(src)))
        if p["sku"] in seen:
            raise SystemExit("duplicate SKU " + p["sku"])
        seen.add(p["sku"])
        products.append(p)
    order = list(SUBS)
    products.sort(key=lambda p: (order.index(p["sub"]), p["price"]))
    for p in products:
        p["files"] = render(p)
    print("rendered", len(products), "products ->", os.path.relpath(OUT_ROOT, ROOT))
    if "--publish" in sys.argv:
        publish(products)
    else:
        for p in products:
            print("  {:<26} Rs {:>7,}  (cost {:>9,.2f})  {}".format(p["sku"], p["price"], p["cost"], p["name"]))


if __name__ == "__main__":
    main()
