-- Schema for the NFL win totals pick'em app.
-- Paste into the Supabase SQL editor (Dashboard → SQL Editor → New query) and run once.

create table if not exists users (
  id bigint generated always as identity primary key,
  name text not null,
  name_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists picks (
  user_id bigint not null references users (id) on delete cascade,
  team_id text not null,
  choice text not null check (choice in ('over', 'under')),
  updated_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

-- Row level security stays ON, with policies that deliberately allow anonymous access.
-- This app has no real login: anyone with the site URL can read and change any picks.
-- That is the intended behavior for a game among friends. Do not store anything
-- sensitive here.
alter table users enable row level security;
alter table picks enable row level security;

drop policy if exists "anon read users" on users;
drop policy if exists "anon insert users" on users;
drop policy if exists "anon read picks" on picks;
drop policy if exists "anon insert picks" on picks;
drop policy if exists "anon update picks" on picks;

create policy "anon read users" on users for select to anon using (true);
create policy "anon insert users" on users for insert to anon with check (true);
create policy "anon read picks" on picks for select to anon using (true);
create policy "anon insert picks" on picks for insert to anon with check (true);
create policy "anon update picks" on picks for update to anon using (true) with check (true);
