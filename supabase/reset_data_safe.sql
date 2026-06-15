-- ✅  Reset משפחות/מנויים/כרטיסיות אבל **משמר את היסטוריית הכניסות**.
-- ⚠️  להריץ רק אחרי שהריצו migration 017 (preserve_entries).
-- כניסות שהיו למשפחות שמחקת ישמרו עם family_name_snapshot כדי שתוכלי לראות מי נכנס בעבר.

begin;

delete from public.punch_cards;     -- entries.punch_card_id → NULL
delete from public.memberships;
delete from public.family_members;
delete from public.family_user_links;
delete from public.families;        -- trigger מקפיא את שם המשפחה ב-entries.family_name_snapshot, entries.family_id → NULL

alter sequence if exists family_number_seq restart with 1000;

commit;

-- סיכום: families/members/memberships/punch_cards = 0, entries נשמרו
select
  (select count(*) from public.families)        as families,
  (select count(*) from public.family_members)  as members,
  (select count(*) from public.memberships)     as memberships,
  (select count(*) from public.punch_cards)     as punch_cards,
  (select count(*) from public.entries)         as entries_preserved;
