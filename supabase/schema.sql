-- Butterhaus Order Dashboard Database Schema
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Updated timestamp helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Flavors master list per user
create table if not exists public.flavors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flavors_name_not_blank check (char_length(trim(name)) > 0),
  constraint flavors_unique_per_owner unique (owner_id, name)
);

-- Price per flavor and size
create table if not exists public.flavor_prices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  flavor_id uuid not null references public.flavors(id) on delete cascade,
  size_grams integer not null,
  price numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flavor_prices_size_check check (size_grams in (60, 100)),
  constraint flavor_prices_price_check check (price >= 0),
  constraint flavor_prices_unique unique (flavor_id, size_grams)
);

-- Customer order header
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_name text not null,
  customer_contact text,
  batch_date date not null default current_date,
  order_type text not null default 'Pickup',
  amount_paid numeric(10, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_customer_not_blank check (char_length(trim(customer_name)) > 0),
  constraint orders_amount_paid_check check (amount_paid >= 0),
  constraint orders_type_check check (order_type in ('Pickup', 'Delivery'))
);

-- Order items/lines
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  flavor_id uuid not null references public.flavors(id) on delete restrict,
  flavor_name_snapshot text not null,
  size_grams integer not null,
  quantity integer not null,
  price_each numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_items_size_check check (size_grams in (60, 100)),
  constraint order_items_qty_check check (quantity > 0),
  constraint order_items_price_check check (price_each >= 0)
);

create index if not exists orders_owner_batch_idx on public.orders(owner_id, batch_date desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_owner_flavor_size_idx on public.order_items(owner_id, flavor_id, size_grams);
create index if not exists flavor_prices_owner_flavor_idx on public.flavor_prices(owner_id, flavor_id);

drop trigger if exists set_flavors_updated_at on public.flavors;
create trigger set_flavors_updated_at
before update on public.flavors
for each row execute function public.set_updated_at();

drop trigger if exists set_flavor_prices_updated_at on public.flavor_prices;
create trigger set_flavor_prices_updated_at
before update on public.flavor_prices
for each row execute function public.set_updated_at();

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists set_order_items_updated_at on public.order_items;
create trigger set_order_items_updated_at
before update on public.order_items
for each row execute function public.set_updated_at();

-- Enable RLS
alter table public.flavors enable row level security;
alter table public.flavor_prices enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Drop existing policies if re-running this script
drop policy if exists "flavors_select_own" on public.flavors;
drop policy if exists "flavors_insert_own" on public.flavors;
drop policy if exists "flavors_update_own" on public.flavors;
drop policy if exists "flavors_delete_own" on public.flavors;

drop policy if exists "flavor_prices_select_own" on public.flavor_prices;
drop policy if exists "flavor_prices_insert_own" on public.flavor_prices;
drop policy if exists "flavor_prices_update_own" on public.flavor_prices;
drop policy if exists "flavor_prices_delete_own" on public.flavor_prices;

drop policy if exists "orders_select_own" on public.orders;
drop policy if exists "orders_insert_own" on public.orders;
drop policy if exists "orders_update_own" on public.orders;
drop policy if exists "orders_delete_own" on public.orders;

drop policy if exists "order_items_select_own" on public.order_items;
drop policy if exists "order_items_insert_own" on public.order_items;
drop policy if exists "order_items_update_own" on public.order_items;
drop policy if exists "order_items_delete_own" on public.order_items;

-- Flavors RLS
create policy "flavors_select_own"
on public.flavors for select
to authenticated
using (owner_id = auth.uid());

create policy "flavors_insert_own"
on public.flavors for insert
to authenticated
with check (owner_id = auth.uid());

create policy "flavors_update_own"
on public.flavors for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "flavors_delete_own"
on public.flavors for delete
to authenticated
using (owner_id = auth.uid());

-- Flavor prices RLS
create policy "flavor_prices_select_own"
on public.flavor_prices for select
to authenticated
using (owner_id = auth.uid());

create policy "flavor_prices_insert_own"
on public.flavor_prices for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.flavors f
    where f.id = flavor_id
      and f.owner_id = auth.uid()
  )
);

create policy "flavor_prices_update_own"
on public.flavor_prices for update
to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.flavors f
    where f.id = flavor_id
      and f.owner_id = auth.uid()
  )
);

create policy "flavor_prices_delete_own"
on public.flavor_prices for delete
to authenticated
using (owner_id = auth.uid());

-- Orders RLS
create policy "orders_select_own"
on public.orders for select
to authenticated
using (owner_id = auth.uid());

create policy "orders_insert_own"
on public.orders for insert
to authenticated
with check (owner_id = auth.uid());

create policy "orders_update_own"
on public.orders for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "orders_delete_own"
on public.orders for delete
to authenticated
using (owner_id = auth.uid());

-- Order items RLS
create policy "order_items_select_own"
on public.order_items for select
to authenticated
using (owner_id = auth.uid());

create policy "order_items_insert_own"
on public.order_items for insert
to authenticated
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.orders o
    where o.id = order_id
      and o.owner_id = auth.uid()
  )
  and exists (
    select 1 from public.flavors f
    where f.id = flavor_id
      and f.owner_id = auth.uid()
  )
);

create policy "order_items_update_own"
on public.order_items for update
to authenticated
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and exists (
    select 1 from public.orders o
    where o.id = order_id
      and o.owner_id = auth.uid()
  )
  and exists (
    select 1 from public.flavors f
    where f.id = flavor_id
      and f.owner_id = auth.uid()
  )
);

create policy "order_items_delete_own"
on public.order_items for delete
to authenticated
using (owner_id = auth.uid());
