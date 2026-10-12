"""
Rebuild the printable rate card from live product data.

    python scripts/rate_card.py          write docs/sales/print/rate-card.html and rate-card.pdf

Page 1: PowerRun's own products (price and warranty from the database).
Page 2: BMS, balancers and displays (JK, JBD, Daly).
Page 3: connectors and chargers.
The short spec line under each PowerRun product is kept from the previous
card (it does not change with price). The PDF is printed with headless Edge
or Chrome. Run it again whenever prices change.
"""
import datetime
import html
import io
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seo_build import fetch  # noqa: E402  public (anon) read, same as the site build

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "sales", "print", "rate-card.html")
PDF = OUT[:-5] + ".pdf"
BROWSERS = [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe"]
OWN = [("hybrid-inverters", "Hybrid Solar Inverters"),
       ("lithium-batteries", "Lithium (LiFePO4) Batteries · Inverter / Solar"),
       ("e-rickshaw-batteries", "E-Rickshaw Lithium Batteries"),
       ("ev-batteries", "E-Scooty Lithium Batteries"),
       ("solar-panels", "Solar Panels")]


def esc(s):
    return html.escape(s or "", quote=False)


def rupees(v):
    n = int(round(v))
    s = str(n)
    if len(s) > 3:                                   # Indian grouping: 1,23,456
        head, tail = s[:-3], s[-3:]
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        s = head + "," + tail
    return "₹" + s


def short_warranty(w):
    w = w or ""
    if "Product" in w and "Performance" in w:
        return "10 yr product / 25 yr perf."
    m = re.match(r"(\d+)\s*Year", w)
    return "%s yr" % m.group(1) if m else esc(w)


def old_spec_lines():
    """SKU -> the small spec line on the previous card."""
    if not os.path.isfile(OUT):
        return {}
    s = io.open(OUT, encoding="utf-8").read()
    return dict(re.findall(r'<td class="sku">(PR-\d+)</td><td><b>[^<]*</b><small>([^<]*)</small>', s))


def build():
    cats = {c["id"]: c["slug"] for c in fetch("categories?select=id,slug")}
    prods = fetch("products?select=sku,name,price,warranty,brand,category_id,sort_order&is_active=eq.true&order=price")
    spec = old_spec_lines()
    today = datetime.date.today().strftime("%d %B %Y").lstrip("0")

    page1 = []
    for slug, title in OWN:
        rows = sorted([p for p in prods if cats.get(p["category_id"]) == slug and not p.get("brand")],
                      key=lambda p: p["sku"])
        if not rows:
            continue
        body = "".join(
            '<tr><td class="sku">%s</td><td><b>%s</b><small>%s</small></td><td>%s</td><td class="p">%s</td></tr>'
            % (esc(p["sku"]), esc(p["name"].replace("PR ", "PowerRun ", 1)), esc(spec.get(p["sku"], "")),
               short_warranty(p["warranty"]), rupees(p["price"])) for p in rows)
        page1.append('<h2>%s</h2><table><thead><tr><th>Code</th><th>Product</th><th>Warranty</th>'
                     '<th class="p">Price</th></tr></thead><tbody>%s</tbody></table>' % (esc(title), body))

    def two_cols(items):
        half = (len(items) + 1) // 2
        col = lambda part: '<table class="bms"><tbody>%s</tbody></table>' % "".join(
            '<tr><td>%s</td><td class="p">%s</td></tr>' % (esc(p["name"]), rupees(p["price"])) for p in part)
        return '<div class="cols">%s%s</div>' % (col(items[:half]), col(items[half:]))

    resold = [p for p in prods if p.get("brand")]
    bms = sorted([p for p in resold if cats.get(p["category_id"]) == "bms-balancers"],
                 key=lambda p: (p["brand"], p["price"]))
    con = sorted([p for p in resold if cats.get(p["category_id"]) == "battery-connectors"], key=lambda p: p["price"])
    chg = sorted([p for p in resold if cats.get(p["category_id"]) == "battery-chargers"], key=lambda p: p["price"])

    tpl = io.open(OUT, encoding="utf-8").read()
    style = tpl[:tpl.index("</style>") + len("</style>")]
    head = re.search(r'<div class="head">.*?</div></div>', tpl, re.S).group(0)
    refer = re.search(r'<div class="refer">.*?</div>', tpl, re.S).group(0)
    foot = re.search(r'<div class="foot">.*?\n</div>\n', tpl, re.S).group(0)
    qr = tpl[tpl.index('<script src="https://cdnjs'):tpl.index("</body>")]
    note = ('<div class="note"><b>Note:</b> In parts par koi warranty nahi hai. Agar product kharab/dead aaye to '
            '7 din mein replacement. Sahi model chunne ke liye WhatsApp karein: +91 80575 73040</div>')

    out = (style + '</head><body><div class="page1">\n' + head + '\n<h1>RATE <span>CARD</span></h1>\n'
           '<p class="sub">All prices in ₹, GST included · Rates as on %s, subject to change · Delivery &amp; '
           'installation extra</p>\n' % today + "".join(page1) + "\n" + refer + "\n" + foot + "</div>\n"
           '<div class="page2">\n' + head + "\n<h1>BMS, BALANCERS <span>&amp; DISPLAYS</span></h1>\n"
           '<p class="sub">Lithium battery pack banane/repair ke liye · All prices in ₹, GST included · Rates as on %s'
           "</p>\n" % today + two_cols(bms) + "\n" + note + "\n</div>\n"
           '<div class="page2">\n' + head + "\n<h1>CONNECTORS <span>&amp; CHARGERS</span></h1>\n"
           '<p class="sub">All prices in ₹, GST included · Rates as on %s · Connector prices are per pack</p>\n' % today
           + "<h2>Connectors &amp; Terminals</h2>" + two_cols(con) + "<h2>Battery Chargers</h2>" + two_cols(chg)
           + "\n" + note + "\n</div>\n" + qr + "</body></html>\n")
    io.open(OUT, "w", encoding="utf-8", newline="\n").write(out)
    print("wrote", OUT, "-", len(page1), "own sections,", len(bms), "BMS,", len(con), "connectors,", len(chg), "chargers")

    browser = next((b for b in BROWSERS if os.path.isfile(b)), None)
    if not browser:
        print("no Edge/Chrome found - open the HTML and print to PDF by hand")
        return
    subprocess.run([browser, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    "--virtual-time-budget=8000", "--print-to-pdf=" + PDF, "file:///" + OUT.replace("\\", "/")],
                   check=True, capture_output=True, timeout=120)
    print("wrote", PDF)


if __name__ == "__main__":
    build()
