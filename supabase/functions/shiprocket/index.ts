/**
 * PowerRun Industries - Shiprocket shipping for Admin > Orders ("Ship karo").
 *
 * POST { action, ... } with the admin's Supabase session (supabase-js functions.invoke
 * sends it). The caller must pass is_admin() - the same check as every admin screen,
 * so the 2-step login applies. Always answers 200 with { ok: true, ... } or
 * { ok: false, error } so the admin sees Shiprocket's own message.
 *
 *   status                        wallet balance + pickup address in use
 *   quote  { order_id, weight, length, breadth, height }
 *                                 couriers + rates for this order (road only when an item
 *                                 is ship_surface_only, e.g. lithium battery packs)
 *   ship   { order_id, courier_id, weight, length, breadth, height, rate }
 *                                 create the Shiprocket order, assign the courier (AWB),
 *                                 ask for pickup, make the label; saved on the order.
 *                                 Safe to press again: it carries on from the last step.
 *   cancel { order_id }           cancel the shipment before pickup
 *
 * Money: the amount the courier collects is worked out here from the orders row,
 * never taken from the browser: 0 when the order is paid, else total - advance.
 * The order must be paid or have an advance, and serials must be saved for warranty items.
 *
 * Required Edge Function secrets:
 *   SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD - a Shiprocket API user (Settings > API Users)
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY - provided by Supabase
 *
 * Deploy:  python scripts/deploy_functions.py shiprocket
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0';

const SR = 'https://apiv2.shiprocket.in/v1/external';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { ...CORS, 'Content-Type': 'application/json' } });
}
const fail = (error: string, extra: Record<string, unknown> = {}) => reply({ ok: false, error, ...extra });

class ShiprocketError extends Error {}

/** Shiprocket's error bodies come in several shapes; pull out something readable. */
function srMessage(body: any, fallback: string) {
  if (!body) return fallback;
  if (typeof body === 'string') return body.slice(0, 300);
  const errors = body.errors && typeof body.errors === 'object'
    ? Object.values(body.errors).flat().join(' ') : '';
  return String(body.message || errors || body.error || body.response?.data || fallback).slice(0, 300);
}

let db: SupabaseClient;

async function login(): Promise<string> {
  const email = Deno.env.get('SHIPROCKET_EMAIL');
  const password = Deno.env.get('SHIPROCKET_PASSWORD');
  if (!email || !password) throw new ShiprocketError('Shiprocket API user abhi set nahi hai (SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD).');
  const res = await fetch(`${SR}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.token) throw new ShiprocketError('Shiprocket login nahi hua: ' + srMessage(body, 'HTTP ' + res.status));
  // tokens last 10 days; keep 9
  await db.from('shiprocket_tokens').upsert({
    id: 1, token: body.token, expires_at: new Date(Date.now() + 9 * 86400e3).toISOString(), updated_at: new Date().toISOString(),
  });
  return body.token;
}

async function token(fresh = false): Promise<string> {
  if (!fresh) {
    const { data } = await db.from('shiprocket_tokens').select('token, expires_at').eq('id', 1).maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now() + 3600e3) return data.token;
  }
  return login();
}

/** Shiprocket API call; logs in again once if the cached token was refused. */
async function sr(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<any> {
  const res = await fetch(SR + path, {
    method: init.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await token(!retry)) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 401 && retry) return sr(path, init, false);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ShiprocketError(srMessage(body, 'Shiprocket HTTP ' + res.status));
  return body;
}

async function pickupAddress() {
  const body = await sr('/settings/company/pickup');
  const list: any[] = body?.data?.shipping_address || [];
  const active = list.filter((a) => a.status === undefined || Number(a.status) !== 0);
  const pick = active.find((a) => Number(a.is_primary_location) === 1) || active[0];
  if (!pick) throw new ShiprocketError('Shiprocket mein koi pickup address nahi mila. Settings > Pickup Addresses mein jodiye.');
  return { name: String(pick.pickup_location), pincode: String(pick.pin_code), city: pick.city || '' };
}

const ORDER_COLUMNS = 'id, order_number, created_at, customer_name, customer_mobile, customer_email, address, city, state, ' +
  'pincode, shipping_address, shipping_city, shipping_state, shipping_pincode, total_amount, shipping_cost, ' +
  'payment_status, payment_method, advance_amount, order_status, sr_order_id, sr_shipment_id, awb_code, label_url, ' +
  'courier_partner, tracking_number, ' +
  'order_items(id, product_id, product_name, product_sku, hsn_code, quantity, unit_price, total_price, taxable_amount, gst_amount, gst_rate, ' +
  'products(warranty, ship_surface_only))';

async function loadOrder(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) throw new ShiprocketError('Order id sahi nahi hai.');
  const { data, error } = await db.from('orders').select(ORDER_COLUMNS).eq('id', id).single();
  if (error || !data) throw new ShiprocketError('Order nahi mila.');
  return data as any;
}

/** what the courier collects: nothing when paid, else whatever the advance did not cover */
function codToCollect(o: any) {
  if (o.payment_status === 'paid') return 0;
  return Math.max(0, Math.round((Number(o.total_amount) - Number(o.advance_amount || 0)) * 100) / 100);
}

function needsSerial(item: any) {
  const w = item.products?.warranty;
  return !!(w && String(w).trim() && !/^\s*no\s+warranty/i.test(String(w)));
}

/** order checks before money is spent on a label */
async function readyToShip(o: any) {
  if (o.order_status === 'cancelled') throw new ShiprocketError('Order cancel ho chuka hai.');
  if (['shipped', 'delivered'].includes(o.order_status)) throw new ShiprocketError('Order pehle hi ' + o.order_status + ' hai.');
  if (o.payment_status !== 'paid' && !(Number(o.advance_amount) > 0)) {
    throw new ShiprocketError('Is order ka payment ya advance abhi nahi mila - pehle PI bhej kar advance lein.');
  }
  const items = (o.order_items || []).filter(needsSerial);
  if (items.length) {
    const { data } = await db.from('order_serials').select('order_item_id').eq('order_id', o.id);
    const have: Record<string, number> = {};
    (data || []).forEach((s: any) => { have[s.order_item_id] = (have[s.order_item_id] || 0) + 1; });
    const missing = items.filter((i: any) => (have[i.id] || 0) < Number(i.quantity))
      .map((i: any) => i.product_name + ' (' + (have[i.id] || 0) + '/' + i.quantity + ')');
    if (missing.length) throw new ShiprocketError('Pehle serial number save karein: ' + missing.join(', '));
  }
}

function box(input: any) {
  const n = (v: unknown) => Number(v);
  const b = { weight: n(input.weight), length: n(input.length), breadth: n(input.breadth), height: n(input.height) };
  if (!(b.weight > 0 && b.weight <= 500)) throw new ShiprocketError('Wazan (kg) sahi bhariye.');
  for (const k of ['length', 'breadth', 'height'] as const) {
    if (!(b[k] >= 0.5 && b[k] <= 300)) throw new ShiprocketError('Box ka size (cm) sahi bhariye.');
  }
  return b;
}

const dest = (o: any) => String(o.shipping_pincode || o.pincode || '').replace(/\D/g, '');

async function quote(o: any, b: ReturnType<typeof box>) {
  const pickup = await pickupAddress();
  const cod = codToCollect(o);
  const qs = new URLSearchParams({
    pickup_postcode: pickup.pincode, delivery_postcode: dest(o), cod: cod > 0 ? '1' : '0',
    weight: String(b.weight), length: String(b.length), breadth: String(b.breadth), height: String(b.height),
    declared_value: String(Number(o.total_amount)),
  });
  const body = await sr('/courier/serviceability/?' + qs.toString());
  const surfaceOnly = (o.order_items || []).some((i: any) => i.products?.ship_surface_only);
  const all: any[] = body?.data?.available_courier_companies || [];
  const couriers = all
    .filter((c) => !surfaceOnly || c.is_surface === true || c.is_surface === 1 || /surface/i.test(c.courier_name || ''))
    .map((c) => ({
      id: Number(c.courier_company_id), name: String(c.courier_name),
      rate: Number(c.rate ?? c.freight_charge ?? 0), cod_charge: Number(c.cod_charges || 0),
      days: c.estimated_delivery_days ? Number(c.estimated_delivery_days) : null, etd: c.etd || null,
      rating: c.rating != null ? Number(c.rating) : null, surface: !!c.is_surface,
    }))
    .sort((a, b2) => a.rate - b2.rate);
  return {
    pickup, cod, surface_only: surfaceOnly, couriers,
    recommended: Number(body?.data?.shiprocket_recommended_courier_id || body?.data?.recommended_courier_company_id || 0) || null,
    hidden_air: all.length - couriers.length,
  };
}

function istDate(iso: string) {
  const d = new Date(new Date(iso).getTime() + 330 * 60e3);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

async function createSrOrder(o: any, b: ReturnType<typeof box>, pickupName: string) {
  const cod = codToCollect(o);
  const items = (o.order_items || []).map((i: any) => ({
    name: String(i.product_name).slice(0, 190), sku: String(i.product_sku || i.product_id || i.id).slice(0, 60),
    units: Number(i.quantity),
    // the price the customer pays per unit, GST included (Shiprocket prices are GST-inclusive)
    selling_price: Math.round((Number(i.taxable_amount) + Number(i.gst_amount) || Number(i.total_price)) / Number(i.quantity) * 100) / 100,
    discount: 0,
    tax: Number(i.gst_rate || 0), hsn: i.hsn_code ? String(i.hsn_code) : '',
  }));
  const itemsTotal = items.reduce((s: number, i: any) => s + i.selling_price * i.units, 0);
  const shipping = Number(o.shipping_cost || 0);
  // the order value Shiprocket shows / collects = items + shipping - discount
  const target = cod > 0 ? cod : Number(o.total_amount);
  const discount = Math.max(0, Math.round((itemsTotal + shipping - target) * 100) / 100);
  const [first, ...rest] = String(o.customer_name || 'Customer').trim().split(/\s+/);
  const phone = String(o.customer_mobile || '').replace(/\D/g, '').slice(-10);
  const shipDifferent = !!(o.shipping_address && o.shipping_pincode &&
    (o.shipping_address !== o.address || o.shipping_pincode !== o.pincode));
  const payload: Record<string, unknown> = {
    order_id: o.order_number, order_date: istDate(o.created_at), pickup_location: pickupName,
    billing_customer_name: first, billing_last_name: rest.join(' '),
    billing_address: String(o.address || '').slice(0, 190), billing_city: o.city || '',
    billing_pincode: String(o.pincode || '').replace(/\D/g, ''), billing_state: o.state || '', billing_country: 'India',
    billing_email: o.customer_email || 'service@powerrun.in', billing_phone: phone,
    shipping_is_billing: !shipDifferent,
    order_items: items, payment_method: cod > 0 ? 'COD' : 'Prepaid',
    shipping_charges: shipping, giftwrap_charges: 0, transaction_charges: 0, total_discount: discount,
    sub_total: itemsTotal, length: b.length, breadth: b.breadth, height: b.height, weight: b.weight,
  };
  if (shipDifferent) Object.assign(payload, {
    shipping_customer_name: first, shipping_last_name: rest.join(' '),
    shipping_address: String(o.shipping_address).slice(0, 190), shipping_city: o.shipping_city || o.city || '',
    shipping_pincode: String(o.shipping_pincode).replace(/\D/g, ''), shipping_state: o.shipping_state || o.state || '',
    shipping_country: 'India', shipping_email: o.customer_email || 'service@powerrun.in', shipping_phone: phone,
  });
  const body = await sr('/orders/create/adhoc', { method: 'POST', body: payload });
  if (!body?.order_id || !body?.shipment_id) throw new ShiprocketError('Shiprocket order nahi bana: ' + srMessage(body, 'unknown reply'));
  return { srOrderId: Number(body.order_id), shipmentId: Number(body.shipment_id), cod };
}

/** read the order back and make sure Shiprocket will collect exactly what we expect */
async function checkCodAmount(srOrderId: number, cod: number) {
  if (cod <= 0) return;
  const body = await sr('/orders/show/' + srOrderId).catch(() => null);
  const d = body?.data || {};
  const shown = Number(d.net_total ?? d.total ?? NaN);
  if (Number.isFinite(shown) && Math.abs(shown - cod) > 1) {
    await sr('/orders/cancel', { method: 'POST', body: { ids: [srOrderId] } }).catch(() => null);
    throw new ShiprocketError(`Shiprocket COD ₹${shown} dikha raha tha, hona chahiye ₹${cod} - order wahan cancel kar diya, kuch charge nahi hua. Admin ko batayein.`);
  }
}

async function ship(o: any, input: any) {
  if (o.awb_code) {
    return { awb: o.awb_code, courier: o.courier_partner, label_url: o.label_url, already: true };
  }
  await readyToShip(o);
  const b = box(input);
  const courierId = Number(input.courier_id);
  if (!(courierId > 0)) throw new ShiprocketError('Courier chuniye.');

  let srOrderId = Number(o.sr_order_id || 0), shipmentId = Number(o.sr_shipment_id || 0);
  const cod = codToCollect(o);
  if (!shipmentId) {
    const pickup = await pickupAddress();
    const made = await createSrOrder(o, b, pickup.name);
    srOrderId = made.srOrderId; shipmentId = made.shipmentId;
    await checkCodAmount(srOrderId, cod);
    await db.from('orders').update({ sr_order_id: srOrderId, sr_shipment_id: shipmentId, cod_to_collect: cod }).eq('id', o.id);
  }

  const assigned = await sr('/courier/assign/awb', { method: 'POST', body: { shipment_id: shipmentId, courier_id: courierId } });
  const data = assigned?.response?.data || {};
  if (Number(assigned?.awb_assign_status) !== 1 || !data.awb_code) {
    const why = data.awb_assign_error || srMessage(assigned, 'wallet balance check karein');
    throw new ShiprocketError('Courier assign nahi hua: ' + String(why).slice(0, 300));
  }
  const awb = String(data.awb_code), courier = String(data.courier_name || '');
  const { error: saveError } = await db.from('orders').update({
    awb_code: awb, tracking_number: awb, courier_partner: courier, cod_to_collect: cod,
    ship_charge: Number(input.rate) > 0 ? Number(input.rate) : null, ship_booked_at: new Date().toISOString(),
    ship_status: 'AWB ASSIGNED', ship_status_at: new Date().toISOString(),
    ...(['pending', 'confirmed', 'processing'].includes(o.order_status) ? { order_status: 'packed' } : {}),
  }).eq('id', o.id);
  if (saveError) console.error('Could not save the AWB on the order', o.order_number, saveError.message);

  let pickup = '';
  try {
    const p = await sr('/courier/generate/pickup', { method: 'POST', body: { shipment_id: [shipmentId] } });
    pickup = p?.response?.pickup_scheduled_date ? 'Pickup: ' + p.response.pickup_scheduled_date : 'Pickup request bhej di';
  } catch (e) {
    pickup = 'Pickup request nahi gayi (' + (e as Error).message + ') - Shiprocket mein "Generate Pickup" dabayein';
  }

  let labelUrl = '';
  try {
    const l = await sr('/courier/generate/label', { method: 'POST', body: { shipment_id: [shipmentId] } });
    labelUrl = String(l?.label_url || '');
    if (labelUrl) await db.from('orders').update({ label_url: labelUrl }).eq('id', o.id);
  } catch (e) {
    console.error('label failed', (e as Error).message);
  }
  return { awb, courier, cod, label_url: labelUrl, pickup };
}

async function cancel(o: any) {
  if (!o.sr_order_id) throw new ShiprocketError('Is order ka Shiprocket shipment nahi hai.');
  if (['shipped', 'delivered'].includes(o.order_status)) throw new ShiprocketError('Parcel nikal chuka hai - ab Shiprocket se RTO / return karein.');
  await sr('/orders/cancel', { method: 'POST', body: { ids: [Number(o.sr_order_id)] } });
  await db.from('orders').update({
    sr_order_id: null, sr_shipment_id: null, awb_code: null, label_url: null, tracking_number: null,
    courier_partner: null, cod_to_collect: null, ship_charge: null, ship_status: 'CANCELLED', ship_status_at: new Date().toISOString(),
    ...(o.order_status === 'packed' ? { order_status: 'confirmed' } : {}),
  }).eq('id', o.id);
  return { cancelled: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('Method not allowed');

  // admin only: ask the database with the caller's own session
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return fail('Admin login chahiye.');
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: isAdmin, error: adminError } = await asCaller.rpc('is_admin');
  if (adminError || isAdmin !== true) return fail('Sirf admin ye kar sakta hai (2-step login ke saath).');

  db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  let input: any;
  try { input = await req.json(); } catch { return fail('Invalid request'); }

  try {
    switch (input.action) {
      case 'status': {
        const [wallet, pickup] = await Promise.all([
          sr('/account/details/wallet-balance').catch(() => null), pickupAddress().catch((e) => ({ error: e.message })),
        ]);
        return reply({ ok: true, wallet: wallet?.data?.balance_amount != null ? Number(wallet.data.balance_amount) : null, pickup });
      }
      case 'quote': {
        const o = await loadOrder(input.order_id);
        return reply({ ok: true, ...(await quote(o, box(input))) });
      }
      case 'ship': {
        const o = await loadOrder(input.order_id);
        return reply({ ok: true, ...(await ship(o, input)) });
      }
      case 'cancel': {
        const o = await loadOrder(input.order_id);
        return reply({ ok: true, ...(await cancel(o)) });
      }
      default:
        return fail('Unknown action');
    }
  } catch (e) {
    if (e instanceof ShiprocketError) return fail(e.message);
    console.error('shiprocket function error', e);
    return fail('Kuch gadbad hui: ' + ((e as Error)?.message || 'unknown'));
  }
});
