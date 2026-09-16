PowerRun Industries - Production Website

This package connects the website to Supabase project powerrun-website.

Included:
- Supabase database integration
- Secure Supabase Auth admin login
- Product/category CRUD
- Up to 5 product images using Supabase Storage
- Buy Now -> Orders
- Get Quote -> Leads
- Admin Orders/Leads management
- WhatsApp +91 87003 07676
- Responsive PowerRun Industries website

IMPORTANT:
1. The Supabase publishable key is client-safe and is used by the frontend.
2. Never add or expose a Supabase secret/service_role key.
3. Run supabase_order_checkout_migration.sql once in the Supabase SQL Editor. It uses the existing public.create_website_order(jsonb,jsonb) RPC, safely associates signed-in future orders with auth.uid(), and creates an authenticated-only own-order SELECT policy. It does not grant public order reads.
4. Run seed_products.sql once in the Supabase SQL Editor to add the initial 25 products.
5. Deploy this folder to Vercel as a static site (no build command needed). Use the included index.html as the root.
