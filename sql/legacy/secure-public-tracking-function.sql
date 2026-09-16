-- PowerRun Industries - Secure Public Order Tracking Function
-- This function allows public order tracking without exposing sensitive data
-- SECURITY DEFINER ensures it runs as database owner, not caller
-- Requires BOTH order_number AND customer_mobile for dual verification

-- ============================================================================
-- PUBLIC TRACKING FUNCTION - READ-ONLY, SECURITY DEFINER
-- ============================================================================

-- First, revoke EXECUTE from PUBLIC to ensure no one has it by default
revoke execute on function public.track_order_public(text, text) from public cascade;

-- Create the secure read-only tracking function
create or replace function public.track_order_public(
  p_order_number text,
  p_customer_mobile text
)
returns table (
  order_number text,
  order_status text,
  payment_status text,
  created_at timestamp,
  tracking_number text,
  courier_partner text,
  estimated_delivery_date date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found boolean := false;
begin
  -- Input validation: order_number must not be null or empty
  if p_order_number is null or trim(p_order_number) = '' then
    raise exception 'Invalid order number';
  end if;

  -- Input validation: customer_mobile must not be null or empty
  if p_customer_mobile is null or trim(p_customer_mobile) = '' then
    raise exception 'Invalid mobile number';
  end if;

  -- Normalize and validate order_number format
  -- Format: PR-YYMMDDHH24MISSMS-NNN (e.g., PR-26091313123456-789)
  -- Regex: starts with PR-, followed by 14 digits, dash, then 3 digits
  p_order_number := trim(p_order_number);
  if not (p_order_number ~ '^PR-\d{14}-\d{3}$') then
    raise exception 'Invalid order number format';
  end if;

  -- Normalize customer mobile (remove any whitespace)
  p_customer_mobile := trim(p_customer_mobile);
  -- Validate mobile: exactly 10 digits (Indian format)
  if not (p_customer_mobile ~ '^\d{10}$') then
    raise exception 'Invalid mobile number format';
  end if;

  -- Execute the tracking query with strict verification
  -- This uses LEFT JOIN so shipments data is optional
  return query
  select
    public.orders.order_number,           -- Order reference number
    public.orders.order_status,           -- Current order status
    public.orders.payment_status,         -- Payment confirmation status
    public.orders.created_at,             -- When order was placed
    public.shipments.tracking_number,     -- Courier tracking number (if available)
    public.shipments.courier_name,        -- Courier company name (if available)
    public.shipments.estimated_delivery_date  -- Expected delivery date (if available)
  from public.orders
  left join public.shipments on public.orders.id = public.shipments.order_id
  where public.orders.order_number = p_order_number
    and public.orders.customer_mobile = p_customer_mobile
  limit 1;

  -- Note: If no results are returned, it's not an error - just an empty result set
  -- This prevents enumeration attacks (no "order not found" message)

exception when others then
  -- Catch all exceptions and return generic error (no database details exposed)
  raise exception 'Order tracking information not available';
end;
$$;

-- Grant EXECUTE only to anon and authenticated roles (not PUBLIC)
grant execute on function public.track_order_public(text, text) to anon, authenticated;

-- ============================================================================
-- VERIFICATION QUERIES (run these to verify security)
-- ============================================================================

-- Verify the function exists and has correct signature
-- SELECT routine_schema, routine_name, routine_type
-- FROM information_schema.routines
-- WHERE routine_name = 'track_order_public';

-- Verify RLS is still enabled on orders table
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders';
-- SELECT * FROM pg_policies WHERE tablename = 'orders';

-- Verify no public SELECT policy exists on orders
-- SELECT policyname FROM pg_policies
-- WHERE tablename = 'orders' AND pol_permissive IS true;

-- Test query to verify function works:
-- SELECT * FROM public.track_order_public('PR-26091313123456-789', '9876543210');
-- (This will return empty set if order doesn't exist - no error message)
