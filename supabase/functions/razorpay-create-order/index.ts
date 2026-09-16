/**
 * PowerRun Industries - create a Razorpay order for an existing PowerRun order.
 *
 * The amount is ALWAYS read from the orders row in the database. The browser
 * only sends an order id, so a tampered client cannot change what is charged.
 *
 * Required Edge Function secrets:
 *   RAZORPAY_KEY_ID       - Razorpay key id  (rzp_test_... / rzp_live_...)
 *   RAZORPAY_KEY_SECRET   - Razorpay key secret (NEVER ships to the browser)
 *   SUPABASE_URL          - provided automatically by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY - provided automatically by Supabase
 *
 * Deploy:  supabase functions deploy razorpay-create-order --no-verify-jwt
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const keyId = Deno.env.get('RAZORPAY_KEY_ID');
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

  if (!keyId || !keySecret) {
    console.error('Razorpay secrets are not configured on this project.');
    return json({ error: 'Online payment is not configured yet. Please contact PowerRun Industries.' }, 503);
  }

  let payload: { order_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const orderId = payload.order_id;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return json({ error: 'A valid order id is required' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: order, error } = await supabase
    .from('orders')
    .select('id, order_number, total_amount, payment_status, razorpay_order_id')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    console.error('Order lookup failed:', error);
    return json({ error: 'Order not found' }, 404);
  }
  if (order.payment_status === 'paid') {
    return json({ error: 'This order has already been paid.' }, 409);
  }

  // Razorpay works in paise.
  const amount = Math.round(Number(order.total_amount) * 100);
  if (!Number.isFinite(amount) || amount < 100) {
    return json({ error: 'This order amount cannot be collected online.' }, 400);
  }

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${keyId}:${keySecret}`),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency: 'INR',
      receipt: order.order_number,
      notes: { powerrun_order_id: order.id, powerrun_order_number: order.order_number },
    }),
  });

  const rzp = await response.json();
  if (!response.ok) {
    console.error('Razorpay order creation failed:', rzp);
    return json({ error: rzp?.error?.description || 'The payment could not be started.' }, 502);
  }

  const { error: updateError } = await supabase
    .from('orders')
    .update({ razorpay_order_id: rzp.id })
    .eq('id', order.id);

  if (updateError) {
    console.error('Could not store the Razorpay order id:', updateError);
    return json({ error: 'The payment could not be started. Please try again.' }, 500);
  }

  return json({
    razorpay_order_id: rzp.id,
    amount: rzp.amount,
    currency: rzp.currency,
    order_number: order.order_number,
  });
});
