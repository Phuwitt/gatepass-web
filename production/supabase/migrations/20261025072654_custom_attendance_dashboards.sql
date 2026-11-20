alter table public.gp_employees add column job_title text not null default '' check(length(job_title)<=120);
create table public.gp_dashboards(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade,
 name text not null check(length(trim(name)) between 1 and 80),department text not null default '' check(length(department)<=120),
 job_title text not null default '' check(length(job_title)<=120),view text not null default 'both' check(view in ('both','summary','arrival')),
 archived_at timestamptz,created_at timestamptz not null default now()
);
create index gp_dashboards_owner on public.gp_dashboards(owner_id,created_at);
alter table public.gp_dashboards enable row level security;
revoke all on public.gp_dashboards from anon,authenticated;
grant all on public.gp_dashboards to service_role;
