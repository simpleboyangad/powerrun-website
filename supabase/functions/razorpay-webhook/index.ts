/**
 * PowerRun Industries - Razorpay webhook.
 *
 * Razorpay calls this URL for payment events (set up in Razorpay Dashboard ->
 * Settings -> Webhooks, events: payment.captured, order.paid, payment.failed).
 * It catches payments where the customer closed the browser before the site could
 * confirm them.
 *
 * - The raw body is checked against X-Razorpay-Signature (HMAC-SHA256 with the
 *   webhook secret, constant-time compare). Anything else gets 401 and changes nothing.
 * - Each event is applied once (X-Razorpay-Event-Id is unique in payment_events).
 * - The order is marked paid only by pr_record_razorpay_payment() in the database,
 *   and only when the amount and currency match the order there.
 *
 * Required Edge Function secrets:
 *   RAZORPAY_WEBHOOK_SECRET   - the secret typed into the Razorpay webhook form
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY - provided by Supabase
 *
 * Deploy with JWT verification OFF (Razorpay cannot send a Supabase token):
 *   python scripts/deploy_functions.py razorpay-webhook
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0';

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison, so a wrong signature leaks no timing information. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
  if (!secret) {
    console.error('RAZORPAY_WEBHOOK_SECRET is not set');
    return reply({ error: 'Webhook is not configured' }, 503);   // Razorpay retries later
  }

  const raw = await req.text();
  if (raw.length > 100_000) return reply({ error: 'Payload too large' }, 413);
  const signature = (req.headers.get('x-razorpay-signature') || '').trim().toLowerCase();
  const expected = await hmacSha256Hex(secret, raw);
  if (!signature || !safeEqual(signature, expected)) {
    return reply({ error: 'Invalid signature' }, 401);
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(raw);
  } catch (_e) {
    return reply({ error: 'Invalid JSON' }, 400);
  }

  const eventType = String(event.event || '');
  const payment = event.payload?.payment?.entity || {};
  const order = event.payload?.order?.entity || {};
  const rzpOrderId = String(payment.order_id || order.id || '');
  const eventId = req.headers.get('x-razorpay-event-id') ||
    `${eventType}:${payment.id || ''}:${rzpOrderId}:${event.created_at || ''}`;
  const amount = Number(payment.amount ?? order.amount_paid ?? 0);
  const currency = String(payment.currency || order.currency || '');

  if (!rzpOrderId) return reply({ result: 'ignored' });  // not an order payment

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await supabase.rpc('pr_record_razorpay_payment', {
    p_event_id: eventId,
    p_event_type: eventType,
    p_rzp_order_id: rzpOrderId,
    p_rzp_payment_id: payment.id ? String(payment.id) : null,
    p_amount_paise: Number.isFinite(amount) ? Math.round(amount) : null,
    p_currency: currency || null,
  });
  if (error) {
    console.error('pr_record_razorpay_payment failed:', error.message);
    return reply({ error: 'Could not record the event' }, 500);  // Razorpay retries
  }
  return reply({ result: data });
});
