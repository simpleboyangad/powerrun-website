-- PowerRun Industries - baseline schema of project nnkopxkyxcmtiunftlgr
-- Generated 2026-10-21 09:47 by scripts/schema_snapshot.py (read-only). Structure only, no data.
-- Apply to an EMPTY Supabase project, then the later numbered migrations are already included.
set check_function_bodies = off;

create extension if not exists "pg_cron" with schema pg_catalog;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

create sequence if not exists public."pr_calc_number_seq" start 1 increment 1;
create sequence if not exists public."pr_dealer_number_seq" start 1 increment 1;
create sequence if not exists public."pr_order_number_seq" start 1 increment 1;
create sequence if not exists public."pr_quote_number_seq" start 1 increment 1;
create sequence if not exists public."pr_ticket_number_seq" start 1 increment 1;
create sequence if not exists public."pr_warranty_number_seq" start 1 increment 1;

create table public."admin_users" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "name" text not null,
  "email" text not null,
  "role" text default 'staff'::text,
  "permissions" jsonb default '{}'::jsonb,
  "is_active" boolean default true,
  "created_at" timestamp without time zone default now(),
  "updated_at" timestamp without time zone default now()
);
create table public."audit_log" (
  "id" bigint generated always as identity not null,
  "at" timestamp with time zone default now() not null,
  "table_name" text not null,
  "row_id" text,
  "action" text not null,
  "actor" uuid,
  "actor_role" text,
  "changed" jsonb
);
create table public."bom_calculations" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "linked_product_id" uuid,
  "items" jsonb default '[]'::jsonb not null,
  "total_cost" numeric default 0 not null,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."calc_audit_log" (
  "id" uuid default gen_random_uuid() not null,
  "admin_user_id" uuid,
  "admin_name_snapshot" text,
  "setting_type" text not null,
  "setting_label" text not null,
  "old_value" text,
  "new_value" text,
  "created_at" timestamp with time zone default now() not null
);
create table public."calc_gst_rates" (
  "id" uuid default gen_random_uuid() not null,
  "rate" numeric not null,
  "label" text,
  "is_default" boolean default false not null,
  "is_active" boolean default true not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null
);
create table public."calc_history" (
  "id" uuid default gen_random_uuid() not null,
  "calc_number" text not null,
  "product_id" uuid,
  "product_name_snapshot" text,
  "sku_snapshot" text,
  "category_snapshot" text,
  "quantity" numeric default 1 not null,
  "selling_channel_id" uuid,
  "channel_name_snapshot" text,
  "purchase_price" numeric default 0 not null,
  "purchase_gst_rate" numeric default 0 not null,
  "freight" numeric default 0 not null,
  "packaging_cost" numeric default 0 not null,
  "loading_unloading" numeric default 0 not null,
  "labour_cost" numeric default 0 not null,
  "manufacturing_cost" numeric default 0 not null,
  "warranty_provision" numeric default 0 not null,
  "other_purchase_cost" numeric default 0 not null,
  "selling_price" numeric default 0 not null,
  "discount" numeric default 0 not null,
  "sales_gst_rate" numeric default 0 not null,
  "commission_pct" numeric default 0 not null,
  "payment_gateway_pct" numeric default 0 not null,
  "dealer_commission_pct" numeric default 0 not null,
  "shipping_cost" numeric default 0 not null,
  "cod_charge" numeric default 0 not null,
  "marketing_cost" numeric default 0 not null,
  "rto_provision_pct" numeric default 0 not null,
  "other_selling_cost" numeric default 0 not null,
  "total_landed_cost" numeric default 0 not null,
  "net_sales" numeric default 0 not null,
  "total_cost" numeric default 0 not null,
  "total_sales" numeric default 0 not null,
  "gross_profit" numeric default 0 not null,
  "net_profit" numeric default 0 not null,
  "profit_per_unit" numeric default 0 not null,
  "profit_percent" numeric default 0 not null,
  "margin_percent" numeric default 0 not null,
  "roi_percent" numeric default 0 not null,
  "breakeven_price" numeric default 0 not null,
  "is_loss" boolean generated always as ((net_profit < (0)::numeric)) stored,
  "notes" text,
  "created_by" uuid,
  "created_by_name" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."calc_selling_channels" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "commission_pct" numeric default 0 not null,
  "payment_gateway_pct" numeric default 0 not null,
  "fixed_fee" numeric default 0 not null,
  "shipping_cost" numeric default 0 not null,
  "cod_fee" numeric default 0 not null,
  "other_charges" numeric default 0 not null,
  "is_default" boolean default false not null,
  "is_active" boolean default true not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."calc_target_margins" (
  "id" uuid default gen_random_uuid() not null,
  "label" text,
  "percent" numeric not null,
  "is_default" boolean default false not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null
);
create table public."categories" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "slug" text not null,
  "description" text,
  "image_url" text,
  "sort_order" integer default 0,
  "is_active" boolean default true,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "parent_id" uuid,
  "meta_title" text,
  "meta_description" text,
  "focus_keyword" text,
  "canonical_url" text,
  "og_image" text,
  "seo_index" boolean default true not null,
  "seo_follow" boolean default true not null
);
create table public."contact_messages" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "mobile" text,
  "email" text,
  "subject" text,
  "message" text,
  "status" text default 'new'::text,
  "created_at" timestamp with time zone default now()
);
create table public."coupon_redemptions" (
  "id" uuid default gen_random_uuid() not null,
  "coupon_id" uuid not null,
  "order_id" uuid,
  "customer_id" uuid,
  "mobile" text,
  "discount_amount" numeric default 0 not null,
  "created_at" timestamp with time zone default now() not null
);
create table public."coupons" (
  "id" uuid default gen_random_uuid() not null,
  "code" text not null,
  "description" text,
  "discount_type" text default 'percent'::text not null,
  "discount_value" numeric not null,
  "min_order_amount" numeric default 0 not null,
  "max_discount_amount" numeric,
  "usage_limit" integer,
  "usage_count" integer default 0 not null,
  "per_customer_limit" integer,
  "valid_from" timestamp with time zone,
  "valid_until" timestamp with time zone,
  "is_active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "show_on_site" boolean default false not null,
  "banner_text" text
);
create table public."customer_addresses" (
  "id" uuid default gen_random_uuid() not null,
  "customer_id" uuid,
  "user_id" uuid,
  "address_type" text default 'other'::text,
  "street_address" text not null,
  "city" text not null,
  "state" text not null,
  "pincode" text not null,
  "country" text default 'India'::text,
  "phone" text,
  "is_default" boolean default false,
  "created_at" timestamp without time zone default now(),
  "updated_at" timestamp without time zone default now()
);
create table public."customers" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "name" text not null,
  "email" text,
  "mobile" text,
  "default_address_id" uuid,
  "loyalty_points" integer default 0,
  "total_orders" integer default 0,
  "total_spent" numeric default 0,
  "created_at" timestamp without time zone default now(),
  "updated_at" timestamp without time zone default now(),
  "address" text,
  "city" text,
  "state" text,
  "pincode" text,
  "company_name" text,
  "contact_person" text,
  "gstin" text,
  "whatsapp" text,
  "shipping_address" text,
  "shipping_city" text,
  "shipping_state" text,
  "shipping_pincode" text,
  "customer_type" text default 'retail'::text
);
create table public."dealer_enquiries" (
  "id" uuid default gen_random_uuid() not null,
  "enquiry_number" text,
  "name" text not null,
  "company_name" text,
  "mobile" text not null,
  "email" text,
  "city" text,
  "state" text,
  "business_type" text,
  "message" text,
  "status" text default 'new'::text not null,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "customer_id" uuid
);
create table public."delivery_timeline" (
  "id" uuid default gen_random_uuid() not null,
  "order_id" uuid,
  "status" text not null,
  "status_date" timestamp without time zone default now(),
  "description" text,
  "location" text,
  "notes" text
);
create table public."follow_ups" (
  "id" uuid default gen_random_uuid() not null,
  "lead_id" uuid,
  "customer_id" uuid,
  "title" text not null,
  "notes" text,
  "due_at" timestamp with time zone not null,
  "status" text default 'pending'::text not null,
  "assigned_staff" uuid,
  "created_by" uuid,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."global_seo" (
  "id" smallint default 1 not null,
  "site_name" text,
  "meta_title" text,
  "meta_description" text,
  "keywords" text,
  "site_url" text,
  "og_title" text,
  "og_description" text,
  "og_image" text,
  "twitter_image" text,
  "favicon_url" text,
  "gsc_verification" text,
  "ga_measurement_id" text,
  "robots_txt" text,
  "default_canonical" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."invoice_counters" (
  "financial_year" text not null,
  "last_number" integer default 0 not null
);
create table public."invoices" (
  "id" uuid default gen_random_uuid() not null,
  "order_id" uuid,
  "invoice_number" text,
  "invoice_date" date default now(),
  "due_date" date,
  "customer_name" text not null,
  "customer_email" text,
  "customer_address" text,
  "gst_number" text,
  "subtotal" numeric not null,
  "gst_amount" numeric default 0,
  "shipping_cost" numeric default 0,
  "discount_amount" numeric default 0,
  "total_amount" numeric not null,
  "payment_method" text,
  "payment_status" text default 'pending'::text,
  "pdf_url" text,
  "created_at" timestamp without time zone default now(),
  "updated_at" timestamp without time zone default now()
);
create table public."leads" (
  "id" uuid default gen_random_uuid() not null,
  "product_id" uuid,
  "name" text not null,
  "mobile" text not null,
  "email" text,
  "city" text,
  "message" text,
  "source" text default 'website'::text,
  "status" text default 'new'::text,
  "quoted_price" numeric,
  "created_at" timestamp without time zone default now(),
  "updated_at" timestamp without time zone default now(),
  "customer_id" uuid,
  "priority" text default 'medium'::text,
  "estimated_value" numeric,
  "assigned_staff" uuid
);
create table public."notifications" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "order_id" uuid,
  "notification_type" text,
  "title" text not null,
  "message" text not null,
  "email_sent" boolean default false,
  "whatsapp_sent" boolean default false,
  "sms_sent" boolean default false,
  "read" boolean default false,
  "read_at" timestamp without time zone,
  "created_at" timestamp without time zone default now()
);
create table public."order_items" (
  "id" uuid default gen_random_uuid() not null,
  "order_id" uuid not null,
  "product_id" uuid,
  "product_name" text not null,
  "quantity" integer default 1 not null,
  "unit_price" numeric(12,2) default 0,
  "total_price" numeric(12,2) default 0,
  "created_at" timestamp with time zone default now(),
  "warranty_included" boolean default true,
  "gst_percentage" numeric default 18,
  "gst_amount" numeric default 0,
  "product_sku" text,
  "mrp" numeric,
  "hsn_code" text,
  "gst_rate" numeric default 0,
  "taxable_amount" numeric default 0
);
create table public."orders" (
  "id" uuid default gen_random_uuid() not null,
  "order_number" text not null,
  "customer_name" text not null,
  "customer_mobile" text not null,
  "customer_email" text,
  "address" text,
  "city" text,
  "state" text,
  "pincode" text,
  "subtotal" numeric(12,2) default 0,
  "shipping_charge" numeric(12,2) default 0,
  "total_amount" numeric(12,2) default 0,
  "payment_status" text default 'pending'::text,
  "order_status" text default 'new'::text,
  "payment_method" text,
  "notes" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "user_id" uuid,
  "shipping_address_id" uuid,
  "billing_address_id" uuid,
  "tracking_number" text,
  "courier_partner" text,
  "expected_delivery_date" date,
  "actual_delivery_date" date,
  "delivery_status" text default 'not_shipped'::text,
  "shipping_cost" numeric default 0,
  "gst_amount" numeric default 0,
  "discount_amount" numeric default 0,
  "refund_amount" numeric default 0,
  "invoice_number" text,
  "customer_id" uuid,
  "razorpay_order_id" text,
  "razorpay_payment_id" text,
  "razorpay_signature" text,
  "payment_verified_at" timestamp with time zone,
  "cancelled_reason" text,
  "mrp_total" numeric default 0,
  "taxable_amount" numeric default 0,
  "cgst_amount" numeric default 0,
  "sgst_amount" numeric default 0,
  "igst_amount" numeric default 0,
  "place_of_supply" text,
  "coupon_code" text,
  "coupon_discount" numeric default 0 not null,
  "shipping_address" text,
  "shipping_city" text,
  "shipping_state" text,
  "shipping_pincode" text,
  "review_token" uuid default gen_random_uuid() not null,
  "customer_gstin" text,
  "customer_business_name" text,
  "invoice_date" date
);
create table public."page_seo" (
  "id" uuid default gen_random_uuid() not null,
  "page_key" text not null,
  "page_name" text not null,
  "path" text not null,
  "title" text,
  "description" text,
  "keywords" text,
  "canonical_url" text,
  "og_title" text,
  "og_description" text,
  "og_image" text,
  "seo_index" boolean default true not null,
  "seo_follow" boolean default true not null,
  "in_sitemap" boolean default true not null,
  "sitemap_priority" numeric(2,1) default 0.8 not null,
  "sort_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."payment_events" (
  "id" bigint generated always as identity not null,
  "provider" text default 'razorpay'::text not null,
  "event_id" text not null,
  "event_type" text not null,
  "razorpay_order_id" text,
  "razorpay_payment_id" text,
  "amount_paise" bigint,
  "currency" text,
  "order_id" uuid,
  "result" text,
  "received_at" timestamp with time zone default now() not null
);
create table public."pr_pi_number_counters" (
  "fy" text not null,
  "last_number" integer default 0 not null
);
create table public."pr_quote_number_counters" (
  "fy" text not null,
  "last_number" integer default 0 not null
);
create table public."product_costs" (
  "product_id" uuid not null,
  "purchase_cost" numeric,
  "purchase_gst_rate" numeric,
  "default_freight" numeric,
  "default_packaging_cost" numeric,
  "default_other_cost" numeric,
  "updated_at" timestamp with time zone default now() not null
);
create table public."product_images" (
  "id" uuid default gen_random_uuid() not null,
  "product_id" uuid not null,
  "image_url" text not null,
  "storage_path" text,
  "sort_order" integer default 0,
  "created_at" timestamp with time zone default now(),
  "alt_text" text
);
create table public."product_reviews" (
  "id" uuid default gen_random_uuid() not null,
  "product_id" uuid not null,
  "user_id" uuid,
  "order_id" uuid,
  "customer_name" text,
  "rating" smallint not null,
  "title" text,
  "body" text not null,
  "status" text default 'pending'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."products" (
  "id" uuid default gen_random_uuid() not null,
  "category_id" uuid,
  "name" text not null,
  "slug" text not null,
  "sku" text,
  "short_description" text,
  "description" text,
  "price" numeric(12,2),
  "compare_price" numeric(12,2),
  "stock" integer default 0,
  "warranty" text,
  "is_active" boolean default true,
  "is_featured" boolean default false,
  "is_new" boolean default false,
  "specifications" jsonb default '{}'::jsonb,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "mrp" numeric(14,2),
  "hsn_code" text,
  "gst_rate" numeric(5,2) default 0 not null,
  "price_includes_gst" boolean default true not null,
  "subcategory_id" uuid,
  "features" jsonb default '[]'::jsonb,
  "availability" text default 'in_stock'::text,
  "sort_order" integer default 0,
  "meta_title" text,
  "meta_description" text,
  "discount_percent" numeric generated always as (
CASE
    WHEN ((mrp IS NOT NULL) AND (mrp > (0)::numeric) AND (price IS NOT NULL) AND (mrp > price)) THEN round((((1)::numeric - (price / mrp)) * (100)::numeric), 2)
    ELSE (0)::numeric
END) stored,
  "datasheet_url" text,
  "datasheet_path" text,
  "datasheet_name" text,
  "focus_keyword" text,
  "secondary_keywords" text,
  "canonical_url" text,
  "og_title" text,
  "og_description" text,
  "og_image" text,
  "image_alt" text,
  "seo_index" boolean default true not null,
  "seo_follow" boolean default true not null,
  "brand" text
);
create table public."proforma_invoices" (
  "id" uuid default gen_random_uuid() not null,
  "pi_number" text not null,
  "pi_date" date default CURRENT_DATE not null,
  "valid_until" date,
  "party_type" text default 'dealer'::text not null,
  "customer_name" text not null,
  "business_name" text,
  "gstin" text,
  "mobile" text,
  "email" text,
  "address" text,
  "city" text,
  "state" text,
  "pincode" text,
  "ship_same" boolean default true not null,
  "shipping_address" text,
  "shipping_city" text,
  "shipping_state" text,
  "shipping_pincode" text,
  "items" jsonb default '[]'::jsonb not null,
  "discount_amount" numeric(12,2) default 0 not null,
  "shipping_cost" numeric(12,2) default 0 not null,
  "total_amount" numeric(12,2) default 0 not null,
  "payment_terms" text,
  "notes" text,
  "status" text default 'draft'::text not null,
  "created_by" uuid,
  "created_by_name" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "invoice_number" text,
  "invoice_date" date
);
create table public."quotation_audit_log" (
  "id" uuid default gen_random_uuid() not null,
  "quotation_id" uuid not null,
  "admin_user_id" uuid,
  "admin_name_snapshot" text,
  "action" text not null,
  "old_value" text,
  "new_value" text,
  "created_at" timestamp with time zone default now() not null
);
create table public."quotation_items" (
  "id" uuid default gen_random_uuid() not null,
  "quotation_id" uuid not null,
  "product_id" uuid,
  "product_name" text not null,
  "product_sku" text,
  "hsn_code" text,
  "quantity" integer not null,
  "unit_price" numeric default 0 not null,
  "mrp" numeric,
  "gst_rate" numeric default 0 not null,
  "price_includes_gst" boolean default true not null,
  "taxable_amount" numeric default 0 not null,
  "gst_amount" numeric default 0 not null,
  "total_price" numeric default 0 not null,
  "sort_order" integer default 0 not null,
  "discount_percent" numeric default 0 not null,
  "discount_amount" numeric default 0 not null,
  "dealer_price" numeric,
  "category_snapshot" text
);
create table public."quotations" (
  "id" uuid default gen_random_uuid() not null,
  "quote_number" text,
  "customer_id" uuid not null,
  "customer_name" text not null,
  "customer_mobile" text not null,
  "customer_email" text,
  "address" text,
  "city" text,
  "state" text,
  "pincode" text,
  "status" text default 'draft'::text not null,
  "valid_until" date,
  "terms" text,
  "subtotal" numeric default 0 not null,
  "mrp_total" numeric default 0 not null,
  "discount_amount" numeric default 0 not null,
  "taxable_amount" numeric default 0 not null,
  "gst_amount" numeric default 0 not null,
  "cgst_amount" numeric default 0 not null,
  "sgst_amount" numeric default 0 not null,
  "igst_amount" numeric default 0 not null,
  "shipping_cost" numeric default 0 not null,
  "total_amount" numeric default 0 not null,
  "place_of_supply" text,
  "converted_order_id" uuid,
  "converted_at" timestamp with time zone,
  "created_by" uuid,
  "created_by_name" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "quotation_type" text default 'customer'::text not null,
  "sales_person" uuid,
  "company_name" text,
  "contact_person" text,
  "gstin" text,
  "customer_type" text,
  "shipping_address" text,
  "shipping_city" text,
  "shipping_state" text,
  "shipping_pincode" text,
  "payment_terms" text,
  "estimated_delivery" text,
  "dispatch_from" text,
  "transportation" text,
  "freight_terms" text,
  "installation_included" boolean default false not null,
  "commissioning_included" boolean default false not null,
  "warranty_terms" text,
  "valid_days" integer,
  "freight_cost" numeric default 0 not null,
  "installation_cost" numeric default 0 not null,
  "other_charges" numeric default 0 not null,
  "round_off" numeric default 0 not null,
  "dealer_discount_percent" numeric,
  "dealer_margin_percent" numeric,
  "moq" integer,
  "dealer_scheme" text,
  "credit_terms" text,
  "project_name" text,
  "project_location" text,
  "client_name" text,
  "consultant" text,
  "reference_number" text,
  "scope_of_work" text,
  "project_timeline" text,
  "delivery_schedule" text,
  "item_discount_amount" numeric default 0 not null,
  "additional_terms" text,
  "expiry_reminder_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "followup_reminder_at" timestamp with time zone
);
create table public."service_tickets" (
  "id" uuid default gen_random_uuid() not null,
  "ticket_number" text,
  "order_id" uuid,
  "warranty_id" uuid,
  "customer_id" uuid,
  "user_id" uuid,
  "product_id" uuid,
  "product_name" text,
  "serial_number" text,
  "issue_category" text,
  "issue_description" text not null,
  "priority" text default 'normal'::text,
  "status" text default 'open'::text,
  "assigned_to" text,
  "assigned_date" timestamp without time zone,
  "resolution_notes" text,
  "attachments" jsonb,
  "created_at" timestamp without time zone default now(),
  "updated_at" timestamp without time zone default now(),
  "resolved_at" timestamp without time zone,
  "name" text,
  "mobile" text,
  "email" text,
  "issue_type" text,
  "purchase_date" date,
  "attachment_url" text,
  "address" text,
  "city" text,
  "state" text,
  "pincode" text
);
create table public."shipments" (
  "id" uuid default gen_random_uuid() not null,
  "order_id" uuid,
  "shipment_number" text,
  "status" text default 'pending'::text,
  "courier_name" text,
  "tracking_number" text,
  "tracking_url" text,
  "picked_up_date" timestamp without time zone,
  "shipped_date" timestamp without time zone,
  "out_for_delivery_date" timestamp without time zone,
  "delivered_date" timestamp without time zone,
  "estimated_delivery_date" date,
  "delivery_notes" text,
  "current_location" text,
  "last_update" timestamp without time zone,
  "created_at" timestamp without time zone default now(),
  "updated_at" timestamp without time zone default now()
);
create table public."site_settings" (
  "key" text not null,
  "value" jsonb not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."stock_ledger" (
  "id" bigint generated always as identity not null,
  "at" timestamp with time zone default now() not null,
  "product_id" uuid not null,
  "change" integer not null,
  "balance" integer,
  "reason" text not null,
  "actor" uuid,
  "actor_role" text
);
create table public."warranties" (
  "id" uuid default gen_random_uuid() not null,
  "order_id" uuid,
  "order_item_id" uuid,
  "product_id" uuid,
  "product_name" text,
  "customer_id" uuid,
  "serial_number" text not null,
  "registration_date" date default now(),
  "warranty_start_date" date not null,
  "warranty_end_date" date not null,
  "warranty_period_months" integer,
  "warranty_type" text,
  "status" text default 'registered'::text,
  "claim_amount" numeric,
  "claim_date" date,
  "claim_status" text,
  "documents" jsonb,
  "notes" text,
  "created_at" timestamp without time zone default now(),
  "updated_at" timestamp without time zone default now(),
  "warranty_number" text,
  "name" text,
  "mobile" text,
  "email" text,
  "purchase_date" date,
  "invoice_number" text,
  "dealer_name" text,
  "address" text,
  "city" text,
  "state" text,
  "pincode" text
);

alter table public."admin_users" add constraint "admin_users_pkey" PRIMARY KEY (id);
alter table public."audit_log" add constraint "audit_log_pkey" PRIMARY KEY (id);
alter table public."bom_calculations" add constraint "bom_calculations_pkey" PRIMARY KEY (id);
alter table public."calc_audit_log" add constraint "calc_audit_log_pkey" PRIMARY KEY (id);
alter table public."calc_gst_rates" add constraint "calc_gst_rates_pkey" PRIMARY KEY (id);
alter table public."calc_history" add constraint "calc_history_pkey" PRIMARY KEY (id);
alter table public."calc_selling_channels" add constraint "calc_selling_channels_pkey" PRIMARY KEY (id);
alter table public."calc_target_margins" add constraint "calc_target_margins_pkey" PRIMARY KEY (id);
alter table public."categories" add constraint "categories_pkey" PRIMARY KEY (id);
alter table public."contact_messages" add constraint "contact_messages_pkey" PRIMARY KEY (id);
alter table public."coupon_redemptions" add constraint "coupon_redemptions_pkey" PRIMARY KEY (id);
alter table public."coupons" add constraint "coupons_pkey" PRIMARY KEY (id);
alter table public."customer_addresses" add constraint "customer_addresses_pkey" PRIMARY KEY (id);
alter table public."customers" add constraint "customers_pkey" PRIMARY KEY (id);
alter table public."dealer_enquiries" add constraint "dealer_enquiries_pkey" PRIMARY KEY (id);
alter table public."delivery_timeline" add constraint "delivery_timeline_pkey" PRIMARY KEY (id);
alter table public."follow_ups" add constraint "follow_ups_pkey" PRIMARY KEY (id);
alter table public."global_seo" add constraint "global_seo_pkey" PRIMARY KEY (id);
alter table public."invoice_counters" add constraint "invoice_counters_pkey" PRIMARY KEY (financial_year);
alter table public."invoices" add constraint "invoices_pkey" PRIMARY KEY (id);
alter table public."leads" add constraint "leads_pkey" PRIMARY KEY (id);
alter table public."notifications" add constraint "notifications_pkey" PRIMARY KEY (id);
alter table public."order_items" add constraint "order_items_pkey" PRIMARY KEY (id);
alter table public."orders" add constraint "orders_pkey" PRIMARY KEY (id);
alter table public."page_seo" add constraint "page_seo_pkey" PRIMARY KEY (id);
alter table public."payment_events" add constraint "payment_events_pkey" PRIMARY KEY (id);
alter table public."pr_pi_number_counters" add constraint "pr_pi_number_counters_pkey" PRIMARY KEY (fy);
alter table public."pr_quote_number_counters" add constraint "pr_quote_number_counters_pkey" PRIMARY KEY (fy);
alter table public."product_costs" add constraint "product_costs_pkey" PRIMARY KEY (product_id);
alter table public."product_images" add constraint "product_images_pkey" PRIMARY KEY (id);
alter table public."product_reviews" add constraint "product_reviews_pkey" PRIMARY KEY (id);
alter table public."products" add constraint "products_pkey" PRIMARY KEY (id);
alter table public."proforma_invoices" add constraint "proforma_invoices_pkey" PRIMARY KEY (id);
alter table public."quotation_audit_log" add constraint "quotation_audit_log_pkey" PRIMARY KEY (id);
alter table public."quotation_items" add constraint "quotation_items_pkey" PRIMARY KEY (id);
alter table public."quotations" add constraint "quotations_pkey" PRIMARY KEY (id);
alter table public."service_tickets" add constraint "service_tickets_pkey" PRIMARY KEY (id);
alter table public."shipments" add constraint "shipments_pkey" PRIMARY KEY (id);
alter table public."site_settings" add constraint "site_settings_pkey" PRIMARY KEY (key);
alter table public."stock_ledger" add constraint "stock_ledger_pkey" PRIMARY KEY (id);
alter table public."warranties" add constraint "warranties_pkey" PRIMARY KEY (id);
alter table public."admin_users" add constraint "admin_users_email_key" UNIQUE (email);
alter table public."admin_users" add constraint "admin_users_user_id_key" UNIQUE (user_id);
alter table public."categories" add constraint "categories_name_key" UNIQUE (name);
alter table public."categories" add constraint "categories_slug_key" UNIQUE (slug);
alter table public."customers" add constraint "customers_user_id_key" UNIQUE (user_id);
alter table public."invoices" add constraint "invoices_invoice_number_key" UNIQUE (invoice_number);
alter table public."invoices" add constraint "invoices_order_id_key" UNIQUE (order_id);
alter table public."orders" add constraint "orders_order_number_key" UNIQUE (order_number);
alter table public."page_seo" add constraint "page_seo_page_key_key" UNIQUE (page_key);
alter table public."payment_events" add constraint "payment_events_event_id_key" UNIQUE (event_id);
alter table public."product_reviews" add constraint "product_reviews_product_id_user_id_key" UNIQUE (product_id, user_id);
alter table public."products" add constraint "products_sku_key" UNIQUE (sku);
alter table public."products" add constraint "products_slug_key" UNIQUE (slug);
alter table public."proforma_invoices" add constraint "proforma_invoices_pi_number_key" UNIQUE (pi_number);
alter table public."quotations" add constraint "quotations_quote_number_key" UNIQUE (quote_number);
alter table public."service_tickets" add constraint "service_tickets_ticket_number_key" UNIQUE (ticket_number);
alter table public."shipments" add constraint "shipments_shipment_number_key" UNIQUE (shipment_number);
alter table public."audit_log" add constraint "audit_log_action_check" CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])));
alter table public."coupons" add constraint "coupons_discount_type_check" CHECK ((discount_type = ANY (ARRAY['percent'::text, 'flat'::text])));
alter table public."customers" add constraint "customers_type_check" CHECK ((customer_type = ANY (ARRAY['retail'::text, 'dealer'::text, 'project'::text])));
alter table public."dealer_enquiries" add constraint "dealer_enquiries_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'approved'::text, 'rejected'::text, 'closed'::text])));
alter table public."follow_ups" add constraint "follow_ups_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text, 'cancelled'::text])));
alter table public."follow_ups" add constraint "follow_ups_target_check" CHECK ((num_nonnulls(lead_id, customer_id) = 1));
alter table public."global_seo" add constraint "global_seo_id_check" CHECK ((id = 1));
alter table public."leads" add constraint "leads_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])));
alter table public."leads" add constraint "leads_source_check" CHECK ((source = ANY (ARRAY['website'::text, 'whatsapp'::text, 'indiamart'::text, 'instagram'::text, 'facebook'::text, 'google'::text, 'referral'::text, 'phone'::text, 'walk-in'::text, 'other'::text])));
alter table public."leads" add constraint "leads_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'interested'::text, 'quotation_sent'::text, 'negotiation'::text, 'converted'::text, 'lost'::text])));
alter table public."orders" add constraint "orders_order_status_check" CHECK ((order_status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text])));
alter table public."orders" add constraint "orders_payment_status_check" CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text])));
alter table public."product_reviews" add constraint "product_reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5)));
alter table public."product_reviews" add constraint "product_reviews_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public."products" add constraint "products_availability_check" CHECK ((availability = ANY (ARRAY['in_stock'::text, 'out_of_stock'::text, 'preorder'::text, 'discontinued'::text])));
alter table public."products" add constraint "products_stock_check" CHECK ((stock >= 0));
alter table public."proforma_invoices" add constraint "proforma_invoices_party_type_check" CHECK ((party_type = ANY (ARRAY['dealer'::text, 'customer'::text])));
alter table public."proforma_invoices" add constraint "proforma_invoices_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'paid'::text, 'cancelled'::text])));
alter table public."quotation_audit_log" add constraint "quotation_audit_log_action_check" CHECK ((action = ANY (ARRAY['created'::text, 'status_changed'::text, 'edited'::text, 'converted'::text])));
alter table public."quotation_items" add constraint "quotation_items_quantity_check" CHECK ((quantity > 0));
alter table public."quotations" add constraint "quotations_freight_terms_check" CHECK (((freight_terms IS NULL) OR (freight_terms = ANY (ARRAY['paid'::text, 'to_pay'::text]))));
alter table public."quotations" add constraint "quotations_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'rejected'::text, 'expired'::text])));
alter table public."quotations" add constraint "quotations_type_check" CHECK ((quotation_type = ANY (ARRAY['customer'::text, 'dealer'::text, 'project'::text])));
alter table public."service_tickets" add constraint "service_tickets_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));
alter table public."service_tickets" add constraint "service_tickets_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text, 'cancelled'::text])));
alter table public."warranties" add constraint "warranties_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text])));
alter table public."admin_users" add constraint "admin_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."bom_calculations" add constraint "bom_calculations_linked_product_id_fkey" FOREIGN KEY (linked_product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public."calc_audit_log" add constraint "calc_audit_log_admin_user_id_fkey" FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."calc_history" add constraint "calc_history_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."calc_history" add constraint "calc_history_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public."calc_history" add constraint "calc_history_selling_channel_id_fkey" FOREIGN KEY (selling_channel_id) REFERENCES calc_selling_channels(id) ON DELETE SET NULL;
alter table public."categories" add constraint "categories_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE;
alter table public."coupon_redemptions" add constraint "coupon_redemptions_coupon_id_fkey" FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE;
alter table public."coupon_redemptions" add constraint "coupon_redemptions_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
alter table public."coupon_redemptions" add constraint "coupon_redemptions_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public."customer_addresses" add constraint "customer_addresses_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
alter table public."customer_addresses" add constraint "customer_addresses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."customers" add constraint "customers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."dealer_enquiries" add constraint "dealer_enquiries_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
alter table public."delivery_timeline" add constraint "delivery_timeline_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public."follow_ups" add constraint "follow_ups_assigned_staff_fkey" FOREIGN KEY (assigned_staff) REFERENCES admin_users(id) ON DELETE SET NULL;
alter table public."follow_ups" add constraint "follow_ups_created_by_fkey" FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL;
alter table public."follow_ups" add constraint "follow_ups_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
alter table public."follow_ups" add constraint "follow_ups_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;
alter table public."invoices" add constraint "invoices_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public."leads" add constraint "leads_assigned_staff_fkey" FOREIGN KEY (assigned_staff) REFERENCES admin_users(id) ON DELETE SET NULL;
alter table public."leads" add constraint "leads_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
alter table public."leads" add constraint "leads_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public."notifications" add constraint "notifications_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public."notifications" add constraint "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."order_items" add constraint "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public."order_items" add constraint "order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public."orders" add constraint "orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
alter table public."orders" add constraint "orders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."payment_events" add constraint "payment_events_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public."product_costs" add constraint "product_costs_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public."product_images" add constraint "product_images_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public."product_reviews" add constraint "product_reviews_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public."product_reviews" add constraint "product_reviews_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public."product_reviews" add constraint "product_reviews_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."products" add constraint "products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
alter table public."products" add constraint "products_subcategory_id_fkey" FOREIGN KEY (subcategory_id) REFERENCES categories(id) ON DELETE SET NULL;
alter table public."proforma_invoices" add constraint "proforma_invoices_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."quotation_audit_log" add constraint "quotation_audit_log_admin_user_id_fkey" FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."quotation_audit_log" add constraint "quotation_audit_log_quotation_id_fkey" FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE;
alter table public."quotation_items" add constraint "quotation_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
alter table public."quotation_items" add constraint "quotation_items_quotation_id_fkey" FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE;
alter table public."quotations" add constraint "quotations_converted_order_id_fkey" FOREIGN KEY (converted_order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public."quotations" add constraint "quotations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."quotations" add constraint "quotations_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
alter table public."quotations" add constraint "quotations_sales_person_fkey" FOREIGN KEY (sales_person) REFERENCES admin_users(id) ON DELETE SET NULL;
alter table public."service_tickets" add constraint "service_tickets_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);
alter table public."service_tickets" add constraint "service_tickets_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public."service_tickets" add constraint "service_tickets_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);
alter table public."service_tickets" add constraint "service_tickets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public."service_tickets" add constraint "service_tickets_warranty_id_fkey" FOREIGN KEY (warranty_id) REFERENCES warranties(id) ON DELETE SET NULL;
alter table public."shipments" add constraint "shipments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public."stock_ledger" add constraint "stock_ledger_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
alter table public."warranties" add constraint "warranties_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);
alter table public."warranties" add constraint "warranties_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public."warranties" add constraint "warranties_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

CREATE INDEX audit_log_table_at_idx ON public.audit_log USING btree (table_name, at DESC);
CREATE INDEX bom_calculations_linked_product_idx ON public.bom_calculations USING btree (linked_product_id);
CREATE INDEX calc_audit_log_created_at_idx ON public.calc_audit_log USING btree (created_at DESC);
CREATE INDEX calc_history_created_at_idx ON public.calc_history USING btree (created_at DESC);
CREATE INDEX calc_history_is_loss_idx ON public.calc_history USING btree (is_loss);
CREATE UNIQUE INDEX calc_history_number_key ON public.calc_history USING btree (calc_number);
CREATE INDEX calc_history_product_id_idx ON public.calc_history USING btree (product_id);
CREATE INDEX categories_parent_id_idx ON public.categories USING btree (parent_id);
CREATE INDEX coupon_redemptions_coupon_id_idx ON public.coupon_redemptions USING btree (coupon_id);
CREATE INDEX coupon_redemptions_mobile_idx ON public.coupon_redemptions USING btree (mobile);
CREATE UNIQUE INDEX coupons_code_key ON public.coupons USING btree (upper(code));
CREATE INDEX customer_addresses_user_id_idx ON public.customer_addresses USING btree (user_id);
CREATE INDEX dealer_enquiries_created_at_idx ON public.dealer_enquiries USING btree (created_at DESC);
CREATE INDEX dealer_enquiries_customer_id_idx ON public.dealer_enquiries USING btree (customer_id);
CREATE UNIQUE INDEX dealer_enquiries_number_key ON public.dealer_enquiries USING btree (enquiry_number) WHERE (enquiry_number IS NOT NULL);
CREATE INDEX follow_ups_assigned_staff_idx ON public.follow_ups USING btree (assigned_staff);
CREATE INDEX follow_ups_customer_id_idx ON public.follow_ups USING btree (customer_id);
CREATE INDEX follow_ups_due_at_idx ON public.follow_ups USING btree (due_at);
CREATE INDEX follow_ups_lead_id_idx ON public.follow_ups USING btree (lead_id);
CREATE INDEX follow_ups_status_idx ON public.follow_ups USING btree (status);
CREATE INDEX leads_assigned_staff_idx ON public.leads USING btree (assigned_staff);
CREATE INDEX leads_customer_id_idx ON public.leads USING btree (customer_id);
CREATE INDEX leads_mobile_idx ON public.leads USING btree (mobile);
CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);
CREATE INDEX idx_orders_created ON public.orders USING btree (created_at DESC);
CREATE INDEX idx_orders_status ON public.orders USING btree (order_status);
CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at DESC);
CREATE INDEX orders_customer_mobile_idx ON public.orders USING btree (customer_mobile);
CREATE UNIQUE INDEX orders_invoice_number_key ON public.orders USING btree (invoice_number) WHERE (invoice_number IS NOT NULL);
CREATE INDEX orders_order_status_idx ON public.orders USING btree (order_status);
CREATE UNIQUE INDEX orders_review_token_idx ON public.orders USING btree (review_token);
CREATE INDEX page_seo_sort_idx ON public.page_seo USING btree (sort_order, page_name);
CREATE INDEX payment_events_rzp_order_idx ON public.payment_events USING btree (razorpay_order_id);
CREATE INDEX idx_product_images_product ON public.product_images USING btree (product_id);
CREATE UNIQUE INDEX product_reviews_order_product_idx ON public.product_reviews USING btree (order_id, product_id) WHERE (order_id IS NOT NULL);
CREATE INDEX product_reviews_product_idx ON public.product_reviews USING btree (product_id);
CREATE INDEX product_reviews_status_idx ON public.product_reviews USING btree (status);
CREATE INDEX idx_products_active ON public.products USING btree (is_active);
CREATE INDEX idx_products_category ON public.products USING btree (category_id);
CREATE INDEX idx_products_featured ON public.products USING btree (is_featured);
CREATE INDEX products_category_id_idx ON public.products USING btree (category_id);
CREATE INDEX products_is_active_idx ON public.products USING btree (is_active);
CREATE INDEX products_subcategory_id_idx ON public.products USING btree (subcategory_id);
CREATE INDEX proforma_invoices_created_idx ON public.proforma_invoices USING btree (created_at DESC);
CREATE UNIQUE INDEX proforma_invoices_invoice_number_key ON public.proforma_invoices USING btree (invoice_number) WHERE (invoice_number IS NOT NULL);
CREATE INDEX proforma_invoices_mobile_idx ON public.proforma_invoices USING btree (mobile);
CREATE INDEX quotation_audit_log_quotation_id_idx ON public.quotation_audit_log USING btree (quotation_id);
CREATE INDEX quotation_items_quotation_id_idx ON public.quotation_items USING btree (quotation_id);
CREATE INDEX quotations_customer_id_idx ON public.quotations USING btree (customer_id);
CREATE INDEX quotations_sales_person_idx ON public.quotations USING btree (sales_person);
CREATE INDEX quotations_status_idx ON public.quotations USING btree (status);
CREATE INDEX quotations_type_idx ON public.quotations USING btree (quotation_type);
CREATE INDEX service_tickets_customer_id_idx ON public.service_tickets USING btree (customer_id);
CREATE INDEX service_tickets_mobile_idx ON public.service_tickets USING btree (mobile);
CREATE INDEX stock_ledger_product_at_idx ON public.stock_ledger USING btree (product_id, at DESC);
CREATE INDEX warranties_customer_id_idx ON public.warranties USING btree (customer_id);
CREATE INDEX warranties_mobile_idx ON public.warranties USING btree (mobile);
CREATE UNIQUE INDEX warranties_warranty_number_key ON public.warranties USING btree (warranty_number) WHERE (warranty_number IS NOT NULL);

CREATE OR REPLACE FUNCTION public.active_site_banner_coupon()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_coupon coupons%rowtype;
begin
  select * into v_coupon from coupons
   where show_on_site = true
     and is_active = true
     and (valid_from is null or now() >= valid_from)
     and (valid_until is null or now() <= valid_until)
     and (usage_limit is null or usage_count < usage_limit)
   order by created_at desc
   limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'code', v_coupon.code,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'min_order_amount', v_coupon.min_order_amount,
    'banner_text', v_coupon.banner_text
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_convert_quotation_to_order(p_quotation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quote    record;
  v_customer record;
  v_order_id uuid;
  v_order_number text;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into v_quote from quotations where id = p_quotation_id;
  if v_quote.id is null then
    raise exception 'Quotation not found' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'accepted' then
    raise exception 'Only an accepted quotation can be converted to an order' using errcode = 'P0001';
  end if;
  if v_quote.converted_order_id is not null then
    raise exception 'This quotation has already been converted to an order' using errcode = 'P0001';
  end if;

  select * into v_customer from customers where id = v_quote.customer_id;

  v_order_number := public.pr_next_number('public.pr_order_number_seq', 'PR');

  insert into orders (
    order_number, user_id, customer_id,
    customer_name, customer_mobile, customer_email,
    address, city, state, pincode,
    subtotal, mrp_total, discount_amount, taxable_amount,
    gst_amount, cgst_amount, sgst_amount, igst_amount,
    shipping_cost, total_amount, place_of_supply,
    order_status, payment_status, payment_method, notes
  ) values (
    v_order_number, v_customer.user_id, v_quote.customer_id,
    v_quote.customer_name, v_quote.customer_mobile, v_quote.customer_email,
    v_quote.address, v_quote.city, v_quote.state, v_quote.pincode,
    v_quote.subtotal, v_quote.mrp_total, v_quote.discount_amount, v_quote.taxable_amount,
    v_quote.gst_amount, v_quote.cgst_amount, v_quote.sgst_amount, v_quote.igst_amount,
    v_quote.shipping_cost, v_quote.total_amount, v_quote.place_of_supply,
    'pending', 'pending', 'cod', 'Converted from quotation ' || v_quote.quote_number
  ) returning id into v_order_id;

  insert into order_items (
    order_id, product_id, product_name, product_sku,
    quantity, unit_price, total_price, mrp, hsn_code, gst_rate, taxable_amount, gst_amount
  )
  select
    v_order_id, product_id, product_name, product_sku,
    quantity, unit_price, total_price, mrp, hsn_code, gst_rate, taxable_amount, gst_amount
  from quotation_items where quotation_id = p_quotation_id;

  update products p set stock = greatest(coalesce(p.stock, 0) - qi.quantity, 0)
  from quotation_items qi
  where qi.quotation_id = p_quotation_id and p.id = qi.product_id and p.availability = 'in_stock';

  update quotations set converted_order_id = v_order_id, converted_at = now()
  where id = p_quotation_id;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total_products',    (select count(*) from products),
    'active_products',   (select count(*) from products where is_active),
    'total_orders',      (select count(*) from orders),
    'pending_orders',    (select count(*) from orders where order_status = 'pending'),
    'processing_orders', (select count(*) from orders where order_status = 'processing'),
    'confirmed_orders',  (select count(*) from orders where order_status = 'confirmed'),
    'shipped_orders',    (select count(*) from orders where order_status = 'shipped'),
    'completed_orders',  (select count(*) from orders where order_status = 'delivered'),
    'cancelled_orders',  (select count(*) from orders where order_status = 'cancelled'),
    'total_customers',   (select count(*) from customers),
    'warranty_requests', (select count(*) from warranties),
    'warranty_pending',  (select count(*) from warranties where status = 'pending'),
    'service_requests',  (select count(*) from service_tickets),
    'service_open',      (select count(*) from service_tickets where status = 'open'),
    'dealer_enquiries',  (select count(*) from dealer_enquiries),
    'dealer_new',        (select count(*) from dealer_enquiries where status = 'new'),
    'leads',             (select count(*) from leads),
    'revenue_paid',      (select coalesce(sum(total_amount), 0) from orders where payment_status = 'paid'),
    'revenue_total',     (select coalesce(sum(total_amount), 0) from orders where order_status <> 'cancelled'),
    'low_stock',         (select count(*) from products where is_active and coalesce(stock, 0) <= 5),
    'reviews_pending',   (select count(*) from product_reviews where status = 'pending'),
    'followups_today',   (select count(*) from follow_ups where status = 'pending' and due_at::date = current_date),
    'followups_overdue', (select count(*) from follow_ups where status = 'pending' and due_at < now()),
    'new_leads',         (select count(*) from leads where status = 'new'),
    'quotations_pending', (select count(*) from quotations where status = 'sent')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_next_pi_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := now() at time zone 'Asia/Kolkata';
  v_fy  text;
  v_num integer;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  v_fy := case when extract(month from v_now) >= 4
    then to_char(v_now, 'YYYY') || '-' || to_char(v_now + interval '1 year', 'YY')
    else to_char(v_now - interval '1 year', 'YYYY') || '-' || to_char(v_now, 'YY')
  end;

  insert into public.pr_pi_number_counters (fy, last_number) values (v_fy, 1)
    on conflict (fy) do update set last_number = pr_pi_number_counters.last_number + 1
    returning last_number into v_num;

  return 'PRI/PI/' || v_fy || '/' || lpad(v_num::text, 4, '0');
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_next_quote_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return public.pr_next_quote_number_internal();
end;
$function$;

CREATE OR REPLACE FUNCTION public.bom_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.calc_next_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return public.pr_next_number('public.pr_calc_number_seq', 'PRC');
end;
$function$;

CREATE OR REPLACE FUNCTION public.calc_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_order(p_order_number text, p_mobile text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id     uuid := auth.uid();
  v_order       orders%rowtype;
  v_customer_id uuid;
begin
  if v_user_id is null then
    raise exception 'Please sign in first' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_order_number), '') = '' or coalesce(trim(p_mobile), '') = '' then
    raise exception 'Order ID and mobile number are both required' using errcode = 'P0001';
  end if;

  select * into v_order from orders
  where upper(order_number) = upper(trim(p_order_number))
    and customer_mobile = trim(p_mobile);

  if not found then
    raise exception 'No order found for that order ID and mobile number' using errcode = 'P0001';
  end if;

  if v_order.user_id is not null and v_order.user_id <> v_user_id then
    raise exception 'That order already belongs to another account' using errcode = 'P0001';
  end if;

  -- Reuse this account's customer record, or adopt the order's existing one.
  select id into v_customer_id from customers where user_id = v_user_id;
  if v_customer_id is null then
    if v_order.customer_id is not null then
      update customers set user_id = v_user_id
      where id = v_order.customer_id and user_id is null
      returning id into v_customer_id;
    end if;
  end if;
  if v_customer_id is null then
    insert into customers (user_id, name, email, mobile)
    values (v_user_id, v_order.customer_name, v_order.customer_email, v_order.customer_mobile)
    returning id into v_customer_id;
  end if;

  update orders
     set user_id = v_user_id,
         customer_id = coalesce(customer_id, v_customer_id)
   where id = v_order.id;

  return jsonb_build_object(
    'order_number', v_order.order_number,
    'total_amount', v_order.total_amount,
    'order_status', v_order.order_status
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.convert_lead_to_customer(p_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead record;
  v_customer_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into v_lead from leads where id = p_lead_id;
  if v_lead.id is null then
    raise exception 'Lead not found' using errcode = 'P0001';
  end if;

  select id into v_customer_id from customers
   where public.pr_norm_mobile(mobile) = public.pr_norm_mobile(v_lead.mobile) limit 1;

  if v_customer_id is null then
    insert into customers (name, email, mobile, city)
    values (v_lead.name, v_lead.email, v_lead.mobile, v_lead.city)
    returning id into v_customer_id;
  end if;

  update leads set status = 'converted', customer_id = v_customer_id where id = p_lead_id;

  return jsonb_build_object('customer_id', v_customer_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_website_order(p_customer jsonb, p_items jsonb, p_payment_method text DEFAULT 'cod'::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order_id     uuid;
  v_order_number text;
  v_customer_id  uuid;
  v_user_id      uuid := auth.uid();
  v_name         text := nullif(trim(p_customer->>'name'), '');
  v_mobile       text := nullif(trim(p_customer->>'mobile'), '');
  v_email        text := nullif(trim(p_customer->>'email'), '');
  v_address      text := nullif(trim(p_customer->>'address'), '');
  v_city         text := nullif(trim(p_customer->>'city'), '');
  v_state        text := nullif(trim(p_customer->>'state'), '');
  v_pincode      text := nullif(trim(p_customer->>'pincode'), '');
  v_ship_same    boolean := coalesce((p_customer->>'shipping_same')::boolean, true);
  v_s_address    text := nullif(trim(p_customer->>'shipping_address'), '');
  v_s_city       text := nullif(trim(p_customer->>'shipping_city'), '');
  v_s_state      text := nullif(trim(p_customer->>'shipping_state'), '');
  v_s_pincode    text := nullif(trim(p_customer->>'shipping_pincode'), '');
  -- GST invoice (B2B): optional; when given, the invoice is billed to this GSTIN
  v_gstin        text := nullif(upper(regexp_replace(coalesce(p_customer->>'gstin', ''), '\s', '', 'g')), '');
  v_business     text := nullif(trim(p_customer->>'business_name'), '');
  v_pos          text;
  v_subtotal     numeric := 0;
  v_mrp_total    numeric := 0;
  v_discount     numeric := 0;
  v_taxable      numeric := 0;
  v_gst          numeric := 0;
  v_gst_added    numeric := 0;
  v_shipping     numeric := 0;
  v_total        numeric := 0;
  v_ship_cfg     jsonb;
  v_company      jsonb;
  v_seller_state text;
  v_intra        boolean;
  v_lines        jsonb;
  v_bad          text;
  v_coupon_code     text := nullif(upper(trim(p_coupon_code)), '');
  v_coupon          coupons%rowtype;
  v_coupon_discount numeric := 0;
  v_prior_uses      integer;
begin
  -- ---- 1. customer validation -------------------------------------------
  if v_name is null then raise exception 'Full name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit Indian mobile number is required' using errcode = 'P0001';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Email address is not valid' using errcode = 'P0001';
  end if;
  if v_address is null then raise exception 'Delivery address is required' using errcode = 'P0001'; end if;
  if v_city   is null then raise exception 'City is required' using errcode = 'P0001'; end if;
  if v_state  is null then raise exception 'State is required' using errcode = 'P0001'; end if;
  if v_pincode is null or v_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'A valid 6-digit pincode is required' using errcode = 'P0001';
  end if;

  if v_ship_same then
    v_s_address := v_address; v_s_city := v_city; v_s_state := v_state; v_s_pincode := v_pincode;
  else
    if v_s_address is null or v_s_city is null or v_s_state is null then
      raise exception 'Please enter the full shipping address' using errcode = 'P0001';
    end if;
    if v_s_pincode is null or v_s_pincode !~ '^[1-9][0-9]{5}$' then
      raise exception 'Please enter a valid 6-digit shipping pincode' using errcode = 'P0001';
    end if;
  end if;
  if v_gstin is not null then
    if not public.pr_valid_gstin(v_gstin) then
      raise exception 'GSTIN "%" is not valid. Please check the 15-character number.', v_gstin using errcode = 'P0001';
    end if;
    if public.pr_gst_state_code(v_state) is distinct from substr(v_gstin, 1, 2) then
      raise exception 'GSTIN state code % does not match the billing state %. Enter the billing address registered for this GSTIN.',
        substr(v_gstin, 1, 2), v_state using errcode = 'P0001';
    end if;
    if v_business is null then
      raise exception 'Business / legal name is required for a GST invoice' using errcode = 'P0001';
    end if;
  else
    v_business := null;
  end if;

  if coalesce(p_payment_method, 'cod') not in ('cod','razorpay') then
    raise exception 'Unsupported payment method' using errcode = 'P0001';
  end if;

  -- ---- 2. cart validation ------------------------------------------------
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as r(product_id uuid, quantity integer)
    where r.product_id is null or r.quantity is null or r.quantity < 1
  ) then
    raise exception 'Cart contains an invalid line item' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'quantity', qty)), '[]'::jsonb)
    into v_lines
  from (
    select r.product_id, sum(r.quantity)::int as qty
    from jsonb_to_recordset(p_items) as r(product_id uuid, quantity integer)
    group by r.product_id
  ) grouped;

  -- ---- 3. availability ---------------------------------------------------
  -- lock the ordered products until this order commits, so two orders can
  -- never both take the last unit (migration 36)
  perform 1 from products
   where id in (select l.product_id from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer))
   order by id for update;

  if exists (
    select 1 from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
    left join products p on p.id = l.product_id and p.is_active is true
    where p.id is null
  ) then
    raise exception 'A product in your cart is no longer available' using errcode = 'P0001';
  end if;

  select p.name into v_bad
  from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
  join products p on p.id = l.product_id
  where p.price is null or p.price <= 0 limit 1;
  if v_bad is not null then
    raise exception 'No price is set for "%". Please contact us for a quote.', v_bad using errcode = 'P0001';
  end if;

  select p.name into v_bad
  from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
  join products p on p.id = l.product_id
  where p.availability in ('out_of_stock','discontinued') limit 1;
  if v_bad is not null then
    raise exception '"%" is currently unavailable', v_bad using errcode = 'P0001';
  end if;

  select p.name into v_bad
  from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
  join products p on p.id = l.product_id
  where p.availability = 'in_stock' and coalesce(p.stock, 0) < l.quantity limit 1;
  if v_bad is not null then
    raise exception 'Not enough stock for "%"', v_bad using errcode = 'P0001';
  end if;

  -- ---- 4. money, computed from the database only -------------------------
  select value into v_company from site_settings where key = 'company';
  v_seller_state := nullif(trim(coalesce(v_company->>'state', '')), '');
  -- With no seller state configured, treat the supply as intra-state so the
  -- tax is split CGST/SGST rather than silently charged as IGST.
  -- Place of supply (IGST Act s.10): a registered buyer is billed at the
  -- state of its GSTIN (bill-to); otherwise it is where the goods are delivered.
  v_pos   := case when v_gstin is not null then v_state else v_s_state end;
  v_intra := v_seller_state is null or lower(v_seller_state) = lower(v_pos);

  select
    coalesce(sum(p.price * l.quantity), 0),
    coalesce(sum(coalesce(p.mrp, p.price) * l.quantity), 0),
    coalesce(sum(
      case when coalesce(p.price_includes_gst, true)
           then (p.price * l.quantity) / (1 + coalesce(p.gst_rate, 0) / 100)
           else (p.price * l.quantity)
      end), 0),
    coalesce(sum(
      case when coalesce(p.gst_rate, 0) = 0 then 0
           when coalesce(p.price_includes_gst, true)
           then (p.price * l.quantity) - (p.price * l.quantity) / (1 + p.gst_rate / 100)
           else (p.price * l.quantity) * p.gst_rate / 100
      end), 0),
    coalesce(sum(
      case when coalesce(p.price_includes_gst, true) or coalesce(p.gst_rate, 0) = 0 then 0
           else (p.price * l.quantity) * p.gst_rate / 100
      end), 0)
  into v_subtotal, v_mrp_total, v_taxable, v_gst, v_gst_added
  from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
  join products p on p.id = l.product_id;

  v_subtotal  := round(v_subtotal, 2);
  v_mrp_total := round(v_mrp_total, 2);
  v_discount  := round(greatest(v_mrp_total - v_subtotal, 0), 2);
  v_taxable   := round(v_taxable, 2);
  v_gst       := round(v_gst, 2);
  v_gst_added := round(v_gst_added, 2);

  select value into v_ship_cfg from site_settings where key = 'shipping';
  v_shipping := coalesce((v_ship_cfg->>'flat_rate')::numeric, 0);
  if coalesce((v_ship_cfg->>'free_above')::numeric, 0) > 0
     and v_subtotal >= (v_ship_cfg->>'free_above')::numeric then
    v_shipping := 0;
  end if;

  -- GST is only ADDED to the total when prices are exclusive of it.
  v_total := round(v_subtotal + v_gst_added + v_shipping, 2);

  -- ---- 4b. coupon (optional, additive on top of the total above) --------
  if v_coupon_code is not null then
    select * into v_coupon from coupons where upper(code) = v_coupon_code;

    if not found then
      raise exception 'Coupon code "%" is not valid', v_coupon_code using errcode = 'P0001';
    end if;
    if not v_coupon.is_active then
      raise exception 'Coupon code "%" is no longer active', v_coupon_code using errcode = 'P0001';
    end if;
    if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
      raise exception 'Coupon code "%" is not active yet', v_coupon_code using errcode = 'P0001';
    end if;
    if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
      raise exception 'Coupon code "%" has expired', v_coupon_code using errcode = 'P0001';
    end if;
    if v_subtotal < coalesce(v_coupon.min_order_amount, 0) then
      raise exception 'Coupon code "%" needs a minimum order of Rs %', v_coupon_code, v_coupon.min_order_amount
        using errcode = 'P0001';
    end if;
    if v_coupon.usage_limit is not null and v_coupon.usage_count >= v_coupon.usage_limit then
      raise exception 'Coupon code "%" has reached its usage limit', v_coupon_code using errcode = 'P0001';
    end if;
    if v_coupon.per_customer_limit is not null then
      select count(*) into v_prior_uses from coupon_redemptions
       where coupon_id = v_coupon.id and mobile = v_mobile;
      if v_prior_uses >= v_coupon.per_customer_limit then
        raise exception 'You have already used coupon code "%"', v_coupon_code using errcode = 'P0001';
      end if;
    end if;

    v_coupon_discount := case when v_coupon.discount_type = 'percent'
      then v_subtotal * v_coupon.discount_value / 100
      else v_coupon.discount_value
    end;
    if v_coupon.max_discount_amount is not null then
      v_coupon_discount := least(v_coupon_discount, v_coupon.max_discount_amount);
    end if;
    v_coupon_discount := round(least(v_coupon_discount, v_total), 2);
    v_total := greatest(round(v_total - v_coupon_discount, 2), 0);
  end if;

  -- ---- 5. customer record ------------------------------------------------
  if v_user_id is not null then
    select id into v_customer_id from customers where user_id = v_user_id;
  end if;
  if v_customer_id is null then
    select id into v_customer_id from customers where mobile = v_mobile order by created_at limit 1;
  end if;
  if v_customer_id is null then
    insert into customers (user_id, name, email, mobile, total_orders, total_spent)
    values (v_user_id, v_name, v_email, v_mobile, 0, 0)
    returning id into v_customer_id;
  end if;

  -- ---- 6. order ----------------------------------------------------------
  v_order_number := public.pr_next_number('public.pr_order_number_seq', 'PR');

  insert into orders (
    order_number, user_id, customer_id,
    customer_name, customer_mobile, customer_email,
    address, city, state, pincode,
    shipping_address, shipping_city, shipping_state, shipping_pincode,
    subtotal, mrp_total, discount_amount, taxable_amount,
    gst_amount, cgst_amount, sgst_amount, igst_amount,
    shipping_cost, coupon_code, coupon_discount, total_amount, place_of_supply,
    customer_gstin, customer_business_name,
    order_status, payment_status, payment_method
  ) values (
    v_order_number, v_user_id, v_customer_id,
    v_name, v_mobile, v_email,
    v_address, v_city, v_state, v_pincode,
    v_s_address, v_s_city, v_s_state, v_s_pincode,
    v_subtotal, v_mrp_total, v_discount, v_taxable,
    v_gst,
    case when v_intra then round(v_gst / 2, 2) else 0 end,
    case when v_intra then v_gst - round(v_gst / 2, 2) else 0 end,
    case when v_intra then 0 else v_gst end,
    v_shipping, v_coupon_code, v_coupon_discount, v_total, v_pos,
    v_gstin, v_business,
    'pending', 'pending', coalesce(p_payment_method, 'cod')
  ) returning id into v_order_id;

  insert into order_items (
    order_id, product_id, product_name, product_sku, quantity,
    unit_price, total_price, mrp, hsn_code, gst_rate, taxable_amount, gst_amount
  )
  select
    v_order_id, p.id, p.name, p.sku, l.quantity,
    p.price, round(p.price * l.quantity, 2),
    p.mrp, p.hsn_code, coalesce(p.gst_rate, 0),
    round(case when coalesce(p.price_includes_gst, true)
               then (p.price * l.quantity) / (1 + coalesce(p.gst_rate, 0) / 100)
               else (p.price * l.quantity) end, 2),
    round(case when coalesce(p.gst_rate, 0) = 0 then 0
               when coalesce(p.price_includes_gst, true)
               then (p.price * l.quantity) - (p.price * l.quantity) / (1 + p.gst_rate / 100)
               else (p.price * l.quantity) * p.gst_rate / 100 end, 2)
  from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
  join products p on p.id = l.product_id;

  -- ---- 7. stock ----------------------------------------------------------
  perform set_config('powerrun.stock_reason', 'order ' || v_order_number, true);
  update products p
     set stock = greatest(coalesce(p.stock, 0) - l.quantity, 0)
    from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
   where p.id = l.product_id and p.availability = 'in_stock';

  update products
     set availability = 'out_of_stock'
   where id in (select l.product_id from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer))
     and availability = 'in_stock'
     and coalesce(stock, 0) = 0;

  update customers
     set total_orders = coalesce(total_orders, 0) + 1,
         total_spent  = coalesce(total_spent, 0) + v_total
   where id = v_customer_id;

  -- ---- 8. coupon redemption (only if one was actually applied) -----------
  if v_coupon_code is not null then
    insert into coupon_redemptions (coupon_id, order_id, customer_id, mobile, discount_amount)
    values (v_coupon.id, v_order_id, v_customer_id, v_mobile, v_coupon_discount);

    update coupons set usage_count = usage_count + 1 where id = v_coupon.id;
  end if;

  return jsonb_build_object(
    'order_id',         v_order_id,
    'order_number',     v_order_number,
    'subtotal',         v_subtotal,
    'discount',         v_discount,
    'gst',              v_gst,
    'shipping',         v_shipping,
    'coupon_code',      v_coupon_code,
    'coupon_discount',  v_coupon_discount,
    'total_amount',     v_total,
    'gstin',            v_gstin
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.crm_dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total_customers',          (select count(*) from customers),
    'new_customers_month',      (select count(*) from customers where created_at >= date_trunc('month', now())),
    'total_leads',               (select count(*) from leads),
    'new_leads_month',           (select count(*) from leads where created_at >= date_trunc('month', now())),
    'followups_today',           (select count(*) from follow_ups where status = 'pending' and due_at::date = current_date),
    'followups_overdue',         (select count(*) from follow_ups where status = 'pending' and due_at < now()),
    'service_open',              (select count(*) from service_tickets where status in ('open', 'in_progress')),
    'warranties_active',         (select count(*) from warranties where status = 'approved' and warranty_end_date >= current_date),
    'warranties_expiring_30d',   (select count(*) from warranties where status = 'approved'
                                     and warranty_end_date between current_date and current_date + 30),
    'quotations_pending',        (select count(*) from quotations where status = 'sent')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
select 'TKT-' || to_char(now(), 'YYMMDDHH24MISSMS') || '-' || floor(random() * 9000 + 1000)::text;
$function$;

CREATE OR REPLACE FUNCTION public.get_order_details(p_order_id uuid)
 RETURNS TABLE(order_id uuid, order_number text, customer_name text, customer_email text, customer_mobile text, total_amount numeric, order_status text, payment_status text, created_at timestamp without time zone, items jsonb, shipment jsonb, delivery_timeline jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select
  o.id,
  o.order_number,
  o.customer_name,
  o.customer_email,
  o.customer_mobile,
  o.total_amount,
  o.order_status,
  o.payment_status,
  o.created_at,
  coalesce(jsonb_agg(jsonb_build_object('product_name', oi.product_name, 'quantity', oi.quantity, 'unit_price', oi.unit_price, 'total_price', oi.total_price)), '[]'::jsonb) as items,
  jsonb_build_object('tracking_number', s.tracking_number, 'courier_name', s.courier_name, 'status', s.status, 'estimated_delivery_date', s.estimated_delivery_date) as shipment,
  coalesce(jsonb_agg(jsonb_build_object('status', dt.status, 'description', dt.description, 'status_date', dt.status_date)), '[]'::jsonb) as delivery_timeline
from orders o
left join order_items oi on o.id = oi.order_id
left join shipments s on o.id = s.order_id
left join delivery_timeline dt on o.id = dt.order_id
where o.id = p_order_id
group by o.id, o.order_number, o.customer_name, o.customer_email, o.customer_mobile, o.total_amount, o.order_status, o.payment_status, o.created_at, s.tracking_number, s.courier_name, s.status, s.estimated_delivery_date;
$function$;

CREATE OR REPLACE FUNCTION public.get_order_public(p_order_number text, p_mobile text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order orders%rowtype;
  v_items jsonb;
begin
  if coalesce(trim(p_order_number), '') = '' or coalesce(trim(p_mobile), '') = '' then
    raise exception 'Order number and mobile number are both required' using errcode = 'P0001';
  end if;

  select * into v_order from orders
  where upper(order_number) = upper(trim(p_order_number))
    and customer_mobile = trim(p_mobile);

  if not found then
    raise exception 'No order found for that order number and mobile number' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_name', oi.product_name,
           'product_sku',  oi.product_sku,
           'hsn_code',     oi.hsn_code,
           'quantity',     oi.quantity,
           'unit_price',   oi.unit_price,
           'mrp',          oi.mrp,
           'gst_rate',     oi.gst_rate,
           'gst_amount',   oi.gst_amount,
           'total_price',  oi.total_price
         ) order by oi.created_at), '[]'::jsonb)
    into v_items
  from order_items oi where oi.order_id = v_order.id;

  return jsonb_build_object(
    'order_number',    v_order.order_number,
    'customer_name',   v_order.customer_name,
    'customer_mobile', v_order.customer_mobile,
    'customer_email',  v_order.customer_email,
    'address',         v_order.address,
    'city',            v_order.city,
    'state',           v_order.state,
    'pincode',         v_order.pincode,
    'subtotal',        v_order.subtotal,
    'mrp_total',       v_order.mrp_total,
    'discount_amount', v_order.discount_amount,
    'gst_amount',      v_order.gst_amount,
    'cgst_amount',     v_order.cgst_amount,
    'sgst_amount',     v_order.sgst_amount,
    'igst_amount',     v_order.igst_amount,
    'shipping_cost',   v_order.shipping_cost,
    'total_amount',    v_order.total_amount,
    'order_status',    v_order.order_status,
    'payment_status',  v_order.payment_status,
    'payment_method',  v_order.payment_method,
    'tracking_number', v_order.tracking_number,
    'courier_partner', v_order.courier_partner,
    'created_at',      v_order.created_at,
    'items',           v_items
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_product_quote_public(p_quote_number text, p_mobile text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q quotations%rowtype;
begin
  select * into q
  from quotations
  where quote_number = trim(p_quote_number)
    and quotation_type = 'customer'
    and status in ('sent', 'accepted')
    and pr_norm_mobile(customer_mobile) = public.pr_norm_mobile(p_mobile)
  limit 1;

  if q.id is null then
    raise exception 'No approved quotation found for this number and mobile' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'quote_number', q.quote_number, 'status', q.status, 'customer_name', q.customer_name,
    'created_at', q.created_at, 'valid_until', q.valid_until,
    'customer_mobile', q.customer_mobile, 'customer_email', q.customer_email, 'gstin', q.gstin,
    'address', q.address, 'city', q.city, 'state', q.state, 'pincode', q.pincode,
    'shipping_address', q.shipping_address, 'shipping_city', q.shipping_city,
    'shipping_state', q.shipping_state, 'shipping_pincode', q.shipping_pincode,
    'subtotal', q.subtotal, 'mrp_total', q.mrp_total, 'discount_amount', q.discount_amount,
    'taxable_amount', q.taxable_amount, 'gst_amount', q.gst_amount,
    'cgst_amount', q.cgst_amount, 'sgst_amount', q.sgst_amount, 'igst_amount', q.igst_amount,
    'shipping_cost', q.shipping_cost, 'total_amount', q.total_amount, 'terms', q.terms,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'product_name', qi.product_name, 'sku', qi.product_sku, 'quantity', qi.quantity,
        'unit_price', qi.unit_price, 'mrp', qi.mrp, 'gst_rate', qi.gst_rate,
        'total_price', qi.total_price) order by qi.sort_order), '[]'::jsonb)
      from quotation_items qi where qi.quotation_id = q.id
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_review_request(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_items jsonb;
begin
  select * into v_order from public.orders where review_token = p_token;
  if not found then
    raise exception 'This review link is not valid.' using errcode = 'P0001';
  end if;
  if v_order.order_status <> 'delivered' then
    raise exception 'You can write a review once your order has been delivered.' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', p.id,
           'name', p.name,
           'slug', p.slug,
           'image', (select pi.image_url from public.product_images pi
                      where pi.product_id = p.id order by pi.sort_order limit 1),
           'reviewed', exists (select 1 from public.product_reviews r
                                where r.product_id = p.id
                                  and (r.order_id = v_order.id
                                       or (v_order.user_id is not null and r.user_id = v_order.user_id)))
         ) order by p.name), '[]'::jsonb)
    into v_items
    from (select distinct product_id from public.order_items
           where order_id = v_order.id and product_id is not null) oi
    join public.products p on p.id = oi.product_id;

  return jsonb_build_object(
    'order_number', v_order.order_number,
    'name', split_part(trim(coalesce(v_order.customer_name, '')), ' ', 1),
    'items', v_items);
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- An admin is created through the dashboard, not the storefront; skip those.
  if exists (select 1 from public.admin_users a where a.user_id = new.id) then
    return new;
  end if;

  insert into public.customers (user_id, name, email, mobile)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(new.raw_user_meta_data->>'mobile'), '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
      and coalesce(is_active, true) = true
  );
$function$;

CREATE OR REPLACE FUNCTION public.issue_pi_tax_invoice(p_pi_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pi     proforma_invoices%rowtype;
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
  v_fy     text := public.pr_current_fy_short();
  v_next   integer;
  v_number text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can issue a tax invoice' using errcode = '42501';
  end if;

  select * into v_pi from proforma_invoices where id = p_pi_id for update;
  if not found then
    raise exception 'Proforma invoice not found' using errcode = 'P0001';
  end if;
  if v_pi.invoice_number is not null then
    return jsonb_build_object('invoice_number', v_pi.invoice_number,
                              'invoice_date', v_pi.invoice_date, 'new', false);
  end if;
  if v_pi.status = 'cancelled' then
    raise exception 'A cancelled PI cannot get a tax invoice' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(v_pi.items, '[]'::jsonb)) = 0 or coalesce(v_pi.total_amount, 0) <= 0 then
    raise exception 'The PI has no items or no amount' using errcode = 'P0001';
  end if;

  insert into invoice_counters (financial_year, last_number) values (v_fy, 1)
  on conflict (financial_year) do update set last_number = invoice_counters.last_number + 1
  returning last_number into v_next;

  v_number := 'PR/' || v_fy || '/' || lpad(v_next::text, 4, '0');

  update proforma_invoices set invoice_number = v_number, invoice_date = v_today where id = p_pi_id;

  return jsonb_build_object('invoice_number', v_number, 'invoice_date', v_today, 'new', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.issue_tax_invoice(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order  orders%rowtype;
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
  v_fy     text;
  v_next   integer;
  v_number text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can issue a tax invoice' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0001';
  end if;
  if v_order.invoice_number is not null then          -- already issued: same number again
    return jsonb_build_object('invoice_number', v_order.invoice_number,
                              'invoice_date', v_order.invoice_date, 'new', false);
  end if;
  if v_order.order_status = 'cancelled' then
    raise exception 'A cancelled order cannot get a tax invoice' using errcode = 'P0001';
  end if;

  -- Indian financial year: April to March
  v_fy := case when extract(month from v_today) >= 4
               then to_char(v_today, 'YY') || '-' || to_char(v_today + interval '1 year', 'YY')
               else to_char(v_today - interval '1 year', 'YY') || '-' || to_char(v_today, 'YY') end;

  insert into invoice_counters (financial_year, last_number) values (v_fy, 1)
  on conflict (financial_year) do update set last_number = invoice_counters.last_number + 1
  returning last_number into v_next;

  v_number := 'PR/' || v_fy || '/' || lpad(v_next::text, 4, '0');

  update orders set invoice_number = v_number, invoice_date = v_today where id = p_order_id;

  return jsonb_build_object('invoice_number', v_number, 'invoice_date', v_today, 'new', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.peek_next_tax_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fy   text := public.pr_current_fy_short();
  v_last integer;
begin
  if not public.is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  select last_number into v_last from invoice_counters where financial_year = v_fy;
  return 'PR/' || v_fy || '/' || lpad((coalesce(v_last, 0) + 1)::text, 4, '0');
end;
$function$;

CREATE OR REPLACE FUNCTION public.pr_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_changed jsonb := '{}'::jsonb;
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if k not in ('updated_at') and (v_new -> k) is distinct from (v_old -> k) then
        v_changed := v_changed || jsonb_build_object(k, jsonb_build_array(v_old -> k, v_new -> k));
      end if;
    end loop;
    if v_changed = '{}'::jsonb then
      return new;                       -- nothing that matters changed
    end if;
  else
    v_changed := coalesce(v_new, v_old);
  end if;

  insert into public.audit_log (table_name, row_id, action, actor, actor_role, changed)
  values (tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key'),
          tg_op, auth.uid(), coalesce(auth.role(), current_user), v_changed);
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pr_current_fy_short()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case when extract(month from (now() at time zone 'Asia/Kolkata')) >= 4
              then to_char((now() at time zone 'Asia/Kolkata'), 'YY') || '-' ||
                   to_char((now() at time zone 'Asia/Kolkata') + interval '1 year', 'YY')
              else to_char((now() at time zone 'Asia/Kolkata') - interval '1 year', 'YY') || '-' ||
                   to_char((now() at time zone 'Asia/Kolkata'), 'YY') end
$function$;

CREATE OR REPLACE FUNCTION public.pr_freeze_issued_pi()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    if old.invoice_number is not null then
      raise exception 'Tax invoice % cannot be deleted - mark it cancelled instead', old.invoice_number
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if old.invoice_number is not null then
    if new.invoice_number is distinct from old.invoice_number
       or new.invoice_date is distinct from old.invoice_date
       or new.pi_number is distinct from old.pi_number
       or new.pi_date is distinct from old.pi_date
       or new.party_type is distinct from old.party_type
       or new.customer_name is distinct from old.customer_name
       or new.business_name is distinct from old.business_name
       or new.gstin is distinct from old.gstin
       or new.mobile is distinct from old.mobile
       or new.email is distinct from old.email
       or new.address is distinct from old.address
       or new.city is distinct from old.city
       or new.state is distinct from old.state
       or new.pincode is distinct from old.pincode
       or new.ship_same is distinct from old.ship_same
       or new.shipping_address is distinct from old.shipping_address
       or new.shipping_city is distinct from old.shipping_city
       or new.shipping_state is distinct from old.shipping_state
       or new.shipping_pincode is distinct from old.shipping_pincode
       or new.items is distinct from old.items
       or new.discount_amount is distinct from old.discount_amount
       or new.shipping_cost is distinct from old.shipping_cost
       or new.total_amount is distinct from old.total_amount then
      raise exception 'Tax invoice % is issued and cannot be changed - mark it cancelled and make a new one',
        old.invoice_number using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pr_gst_state_code(p_state text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case lower(trim(coalesce(p_state, '')))
    when 'jammu and kashmir' then '01' when 'himachal pradesh' then '02'
    when 'punjab' then '03' when 'chandigarh' then '04' when 'uttarakhand' then '05'
    when 'haryana' then '06' when 'delhi' then '07' when 'rajasthan' then '08'
    when 'uttar pradesh' then '09' when 'bihar' then '10' when 'sikkim' then '11'
    when 'arunachal pradesh' then '12' when 'nagaland' then '13' when 'manipur' then '14'
    when 'mizoram' then '15' when 'tripura' then '16' when 'meghalaya' then '17'
    when 'assam' then '18' when 'west bengal' then '19' when 'jharkhand' then '20'
    when 'odisha' then '21' when 'chhattisgarh' then '22' when 'madhya pradesh' then '23'
    when 'gujarat' then '24' when 'dadra and nagar haveli and daman and diu' then '26'
    when 'maharashtra' then '27' when 'karnataka' then '29' when 'goa' then '30'
    when 'lakshadweep' then '31' when 'kerala' then '32' when 'tamil nadu' then '33'
    when 'puducherry' then '34' when 'andaman and nicobar islands' then '35'
    when 'telangana' then '36' when 'andhra pradesh' then '37' when 'ladakh' then '38'
  end;
$function$;

CREATE OR REPLACE FUNCTION public.pr_next_number(p_seq text, p_prefix text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return p_prefix || '-' || to_char(now(), 'YYYY') || '-'
         || lpad(nextval(p_seq::regclass)::text, 5, '0');
end;
$function$;

CREATE OR REPLACE FUNCTION public.pr_next_quote_number_internal()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fy  text;
  v_num integer;
begin
  v_fy := case when extract(month from now()) >= 4
    then to_char(now(), 'YYYY') || '-' || to_char(now() + interval '1 year', 'YY')
    else to_char(now() - interval '1 year', 'YYYY') || '-' || to_char(now(), 'YY')
  end;

  insert into public.pr_quote_number_counters (fy, last_number) values (v_fy, 1)
    on conflict (fy) do update set last_number = pr_quote_number_counters.last_number + 1
    returning last_number into v_num;

  return 'PRI/QTN/' || v_fy || '/' || lpad(v_num::text, 4, '0');
end;
$function$;

CREATE OR REPLACE FUNCTION public.pr_norm_mobile(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10)
$function$;

CREATE OR REPLACE FUNCTION public.pr_public_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_col    text := tg_argv[0];                 -- mobile column of this table
  v_mobile text;
  v_same   integer;
  v_all    integer;
begin
  if public.is_admin() then
    return new;
  end if;
  v_mobile := public.pr_norm_mobile(to_jsonb(new) ->> v_col);

  execute format('select count(*) from public.%I where created_at > now() - interval ''10 minutes''', tg_table_name)
     into v_all;
  if v_all >= 50 then
    raise exception 'Too many requests right now. Please try again in a few minutes or WhatsApp us.'
      using errcode = 'P0001';
  end if;

  if coalesce(v_mobile, '') <> '' then
    execute format('select count(*) from public.%I where created_at > now() - interval ''10 minutes''
                      and public.pr_norm_mobile(%I) = $1', tg_table_name, v_col)
       into v_same using v_mobile;
    if v_same >= 3 then
      raise exception 'We already have your request. Please wait a few minutes before sending it again.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pr_quotation_expiry_job()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today     date := (now() at time zone 'Asia/Kolkata')::date;
  v_reminders integer;
  v_followups integer;
  v_expired   integer;
begin
  -- 1. last valid day: call before the quote lapses (migration 27)
  with due as (
    update public.quotations
       set expiry_reminder_at = now()
     where status = 'sent' and valid_until is not null
       and valid_until <= v_today and expiry_reminder_at is null
    returning quote_number, customer_id, customer_name, total_amount, valid_until
  )
  insert into public.follow_ups (customer_id, title, notes, due_at)
  select customer_id,
         'Quote ' || quote_number ||
           case when valid_until < v_today then ' expire ho gaya' else ' aaj expire ho raha hai' end,
         coalesce(customer_name, 'Customer') || ' se baat karein (total Rs. ' ||
           to_char(coalesce(total_amount, 0), 'FM99,99,99,990') ||
           '). Zarurat ho to validity badha kar dobara bhejein.',
         (v_today + time '10:00') at time zone 'Asia/Kolkata'
    from due;
  get diagnostics v_reminders = row_count;

  -- 2. sent two days ago and still no order: follow up
  with due as (
    update public.quotations q
       set followup_reminder_at = now()
     where q.status = 'sent'
       and q.followup_reminder_at is null
       and q.sent_at is not null
       and (q.sent_at at time zone 'Asia/Kolkata')::date <= v_today - 2
       and (q.valid_until is null or q.valid_until > v_today)
       and q.converted_order_id is null
       and q.customer_id is not null
       and not exists (
         select 1 from public.orders o
          where o.created_at >= q.sent_at
            and o.order_status <> 'cancelled'
            and (o.customer_id = q.customer_id
                 or (q.customer_mobile is not null
                     and public.pr_norm_mobile(o.customer_mobile) = public.pr_norm_mobile(q.customer_mobile))))
    returning q.quote_number, q.customer_id, q.customer_name, q.customer_mobile, q.total_amount, q.valid_until
  )
  insert into public.follow_ups (customer_id, title, notes, due_at)
  select customer_id,
         'Follow up on quote ' || quote_number,
         coalesce(customer_name, 'Customer') ||
           coalesce(' (' || customer_mobile || ')', '') ||
           ' has not ordered since the quote was sent 2 days ago. Total Rs. ' ||
           to_char(coalesce(total_amount, 0), 'FM99,99,99,990') ||
           coalesce(', valid until ' || to_char(valid_until, 'DD Mon YYYY'), '') ||
           '. Call or WhatsApp to answer questions and close the order.',
         (v_today + time '10:00') at time zone 'Asia/Kolkata'
    from due;
  get diagnostics v_followups = row_count;

  -- 3. past valid_until: mark expired (migration 27)
  with gone as (
    update public.quotations
       set status = 'expired'
     where status = 'sent' and valid_until is not null and valid_until < v_today
    returning id
  )
  insert into public.quotation_audit_log (quotation_id, admin_name_snapshot, action, old_value, new_value)
  select id, 'System (auto-expiry)', 'status_changed', 'sent', 'expired' from gone;
  get diagnostics v_expired = row_count;

  return jsonb_build_object('reminders', v_reminders, 'followups', v_followups, 'expired', v_expired);
end;
$function$;

CREATE OR REPLACE FUNCTION public.pr_record_razorpay_payment(p_event_id text, p_event_type text, p_rzp_order_id text, p_rzp_payment_id text, p_amount_paise bigint, p_currency text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event  bigint;
  v_order  orders%rowtype;
  v_result text;
  v_short  text;
begin
  insert into payment_events (event_id, event_type, razorpay_order_id, razorpay_payment_id, amount_paise, currency)
  values (p_event_id, p_event_type, p_rzp_order_id, p_rzp_payment_id, p_amount_paise, p_currency)
  on conflict (event_id) do nothing
  returning id into v_event;
  if v_event is null then
    return 'duplicate';                                   -- Razorpay retried the same event
  end if;

  select * into v_order from orders where razorpay_order_id = p_rzp_order_id for update;
  if not found then
    v_result := 'unknown_order';
  elsif p_event_type not in ('payment.captured', 'order.paid') then
    v_result := 'logged';                                 -- e.g. payment.failed: nothing to change
  elsif upper(coalesce(p_currency, '')) <> 'INR' or p_amount_paise <> round(v_order.total_amount * 100) then
    v_result := 'amount_mismatch';                        -- never mark paid; owner checks Razorpay
  elsif v_order.payment_status = 'paid' then
    v_result := 'already_paid';
  elsif v_order.order_status = 'cancelled' then
    -- paid after the order was cancelled: take the stock back if it is still there
    select p.name into v_short
      from order_items oi join products p on p.id = oi.product_id
     where oi.order_id = v_order.id and p.availability = 'in_stock' and coalesce(p.stock, 0) < oi.quantity
     limit 1;
    if v_short is null then
      perform 1 from products where id in (select product_id from order_items where order_id = v_order.id)
       order by id for update;
      perform set_config('powerrun.stock_reason', 'paid after cancel ' || v_order.order_number, true);
      update products p set stock = greatest(coalesce(p.stock, 0) - oi.quantity, 0)
        from order_items oi where oi.order_id = v_order.id and p.id = oi.product_id and p.availability = 'in_stock';
      update products set availability = 'out_of_stock'
       where id in (select product_id from order_items where order_id = v_order.id)
         and availability = 'in_stock' and coalesce(stock, 0) = 0;
      update orders set payment_status = 'paid', order_status = 'confirmed', razorpay_payment_id = p_rzp_payment_id,
             payment_verified_at = now(), cancelled_reason = null,
             notes = trim(coalesce(notes, '') || ' [Paid after cancellation; stock re-reserved]')
       where id = v_order.id;
      v_result := 'paid_after_cancel_restored';
    else
      update orders set payment_status = 'paid', razorpay_payment_id = p_rzp_payment_id, payment_verified_at = now(),
             cancelled_reason = trim(coalesce(cancelled_reason, '') || ' | PAID AFTER CANCEL - no stock for "' || v_short || '": refund or arrange stock')
       where id = v_order.id;
      v_result := 'paid_after_cancel_needs_action';
    end if;
  else
    update orders set payment_status = 'paid',
           order_status = case when order_status in ('pending', 'new') then 'confirmed' else order_status end,
           razorpay_payment_id = p_rzp_payment_id, payment_verified_at = now()
     where id = v_order.id;
    v_result := 'paid';
  end if;

  update payment_events set result = v_result, order_id = v_order.id where id = v_event;
  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pr_stock_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old integer := case when tg_op = 'UPDATE' then coalesce(old.stock, 0) else 0 end;
  v_new integer := coalesce(new.stock, 0);
begin
  if v_new = v_old then
    return new;
  end if;
  insert into stock_ledger (product_id, change, balance, reason, actor, actor_role)
  values (new.id, v_new - v_old, v_new,
          coalesce(nullif(current_setting('powerrun.stock_reason', true), ''),
                   case when tg_op = 'INSERT' then 'new product'
                        when public.is_admin() then 'admin edit' else 'system' end),
          auth.uid(), coalesce(auth.role(), current_user));
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pr_valid_gstin(p_gstin text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  chars  constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  g      text := upper(coalesce(p_gstin, ''));
  total  integer := 0;
  v      integer;
  i      integer;
begin
  if g !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' then
    return false;
  end if;
  for i in 1..14 loop
    v := (strpos(chars, substr(g, i, 1)) - 1) * (case when i % 2 = 0 then 2 else 1 end);
    total := total + (v / 36) + (v % 36);
  end loop;
  return substr(chars, ((36 - (total % 36)) % 36) + 1, 1) = substr(g, 15, 1);
end;
$function$;

CREATE OR REPLACE FUNCTION public.pr_valid_mobile(p text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select p ~ '^[6-9][0-9]{9}$';
$function$;

CREATE OR REPLACE FUNCTION public.pr_warranty_months(p_text text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (nullif(substring(p_text from '(\d+)\s*[Yy]ear'), '')::int) * 12,
    (nullif(substring(p_text from '(\d+)\s*[Mm]onth'), '')::int),
    12
  );
$function$;

CREATE OR REPLACE FUNCTION public.preview_coupon(p_code text, p_subtotal numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_coupon   coupons%rowtype;
  v_discount numeric := 0;
begin
  if coalesce(trim(p_code), '') = '' then
    return jsonb_build_object('valid', false, 'message', 'Enter a coupon code');
  end if;

  select * into v_coupon from coupons where upper(code) = upper(trim(p_code));

  if not found or not v_coupon.is_active then
    return jsonb_build_object('valid', false, 'message', 'This coupon code is not valid');
  end if;
  if v_coupon.valid_from is not null and now() < v_coupon.valid_from then
    return jsonb_build_object('valid', false, 'message', 'This coupon is not active yet');
  end if;
  if v_coupon.valid_until is not null and now() > v_coupon.valid_until then
    return jsonb_build_object('valid', false, 'message', 'This coupon has expired');
  end if;
  if v_coupon.usage_limit is not null and v_coupon.usage_count >= v_coupon.usage_limit then
    return jsonb_build_object('valid', false, 'message', 'This coupon has reached its usage limit');
  end if;
  if coalesce(p_subtotal, 0) < coalesce(v_coupon.min_order_amount, 0) then
    return jsonb_build_object('valid', false, 'message',
      'This coupon needs a minimum order of Rs ' || v_coupon.min_order_amount);
  end if;

  v_discount := case when v_coupon.discount_type = 'percent'
    then coalesce(p_subtotal, 0) * v_coupon.discount_value / 100
    else v_coupon.discount_value
  end;
  if v_coupon.max_discount_amount is not null then
    v_discount := least(v_discount, v_coupon.max_discount_amount);
  end if;
  v_discount := round(least(v_discount, coalesce(p_subtotal, 0)), 2);

  return jsonb_build_object(
    'valid', true, 'discount_amount', v_discount, 'discount_type', v_coupon.discount_type,
    'message', 'Coupon applied' || (case when v_coupon.description is not null then ': ' || v_coupon.description else '' end)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.product_reviews_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.quotations_reset_expiry_reminder()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.valid_until is distinct from old.valid_until then
    new.expiry_reminder_at := null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.quotations_track_sent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    new.sent_at := now();
    new.followup_reminder_at := null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restock_cancelled_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.order_status = 'cancelled' and coalesce(old.order_status, '') <> 'cancelled' then
    perform set_config('powerrun.stock_reason', 'cancelled ' || new.order_number, true);
    update products p
       set stock = coalesce(p.stock, 0) + oi.quantity,
           availability = case when p.availability = 'out_of_stock' then 'in_stock' else p.availability end
      from order_items oi
     where oi.order_id = new.id and p.id = oi.product_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.saved_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.seo_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_ticket_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.ticket_number is null then
    new.ticket_number := public.generate_ticket_number();
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_contact_lead(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id     uuid;
  v_mobile text := nullif(trim(p_data->>'mobile'), '');
  v_name   text := nullif(trim(p_data->>'name'), '');
  v_customer_id uuid;
begin
  if v_name is null then raise exception 'Name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;

  select id into v_customer_id from customers
   where public.pr_norm_mobile(mobile) = public.pr_norm_mobile(v_mobile) limit 1;

  insert into leads (product_id, name, mobile, email, city, message, source, status, customer_id)
  values (
    nullif(p_data->>'product_id', '')::uuid, v_name, v_mobile,
    nullif(trim(p_data->>'email'), ''),
    nullif(trim(p_data->>'city'), ''),
    nullif(trim(p_data->>'message'), ''),
    'website',
    'new',
    v_customer_id
  ) returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_dealer_enquiry(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id     uuid;
  v_number text;
  v_mobile text := nullif(trim(p_data->>'mobile'), '');
  v_name   text := nullif(trim(p_data->>'name'), '');
  v_customer_id uuid;
begin
  if v_name is null then raise exception 'Name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;

  select id into v_customer_id from customers
   where public.pr_norm_mobile(mobile) = public.pr_norm_mobile(v_mobile) limit 1;

  v_number := public.pr_next_number('public.pr_dealer_number_seq', 'PRD');

  insert into dealer_enquiries (
    enquiry_number, name, company_name, mobile, email,
    city, state, business_type, message, status, customer_id
  ) values (
    v_number, v_name, nullif(trim(p_data->>'company_name'), ''), v_mobile,
    nullif(trim(p_data->>'email'), ''),
    nullif(trim(p_data->>'city'), ''),
    nullif(trim(p_data->>'state'), ''),
    nullif(trim(p_data->>'business_type'), ''),
    nullif(trim(p_data->>'message'), ''),
    'new', v_customer_id
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'enquiry_number', v_number);
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_product_quote_request(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name        text := nullif(trim(p_data->>'name'), '');
  v_mobile      text := public.pr_norm_mobile(p_data->>'mobile');
  v_email       text := nullif(trim(p_data->>'email'), '');
  v_gstin       text := upper(nullif(trim(p_data->>'gstin'), ''));
  v_address     text := nullif(trim(p_data->>'address'), '');
  v_city        text := nullif(trim(p_data->>'city'), '');
  v_state       text := nullif(trim(p_data->>'state'), '');
  v_pincode     text := nullif(regexp_replace(coalesce(p_data->>'pincode', ''), '\D', '', 'g'), '');
  v_same        boolean := coalesce((p_data->>'shipping_same')::boolean, true);
  v_s_address   text;
  v_s_city      text;
  v_s_state     text;
  v_s_pincode   text;
  v_product_id  uuid;
  v_product     products%rowtype;
  v_existing    uuid;
  v_customer_id uuid;
  v_quote_id    uuid;
  v_company_st  text;
  v_intra       boolean;
  v_price       numeric;
  v_mrp         numeric;
  v_rate        numeric;
  v_incl        boolean;
  v_taxable     numeric;
  v_gst         numeric;
  v_cgst        numeric;
  v_total       numeric;
  v_terms       text;
begin
  begin
    v_product_id := (p_data->>'product_id')::uuid;
  exception when others then
    raise exception 'Product not found' using errcode = 'P0001';
  end;

  if v_name is null or length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'Please enter your name' using errcode = 'P0001';
  end if;
  if not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address' using errcode = 'P0001';
  end if;
  if v_gstin is not null and v_gstin !~ '^[0-9]{2}[A-Z0-9]{13}$' then
    raise exception 'GSTIN should be 15 characters' using errcode = 'P0001';
  end if;
  if v_address is null or v_city is null or v_state is null then
    raise exception 'Please enter the full billing address' using errcode = 'P0001';
  end if;
  if v_pincode is null or v_pincode !~ '^[1-9][0-9]{5}$' then
    raise exception 'Please enter a valid 6-digit billing pincode' using errcode = 'P0001';
  end if;

  if v_same then
    v_s_address := v_address; v_s_city := v_city; v_s_state := v_state; v_s_pincode := v_pincode;
  else
    v_s_address := nullif(trim(p_data->>'shipping_address'), '');
    v_s_city    := nullif(trim(p_data->>'shipping_city'), '');
    v_s_state   := nullif(trim(p_data->>'shipping_state'), '');
    v_s_pincode := nullif(regexp_replace(coalesce(p_data->>'shipping_pincode', ''), '\D', '', 'g'), '');
    if v_s_address is null or v_s_city is null or v_s_state is null then
      raise exception 'Please enter the full shipping address' using errcode = 'P0001';
    end if;
    if v_s_pincode is null or v_s_pincode !~ '^[1-9][0-9]{5}$' then
      raise exception 'Please enter a valid 6-digit shipping pincode' using errcode = 'P0001';
    end if;
  end if;

  select * into v_product from products where id = v_product_id and is_active;
  if v_product.id is null then
    raise exception 'Product not found' using errcode = 'P0001';
  end if;

  select q.id into v_existing
  from quotations q
  where pr_norm_mobile(q.customer_mobile) = v_mobile
    and q.quotation_type = 'customer'
    and q.status in ('draft', 'sent')
    and q.created_at > now() - interval '1 day'
    and exists (select 1 from quotation_items qi where qi.quotation_id = q.id and qi.product_id = v_product_id)
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok', true, 'existing', true, 'product_name', v_product.name);
  end if;

  select c.id into v_customer_id
  from customers c
  where pr_norm_mobile(c.mobile) = v_mobile
  order by c.created_at
  limit 1;

  if v_customer_id is null then
    insert into customers (name, mobile, email, gstin, address, city, state, pincode,
                           shipping_address, shipping_city, shipping_state, shipping_pincode, customer_type)
    values (v_name, v_mobile, v_email, v_gstin, v_address, v_city, v_state, v_pincode,
            v_s_address, v_s_city, v_s_state, v_s_pincode, 'retail')
    returning id into v_customer_id;
  else
    -- fill only blanks on an existing customer; never overwrite what the admin already has
    update customers set
      email            = coalesce(email, v_email),
      gstin            = coalesce(gstin, v_gstin),
      address          = coalesce(address, v_address),
      city             = coalesce(city, v_city),
      state            = coalesce(state, v_state),
      pincode          = coalesce(pincode, v_pincode),
      shipping_address = coalesce(shipping_address, v_s_address),
      shipping_city    = coalesce(shipping_city, v_s_city),
      shipping_state   = coalesce(shipping_state, v_s_state),
      shipping_pincode = coalesce(shipping_pincode, v_s_pincode)
    where id = v_customer_id;
  end if;

  insert into leads (product_id, customer_id, name, mobile, email, city, message, source, status)
  values (v_product.id, v_customer_id, v_name, v_mobile, v_email, v_city,
          'Quote requested from product page: ' || v_product.name || ' (draft quotation awaiting approval)',
          'website', 'new');

  select nullif(value->>'state', '') into v_company_st from site_settings where key = 'company';
  v_intra := v_company_st is null or lower(v_company_st) = lower(v_state);

  v_price := coalesce(v_product.price, 0);
  v_mrp   := greatest(coalesce(v_product.mrp, v_price), v_price);
  v_rate  := coalesce(v_product.gst_rate, 0);
  v_incl  := coalesce(v_product.price_includes_gst, true);

  if v_rate = 0 then
    v_taxable := v_price; v_gst := 0;
  elsif v_incl then
    v_taxable := round(v_price / (1 + v_rate / 100), 2); v_gst := v_price - v_taxable;
  else
    v_taxable := v_price; v_gst := round(v_price * v_rate / 100, 2);
  end if;
  v_total := case when v_incl then v_price else v_price + v_gst end;
  v_cgst  := case when v_intra then round(v_gst / 2, 2) else 0 end;

  select nullif(value->>'terms', '') into v_terms
  from site_settings where key = 'quotation_defaults';

  insert into quotations (
    quote_number, quotation_type, customer_id, customer_name, customer_mobile, customer_email, gstin,
    address, city, state, pincode, shipping_address, shipping_city, shipping_state, shipping_pincode,
    place_of_supply, status, valid_days, valid_until, terms,
    subtotal, mrp_total, discount_amount, taxable_amount, gst_amount,
    cgst_amount, sgst_amount, igst_amount, shipping_cost, total_amount,
    customer_type, created_by_name
  ) values (
    public.pr_next_quote_number_internal(), 'customer', v_customer_id, v_name, v_mobile, v_email, v_gstin,
    v_address, v_city, v_state, v_pincode, v_s_address, v_s_city, v_s_state, v_s_pincode,
    v_state, 'draft', 7, current_date + 7, v_terms,
    v_price, v_mrp, v_mrp - v_price, v_taxable, v_gst,
    v_cgst, case when v_intra then v_gst - v_cgst else 0 end, case when v_intra then 0 else v_gst end, 0, v_total,
    'retail', 'Website enquiry'
  ) returning id into v_quote_id;

  insert into quotation_items (
    quotation_id, product_id, product_name, product_sku, hsn_code, quantity,
    unit_price, mrp, gst_rate, price_includes_gst, taxable_amount, gst_amount,
    total_price, discount_percent, discount_amount, sort_order
  ) values (
    v_quote_id, v_product.id, v_product.name, v_product.sku, v_product.hsn_code, 1,
    v_price, v_mrp, v_rate, v_incl, v_taxable, v_gst,
    v_price, 0, 0, 0
  );

  return jsonb_build_object('ok', true, 'existing', false, 'product_name', v_product.name);
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_review_by_token(p_token uuid, p_product_id uuid, p_rating integer, p_title text, p_body text, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_body  text := trim(coalesce(p_body, ''));
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_name  text := nullif(trim(coalesce(p_name, '')), '');
begin
  select * into v_order from public.orders where review_token = p_token;
  if not found then
    raise exception 'This review link is not valid.' using errcode = 'P0001';
  end if;
  if v_order.order_status <> 'delivered' then
    raise exception 'You can write a review once your order has been delivered.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.order_items
                  where order_id = v_order.id and product_id = p_product_id) then
    raise exception 'This product is not part of your order.' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Please choose a rating from 1 to 5 stars.' using errcode = 'P0001';
  end if;
  if length(v_body) < 10 then
    raise exception 'Please write at least a few words about the product.' using errcode = 'P0001';
  end if;
  if length(v_body) > 2000 or length(coalesce(v_title, '')) > 120 or length(coalesce(v_name, '')) > 60 then
    raise exception 'Your review is too long.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.product_reviews r
              where r.product_id = p_product_id
                and (r.order_id = v_order.id
                     or (v_order.user_id is not null and r.user_id = v_order.user_id))) then
    raise exception 'You have already reviewed this product. Thank you!' using errcode = 'P0001';
  end if;

  insert into public.product_reviews (product_id, user_id, order_id, customer_name, rating, title, body, status)
  values (p_product_id, v_order.user_id, v_order.id,
          coalesce(v_name, split_part(trim(coalesce(v_order.customer_name, '')), ' ', 1), 'Verified Buyer'),
          p_rating, v_title, v_body, 'pending');

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    raise exception 'You have already reviewed this product. Thank you!' using errcode = 'P0001';
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_service_request(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id     uuid;
  v_number text;
  v_mobile text := nullif(trim(p_data->>'mobile'), '');
  v_name   text := nullif(trim(p_data->>'name'), '');
  v_issue  text := nullif(trim(p_data->>'issue_description'), '');
  v_customer_id uuid;
begin
  if v_name is null then raise exception 'Name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;
  if v_issue is null then raise exception 'Please describe the issue' using errcode = 'P0001'; end if;

  select id into v_customer_id from customers
   where public.pr_norm_mobile(mobile) = public.pr_norm_mobile(v_mobile) limit 1;

  v_number := public.pr_next_number('public.pr_ticket_number_seq', 'PRS');

  insert into service_tickets (
    ticket_number, name, mobile, email, product_id, product_name,
    serial_number, issue_type, issue_description, purchase_date,
    attachment_url, address, city, state, pincode, status, priority, customer_id
  ) values (
    v_number, v_name, v_mobile, nullif(trim(p_data->>'email'), ''),
    nullif(p_data->>'product_id', '')::uuid, nullif(trim(p_data->>'product_name'), ''),
    nullif(trim(p_data->>'serial_number'), ''),
    nullif(trim(p_data->>'issue_type'), ''),
    v_issue,
    nullif(p_data->>'purchase_date', '')::date,
    nullif(trim(p_data->>'attachment_url'), ''),
    nullif(trim(p_data->>'address'), ''),
    nullif(trim(p_data->>'city'), ''),
    nullif(trim(p_data->>'state'), ''),
    nullif(trim(p_data->>'pincode'), ''),
    'open', 'normal', v_customer_id
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'ticket_number', v_number);
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_warranty_registration(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id         uuid;
  v_number     text;
  v_mobile     text := nullif(trim(p_data->>'mobile'), '');
  v_name       text := nullif(trim(p_data->>'name'), '');
  v_serial     text := nullif(trim(p_data->>'serial_number'), '');
  v_product_id uuid := nullif(p_data->>'product_id', '')::uuid;
  v_purchase   date := nullif(p_data->>'purchase_date', '')::date;
  v_start      date;
  v_months     integer;
  v_customer_id uuid;
begin
  if v_name is null then raise exception 'Name is required' using errcode = 'P0001'; end if;
  if v_mobile is null or not public.pr_valid_mobile(v_mobile) then
    raise exception 'A valid 10-digit mobile number is required' using errcode = 'P0001';
  end if;
  if v_serial is null then raise exception 'Product serial number is required' using errcode = 'P0001'; end if;
  if v_purchase is not null and v_purchase > current_date then
    raise exception 'The purchase date cannot be in the future' using errcode = 'P0001';
  end if;

  v_start := coalesce(v_purchase, current_date);

  select public.pr_warranty_months(p.warranty) into v_months
  from products p where p.id = v_product_id;
  v_months := coalesce(v_months, 12);

  select id into v_customer_id from customers
   where public.pr_norm_mobile(mobile) = public.pr_norm_mobile(v_mobile) limit 1;

  v_number := public.pr_next_number('public.pr_warranty_number_seq', 'PRW');

  insert into warranties (
    warranty_number, name, mobile, email, product_id, product_name,
    serial_number, purchase_date, invoice_number, dealer_name,
    address, city, state, pincode, status,
    warranty_start_date, warranty_end_date, customer_id
  ) values (
    v_number, v_name, v_mobile, nullif(trim(p_data->>'email'), ''),
    v_product_id, nullif(trim(p_data->>'product_name'), ''),
    v_serial, v_purchase,
    nullif(trim(p_data->>'invoice_number'), ''),
    nullif(trim(p_data->>'dealer_name'), ''),
    nullif(trim(p_data->>'address'), ''),
    nullif(trim(p_data->>'city'), ''),
    nullif(trim(p_data->>'state'), ''),
    nullif(trim(p_data->>'pincode'), ''),
    'pending',
    v_start,
    v_start + (v_months || ' months')::interval,
    v_customer_id
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'warranty_number', v_number, 'valid_until', v_start + (v_months || ' months')::interval);
end;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_my_customer(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_id      uuid;
  v_name    text := nullif(trim(p_data->>'name'), '');
  v_mobile  text := nullif(trim(p_data->>'mobile'), '');
begin
  if v_user_id is null then
    raise exception 'Please sign in first' using errcode = 'P0001';
  end if;
  if v_name is null then
    raise exception 'Name is required' using errcode = 'P0001';
  end if;
  if v_mobile is not null and not public.pr_valid_mobile(v_mobile) then
    raise exception 'Enter a valid 10-digit Indian mobile number' using errcode = 'P0001';
  end if;

  select id into v_id from customers where user_id = v_user_id;

  if v_id is null then
    insert into customers (user_id, name, email, mobile, address, city, state, pincode)
    values (v_user_id, v_name,
            nullif(trim(p_data->>'email'), ''), v_mobile,
            nullif(trim(p_data->>'address'), ''),
            nullif(trim(p_data->>'city'), ''),
            nullif(trim(p_data->>'state'), ''),
            nullif(trim(p_data->>'pincode'), ''))
    returning id into v_id;
  else
    update customers
       set name    = v_name,
           email   = coalesce(nullif(trim(p_data->>'email'), ''), email),
           mobile  = coalesce(v_mobile, mobile),
           address = coalesce(nullif(trim(p_data->>'address'), ''), address),
           city    = coalesce(nullif(trim(p_data->>'city'), ''), city),
           state   = coalesce(nullif(trim(p_data->>'state'), ''), state),
           pincode = coalesce(nullif(trim(p_data->>'pincode'), ''), pincode)
     where id = v_id;
  end if;

  return jsonb_build_object('id', v_id);
end;
$function$;

alter table public."admin_users" enable row level security;
alter table public."audit_log" enable row level security;
alter table public."bom_calculations" enable row level security;
alter table public."calc_audit_log" enable row level security;
alter table public."calc_gst_rates" enable row level security;
alter table public."calc_history" enable row level security;
alter table public."calc_selling_channels" enable row level security;
alter table public."calc_target_margins" enable row level security;
alter table public."categories" enable row level security;
alter table public."contact_messages" enable row level security;
alter table public."coupon_redemptions" enable row level security;
alter table public."coupons" enable row level security;
alter table public."customer_addresses" enable row level security;
alter table public."customers" enable row level security;
alter table public."dealer_enquiries" enable row level security;
alter table public."delivery_timeline" enable row level security;
alter table public."follow_ups" enable row level security;
alter table public."global_seo" enable row level security;
alter table public."invoice_counters" enable row level security;
alter table public."invoices" enable row level security;
alter table public."leads" enable row level security;
alter table public."notifications" enable row level security;
alter table public."order_items" enable row level security;
alter table public."orders" enable row level security;
alter table public."page_seo" enable row level security;
alter table public."payment_events" enable row level security;
alter table public."pr_pi_number_counters" enable row level security;
alter table public."pr_quote_number_counters" enable row level security;
alter table public."product_costs" enable row level security;
alter table public."product_images" enable row level security;
alter table public."product_reviews" enable row level security;
alter table public."products" enable row level security;
alter table public."proforma_invoices" enable row level security;
alter table public."quotation_audit_log" enable row level security;
alter table public."quotation_items" enable row level security;
alter table public."quotations" enable row level security;
alter table public."service_tickets" enable row level security;
alter table public."shipments" enable row level security;
alter table public."site_settings" enable row level security;
alter table public."stock_ledger" enable row level security;
alter table public."warranties" enable row level security;
create policy "admin_users_admin_write" on public."admin_users" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "admin_users_self_read" on public."admin_users" as permissive for select to "authenticated" using (((user_id = auth.uid()) OR is_admin()));
create policy "audit_log_admin_read" on public."audit_log" as permissive for select to "authenticated" using (is_admin());
create policy "bom_calculations_admin_all" on public."bom_calculations" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "calc_audit_log_admin_all" on public."calc_audit_log" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "calc_gst_rates_admin_all" on public."calc_gst_rates" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "calc_history_admin_all" on public."calc_history" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "calc_selling_channels_admin_all" on public."calc_selling_channels" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "calc_target_margins_admin_all" on public."calc_target_margins" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "categories_admin_write" on public."categories" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "categories_public_read" on public."categories" as permissive for select to "anon", "authenticated" using (((is_active IS TRUE) OR is_admin()));
create policy "contact_messages_admin_all" on public."contact_messages" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "coupon_redemptions_admin_all" on public."coupon_redemptions" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "coupons_admin_all" on public."coupons" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "customer_addresses_own" on public."customer_addresses" as permissive for all to "authenticated" using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "customers_admin_write" on public."customers" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "customers_owner_read" on public."customers" as permissive for select to "authenticated" using ((is_admin() OR ((user_id IS NOT NULL) AND (user_id = auth.uid()))));
create policy "dealer_enquiries_admin_read" on public."dealer_enquiries" as permissive for select to "authenticated" using (is_admin());
create policy "dealer_enquiries_admin_write" on public."dealer_enquiries" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "delivery_timeline_admin_all" on public."delivery_timeline" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "delivery_timeline_owner_read" on public."delivery_timeline" as permissive for select to "authenticated" using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = delivery_timeline.order_id) AND (o.user_id IS NOT NULL) AND (o.user_id = auth.uid())))));
create policy "follow_ups_admin_all" on public."follow_ups" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "global_seo_admin_write" on public."global_seo" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "global_seo_public_read" on public."global_seo" as permissive for select to "anon", "authenticated" using (true);
create policy "invoices_admin_all" on public."invoices" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "invoices_owner_read" on public."invoices" as permissive for select to "authenticated" using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = invoices.order_id) AND (o.user_id IS NOT NULL) AND (o.user_id = auth.uid())))));
create policy "leads_admin_read" on public."leads" as permissive for select to "authenticated" using (is_admin());
create policy "leads_admin_write" on public."leads" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "notifications_admin_all" on public."notifications" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "notifications_owner_read" on public."notifications" as permissive for select to "authenticated" using (((user_id IS NOT NULL) AND (user_id = auth.uid())));
create policy "order_items_admin_write" on public."order_items" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "order_items_owner_read" on public."order_items" as permissive for select to "authenticated" using ((is_admin() OR (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.user_id IS NOT NULL) AND (o.user_id = auth.uid()))))));
create policy "orders_admin_write" on public."orders" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "orders_owner_read" on public."orders" as permissive for select to "authenticated" using ((is_admin() OR ((user_id IS NOT NULL) AND (user_id = auth.uid()))));
create policy "page_seo_admin_write" on public."page_seo" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "page_seo_public_read" on public."page_seo" as permissive for select to "anon", "authenticated" using (true);
create policy "payment_events_admin_read" on public."payment_events" as permissive for select to "authenticated" using (is_admin());
create policy "pr_pi_number_counters_admin_all" on public."pr_pi_number_counters" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "pr_quote_number_counters_admin_all" on public."pr_quote_number_counters" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "product_costs_admin_all" on public."product_costs" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "product_images_admin_write" on public."product_images" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "product_images_public_read" on public."product_images" as permissive for select to "anon", "authenticated" using ((is_admin() OR (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_images.product_id) AND (p.is_active IS TRUE))))));
create policy "product_reviews_admin_all" on public."product_reviews" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "product_reviews_owner_insert" on public."product_reviews" as permissive for insert to "authenticated" with check (((user_id = auth.uid()) AND (status = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM (order_items oi
     JOIN orders o ON ((o.id = oi.order_id)))
  WHERE ((oi.product_id = product_reviews.product_id) AND (o.user_id = auth.uid()) AND (o.order_status = 'delivered'::text))))));
create policy "product_reviews_owner_read" on public."product_reviews" as permissive for select to "authenticated" using (((user_id = auth.uid()) OR is_admin()));
create policy "product_reviews_public_read" on public."product_reviews" as permissive for select to "anon", "authenticated" using ((status = 'approved'::text));
create policy "products_admin_write" on public."products" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "products_public_read" on public."products" as permissive for select to "anon", "authenticated" using (((is_active IS TRUE) OR is_admin()));
create policy "proforma_invoices_admin_all" on public."proforma_invoices" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "quotation_audit_log_admin_all" on public."quotation_audit_log" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "quotation_items_admin_all" on public."quotation_items" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "quotations_admin_all" on public."quotations" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "service_tickets_admin_read" on public."service_tickets" as permissive for select to "authenticated" using (is_admin());
create policy "service_tickets_admin_write" on public."service_tickets" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "shipments_admin_all" on public."shipments" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "shipments_owner_read" on public."shipments" as permissive for select to "authenticated" using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = shipments.order_id) AND (o.user_id IS NOT NULL) AND (o.user_id = auth.uid())))));
create policy "site_settings_admin_write" on public."site_settings" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());
create policy "site_settings_public_read" on public."site_settings" as permissive for select to "anon", "authenticated" using ((key = ANY (ARRAY['shipping'::text, 'payments'::text, 'company'::text])));
create policy "stock_ledger_admin_read" on public."stock_ledger" as permissive for select to "authenticated" using (is_admin());
create policy "warranties_admin_read" on public."warranties" as permissive for select to "authenticated" using (is_admin());
create policy "warranties_admin_write" on public."warranties" as permissive for all to "authenticated" using (is_admin()) with check (is_admin());

CREATE TRIGGER admin_users_audit AFTER INSERT OR DELETE OR UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION pr_audit();
CREATE TRIGGER bom_calculations_touch BEFORE UPDATE ON public.bom_calculations FOR EACH ROW EXECUTE FUNCTION bom_touch_updated_at();
CREATE TRIGGER calc_history_touch BEFORE UPDATE ON public.calc_history FOR EACH ROW EXECUTE FUNCTION calc_touch_updated_at();
CREATE TRIGGER calc_selling_channels_touch BEFORE UPDATE ON public.calc_selling_channels FOR EACH ROW EXECUTE FUNCTION calc_touch_updated_at();
CREATE TRIGGER coupons_audit AFTER INSERT OR DELETE OR UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION pr_audit();
CREATE TRIGGER coupons_touch BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION saved_touch_updated_at();
CREATE TRIGGER customer_addresses_touch BEFORE UPDATE ON public.customer_addresses FOR EACH ROW EXECUTE FUNCTION saved_touch_updated_at();
CREATE TRIGGER dealer_enquiries_rate_limit BEFORE INSERT ON public.dealer_enquiries FOR EACH ROW EXECUTE FUNCTION pr_public_rate_limit('mobile');
CREATE TRIGGER follow_ups_touch BEFORE UPDATE ON public.follow_ups FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER global_seo_touch BEFORE UPDATE ON public.global_seo FOR EACH ROW EXECUTE FUNCTION seo_touch_updated_at();
CREATE TRIGGER leads_rate_limit BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION pr_public_rate_limit('mobile');
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
CREATE TRIGGER orders_audit AFTER INSERT OR DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION pr_audit();
CREATE TRIGGER page_seo_touch BEFORE UPDATE ON public.page_seo FOR EACH ROW EXECUTE FUNCTION seo_touch_updated_at();
CREATE TRIGGER product_costs_audit AFTER INSERT OR DELETE OR UPDATE ON public.product_costs FOR EACH ROW EXECUTE FUNCTION pr_audit();
CREATE TRIGGER product_reviews_touch BEFORE UPDATE ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION product_reviews_touch_updated_at();
CREATE TRIGGER products_audit AFTER INSERT OR DELETE OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION pr_audit();
CREATE TRIGGER products_stock_ledger AFTER INSERT OR UPDATE OF stock ON public.products FOR EACH ROW EXECUTE FUNCTION pr_stock_ledger();
CREATE TRIGGER proforma_invoices_audit AFTER INSERT OR DELETE OR UPDATE ON public.proforma_invoices FOR EACH ROW EXECUTE FUNCTION pr_audit();
CREATE TRIGGER proforma_invoices_freeze BEFORE DELETE OR UPDATE ON public.proforma_invoices FOR EACH ROW EXECUTE FUNCTION pr_freeze_issued_pi();
CREATE TRIGGER proforma_invoices_updated_at BEFORE UPDATE ON public.proforma_invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER quotations_audit AFTER INSERT OR DELETE OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION pr_audit();
CREATE TRIGGER quotations_rate_limit BEFORE INSERT ON public.quotations FOR EACH ROW EXECUTE FUNCTION pr_public_rate_limit('customer_mobile');
CREATE TRIGGER quotations_reset_expiry_reminder BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION quotations_reset_expiry_reminder();
CREATE TRIGGER quotations_touch BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER quotations_track_sent BEFORE INSERT OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION quotations_track_sent();
CREATE TRIGGER restock_on_cancel AFTER UPDATE OF order_status ON public.orders FOR EACH ROW EXECUTE FUNCTION restock_cancelled_order();
CREATE TRIGGER service_tickets_rate_limit BEFORE INSERT ON public.service_tickets FOR EACH ROW EXECUTE FUNCTION pr_public_rate_limit('mobile');
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.admin_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.dealer_enquiries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.service_tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.warranties FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER site_settings_audit AFTER INSERT OR DELETE OR UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION pr_audit();
CREATE TRIGGER trigger_service_ticket_number BEFORE INSERT ON public.service_tickets FOR EACH ROW EXECUTE FUNCTION set_ticket_number();
CREATE TRIGGER warranties_rate_limit BEFORE INSERT ON public.warranties FOR EACH ROW EXECUTE FUNCTION pr_public_rate_limit('mobile');

-- grants: start from nothing, then grant exactly what production has
revoke all on public."admin_users" from anon, authenticated;
revoke all on public."audit_log" from anon, authenticated;
revoke all on public."bom_calculations" from anon, authenticated;
revoke all on public."calc_audit_log" from anon, authenticated;
revoke all on public."calc_gst_rates" from anon, authenticated;
revoke all on public."calc_history" from anon, authenticated;
revoke all on public."calc_selling_channels" from anon, authenticated;
revoke all on public."calc_target_margins" from anon, authenticated;
revoke all on public."categories" from anon, authenticated;
revoke all on public."contact_messages" from anon, authenticated;
revoke all on public."coupon_redemptions" from anon, authenticated;
revoke all on public."coupons" from anon, authenticated;
revoke all on public."customer_addresses" from anon, authenticated;
revoke all on public."customers" from anon, authenticated;
revoke all on public."dealer_enquiries" from anon, authenticated;
revoke all on public."delivery_timeline" from anon, authenticated;
revoke all on public."follow_ups" from anon, authenticated;
revoke all on public."global_seo" from anon, authenticated;
revoke all on public."invoice_counters" from anon, authenticated;
revoke all on public."invoices" from anon, authenticated;
revoke all on public."leads" from anon, authenticated;
revoke all on public."notifications" from anon, authenticated;
revoke all on public."order_items" from anon, authenticated;
revoke all on public."orders" from anon, authenticated;
revoke all on public."page_seo" from anon, authenticated;
revoke all on public."payment_events" from anon, authenticated;
revoke all on public."pr_pi_number_counters" from anon, authenticated;
revoke all on public."pr_quote_number_counters" from anon, authenticated;
revoke all on public."product_costs" from anon, authenticated;
revoke all on public."product_images" from anon, authenticated;
revoke all on public."product_reviews" from anon, authenticated;
revoke all on public."products" from anon, authenticated;
revoke all on public."proforma_invoices" from anon, authenticated;
revoke all on public."quotation_audit_log" from anon, authenticated;
revoke all on public."quotation_items" from anon, authenticated;
revoke all on public."quotations" from anon, authenticated;
revoke all on public."service_tickets" from anon, authenticated;
revoke all on public."shipments" from anon, authenticated;
revoke all on public."site_settings" from anon, authenticated;
revoke all on public."stock_ledger" from anon, authenticated;
revoke all on public."warranties" from anon, authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."admin_users" to authenticated;
grant select on public."audit_log" to authenticated;
grant delete, insert, select, update on public."bom_calculations" to authenticated;
grant delete, insert, select, update on public."calc_audit_log" to authenticated;
grant delete, insert, select, update on public."calc_gst_rates" to authenticated;
grant delete, insert, select, update on public."calc_history" to authenticated;
grant delete, insert, select, update on public."calc_selling_channels" to authenticated;
grant delete, insert, select, update on public."calc_target_margins" to authenticated;
grant select on public."categories" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."categories" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."contact_messages" to authenticated;
grant delete, insert, select, update on public."coupon_redemptions" to authenticated;
grant delete, insert, select, update on public."coupons" to authenticated;
grant delete, insert, select, update on public."customer_addresses" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."customers" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."dealer_enquiries" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."delivery_timeline" to authenticated;
grant delete, insert, select, update on public."follow_ups" to authenticated;
grant select on public."global_seo" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."global_seo" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."invoices" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."leads" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."notifications" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."order_items" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."orders" to authenticated;
grant select on public."page_seo" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."page_seo" to authenticated;
grant select on public."payment_events" to authenticated;
grant insert, select, update on public."pr_pi_number_counters" to authenticated;
grant insert, select, update on public."pr_quote_number_counters" to authenticated;
grant delete, insert, select, update on public."product_costs" to authenticated;
grant select on public."product_images" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."product_images" to authenticated;
grant select on public."product_reviews" to anon;
grant delete, insert, select, update on public."product_reviews" to authenticated;
grant select on public."products" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."products" to authenticated;
grant delete, insert, select, update on public."proforma_invoices" to authenticated;
grant insert, select on public."quotation_audit_log" to authenticated;
grant delete, insert, select, update on public."quotation_items" to authenticated;
grant delete, insert, select, update on public."quotations" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."service_tickets" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."shipments" to authenticated;
grant select on public."site_settings" to anon;
grant delete, insert, references, select, trigger, truncate, update on public."site_settings" to authenticated;
grant select on public."stock_ledger" to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public."warranties" to authenticated;
grant all on public."admin_users" to service_role;
grant all on public."audit_log" to service_role;
grant all on public."bom_calculations" to service_role;
grant all on public."calc_audit_log" to service_role;
grant all on public."calc_gst_rates" to service_role;
grant all on public."calc_history" to service_role;
grant all on public."calc_selling_channels" to service_role;
grant all on public."calc_target_margins" to service_role;
grant all on public."categories" to service_role;
grant all on public."contact_messages" to service_role;
grant all on public."coupon_redemptions" to service_role;
grant all on public."coupons" to service_role;
grant all on public."customer_addresses" to service_role;
grant all on public."customers" to service_role;
grant all on public."dealer_enquiries" to service_role;
grant all on public."delivery_timeline" to service_role;
grant all on public."follow_ups" to service_role;
grant all on public."global_seo" to service_role;
grant all on public."invoice_counters" to service_role;
grant all on public."invoices" to service_role;
grant all on public."leads" to service_role;
grant all on public."notifications" to service_role;
grant all on public."order_items" to service_role;
grant all on public."orders" to service_role;
grant all on public."page_seo" to service_role;
grant all on public."payment_events" to service_role;
grant all on public."pr_pi_number_counters" to service_role;
grant all on public."pr_quote_number_counters" to service_role;
grant all on public."product_costs" to service_role;
grant all on public."product_images" to service_role;
grant all on public."product_reviews" to service_role;
grant all on public."products" to service_role;
grant all on public."proforma_invoices" to service_role;
grant all on public."quotation_audit_log" to service_role;
grant all on public."quotation_items" to service_role;
grant all on public."quotations" to service_role;
grant all on public."service_tickets" to service_role;
grant all on public."shipments" to service_role;
grant all on public."site_settings" to service_role;
grant all on public."stock_ledger" to service_role;
grant all on public."warranties" to service_role;
grant usage, select on sequence public."pr_calc_number_seq" to authenticated, service_role;
grant usage, select on sequence public."pr_dealer_number_seq" to authenticated, service_role;
grant usage, select on sequence public."pr_order_number_seq" to authenticated, service_role;
grant usage, select on sequence public."pr_quote_number_seq" to authenticated, service_role;
grant usage, select on sequence public."pr_ticket_number_seq" to authenticated, service_role;
grant usage, select on sequence public."pr_warranty_number_seq" to authenticated, service_role;
revoke execute on function public."active_site_banner_coupon"() from public, anon, authenticated;
grant execute on function public."active_site_banner_coupon"() to anon, authenticated;
revoke execute on function public."admin_convert_quotation_to_order"(p_quotation_id uuid) from public, anon, authenticated;
grant execute on function public."admin_convert_quotation_to_order"(p_quotation_id uuid) to authenticated;
revoke execute on function public."admin_dashboard_stats"() from public, anon, authenticated;
grant execute on function public."admin_dashboard_stats"() to anon, authenticated;
revoke execute on function public."admin_next_pi_number"() from public, anon, authenticated;
grant execute on function public."admin_next_pi_number"() to authenticated;
revoke execute on function public."admin_next_quote_number"() from public, anon, authenticated;
grant execute on function public."admin_next_quote_number"() to authenticated;
revoke execute on function public."bom_touch_updated_at"() from public, anon, authenticated;
grant execute on function public."bom_touch_updated_at"() to anon, authenticated;
revoke execute on function public."calc_next_number"() from public, anon, authenticated;
grant execute on function public."calc_next_number"() to authenticated;
revoke execute on function public."calc_touch_updated_at"() from public, anon, authenticated;
grant execute on function public."calc_touch_updated_at"() to anon, authenticated;
revoke execute on function public."claim_order"(p_order_number text, p_mobile text) from public, anon, authenticated;
grant execute on function public."claim_order"(p_order_number text, p_mobile text) to authenticated;
revoke execute on function public."convert_lead_to_customer"(p_lead_id uuid) from public, anon, authenticated;
grant execute on function public."convert_lead_to_customer"(p_lead_id uuid) to authenticated;
revoke execute on function public."create_website_order"(p_customer jsonb, p_items jsonb, p_payment_method text, p_coupon_code text) from public, anon, authenticated;
grant execute on function public."create_website_order"(p_customer jsonb, p_items jsonb, p_payment_method text, p_coupon_code text) to anon, authenticated;
revoke execute on function public."crm_dashboard_stats"() from public, anon, authenticated;
grant execute on function public."crm_dashboard_stats"() to anon, authenticated;
revoke execute on function public."generate_ticket_number"() from public, anon, authenticated;
revoke execute on function public."get_order_details"(p_order_id uuid) from public, anon, authenticated;
grant execute on function public."get_order_details"(p_order_id uuid) to authenticated;
revoke execute on function public."get_order_public"(p_order_number text, p_mobile text) from public, anon, authenticated;
grant execute on function public."get_order_public"(p_order_number text, p_mobile text) to anon, authenticated;
revoke execute on function public."get_product_quote_public"(p_quote_number text, p_mobile text) from public, anon, authenticated;
grant execute on function public."get_product_quote_public"(p_quote_number text, p_mobile text) to anon, authenticated;
revoke execute on function public."get_review_request"(p_token uuid) from public, anon, authenticated;
grant execute on function public."get_review_request"(p_token uuid) to anon, authenticated;
revoke execute on function public."handle_new_auth_user"() from public, anon, authenticated;
revoke execute on function public."is_admin"() from public, anon, authenticated;
grant execute on function public."is_admin"() to anon, authenticated;
revoke execute on function public."issue_pi_tax_invoice"(p_pi_id uuid) from public, anon, authenticated;
grant execute on function public."issue_pi_tax_invoice"(p_pi_id uuid) to authenticated;
revoke execute on function public."issue_tax_invoice"(p_order_id uuid) from public, anon, authenticated;
grant execute on function public."issue_tax_invoice"(p_order_id uuid) to authenticated;
revoke execute on function public."peek_next_tax_invoice_number"() from public, anon, authenticated;
grant execute on function public."peek_next_tax_invoice_number"() to authenticated;
revoke execute on function public."pr_audit"() from public, anon, authenticated;
revoke execute on function public."pr_current_fy_short"() from public, anon, authenticated;
grant execute on function public."pr_current_fy_short"() to anon, authenticated;
revoke execute on function public."pr_freeze_issued_pi"() from public, anon, authenticated;
grant execute on function public."pr_freeze_issued_pi"() to anon, authenticated;
revoke execute on function public."pr_gst_state_code"(p_state text) from public, anon, authenticated;
grant execute on function public."pr_gst_state_code"(p_state text) to anon, authenticated;
revoke execute on function public."pr_next_number"(p_seq text, p_prefix text) from public, anon, authenticated;
revoke execute on function public."pr_next_quote_number_internal"() from public, anon, authenticated;
revoke execute on function public."pr_norm_mobile"(p text) from public, anon, authenticated;
grant execute on function public."pr_norm_mobile"(p text) to anon, authenticated;
revoke execute on function public."pr_public_rate_limit"() from public, anon, authenticated;
revoke execute on function public."pr_quotation_expiry_job"() from public, anon, authenticated;
revoke execute on function public."pr_record_razorpay_payment"(p_event_id text, p_event_type text, p_rzp_order_id text, p_rzp_payment_id text, p_amount_paise bigint, p_currency text) from public, anon, authenticated;
revoke execute on function public."pr_stock_ledger"() from public, anon, authenticated;
revoke execute on function public."pr_valid_gstin"(p_gstin text) from public, anon, authenticated;
grant execute on function public."pr_valid_gstin"(p_gstin text) to anon, authenticated;
revoke execute on function public."pr_valid_mobile"(p text) from public, anon, authenticated;
revoke execute on function public."pr_warranty_months"(p_text text) from public, anon, authenticated;
revoke execute on function public."preview_coupon"(p_code text, p_subtotal numeric) from public, anon, authenticated;
grant execute on function public."preview_coupon"(p_code text, p_subtotal numeric) to anon, authenticated;
revoke execute on function public."product_reviews_touch_updated_at"() from public, anon, authenticated;
grant execute on function public."product_reviews_touch_updated_at"() to anon, authenticated;
revoke execute on function public."quotations_reset_expiry_reminder"() from public, anon, authenticated;
grant execute on function public."quotations_reset_expiry_reminder"() to anon, authenticated;
revoke execute on function public."quotations_track_sent"() from public, anon, authenticated;
grant execute on function public."quotations_track_sent"() to anon, authenticated;
revoke execute on function public."restock_cancelled_order"() from public, anon, authenticated;
revoke execute on function public."saved_touch_updated_at"() from public, anon, authenticated;
grant execute on function public."saved_touch_updated_at"() to anon, authenticated;
revoke execute on function public."seo_touch_updated_at"() from public, anon, authenticated;
grant execute on function public."seo_touch_updated_at"() to anon, authenticated;
revoke execute on function public."set_ticket_number"() from public, anon, authenticated;
revoke execute on function public."set_updated_at"() from public, anon, authenticated;
revoke execute on function public."submit_contact_lead"(p_data jsonb) from public, anon, authenticated;
grant execute on function public."submit_contact_lead"(p_data jsonb) to anon, authenticated;
revoke execute on function public."submit_dealer_enquiry"(p_data jsonb) from public, anon, authenticated;
grant execute on function public."submit_dealer_enquiry"(p_data jsonb) to anon, authenticated;
revoke execute on function public."submit_product_quote_request"(p_data jsonb) from public, anon, authenticated;
grant execute on function public."submit_product_quote_request"(p_data jsonb) to anon, authenticated;
revoke execute on function public."submit_review_by_token"(p_token uuid, p_product_id uuid, p_rating integer, p_title text, p_body text, p_name text) from public, anon, authenticated;
grant execute on function public."submit_review_by_token"(p_token uuid, p_product_id uuid, p_rating integer, p_title text, p_body text, p_name text) to anon, authenticated;
revoke execute on function public."submit_service_request"(p_data jsonb) from public, anon, authenticated;
grant execute on function public."submit_service_request"(p_data jsonb) to anon, authenticated;
revoke execute on function public."submit_warranty_registration"(p_data jsonb) from public, anon, authenticated;
grant execute on function public."submit_warranty_registration"(p_data jsonb) to anon, authenticated;
revoke execute on function public."upsert_my_customer"(p_data jsonb) from public, anon, authenticated;
grant execute on function public."upsert_my_customer"(p_data jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('product-datasheets', 'product-datasheets', true, 20971520, array['application/pdf']) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('product-images', 'product-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']) on conflict (id) do nothing;
create policy "product_datasheets_admin_delete" on storage.objects as permissive for delete to "authenticated" using (((bucket_id = 'product-datasheets'::text) AND is_admin()));
create policy "product_datasheets_admin_insert" on storage.objects as permissive for insert to "authenticated" with check (((bucket_id = 'product-datasheets'::text) AND is_admin()));
create policy "product_datasheets_admin_update" on storage.objects as permissive for update to "authenticated" using (((bucket_id = 'product-datasheets'::text) AND is_admin())) with check (((bucket_id = 'product-datasheets'::text) AND is_admin()));
create policy "product_datasheets_public_read" on storage.objects as permissive for select to "anon", "authenticated" using ((bucket_id = 'product-datasheets'::text));
create policy "product_images_admin_delete" on storage.objects as permissive for delete to "authenticated" using (((bucket_id = 'product-images'::text) AND is_admin()));
create policy "product_images_admin_insert" on storage.objects as permissive for insert to "authenticated" with check (((bucket_id = 'product-images'::text) AND is_admin()));
create policy "product_images_admin_update" on storage.objects as permissive for update to "authenticated" using (((bucket_id = 'product-images'::text) AND is_admin())) with check (((bucket_id = 'product-images'::text) AND is_admin()));
create policy "product_images_public_read" on storage.objects as permissive for select to "anon", "authenticated" using ((bucket_id = 'product-images'::text));

select cron.schedule('pr-quotation-expiry', '30 19 * * *', 'select public.pr_quotation_expiry_job()');
