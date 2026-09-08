const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'picks.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS picks (
    user_id INTEGER NOT NULL REFERENCES users(id),
    team_id TEXT NOT NULL,
    choice TEXT NOT NULL CHECK (choice IN ('over','under')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, team_id)
  );
`);

const statements = {
  findUser: db.prepare('SELECT id, name FROM users WHERE name_key = ?'),
  insertUser: db.prepare('INSERT INTO users (name, name_key, created_at) VALUES (?, ?, ?)'),
  getUser: db.prepare('SELECT id, name FROM users WHERE id = ?'),
  listUsers: db.prepare('SELECT id, name FROM users ORDER BY created_at, id'),
  picksForUser: db.prepare('SELECT team_id, choice FROM picks WHERE user_id = ?'),
  allPicks: db.prepare('SELECT user_id, team_id, choice FROM picks'),
  upsertPick: db.prepare(`
    INSERT INTO picks (user_id, team_id, choice, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, team_id) DO UPDATE SET choice = excluded.choice, updated_at = excluded.updated_at
  `)
};

function findOrCreateUser(name) {
  const nameKey = name.toLowerCase();
  const existing = statements.findUser.get(nameKey);
  if (existing) return existing;
  const info = statements.insertUser.run(name, nameKey, new Date().toISOString());
  return { id: info.lastInsertRowid, name };
}

function getUser(id) {
  return statements.getUser.get(id);
}

function listUsers() {
  return statements.listUsers.all();
}

function getPicks(userId) {
  const picks = {};
  for (const row of statements.picksForUser.all(userId)) picks[row.team_id] = row.choice;
  return picks;
}

function getAllPicks() {
  const byUser = {};
  for (const row of statements.allPicks.all()) {
    (byUser[row.user_id] ||= {})[row.team_id] = row.choice;
  }
  return byUser;
}

function savePick(userId, teamId, choice) {
  statements.upsertPick.run(userId, teamId, choice, new Date().toISOString());
}

module.exports = { db, findOrCreateUser, getUser, listUsers, getPicks, getAllPicks, savePick };
