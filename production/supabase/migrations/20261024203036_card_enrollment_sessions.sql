begin;
create table public.gp_card_enrollments (
 id uuid primary key default gen_random_uuid(), employee_id text not null references public.gp_employees on delete cascade,
 device_id text not null references public.gp_devices on delete cascade, created_by uuid not null references auth.users on delete cascade,
 label text not null check(length(trim(label)) between 1 and 80), status text not null default 'waiting' check(status in ('waiting','captured','confirmed','cancelled')),
 expires_at timestamptz not null default now()+interval '2 minutes', created_at timestamptz not null default now(),
 credential_hash text check(credential_hash ~ '^[a-f0-9]{64}$'),last_four text,
 credential_id uuid references public.gp_credentials on delete set null,
 check(status not in ('captured','confirmed') or (credential_hash is not null and last_four is not null))
);
create unique index gp_card_one_open_per_device on public.gp_card_enrollments(device_id) where status in ('waiting','captured');
create index gp_card_owner on public.gp_card_enrollments(created_by,created_at desc);
alter table public.gp_card_enrollments enable row level security;
revoke all on public.gp_card_enrollments from anon,authenticated;
grant all on public.gp_card_enrollments to service_role;
create function public.gp_capture_card(p_session uuid,p_device text,p_hash text,p_last text)
returns text language plpgsql security invoker set search_path='' as $$
declare s public.gp_card_enrollments;
begin
 select * into s from public.gp_card_enrollments where id=p_session and device_id=p_device for update;
 if not found or s.expires_at<=now() or s.status not in ('waiting','captured') then return 'expired';end if;
 if not exists(select 1 from public.gp_devices where id=p_device and not revoked) then return 'revoked';end if;
 if not exists(select 1 from public.gp_profiles where id=s.created_by and active and role in ('Admin','HR')) then return 'revoked';end if;
 if s.status='captured' then if s.credential_hash=p_hash then return 'captured';else return 'conflict';end if;end if;
 if exists(select 1 from public.gp_credentials where method='card' and credential_hash=p_hash) then return 'duplicate';end if;
 update public.gp_card_enrollments set credential_hash=p_hash,last_four=p_last,status='captured' where id=s.id;
 return 'captured';
end $$;
create function public.gp_confirm_card(p_session uuid,p_actor uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.gp_card_enrollments; result uuid;
begin
 select * into s from public.gp_card_enrollments where id=p_session and created_by=p_actor for update;
 if not found then raise exception using errcode='P0001',message='session_missing';end if;
 if not exists(select 1 from public.gp_profiles where id=p_actor and active and role in ('Admin','HR')) then raise exception using errcode='P0001',message='actor_inactive';end if;
 if s.status='confirmed' then return s.credential_id;end if;
 if s.expires_at<=now() or s.status<>'captured' then raise exception using errcode='P0001',message='session_expired';end if;
 if not exists(select 1 from public.gp_employees where id=s.employee_id and active) then raise exception using errcode='P0001',message='employee_inactive';end if;
 if not exists(select 1 from public.gp_devices where id=s.device_id and not revoked) then raise exception using errcode='P0001',message='device_revoked';end if;
 insert into public.gp_credentials(employee_id,method,credential_hash,label,last_four) values(s.employee_id,'card',s.credential_hash,s.label,s.last_four) returning id into result;
 update public.gp_card_enrollments set status='confirmed',credential_id=result where id=s.id;
 insert into public.gp_audit(actor,action,details) values(p_actor,'ยืนยันบัตรจากเครื่องอ่าน',jsonb_build_object('employee',s.employee_id,'device',s.device_id,'credential',result));
 return result;
end $$;
revoke all on function public.gp_capture_card(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.gp_confirm_card(uuid,uuid) from public,anon,authenticated;
grant execute on function public.gp_capture_card(uuid,text,text,text) to service_role;
grant execute on function public.gp_confirm_card(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
