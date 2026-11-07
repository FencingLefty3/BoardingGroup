create table if not exists public.trip_suggestions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  comment text not null default '',
  color text not null check (color in (
    '#f4c7c3',
    '#f7df9b',
    '#c8e3c2',
    '#c5d9f2',
    '#e0cef2',
    '#f4d2a8'
  )),
  created_at timestamptz not null default now()
);

create index if not exists trip_suggestions_trip_created_idx
  on public.trip_suggestions (trip_id, created_at);

alter table public.trip_suggestions enable row level security;

grant select, insert on public.trip_suggestions to authenticated;

drop policy if exists trip_suggestions_select_for_members on public.trip_suggestions;
create policy trip_suggestions_select_for_members
on public.trip_suggestions
for select
to authenticated
using (
  exists (
    select 1
    from public.trip_members
    where trip_members.trip_id = trip_suggestions.trip_id
      and trip_members.user_id = (select auth.uid())
  )
);

drop policy if exists trip_suggestions_insert_for_members on public.trip_suggestions;
create policy trip_suggestions_insert_for_members
on public.trip_suggestions
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.trip_members
    where trip_members.trip_id = trip_suggestions.trip_id
      and trip_members.user_id = (select auth.uid())
  )
);
