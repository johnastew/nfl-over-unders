# NFL Win Totals Over/Under

A dead-simple pick'em app for the 2026 NFL season. Everyone types their name, picks
**any 6 teams** and calls each one's win total **Over** or **Under**, and can see a grid of
everyone's picks.

Choosing which 6 is the game. Tap a pick again to remove it and free a slot; switching a
team you already hold between over and under is always free.

It's a static site (no build step) hosted on GitHub Pages, with picks stored in a free
Supabase Postgres project.

**Before Supabase is connected the site still works**, in practice mode: picks save to
your own browser only, and a banner says so. That's useful for trying it out, but your
friends won't see each other's picks until you do the setup below.

Lines and odds are DraftKings numbers as of Sept. 3, 2026, as published by CBS Sports.

## Setup

**1. Create the database.** Sign up at [supabase.com](https://supabase.com) (free tier is
plenty) and create a project. Open **SQL Editor → New query**, paste the contents of
[`supabase-schema.sql`](supabase-schema.sql), and run it. It is safe to re-run later —
that is how you pick up new tables when the app gains a feature.

**2. Connect the app.** In Supabase, grab your **Project URL** (Project Settings → Data
API) and your **anon / public key** (Project Settings → API Keys). Put both into
`docs/config.js`:

```js
export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

**Changing the rules?** The 6-pick cap is enforced in two places that must agree: the
`picks_limit` trigger in `supabase-schema.sql` and `MAX_PICKS` in `docs/app.js`. Edit both,
re-run the SQL, and bump the cache-bust below.

**Starting a season over.** To clear everyone's picks (for instance after a rules change),
run `delete from picks;` in the Supabase SQL editor. That is irreversible and affects
everybody — the only destructive step in this project.

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

There is no real login. Your name is your account: type it to create one, or pick it from
the dropdown of existing names to get back to your picks on another device. Names are
matched case-insensitively, so `alice` and `Alice` are the same person.

The Supabase anon key is public in the page's JavaScript — normal for this kind of app,
but combined with the name list it means **anyone with the link can open anyone's account
and change their picks** (until the deadline, at least). That's fine for a group of
friends playing for bragging rights. Don't put anything sensitive in it.

## The pick deadline

Picks lock at kickoff of the Wednesday opener — **8:20 PM ET on Sept 9, 2026**. After
that the buttons are disabled and a banner says so; everyone can still see all picks and
the standings.

The lock is enforced in **two** places, and only the second one really counts:

1. `PICKS_LOCK_AT` in `docs/app.js` disables the UI. That is a courtesy — anyone could
   bypass it with the browser console.
2. The row level security policies on `picks` in `supabase-schema.sql` refuse any insert
   or update past that timestamp. This is the actual lock: a late write fails at the
   database, however it is sent.

To move the deadline, edit the timestamp in **both** places (the two `picks` write
policies and `PICKS_LOCK_AT`), re-run `supabase-schema.sql`, and push. Note the app's
timestamps are UTC: 8:20 PM ET in September is `00:20Z` the next day.

The **Everyone** tab is hidden until that same moment, so nobody can copy someone else's
picks before the deadline. That is a courtesy rather than a secret — the picks are still
readable through the API by anyone determined, since every row stays world-readable. The
tab reappears on its own at kickoff, with no deploy needed.

Entering results is deliberately **not** locked — that has to keep working all season.

## Scoring

The **Standings** tab ranks everyone by **correct picks** out of their 6. Two tiebreakers
sit under that, in order:

1. **Margin** — how far your correct picks beat their lines, added up. An over that hits is
   `wins - line`; an under that hits is `line - (17 - losses)`, the cushion already
   guaranteed. Both grow through the season and settle at `|final wins - line|`. Calling
   Miami's under 3.5 and watching them finish 2-15 is worth 1.5; scraping in at 3-14 is
   0.5. It rewards reading the season rather than reading the odds, and needs nothing from
   the players — it comes from the records entered below the leaderboard.
2. **Units** — what a $1 bet on each correct pick would have returned at that team's listed
   odds, so a correct +115 underdog call earns 1.15 against 0.71 for a -140 favorite.

Every line is a half-win, so no pick can push — each team resolves Over or Under.

A team is scored as soon as it is **mathematically settled**, not at season's end:

- the **over** hits the moment wins pass the line (11 wins beats 10.5)
- the **under** locks the moment enough losses make the line unreachable (8 losses caps a
  team at 9 wins, so a 10.5 line is dead)

Everything else shows as pending and counts for nobody, so the leaderboard is meaningful
from midseason on rather than sitting empty until January.

Records are entered under **Enter results** on the same tab: a W and an L per team.
Anyone can edit them — the same open trust model as picks — so agree among yourselves who
keeps them current. Count a tie as half a win.

## Team colors

Each pick card carries a left-to-right wash of that team's primary color at 12% alpha,
fading out at 65% across the card, over the card's white background. The colors live in
`TEAM_COLORS` in `docs/teams.js`; the gradient is built in `teamWash()` in `docs/app.js`.

Each card's border is the same color at 50% alpha.

The Over/Under buttons always show their arrow circle — green with an up arrow for over,
red with a down arrow for under. The pick is shown by strength rather than colour: an
unpicked button is dimmed and keeps a neutral border, while the picked one is full colour
and takes the team's color at 100% on its border (set inline in `renderPicks()`).

The arrows are inline SVG redrawn from Material Symbols Rounded `arrow_upward` /
`arrow_downward`, so the page loads no icon font.

The fade ends at the same color with zero alpha rather than the `transparent` keyword,
which some browsers interpolate through grey.

## Logos

Tapping a pick plays a pixel burst across the card, behind the text and buttons, using the
team's primary and secondary colours (`TEAM_COLORS` and `TEAM_SECONDARY` in
`docs/teams.js`). The Jets are green and white, so they have no secondary listed and fall
back to shades of the green — white squares on a white card would be invisible.

Team logos are loaded from ESPN's CDN (`a.espncdn.com/i/teamlogos/nfl/500/<slug>.png`),
derived from the team ids in `docs/teams.js` — no image files are stored in this repo.
ESPN's slug is the lowercase team id for every team except Washington, which they call
`wsh`; that one exception lives in `LOGO_SLUGS` in `docs/teams.js`.

If a logo fails to load, the app drops that image and the row renders without it, so
nothing breaks if those URLs ever change.

## Deploying a change (and the cache)

Push to `main` and GitHub Pages republishes within a minute or so. Browsers, though,
happily hold on to the old `app.js` — which shows up as a change that is definitely live
but that you cannot see.

To force everyone onto the new code, bump the `?v=` number in **three** places whenever
you deploy something visible:

- the `<script type="module" src="app.js?v=N">` tag in `docs/index.html`
- the two imports at the top of `docs/app.js` (`./teams.js?v=N`, `./config.js?v=N`)

They must match. A plain hard refresh (Ctrl/Cmd-Shift-R) also works for one person on one
device; the version bump is what fixes it for everybody.

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
| `supabase-schema.sql` | Database setup, safe to re-run in Supabase |
