#!/usr/bin/env python
"""
PowerRun Industries - close the public website, or open it again. Nothing is deleted.

    python scripts/site_mode.py status
    python scripts/site_mode.py close     # every public page shows "Ye website abhi band hai"
    python scripts/site_mode.py open      # the website as it was before closing

close:
  - remembers the current commit in site-mode.json (the website as it was),
  - index.html and 404.html become scripts/closed_page.html (every other public page
    is left out of the published site via _config.yml, so its address shows the 404 =
    closed page), robots.txt loses the sitemap, merchant-feed.xml is emptied so
    Google Merchant Center drops the products,
  - the shop database is closed separately: sql/53_site_closed.sql (no orders,
    no payments, no public catalogue). Admin keeps working.
  - blog_build / seo_build / merchant_feed refuse to run while closed, so a
    rebuild (publish-seo.bat, scheduled SEO tasks) can not bring pages back.
open:
  - puts those files back from the remembered commit, removes site-mode.json and
    sets site_settings.site_closed to false. Then run publish-seo.bat (or blog_build,
    seo_build, stamp_assets) to refresh prices and the sitemap.
"""
import datetime
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = os.path.join(ROOT, "site-mode.json")
CLOSED_PAGE = os.path.join(ROOT, "scripts", "closed_page.html")
TOUCHED = ["_config.yml", "index.html", "404.html", "robots.txt", "merchant-feed.xml"]

# kept on the published site while closed: the admin panel and what it needs
KEEP = {"admin", "assets", "favicon.ico", "CNAME", "robots.txt", "index.html", "404.html",
        "merchant-feed.xml", "_config.yml", "site-mode.json"}
CLOSED_MARK = "# --- site closed (scripts/site_mode.py) ---"

EMPTY_FEED = """<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>PowerRun Industries</title>
    <link>https://powerrun.in/</link>
    <description>No products - the online shop is closed.</description>
  </channel>
</rss>
"""


def is_closed():
    try:
        with open(STATE, encoding="utf-8") as f:
            return bool(json.load(f).get("closed"))
    except (OSError, ValueError):
        return False


def refuse_if_closed(what):
    """called at the start of the page / feed builders"""
    if is_closed():
        print("Website band hai (site-mode.json) - %s nahi chalega. Kholne ke liye: python scripts/site_mode.py open" % what)
        sys.exit(0)


def git(*args):
    return subprocess.check_output(["git"] + list(args), cwd=ROOT, text=True).strip()


def published_entries():
    """top-level files / folders that are in the repository"""
    names = set(line.split("/")[0] for line in git("ls-files").splitlines() if line)
    return sorted(n for n in names if not n.startswith("."))


def close():
    if is_closed():
        sys.exit("Website pehle se band hai.")
    dirty = [f for f in TOUCHED if git("status", "--porcelain", "--", f)]
    if dirty:
        sys.exit("Ye files abhi badli hui hain, pehle commit karein: " + ", ".join(dirty))
    open_commit = git("rev-parse", "HEAD")

    with open(CLOSED_PAGE, encoding="utf-8") as f:
        page = f.read()
    for name in ("index.html", "404.html"):
        with open(os.path.join(ROOT, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(page)

    with open(os.path.join(ROOT, "merchant-feed.xml"), "w", encoding="utf-8", newline="\n") as f:
        f.write(EMPTY_FEED)

    robots_path = os.path.join(ROOT, "robots.txt")
    with open(robots_path, encoding="utf-8") as f:
        robots = [l for l in f.read().splitlines() if not l.lower().startswith("sitemap:")]
    with open(robots_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(robots).rstrip() + "\n")

    cfg_path = os.path.join(ROOT, "_config.yml")
    with open(cfg_path, encoding="utf-8") as f:
        cfg = f.read().rstrip("\n")
    already = set(l.strip()[2:].strip().rstrip("/") for l in cfg.splitlines() if l.strip().startswith("- "))
    hide = [n for n in published_entries() if n not in KEEP and n not in already]
    cfg += "\n" + CLOSED_MARK + "\n" + "".join("  - %s\n" % (n + "/" if os.path.isdir(os.path.join(ROOT, n)) else n) for n in hide)
    with open(cfg_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(cfg)

    with open(STATE, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"closed": True, "since": datetime.date.today().isoformat(), "open_commit": open_commit,
                   "note": "python scripts/site_mode.py open - website wapas pehle jaisa"}, f, indent=2)
        f.write("\n")
    print("Website band: %d folders/files chhupaye, index + 404 = band page, Merchant feed khaali." % len(hide))
    print("Ab commit + push karein. Database bhi band karein: sql/53_site_closed.sql")


def reopen():
    if not is_closed():
        sys.exit("Website band nahi hai.")
    with open(STATE, encoding="utf-8") as f:
        state = json.load(f)
    git("checkout", state["open_commit"], "--", *TOUCHED)
    os.remove(STATE)
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import supabase_admin as sa
        sa.run_sql("update public.site_settings set value = jsonb_build_object('closed', false) where key = 'site_closed'")
        print("Database: shop khul gaya (site_closed = false).")
    except SystemExit as err:
        print("Database update nahi hua (%s) - ye SQL chalayein:\n  update site_settings set value = '{\"closed\": false}' where key = 'site_closed';" % err)
    print("Website files wapas aa gayi. Ab publish-seo.bat chalayein (ya blog_build, seo_build, stamp_assets) aur push karein.")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "close":
        close()
    elif cmd == "open":
        reopen()
    else:
        print("Website band hai." if is_closed() else "Website khuli hai.")
