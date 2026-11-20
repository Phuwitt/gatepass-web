-- This helper only reads the caller's own gp_profiles row via its existing RLS policy.
alter function public.gp_is_manager() security invoker;
revoke execute on function public.gp_is_manager() from public,anon;
grant execute on function public.gp_is_manager() to authenticated,service_role;
create index if not exists gp_card_employee on public.gp_card_enrollments(employee_id);
create index if not exists gp_card_credential on public.gp_card_enrollments(credential_id);
