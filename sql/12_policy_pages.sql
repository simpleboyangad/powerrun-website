-- PowerRun Industries - migration 12 / policy pages in Page SEO
-- Adds the four policy routes so they get managed SEO tags and a sitemap entry.
insert into public.page_seo (page_key, page_name, path, title, description, seo_index, seo_follow,
                             in_sitemap, sitemap_priority, sort_order)
values
  ('shipping-policy', 'Shipping Policy', '/shipping-policy/',
   'Shipping Policy | PowerRun Industries',
   'Free pan-India shipping from PowerRun Industries. Dispatch in 1-2 working days, delivery in 3-7 working days, with online order tracking.',
   true, true, true, 0.4, 30),
  ('refund-policy', 'Return & Refund Policy', '/refund-policy/',
   'Return, Replacement & Refund Policy | PowerRun Industries',
   '7-day replacement for damaged, defective or wrong items, and refunds within 5-7 working days to the original payment method.',
   true, true, true, 0.4, 31),
  ('terms', 'Terms & Conditions', '/terms/',
   'Terms & Conditions | PowerRun Industries',
   'Terms for buying lithium batteries, hybrid solar inverters and solar products from PowerRun Industries: orders, payment, warranty and liability.',
   true, true, true, 0.3, 32),
  ('privacy-policy', 'Privacy Policy', '/privacy-policy/',
   'Privacy Policy | PowerRun Industries',
   'How PowerRun Industries collects, uses and protects your personal information when you shop, register a warranty or contact us.',
   true, true, true, 0.3, 33)
on conflict (page_key) do nothing;
