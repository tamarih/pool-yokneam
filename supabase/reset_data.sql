-- UNSAFE / DEPRECATED: this script deletes public.entries and destroys entry history.
-- Use supabase/reset_data_safe.sql for year reset/import flows that must preserve entries.
-- Do not run this script unless you intentionally want to erase all entry history.
-- ⚠️  מוחק את כל הנתונים של משפחות, מנויים, כרטיסיות וכניסות.
-- ⚠️  לא נוגע בחשבונות משתמשים (admin / guard).
-- להריץ ב-Supabase SQL Editor → Run.

begin;

delete from public.entries;
delete from public.punch_cards;
delete from public.memberships;
delete from public.family_members;
delete from public.family_user_links;
delete from public.families;

-- restart family number sequence so הראשונה הבאה תהיה F1000
alter sequence if exists family_number_seq restart with 1000;

commit;

-- סיכום
select
  (select count(*) from public.families)        as families,
  (select count(*) from public.family_members)  as members,
  (select count(*) from public.memberships)     as memberships,
  (select count(*) from public.punch_cards)     as punch_cards,
  (select count(*) from public.entries)         as entries;
