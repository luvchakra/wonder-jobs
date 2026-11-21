-- WonderWorks Network feed (owner, 2026-11-21): posts a member addressed to everyone on the network are read by kind,
-- newest first (server/network/social.ts::feedFor). No new column: a post is a network_updates row whose kind is
-- 'post' (the author's connections) or 'post:everyone'. Additive: one index for that read.
create index if not exists network_updates_kind_idx on wonderjobs.network_updates (kind, created_at desc);
