create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update
  set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  type text not null check (type in ('income', 'expense')),
  category text not null,
  description text not null,
  date date not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists transactions_user_id_idx on public.transactions (user_id);
create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_user_category_idx on public.transactions (user_id, category);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  category text not null default 'overall',
  limit_amount numeric(12, 2) not null check (limit_amount > 0),
  month date not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, category, month)
);

create index if not exists budgets_user_id_idx on public.budgets (user_id);
create index if not exists budgets_user_month_idx on public.budgets (user_id, month);

alter table public.users enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;

drop policy if exists "Users can read own profile" on public.users;
create policy "Users can read own profile"
on public.users
for select
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
on public.users
for update
using (auth.uid() = id);

drop policy if exists "Users manage own transactions" on public.transactions;
create policy "Users manage own transactions"
on public.transactions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own budgets" on public.budgets;
create policy "Users manage own budgets"
on public.budgets
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
