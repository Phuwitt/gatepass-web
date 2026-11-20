begin;
alter table public.gp_devices add column tamper_since timestamptz;
create table public.gp_adjustments(
 id uuid primary key default gen_random_uuid(),
 employee_id text not null references public.gp_employees on delete cascade,
 day date not null, requested_in time not null, requested_out time not null,
 reason text not null check(length(trim(reason)) between 3 and 1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 actor uuid references auth.users on delete set null,
 created_at timestamptz not null default now(), check(requested_in<requested_out)
);
create index gp_adjustment_employee_date on public.gp_adjustments(employee_id,day);
create unique index gp_adjustment_approved_day on public.gp_adjustments(employee_id,day) where status='approved';
alter table public.gp_adjustments enable row level security;
create policy manager_read on public.gp_adjustments for select to authenticated using(public.gp_is_manager());
grant select on public.gp_adjustments to authenticated;
grant all on public.gp_adjustments to service_role;
commit;
