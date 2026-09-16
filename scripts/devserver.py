#!/usr/bin/env python
"""Local static server for testing, with caching disabled.

python -m http.server sends Last-Modified, so the browser happily serves stale
JavaScript after an edit - which makes test results misleading. This sends
Cache-Control: no-store on everything instead.

  python scripts/devserver.py [port]
"""
import functools
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the test output readable


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    print("Serving {} at http://127.0.0.1:{} (no-cache)".format(ROOT, port))
    HTTPServer(("127.0.0.1", port), handler).serve_forever()
