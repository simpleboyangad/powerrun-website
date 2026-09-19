#!/usr/bin/env python
"""
PowerRun Industries - deploy the Supabase Edge Functions without the CLI.

Uses the Management API with the access token in ~/.powerrun/supabase.token
(never printed). Each function is deployed with JWT verification OFF because
checkout calls them before a customer has an account; both functions read the
amount from the database and verify payments server-side, so they do not
trust anything the browser sends.

    python scripts/deploy_functions.py                       # both
    python scripts/deploy_functions.py razorpay-create-order # one
"""
import io
import json
import os
import sys
import uuid
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import supabase_admin as sa  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUNCTIONS = ["razorpay-create-order", "razorpay-verify-payment"]


def multipart(fields, files):
    boundary = "----powerrun" + uuid.uuid4().hex
    body = io.BytesIO()
    for name, value in fields.items():
        body.write(("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n"
                    % (boundary, name, value)).encode())
    for name, (filename, data, ctype) in files.items():
        body.write(("--%s\r\nContent-Disposition: form-data; name=\"%s\"; filename=\"%s\"\r\n"
                    "Content-Type: %s\r\n\r\n" % (boundary, name, filename, ctype)).encode())
        body.write(data)
        body.write(b"\r\n")
    body.write(("--%s--\r\n" % boundary).encode())
    return boundary, body.getvalue()


def deploy(slug):
    source = os.path.join(ROOT, "supabase", "functions", slug, "index.ts")
    code = io.open(source, "rb").read()
    metadata = json.dumps({"entrypoint_path": "index.ts", "name": slug, "verify_jwt": False})
    boundary, body = multipart({"metadata": metadata},
                               {"file": ("index.ts", code, "application/typescript")})
    token = sa.load_token()
    req = urllib.request.Request(
        "%s/projects/%s/functions/deploy?slug=%s" % (sa.API, sa.PROJECT_REF, slug),
        data=body, method="POST",
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": "multipart/form-data; boundary=" + boundary})
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            result = json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as err:
        detail = err.read().decode(errors="replace").replace(token, "<redacted>")
        raise SystemExit("deploy %s failed: HTTP %s %s" % (slug, err.code, detail[:600]))
    print("deployed %-26s version=%s status=%s verify_jwt=%s"
          % (slug, result.get("version"), result.get("status"), result.get("verify_jwt")))


if __name__ == "__main__":
    for name in (sys.argv[1:] or FUNCTIONS):
        deploy(name)
