-- Allow a membership to list how many grandchildren/extras it covers (info only — not deducted).
alter table public.memberships add column if not exists grandchildren_count integer;

-- Update RPCs to include grandchildren_count in the returned membership JSON
-- (row_to_json already includes new columns; no function change required.)
