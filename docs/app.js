import { TEAMS, TEAM_IDS } from './teams.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js';

const STORAGE_KEY = 'nflou.user';
const MAX_NAME_LENGTH = 40;

const el = (id) => document.getElementById(id);
const views = {
  login: el('loginView'),
  picks: el('picksView'),
  everyone: el('everyoneView')
};

let user = null;
let teams = [];
let picks = {};

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Number.isInteger(parsed?.id) && parsed.name ? parsed : null;
  } catch {
    return null;
  }
}

function storeUser(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode — the session still works, it just won't be remembered */
  }
}

// --- Backend A: Supabase (PostgREST) ------------------------------------------------
// Supabase's REST API is plain HTTP, so this talks to it with fetch rather than pulling
// in the JS SDK: one fewer dependency, and nothing to load from a CDN.

const REST = `${SUPABASE_URL}/rest/v1`;

function cleanName(rawName) {
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Please enter a name.');
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }
  return name;
}

async function rest(path, options = {}) {
  const res = await fetch(`${REST}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.message || `Request failed (${res.status}).`);
    error.status = res.status;
    throw error;
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

async function restSignIn(rawName) {
  const name = cleanName(rawName);
  const nameKey = name.toLowerCase();
  const query = `/users?select=id,name&name_key=eq.${encodeURIComponent(nameKey)}`;

  const [existing] = (await rest(query)) || [];
  if (existing) return existing;

  try {
    const [created] = await rest('/users', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name, name_key: nameKey })
    });
    return created;
  } catch (error) {
    // Someone signed in with the same name at the same moment and the unique index on
    // name_key won the race — read back the row they created.
    if (error.status !== 409) throw error;
    const [raced] = (await rest(query)) || [];
    if (raced) return raced;
    throw error;
  }
}

async function restFetchUser(userId) {
  const [found] = (await rest(`/users?select=id,name&id=eq.${encodeURIComponent(userId)}`)) || [];
  return found || null;
}

async function restFetchPicks(userId) {
  const rows =
    (await rest(`/picks?select=team_id,choice&user_id=eq.${encodeURIComponent(userId)}`)) || [];
  const result = {};
  for (const row of rows) result[row.team_id] = row.choice;
  return result;
}

async function restSavePick(userId, teamId, choice) {
  if (!TEAM_IDS.has(teamId)) throw new Error('Unknown team.');
  if (choice !== 'over' && choice !== 'under') throw new Error('Pick must be over or under.');
  await rest('/picks', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      team_id: teamId,
      choice,
      updated_at: new Date().toISOString()
    })
  });
}

async function restFetchEveryone() {
  const [users, rows] = await Promise.all([
    rest('/users?select=id,name&order=created_at.asc,id.asc'),
    rest('/picks?select=user_id,team_id,choice')
  ]);

  const picksByUser = {};
  const counts = {};
  for (const team of teams) counts[team.id] = { over: 0, under: 0 };
  for (const row of rows || []) {
    (picksByUser[row.user_id] ||= {})[row.team_id] = row.choice;
    if (counts[row.team_id]) counts[row.team_id][row.choice] += 1;
  }
  return { users: users || [], picks: picksByUser, counts };
}

// --- Backend B: this browser only -----------------------------------------------
// Used until docs/config.js points at a real Supabase project, so the site is usable
// (and shareable-looking) straight away. Picks live in localStorage, which means they
// are visible only on this device and to this browser.

const LOCAL_KEY = 'nflou.local';

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { users: [], picks: {}, nextId: 1 };
  } catch {
    return { users: [], picks: {}, nextId: 1 };
  }
}

function writeLocal(store) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
  } catch {
    /* private mode — nothing to persist to */
  }
}

async function localSignIn(rawName) {
  const name = cleanName(rawName);
  const nameKey = name.toLowerCase();
  const store = readLocal();
  const existing = store.users.find((u) => u.name_key === nameKey);
  if (existing) return { id: existing.id, name: existing.name };
  const created = { id: store.nextId++, name, name_key: nameKey };
  store.users.push(created);
  writeLocal(store);
  return { id: created.id, name: created.name };
}

async function localFetchUser(userId) {
  const found = readLocal().users.find((u) => u.id === userId);
  return found ? { id: found.id, name: found.name } : null;
}

async function localFetchPicks(userId) {
  return readLocal().picks[userId] || {};
}

async function localSavePick(userId, teamId, choice) {
  if (!TEAM_IDS.has(teamId)) throw new Error('Unknown team.');
  if (choice !== 'over' && choice !== 'under') throw new Error('Pick must be over or under.');
  const store = readLocal();
  (store.picks[userId] ||= {})[teamId] = choice;
  writeLocal(store);
}

async function localFetchEveryone() {
  const store = readLocal();
  const counts = {};
  for (const team of teams) counts[team.id] = { over: 0, under: 0 };
  for (const byTeam of Object.values(store.picks)) {
    for (const [teamId, choice] of Object.entries(byTeam)) {
      if (counts[teamId]) counts[teamId][choice] += 1;
    }
  }
  return {
    users: store.users.map(({ id, name }) => ({ id, name })),
    picks: store.picks,
    counts
  };
}

const backend = isConfigured
  ? { signIn: restSignIn, fetchUser: restFetchUser, fetchPicks: restFetchPicks, savePick: restSavePick, fetchEveryone: restFetchEveryone }
  : { signIn: localSignIn, fetchUser: localFetchUser, fetchPicks: localFetchPicks, savePick: localSavePick, fetchEveryone: localFetchEveryone };

function showView(name) {
  for (const [key, node] of Object.entries(views)) node.hidden = key !== name;
  el('who').hidden = !user;
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === name);
  });
}

function showError(node, message) {
  node.textContent = message || '';
  node.hidden = !message;
}

function odds(value) {
  return value ? ` (${value})` : '';
}

function renderPicks() {
  el('whoName').textContent = `Signed in as ${user.name}`;
  const picked = teams.filter((team) => picks[team.id]).length;
  el('progress').textContent = `${picked} / ${teams.length} picked`;

  const container = el('teamList');
  container.innerHTML = '';

  for (const [division, divisionTeams] of groupByDivision(teams)) {
    const section = document.createElement('div');
    section.className = 'division';
    const heading = document.createElement('p');
    heading.className = 'division-name';
    heading.textContent = division;
    section.appendChild(heading);

    for (const team of divisionTeams) {
      const row = document.createElement('div');
      row.className = 'team';

      const info = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'team-name';
      name.textContent = team.name;
      const line = document.createElement('div');
      line.className = 'team-line';
      line.textContent = `Win total ${team.line}`;
      info.append(name, line);

      const choices = document.createElement('div');
      choices.className = 'choices';
      for (const choice of ['over', 'under']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'choice';
        button.dataset.choice = choice;
        button.setAttribute('aria-pressed', String(picks[team.id] === choice));
        const label = choice === 'over' ? 'Over' : 'Under';
        button.innerHTML = `${label} ${team.line}<small>${odds(choice === 'over' ? team.overOdds : team.underOdds).trim()}</small>`;
        button.addEventListener('click', () => selectPick(team.id, choice));
        choices.appendChild(button);
      }

      row.append(info, choices);
      section.appendChild(row);
    }
    container.appendChild(section);
  }
}

function groupByDivision(list) {
  const groups = new Map();
  for (const team of list) {
    const key = `${team.conference} ${team.division}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(team);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

async function selectPick(teamId, choice) {
  const previous = picks[teamId];
  if (previous === choice) return;
  picks[teamId] = choice;
  renderPicks();
  showError(el('picksError'), '');
  try {
    await backend.savePick(user.id, teamId, choice);
  } catch (error) {
    if (previous) picks[teamId] = previous;
    else delete picks[teamId];
    renderPicks();
    showError(el('picksError'), `Could not save that pick: ${error.message}`);
  }
}

async function renderEveryone() {
  const container = el('everyoneTable');
  container.innerHTML = '<p class="empty">Loading…</p>';
  let data;
  try {
    data = await backend.fetchEveryone();
  } catch (error) {
    container.innerHTML = '';
    container.appendChild(Object.assign(document.createElement('p'), {
      className: 'empty',
      textContent: `Could not load picks: ${error.message}`
    }));
    return;
  }

  if (!data.users.length) {
    container.innerHTML = '<p class="empty">Nobody has made any picks yet.</p>';
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(th('Team', 'team-col'));
  for (const person of data.users) headRow.appendChild(th(person.name));
  headRow.appendChild(th('O / U'));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const team of teams) {
    const row = document.createElement('tr');
    const teamCell = document.createElement('td');
    teamCell.className = 'team-col';
    teamCell.textContent = `${team.name} ${team.line}`;
    row.appendChild(teamCell);

    for (const person of data.users) {
      const choice = data.picks[person.id]?.[team.id];
      const cell = document.createElement('td');
      cell.className = choice ? `pick-${choice}` : 'pick-none';
      cell.textContent = choice === 'over' ? 'O' : choice === 'under' ? 'U' : '–';
      row.appendChild(cell);
    }

    const count = data.counts[team.id] || { over: 0, under: 0 };
    const tally = document.createElement('td');
    tally.className = 'tally';
    tally.textContent = `${count.over} / ${count.under}`;
    row.appendChild(tally);

    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  container.innerHTML = '';
  container.appendChild(table);
}

function th(text, className) {
  const cell = document.createElement('th');
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

async function enterApp(nextUser) {
  user = nextUser;
  storeUser(user);
  picks = await backend.fetchPicks(user.id);
  renderPicks();
  showView('picks');
}

el('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  showError(el('loginError'), '');
  const name = el('nameInput').value;
  try {
    await enterApp(await backend.signIn(name));
  } catch (error) {
    showError(el('loginError'), error.message);
  }
});

el('switchUser').addEventListener('click', () => {
  user = null;
  picks = {};
  storeUser(null);
  el('nameInput').value = '';
  showView('login');
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.view;
    showView(target);
    if (target === 'everyone') renderEveryone();
  });
});

(async function init() {
  teams = TEAMS;
  if (!isConfigured) el('localBanner').hidden = false;
  const stored = loadStoredUser();
  if (!stored) return showView('login');
  try {
    // Confirm the remembered account still exists (the table may have been reset).
    const confirmed = await backend.fetchUser(stored.id);
    if (!confirmed) throw new Error('Unknown user.');
    picks = await backend.fetchPicks(confirmed.id);
    user = confirmed;
    renderPicks();
    showView('picks');
  } catch {
    storeUser(null);
    showView('login');
  }
})();
