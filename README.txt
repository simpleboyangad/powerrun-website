PowerRun Industries - Production Website Upgrade

Files
- index.html: main website, responsive UI, product listing/details, search, categories, cart and customer flows.
- supabase-integration.js: Supabase products, categories, cart/order/lead/admin integration.
- seed_products.sql: existing 25-product seed; safe to run once on a new/empty catalogue.
- SUPABASE_RLS_AND_ORDER_RPC.sql: optional security hardening. Review the existing schema/policies before running.
- sitemap.xml / robots.txt: technical SEO.
- assets/powerrun-logo.png: existing PowerRun logo asset.

Important
1. Keep index.html at the repository root. Do not rename it to PowerRun_buy.html or another filename on GitHub Pages/Vercel.
2. Keep supabase-integration.js in the same directory as index.html.
3. The frontend contains only the Supabase publishable/anon key. Never add a service_role/secret/payment key.
4. Admin login uses Supabase Auth plus the admin_users authorization table. There is no hardcoded frontend admin password.
5. Product pricing is managed from Admin -> Products -> Edit -> Selling Price.
6. Product cards use BUY NOW, + CART and WHATSAPP. A product without a price still opens the order/enquiry form and is saved as a pending enquiry/order.
7. Cart is persisted in localStorage and stores product ID + quantity. Adding the same product increases quantity.
8. Orders and order items are written to Supabase. No online payment gateway is claimed or implemented.
9. Leads/enquiries are written to Supabase.
10. Up to 5 product images are supported through the existing product-images storage bucket.

Supabase setup
- Use the existing Supabase project/configuration from the original project.
- Confirm categories, products, product_images, orders, order_items, leads and admin_users exist.
- Confirm at least one authorized admin user exists in Supabase Auth and has a matching admin_users.user_id row.
- Review/run SUPABASE_RLS_AND_ORDER_RPC.sql if your current RLS policies do not already provide the required secure access.
- If your orders.id or order_items.product_id types differ from UUID, do not run the RPC section unchanged; inspect the actual schema first.

Deployment
GitHub Pages:
- Put index.html, supabase-integration.js, assets/, seed_products.sql, sitemap.xml and robots.txt in the repository root.
- Commit to the published branch.
- Ensure GitHub Pages publishes the repository root.

Vercel:
- Import the repository.
- Framework preset: Other / static.
- Build command: none.
- Output directory: repository root.

SEO
- Canonical URL is configured as https://powerrun.in/.
- If the production domain is different, change the canonical, Open Graph URL, WebSite JSON-LD and sitemap before deployment.
