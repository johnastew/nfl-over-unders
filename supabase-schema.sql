-- Schema for the NFL win totals pick'em app.
-- Paste into the Supabase SQL editor (Dashboard → SQL Editor → New query) and run.
-- Safe to re-run: it only adds what is missing, and never touches existing rows.

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

create table if not exists results (
  team_id text primary key,
  wins numeric not null default 0 check (wins >= 0),
  losses numeric not null default 0 check (losses >= 0),
  updated_at timestamptz not null default now()
);

-- Row level security stays ON, with policies that deliberately allow anonymous access.
-- This app has no real login: anyone with the site URL can read and change any picks.
-- That is the intended behavior for a game among friends. Do not store anything
-- sensitive here.
alter table users enable row level security;
alter table picks enable row level security;
alter table results enable row level security;

drop policy if exists "anon read users" on users;
drop policy if exists "anon insert users" on users;
drop policy if exists "anon read picks" on picks;
drop policy if exists "anon insert picks" on picks;
drop policy if exists "anon update picks" on picks;
drop policy if exists "anon read results" on results;
drop policy if exists "anon insert results" on results;
drop policy if exists "anon update results" on results;

create policy "anon read users" on users for select to anon using (true);
create policy "anon insert users" on users for insert to anon with check (true);
create policy "anon read picks" on picks for select to anon using (true);
-- Picks lock at kickoff of the Wednesday opener: 8:20 PM ET on Sept 9, 2026 (00:20 UTC
-- on the 10th, since September is EDT). Reads stay open forever; writes stop dead at
-- that moment. This is the real lock -- the app's disabled buttons are only a courtesy,
-- and someone calling the API directly still hits this.
-- To change the deadline, edit the timestamp in both policies below, re-run this file,
-- and update PICKS_LOCK_AT in docs/app.js to match.
create policy "anon insert picks" on picks for insert to anon
  with check (now() < timestamptz '2026-09-10T00:20:00Z');
create policy "anon update picks" on picks for update to anon
  using (now() < timestamptz '2026-09-10T00:20:00Z')
  with check (now() < timestamptz '2026-09-10T00:20:00Z');
create policy "anon read results" on results for select to anon using (true);
create policy "anon insert results" on results for insert to anon with check (true);
create policy "anon update results" on results for update to anon using (true) with check (true);
