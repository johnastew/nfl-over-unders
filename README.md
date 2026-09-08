# NFL Win Totals Over/Under

A dead-simple pick'em app for the 2026 NFL season. Everyone types their name, picks
**Over** or **Under** on all 32 team win totals, and can see a grid of everyone's picks.

Lines and odds are DraftKings numbers as of Sept. 3, 2026, as published by CBS Sports.

## Running it

```bash
npm install
npm start
```

Then open http://localhost:3000.

Picks are stored in a `picks.db` SQLite file next to `server.js` (created automatically
on first run, and git-ignored). Set `PORT` or `DB_PATH` to override the defaults.

For friends to join from their own devices, run it somewhere they can reach — your
machine on the same Wi-Fi (`http://<your-local-ip>:3000`), or any small host/VPS. Keep
`picks.db` around and everyone's picks survive restarts.

## A note on "login"

There is none, really. Typing a name finds or creates a user by that name
(case-insensitive), so anyone who can reach the app can open anyone's picks and change
them. That's fine for a group of friends; don't put anything sensitive in it.

## Updating the lines

All 32 teams, their win totals and odds live in `teams.js`. Edit that one file and
restart. Existing picks are keyed by team abbreviation, so they survive a line change.

## Layout

| File | Purpose |
|---|---|
| `server.js` | Express app and JSON API |
| `db.js` | SQLite schema and queries |
| `teams.js` | Teams, win totals, odds |
| `public/` | The frontend (plain HTML/CSS/JS, no build step) |
