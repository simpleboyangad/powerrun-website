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

       - one real page per product at /products/<slug>/  (clean, indexable URL)
       - sitemap.xml   every indexable page, category and product, no duplicates
       - robots.txt    from global_seo.robots_txt, or a safe default

Run it after changing SEO settings in the admin panel, then commit and push:

    python scripts/seo_build.py
    python scripts/stamp_assets.py

Reads Supabase with the PUBLIC (publishable) key only - it needs no secrets.
"""
import datetime
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
           "Product": "ld-product", "BreadcrumbList": "ld-breadcrumb"}
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
        <div class="empty-state"><h3>Loading product…</h3><p>One moment please.</p></div>
      </div>
    </section>
    <section class="section" id="relatedSection" hidden style="padding-top:0">
      <div class="section-head"><h2>RELATED <span>PRODUCTS</span></h2></div>
      <div class="products" id="relatedGrid"></div>
    </section>
</main>
<div id="pr-footer"></div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/dist/umd/supabase.js"></script>
<script src="/assets/js/config.js"></script>
<script src="/assets/js/core.js"></script>
<script src="/assets/js/seo.js"></script>
<script src="/assets/js/cart.js"></script>
<script src="/assets/js/layout.js"></script>
<script src="/assets/js/catalog.js"></script>
<script src="/assets/js/pages/product.js"></script>
</body>
</html>
"""


def product_schema(product, canonical, images, site_name):
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
            "url": canonical,
            "availability": ("https://schema.org/InStock"
                             if (product.get("availability") or "in_stock") == "in_stock"
                             and (product.get("stock") or 0) > 0
                             else "https://schema.org/OutOfStock"),
            "seller": {"@type": "Organization", "name": site_name},
        }
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


def main():
    _, _, site = config()
    g = (fetch("global_seo?select=*&id=eq.1") or [{}])[0]
    site = (g.get("site_url") or site).rstrip("/")
    site_name = g.get("site_name") or "PowerRun Industries"
    default_image = g.get("og_image") or (site + "/assets/powerrun-logo.png")
    gsc = g.get("gsc_verification")

    pages = fetch("page_seo?select=*&order=sort_order")
    categories = fetch("categories?select=id,name,slug,parent_id,is_active,meta_title,meta_description,"
                       "focus_keyword,canonical_url,og_image,seo_index,seo_follow&is_active=eq.true")
    products = fetch("products?select=id,name,slug,sku,price,stock,availability,short_description,description,"
                     "meta_title,meta_description,focus_keyword,secondary_keywords,canonical_url,og_title,"
                     "og_description,og_image,image_alt,seo_index,seo_follow,category_id,updated_at,"
                     "product_images(image_url,sort_order)&is_active=eq.true&order=sort_order")
    cat_by_id = {c["id"]: c for c in categories}

    written, sitemap = [], []
    today = datetime.date.today().isoformat()

    def add_url(loc, lastmod=today, priority="0.7", changefreq="weekly"):
        if loc not in [u[0] for u in sitemap]:
            sitemap.append((loc, lastmod, priority, changefreq))

    org = {
        "@context": "https://schema.org", "@type": "Organization",
        "@id": site + "/#organization", "name": site_name, "url": site + "/",
        "logo": default_image, "email": "info@powerrun.in", "telephone": "+91 87003 07676",
        "areaServed": "IN",
    }

    # ---------------------------------------------------------------- pages
    for page in pages:
        path = page["path"]
        rel = "index.html" if path == "/" else path.strip("/") + "/index.html"
        target = os.path.join(ROOT, rel.replace("/", os.sep))
        if not os.path.isfile(target):
            print("  skip (no file):", path)
            continue
        canonical = page.get("canonical_url") or (site + path)
        indexable = page.get("seo_index", True)
        robots = ("index," if indexable else "noindex,") + ("follow" if page.get("seo_follow", True) else "nofollow")
        if indexable:
            robots += ",max-image-preview:large"
        schema = [org]
        if page["page_key"] == "home":
            schema.append({
                "@context": "https://schema.org", "@type": "WebSite", "@id": site + "/#website",
                "url": site + "/", "name": site_name, "publisher": {"@id": site + "/#organization"},
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
    for cat in categories:
        if cat.get("parent_id") or cat.get("seo_index") is False:
            continue
        add_url(cat.get("canonical_url") or (site + "/products/?category=" + urllib.parse.quote(cat["slug"])),
                priority="0.8")

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
            crumbs.append((cat["name"], site + "/products/?category=" + urllib.parse.quote(cat["slug"])))
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
            schema=[org, product_schema(product, canonical, images, site_name), breadcrumb_schema(crumbs)])
        folder = os.path.join(product_dir, slug)
        os.makedirs(folder, exist_ok=True)
        io.open(os.path.join(folder, "index.html"), "w", encoding="utf-8").write(
            PRODUCT_TEMPLATE.format(head=block))
        written.append("products/%s/index.html" % slug)
        if indexable:
            add_url(canonical, lastmod=(product.get("updated_at") or today)[:10], priority="0.7")

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
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod, priority, changefreq in sitemap:
        xml.append("  <url><loc>%s</loc><lastmod>%s</lastmod><changefreq>%s</changefreq>"
                   "<priority>%s</priority></url>" % (esc(loc), lastmod, changefreq, priority))
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
