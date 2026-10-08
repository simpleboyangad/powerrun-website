"""
Daly BMS resale listing - the top 20 in-stock Daly items, same pipeline as JK / JBD.

    python scripts/listing_dalybms.py            render images only (photos/listing/daly-bms/)
    python scripts/listing_dalybms.py --publish  render, upload and upsert to the live catalogue

Source  private/daly_bms_source.json  (gitignored: supplier name, page, MOQ and
        price incl. GST; "photo" is a supplier photo URL used with the
        supplier's permission; rows without one get spec cards)

Cards, pricing, categories, warranty wording and publishing come from
listing_jkbms.py; the typical-use table comes from listing_jbdbms.py.
Supplier model codes (R16L-KF15 ...) are left out of names, SKUs and specs.
"""
import io
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import listing_jkbms as base  # noqa: E402
from listing_jbdbms import CELL_V, USE  # noqa: E402  (importing it sets JBD globals; reset below)

base.BRAND = "Daly"
base.MAKER = "Daly"
base.STORAGE = "daly-bms"
base.OUT_ROOT = os.path.join(base.ROOT, "photos", "listing", "daly-bms")
base.SORT_BASE = 300
base.SUBS = {
    "smart": ("Smart BMS", "jk-smart-bms", 1),
    "lfp": ("LiFePO4 BMS", "lifepo4-bms", 5),
    "nmc": ("Li-ion (NMC) BMS", "nmc-bms", 6),
    "balancer": ("Active Balancers", "active-balancers", 3),
    "accessory": ("BMS Displays & Accessories", "bms-displays-accessories", 4),
}
SOURCE = os.path.join(base.ROOT, "private", "daly_bms_source.json")
CNAME = {"lfp": "LiFePO4", "nmc": "Li-ion (NMC)"}


def standard(p, chem, cells, amps, smart):
    volts = cells * CELL_V[chem]
    cname = CNAME[chem]
    use = USE.get((chem, cells), "%dS %s packs" % (cells, cname))
    kind = "Smart %s BMS" % cname if smart else "%s BMS" % cname
    p.update(sub="smart" if smart else chem, model="%s-%dS-%dA" % (chem, cells, amps),
             name="Daly %s %dS %dA" % (kind, cells, amps),
             sku="DALY-BMS-%s-%dS-%dA%s" % (chem.upper(), cells, amps, "-SMART" if smart else ""),
             card_title=("SMART " if smart else "") + ("LiFePO4 BMS" if chem == "lfp" else "LI-ION (NMC) BMS"),
             card_big="%dS  |  %dA" % (cells, amps),
             chips=["%dS" % cells, "%dA" % amps, "%.1fV pack" % volts] + (["UART / CAN"] if smart else [cname.split()[0]]))
    p["specs"] = [("Brand", "Daly"), ("Type", "Smart BMS" if smart else "Standard BMS (protection board)"),
                  ("Cell chemistry", "%s (%.1f V cells)" % (cname, CELL_V[chem])),
                  ("Series (cell count)", "%dS" % cells), ("Nominal pack voltage", "%.1f V" % volts),
                  ("Continuous Discharge Current", "%d A" % amps)]
    p["features"] = ["For %dS %s packs (%.1f V)" % (cells, cname, volts), "%d A continuous discharge" % amps,
                     "Over-charge, over-discharge, over-current and short-circuit protection"]
    if smart:
        p["specs"].append(("Communication", "UART, CAN / RS485"))
        p["features"] += ["UART and CAN / RS485 ports", "Bluetooth monitoring with the Daly Bluetooth module"]
    p["use"] = "%dS %s battery packs (%.1f V nominal) - typically %s - drawing up to %d A" % (
        cells, cname, volts, use, amps)
    p["short"] = "Daly %s for %dS packs (%.1f V), %d A continuous." % (kind, cells, volts, amps)
    return p


def parse(src):
    raw = re.sub(r"\s+", " ", src["supplier_name"].upper()).strip()
    p = {"cost": src["supplier_price_incl_gst"], "photo": src.get("photo"), "chips": [], "features": []}

    m = re.match(r"DALY (SMART )?BMS (LFP|NMC) (\d+)S (\d+)A(?:MP)?$", raw)
    if m:
        return standard(p, m.group(2).lower(), int(m.group(3)), int(m.group(4)), bool(m.group(1)))

    m = re.match(r"DALY BLACK SMART BMS (\d+)-(\d+)S (\d+)A$", raw)
    if m:
        lo, hi, amps = map(int, m.groups())
        rng = "%dS-%dS" % (lo, hi)
        p.update(sub="smart", model="black-%s-%dA" % (rng, amps), name="Daly Smart BMS %s %dA (Black)" % (rng, amps),
                 sku="DALY-BMS-%s-%dA-BLACK" % (rng, amps), card_title="SMART BMS (BLACK)",
                 card_big="%s  |  %dA" % (rng, amps), chips=[rng, "%dA" % amps, "Smart"])
        p["specs"] = [("Brand", "Daly"), ("Type", "Smart BMS (Black series)"),
                      ("Series (cell count)", "%dS to %dS" % (lo, hi)), ("Continuous Discharge Current", "%d A" % amps)]
        p["features"] = ["Smart BMS for %s lithium packs" % rng, "%d A continuous discharge" % amps,
                         "Over-charge, over-discharge, over-current and short-circuit protection"]
        p["use"] = "%s lithium battery packs drawing up to %d A continuously" % (rng, amps)
        p["short"] = "Daly smart BMS (Black series) for %s lithium packs, %d A continuous." % (rng, amps)
        return p

    m = re.match(r"DALY SMART ESS BMS (\d+)S (\d+)A \S+$", raw)
    if m:
        cells, amps = map(int, m.groups())
        p.update(sub="smart", model="ess-%dS-%dA" % (cells, amps), name="Daly Smart ESS BMS %dS %dA" % (cells, amps),
                 sku="DALY-BMS-ESS-%dS-%dA" % (cells, amps), card_title="SMART ESS BMS",
                 card_big="%dS  |  %dA" % (cells, amps), chips=["%dS" % cells, "%dA" % amps, "ESS"])
        p["specs"] = [("Brand", "Daly"), ("Type", "Smart ESS BMS"), ("Series (cell count)", "%dS" % cells),
                      ("Continuous Discharge Current", "%d A" % amps), ("Application", "ESS / inverter battery packs")]
        p["features"] = ["Made for ESS / inverter battery packs", "For %dS packs" % cells,
                         "%d A continuous discharge" % amps]
        p["use"] = "%dS ESS / inverter battery packs drawing up to %d A" % (cells, amps)
        p["short"] = "Daly smart ESS BMS for %dS inverter battery packs, %d A." % (cells, amps)
        return p

    m = re.match(r"DALY SMART ACTIVE BALANCER (\d+)S (\d+)A$", raw)
    if m:
        cells, amps = map(int, m.groups())
        p.update(sub="balancer", model="bal-%dS-%dA" % (cells, amps),
                 name="Daly Smart Active Balancer %dS %dA" % (cells, amps), sku="DALY-BAL-%dS-%dA" % (cells, amps),
                 card_title="SMART ACTIVE BALANCER", card_big="%dS  |  %dA" % (cells, amps),
                 chips=["%dS" % cells, "%dA balance" % amps])
        p["specs"] = [("Brand", "Daly"), ("Type", "Smart active balancer"), ("Series", "%dS" % cells),
                      ("Balance Current", "%d A" % amps)]
        p["features"] = ["Active balancing up to %d A" % amps, "For %dS packs" % cells,
                         "Keeps cell voltages even for longer pack life"]
        p["use"] = "keeping the cells of a %dS lithium pack at the same voltage" % cells
        p["short"] = "Daly smart active balancer for %dS packs, %d A balancing current." % (cells, amps)
        return p

    if raw == "DALY BLUETOOTH":
        p.update(sub="accessory", model="bt", name="Daly Bluetooth Module for Smart BMS", sku="DALY-BT-MODULE",
                 card_title="BLUETOOTH MODULE", card_big="BMS > BT", chips=["Bluetooth"])
        p["specs"] = [("Brand", "Daly"), ("Type", "Bluetooth module for Daly smart BMS")]
        p["features"] = ["Plugs into a Daly smart BMS", "Read the BMS on a phone app over Bluetooth"]
        p["use"] = "reading a Daly smart BMS on a phone over Bluetooth"
        p["short"] = "Bluetooth module for Daly smart BMS."
        return p

    raise ValueError("unrecognised Daly item: " + src["supplier_name"])


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
            print("  {:<28} Rs {:>7,}  (cost {:>9,.2f})  {}".format(p["sku"], p["price"], p["cost"], p["name"]))


if __name__ == "__main__":
    main()
