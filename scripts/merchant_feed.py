#!/usr/bin/env python
"""
PowerRun Industries - Google Merchant Center product feed.

Builds merchant-feed.xml (Google Shopping RSS 2.0 format) at the site root
from live product data. Only products with at least one photo are included,
since Merchant Center rejects items without an image.

Usage
-----
  python scripts/merchant_feed.py            write merchant-feed.xml
"""
import html
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pr_data as pd  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://powerrun.in"
BRAND = "PowerRun Industries"


def esc(s):
    return html.escape(s or "", quote=False)


def build():
    rows = pd.rest(
        "products",
        "select=sku,name,slug,short_description,description,price,mrp,stock,"
        "categories!products_category_id_fkey(name),product_images(image_url,sort_order)"
        "&order=sku"
    )

    items = []
    for p in rows:
        images = sorted(p["product_images"], key=lambda x: x["sort_order"])
        if not images:
            continue  # Merchant Center requires an image; skip products without one yet

        link = "{}/products/{}/".format(SITE, p["slug"])
        desc = p.get("description") or p.get("short_description") or p["name"]
        price = p["price"]
        mrp = p.get("mrp") or price
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
            "    <g:brand>{}</g:brand>".format(esc(BRAND)),
            "    <g:identifier_exists>no</g:identifier_exists>",
        ]
        if category:
            parts.append("    <g:product_type>{}</g:product_type>".format(esc(category)))
        if mrp and mrp > price:
            parts.append("    <g:price>{:.2f} INR</g:price>".format(mrp))
            parts.append("    <g:sale_price>{:.2f} INR</g:sale_price>".format(price))
        else:
            parts.append("    <g:price>{:.2f} INR</g:price>".format(price))
        parts.append("  </item>")
        items.append("\n".join(parts))

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n'
        "<channel>\n"
        "  <title>{} Product Feed</title>\n"
        "  <link>{}</link>\n"
        "  <description>Lithium batteries, hybrid solar inverters and solar panels.</description>\n"
        "{}\n"
        "</channel>\n"
        "</rss>\n"
    ).format(esc(BRAND), SITE, "\n".join(items))

    out_path = os.path.join(ROOT, "merchant-feed.xml")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(xml)
    print("wrote", out_path, "-", len(items), "products (", len(rows) - len(items), "skipped, no photos yet )")


if __name__ == "__main__":
    build()
