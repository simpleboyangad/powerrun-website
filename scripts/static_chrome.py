#!/usr/bin/env python
"""
Write the site header and footer into every customer page as plain HTML.

assets/js/layout.js builds the header (menu) and footer (category, company
and policy links) in the browser. Until Google renders a page's JavaScript -
which for a new site can take weeks - it sees none of those links, so most
pages stay "Discovered - currently not indexed". This puts the same markup
straight into <div id="pr-header"> and <div id="pr-footer">; layout.js still
re-renders both on load (active menu item, cart count, promo banner), so
visitors see no difference.

Keep the markup below in step with PR.renderHeader / PR.renderFooter in
assets/js/layout.js. Contact details are read from assets/js/config.js.

Called by scripts/stamp_assets.py, so every publish refreshes it.
"""
import datetime
import glob
import html
import io
import os
import re
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

START, END = "<!--static-chrome-->", "<!--/static-chrome-->"
SLOT = re.compile(r'(<div id="(pr-header|pr-footer)">)(?:%s.*?%s)?(</div>)' % (START, END), re.S)

NAV = [("/", "HOME"), ("/about/", "ABOUT US"), ("/products/", "PRODUCTS"), ("/warranty/", "WARRANTY"),
       ("/service/", "SERVICE"), ("/dealer/", "DEALERSHIP"), ("/blog/", "BLOG"), ("/contact/", "CONTACT US")]

WA_ICON = ('<svg viewBox="0 0 32 32" width="30" height="30" fill="#fff" aria-hidden="true"><path d="M16.04 3C9.37 3 '
           '3.98 8.39 3.98 15.06c0 2.66.87 5.13 2.36 7.13L4.98 28l5.98-1.32a12.02 12.02 0 0 0 5.08 1.12h.01c6.67 0 '
           '12.06-5.39 12.06-12.06C28.11 8.39 22.72 3 16.04 3zm7.1 17.06c-.3.84-1.5 1.54-2.44 1.74-.65.14-1.5.25-4.36-.93'
           '-3.66-1.5-6.02-5.2-6.2-5.44-.18-.24-1.48-1.97-1.48-3.76 0-1.79.94-2.66 1.28-3.02.33-.36.72-.45.96-.45.24 0 .48 '
           '0 .69.01.22.01.51-.08.8.61.3.72 1.02 2.49 1.11 2.67.09.18.15.39.03.63-.12.24-.18.39-.36.6-.18.21-.38.47-.54.63'
           '-.18.18-.37.38-.16.74.21.36.93 1.53 2 2.48 1.37 1.22 2.53 1.6 2.89 1.78.36.18.57.15.78-.09.21-.24.9-1.05 1.14'
           '-1.41.24-.36.48-.3.81-.18.33.12 2.1.99 2.46 1.17.36.18.6.27.69.42.09.15.09.87-.21 1.71z"/></svg>')


def config():
    """String values from assets/js/config.js (PHONE, EMAIL, WHATSAPP ...)."""
    text = io.open(os.path.join(ROOT, "assets", "js", "config.js"), encoding="utf-8").read()
    return dict(re.findall(r"^\s*([A-Z_]+):\s*'([^']*)'", text, re.M))


def header(cfg):
    esc = html.escape
    links = "".join('<a href="%s">%s</a>' % (href, label) for href, label in NAV)
    return (
        '<div class="promo-banner" id="prPromoBanner" hidden></div>'
        '<div class="top">'
        '<div>⚡ Welcome to <b>%s</b></div>'
        '<div><span>☎ %s</span><span>✉ %s</span></div>'
        '</div>'
        '<header class="header">'
        '<button class="mobile-menu-btn" type="button" aria-label="Open menu" aria-expanded="false" data-pr-menu>☰</button>'
        '<a href="/" aria-label="PowerRun Industries home">'
        '<img class="logo" src="/assets/powerrun-logo.png" alt="PowerRun Industries logo" width="172" height="55" loading="eager">'
        '</a>'
        '<nav class="nav" aria-label="Main">%s</nav>'
        '<div class="mobile-nav" id="prMobileNav">%s</div>'
        '<div class="actions">'
        '<a class="icon" href="/products/" aria-label="Search products" title="Search products">⌕</a>'
        '<a class="icon" href="/track-order/" aria-label="Track your order" title="Track your order">◴</a>'
        '<a class="icon" href="/account/" aria-label="My account" title="My account">👤</a>'
        '<a class="icon cart" href="/cart/" aria-label="View cart" title="View cart">🛒<i class="badge" id="cartCount">0</i></a>'
        '</div>'
        '</header>'
        % (esc(cfg["COMPANY"]), esc(cfg["PHONE"]), esc(cfg["EMAIL"]), links, links))


def footer(cfg):
    esc = html.escape
    wa = "https://wa.me/%s" % cfg["WHATSAPP"]
    wa_hello = wa + "?text=" + urllib.parse.quote("Hello PowerRun Industries, I need an energy solution.")
    return (
        '<footer class="footer"><div class="footer-grid">'
        '<div><h3>POWER<span style="color:#fff">RUN</span></h3>'
        '<p>Powering today, sustaining tomorrow. High-performance lithium batteries, '
        'hybrid inverters and complete energy solutions.</p>'
        '<p>☎ %s<br>✉ %s</p>'
        '<p>📍 %s<br>GSTIN: %s</p></div>'
        '<div><h3>Products</h3><ul id="prFooterCats">'
        '<li><a href="/hybrid-inverters/">Hybrid Inverters</a></li>'
        '<li><a href="/lithium-batteries/">Lithium Batteries</a></li>'
        '<li><a href="/solar-panels/">Solar Panels</a></li>'
        '<li><a href="/e-rickshaw-batteries/">E-Rickshaw Batteries</a></li>'
        '<li><a href="/bms-balancers/">BMS &amp; Balancers</a></li>'
        '<li><a href="/battery-connectors/">Connectors &amp; Terminals</a></li>'
        '</ul></div>'
        '<div><h3>Company</h3><ul>'
        '<li><a href="/about/">About Us</a></li>'
        '<li><a href="/products/">All Products</a></li>'
        '<li><a href="/dealer/">Become a Dealer</a></li>'
        '<li><a href="/blog/">Energy Guides</a></li>'
        '<li><a href="/contact/">Contact Us</a></li>'
        '</ul></div>'
        '<div><h3>Support</h3><ul>'
        '<li><a href="/battery-calculator/">Battery Calculator</a></li>'
        '<li><a href="/solar-calculator/">Solar Calculator</a></li>'
        '<li><a href="/warranty/">Warranty Registration</a></li>'
        '<li><a href="/service/">Service Request</a></li>'
        '<li><a href="/track-order/">Track Order</a></li>'
        '<li><a href="/account/">My Account</a></li>'
        '<li><a href="%s" target="_blank" rel="noopener">WhatsApp Support</a></li>'
        '<li><a href="%s" target="_blank" rel="noopener">YouTube Channel</a></li>'
        '</ul></div>'
        '<div><h3>Policies</h3><ul>'
        '<li><a href="/shipping-policy/">Shipping Policy</a></li>'
        '<li><a href="/refund-policy/">Return &amp; Refund</a></li>'
        '<li><a href="/terms/">Terms &amp; Conditions</a></li>'
        '<li><a href="/privacy-policy/">Privacy Policy</a></li>'
        '</ul></div>'
        '</div>'
        '<div class="copy">© %d %s. All Rights Reserved.</div>'
        '</footer>'
        '<a class="wa-float" href="%s" target="_blank" rel="noopener" '
        'aria-label="Chat with PowerRun Industries on WhatsApp">%s</a>'
        % (esc(cfg["PHONE"]), esc(cfg["EMAIL"]), esc(cfg["ADDRESS"]), esc(cfg["GSTIN"]),
           esc(wa), esc(cfg["YOUTUBE"]), datetime.date.today().year, esc(cfg["COMPANY"]),
           esc(wa_hello), WA_ICON))


def bake(page_html, cfg=None):
    """page_html with the static header/footer in place (idempotent)."""
    cfg = cfg or config()
    parts = {"pr-header": header(cfg), "pr-footer": footer(cfg)}
    return SLOT.sub(lambda m: m.group(1) + START + parts[m.group(2)] + END + m.group(3), page_html)


def bake_all():
    cfg = config()
    changed = 0
    pages = glob.glob(os.path.join(ROOT, "*.html")) + glob.glob(os.path.join(ROOT, "*", "index.html")) \
        + glob.glob(os.path.join(ROOT, "*", "*", "index.html"))
    for path in pages:
        if os.sep + "admin" + os.sep in path:
            continue
        before = io.open(path, encoding="utf-8").read()
        if 'id="pr-header"' not in before and 'id="pr-footer"' not in before:
            continue
        after = bake(before, cfg)
        if after != before:
            io.open(path, "w", encoding="utf-8", newline="").write(after)
            changed += 1
    return changed


if __name__ == "__main__":
    print("static header/footer written into %d pages" % bake_all())
