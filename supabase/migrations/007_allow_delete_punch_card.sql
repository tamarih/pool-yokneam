-- Allow deleting a punch_card without losing its entries history.
-- Drop the existing FK and re-add with ON DELETE SET NULL.
alter table public.entries
  drop constraint if exists entries_punch_card_id_fkey;

alter table public.entries
  add constraint entries_punch_card_id_fkey
  foreign key (punch_card_id) references public.punch_cards(id)
  on delete set null;
