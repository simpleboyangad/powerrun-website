#!/usr/bin/env python
"""
PowerRun Industries - Google Merchant Center product feed.

Builds merchant-feed.xml (Google Shopping RSS 2.0 format) at the site root
from live product data. Only products with at least one photo are included,
since Merchant Center rejects items without an image.

Usage
-----
  python scripts/merchant_feed.py            write merchant-feed.xml

scripts/seo_build.py also calls build() on every run, so the feed's prices
and stock never drift from the site. Only public (anon) data is read.
"""
import html
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seo_build import fetch  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://powerrun.in"
BRAND = "PowerRun Industries"


def esc(s):
    return html.escape(s or "", quote=False)


def build():
    rows = fetch(
        "products?select=sku,name,slug,brand,short_description,description,price,mrp,stock,"
        "categories!products_category_id_fkey(name),product_images(image_url,sort_order)"
        "&is_active=eq.true&order=sku"
    )

    items = []
    no_photo = 0
    for p in rows:
        images = sorted(p["product_images"], key=lambda x: x["sort_order"])
        brand = (p.get("brand") or "").strip()
        if brand:
            # Resold parts (JK / JBD / Daly BMS, connectors): only their real
            # supplier photos (<n>-photo.jpg, plain product on white) may go to
            # Shopping. Their spec-card illustrations carry text, which Google
            # disapproves as a promotional overlay, so a part with no photo
            # stays off the feed until one is added.
            images = [i for i in images if i["image_url"].endswith("-photo.jpg")]
        if not images:
            no_photo += 1
            continue  # Merchant Center requires an image; skip products without a usable one

        link = "{}/products/{}/".format(SITE, p["slug"])
        desc = p.get("description") or p.get("short_description") or p["name"]
        price = p["price"]
        availability = "in_stock" if (p.get("stock") or 0) > 0 else "out_of_stock"
        category = (p.get("categories") or {}).get("name") or ""

        parts = [
            "  <item>",
            "    <g:id>{}</g:id>".format(esc(p["sku"])),
            "    <title>{}</title>".format(esc(p["name"])),
            "    <description>{}</description>".format(esc(desc)),
            "    <link>{}</link>".format(esc(link)),
            "    <g:image_link>{}</g:image_link>".format(esc(images[0]["image_url"])),
        ]
        for extra in images[1:10]:
            parts.append("    <g:additional_image_link>{}</g:additional_image_link>".format(esc(extra["image_url"])))
        parts += [
            "    <g:availability>{}</g:availability>".format(availability),
            "    <g:condition>new</g:condition>",
        ]
        # g:brand is the maker: PowerRun for its own products, the real brand
        # for resold parts, and left out for unbranded ("Generic") ones, which
        # Google asks not to label with a made-up brand.
        if not brand:
            parts.append("    <g:brand>{}</g:brand>".format(esc(BRAND)))
        elif brand.lower() != "generic":
            parts.append("    <g:brand>{}</g:brand>".format(esc(brand)))
        parts += [
            "    <g:identifier_exists>no</g:identifier_exists>",
        ]
        if category:
            parts.append("    <g:product_type>{}</g:product_type>".format(esc(category)))
        # Only the real selling price. MRP was sent as <g:price> with the
        # selling price as <g:sale_price>, which tells Google every product is
        # on a 20-56% sale - a misrepresentation risk without that price history.
        parts.append("    <g:price>{:.2f} INR</g:price>".format(price))
        parts.append("  </item>")
        items.append("\n".join(parts))

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n'
        "<channel>\n"
        "  <title>{} Product Feed</title>\n"
        "  <link>{}</link>\n"
        "  <description>Lithium batteries, hybrid solar inverters, solar panels, BMS and battery parts.</description>\n"
        "{}\n"
        "</channel>\n"
        "</rss>\n"
    ).format(esc(BRAND), SITE, "\n".join(items))

    out_path = os.path.join(ROOT, "merchant-feed.xml")
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(xml)
    print("wrote", out_path, "-", len(items), "products (", no_photo, "skipped: no product photo yet )")


if __name__ == "__main__":
    build()
