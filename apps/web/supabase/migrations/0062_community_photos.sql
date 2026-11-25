-- A community's own photo (owner, 2026-11-23: "add option to change profile picture of community"):
--   network_communities.photo_at   — when its photo last changed (empty: none, the letter mark shows).
--   network_community_photos       — the photo itself: square, at most 512 px, re-encoded with no metadata, base64.
-- No person column: who changed it goes in the mod log. One row per community, read by its primary key.
alter table wonderjobs.network_communities add column if not exists photo_at timestamptz;
create table if not exists wonderjobs.network_community_photos (
  community_id text primary key,
  mime text not null,
  data text not null,
  created_at timestamptz not null default now()
);
alter table wonderjobs.network_community_photos enable row level security;
revoke all on wonderjobs.network_community_photos from anon, authenticated;
grant all on wonderjobs.network_community_photos to service_role;
notify pgrst, 'reload schema';
