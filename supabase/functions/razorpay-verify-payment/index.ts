/**
 * PowerRun Industries - verify a Razorpay payment and mark the order paid.
 *
 * An order is marked paid ONLY when the HMAC-SHA256 signature computed here
 * with the key secret matches the one Razorpay returned, AND Razorpay's own
 * API confirms the payment is captured for the expected amount. The browser
 * callback on its own is never treated as proof of payment.
 *
 * Required Edge Function secrets:
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
 *
 * Deploy:  supabase functions deploy razorpay-verify-payment --no-verify-jwt
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time comparison, so a wrong signature leaks no timing information. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!keyId || !keySecret) {
    console.error('Razorpay secrets are not configured on this project.');
    return json({ error: 'Payment verification is not configured.' }, 503);
  }

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return json({ error: 'Incomplete payment details' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, order_number, total_amount, payment_status, razorpay_order_id')
    .eq('id', order_id)
    .single();

  if (error || !order) {
    console.error('Order lookup failed:', error);
    return json({ error: 'Order not found' }, 404);
  }
  if (order.payment_status === 'paid') {
    return json({ status: 'paid', order_number: order.order_number });
  }

  // The Razorpay order must be the one we created for THIS PowerRun order.
  if (order.razorpay_order_id !== razorpay_order_id) {
    console.error('Razorpay order id mismatch', { expected: order.razorpay_order_id, got: razorpay_order_id });
    await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id);
    return json({ error: 'Payment could not be verified.' }, 400);
  }

  const expected = await hmacSha256Hex(keySecret, `${razorpay_order_id}|${razorpay_payment_id}`);
  if (!safeEqual(expected, razorpay_signature)) {
    console.error('Signature mismatch for order', order.order_number);
    await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id);
    return json({ error: 'Payment signature is invalid.' }, 400);
  }

  // Second, independent check: ask Razorpay what actually happened.
  const lookup = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
    headers: { Authorization: 'Basic ' + btoa(`${keyId}:${keySecret}`) },
  });
  const payment = await lookup.json();

  if (!lookup.ok) {
    console.error('Razorpay payment lookup failed:', payment);
    return json({ error: 'Payment could not be confirmed with Razorpay.' }, 502);
  }

  const expectedPaise = Math.round(Number(order.total_amount) * 100);
  const captured = payment.status === 'captured' || payment.status === 'authorized';

  if (!captured || Number(payment.amount) !== expectedPaise || payment.order_id !== razorpay_order_id) {
    console.error('Payment did not match the order', {
      status: payment.status, amount: payment.amount, expectedPaise,
    });
    await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', order.id);
    return json({ error: 'The payment did not match this order.' }, 400);
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      payment_status: 'paid',
      order_status: 'confirmed',
      razorpay_payment_id,
      razorpay_signature,
      payment_verified_at: new Date().toISOString(),
    })
    .eq('id', order.id);

  if (updateError) {
    console.error('Could not mark the order paid:', updateError);
    return json({ error: 'Payment received but the order could not be updated. Please contact us.' }, 500);
  }

  return json({ status: 'paid', order_number: order.order_number });
});
