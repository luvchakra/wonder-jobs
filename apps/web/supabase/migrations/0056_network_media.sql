-- WonderWorks Network (owner, 2026-11-21: "add option to add images and video here"): photos on posts, up to four.
--   network_media — one photo, encrypted like listing photos (server/network/media.ts), metadata stripped. A photo is
--                   uploaded before its post and attached when the member presses Post; one never attached goes after a day.
--   network_updates.media — the attached photos' ids in order, so the feed never reads the photos themselves.
-- No foreign key to tenants: account erasure removes the photos (server/network/account.ts).
create table if not exists wonderjobs.network_media (
  id text primary key,
  tenant_id text not null,
  update_id text,
  position integer not null default 0,
  mime text not null,
  ciphertext text not null,
  created_at timestamptz not null default now()
);
create index if not exists network_media_update_idx on wonderjobs.network_media (update_id);
create index if not exists network_media_tenant_idx on wonderjobs.network_media (tenant_id, created_at desc);
alter table wonderjobs.network_updates add column if not exists media jsonb;
alter table wonderjobs.network_media enable row level security;
revoke all on wonderjobs.network_media from anon, authenticated;
grant all on wonderjobs.network_media to service_role;
notify pgrst, 'reload schema';
