-- Hiring talent: a job seeker open to recruiters may also show their photo and share one résumé file (owner,
-- 2026-11-20: "add photo of the user, link to full profile along with link of resume"). Both off unless they turn
-- them on, on You → Recruiters.
--   talent_profiles.show_photo — false unless the seeker turns it on; recruiters then read wj.avatar through
--     server/hiring.ts::talentPhoto (talent.search permission, profile still open).
--   talent_profiles.resume_file_id — null unless the seeker picks one of their own résumé files (checked against
--     their own files on save); read through server/hiring.ts::talentResume under the same checks.
-- Additive only, no new filter or order, so no new index.
alter table wonderjobs.talent_profiles add column if not exists show_photo boolean not null default false;
alter table wonderjobs.talent_profiles add column if not exists resume_file_id text;
