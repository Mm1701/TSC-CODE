-- BOX QR Manager database
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'operator' check (role in ('admin','operator','viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  sn text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.box_pairs (
  id uuid primary key default gen_random_uuid(),
  old_box text not null unique,
  new_box text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint old_new_different check (old_box <> new_box)
);

create table if not exists public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  scan_type text not null,
  sn text,
  old_box text,
  new_box text,
  result text not null check (result in ('PASS','FAIL')),
  reason text,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_qr_codes_created_at on public.qr_codes(created_at desc);
create index if not exists idx_box_pairs_created_at on public.box_pairs(created_at desc);
create index if not exists idx_scan_logs_created_at on public.scan_logs(created_at desc);
create index if not exists idx_scan_logs_sn on public.scan_logs(sn);

alter table public.profiles enable row level security;
alter table public.qr_codes enable row level security;
alter table public.box_pairs enable row level security;
alter table public.scan_logs enable row level security;

-- Authenticated users can use the app.
create policy "profiles_select_authenticated"
on public.profiles for select to authenticated using (true);

create policy "profiles_insert_self"
on public.profiles for insert to authenticated with check (id = auth.uid());

create policy "qr_select_authenticated"
on public.qr_codes for select to authenticated using (true);

create policy "qr_insert_authenticated"
on public.qr_codes for insert to authenticated with check (created_by = auth.uid());

create policy "pair_select_authenticated"
on public.box_pairs for select to authenticated using (true);

create policy "pair_insert_authenticated"
on public.box_pairs for insert to authenticated with check (created_by = auth.uid());

create policy "scan_select_authenticated"
on public.scan_logs for select to authenticated using (true);

create policy "scan_insert_authenticated"
on public.scan_logs for insert to authenticated with check (user_id = auth.uid());

-- Automatically create a profile for new auth users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id,email)
  values (new.id,new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Realtime
alter publication supabase_realtime add table public.scan_logs;
alter publication supabase_realtime add table public.box_pairs;
