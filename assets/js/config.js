/* PowerRun Industries - shared front-end configuration.
 *
 * Only publishable / client-safe values belong in this file. It is served to
 * every visitor. Never put a Supabase service_role key or a Razorpay key
 * secret here - those live in Supabase Edge Function secrets.
 */
window.PR_CONFIG = {
  SUPABASE_URL: 'https://nnkopxkyxcmtiunftlgr.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_n5WIw0oyN0w8K6Z5mlfawA_QbM7iHqf',

  // Razorpay public key id (rzp_test_... / rzp_live_...). Leave empty until the
  // keys are configured; checkout then falls back to pay-on-confirmation.
  // The matching KEY SECRET must be set ONLY as a Supabase Edge Function secret.
  RAZORPAY_KEY_ID: 'rzp_live_TeVizhEm73jmxI',

  WHATSAPP: '918607565520',
  YOUTUBE: 'https://www.youtube.com/@PowerRunIndustries',
  PHONE: '+91 86075 65520',
  EMAIL: 'service@powerrun.in',
  COMPANY: 'PowerRun Industries',
  ADDRESS: 'Plot 23, Gadi Road, Nagla Bhood, Dholna, Kasganj, Uttar Pradesh 207124, India',
  GSTIN: '09GTVPS7660P1ZZ',

  // false: customers and Google see only the selling price - no struck-out
  // MRP, no "% OFF". MRP stays in the database for quotations and invoices.
  // Turn back on only with MRPs the products have really sold at.
  SHOW_MRP: false,

  // Google Business Profile rating shown on the home and product pages.
  // Update RATING / COUNT by hand when new Google reviews come in.
  GOOGLE_REVIEWS: {
    RATING: '5.0',
    COUNT: 10,
    URL: 'https://maps.google.com/?cid=2490524210981875388'
  },
  SITE_URL: 'https://powerrun.in',

  // Google Merchant Center account ID (digits only). When set, the order
  // confirmation page offers the Google Customer Reviews survey opt-in to
  // customers who gave an email. Leave empty until the Customer Reviews
  // program is enabled in Merchant Center.
  GOOGLE_MERCHANT_ID: '5856704164',

  // Categories that have their own landing page at /<slug>/ (intro, buying
  // guide, FAQ). Every other category is linked as /products/?category=<slug>.
  CATEGORY_PAGES: ['hybrid-inverters', 'lithium-batteries', 'solar-panels', 'e-rickshaw-batteries'],

  MAX_PRODUCT_IMAGES: 5,
  STORAGE_BUCKET: 'product-images'
};
