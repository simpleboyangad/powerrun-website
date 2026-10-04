#!/usr/bin/env python
"""
PowerRun Industries - publish the SEO settings into the static site.

The site is static HTML on GitHub Pages, so two things have to happen for SEO
to work properly:

  1. At run time, assets/js/seo.js reads global_seo / page_seo / products /
     categories from Supabase and applies the tags. Google renders JavaScript,
     so it sees those.

  2. Crawlers that do NOT run JavaScript - WhatsApp, Facebook and X link
     previews above all - only see what is already in the HTML file. This
     script bakes the current database values into every page between
     <!-- SEO:START --> and <!-- SEO:END -->, and writes:

       - one real page per product at /products/<slug>/  (clean, indexable URL),
         with the product's name, price, images, specifications and
         description already in the HTML, so the page has real content even
         before (or without) JavaScript - assets/js/pages/product.js then
         replaces it with the interactive version
       - the product grid and FAQ schema on each category landing page
         (/hybrid-inverters/, /lithium-batteries/, ...); the intro, buying
         guide and FAQ text there are hand-written HTML and left as they are
       - sitemap.xml   every indexable page, non-empty category and product,
                       no duplicates, with product images for Google Images
       - robots.txt    from global_seo.robots_txt, or a safe default

Run it after changing SEO settings in the admin panel, then commit and push:

    python scripts/seo_build.py
    python scripts/stamp_assets.py

Reads Supabase with the PUBLIC (publishable) key only - it needs no secrets.
"""
import datetime
from html import unescape as html_unescape
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
START = "<!-- SEO:START -->"
END = "<!-- SEO:END -->"

DEFAULT_ROBOTS = """User-agent: *
Allow: /

# Private areas - never indexed
Disallow: /admin/
Disallow: /cart/
Disallow: /checkout/
Disallow: /order-confirmation/
Disallow: /account/
Disallow: /set-password/
Disallow: /youtube/
Disallow: /track-order/
Disallow: /*?add-to-cart=
Disallow: /*&add-to-cart=

Sitemap: {site}/sitemap.xml
"""


# --------------------------------------------------------------------------
# Supabase (public read)
# --------------------------------------------------------------------------
def config():
    text = io.open(os.path.join(ROOT, "assets", "js", "config.js"), encoding="utf-8").read()
    url = re.search(r"SUPABASE_URL\s*:\s*['\"]([^'\"]+)", text).group(1)
    key = re.search(r"(sb_publishable_[A-Za-z0-9_\-]+)", text).group(1)
    site = re.search(r"SITE_URL\s*:\s*['\"]([^'\"]+)", text).group(1)
    return url, key, site.rstrip("/")


def fetch(path):
    url, key, _ = config()
    req = urllib.request.Request(url + "/rest/v1/" + path,
                                 headers={"apikey": key, "Authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode())


def esc(value):
    return (str(value or "")
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def clean(value, limit=None):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if limit and len(text) > limit:
        text = text[:limit - 1].rstrip(" ,.;:-") + "…"
    return text


# --------------------------------------------------------------------------
# head block
# --------------------------------------------------------------------------
def head_block(title, description, canonical, image, site_name, keywords="",
               robots="index,follow,max-image-preview:large", og_type="website",
               gsc=None, schema=None):
    lines = [
        START,
        "<title>%s</title>" % esc(title),
        '<meta name="description" content="%s">' % esc(description),
    ]
    if keywords:
        lines.append('<meta name="keywords" content="%s">' % esc(keywords))
    lines += [
        '<meta name="robots" content="%s">' % esc(robots),
        '<link rel="canonical" href="%s">' % esc(canonical),
        '<meta property="og:type" content="%s">' % esc(og_type),
        '<meta property="og:locale" content="en_IN">',
        '<meta property="og:site_name" content="%s">' % esc(site_name),
        '<meta property="og:title" content="%s">' % esc(title),
        '<meta property="og:description" content="%s">' % esc(description),
        '<meta property="og:url" content="%s">' % esc(canonical),
        '<meta property="og:image" content="%s">' % esc(image),
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="twitter:title" content="%s">' % esc(title),
        '<meta name="twitter:description" content="%s">' % esc(description),
        '<meta name="twitter:image" content="%s">' % esc(image),
    ]
    if gsc:
        lines.append('<meta name="google-site-verification" content="%s">' % esc(gsc))
    # The ids match the ones assets/js/seo.js uses, so the run-time script
    # UPDATES these blocks instead of adding a second copy.
    ids = {"Organization": "ld-organization", "WebSite": "ld-website",
           "Product": "ld-product", "BreadcrumbList": "ld-breadcrumb", "FAQPage": "ld-faq"}
    for node in (schema or []):
        lines.append('<script type="application/ld+json" id="%s">%s</script>'
                     % (ids.get(node.get("@type"), "ld-extra"),
                        json.dumps(node, ensure_ascii=False, separators=(",", ":"))))
    lines.append(END)
    return "\n".join(lines)


def replace_head(html, block):
    """Swap the managed block, or insert it after the viewport meta on first run,
    removing the hand-written tags it replaces."""
    if START in html and END in html:
        return re.sub(re.escape(START) + r".*?" + re.escape(END), lambda m: block, html, flags=re.S)

    drop = re.compile(
        r'^[ \t]*(?:<title>.*?</title>'
        r'|<meta\s+name="(?:description|keywords|robots|twitter:card|twitter:title|twitter:description|twitter:image|google-site-verification)"[^>]*>'
        r'|<meta\s+property="og:[^"]+"[^>]*>'
        r'|<link\s+rel="canonical"[^>]*>)[ \t]*\r?\n',
        re.I | re.M | re.S)
    html = drop.sub("", html)
    anchor = re.search(r'<meta name="viewport"[^>]*>\s*\n', html, re.I)
    at = anchor.end() if anchor else html.lower().index("<head>") + len("<head>") + 1
    return html[:at] + block + "\n" + html[at:]


# --------------------------------------------------------------------------
# product pages at /products/<slug>/
# --------------------------------------------------------------------------
PRODUCT_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
{head}
<meta name="theme-color" content="#ff5a00">
<link rel="icon" href="/assets/powerrun-logo.png">
<link rel="preconnect" href="https://nnkopxkyxcmtiunftlgr.supabase.co" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<div id="pr-header"></div>
<main id="main">
    <section class="section" id="productSection">
      <div id="productContent">
{content}
      </div>
    </section>
    <section class="section" id="relatedSection" hidden style="padding-top:0">
      <div class="section-head"><h2>RELATED <span>PRODUCTS</span></h2></div>
      <div class="products" id="relatedGrid"></div>
    </section>
    <section class="section" id="reviewsSection" style="padding-top:0">
      <div id="productReviews"></div>
    </section>
{faq}
</main>
<div id="pr-footer"></div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/dist/umd/supabase.js"></script>
<script src="/assets/js/config.js"></script>
<script src="/assets/js/core.js"></script>
<script src="/assets/js/seo.js"></script>
<script src="/assets/js/cart.js"></script>
<script src="/assets/js/layout.js"></script>
<script src="/assets/js/catalog.js"></script>
<script src="/assets/js/account.js"></script>
<script src="/assets/js/pages/product.js"></script>
</body>
</html>
"""


def product_schema(product, canonical, images, site_name, reviews=None, site=""):
    node = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product["name"],
        "sku": product.get("sku") or None,
        "brand": {"@type": "Brand", "name": site_name},
        "url": canonical,
    }
    description = clean(product.get("meta_description") or product.get("short_description")
                        or product.get("description"), 500)
    if description:
        node["description"] = description
    if images:
        node["image"] = images
    price = product.get("price")
    if price:
        node["offers"] = {
            "@type": "Offer",
            "priceCurrency": "INR",
            "price": str(price),
            "itemCondition": "https://schema.org/NewCondition",
            "url": canonical,
            "availability": ("https://schema.org/InStock"
                             if (product.get("availability") or "in_stock") == "in_stock"
                             and (product.get("stock") or 0) > 0
                             else "https://schema.org/OutOfStock"),
            "seller": {"@type": "Organization", "name": site_name},
            # Real policy, matching /shipping-policy/ and /refund-policy/ word for
            # word: free pan-India shipping, 1-2 day dispatch + 3-7 day transit,
            # and a 7-day no-cost replacement window for damaged/defective/wrong items.
            "hasMerchantReturnPolicy": {
                "@type": "MerchantReturnPolicy",
                "applicableCountry": "IN",
                "returnPolicyCategory": "https://schema.org/MerchantReturnFiniteReturnWindow",
                "merchantReturnDays": 7,
                "returnFees": "https://schema.org/FreeReturn",
                "returnMethod": "https://schema.org/ReturnByMail",
                "merchantReturnLink": site + "/refund-policy/",
            },
            "shippingDetails": {
                "@type": "OfferShippingDetails",
                "shippingRate": {"@type": "MonetaryAmount", "value": "0", "currency": "INR"},
                "shippingDestination": {"@type": "DefinedRegion", "addressCountry": "IN"},
                "deliveryTime": {
                    "@type": "ShippingDeliveryTime",
                    "handlingTime": {"@type": "QuantitativeValue", "minValue": 1, "maxValue": 2, "unitCode": "DAY"},
                    "transitTime": {"@type": "QuantitativeValue", "minValue": 3, "maxValue": 7, "unitCode": "DAY"},
                },
            },
        }
    if reviews:
        ratings = [r["rating"] for r in reviews if r.get("rating")]
        if ratings:
            node["aggregateRating"] = {
                "@type": "AggregateRating",
                "ratingValue": str(round(sum(ratings) / len(ratings), 1)),
                "reviewCount": str(len(ratings)),
            }
            node["review"] = [
                {
                    "@type": "Review",
                    "author": {"@type": "Person", "name": r.get("customer_name") or "Verified Buyer"},
                    "datePublished": (r.get("created_at") or "")[:10],
                    "reviewRating": {"@type": "Rating", "ratingValue": str(r["rating"])},
                    "reviewBody": clean(r.get("body"), 500),
                }
                for r in reviews[:5]
            ]
    return {k: v for k, v in node.items() if v is not None}


def breadcrumb_schema(items):
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": name, "item": url}
            for i, (name, url) in enumerate(items)
        ],
    }


def money(value):
    """Rupees with Indian digit grouping, like PR.money() in core.js."""
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        return "Price on request"
    digits = str(abs(n))
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        head = ",".join(re.findall(r"\d{1,2}(?=(?:\d{2})*$)", head))
        digits = head + "," + tail
    return "₹" + ("-" if n < 0 else "") + digits


def spec_rows(specs):
    """Same reading of products.specifications as normalizeProduct() in catalog.js."""
    if isinstance(specs, list):
        return [(str(e["label"]), "" if e.get("value") is None else str(e["value"]))
                for e in specs if isinstance(e, dict) and e.get("label")], ""
    if isinstance(specs, dict):
        return [(k, str(v)) for k, v in specs.items() if k != "text"], str(specs.get("text") or "")
    return [], str(specs or "")


def category_path(slug):
    """Same rule as PR.categoryPath() in catalog.js: a category with its own
    landing page (a folder at the site root holding data-category="<slug>")
    is linked there, any other one as the filtered catalogue."""
    page = os.path.join(ROOT, slug, "index.html")
    if os.path.isfile(page) and ('data-category="%s"' % slug) in io.open(page, encoding="utf-8").read():
        return "/%s/" % urllib.parse.quote(slug)
    return "/products/?category=" + urllib.parse.quote(slug)


def images_of(product):
    return [i["image_url"] for i in sorted(product.get("product_images") or [],
                                           key=lambda x: x.get("sort_order") or 0)]


def prerender_product(product, cat, images, related=None):
    """Static version of the product view in assets/js/pages/product.js, using
    the same classes so the page looks right before the script takes over.
    Only content that does not go stale between builds (no stock counts)."""
    name = esc(product["name"])
    alt = esc(product.get("image_alt") or product["name"])
    out = ['<nav class="breadcrumb" aria-label="Breadcrumb">'
           '<a href="/">Home</a> / <a href="/products/">Products</a>'
           + (' / <a href="%s">%s</a>'
              % (esc(category_path(cat["slug"])), esc(cat["name"])) if cat.get("slug") else "")
           + ' / <span aria-current="page">%s</span></nav>' % name,
           '<div class="product-detail-view">',
           '<div class="product-gallery-main"><div class="gallery-stage"><div class="gallery-track">']
    for i, url in enumerate(images or []):
        out.append('<div class="gallery-slide"><img src="%s" alt="%s"%s width="700" height="560"></div>'
                   % (esc(url), alt + (" - image %d" % (i + 1) if i else ""), ' loading="lazy"' if i else ""))
    out.append('</div></div></div>')
    out.append('<div class="product-info">')
    if cat.get("name"):
        out.append('<span class="detail-badge">%s</span>' % esc(cat["name"].upper()))
    out.append('<h1>%s</h1>' % name)
    if product.get("sku"):
        out.append('<div class="sku">SKU: %s</div>' % esc(product["sku"]))
    if product.get("short_description"):
        out.append('<p class="prose" style="margin:12px 0 0">%s</p>' % esc(product["short_description"]))
    price, mrp = product.get("price"), product.get("mrp")
    if price:
        row = '<div class="price-row"><span class="price-now">%s</span>' % money(price)
        if mrp and float(mrp) > float(price):
            row += ('<span class="price-mrp">%s</span><span class="discount-badge">-%d%%</span>'
                    % (money(mrp), round((1 - float(price) / float(mrp)) * 100)))
        out.append(row + '</div>')
    else:
        out.append('<div class="price-row"><span class="price-now">Price on request</span></div>')
    if product.get("warranty"):
        out.append('<p class="small-note" style="margin-top:14px">%s</p>' % esc(product["warranty"]))
    rows, text = spec_rows(product.get("specifications"))
    if rows:
        out.append('<div class="spec-table-wrap"><b>Specifications</b><table class="spec-table"><tbody>'
                   + "".join('<tr><td>%s</td><td>%s</td></tr>' % (esc(k), esc(v)) for k, v in rows)
                   + '</tbody></table></div>')
    elif text:
        out.append('<div class="spec-table-wrap"><b>Specifications</b><p class="prose">%s</p></div>' % esc(text))
    features = product.get("features")
    features = features if isinstance(features, list) else ([features] if features else [])
    if features:
        out.append('<div class="spec-table-wrap"><b>Key Features</b><ul class="feature-list">'
                   + "".join('<li>%s</li>' % esc(f) for f in features) + '</ul></div>')
    if product.get("description"):
        out.append('<div class="spec-table-wrap"><b>Product Description</b><p class="prose">%s</p></div>'
                   % esc(product["description"]))
    out.append('<div class="internal-links"><b>Explore more</b><div class="link-chips">'
               + ('<a href="%s">All %s</a>'
                  % (esc(category_path(cat["slug"])), esc(cat["name"])) if cat.get("slug") else "")
               + '<a href="/products/">All products</a><a href="/warranty/">Warranty registration</a>'
               '<a href="/service/">Service request</a></div>'
               + ('<b>Similar products</b><div class="link-chips">'
                  + "".join('<a href="/products/%s/">%s</a>' % (esc(urllib.parse.quote(r["slug"])), esc(r["name"]))
                            for r in (related or []))
                  + '</div>' if related else '')
               + '</div>')
    out.append('</div></div>')
    return "\n".join("        " + line for line in out)


def spec_value(product, *labels):
    rows, _ = spec_rows(product.get("specifications"))
    for label, value in rows:
        if label.strip().lower() in labels:
            return value
    return ""


def faq_schema(pairs):
    """FAQPage schema from (question, answer[, question_hi, answer_hi]) tuples.
    Both languages go in, the same as visitors see on the page."""
    def both(en, hi):
        return en + (" / " + hi if hi else "")
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "inLanguage": ["en-IN", "hi-IN"],
        "mainEntity": [
            {"@type": "Question", "name": both(p[0], p[2] if len(p) > 2 else ""),
             "acceptedAnswer": {"@type": "Answer", "text": both(p[1], p[3] if len(p) > 3 else "")}}
            for p in pairs
        ],
    }


FAQ_HEADING = 'FREQUENTLY ASKED <span>QUESTIONS</span>'
FAQ_HEADING_HI = 'अक्सर पूछे जाने वाले सवाल'


def faq_item(q, a, q_hi="", a_hi="", raw=False):
    """One FAQ entry: English first, Hindi under it. raw=True keeps links in
    hand-written answers; generated text is escaped."""
    e = (lambda v: v) if raw else esc
    return ('<details class="faq-item"><summary><span class="faq-q">%s%s</span></summary>'
            '<p>%s</p>%s</details>'
            % (e(q), '<span class="faq-hi" lang="hi">%s</span>' % e(q_hi) if q_hi else "",
               e(a), '<p class="faq-hi" lang="hi">%s</p>' % e(a_hi) if a_hi else ""))


def faq_html(pairs, heading=FAQ_HEADING):
    """Same markup as the hand-written FAQ on the category landing pages."""
    return ('    <section class="section faq" id="faqSection" style="padding-top:0">\n'
            '      <div class="section-head"><div><h2>%s</h2>'
            '<p class="section-sub" lang="hi">%s</p></div></div>\n' % (heading, FAQ_HEADING_HI)
            + "".join("      " + faq_item(*p) + "\n" for p in pairs)
            + '    </section>')


def faq_from_html(html):
    """(question, answer, question_hi, answer_hi) from the FAQ blocks of a
    hand-written page, so the FAQ schema always matches what visitors see."""
    def text(value):
        return clean(html_unescape(re.sub(r"<[^>]+>", " ", value or "")))

    def hindi(block):
        found = re.search(r'class="faq-hi" lang="hi">(.*?)</(?:span|p)>', block, re.S)
        return text(found.group(1)) if found else ""

    def english(block):
        return text(re.sub(r'<(span|p) class="faq-hi" lang="hi">.*?</\1>', "", block, flags=re.S))

    return [(english(q), english(a), hindi(q), hindi(a)) for q, a in
            re.findall(r'<details class="faq-item"><summary>(.*?)</summary>(.*?)</details>', html, re.S)]


def warranty_hi(text):
    for en, hi in (("Years", "साल"), ("Year", "साल"), ("Product", "प्रोडक्ट"),
                   ("Performance", "परफ़ॉर्मेंस"), ("Warranty", "वारंटी")):
        text = text.replace(en, hi)
    return text


def cycles_hi(text):
    return (text.replace("cycles at 80% DoD", "साइकिल (80% DoD पर)")
                .replace("cycles", "साइकिल"))


def product_faq(product, cat):
    """Questions buyers ask before ordering, in English and Hindi, answered only
    from the product's own data and the published shipping / replacement
    policy - nothing that is not already stated on the site."""
    name = product["name"]
    slug = (cat or {}).get("slug") or ""
    faq = []
    volts = spec_value(product, "nominal voltage", "battery voltage")
    if slug == "lithium-batteries" and volts:
        if volts.startswith("51.2"):
            faq.append(("Which inverter works with the %s?" % name,
                        "It is a 51.2 V LiFePO4 battery, so it pairs with a 48 V inverter - for example the "
                        "PowerRun 6.2 kW, 8.2 kW, 10.2 kW and 12 kW hybrid inverters.",
                        "%s किस इन्वर्टर के साथ चलेगी?" % name,
                        "यह 51.2 V की LiFePO4 बैटरी है, इसलिए यह 48 V इन्वर्टर के साथ चलती है - जैसे PowerRun "
                        "के 6.2 kW, 8.2 kW, 10.2 kW और 12 kW हाइब्रिड इन्वर्टर।"))
        elif volts.startswith("25.6"):
            faq.append(("Which inverter works with the %s?" % name,
                        "It is a 25.6 V LiFePO4 battery, so it pairs with a 24 V inverter - for example the "
                        "PowerRun 3.6 kW and 4.2 kW hybrid inverters.",
                        "%s किस इन्वर्टर के साथ चलेगी?" % name,
                        "यह 25.6 V की LiFePO4 बैटरी है, इसलिए यह 24 V इन्वर्टर के साथ चलती है - जैसे PowerRun "
                        "के 3.6 kW और 4.2 kW हाइब्रिड इन्वर्टर।"))
    if slug == "hybrid-inverters" and volts:
        battery = {"48": "51.2 V", "24": "25.6 V"}.get(volts.split()[0])
        if battery:
            faq.append(("Which battery do I need for the %s?" % name,
                        "It runs on a %s battery bank. PowerRun %s LiFePO4 lithium batteries are a direct "
                        "match; choose the capacity (Ah) by how many hours of backup you need." % (volts, battery),
                        "%s के साथ कौन सी बैटरी लगेगी?" % name,
                        "यह %s बैटरी बैंक पर चलता है। PowerRun की %s LiFePO4 लिथियम बैटरी इसके साथ सीधे लग "
                        "जाती है; आपको कितने घंटे का बैकअप चाहिए, उसके हिसाब से क्षमता (Ah) चुनें।"
                        % (volts, battery)))
    if slug == "solar-panels":
        watts = re.match(r"(\d+)", spec_value(product, "peak power"))
        if watts:
            w = int(watts.group(1))
            n = -(-5000 // w)
            faq.append(("How many %d Wp panels do I need for a 5 kW system?" % w,
                        "About %d panels (5,000 W / %d Wp, rounded up). Our team can check the string "
                        "design against your inverter's PV voltage range." % (n, w),
                        "5 kW सिस्टम के लिए %d Wp के कितने पैनल चाहिए?" % w,
                        "लगभग %d पैनल (5,000 W / %d Wp, ऊपर की ओर पूरा करके)। हमारी टीम आपके इन्वर्टर की "
                        "PV वोल्टेज रेंज के हिसाब से स्ट्रिंग डिज़ाइन भी चेक कर देगी।" % (n, w)))
    if slug == "e-rickshaw-batteries" and volts:
        faq.append(("Will the %s fit my e-rickshaw?" % name,
                    "It is a %s LiFePO4 pack for 48 V / 51.2 V e-rickshaw and e-loader systems. Share your "
                    "vehicle model and controller voltage on WhatsApp and we will confirm the fit before you "
                    "order." % volts,
                    "क्या %s मेरे ई-रिक्शा में लगेगी?" % name,
                    "यह %s की LiFePO4 बैटरी है, जो 48 V / 51.2 V ई-रिक्शा और ई-लोडर के लिए बनी है। ऑर्डर से "
                    "पहले अपनी गाड़ी का मॉडल और कंट्रोलर वोल्टेज WhatsApp पर भेजें, हम कन्फ़र्म कर देंगे।" % volts))
    cycles = spec_value(product, "cycle life")
    if cycles:
        faq.append(("How long does the %s last?" % name,
                    "It is rated for %s." % cycles.rstrip("."),
                    "%s कितने समय तक चलती है?" % name,
                    "इसकी रेटिंग %s है।" % cycles_hi(cycles.rstrip("."))))
    if product.get("warranty"):
        warranty = product["warranty"].rstrip(".")
        faq.append(("What warranty does it come with?",
                    "%s. Register the product at powerrun.in/warranty after delivery." % warranty,
                    "इसके साथ कितनी वारंटी मिलती है?",
                    "%s। डिलीवरी के बाद powerrun.in/warranty पर प्रोडक्ट रजिस्टर करें।" % warranty_hi(warranty)))
    faq.append(("How long does delivery take?",
                "Orders are dispatched in 1-2 working days and delivered in 3-7 working days across India, "
                "with online order tracking.",
                "डिलीवरी में कितना समय लगता है?",
                "ऑर्डर 1-2 वर्किंग दिनों में डिस्पैच होता है और पूरे भारत में 3-7 वर्किंग दिनों में डिलीवर हो "
                "जाता है। आप ऑर्डर को ऑनलाइन ट्रैक भी कर सकते हैं।"))
    faq.append(("What if the product arrives damaged or defective?",
                "Damaged, defective or wrong items are replaced within 7 days of delivery - see our refund "
                "policy for details.",
                "अगर प्रोडक्ट टूटा हुआ या ख़राब निकले तो?",
                "टूटा हुआ, ख़राब या ग़लत प्रोडक्ट डिलीवरी के 7 दिन के अंदर बदल दिया जाता है। पूरी जानकारी "
                "हमारी रिफ़ंड पॉलिसी में है।"))
    faq.append(("Can you help me choose the right model?",
                "Yes. Message us on WhatsApp or call +91 87003 07676 with your load and backup needs and our "
                "team will suggest the right size.",
                "क्या आप सही मॉडल चुनने में मदद करेंगे?",
                "हाँ। अपना लोड और कितने घंटे का बैकअप चाहिए, यह WhatsApp पर भेजें या +91 87003 07676 पर कॉल "
                "करें - हमारी टीम सही साइज़ बताएगी।"))
    return faq


def static_card(product, cat, images):
    """No-JavaScript version of PR.productCard() in catalog.js."""
    url = "/products/%s/" % urllib.parse.quote(product["slug"])
    if images:
        # the 500px copy at thumb/<path> that PR.thumbImg() uses, falling back
        # to the full listing image if the thumbnail is missing
        full = images[0]
        thumb = full.replace("/object/public/product-images/", "/object/public/product-images/thumb/", 1)
        img = ('<img src="%s" data-full="%s" alt="%s"%s loading="lazy" width="400" height="400">'
               % (esc(thumb), esc(full), esc(product["name"]),
                  ' onerror="this.onerror=null;this.src=this.dataset.full"' if thumb != full else ""))
    else:
        img = '<div class="ph">%s</div>' % esc("".join(w[0] for w in product["name"].split()[:2]).upper())
    price, mrp = product.get("price"), product.get("mrp")
    if price:
        block = '<div class="card-price"><span class="price">%s</span>' % money(price)
        if mrp and float(mrp) > float(price):
            block += ('<span class="card-mrp">%s</span><span class="card-off">%d%% OFF</span></div>'
                      '<div class="card-save">You save %s</div>'
                      % (money(mrp), round((1 - float(price) / float(mrp)) * 100), money(float(mrp) - float(price))))
        else:
            block += '</div>'
    else:
        block = '<div class="card-price"><span class="price">Price on request</span></div>'
    sku = '<div class="card-sku">%s</div>' % esc(product["sku"]) if product.get("sku") else ""
    return ('<article class="card"><a class="card-img" href="%s" aria-label="%s">%s</a>'
            '<div class="card-body"><span class="catname">%s</span><h3><a href="%s">%s</a></h3><p>%s</p>%s%s'
            '<div class="card-actions"><a class="btn orange" href="%s">VIEW DETAILS</a></div></div></article>'
            % (url, esc(product["name"]), img, esc((cat or {}).get("name") or "PowerRun"), url,
               esc(product["name"]), esc(product.get("short_description")), block, sku, url))


def asset_stamp():
    """Same hash scripts/stamp_assets.py uses, so generated pages already carry
    the right ?v= and the stamping step has nothing left to rewrite."""
    import glob
    import hashlib
    here = os.getcwd()
    os.chdir(ROOT)
    try:
        files = sorted(glob.glob("assets/**/*.js", recursive=True) +
                       glob.glob("assets/**/*.css", recursive=True))
        digest = hashlib.sha1()
        for path in files:
            digest.update(io.open(path, "rb").read())
        return digest.hexdigest()[:8]
    finally:
        os.chdir(here)


def versioned(html, stamp):
    html = re.sub(r'(src="/assets/[^"\']+?\.js)"', r"\1?v=" + stamp + '"', html)
    return re.sub(r'(href="/assets/[^"\']+?\.css)"', r"\1?v=" + stamp + '"', html)


def main():
    _, _, site = config()
    stamp = asset_stamp()
    g = (fetch("global_seo?select=*&id=eq.1") or [{}])[0]
    site = (g.get("site_url") or site).rstrip("/")
    site_name = g.get("site_name") or "PowerRun Industries"
    default_image = g.get("og_image") or (site + "/assets/powerrun-logo.png")
    gsc = g.get("gsc_verification")

    pages = fetch("page_seo?select=*&order=sort_order")
    categories = fetch("categories?select=id,name,slug,parent_id,is_active,meta_title,meta_description,"
                       "focus_keyword,canonical_url,og_image,seo_index,seo_follow&is_active=eq.true")
    products = fetch("products?select=id,name,slug,sku,price,mrp,stock,warranty,specifications,features,availability,short_description,description,"
                     "meta_title,meta_description,focus_keyword,secondary_keywords,canonical_url,og_title,"
                     "og_description,og_image,image_alt,seo_index,seo_follow,category_id,updated_at,"
                     "product_images(image_url,sort_order)&is_active=eq.true&order=sort_order")
    cat_by_id = {c["id"]: c for c in categories}

    reviews_by_product = {}
    for r in fetch("product_reviews?select=product_id,rating,customer_name,body,created_at&status=eq.approved"):
        reviews_by_product.setdefault(r["product_id"], []).append(r)

    company = {}
    for row in fetch("site_settings?select=key,value&key=eq.company"):
        company = row.get("value") or {}

    written, sitemap = [], []
    today = datetime.date.today().isoformat()

    def add_url(loc, lastmod=today, priority="0.7", changefreq="weekly", images=()):
        if loc not in [u[0] for u in sitemap]:
            sitemap.append((loc, lastmod, priority, changefreq, list(images)))

    org = {
        "@context": "https://schema.org", "@type": "Organization",
        "@id": site + "/#organization", "name": site_name, "url": site + "/",
        "logo": default_image, "email": "service@powerrun.in", "telephone": "+91 87003 07676",
        "areaServed": "IN",
        "sameAs": ["https://www.youtube.com/@PowerRunIndustries"],
    }
    if company.get("address_line1") or company.get("city"):
        org["address"] = {k: v for k, v in {
            "@type": "PostalAddress",
            "streetAddress": clean(" ".join(x for x in [company.get("address_line1"), company.get("address_line2")] if x)),
            "addressLocality": company.get("city") or None,
            "addressRegion": company.get("state") or None,
            "postalCode": company.get("pincode") or None,
            "addressCountry": "IN",
        }.items() if v}

    # ---------------------------------------------------------------- pages
    for page in pages:
        path = page["path"]
        rel = "index.html" if path == "/" else path.strip("/") + "/index.html"
        target = os.path.join(ROOT, rel.replace("/", os.sep))
        if not os.path.isfile(target):
            print("  skip (no file):", path)
            continue
        canonical = page.get("canonical_url") or (site + path)
        # /product/ is only the old ?slug= address that forwards to /products/<slug>/;
        # on its own it is an empty "No product selected" page, never index it
        indexable = page.get("seo_index", True) and path != "/product/"
        robots = ("index," if indexable else "noindex,") + ("follow" if page.get("seo_follow", True) else "nofollow")
        if indexable:
            robots += ",max-image-preview:large"
        schema = [org]
        if page["page_key"] == "home":
            schema.append({
                "@context": "https://schema.org", "@type": "WebSite", "@id": site + "/#website",
                "url": site + "/", "name": site_name, "publisher": {"@id": site + "/#organization"},
                "potentialAction": {
                    "@type": "SearchAction",
                    "target": {"@type": "EntryPoint",
                               "urlTemplate": site + "/products/?q={search_term_string}"},
                    "query-input": "required name=search_term_string",
                },
            })
        block = head_block(
            title=page.get("title") or g.get("meta_title") or site_name,
            description=clean(page.get("description") or g.get("meta_description"), 300),
            canonical=canonical,
            image=page.get("og_image") or default_image,
            site_name=site_name,
            keywords=page.get("keywords") or (g.get("keywords") if page["page_key"] == "home" else ""),
            robots=robots, gsc=gsc, schema=schema)
        html = io.open(target, encoding="utf-8").read()
        io.open(target, "w", encoding="utf-8").write(replace_head(html, block))
        written.append(rel)
        if indexable and page.get("in_sitemap", True):
            add_url(canonical, priority=str(page.get("sitemap_priority") or 0.8))

    # ----------------------------------------------------------- categories
    # a category with no active products is an empty listing - keep it out of
    # the sitemap until it has something in it (thin pages hurt the whole site)
    stocked = set()
    for product in products:
        stocked.add(product.get("category_id"))
        parent = (cat_by_id.get(product.get("category_id")) or {}).get("parent_id")
        if parent:
            stocked.add(parent)
    for cat in categories:
        if cat.get("parent_id") or cat.get("seo_index") is False or cat["id"] not in stocked:
            continue
        add_url(cat.get("canonical_url") or (site + category_path(cat["slug"])), priority="0.8")

    # category landing pages (/hybrid-inverters/ ...): SEO block, a static
    # product grid and FAQ schema. The intro, guide and FAQ text are
    # hand-written in the page and never touched here.
    for cat in categories:
        if cat.get("parent_id") or category_path(cat["slug"]).startswith("/products/"):
            continue
        rel = cat["slug"] + "/index.html"
        target = os.path.join(ROOT, cat["slug"], "index.html")
        html = io.open(target, encoding="utf-8").read()
        canonical = cat.get("canonical_url") or (site + category_path(cat["slug"]))
        title_now = re.search(r"<title>(.*?)</title>", html, re.S)
        desc_now = re.search(r'<meta name="description" content="(.*?)"', html)
        members = [p for p in products if p.get("category_id") == cat["id"]
                   or (cat_by_id.get(p.get("category_id")) or {}).get("parent_id") == cat["id"]]
        indexable = cat.get("seo_index") is not False
        robots = ("index," if indexable else "noindex,") + ("follow" if cat.get("seo_follow") is not False else "nofollow")
        if indexable:
            robots += ",max-image-preview:large"
        schema = [org, breadcrumb_schema([("Home", site + "/"), ("Products", site + "/products/"),
                                          (cat["name"], canonical)])]
        pairs = faq_from_html(html)
        if pairs:
            schema.append(faq_schema(pairs))
        first_images = images_of(members[0]) if members else []
        block = head_block(
            title=cat.get("meta_title") or (html_unescape(title_now.group(1)) if title_now else cat["name"]),
            description=clean(cat.get("meta_description") or (html_unescape(desc_now.group(1)) if desc_now else ""), 300),
            canonical=canonical,
            image=cat.get("og_image") or (first_images[0] if first_images else default_image),
            site_name=site_name, keywords=cat.get("focus_keyword") or "",
            robots=robots, gsc=gsc, schema=schema)
        html = replace_head(html, block)
        if members:
            cards = "\n".join(static_card(p, cat, images_of(p)) for p in members)
            html = re.sub(r"<!-- GRID:START -->.*?<!-- GRID:END -->",
                          lambda m: "<!-- GRID:START -->\n" + cards + "\n<!-- GRID:END -->", html, flags=re.S)
        html = versioned(re.sub(r'(/assets/[^"\']+?\.(?:js|css))\?v=[0-9a-f]+"', r'\1"', html), stamp)
        io.open(target, "w", encoding="utf-8").write(html)
        written.append(rel)
        if indexable and members:
            add_url(canonical, priority="0.8")

    # ------------------------------------------------------------- products
    product_dir = os.path.join(ROOT, "products")
    keep = set()
    for product in products:
        slug = product["slug"]
        keep.add(slug)
        canonical = product.get("canonical_url") or (site + "/products/" + urllib.parse.quote(slug) + "/")
        images = [i["image_url"] for i in sorted(product.get("product_images") or [],
                                                 key=lambda x: x.get("sort_order") or 0)]
        title = product.get("meta_title") or (product["name"] + " | " + site_name)
        description = clean(product.get("meta_description") or product.get("short_description")
                            or (product["name"] + " from " + site_name + "."), 300)
        cat = cat_by_id.get(product.get("category_id")) or {}
        crumbs = [("Home", site + "/"), ("Products", site + "/products/")]
        if cat.get("slug"):
            crumbs.append((cat["name"], site + category_path(cat["slug"])))
        crumbs.append((product["name"], canonical))
        indexable = product.get("seo_index", True)
        robots = ("index," if indexable else "noindex,") + ("follow" if product.get("seo_follow", True) else "nofollow")
        if indexable:
            robots += ",max-image-preview:large"
        block = head_block(
            title=title, description=description, canonical=canonical,
            image=product.get("og_image") or (images[0] if images else default_image),
            site_name=site_name,
            keywords=", ".join(x for x in [product.get("focus_keyword"), product.get("secondary_keywords")] if x),
            robots=robots, og_type="product", gsc=gsc,
            schema=[org, product_schema(product, canonical, images, site_name,
                                         reviews_by_product.get(product["id"]), site), breadcrumb_schema(crumbs),
                    faq_schema(product_faq(product, cat))])
        same_cat = [p for p in products if p["id"] != product["id"] and p.get("category_id") == product.get("category_id")]
        same_sub = [p for p in same_cat if p.get("subcategory_id") and p.get("subcategory_id") == product.get("subcategory_id")]
        related = (same_sub + [p for p in same_cat if p not in same_sub])[:4]
        folder = os.path.join(product_dir, slug)
        os.makedirs(folder, exist_ok=True)
        io.open(os.path.join(folder, "index.html"), "w", encoding="utf-8").write(
            versioned(PRODUCT_TEMPLATE.format(head=block, content=prerender_product(product, cat, images, related),
                                              faq=faq_html(product_faq(product, cat))),
                      stamp))
        written.append("products/%s/index.html" % slug)
        if indexable:
            add_url(canonical, lastmod=(product.get("updated_at") or today)[:10], priority="0.7",
                    images=images)

    # ----------------------------------------------------------------- blog
    # pages written by scripts/blog_build.py (no database involved)
    blog_dir = os.path.join(ROOT, "blog")
    if os.path.isdir(blog_dir):
        for name in [""] + sorted(os.listdir(blog_dir)):
            page = os.path.join(blog_dir, name, "index.html")
            if not os.path.isfile(page):
                continue
            html = io.open(page, encoding="utf-8").read()
            if 'content="noindex' in html:
                continue
            modified = re.search(r'"dateModified":"(\d{4}-\d{2}-\d{2})"', html)
            add_url(site + "/blog/" + (name + "/" if name else ""),
                    lastmod=modified.group(1) if modified else today, priority="0.6" if name else "0.7")

    # remove pages for products that no longer exist / are inactive
    removed = []
    if os.path.isdir(product_dir):
        for name in os.listdir(product_dir):
            folder = os.path.join(product_dir, name)
            if not os.path.isdir(folder) or name in keep:
                continue
            index = os.path.join(folder, "index.html")
            if os.path.isfile(index) and "id=\"productContent\"" in io.open(index, encoding="utf-8").read():
                os.remove(index)
                os.rmdir(folder)
                removed.append(name)

    # -------------------------------------------------------------- sitemap
    xml = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
           ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">']
    for loc, lastmod, priority, changefreq, pics in sitemap:
        xml.append("  <url><loc>%s</loc><lastmod>%s</lastmod><changefreq>%s</changefreq>"
                   "<priority>%s</priority>%s</url>"
                   % (esc(loc), lastmod, changefreq, priority,
                      "".join("<image:image><image:loc>%s</image:loc></image:image>" % esc(u)
                              for u in pics)))
    xml.append("</urlset>")
    io.open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8").write("\n".join(xml) + "\n")

    # --------------------------------------------------------------- robots
    robots_txt = (g.get("robots_txt") or "").strip() or DEFAULT_ROBOTS.format(site=site)
    if "Sitemap:" not in robots_txt:
        robots_txt = robots_txt.rstrip() + "\n\nSitemap: %s/sitemap.xml\n" % site
    io.open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8").write(robots_txt.rstrip() + "\n")

    print("pages rewritten : %d" % len([w for w in written if not w.startswith("products/")]))
    print("product pages   : %d  (removed %d)" % (len([w for w in written if w.startswith("products/")]), len(removed)))
    print("sitemap URLs    : %d" % len(sitemap))
    print("robots.txt      : %d bytes" % len(robots_txt))
    print("\nNext: python scripts/stamp_assets.py, then commit and push.")


if __name__ == "__main__":
    sys.exit(main())
