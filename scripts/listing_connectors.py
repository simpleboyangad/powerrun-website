"""
Battery connector resale listing - the top 20 in-stock connectors and terminals.

    python scripts/listing_connectors.py            render images only (photos/listing/connectors/)
    python scripts/listing_connectors.py --publish  render, upload and upsert to the live catalogue

Source  private/connector_source.json  (gitignored: supplier name, page, MOQ and
        price incl. GST; "photo" is a supplier photo URL, or a copy under
        private/ with the supplier's watermark removed, both with the
        supplier's permission; rows without one get spec cards)

These parts carry no maker's brand, so they are listed as brand "Generic":
that keeps them off the Merchant Center feed and out of PowerRun's warranty
wording, like the resold BMS. Most cost Rs 15-150 a piece, so each listing is
a pack: the smallest of 1/2/5/10/20/50 pieces that comes to Rs 299 or more.
Cards, pricing and publishing come from listing_jkbms.py.
"""
import io
import json
import os
import re
import sys

from PIL import ImageDraw  # noqa: F401  (drawing helpers below take a Draw)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import listing_jkbms as base  # noqa: E402
from listing_erickshaw import ORANGE, ORANGE_SOFT, INK  # noqa: E402

base.BRAND = "Generic"
base.MAKER = "these"
base.STORAGE = "connectors"
base.OUT_ROOT = os.path.join(base.ROOT, "photos", "listing", "connectors")
base.SORT_BASE = 400
base.PARENT = {
    "name": "Connectors & Terminals", "slug": "battery-connectors", "sort_order": 6,
    "description": "ESS battery connectors and terminals, SB (Anderson-style) connectors, XT60, IEC and "
                   "e-rickshaw battery connectors for lithium battery packs.",
    "meta_title": "Battery Connectors & ESS Terminals | SB50, XT60 | PowerRun",
    "meta_description": "Buy ESS battery terminals, SB50 to SB350 connectors, XT60, IEC and e-rickshaw battery "
                        "connectors in handy packs. Pan-India delivery from PowerRun.",
    "focus_keyword": "battery connector",
}
base.SUBS = {
    "ess": ("ESS Connectors & Terminals", "ess-connectors", 1),
    "sb": ("SB Connectors", "sb-connectors", 2),
    "ev": ("XT, IEC & E-Rickshaw Connectors", "ev-connectors", 3),
}
SOURCE = os.path.join(base.ROOT, "private", "connector_source.json")
PACKS = (1, 2, 5, 10, 20, 50)
MIN_PACK_PRICE = 299


def plug_icon(d, cx, cy, w):
    """Flat two-pin plug glyph for the connector cards (replaces the board icon)."""
    h = int(w * 0.5)
    x0, y0 = cx - w // 2, cy - h // 2
    d.rounded_rectangle([x0, y0, x0 + int(w * 0.62), y0 + h], radius=w // 14, fill=ORANGE_SOFT, outline=ORANGE, width=8)
    for k in (0.3, 0.7):                                   # two pins
        py = y0 + int(h * k)
        d.rounded_rectangle([x0 + int(w * 0.62), py - 18, x0 + int(w * 0.86), py + 18], radius=10, fill=ORANGE)
    d.rounded_rectangle([x0 - int(w * 0.16), cy - 26, x0, cy + 26], radius=12, fill=INK)   # cable
    d.line([(x0 - int(w * 0.16), cy), (x0 - int(w * 0.34), cy)], fill=INK, width=40)


base.board_icon = plug_icon


def pack_size(cost):
    for n in PACKS:
        if cost * n * base.MARKUP >= MIN_PACK_PRICE:
            return n
    return PACKS[-1]


def colour(raw):
    for key, name in (("ORANGE+BLACK", "Orange + Black"), ("ORANGE", "Orange"), ("BLACK", "Black"),
                      ("BLK", "Black"), ("RED", "Red"), ("GREY", "Grey")):
        if key in raw:
            return name
    return ""


# name, sub, card title, card big text, specs, features, use - by supplier item
ITEMS = {
    "ESS CON 250A DUAL PORT BLACK": (
        "ESS Battery Connector 250A Dual Port", "ess", "ESS CONNECTOR", "250A",
        [("Type", "ESS battery connector, dual port"), ("Current rating", "250 A"), ("Colour", "Black")],
        ["250 A rated", "Dual-port ESS connector", "For ESS / inverter battery racks"],
        "connecting ESS and inverter battery packs at up to 250 A"),
    "CONNECTOR TERMINAL 125A ORANGE": (
        "ESS Battery Connector Terminal 125A", "ess", "ESS CONNECTOR TERMINAL", "125A",
        [("Type", "ESS battery connector terminal (plug + socket)"), ("Current rating", "125 A"), ("Colour", "Orange")],
        ["125 A rated", "Plug and panel socket", "For ESS / inverter battery packs"],
        "panel-mount power connections on ESS and inverter battery packs up to 125 A"),
    "ESS TERMINAL C-200A RED": (
        "ESS Terminal 200A", "ess", "ESS TERMINAL", "200A",
        [("Type", "ESS battery terminal with cover, gasket and screws"), ("Current rating", "200 A"), ("Colour", "Red")],
        ["200 A rated", "Comes with cover, gasket and mounting screws"],
        "battery box terminals on ESS and inverter battery packs up to 200 A"),
    "ESS TERMINAL C-200A BLK": (
        "ESS Terminal 200A", "ess", "ESS TERMINAL", "200A",
        [("Type", "ESS battery terminal with cover, gasket and screws"), ("Current rating", "200 A"), ("Colour", "Black")],
        ["200 A rated", "Comes with cover, gasket and mounting screws"],
        "battery box terminals on ESS and inverter battery packs up to 200 A"),
    "ESS CONNECTOR (SC35-6) WITH 4AWG WIRE LENGTH 200MM(RED)": (
        "Battery Interconnect Cable 4 AWG 200 mm, SC35-6 Lugs", "ess", "INTERCONNECT CABLE", "4AWG | 200mm",
        [("Type", "Cable with SC35-6 copper lugs on both ends"), ("Wire", "4 AWG"), ("Length", "200 mm"),
         ("Colour", "Red")],
        ["4 AWG cable", "SC35-6 lugs on both ends", "200 mm length"],
        "linking cells or battery modules inside a pack"),
    "ESS CON ORANGE+BLACK WITH 4AWG-125AMP/280MM": (
        "ESS Connector Cable 125A 4 AWG 280 mm", "ess", "ESS CONNECTOR CABLE", "125A | 280mm",
        [("Type", "ESS connector cable"), ("Current rating", "125 A"), ("Wire", "4 AWG"), ("Length", "280 mm"),
         ("Colour", "Orange + Black")],
        ["125 A rated", "4 AWG cable, 280 mm", "Orange and black ESS connectors"],
        "connecting ESS and inverter battery packs at up to 125 A"),
    "SB50-2PIN SET ONLY": (
        "SB50 Connector Contacts (2-Pin Set)", "sb", "SB50 CONTACTS", "SB50",
        [("Type", "Replacement contacts for SB50 housings, 2 per set"), ("Connector", "SB50 (Anderson-style)")],
        ["2 contacts per set", "Fits SB50 connector housings"],
        "re-pinning or building SB50 battery and charger leads"),
    "SB 50 2 PCS WITH WIRE+BRACKET": (
        "SB50 Connector Pair with Wire and Bracket", "sb", "SB50 CONNECTOR PAIR", "SB50",
        [("Type", "SB50 connector pair, pre-wired, with mounting bracket"), ("Connector", "SB50 (Anderson-style)")],
        ["Male and female pair", "Pre-wired", "Mounting bracket included"],
        "battery-to-vehicle and charger connections"),
    "SB75 CONNECTOR SET": (
        "SB75 Connector Set", "sb", "SB75 CONNECTOR", "SB75",
        [("Type", "SB75 connector set"), ("Connector", "SB75 (Anderson-style)")],
        ["SB75 housing with contacts"], "battery and charger power connections"),
    "SB120 CONNECTOR SET (GREY)": (
        "SB120 Connector Set", "sb", "SB120 CONNECTOR", "SB120",
        [("Type", "SB120 housing with 2 contacts"), ("Connector", "SB120 (Anderson-style)"), ("Colour", "Grey")],
        ["SB120 housing with 2 contacts"], "high-current battery and charger connections"),
    "SB175 CONNECTOR SET": (
        "SB175 Connector Set", "sb", "SB175 CONNECTOR", "SB175",
        [("Type", "SB175 housing with 2 contacts"), ("Connector", "SB175 (Anderson-style)")],
        ["SB175 housing with 2 contacts"], "high-current battery, inverter and charger connections"),
    "SB350 CONNECTOR SET": (
        "SB350 Connector Set", "sb", "SB350 CONNECTOR", "SB350",
        [("Type", "SB350 connector set"), ("Connector", "SB350 (Anderson-style)")],
        ["SB350 housing with contacts"], "very high-current battery and inverter connections"),
    "XT60 MALE+FEMALE": (
        "XT60 Connector Pair (Male + Female)", "ev", "XT60 PAIR", "XT60",
        [("Type", "XT60 male + female pair"), ("Connector", "XT60")],
        ["Male and female pair", "Solder-type XT60"], "small battery packs, e-bikes and chargers"),
    "XT60 MALE+FEMALE WITH 12AWG 150MM WIRE": (
        "XT60 Connector Pair with 12 AWG Wire 150 mm", "ev", "XT60 PAIR + WIRE", "XT60 | 12AWG",
        [("Type", "XT60 male + female pair, pre-wired"), ("Wire", "12 AWG"), ("Length", "150 mm")],
        ["Pre-wired with 12 AWG cable", "150 mm leads"], "small battery packs, e-bikes and chargers"),
    "CHAK OKI FEMALE SOCKET": (
        "Chakori Female Socket", "ev", "CHAKORI SOCKET", "FEMALE",
        [("Type", "Chakori-type female panel socket")],
        ["Chakori-type panel socket", "Commonly used on e-rickshaw battery packs"],
        "e-rickshaw battery and charger connections"),
    "CHAK OKI MALE 6 WIRE-L 500MM": (
        "Chakori Male Connector with 6 Wires 500 mm", "ev", "CHAKORI PLUG", "MALE | 6 WIRE",
        [("Type", "Chakori-type male plug, pre-wired"), ("Wires", "6"), ("Length", "500 mm")],
        ["Pre-wired with 6 wires", "500 mm lead", "Commonly used on e-rickshaw battery packs"],
        "e-rickshaw battery and charger connections"),
    "OKW 2 PIN FEMALE SOCKET": (
        "OKW 2-Pin Female Socket", "ev", "OKW SOCKET", "2 PIN",
        [("Type", "OKW-type 2-pin female panel socket")],
        ["2-pin panel socket"], "battery charging and power connections"),
    "OKW 2 PIN MALE WITH 2 WIRE L -500MM": (
        "OKW 2-Pin Male Connector with Wire 500 mm", "ev", "OKW PLUG", "2 PIN",
        [("Type", "OKW-type 2-pin male plug, pre-wired"), ("Wires", "2"), ("Length", "500 mm")],
        ["Pre-wired, 500 mm lead"], "battery charging and power connections"),
    "IEC MALE CONNECTOR -RUBBER CAP WITH 15CM 12AWG WIRE": (
        "IEC Male Connector with Rubber Cap and 12 AWG Wire", "ev", "IEC MALE + CAP", "12AWG",
        [("Type", "IEC male connector with rubber cap, pre-wired"), ("Wire", "12 AWG"), ("Length", "150 mm")],
        ["Rubber dust cap", "Pre-wired with 12 AWG, 150 mm"], "battery charging ports"),
    "D TYPE 2 PIN MALE SOCKET WITH 2 WIRE": (
        "D-Type 2-Pin Male Connector with Wire", "ev", "D-TYPE PLUG", "2 PIN",
        [("Type", "D-type 2-pin male connector, pre-wired"), ("Wires", "2")],
        ["Pre-wired 2-pin plug"], "battery charging and power connections"),
}


SKUS = {
    "ESS CON 250A DUAL PORT BLACK": "CON-ESS-250A-DUAL-BK",
    "CONNECTOR TERMINAL 125A ORANGE": "CON-ESS-125A-OR",
    "ESS TERMINAL C-200A RED": "CON-ESS-TERM-200A-RD",
    "ESS TERMINAL C-200A BLK": "CON-ESS-TERM-200A-BK",
    "ESS CONNECTOR (SC35-6) WITH 4AWG WIRE LENGTH 200MM(RED)": "CON-LINK-4AWG-200-RD",
    "ESS CON ORANGE+BLACK WITH 4AWG-125AMP/280MM": "CON-ESS-CABLE-125A-280",
    "SB50-2PIN SET ONLY": "CON-SB50-PINS",
    "SB 50 2 PCS WITH WIRE+BRACKET": "CON-SB50-PAIR-WIRED",
    "SB75 CONNECTOR SET": "CON-SB75",
    "SB120 CONNECTOR SET (GREY)": "CON-SB120",
    "SB175 CONNECTOR SET": "CON-SB175",
    "SB350 CONNECTOR SET": "CON-SB350",
    "XT60 MALE+FEMALE": "CON-XT60-PAIR",
    "XT60 MALE+FEMALE WITH 12AWG 150MM WIRE": "CON-XT60-PAIR-WIRED",
    "CHAK OKI FEMALE SOCKET": "CON-CHAKORI-F",
    "CHAK OKI MALE 6 WIRE-L 500MM": "CON-CHAKORI-M-6W",
    "OKW 2 PIN FEMALE SOCKET": "CON-OKW-2P-F",
    "OKW 2 PIN MALE WITH 2 WIRE L -500MM": "CON-OKW-2P-M-WIRED",
    "IEC MALE CONNECTOR -RUBBER CAP WITH 15CM 12AWG WIRE": "CON-IEC-M-12AWG",
    "D TYPE 2 PIN MALE SOCKET WITH 2 WIRE": "CON-DTYPE-2P-M-WIRED",
}


def parse(src):
    raw = re.sub(r"\s+", " ", src["supplier_name"].upper()).strip()
    name, sub, title, big, specs, features, use = ITEMS[raw]
    n = pack_size(src["supplier_price_incl_gst"])
    col = colour(raw)
    if col and col not in name and "Colour" in dict(specs):
        name += " (%s)" % col
    if n > 1:
        name += " - Pack of %d" % n
    sku = SKUS[raw] + ("-X%d" % n if n > 1 else "")
    p = {"cost": src["supplier_price_incl_gst"] * n, "photo": src.get("photo"), "sub": sub, "model": "con",
         "name": name, "sku": sku, "card_title": title, "card_big": big,
         "chips": [c for c in [big.split(" | ")[0], col, "Pack of %d" % n if n > 1 else "Single"] if c],
         "specs": [("Brand", "Generic (unbranded)")] + specs + [("Pack quantity", "%d" % n if n > 1 else "1")],
         "features": features + (["Pack of %d" % n] if n > 1 else []),
         "use": use, "pack": n}
    p["short"] = "%s%s, for %s." % (re.sub(r" - Pack of \d+", "", name), " - pack of %d" % n if n > 1 else "", use)
    return p


def finish(p):
    p = base.finish(p)
    p["description"] = (
        "%s for %s. %s\n\n"
        "These connectors carry no maker's brand. Sold and shipped by PowerRun Industries with free pan-India "
        "delivery%s. PowerRun does not offer a warranty on them; damaged, defective or wrong items are replaced "
        "within 7 days of delivery as per our refund policy. Need a different quantity or a matching cable? "
        "Ask us on WhatsApp."
        % (p["name"], p["use"], " ".join(f + "." for f in p["features"]),
           "; the price is for the whole pack of %d" % p["pack"] if p["pack"] > 1 else ""))
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
        p["files"] = base.render(p)
    print("rendered", len(products), "products ->", os.path.relpath(base.OUT_ROOT, base.ROOT))
    if "--publish" in sys.argv:
        base.publish(products)
    else:
        for p in products:
            print("  {:<40} Rs {:>6,}  (cost {:>8,.2f}, supplier MOQ {})  {}".format(
                p["sku"], p["price"], p["cost"], p["moq"], p["name"]))


if __name__ == "__main__":
    main()
