/**
 * PowerRun Industries - courier tracking webhook (Shiprocket).
 *
 * Shiprocket Settings > Webhooks calls this URL on every tracking update and sends
 * the token typed there in the x-api-key header. (Shiprocket refuses webhook URLs that
 * contain "shiprocket", "sr" or "kr", hence the name.)
 *
 * - x-api-key must equal COURIER_WEBHOOK_TOKEN (constant-time compare), else 401.
 * - pr_record_courier_event() in the database applies each update once: shipped,
 *   delivered (COD / advance orders become paid), RTO flag, cancelled.
 * - Always 200 for a valid call, so Shiprocket does not keep retrying unknown AWBs.
 *
 * Required Edge Function secrets:
 *   COURIER_WEBHOOK_TOKEN  - the token typed into the Shiprocket webhook form
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY - provided by Supabase
 *
 * Deploy with JWT verification OFF:  python scripts/deploy_functions.py courier-webhook
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0';

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Shiprocket sends "dd MM yyyy HH:mm:ss" or ISO-ish times in IST */
function parseTime(v: unknown): string | null {
  const s = String(v || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{2})[ -](\d{2})[ -](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] || '00'}+05:30`
                : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/[zZ+]/.test(s.slice(10)) ? s.replace(' ', 'T') + '+05:30' : s;
  const t = new Date(iso);
  return isNaN(t.getTime()) ? null : t.toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ ok: true });   // Shiprocket's URL test may GET it
  const secret = Deno.env.get('COURIER_WEBHOOK_TOKEN');
  if (!secret) return reply({ error: 'Webhook is not configured' }, 503);
  const given = (req.headers.get('x-api-key') || '').trim();
  if (!given || !safeEqual(given, secret)) return reply({ error: 'Unauthorized' }, 401);

  const raw = await req.text();
  if (raw.length > 200_000) return reply({ error: 'Payload too large' }, 413);
  let e: Record<string, any>;
  try { e = JSON.parse(raw || '{}'); } catch { return reply({ error: 'Invalid JSON' }, 400); }

  const awb = String(e.awb || e.awb_code || '').trim();
  const status = String(e.current_status || e.shipment_status || '').trim();
  if (!awb && !e.order_id) return reply({ result: 'ignored' });   // test ping
  const at = parseTime(e.current_timestamp || e.updated_at);
  const key = [awb, e.current_status_id ?? status, e.current_timestamp || ''].join('|');

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('pr_record_courier_event', {
    p_event_key: key, p_awb: awb || null, p_order_number: e.order_id ? String(e.order_id) : null,
    p_status: status, p_status_at: at, p_payload: e,
  });
  if (error) {
    console.error('pr_record_courier_event failed:', error.message);
    return reply({ error: 'Could not record the event' }, 500);   // Shiprocket retries
  }
  return reply({ result: data });
});
