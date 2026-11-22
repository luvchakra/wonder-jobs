-- Upvote and downvote on community discussions and replies (owner, 2026-11-22: "instead of like, give upvote, downvote
-- feature here"): each member's vote is +1 or -1; a discussion's or reply's score is their sum. Existing rows were likes,
-- so they count as +1. No new filter or order (votes are read by subject_id, already the primary key's first column).
alter table wonderjobs.network_votes add column if not exists value smallint not null default 1;
notify pgrst, 'reload schema';
