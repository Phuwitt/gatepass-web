begin;
alter table public.gp_profiles drop constraint gp_profiles_role_check;
alter table public.gp_profiles add constraint gp_profiles_role_check check(role in ('Admin','HR','Employee'));
alter table public.gp_employees
  add column phone text not null default '',
  add column hired_on date,
  add column work_start time not null default '09:00',
  add column work_end time not null default '18:00',
  add column grace_minutes integer not null default 0 check(grace_minutes between 0 and 120),
  add column auth_user_id uuid unique references auth.users on delete set null,
  add constraint gp_work_hours check(work_start<work_end);
alter table public.gp_devices
  add column direction text not null default 'unspecified' check(direction in ('in','out','unspecified')),
  add column door_open boolean,
  add column door_open_since timestamptz,
  add column tamper boolean;
alter table public.gp_events drop constraint gp_events_method_check;
alter table public.gp_events add constraint gp_events_method_check check(method in ('face','card','nfc','qr'));
alter table public.gp_events add column direction text not null default 'unspecified' check(direction in ('in','out','unspecified'));
create table public.gp_methods(
 employee_id text references public.gp_employees on delete cascade,
 method text check(method in ('card','nfc','qr')), enabled boolean not null default false,
 primary key(employee_id,method)
);
create table public.gp_credentials(
 id uuid primary key default gen_random_uuid(), employee_id text not null references public.gp_employees on delete cascade,
 method text not null check(method in ('card','nfc')), credential_hash text not null,
 label text not null, last_four text not null, revoked boolean not null default false,
 created_at timestamptz not null default now(), unique(method,credential_hash)
);
create index gp_credentials_employee on public.gp_credentials(employee_id);
create table public.gp_leaves(
 id uuid primary key default gen_random_uuid(), employee_id text not null references public.gp_employees on delete cascade,
 starts date not null, ends date not null, kind text not null check(kind in ('sick','personal','annual')),
 reason text not null, status text not null default 'pending' check(status in ('pending','approved','rejected')),
 actor uuid references auth.users on delete set null, created_at timestamptz not null default now(), check(starts<=ends)
);
create index gp_leaves_employee_dates on public.gp_leaves(employee_id,starts,ends);
create table public.gp_reviews(
 source_key text primary key, event_id uuid references public.gp_events on delete cascade,
 decision text not null check(decision in ('reviewed','false_alarm','follow_up')),
 note text not null check(length(trim(note)) between 3 and 1000),
 actor uuid references auth.users on delete set null, created_at timestamptz not null default now()
);
create table public.gp_qr_sessions(
 token_hash text primary key, device_id text not null references public.gp_devices on delete cascade,
 expires_at timestamptz not null, consumed_by uuid references auth.users on delete set null,
 consumed_at timestamptz, request_id uuid not null unique default gen_random_uuid()
);
create index gp_qr_expiry on public.gp_qr_sessions(expires_at);
create index gp_events_employee_date on public.gp_events(employee_id,created_at desc);
create index gp_events_status_date on public.gp_events(status,created_at desc);
alter table public.gp_methods enable row level security;
alter table public.gp_credentials enable row level security;
alter table public.gp_leaves enable row level security;
alter table public.gp_reviews enable row level security;
alter table public.gp_qr_sessions enable row level security;
create policy manager_read on public.gp_methods for select to authenticated using(public.gp_is_manager());
create policy manager_read on public.gp_leaves for select to authenticated using(public.gp_is_manager());
create policy manager_read on public.gp_reviews for select to authenticated using(public.gp_is_manager());
revoke all on public.gp_credentials,public.gp_qr_sessions from anon,authenticated;
grant select on public.gp_methods,public.gp_leaves,public.gp_reviews to authenticated;
grant all on public.gp_methods,public.gp_credentials,public.gp_leaves,public.gp_reviews,public.gp_qr_sessions to service_role;
-- Single-use QR redemption is atomic, including simultaneous phones.
create function public.gp_consume_qr(p_hash text,p_user uuid)
returns setof public.gp_qr_sessions language sql security definer set search_path='' as $$
 update public.gp_qr_sessions set consumed_by=p_user,consumed_at=now()
 where token_hash=p_hash and consumed_at is null and expires_at>now()
 returning *;
$$;
revoke all on function public.gp_consume_qr(text,uuid) from public,anon,authenticated;
grant execute on function public.gp_consume_qr(text,uuid) to service_role;
commit;
