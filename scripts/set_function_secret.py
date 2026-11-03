#!/usr/bin/env python
"""
PowerRun Industries - save an Edge Function secret without it ever being shown.

Run it yourself in a terminal (not through chat); the value is typed hidden:

    python scripts/set_function_secret.py SHIPROCKET_EMAIL
    python scripts/set_function_secret.py SHIPROCKET_PASSWORD
    python scripts/set_function_secret.py COURIER_WEBHOOK_TOKEN --generate

--generate makes a random token, saves it, and prints it ONCE in your terminal so
you can paste it into the Shiprocket webhook form. Uses the Supabase token in
~/.powerrun/supabase.token; the project is POWERRUN_PROJECT_REF (production by default).
"""
import getpass
import os
import secrets
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import supabase_admin as sa  # noqa: E402

ALLOWED = {"SHIPROCKET_EMAIL", "SHIPROCKET_PASSWORD", "COURIER_WEBHOOK_TOKEN"}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ALLOWED:
        sys.exit("Usage: python scripts/set_function_secret.py <%s> [--generate]" % "|".join(sorted(ALLOWED)))
    name = sys.argv[1]
    if "--generate" in sys.argv:
        value = secrets.token_urlsafe(32)
    else:
        value = getpass.getpass("%s (typing is hidden): " % name).strip()
        if not value:
            sys.exit("Nothing typed - not saved.")
    sa.api_request("/projects/%s/secrets" % sa.PROJECT_REF, method="POST", payload=[{"name": name, "value": value}])
    print("Saved %s on project %s." % (name, sa.PROJECT_REF))
    if "--generate" in sys.argv:
        print("\nCopy this into Shiprocket > Settings > Webhooks > Token (shown only now):\n\n    %s\n" % value)


if __name__ == "__main__":
    main()
