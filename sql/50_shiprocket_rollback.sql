-- rollback for 50_shiprocket.sql (drops the shipping data kept for Shiprocket)
drop function if exists public.pr_record_courier_event(text, text, text, text, timestamptz, jsonb);
drop table if exists public.courier_events;
drop table if exists public.shiprocket_tokens;
drop index if exists public.orders_awb_code_key;
alter table public.orders drop column if exists sr_order_id, drop column if exists sr_shipment_id,
  drop column if exists awb_code, drop column if exists label_url, drop column if exists cod_to_collect,
  drop column if exists ship_charge, drop column if exists ship_status, drop column if exists ship_status_at,
  drop column if exists ship_booked_at, drop column if exists rto;
alter table public.products drop column if exists ship_weight_kg, drop column if exists ship_length_cm,
  drop column if exists ship_breadth_cm, drop column if exists ship_height_cm, drop column if exists ship_surface_only;
