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
  RAZORPAY_KEY_ID: 'rzp_test_Tdzlsss1H2ug4A',

  WHATSAPP: '918700307676',
  PHONE: '+91 87003 07676',
  EMAIL: 'service@powerrun.in',
  COMPANY: 'PowerRun Industries',
  SITE_URL: 'https://powerrun.in',

  MAX_PRODUCT_IMAGES: 5,
  STORAGE_BUCKET: 'product-images'
};
