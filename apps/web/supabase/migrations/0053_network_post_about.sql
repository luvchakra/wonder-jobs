-- WonderWorks Network posts from any module (owner, 2026-11-21: "creating post should be possible from various modules"):
-- a post may carry the listing the member was looking at. Its public page goes in the existing href; this adds its
-- title, so the feed can show what the post is about. Additive, empty by default; no new filter or order, so no index.
alter table wonderjobs.network_updates add column if not exists about text;
