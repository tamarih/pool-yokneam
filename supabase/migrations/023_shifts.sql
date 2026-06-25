-- Employees table
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.employees (name) values
  ('אלה לוצקי'),
  ('שני יוסף'),
  ('עמרי בחנוף'),
  ('מאיה גבעתי');

-- Shifts table
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  shift_type text not null check (shift_type in ('morning', 'evening')),
  start_time time not null,
  end_time time not null,
  employee_id uuid references public.employees(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (date, shift_type)
);

-- RLS
alter table public.employees enable row level security;
alter table public.shifts enable row level security;

create policy "authenticated_employees" on public.employees for all to authenticated using (true) with check (true);
create policy "authenticated_shifts" on public.shifts for all to authenticated using (true) with check (true);
