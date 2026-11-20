begin;
-- Keep revoked assignments as history while reserving UIDs for active cards.
alter table public.gp_credentials drop constraint gp_credentials_method_credential_hash_key;
create unique index gp_credentials_active_hash on public.gp_credentials(method,credential_hash) where not revoked;
create or replace function public.gp_capture_card(p_session uuid,p_device text,p_hash text,p_last text)
returns text language plpgsql security invoker set search_path='' as $$
declare s public.gp_card_enrollments;
begin
 select * into s from public.gp_card_enrollments where id=p_session and device_id=p_device for update;
 if not found or s.expires_at<=now() or s.status not in ('waiting','captured') then return 'expired';end if;
 if not exists(select 1 from public.gp_devices where id=p_device and not revoked) then return 'revoked';end if;
 if not exists(select 1 from public.gp_profiles where id=s.created_by and active and role in ('Admin','HR')) then return 'revoked';end if;
 if s.status='captured' then if s.credential_hash=p_hash then return 'captured';else return 'conflict';end if;end if;
 if exists(select 1 from public.gp_credentials where method='card' and credential_hash=p_hash and not revoked) then return 'duplicate';end if;
 update public.gp_card_enrollments set credential_hash=p_hash,last_four=p_last,status='captured' where id=s.id;
 return 'captured';
end $$;

revoke all on function public.gp_capture_card(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.gp_capture_card(uuid,text,text,text) to service_role;
notify pgrst,'reload schema';
commit;
