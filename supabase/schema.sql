-- BOX QR MANAGER v3
create extension if not exists pgcrypto;

drop table if exists public.scan_logs cascade;
drop table if exists public.box_pairs cascade;
drop table if exists public.qr_codes cascade;
drop table if exists public.scan_sessions cascade;
drop table if exists public.profiles cascade;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'operator' check (role in ('admin','operator','viewer')),
  created_at timestamptz not null default now()
);

create table public.scan_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  session_type text not null check (session_type in ('SINGLE','PAIR')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED','COMPLETED')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(created_by, name)
);

create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.scan_sessions(id) on delete cascade,
  sn text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(session_id, sn)
);

create table public.box_pairs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.scan_sessions(id) on delete cascade,
  old_box text not null,
  new_box text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check(old_box <> new_box),
  unique(session_id, old_box),
  unique(session_id, new_box)
);

create table public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.scan_sessions(id) on delete cascade,
  scan_type text not null check(scan_type in ('SINGLE','PAIR_OLD','PAIR_NEW','PAIR')),
  code text,
  old_box text,
  new_box text,
  result text not null check(result in ('PASS','FAIL')),
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_sessions_updated on public.scan_sessions(updated_at desc);
create index idx_codes_session on public.qr_codes(session_id);
create index idx_pairs_session on public.box_pairs(session_id);
create index idx_logs_session on public.scan_logs(session_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.scan_sessions enable row level security;
alter table public.qr_codes enable row level security;
alter table public.box_pairs enable row level security;
alter table public.scan_logs enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_insert on public.profiles for insert to authenticated with check (id = auth.uid());

create policy sessions_all_own on public.scan_sessions for all to authenticated
using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy codes_all_own on public.qr_codes for all to authenticated
using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy pairs_all_own on public.box_pairs for all to authenticated
using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy logs_all_own on public.scan_logs for all to authenticated
using (created_by = auth.uid()) with check (created_by = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id,email) values(new.id,new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter publication supabase_realtime add table public.scan_sessions;
alter publication supabase_realtime add table public.qr_codes;
alter publication supabase_realtime add table public.box_pairs;
alter publication supabase_realtime add table public.scan_logs;