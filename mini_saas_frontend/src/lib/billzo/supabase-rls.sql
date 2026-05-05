create extension if not exists pgcrypto;

create or replace function app_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id',
    current_setting('request.headers', true)::jsonb ->> 'x-tenant-id'
  ), '')::uuid
$$;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id text not null,
  plan text not null default 'test',
  paywall_unlocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table customers (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  phone text not null,
  gstin text,
  default_tone text not null default 'hinglish',
  last_used_at timestamptz not null default now(),
  invoice_count integer not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (tenant_id, phone)
);

create table products (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  barcode text,
  hsn text,
  gst_rate numeric(5,2) not null default 0,
  stock numeric(12,3) not null default 0,
  low_stock_at numeric(12,3) not null default 0,
  sale_price numeric(12,2) not null default 0,
  purchase_price numeric(12,2) not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (tenant_id, barcode)
);

create table invoices (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id),
  customer_name text not null,
  customer_phone text not null,
  total numeric(12,2) not null,
  paid_amount numeric(12,2) not null default 0,
  status text not null check (status in ('paid', 'partial', 'unpaid', 'overdue')),
  due_at timestamptz not null,
  recovery_stage text not null,
  next_recovery_at timestamptz,
  last_whatsapp_status text not null default 'queued',
  pdf_url text not null,
  version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table invoice_items (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  invoice_id uuid not null,
  product_id uuid references products(id),
  name text not null,
  qty numeric(12,3) not null,
  price numeric(12,2) not null,
  gst_rate numeric(5,2) not null,
  line_total numeric(12,2) not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table purchases (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  supplier text not null,
  gstin text,
  amount numeric(12,2) not null,
  source text not null check (source in ('scan', 'repeat')),
  version integer not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table inventory_movements (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id),
  source_type text not null check (source_type in ('invoice', 'purchase', 'correction')),
  source_id uuid not null,
  qty_delta numeric(12,3) not null,
  stock_after numeric(12,3) not null,
  created_at timestamptz not null
);

create table payments (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  invoice_id uuid references invoices(id),
  provider text not null check (provider in ('cash', 'upi', 'razorpay_test')),
  provider_payment_id text,
  amount numeric(12,2) not null,
  status text not null check (status in ('success', 'failed', 'pending')),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table recovery_attempts (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  stage text not null,
  tone text not null,
  message text not null,
  pdf_url text not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  read_at timestamptz,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table whatsapp_events (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  recovery_attempt_id uuid references recovery_attempts(id),
  provider_message_id text,
  status text not null,
  failure_reason text,
  occurred_at timestamptz not null,
  created_at timestamptz not null
);

create table sync_queue (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  entity text not null,
  entity_id uuid not null,
  action text not null,
  payload jsonb not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null,
  status text not null,
  last_error text,
  idempotency_key text not null unique,
  conflict_policy text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index customers_tenant_recent_idx on customers (tenant_id, last_used_at desc);
create index invoices_tenant_attention_idx on invoices (tenant_id, status, next_recovery_at);
create index products_tenant_low_stock_idx on products (tenant_id, stock, low_stock_at);
create index payments_tenant_invoice_idx on payments (tenant_id, invoice_id);
create index whatsapp_tenant_invoice_idx on whatsapp_events (tenant_id, invoice_id, occurred_at desc);
create index recovery_tenant_due_idx on recovery_attempts (tenant_id, scheduled_at, status);
create index sync_queue_due_idx on sync_queue (tenant_id, status, next_attempt_at);

alter table tenants enable row level security;
alter table customers enable row level security;
alter table products enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table purchases enable row level security;
alter table inventory_movements enable row level security;
alter table payments enable row level security;
alter table recovery_attempts enable row level security;
alter table whatsapp_events enable row level security;
alter table sync_queue enable row level security;

create policy tenant_self on tenants for all using (id = app_tenant_id()) with check (id = app_tenant_id());

create policy tenant_customers on customers for all using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy tenant_products on products for all using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy tenant_invoices on invoices for all using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy tenant_invoice_items on invoice_items for all using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy tenant_purchases on purchases for all using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy tenant_inventory on inventory_movements for all using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy tenant_payments on payments for all using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy tenant_recovery on recovery_attempts for all using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy tenant_whatsapp on whatsapp_events for all using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
create policy tenant_sync on sync_queue for all using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
