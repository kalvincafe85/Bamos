create extension if not exists pgcrypto;

create table itineraries (
  id uuid primary key,               -- same value as Itinerary.id (client-generated)
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table itineraries enable row level security;

create policy "own select" on itineraries for select using (owner_id = auth.uid());
create policy "own insert" on itineraries for insert with check (owner_id = auth.uid());
create policy "own update" on itineraries for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own delete" on itineraries for delete using (owner_id = auth.uid());

create table shares (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references itineraries(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (itinerary_id)
);
alter table shares enable row level security;

create policy "create share for own itinerary" on shares for insert
  with check (
    created_by = auth.uid()
    and exists (select 1 from itineraries i where i.id = itinerary_id and i.owner_id = auth.uid())
  );
create policy "owner reads own shares" on shares for select using (created_by = auth.uid());

-- Bypasses RLS so a non-owner recipient can read a shared itinerary by token
-- without needing broad public SELECT policies on itineraries.
create or replace function get_shared_itinerary(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select i.data
  from shares s
  join itineraries i on i.id = s.itinerary_id
  where s.token = p_token;
$$;

grant execute on function get_shared_itinerary(uuid) to anon, authenticated;
