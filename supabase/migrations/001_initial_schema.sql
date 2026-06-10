-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =====================
-- PROFILES (user roles)
-- =====================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  role text not null check (role in ('admin', 'guard', 'member')) default 'member',
  full_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: users see own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: admins see all" on public.profiles
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "profiles: admins manage" on public.profiles
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'member')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================
-- FAMILIES
-- =====================
create table public.families (
  id uuid primary key default uuid_generate_v4(),
  family_number text not null unique,
  family_name text not null,
  phone text not null default '',
  address text not null default '',
  membership_type text not null check (membership_type in ('seasonal', 'annual', 'punch_card')),
  start_date date not null,
  end_date date,
  status text not null check (status in ('active', 'inactive', 'suspended')) default 'active',
  qr_token text not null unique default encode(gen_random_bytes(32), 'hex'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.families enable row level security;

create policy "families: admins full access" on public.families
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'guard'))
  );

create policy "families: members see own" on public.families
  for select using (
    exists (
      select 1 from public.family_user_links l
      where l.family_id = families.id and l.user_id = auth.uid()
    )
  );

-- =====================
-- FAMILY USER LINKS (connects auth users to families)
-- =====================
create table public.family_user_links (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  unique(family_id, user_id)
);

alter table public.family_user_links enable row level security;

create policy "family_user_links: admins full access" on public.family_user_links
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "family_user_links: users see own" on public.family_user_links
  for select using (user_id = auth.uid());

-- =====================
-- FAMILY MEMBERS
-- =====================
create table public.family_members (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families on delete cascade,
  first_name text not null,
  last_name text not null,
  birth_date date,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.family_members enable row level security;

create policy "family_members: admins full access" on public.family_members
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'guard'))
  );

create policy "family_members: members see own" on public.family_members
  for select using (
    exists (
      select 1 from public.family_user_links l
      where l.family_id = family_members.family_id and l.user_id = auth.uid()
    )
  );

-- =====================
-- MEMBERSHIPS
-- =====================
create table public.memberships (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families on delete cascade,
  type text not null check (type in ('seasonal', 'annual', 'punch_card')),
  start_date date not null,
  end_date date,
  active boolean not null default true,
  price numeric(10,2),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.memberships enable row level security;

create policy "memberships: admins full access" on public.memberships
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'guard'))
  );

create policy "memberships: members see own" on public.memberships
  for select using (
    exists (
      select 1 from public.family_user_links l
      where l.family_id = memberships.family_id and l.user_id = auth.uid()
    )
  );

-- =====================
-- PUNCH CARDS
-- =====================
create table public.punch_cards (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families on delete cascade,
  purchased_entries integer not null default 0,
  used_entries integer not null default 0,
  remaining_entries integer generated always as (purchased_entries - used_entries) stored,
  expiry_date date,
  status text not null check (status in ('active', 'depleted', 'expired')) default 'active',
  price numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.punch_cards enable row level security;

create policy "punch_cards: admins full access" on public.punch_cards
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'guard'))
  );

create policy "punch_cards: members see own" on public.punch_cards
  for select using (
    exists (
      select 1 from public.family_user_links l
      where l.family_id = punch_cards.family_id and l.user_id = auth.uid()
    )
  );

-- =====================
-- ENTRIES
-- =====================
create table public.entries (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid not null references public.families on delete cascade,
  entry_date date not null default current_date,
  entry_time time not null default current_time,
  people_count integer not null default 1,
  entry_type text not null check (entry_type in ('membership', 'punch_card', 'guest')),
  guard_user_id uuid references public.profiles,
  punch_card_id uuid references public.punch_cards,
  status text not null check (status in ('valid', 'cancelled')) default 'valid',
  notes text,
  created_at timestamptz not null default now()
);

alter table public.entries enable row level security;

create policy "entries: admins full access" on public.entries
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin', 'guard'))
  );

create policy "entries: members see own" on public.entries
  for select using (
    exists (
      select 1 from public.family_user_links l
      where l.family_id = entries.family_id and l.user_id = auth.uid()
    )
  );

-- =====================
-- INDEXES
-- =====================
create index idx_families_qr_token on public.families(qr_token);
create index idx_families_status on public.families(status);
create index idx_entries_family_id on public.entries(family_id);
create index idx_entries_entry_date on public.entries(entry_date);
create index idx_entries_created_at on public.entries(created_at);
create index idx_punch_cards_family_id on public.punch_cards(family_id);
create index idx_memberships_family_id on public.memberships(family_id);

-- =====================
-- UPDATED_AT TRIGGER
-- =====================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger families_updated_at before update on public.families
  for each row execute procedure public.set_updated_at();

create trigger punch_cards_updated_at before update on public.punch_cards
  for each row execute procedure public.set_updated_at();

-- =====================
-- FAMILY NUMBER SEQUENCE
-- =====================
create sequence family_number_seq start 1000;

create or replace function public.next_family_number()
returns text language plpgsql as $$
begin
  return 'F' || lpad(nextval('family_number_seq')::text, 4, '0');
end;
$$;
