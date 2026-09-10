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
drop policy if exists "anon delete picks" on picks;
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
-- Removing a pick is how you free a slot, so it is allowed on the same terms as making
-- one: before kickoff, and not after.
create policy "anon delete picks" on picks for delete to anon
  using (now() < timestamptz '2026-09-10T00:20:00Z');

create policy "anon read results" on results for select to anon using (true);
create policy "anon insert results" on results for insert to anon with check (true);
create policy "anon update results" on results for update to anon using (true) with check (true);

-- Each person picks 6 teams, enforced here so the cap holds even against the API directly.
-- This is a trigger rather than a row level security policy because a policy whose
-- expression queries picks would recurse.
create or replace function enforce_pick_limit() returns trigger as $$
begin
  -- PostgREST upserts as "insert ... on conflict do update", and a BEFORE INSERT trigger
  -- fires before the conflict is detected. The not exists clause is what lets someone
  -- holding 6 picks still switch one of them between over and under.
  if (select count(*) from picks where user_id = new.user_id) >= 6
     and not exists (
       select 1 from picks where user_id = new.user_id and team_id = new.team_id
     ) then
    raise exception 'pick limit reached: 6 teams per person';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists picks_limit on picks;
create trigger picks_limit before insert on picks
  for each row execute function enforce_pick_limit();

-- Each pick can carry a blurb explaining the reasoning behind it. These are what the
-- article page (docs/article.html) is written from.
--
-- Deliberately a separate table rather than a column on picks, because notes are NOT
-- locked at kickoff the way picks are: the picks themselves are the bet and have to
-- freeze, but people write and rewrite the reasoning around them all season, and the
-- policies on picks would otherwise refuse those writes.
create table if not exists notes (
  user_id bigint not null references users (id) on delete cascade,
  team_id text not null,
  body text not null check (char_length(body) <= 1200),
  updated_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

alter table notes enable row level security;

drop policy if exists "anon read notes" on notes;
drop policy if exists "anon insert notes" on notes;
drop policy if exists "anon update notes" on notes;
drop policy if exists "anon delete notes" on notes;

create policy "anon read notes" on notes for select to anon using (true);
create policy "anon insert notes" on notes for insert to anon with check (true);
create policy "anon update notes" on notes for update to anon using (true) with check (true);
create policy "anon delete notes" on notes for delete to anon using (true);
