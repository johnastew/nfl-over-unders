const path = require('path');
const express = require('express');
const { TEAMS, TEAM_IDS } = require('./teams');
const store = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const MAX_NAME_LENGTH = 40;

app.post('/api/login', (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim().replace(/\s+/g, ' ') : '';
  if (!name) return res.status(400).json({ error: 'Please enter a name.' });
  if (name.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` });
  }
  res.json(store.findOrCreateUser(name));
});

app.get('/api/teams', (_req, res) => {
  res.json(TEAMS);
});

app.get('/api/picks/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || !store.getUser(userId)) {
    return res.status(404).json({ error: 'Unknown user.' });
  }
  res.json(store.getPicks(userId));
});

app.post('/api/picks', (req, res) => {
  const { userId, teamId, choice } = req.body;
  if (!Number.isInteger(userId) || !store.getUser(userId)) {
    return res.status(400).json({ error: 'Unknown user.' });
  }
  if (typeof teamId !== 'string' || !TEAM_IDS.has(teamId)) {
    return res.status(400).json({ error: 'Unknown team.' });
  }
  if (choice !== 'over' && choice !== 'under') {
    return res.status(400).json({ error: 'Pick must be over or under.' });
  }
  store.savePick(userId, teamId, choice);
  res.json({ ok: true });
});

app.get('/api/everyone', (_req, res) => {
  const users = store.listUsers();
  const picks = store.getAllPicks();
  const counts = {};
  for (const team of TEAMS) counts[team.id] = { over: 0, under: 0 };
  for (const user of users) {
    for (const [teamId, choice] of Object.entries(picks[user.id] || {})) {
      if (counts[teamId]) counts[teamId][choice] += 1;
    }
  }
  res.json({ users, picks, counts });
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`NFL over/unders running at http://localhost:${port}`));
}

module.exports = app;
