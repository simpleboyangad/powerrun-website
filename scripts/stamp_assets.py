#!/usr/bin/env python
"""
Re-stamp asset URLs with a content hash.

GitHub Pages caches /assets/* in the browser. Without a version marker a
returning visitor can run a mix of old and new JavaScript after a deploy, which
produces bugs that are invisible to anyone testing with a fresh browser.

Run this after changing anything under assets/, before committing:

    python scripts/stamp_assets.py

It also writes the static header/footer into every page (static_chrome.py).
"""
import glob
import hashlib
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    os.chdir(ROOT)

    assets = sorted(
        glob.glob("assets/**/*.js", recursive=True)
        + glob.glob("assets/**/*.css", recursive=True)
    )
    digest = hashlib.sha1()
    for path in assets:
        digest.update(io.open(path, "rb").read())
    stamp = digest.hexdigest()[:8]

    # favicon / app icons get their own version, so browsers fetch a new icon
    # as soon as it changes instead of keeping the cached one for weeks
    icons = ["favicon.ico", "assets/icon-192.png", "assets/apple-touch-icon.png"]
    icon_digest = hashlib.sha1()
    for path in icons:
        icon_digest.update(io.open(path, "rb").read())
    icon_stamp = icon_digest.hexdigest()[:8]
    icon_href = re.compile(r'href="(/favicon\.ico|/assets/icon-192\.png|/assets/apple-touch-icon\.png)(?:\?v=[0-9a-f]+)?"')

    pages = (
        glob.glob("*.html")
        + glob.glob("*/index.html")
        + glob.glob("*/*/index.html")
        + glob.glob("*/*/*/index.html")
    )

    changed = 0
    for page in pages:
        original = io.open(page, encoding="utf-8").read()
        html = re.sub(r"(/assets/[^\"']+?\.(?:js|css))\?v=[0-9a-f]+", r"\1", original)
        html = re.sub(r'(src="/assets/[^"\']+?\.js)"', r"\1?v=" + stamp + '"', html)
        html = re.sub(r'(href="/assets/[^"\']+?\.css)"', r"\1?v=" + stamp + '"', html)
        html = icon_href.sub(lambda m: 'href="%s?v=%s"' % (m.group(1), icon_stamp), html)
        # Customer pages: external scripts load with defer, so the hero and the
        # rest of the HTML paint before ~250 KB of JavaScript (supabase-js
        # included) is parsed. Defer keeps their order and still runs before
        # DOMContentLoaded, which is where every page script starts. Admin
        # pages are left as they are.
        if not page.replace("\\", "/").startswith("admin/"):
            html = re.sub(r'<script src="([^"]+)"></script>', r'<script defer src="\1"></script>', html)
        if html != original:
            io.open(page, "w", encoding="utf-8", newline="\n").write(html)
            changed += 1

    # crawlable copy of the header/footer links (see scripts/static_chrome.py)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import static_chrome
    baked = static_chrome.bake_all()

    print("assets hashed : {} files".format(len(assets)))
    print("build stamp   : {}".format(stamp))
    print("pages updated : {} of {}".format(changed, len(pages)))
    print("static chrome : {} pages refreshed".format(baked))


if __name__ == "__main__":
    main()
