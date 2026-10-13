#!/usr/bin/env python
"""
"Sizing & fit" section for resold parts (products with a brand: BMS,
balancers, chargers, connectors).

Many of these pages differ by one number - 60 A against 80 A, Smart against
Semi-Smart, red against black - so Google sees them as near-copies and leaves
them "Crawled - currently not indexed". This section is worked out from each
product's own specifications (pack voltages for every series count it covers,
the power it can carry, cable and fuse size, charge times) plus a table that
compares it with its closest siblings, so every page answers questions only
that product can answer.

Only arithmetic on the listed specs and general wiring rules of thumb - no
claim the product data does not support. Used by scripts/seo_build.py.
"""
import html
import re
import urllib.parse

# per-cell volts: nominal, full charge, low cut-off
CELLS = {
    "lfp": (3.2, 3.65, 2.5, "LiFePO4", [4, 8, 15, 16, 20, 24, 32]),
    "nmc": (3.7, 4.2, 3.0, "Li-ion (NMC)", [7, 10, 13, 14, 16, 20, 24]),
}
SYSTEM = {"lfp": {4: "12 V", 8: "24 V", 15: "48 V", 16: "48 V", 20: "60 V", 24: "72 V", 32: "96 V"},
          "nmc": {7: "24 V", 10: "36 V", 13: "48 V", 14: "48 V", 16: "60 V", 20: "72 V", 24: "84 V"}}
USE = {"12 V": "12 V systems, small UPS and solar lights",
       "24 V": "24 V inverters, 3.6-4.2 kW hybrid inverters, solar storage",
       "36 V": "36 V e-bikes and e-cycles",
       "48 V": "48 V inverters, e-rickshaws, e-loaders and solar storage",
       "60 V": "60 V e-scooties and e-bikes",
       "72 V": "72 V e-scooties, e-bikes and golf carts",
       "84 V": "high-voltage EV packs",
       "96 V": "96 V EV and industrial packs"}
FUSES = [10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500, 600, 800]
# copper cable, short runs inside or next to the pack (conservative)
CABLE = [(15, "1.5 mm²", "16 AWG"), (25, "2.5 mm²", "14 AWG"), (35, "4 mm²", "12 AWG"), (50, "6 mm²", "10 AWG"),
         (70, "10 mm²", "8 AWG"), (100, "16 mm²", "6 AWG"), (150, "25 mm²", "4 AWG"), (200, "35 mm²", "2 AWG"),
         (250, "50 mm²", "1 AWG"), (300, "70 mm²", "2/0 AWG"), (400, "95 mm²", "3/0 AWG"), (10**6, "120 mm²", "4/0 AWG")]
CONNECTOR_AMPS = {"SB50": 50, "SB75": 75, "SB120": 120, "SB175": 175, "SB350": 350, "XT60": 30}


def esc(v):
    return html.escape(str(v), quote=True)


def specs(product):
    s = product.get("specifications")
    if isinstance(s, list):
        return {str(e.get("label", "")).strip().lower(): str(e.get("value") or "") for e in s if isinstance(e, dict)}
    if isinstance(s, dict):
        return {str(k).strip().lower(): str(v) for k, v in s.items()}
    return {}


def first(sp, *keys):
    for k in keys:
        if sp.get(k):
            return sp[k]
    return ""


def num(text):
    m = re.search(r"(\d+(?:\.\d+)?)", text or "")
    return float(m.group(1)) if m else None


def series_range(text):
    found = [int(x) for x in re.findall(r"(\d+)\s*S", text or "")]
    if not found:
        return None
    return (1 if "up to" in text.lower() and len(found) == 1 else min(found)), max(found)


def a_n(n):
    """'a' or 'an' before a spoken number (an 80 A fuse, an 11 A charger)."""
    return "an" if str(int(n)).startswith("8") or int(n) in (11, 18) else "a"


def fuse_for(amps):
    return next((f for f in FUSES if f >= amps * 1.25), FUSES[-1])


def cable_for(amps):
    return next((mm, awg) for limit, mm, awg in CABLE if amps <= limit)


def kw(watts):
    return ("%.1f kW" % (watts / 1000.0)) if watts >= 1000 else ("%d W" % round(watts))


def rupees(value):
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        return "-"
    d = str(n)
    if len(d) > 3:
        d = ",".join(re.findall(r"\d{1,2}(?=(?:\d{2})*$)", d[:-3])) + "," + d[-3:]
    return "₹" + d


def link(p):
    return '<a href="/products/%s/">%s</a>' % (esc(urllib.parse.quote(p["slug"])), esc(p["name"]))


def table(head, rows):
    return ('<div class="table-scroll"><table class="spec-table"><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>'
            % ("".join("<th>%s</th>" % h for h in head),
               "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % c for c in r) for r in rows)))


def chemistry(sp, name):
    text = (first(sp, "cell chemistry", "battery type") + " " + name).lower()
    if "nmc" in text or ("li-ion" in text and "lifepo4" not in text):
        return "nmc"
    return "lfp"


def pack_rows(chem, lo, hi, amps=None):
    nom, full, cut, _, common = CELLS[chem]
    counts = sorted(set([c for c in common if lo <= c <= hi] + ([lo] if lo > 1 else []) + [hi]))
    rows = []
    for s in counts:
        system = SYSTEM[chem].get(s, "-")
        row = ["%dS" % s, "%.1f V" % (s * nom), "%.1f V" % (s * full), "%.1f V" % (s * cut)]
        if amps:
            row.append(kw(s * nom * amps))
        row.append(USE.get(system, "-") if system != "-" else "-")
        rows.append(row)
    return rows


# ----------------------------------------------------------------- sections
def bms_guide(p, sp):
    rng = series_range(first(sp, "series (cell count)", "series"))
    amps = num(first(sp, "continuous discharge current", "current"))
    if not rng or not amps:
        return []
    chem = chemistry(sp, p["name"])
    lo, hi = rng
    nom, full, cut, label, _ = CELLS[chem]
    out = ['<h3>Which packs this BMS fits</h3>',
           '<p class="prose">Pack voltages for %s cells (%.1f V nominal, %.2f V full, %.1f V cut-off per cell) '
           'and the continuous power the %s can carry at its rated %d A:</p>'
           % (label, nom, full, cut, esc(p["name"]), amps),
           table(["Series", "Nominal", "Full charge", "Cut-off", "Power at %d A" % amps, "Typical use"],
                 pack_rows(chem, lo, hi, amps))]
    key = 16 if lo <= 16 <= hi and chem == "lfp" else (13 if lo <= 13 <= hi and chem == "nmc" else hi)
    watts = key * nom * amps
    mm, awg = cable_for(amps)
    out.append('<h3>Inverter, cable and fuse</h3>'
               '<p class="prose">On a %dS pack (%.1f V) the BMS passes up to about %s, so it suits an inverter '
               'or motor controller drawing no more than about %s from the battery (about %s of AC output at '
               '90%% inverter efficiency). For the main battery leads use at least %s (%s) copper cable and %s '
               '%d A DC fuse or breaker; if your load pulls more than %d A for long, choose a higher-current BMS.'
               '</p>' % (key, key * nom, kw(watts), kw(watts), kw(watts * 0.9), mm, awg, a_n(fuse_for(amps)),
                         fuse_for(amps), amps))
    out.append('<p class="prose" lang="hi">%dS पैक (%.1f V) पर यह BMS लगभग %s तक की पावर दे सकता है। मेन बैटरी '
               'केबल कम से कम %s (%s) कॉपर रखें और %d A का DC फ़्यूज़ लगाएँ।</p>'
               % (key, key * nom, kw(watts), mm, awg, fuse_for(amps)))
    return out


def balancer_guide(p, sp):
    rng = series_range(first(sp, "series", "series (cell count)"))
    amps = num(first(sp, "balance current", "active balance current"))
    if not rng or not amps:
        return []
    lo, hi = rng
    lo = lo if lo > 1 else min(4, hi)
    out = ['<h3>Packs it can balance</h3>',
           '<p class="prose">It works on packs from %s up to %dS. LiFePO4 pack voltages in that range:</p>'
           % ("%dS" % lo, hi),
           table(["Series", "Nominal", "Full charge", "Cut-off", "Typical use"], pack_rows("lfp", lo, hi))]
    rows = []
    for ah in (100, 200, 280, 314):
        moved = ah * 0.02
        rows.append(["%d Ah" % ah, "%.1f Ah" % moved, "%.1f h" % (moved / amps)])
    out.append('<h3>How fast it corrects an imbalance</h3>'
               '<p class="prose">At %.1f A, moving the charge behind a 2%% difference between cells takes roughly:'
               '</p>' % amps + table(["Cell size", "Charge to move (2%)", "Time at %g A" % amps], rows))
    out.append('<p class="prose" lang="hi">%g A बैलेंस करंट पर 280 Ah सेल में 2%% का फ़र्क़ लगभग %.1f घंटे में '
               'बराबर हो जाता है।</p>' % (amps, 280 * 0.02 / amps))
    return out


def charger_guide(p, sp):
    amps = num(sp.get("charging current"))
    if not amps:
        return []
    kind = (sp.get("battery type") or "").lower()
    out = []
    if "lead" in kind:
        volts = sp.get("battery voltage", "")
        n = num(re.search(r"(\d+)\s*x", volts).group(1)) if re.search(r"(\d+)\s*x", volts) else None
        caps = (20, 24, 26, 32)
        rows = [["%d Ah" % c, "%.1f h" % (c / amps * 1.2)] for c in caps]
        out.append('<h3>Charging time</h3><p class="prose">For a %s lead-acid bank%s, a full charge from empty '
                   'at %g A takes about (capacity ÷ current × 1.2 for lead-acid losses):</p>'
                   % (esc(volts or "lead-acid"), " (%d batteries of 12 V in series)" % n if n else "", amps)
                   + table(["Battery capacity", "Approx. time"], rows))
        out.append('<p class="prose" lang="hi">%g A पर 26 Ah की लेड-एसिड बैटरी लगभग %.1f घंटे में पूरी चार्ज होती है।'
                   '</p>' % (amps, 26 / amps * 1.2))
    else:
        volts = num(sp.get("charging voltage"))
        suits = sp.get("suits", "")
        caps = (10, 20, 30, 40, 60)
        rows = [["%d Ah" % c, "%.1f h" % (c / amps + 0.5)] for c in caps if c / amps <= 20]
        out.append('<h3>Charging time</h3><p class="prose">It charges %s to %s. From empty at %g A, a full '
                   'charge takes about capacity ÷ current plus half an hour to finish:</p>'
                   % (esc(suits or "the pack"), "%g V" % volts if volts else "full voltage", amps)
                   + table(["Pack capacity", "Approx. time"], rows))
        out.append('<p class="prose" lang="hi">%g A पर 20 Ah का पैक लगभग %.1f घंटे में पूरा चार्ज होता है।</p>'
                   % (amps, 20 / amps + 0.5))
    return out


def connector_guide(p, sp, price):
    amps = num(first(sp, "current rating", "rating", "current"))
    model = re.search(r"\b(SB\d+|XT60)\b", p["name"] + " " + sp.get("connector", ""))
    if not amps and model:
        amps = CONNECTOR_AMPS.get(model.group(1))
    qty = int(num(sp.get("pack quantity")) or 1)
    out = []
    if amps:
        mm, awg = cable_for(amps)
        out.append('<h3>Cable and fuse for %d A</h3><p class="prose">%s is rated for %d A%s. Pair it with at '
                   'least %s (%s) copper cable and protect the circuit with %s %d A fuse or breaker.</p>'
                   % (amps, esc(model.group(1) + " (" + p["name"] + ")") if model else esc(p["name"]), amps,
                      " continuous" if model and model.group(1) == "XT60" else "", mm, awg,
                      a_n(fuse_for(amps)), fuse_for(amps)))
        out.append('<p class="prose" lang="hi">%d A के लिए कम से कम %s (%s) कॉपर केबल और %d A का फ़्यूज़ लगाएँ।</p>'
                   % (amps, mm, awg, fuse_for(amps)))
    wire = sp.get("wire")
    if wire:
        out.append('<p class="prose">Comes pre-wired with %s cable%s.</p>'
                   % (esc(wire), (" (%s long)" % esc(sp["length"])) if sp.get("length") else ""))
    colour = (sp.get("colour") or "").lower()
    if colour in ("red", "black"):
        out.append('<p class="prose">%s is the usual colour for the %s terminal, so the pack is easy to wire '
                   'the right way round.</p>' % (colour.capitalize(), "positive (+)" if colour == "red" else "negative (-)"))
    if qty > 1 and price:
        out.append('<p class="prose">Pack of %d at %s works out to %s per piece.</p>'
                   % (qty, rupees(price), rupees(float(price) / qty)))
    return out


def siblings_table(p, sp, family):
    if not family:
        return []
    keys = [k for k in ("type", "series (cell count)", "series", "continuous discharge current", "balance current",
                        "active balance current", "charging current", "charging voltage", "battery voltage",
                        "current rating", "screen", "colour", "pack quantity", "connector")
            if any(specs(f).get(k) for f in family + [p])]
    # only the columns that actually differ
    group = family + [p]
    keys = [k for k in keys if sum(1 for f in group if specs(f).get(k)) * 2 >= len(group)]
    keys = [k for k in keys if len(set(specs(f).get(k, "") for f in group)) > 1][:3] or keys[:2]
    rows = []
    for f in [p] + family:
        fs = specs(f)
        rows.append([("<b>%s</b> (this page)" % esc(f["name"])) if f is p else link(f)]
                    + [esc(fs.get(k, "-")) for k in keys] + [rupees(f.get("price"))])
    return ['<h3>Compare with similar models</h3>',
            table(["Model"] + [k.capitalize() for k in keys] + ["Price"], rows)]


def family_of(p, pool):
    sp = specs(p)
    def same(a, b):
        return a.get("brand") == b.get("brand") and a.get("category_id") == b.get("category_id")
    pool = [q for q in pool if q["id"] != p["id"] and same(p, q)]
    for key in ("series (cell count)", "series", "type", "battery type", "connector"):
        if sp.get(key):
            hits = [q for q in pool if specs(q).get(key) == sp[key]]
            if hits:
                return sorted(hits, key=lambda q: float(q.get("price") or 0))[:8]
    return sorted(pool, key=lambda q: float(q.get("price") or 0))[:6]


def is_smart(sp):
    t = (sp.get("type") or "").lower()
    return "smart" in t and "semi" not in t


def near_twins(p, pool):
    """Same brand and category, and the specs differ in only one or two rows."""
    sp = specs(p)
    out = []
    for q in pool:
        if q["id"] == p["id"] or q.get("category_id") != p.get("category_id"):
            continue
        if q["slug"].endswith("-variant-b") or p["slug"].endswith("-variant-b"):
            continue
        qs = specs(q)
        keys = (set(sp) | set(qs)) - {"brand", "photo"}
        diff = [k for k in sorted(keys) if sp.get(k, "") != qs.get(k, "")]
        other_maker = q.get("brand") != p.get("brand")
        if (not other_maker and 1 <= len(diff) <= 2) or (other_maker and not diff):
            out.append((q, diff))
    # the plainest comparison first: one differing row (or another maker of the same part)
    out.sort(key=lambda t: (len(t[1]) if t[1] else 0.5, t[1] != ["type"]))
    return out[:3]


def choose_block(p, sp, twins):
    """'Which one should I buy' for the closest siblings, written from this
    page's side so it reads differently on each of them."""
    out = []
    for q, diff in twins:
        qs = specs(q)
        gap = float(p.get("price") or 0) - float(q.get("price") or 0)
        cost = ("costs %s more than" % rupees(gap)) if gap > 0 else (
            ("costs %s less than" % rupees(-gap)) if gap < 0 else "costs the same as")
        if diff == ["type"] and ("smart" in (sp.get("type", "") + qs.get("type", "")).lower()):
            amps = sp.get("continuous discharge current", "")
            if is_smart(sp):
                out.append('<h3>Smart or Semi-Smart?</h3><p class="prose">This Smart version adds Bluetooth app '
                           'monitoring: you can read every cell voltage, the pack current and state of charge on '
                           'your phone, and see an alarm the moment the BMS cuts off. It %s the %s, which has the '
                           'same %s rating but no app. Pick this one if you want to watch the pack or troubleshoot '
                           'it without opening the box.</p>' % (cost, link(q), esc(amps)))
                out.append('<p class="prose" lang="hi">इस Smart वर्ज़न में Bluetooth ऐप है - हर सेल का वोल्टेज और '
                           'बैटरी की हालत फ़ोन पर दिखती है। अगर आप बैटरी पर नज़र रखना चाहते हैं तो यह लें।</p>')
            else:
                out.append('<h3>Semi-Smart or Smart?</h3><p class="prose">This Semi-Smart version gives the same %s '
                           'rating and active balancing as the %s, without the Bluetooth app, and %s it. Pick it for '
                           'a pack you will build, test once and leave alone; choose the Smart version if you want '
                           'to see cell voltages on your phone.</p>' % (esc(amps), link(q), cost))
                out.append('<p class="prose" lang="hi">यह Semi-Smart वर्ज़न वही करंट और बैलेंसिंग देता है, बस '
                           'Bluetooth ऐप नहीं है, इसलिए सस्ता है। जो बैटरी एक बार लगाकर छोड़नी है, उसके लिए ठीक है।</p>')
            continue
        if not diff:
            out.append('<p class="prose">Same rating from another maker: the %s (%s) matches this %s charger on '
                       'paper, and this one %s it. Both suit the same batteries; pick by price or the brand you '
                       'already use.</p>' % (link(q), esc(q.get("brand") or "-"), esc(p.get("brand") or ""), cost))
            continue
        parts = ["%s %s here against %s" % (k, esc(sp.get(k, "-")), esc(qs.get(k, "-"))) for k in diff]
        out.append('<p class="prose">Closest alternative: the %s differs only in %s, and this one %s it.</p>'
                   % (link(q), "; ".join(parts), cost))
    return out


def twin_of(p, pool):
    """The main listing a '... (Variant B)' page duplicates, if any."""
    if not p["slug"].endswith("-variant-b"):
        return None
    base = p["slug"][:-len("-variant-b")]
    return next((q for q in pool if q["slug"] == base), None)


def guide_html(p, cat_slug, pool):
    """The section, or "" for products it does not apply to."""
    if not p.get("brand"):
        return ""
    sp = specs(p)
    kind = (sp.get("type") or "").lower()
    body = []
    if cat_slug == "battery-chargers":
        body += charger_guide(p, sp)
    elif cat_slug == "battery-connectors":
        body += connector_guide(p, sp, p.get("price"))
    elif "balancer" in kind and "board" not in kind:
        body += balancer_guide(p, sp)
    elif sp.get("continuous discharge current") or ("bms" in kind and sp.get("current") and sp.get("series")):
        body += bms_guide(p, sp)
    twin = twin_of(p, pool)
    if twin:
        body.insert(0, '<p class="prose">This is a separate listing of the %s with the same specifications - compare '
                       'the photos to pick the one you want. Price here: %s, main listing: %s.</p>'
                    % (link(twin), rupees(p.get("price")), rupees(twin.get("price"))))
    body += choose_block(p, sp, near_twins(p, pool))
    body += siblings_table(p, sp, family_of(p, pool))
    if not body:
        return ""
    return ('    <section class="section" id="fitGuide" style="padding-top:0">\n'
            '      <div class="section-head"><div><h2>SIZING &amp; <span>FIT GUIDE</span></h2>'
            '<p class="section-sub" lang="hi">साइज़ और फ़िट गाइड</p></div></div>\n'
            '      <div class="spec-table-wrap fit-guide">\n        '
            + "\n        ".join(body)
            + '\n      </div>\n    </section>')
