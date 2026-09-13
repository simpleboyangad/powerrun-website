# PowerRun Website - Actual Issues Found

**Date**: 2026-09-13  
**Status**: 🔴 CRITICAL BUGS BLOCKING PRODUCTION

---

## CRITICAL ISSUE #1: Checkout Fails Due to NULL Prices

**Where**: index.html line 315  
**Problem**: All 24 seed products have `price:null`

```javascript
].map((item,index)=>({
  id:index+1,
  name:item[0],
  category:item[1],
  price:null,  // <-- CRITICAL: All products have NULL price
  sku:`PR-${String(index+1).padStart(3,'0')}`,
  ...
}));
```

**Impact on Checkout Flow**:

1. User clicks "BUY NOW" → customerForm() opens
2. User fills form and clicks "PLACE ORDER"
3. submitCustomer() runs validation (line 277-280 of supabase-integration.js)
4. Validation checks: `!Number.isFinite(Number(x.product.price))`
5. `Number(null)` = `NaN` → `!Number.isFinite(NaN)` = `true` → FAILS
6. Toast shows: "One or more selected products are available on request. Please use WhatsApp for a quote."
7. Order is NOT created
8. No error message to user indicates the problem is missing prices

**Why This Is Confusing**:
- The error message suggests WhatsApp is the way to order
- User never sees "Checkout blocked: No prices set"
- No console error to help debug
- Makes it look like checkout is "working" but just rejected for this item

---

## ISSUE #2: Database Products Have No Prices Either

**Where**: Supabase `products` table  
**Problem**: If using real database products (not fallback), they may also lack prices

**Evidence**:
- seed_products.sql in the repo (if it exists) may not set prices
- Admin panel allows editing products without requiring a price
- Products table schema has price column but might not enforce NOT NULL

---

## ISSUE #3: Potential Issue with Admin Access

**Where**: supabase-integration.js around lines 334-346  
**Problem**: Admin login checks admin_users table, but if RLS policies have recursion issues (as happened earlier), admin may be unable to access the database

**Evidence**:
- Previous session had "infinite recursion detected in policy for relation admin_users"
- RLS was disabled on admin_users table to fix it
- Admin panel access might still be broken

---

## ISSUE #4: My Orders Query Might Return Empty

**Where**: supabase-integration.js line 321  
**Problem**: Query filters by user_id, but if orders table has RLS policies blocking access, authenticated users see empty list

**Evidence**:
- User reported "No orders are associated with this account yet"
- The query has `.eq('user_id', session.user.id)` but RLS might block it
- If there's no SELECT policy for customers on their own orders, RLS blocks the query entirely

**RLS Issue**:
Looking at migration, there ARE customer read policies:
```sql
create policy "orders_read_own" on public.orders
  for select to authenticated using (user_id = auth.uid());
```

But there's NO INSERT policy for customers! This might confuse the system.

---

## ISSUE #5: No INSERT Policy for Orders

**Where**: powerrun-complete-ecommerce-migration.sql  
**Problem**: The orders table has only READ and UPDATE policies, but NO INSERT policy

```sql
create policy "orders_read_own" on public.orders
  for select to authenticated using (user_id = auth.uid());

create policy "admin_orders_read" on public.orders
  for select to authenticated using (...);

create policy "admin_orders_update" on public.orders
  for update to authenticated using (...);

-- NO INSERT POLICY!
```

**Why It's OK**: The create_website_order() function uses `SECURITY DEFINER` so it runs as the database owner and bypasses RLS. But it's still a security gap if someone tries direct INSERT.

**Why It Might Cause Issues**: If the RPC is being called and the user doesn't have direct INSERT permission, the RPC might fail in unexpected ways due to the missing INSERT policy for authenticated users.

---

## ISSUE #6: Guest Checkout vs Authenticated Checkout

**Problem**: The checkout flow doesn't distinguish between guest and authenticated users

**Current Flow**:
- `submitCustomer()` calls `sb.rpc('create_website_order', ...)`
- The RPC gets `auth.uid()` which is null for guests
- For guests, `user_id` is NULL in the order
- For authenticated users, `user_id` is the auth.uid()

**Why This Matters**:
- Guests can't see their orders in My Orders (because My Orders filters by user_id and guests have NULL)
- Guests need a different way to track orders: the public track_order_public RPC with order_number + mobile

**Current Implementation**:
- After successful order creation, it shows order confirmation with Order ID
- Guests can screenshot the order number
- OR guests can use "Track Order" feature with order number + mobile

**Is This Correct?**: YES - The design is sound. Guests get order number, authenticated customers get My Orders.

---

## ROOT CAUSE ANALYSIS

**Why Checkout Fails**:
1. Seed products have `price:null`
2. Checkout validation rejects NULL prices
3. Toast message is misleading ("use WhatsApp")
4. User thinks checkout doesn't work; actually prices are missing

**Why My Orders Shows No Orders**:
1. If checkout hasn't worked, no orders were created
2. If orders WERE created somehow, My Orders would show them (RLS policy is correct)
3. Empty My Orders is a SYMPTOM, not the root cause

---

## FIX STRATEGY

### Phase 1: Add Prices to Seed Data
**File**: index.html line 315  
**Change**: Replace `price:null` with actual prices  
**Example**:
```javascript
{
  ...
  price: 150000 + (index * 10000),  // Add sample prices
  ...
}
```

### Phase 2: Verify Database Products Have Prices
**Check**: If using Supabase products, verify they have prices  
**Fix**: Add prices through admin panel  

### Phase 3: Add INSERT Policy for Orders (Security)
**File**: powerrun-complete-ecommerce-migration.sql  
**Add**:
```sql
create policy "orders_insert_authenticated" on public.orders
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "orders_insert_anon" on public.orders
  for insert to anon
  with check (true);
```

But this is LOW PRIORITY because:
- RPC has SECURITY DEFINER so it bypasses RLS
- The RPC is the authoritative order creation mechanism
- Direct INSERT from public is blocked by RLS anyway

### Phase 4: Test Complete Flow
1. Load website
2. Click BUY NOW
3. Fill form
4. Place order
5. See Order ID confirmation
6. Login and view in My Orders

---

## VERIFICATION CHECKLIST

- [ ] Seed data has prices for all 24 products
- [ ] Admin can set prices via admin panel
- [ ] Checkout validation passes (price check succeeds)
- [ ] Order is created in Supabase
- [ ] Order confirmation shows Order ID
- [ ] Authenticated user can see order in My Orders
- [ ] Guest can see order number in confirmation
- [ ] Guest can use Track Order with order number + mobile
- [ ] Admin can see all orders
- [ ] RLS policies work correctly
- [ ] No JavaScript errors in console

---

## NEXT STEPS

1. Add prices to seed data (CRITICAL)
2. Test checkout flow
3. Verify My Orders works
4. Check admin panel
5. Run full test suite
