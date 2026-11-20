create table public.gp_camera_viewers (
  viewer_id uuid primary key,
  actor_id uuid not null references public.gp_profiles(id) on delete cascade,
  device_id text not null references public.gp_devices(id) on delete cascade,
  expires_at timestamptz not null
);
create index gp_camera_viewers_device_expiry
  on public.gp_camera_viewers (device_id, expires_at);

create table public.gp_camera_frames (
  device_id text primary key references public.gp_devices(id) on delete cascade,
  jpeg_base64 text not null check (length(jpeg_base64) between 1 and 699052),
  captured_at timestamptz not null
);

alter table public.gp_camera_viewers enable row level security;
alter table public.gp_camera_frames enable row level security;
revoke all on public.gp_camera_viewers, public.gp_camera_frames from public, anon, authenticated;
grant select, insert, update, delete on public.gp_camera_viewers, public.gp_camera_frames to service_role;

create extension if not exists pg_cron;
select cron.schedule('gatepass-expire-camera-preview', '* * * * *', $$
  delete from public.gp_camera_frames where captured_at <= now() - interval '10 seconds';
  delete from public.gp_camera_viewers where expires_at <= now();
$$);
