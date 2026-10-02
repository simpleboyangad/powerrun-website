#!/usr/bin/env python
"""
PowerRun Industries - make the 500px product-card thumbnails.

Product cards and thumbnail strips load thumb/<storage_path> from the
product-images bucket (see PR.thumbUrl in assets/js/catalog.js) instead of the
full 2000px listing image. The admin panel makes a thumbnail on upload; this
fills in any image that does not have one yet.

    python scripts/make_thumbs.py          only images without a thumbnail
    python scripts/make_thumbs.py --all    rebuild every thumbnail

Uses the service_role key via pr_data.py (never printed).
"""
import io
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pr_data as pd  # noqa: E402

BUCKET = "product-images"
SIZE = 500


def public_url(path):
    return "{}/storage/v1/object/public/{}/{}".format(pd.BASE, BUCKET, urllib.parse.quote(path))


def exists(path):
    req = urllib.request.Request(public_url(path), method="HEAD")
    try:
        urllib.request.urlopen(req, timeout=60)
        return True
    except urllib.error.HTTPError:
        return False


def thumbnail(data):
    img = Image.open(io.BytesIO(data))
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        img = bg
    img = img.convert("RGB")
    img.thumbnail((SIZE, SIZE), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=80, optimize=True, progressive=True)
    return out.getvalue()


def upload(path, data):
    key = pd.service_key()
    req = urllib.request.Request(
        "{}/storage/v1/object/{}/{}".format(pd.BASE, BUCKET, urllib.parse.quote(path)),
        data=data, method="POST",
        headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "image/jpeg",
                 "cache-control": "max-age=31536000", "x-upsert": "true"})
    urllib.request.urlopen(req, timeout=120).read()


def main():
    rebuild = "--all" in sys.argv
    rows = pd.rest("product_images", "select=storage_path&order=storage_path") or []
    made = skipped = failed = 0
    for row in rows:
        path = row.get("storage_path")
        if not path:
            continue
        thumb = "thumb/" + path
        if not rebuild and exists(thumb):
            skipped += 1
            continue
        try:
            with urllib.request.urlopen(public_url(path), timeout=120) as resp:
                original = resp.read()
            small = thumbnail(original)
            upload(thumb, small)
            made += 1
            print("  {}  {} KB -> {} KB".format(path, len(original) // 1024, len(small) // 1024))
        except Exception as err:  # keep going; a card just falls back to the full image
            failed += 1
            print("  FAILED {}: {}".format(path, err))
    print("thumbnails: {} made, {} already there, {} failed".format(made, skipped, failed))


if __name__ == "__main__":
    main()
