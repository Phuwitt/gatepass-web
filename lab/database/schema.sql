-- Schema snapshot for a NEW disposable LAB database; not a reset script.
create table if not exists public.gp_lab_rooms (
 id text primary key check (id like 'lab_%'),
 revision bigint not null default 0,
 state jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.gp_lab_rooms enable row level security;
revoke all on table public.gp_lab_rooms from public, anon, authenticated;
grant select, insert, update, delete on table public.gp_lab_rooms to service_role;
