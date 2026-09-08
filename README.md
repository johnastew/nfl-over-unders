# NFL Win Totals Over/Under

A dead-simple pick'em app for the 2026 NFL season. Everyone types their name, picks
**Over** or **Under** on all 32 team win totals, and can see a grid of everyone's picks.

It's a static site (no build step) hosted on GitHub Pages, with picks stored in a free
Supabase Postgres project.

**Before Supabase is connected the site still works**, in practice mode: picks save to
your own browser only, and a banner says so. That's useful for trying it out, but your
friends won't see each other's picks until you do the setup below.

Lines and odds are DraftKings numbers as of Sept. 3, 2026, as published by CBS Sports.

## Setup

**1. Create the database.** Sign up at [supabase.com](https://supabase.com) (free tier is
plenty) and create a project. Open **SQL Editor → New query**, paste the contents of
[`supabase-schema.sql`](supabase-schema.sql), and run it.

**2. Connect the app.** In Supabase, grab your **Project URL** (Project Settings → Data
API) and your **anon / public key** (Project Settings → API Keys). Put both into
`docs/config.js`:

```js
export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

Commit and push that change. Until you do, the site runs in practice mode (picks stay in
each person's own browser). Connecting Supabase switches it over automatically — practice
picks are not carried across, so everyone re-picks once.

**3. Turn on GitHub Pages.** In the repo: **Settings → Pages → Source: Deploy from a
branch**, then pick branch `main` and folder `/docs`. Save.

After a minute your site is live at **https://johnastew.github.io/nfl-over-unders/** —
send that link to your friends.

## Running it locally

```bash
npx serve docs
```

Then open the URL it prints. It talks to the same Supabase project, so local and live
share the same picks. (Any static file server works — `python3 -m http.server` from
inside `docs/` is fine too. Opening `index.html` directly as a `file://` URL will not
work, because the page uses JavaScript modules.)

## A note on "login" and security

There is no real login. Typing a name finds or creates a user by that name
(case-insensitive), and the Supabase anon key is public in the page's JavaScript — that's
normal for this kind of app, but it means **anyone with the link can view or change
anyone's picks.** That's fine for a group of friends playing for bragging rights. Don't
put anything sensitive in it.

## Updating the lines

All 32 teams, their win totals and odds live in `docs/teams.js`. Edit that one file and
push. Picks are keyed by team abbreviation, so they survive a line change.

## Layout

| File | Purpose |
|---|---|
| `docs/index.html` | The page |
| `docs/app.js` | All the logic — sign-in, picks, the everyone grid, Supabase calls |
| `docs/teams.js` | Teams, win totals, odds |
| `docs/config.js` | Your Supabase URL and anon key |
| `docs/styles.css` | Styling |
| `supabase-schema.sql` | Database setup, run once in Supabase |
