"""
Battery charger resale listing - every in-stock lithium and lead-acid charger.

    python scripts/listing_chargers.py            render images only (photos/listing/chargers/)
    python scripts/listing_chargers.py --publish  render, upload and upsert to the live catalogue

Source  private/charger_source.json  (gitignored: supplier name, brand, page,
        MOQ and price incl. GST; "photo" is a supplier photo URL, or a copy
        under private/ with the supplier's watermark removed, both with the
        supplier's permission; rows without one get spec cards)

Each charger keeps its maker's brand (LEAF, GRAPHY, SUN6 ...); unbranded
imports are "Generic". Specs come from the product name only: the supplier's
"battery voltage" field is wrong on several lead-acid listings. The battery a
lithium charger suits follows from its charging voltage (3.65 V per LiFePO4
cell, 4.2 V per Li-ion cell). Cards, pricing and publishing come from
listing_jkbms.py, which is published once per brand.
"""
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import listing_jkbms as base  # noqa: E402
from listing_erickshaw import ORANGE, ORANGE_SOFT, INK, WHITE  # noqa: E402

base.STORAGE = "chargers"
base.OUT_ROOT = os.path.join(base.ROOT, "photos", "listing", "chargers")
base.PARENT = {
    "name": "Battery Chargers", "slug": "battery-chargers", "sort_order": 7,
    "description": "Lithium (LiFePO4 and Li-ion) and lead-acid battery chargers for e-rickshaws, e-scooters "
                   "and battery packs.",
    "meta_title": "Lithium & Lead-Acid Battery Chargers | E-Rickshaw | PowerRun",
    "meta_description": "Buy LiFePO4 and Li-ion chargers (29.2 V to 73 V, up to 25 A) and 60 V / 72 V lead-acid "
                        "chargers for e-rickshaws and e-scooters. Pan-India delivery from PowerRun.",
    "focus_keyword": "e rickshaw battery charger",
}
base.SUBS = {
    "lithium": ("Lithium Battery Chargers", "lithium-chargers", 1),
    "lead": ("Lead-Acid Battery Chargers", "lead-acid-chargers", 2),
}
SOURCE = os.path.join(base.ROOT, "private", "charger_source.json")
SORT_BASE = 500
BRANDS = {"LEAF": "LEAF", "GRAPHY": "GRAPHY", "SUN6": "SUN6", "QT7 PULSE": "QT7 Pulse", "ELOW9": "ELOW9"}
# charging voltage -> (cells, chemistry, nominal pack voltage, typical use)
LITHIUM = {
    "29.2": (8, "LiFePO4", 25.6, "24 V LiFePO4 batteries"),
    "42": (10, "Li-ion", 37.0, "36 V Li-ion e-bike and e-scooter batteries"),
    "54.6": (13, "Li-ion", 48.1, "48 V Li-ion e-bike and e-scooter batteries"),
    "58.4": (16, "LiFePO4", 51.2, "48 V / 51.2 V LiFePO4 e-rickshaw batteries"),
    "67.2": (16, "Li-ion", 59.2, "60 V Li-ion e-scooter batteries"),
    "69.4": (19, "LiFePO4", 60.8, "60 V LiFePO4 e-scooter batteries"),
    "73": (20, "LiFePO4", 64.0, "64 V LiFePO4 e-scooter batteries"),
}


def charger_icon(d, cx, cy, w):
    """Flat charger glyph (box, lightning bolt, cable) replacing the board icon."""
    h = int(w * 0.5)
    x0, y0 = cx - w // 2, cy - h // 2
    d.rounded_rectangle([x0, y0, x0 + int(w * 0.7), y0 + h], radius=w // 16, fill=ORANGE_SOFT, outline=ORANGE, width=8)
    bx, by = x0 + int(w * 0.35), cy
    d.polygon([(bx + 20, by - 110), (bx - 60, by + 15), (bx - 5, by + 15), (bx - 25, by + 110),
               (bx + 60, by - 15), (bx + 5, by - 15)], fill=ORANGE)
    d.line([(x0 + int(w * 0.7), cy), (x0 + w, cy)], fill=INK, width=30)
    d.rounded_rectangle([x0 + w - 10, cy - 45, x0 + w + 60, cy + 45], radius=12, fill=INK)
    d.rectangle([x0 + w + 60, cy - 30, x0 + w + 90, cy - 15], fill=WHITE)


base.board_icon = charger_icon


def brand_of(src):
    raw = src["supplier_name"].upper()
    for key, name in BRANDS.items():
        if key in raw or key == (src.get("supplier_brand") or "").upper():
            return name
    return "Generic"


def parse(src):
    raw = re.sub(r"[\[\]]", " ", re.sub(r"\s+", " ", src["supplier_name"].upper())).strip()
    m = re.search(r"(\d+(?:\.\d+)?)V\s*\+?\s*(\d+(?:\.\d+)?)A", raw)
    volts, amps = m.group(1), m.group(2)
    brand = brand_of(src)
    lead = "LEAD" in (src.get("supplier_category") or "").upper()
    waterproof = "WATERPROOF" in raw
    p = {"cost": src["supplier_price_incl_gst"], "photo": src.get("photo"), "brand": brand, "model": "chg"}
    who = "" if brand == "Generic" else brand + " "
    if lead:
        nominal = int(volts)
        p.update(sub="lead", name="%sLead-Acid Battery Charger %dV %sA" % (who, nominal, amps),
                 sku="CHG-PB-%dV-%sA-%s" % (nominal, amps.replace(".", "_"), re.sub(r"\W+", "", brand.upper())),
                 card_title="LEAD-ACID CHARGER", card_big="%dV  |  %sA" % (nominal, amps),
                 chips=["%dV" % nominal, "%sA" % amps, "Lead-acid"])
        p["specs"] = [("Brand", brand), ("Battery type", "Lead-acid"), ("Battery voltage", "%d V (%d x 12 V)" % (nominal, nominal // 12)),
                      ("Charging current", "%s A" % amps)]
        p["features"] = ["For %d V lead-acid batteries (%d x 12 V)" % (nominal, nominal // 12), "%s A charging current" % amps]
        p["use"] = "charging %d V lead-acid e-rickshaw and e-scooter batteries (%d x 12 V)" % (nominal, nominal // 12)
        p["short"] = "%sLead-acid battery charger for %d V batteries, %s A." % (who, nominal, amps)
    else:
        key = {"29": "29.2", "42": "42"}.get(volts, volts)
        cells, chem, nominal, use = LITHIUM[key]
        erick = float(amps) >= 20
        kind = "E-Rickshaw Lithium Charger" if erick else "Lithium Battery Charger"
        p.update(sub="lithium",
                 name="%s%s %sV %sA%s" % (who, kind, key, amps, " (Waterproof)" if waterproof else ""),
                 sku="CHG-LI-%sV-%sA-%s%s" % (key.replace(".", "_"), amps, re.sub(r"\W+", "", brand.upper()),
                                              "-WP" if waterproof else ""),
                 card_title=("E-RICKSHAW " if erick else "") + "LITHIUM CHARGER", card_big="%sV  |  %sA" % (key, amps),
                 chips=["%sV" % key, "%sA" % amps, "%dS %s" % (cells, chem)] + (["Waterproof"] if waterproof else []))
        p["specs"] = [("Brand", brand), ("Battery type", chem), ("Charging voltage", "%s V" % key),
                      ("Charging current", "%s A" % amps),
                      ("Suits", "%dS %s packs (%.1f V nominal)" % (cells, chem, nominal))]
        if waterproof:
            p["specs"].append(("Body", "Waterproof"))
        p["features"] = ["Charges %dS %s packs (%.1f V nominal) to %s V" % (cells, chem, nominal, key),
                         "%s A charging current" % amps] + (["Waterproof body"] if waterproof else [])
        p["use"] = "charging %s (%dS %s, %.1f V nominal)" % (use, cells, chem, nominal)
        p["short"] = "%s%s for %dS %s packs (%.1f V), %s V %s A%s." % (
            who, kind.lower().replace("e-rickshaw", "e-rickshaw"), cells, chem, nominal, key, amps,
            ", waterproof" if waterproof else "")
    return p


def finish(p):
    base.BRAND = p["brand"]
    p = base.finish(p)
    p["description"] = (
        "The %s is for %s. %s\n\n"
        "Check that the charger matches your battery's voltage and chemistry before use - a charger for the "
        "wrong chemistry or cell count can damage the battery. Sold and shipped by PowerRun Industries with "
        "free pan-India delivery. PowerRun does not offer a separate warranty on chargers; damaged, defective "
        "or wrong items are replaced within 7 days of delivery as per our refund policy. Not sure which one "
        "fits? Send us your battery details on WhatsApp."
        % (p["name"], p["use"], " ".join(f + "." for f in p["features"])))
    return p


def main():
    rows = json.load(io.open(SOURCE, encoding="utf-8"))
    products, seen = [], set()
    for src in rows:
        p = finish(parse(src))
        if p["sku"] in seen:
            raise SystemExit("duplicate SKU " + p["sku"])
        seen.add(p["sku"])
        p["moq"] = src.get("supplier_moq")
        products.append(p)
    order = list(base.SUBS)
    products.sort(key=lambda p: (order.index(p["sub"]), p["price"]))
    for p in products:
        base.BRAND = p["brand"]                         # brand badge on the cards
        p["files"] = base.render(p)
    print("rendered", len(products), "products ->", os.path.relpath(base.OUT_ROOT, base.ROOT))
    if "--publish" in sys.argv:
        # publish() writes the module-level BRAND on every row, so publish brand by brand
        for i, brand in enumerate(dict.fromkeys(p["brand"] for p in products)):
            base.BRAND = brand
            base.SORT_BASE = SORT_BASE + 20 * i
            base.publish([p for p in products if p["brand"] == brand])
    else:
        for p in products:
            print("  {:<28} Rs {:>6,}  (cost {:>8,.2f}, MOQ {})  {}".format(
                p["sku"], p["price"], p["cost"], p["moq"], p["name"]))


if __name__ == "__main__":
    main()
