"""
JBD BMS resale listing - the top 20 in-stock JBD items, same pipeline as JK.

    python scripts/listing_jbdbms.py            render images only (photos/listing/jbd-bms/)
    python scripts/listing_jbdbms.py --publish  render, upload and upsert to the live catalogue

Source  private/jbd_bms_source.json  (gitignored: supplier name, page, MOQ and
        price incl. GST; "photo" is a supplier photo URL, or a copy under
        private/ with the supplier's watermark removed, both with the
        supplier's permission; rows without one get spec cards)

Cards, pricing (supplier price x 1.20, ending in 9), categories, warranty
wording and publishing come from listing_jkbms.py. As with JK, no supplier
model code (ZP16S011, SP24S007 ...) appears in names, SKUs, URLs or specs;
everything shown is read from the item's type, series count and current.
"""
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import listing_jkbms as base  # noqa: E402

base.BRAND = "JBD"
base.MAKER = "JBD"
base.STORAGE = "jbd-bms"
base.OUT_ROOT = os.path.join(base.ROOT, "photos", "listing", "jbd-bms")
base.SORT_BASE = 200
base.SUBS = {
    "smart": ("Smart BMS", "jk-smart-bms", 1),
    "lfp": ("LiFePO4 BMS", "lifepo4-bms", 5),
    "nmc": ("Li-ion (NMC) BMS", "nmc-bms", 6),
    "balancer": ("Active Balancers", "active-balancers", 3),
    "accessory": ("BMS Displays & Accessories", "bms-displays-accessories", 4),
}
SOURCE = os.path.join(base.ROOT, "private", "jbd_bms_source.json")
CELL_V = {"lfp": 3.2, "nmc": 3.7}
USE = {  # what a series count is typically used for (nominal pack voltage)
    ("lfp", 4): "12 V inverter and solar batteries", ("lfp", 8): "24 V inverter and solar batteries",
    ("lfp", 16): "48 V e-rickshaw, inverter and solar batteries", ("lfp", 20): "60-64 V e-scooter batteries",
    ("nmc", 13): "48 V e-bike and e-scooter batteries", ("nmc", 16): "60 V e-scooter batteries",
    ("nmc", 20): "72 V e-scooter and e-bike batteries",
}


def parse(src):
    raw = re.sub(r"\s+", " ", src["supplier_name"].upper()).strip()
    p = {"cost": src["supplier_price_incl_gst"], "photo": src.get("photo"), "chips": [], "features": []}

    m = re.match(r"JBD (?:BMS (LFP|NMC)|(LFP) BMS) (\d+)S (\d+)A \w+$", raw)
    if m:
        chem = (m.group(1) or m.group(2)).lower()
        cells, amps = int(m.group(3)), int(m.group(4))
        volts = cells * CELL_V[chem]
        cname = "LiFePO4" if chem == "lfp" else "Li-ion (NMC)"
        use = USE.get((chem, cells), "%dS %s packs" % (cells, cname))
        p.update(sub=chem, model="%s-%dS-%dA" % (chem, cells, amps),
                 name="JBD %s BMS %dS %dA" % (cname, cells, amps),
                 sku="JBD-BMS-%s-%dS-%dA" % (chem.upper(), cells, amps),
                 card_title="%s BMS" % ("LiFePO4" if chem == "lfp" else "LI-ION (NMC)"),
                 card_big="%dS  |  %dA" % (cells, amps),
                 chips=["%dS" % cells, "%dA" % amps, "%.1fV pack" % volts, cname.split()[0]])
        p["specs"] = [("Brand", "JBD"), ("Type", "Standard BMS (protection board)"),
                      ("Cell chemistry", "%s (%.1f V cells)" % (cname, CELL_V[chem])),
                      ("Series (cell count)", "%dS" % cells), ("Nominal pack voltage", "%.1f V" % volts),
                      ("Continuous Discharge Current", "%d A" % amps)]
        p["features"] = ["For %dS %s packs (%.1f V)" % (cells, cname, volts), "%d A continuous discharge" % amps,
                         "Over-charge, over-discharge, over-current and short-circuit protection"]
        p["use"] = "%dS %s battery packs (%.1f V nominal) - typically %s - drawing up to %d A" % (
            cells, cname, volts, use, amps)
        p["short"] = "JBD %s BMS for %dS packs (%.1f V), %d A continuous." % (cname, cells, volts, amps)
        return p

    m = re.match(r"JBD (SEMI SMART|SMART)( ESS)? BMS (\d+)(?:-(\d+))?S (\d+)A \w+$", raw)
    if m:
        semi, ess = m.group(1) == "SEMI SMART", bool(m.group(2))
        lo, hi, amps = int(m.group(3)), int(m.group(4) or m.group(3)), int(m.group(5))
        kind = "Semi-Smart" if semi else "Smart"
        label = "%s %sBMS" % (kind, "ESS " if ess else "")
        rng = "%dS-%dS" % (lo, hi) if hi != lo else "%dS" % lo
        p.update(sub="smart", model="smart-%s-%dA" % (rng, amps),
                 name="JBD %s %s %dA" % (label, rng, amps),
                 sku="JBD-BMS-%s-%dA-%s" % (rng, amps, "SEMI" if semi else "ESS" if ess else "SMART"),
                 card_title=label.upper(), card_big="%s  |  %dA" % (rng, amps),
                 chips=[rng, "%dA" % amps, "UART"] + (["ESS"] if ess else []))
        p["specs"] = [("Brand", "JBD"), ("Type", label), ("Series (cell count)", rng.replace("-", " to ")),
                      ("Continuous Discharge Current", "%d A" % amps), ("Communication", "UART")]
        p["features"] = ["%s with UART communication" % label, "For %s lithium packs" % rng,
                         "%d A continuous discharge" % amps,
                         "Bluetooth monitoring with the JBD Bluetooth module"]
        if ess:
            p["features"].append("Made for ESS / inverter battery packs")
            p["specs"].append(("Application", "ESS / inverter battery packs"))
        p["use"] = "%s lithium battery packs drawing up to %d A continuously" % (rng, amps)
        p["short"] = "JBD %s for %s lithium packs, %d A continuous, UART communication." % (label, rng, amps)
        return p

    m = re.match(r"JBD SMART ACTIVE BALANCER (\d+)S (\d+)A \w+$", raw)
    if m:
        cells, amps = map(int, m.groups())
        p.update(sub="balancer", model="bal-%dS-%dA" % (cells, amps),
                 name="JBD Smart Active Balancer %dS %dA" % (cells, amps), sku="JBD-BAL-%dS-%dA" % (cells, amps),
                 card_title="SMART ACTIVE BALANCER", card_big="%dS  |  %dA" % (cells, amps),
                 chips=["%dS" % cells, "%dA balance" % amps])
        p["specs"] = [("Brand", "JBD"), ("Type", "Smart active balancer / equalizer"),
                      ("Series", "%dS" % cells), ("Balance Current", "%d A" % amps)]
        p["features"] = ["Active balancing up to %d A" % amps, "For %dS packs" % cells,
                         "Keeps cell voltages even for longer pack life"]
        p["use"] = "keeping the cells of a %dS lithium pack at the same voltage" % cells
        p["short"] = "JBD smart active balancer for %dS packs, %d A balancing current." % (cells, amps)
        return p

    if raw == "JBD BLUETOOTH":
        p.update(sub="accessory", model="bt", name="JBD Bluetooth Module for Smart BMS", sku="JBD-BT-MODULE",
                 card_title="BLUETOOTH MODULE", card_big="UART > BT", chips=["Bluetooth", "UART"])
        p["specs"] = [("Brand", "JBD"), ("Type", "Bluetooth module for JBD BMS"), ("Connection", "UART port")]
        p["features"] = ["Plugs into the UART port of a JBD smart / semi-smart BMS",
                         "Read the BMS on a phone app over Bluetooth"]
        p["use"] = "reading a JBD smart or semi-smart BMS on a phone over Bluetooth"
        p["short"] = "Bluetooth module for JBD smart and semi-smart BMS (UART port)."
        return p

    raise ValueError("unrecognised JBD item: " + src["supplier_name"])


def main():
    rows = json.load(io.open(SOURCE, encoding="utf-8"))
    products, seen = [], set()
    for src in rows:
        p = base.finish(parse(src))
        if p["sku"] in seen:
            raise SystemExit("duplicate SKU " + p["sku"])
        seen.add(p["sku"])
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
            print("  {:<26} Rs {:>7,}  (cost {:>9,.2f})  {}".format(p["sku"], p["price"], p["cost"], p["name"]))


if __name__ == "__main__":
    main()
