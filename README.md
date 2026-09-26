# PowerRun Industries — powerrun.in

Static storefront + separate admin panel, backed by Supabase.
Hosted on GitHub Pages (`CNAME` → powerrun.in). No build step; deploy = push to `main`.

---

## Layout

```
/                      Home
/products/             Catalogue (search, category + sub-category filters, sort)
/product/?slug=…       Product detail (specs, features, gallery, add to cart / buy now)
/cart/                 Cart
/checkout/             Checkout → creates the order
/order-confirmation/   Real order read back from the database
/track-order/          Public tracking (needs order number AND its mobile)
/warranty/             Warranty registration
/service/              Service request
/dealer/               Dealer enquiry
/contact/  /about/     Contact form, company info
/404.html              GitHub Pages fallback

/admin/                → redirects to login or dashboard
/admin/login/          Supabase Auth sign-in
/admin/dashboard/      Counters + recent orders + low stock
/admin/products/       Full CRUD, 1–5 images, specs editor, price/stock
/admin/categories/     Categories and sub-categories
/admin/orders/         Order list + detail drawer + status/courier/tracking
/admin/customers/      Customers and website enquiries
/admin/warranty/  /admin/service/  /admin/dealers/
/admin/settings/       Shipping, payment toggles, admin users

assets/css/site.css    Storefront styles (brand palette preserved)
assets/css/admin.css   Admin styles — never served to customers
assets/js/             config, core, cart, catalog, layout, pages/
assets/js/admin/       Admin-only modules
sql/                   Migrations (01–06) + RUN_ALL.sql
supabase/functions/    Razorpay Edge Functions (dormant until keys are set)
scripts/               Local admin/testing tooling — not deployed
youtube/               Channel plan + ready-to-upload art (`robots.txt` disallows it;
                       regenerate the art with `python scripts/youtube_art.py`)
```

The admin panel is **not linked from anywhere on the customer site**, and
`robots.txt` disallows `/admin/`.

---

## Security model

`anon` (the publishable key baked into the JavaScript) can do exactly two things:

* `SELECT` active rows from `products`, `categories`, `product_images`, `site_settings`
* `EXECUTE` the public RPCs listed below

It holds **no table-level write grant anywhere**. Every public write goes through a
`SECURITY DEFINER` function that validates its input:

| Function | Used by |
|---|---|
| `create_website_order(jsonb, jsonb, text)` | Checkout |
| `get_order_public(text, text)` | Order confirmation, tracking |
| `submit_warranty_registration(jsonb)` | Warranty page |
| `submit_service_request(jsonb)` | Service page |
| `submit_dealer_enquiry(jsonb)` | Dealer page |
| `submit_contact_lead(jsonb)` | Contact page |

Admin access is decided by `public.is_admin()`, which checks `auth.uid()` against
`admin_users` **inside the database**. The redirect in `assets/js/admin/shell.js` is
convenience only — editing that file, or calling the tables from a console, grants
nothing, because RLS refuses the query.

**Order totals are never trusted from the browser.** The checkout page sends only
product ids and quantities; `create_website_order` re-reads every price, re-checks
stock, recomputes the total and applies shipping from `site_settings`.

---

## Running it locally

```
python scripts/devserver.py 8123      # serves this folder with caching disabled
```

`python -m http.server` also works but caches aggressively, which makes edits look
like they did not apply.

---

## Deploying

```
git add -A
git commit -m "..."
git push origin main
```

GitHub Pages publishes `main` within a minute or two.

**After changing any file in `assets/`, re-stamp the asset URLs first**, otherwise
returning visitors keep running the old JavaScript:

```
python scripts/stamp_assets.py
```

---

## Razorpay (built, currently OFF)

The full secure flow is written and dormant. To switch it on:

1. `assets/js/config.js` → set `RAZORPAY_KEY_ID` (`rzp_live_…` or `rzp_test_…`).
   This is the **public** key; it is safe in the browser.
2. Supabase → Edge Functions → Secrets → add `RAZORPAY_KEY_ID` **and**
   `RAZORPAY_KEY_SECRET`. The secret must never appear in any file in this repo.
3. Deploy the two functions:
   ```
   supabase functions deploy razorpay-create-order   --no-verify-jwt
   supabase functions deploy razorpay-verify-payment --no-verify-jwt
   ```
4. Admin → Settings → tick "Allow online payment via Razorpay".

An order is marked `paid` only when the HMAC-SHA256 signature verifies **and**
Razorpay's own API confirms the payment is captured for the expected amount.
The browser's success callback alone is never treated as proof of payment.

---

## Database migrations

Apply in order in the Supabase SQL Editor (all are idempotent):

| File | Purpose |
|---|---|
| `sql/01_schema.sql` | Columns, sub-categories, `dealer_enquiries`, `site_settings`, sequences |
| `sql/02_functions.sql` | `is_admin`, order placement, public form RPCs, dashboard stats |
| `sql/03_rls.sql` | Drops every legacy policy, revokes anon grants, recreates the canonical set |
| `sql/04_seed.sql` | Catalogue seed (**placeholder prices — review before going live**) |
| `sql/05_storage.sql` | `product-images` bucket: public read, admin-only write |
| `sql/06_warranty_dates.sql` | Warranty start/end dates derived from the product's warranty text |

`sql/RUN_ALL.sql` concatenates 01–04. `sql/legacy/` holds the superseded scripts.

---

## Order and reference numbers

`PR-2026-00001` (orders) · `PRW-…` (warranty) · `PRS-…` (service) · `PRD-…` (dealer),
from Postgres sequences. Gaps are normal and harmless — a failed insert still
consumes a number.
