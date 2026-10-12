"""
PowerRun Industries - business numbers that must not be published.

The repository is public, so pricing multipliers live in a gitignored file,
private/pricing.json, on the PC that runs the listing scripts:

    {
      "markup": <selling price / supplier price incl. GST, e.g. 1.25>,
      "pack_markup": <multiplier the connector pack sizes were set with>
    }

The listing scripts (listing_jkbms.py and the scripts built on it) read the
values from here and stop with a clear message if the file is missing, so a
wrong default price can never be published by accident.
"""
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRICING_FILE = os.path.join(ROOT, "private", "pricing.json")

_cache = None


def _pricing():
    global _cache
    if _cache is None:
        if not os.path.isfile(PRICING_FILE):
            sys.exit("Missing %s.\nCreate it with your pricing multipliers, for example:\n"
                     '  {"markup": 1.25, "pack_markup": 1.25}\n'
                     "It is gitignored and never published." % PRICING_FILE)
        with io.open(PRICING_FILE, encoding="utf-8") as handle:
            _cache = json.load(handle)
    return _cache


def _number(key):
    value = _pricing().get(key)
    if not isinstance(value, (int, float)) or value <= 1:
        sys.exit("%s: \"%s\" must be a number above 1 (selling price / supplier price)." % (PRICING_FILE, key))
    return float(value)


def markup():
    """Selling price / supplier price incl. GST for resold parts."""
    return _number("markup")


def pack_markup():
    """Multiplier the connector pack sizes were originally chosen with."""
    return _number("pack_markup")
