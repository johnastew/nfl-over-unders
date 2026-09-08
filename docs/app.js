import { TEAMS, TEAM_IDS, teamLogoUrl, teamColor, teamSecondaryColor } from './teams.js?v=7';
import { playPixelBurst } from './pixel-fx.js?v=7';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js?v=7';

const STORAGE_KEY = 'nflou.user';
const MAX_NAME_LENGTH = 40;

// Everyone calls the same number of teams, and choosing which ones is part of the game.
const MAX_PICKS = 6;

// Picks lock at kickoff of the Wednesday opener: 8:20 PM ET on Sept 9, 2026.
// September is EDT (UTC-4), hence 00:20Z on the 10th.
// This constant only drives the UI. The lock that actually matters is the row level
// security policy in supabase-schema.sql, which refuses writes past this moment even
// if someone calls the API directly.
const PICKS_LOCK_AT = Date.parse('2026-09-10T00:20:00Z');

const picksLocked = () => Date.now() >= PICKS_LOCK_AT;

function lockLabel() {
  return new Date(PICKS_LOCK_AT).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

const el = (id) => document.getElementById(id);
const views = {
  login: el('loginView'),
  picks: el('picksView'),
  everyone: el('everyoneView'),
  standings: el('standingsView')
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
  let res;
  try {
    res = await fetch(`${REST}${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
  } catch {
    // fetch only rejects on a network-level failure, which reads as "Failed to fetch".
    throw new Error("Couldn't reach the picks database — check your connection and try again.");
  }
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
  try {
    await savePickRequest(userId, teamId, choice);
  } catch (error) {
    // The deadline is enforced by a row level security policy, so a late write comes
    // back as a policy violation rather than anything about time.
    if (error.status === 403 || /row-level security/i.test(error.message)) {
      throw new Error('Picks are locked — the season has started.');
    }
    throw error;
  }
}

async function savePickRequest(userId, teamId, choice) {
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

async function restRemovePick(userId, teamId) {
  try {
    await rest(
      `/picks?user_id=eq.${encodeURIComponent(userId)}&team_id=eq.${encodeURIComponent(teamId)}`,
      { method: 'DELETE' }
    );
  } catch (error) {
    if (error.status === 403 || /row-level security/i.test(error.message)) {
      throw new Error('Picks are locked — the season has started.');
    }
    throw error;
  }
}

async function restFetchUsers() {
  return (await rest('/users?select=id,name&order=created_at.asc,id.asc')) || [];
}

async function restFetchResults() {
  const rows = (await rest('/results?select=team_id,wins,losses')) || [];
  const out = {};
  for (const row of rows) out[row.team_id] = { wins: Number(row.wins), losses: Number(row.losses) };
  return out;
}

async function restSaveResult(teamId, wins, losses) {
  if (!TEAM_IDS.has(teamId)) throw new Error('Unknown team.');
  await rest('/results', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ team_id: teamId, wins, losses, updated_at: new Date().toISOString() })
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

async function localRemovePick(userId, teamId) {
  const store = readLocal();
  if (store.picks[userId]) delete store.picks[userId][teamId];
  writeLocal(store);
}

async function localFetchUsers() {
  return readLocal().users.map(({ id, name }) => ({ id, name }));
}

async function localFetchResults() {
  return readLocal().results || {};
}

async function localSaveResult(teamId, wins, losses) {
  if (!TEAM_IDS.has(teamId)) throw new Error('Unknown team.');
  const store = readLocal();
  (store.results ||= {})[teamId] = { wins, losses };
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
  ? {
      signIn: restSignIn,
      fetchUser: restFetchUser,
      fetchPicks: restFetchPicks,
      savePick: restSavePick,
      removePick: restRemovePick,
      fetchEveryone: restFetchEveryone,
      fetchUsers: restFetchUsers,
      fetchResults: restFetchResults,
      saveResult: restSaveResult
    }
  : {
      signIn: localSignIn,
      fetchUser: localFetchUser,
      fetchPicks: localFetchPicks,
      savePick: localSavePick,
      removePick: localRemovePick,
      fetchEveryone: localFetchEveryone,
      fetchUsers: localFetchUsers,
      fetchResults: localFetchResults,
      saveResult: localSaveResult
    };

// --- Scoring ---------------------------------------------------------------------
// Every line is a half-win, so no pick can push: a team's result is Over or Under, and
// it is known as soon as it is mathematically settled rather than at season's end.

const GAMES = 17;

// American odds -> profit on a 1 unit stake. +115 pays 1.15, -140 pays 0.71.
function unitsWon(americanOdds) {
  const n = Number(americanOdds);
  if (!Number.isFinite(n) || n === 0) return 0;
  return n > 0 ? n / 100 : 100 / Math.abs(n);
}

// 'over' | 'under' | null (not settled yet)
function outcomeFor(team, record) {
  if (!record) return null;
  const wins = Number(record.wins) || 0;
  const losses = Number(record.losses) || 0;
  if (wins > team.line) return 'over';
  if (GAMES - losses < team.line) return 'under';
  return null;
}

function buildStandings(users, picksByUser, results) {
  const settled = [];
  for (const team of teams) {
    const outcome = outcomeFor(team, results[team.id]);
    if (outcome) settled.push({ team, outcome });
  }

  const rows = users.map((person) => {
    const theirPicks = picksByUser[person.id] || {};
    let correct = 0;
    let wrong = 0;
    let units = 0;
    for (const { team, outcome } of settled) {
      const pick = theirPicks[team.id];
      if (!pick) continue;
      if (pick === outcome) {
        correct += 1;
        units += unitsWon(pick === 'over' ? team.overOdds : team.underOdds);
      } else {
        wrong += 1;
      }
    }
    return { name: person.name, correct, wrong, units, missing: settled.length - correct - wrong };
  });

  rows.sort((a, b) => b.correct - a.correct || b.units - a.units || a.name.localeCompare(b.name));
  return { rows, settledCount: settled.length };
}

function showView(name) {
  for (const [key, node] of Object.entries(views)) node.hidden = key !== name;
  el('appViews').hidden = name === 'login';
  el('who').hidden = !user;
  el('progress').hidden = name !== 'picks';
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
  const locked = picksLocked();
  el('lockBanner').hidden = !locked;
  el('lockNotice').hidden = locked;
  if (!locked) el('lockNotice').textContent = `Picks lock at kickoff — ${lockLabel()} ET.`;
  el('whoName').textContent = `Signed in as ${user.name}`;
  const picked = pickCount();
  const atLimit = picked >= MAX_PICKS;
  el('progress').textContent = `${picked} / ${MAX_PICKS} picks used`;
  el('pickHint').hidden = locked;
  el('pickHint').textContent = atLimit
    ? `That's all ${MAX_PICKS}. Tap one of your picks to remove it and free a slot.`
    : `Choose any ${MAX_PICKS} teams. Tap a pick again to remove it.`;

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
      row.dataset.team = team.id;
      row.style.backgroundImage = teamWash(team);
      row.style.borderColor = teamBorder(team);

      const info = document.createElement('div');
      info.className = 'team-info';
      const text = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'team-name';
      name.textContent = team.name;
      const line = document.createElement('div');
      line.className = 'team-line';
      line.textContent = `Win total ${team.line}`;
      text.append(name, line);
      info.append(logoImg(team, 30), text);

      const choices = document.createElement('div');
      choices.className = 'choices';
      for (const choice of ['over', 'under']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'choice';
        button.dataset.choice = choice;
        const isPick = picks[team.id] === choice;
        button.setAttribute('aria-pressed', String(isPick));
        button.disabled = locked || (atLimit && !picks[team.id]);
        if (isPick) button.style.borderColor = teamBorderSolid(team);
        const badge = document.createElement('span');
        badge.className = 'choice-badge';
        badge.innerHTML = arrowSvg(choice);

        const label = document.createElement('span');
        label.className = 'choice-label';
        label.innerHTML = `${choice === 'over' ? 'Over' : 'Under'} ${team.line}<small>${odds(choice === 'over' ? team.overOdds : team.underOdds).trim()}</small>`;

        button.append(badge, label);
        button.addEventListener('click', () => selectPick(team.id, choice));
        choices.appendChild(button);
      }

      row.append(info, choices);
      section.appendChild(row);
    }
    container.appendChild(section);
  }
}

function teamRgb(team) {
  const hex = teamColor(team.id).replace('#', '');
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

// A left-to-right wash of the team's color over the card's white background. The far
// end is the same color at zero alpha rather than `transparent`, which some browsers
// interpolate through grey.
function teamWash(team) {
  const [r, g, b] = teamRgb(team);
  return `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, 0.12) 0%, rgba(${r}, ${g}, ${b}, 0) 65%)`;
}

function teamBorder(team) {
  const [r, g, b] = teamRgb(team);
  return `rgba(${r}, ${g}, ${b}, 0.5)`;
}

function arrowSvg(choice) {
  const path = choice === 'over' ? 'M12 19V6M6 12l6-6 6 6' : 'M12 5v13M6 12l6 6 6-6';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
}

// The picked button's border: the team's color at full strength.
function teamBorderSolid(team) {
  const [r, g, b] = teamRgb(team);
  return `rgb(${r}, ${g}, ${b})`;
}

function logoImg(team, size) {
  const img = document.createElement('img');
  img.className = 'logo';
  img.src = teamLogoUrl(team.id);
  img.alt = '';
  img.width = size;
  img.height = size;
  img.loading = 'lazy';
  // If the logo can't load, drop it rather than showing a broken image.
  img.addEventListener('error', () => img.remove());
  return img;
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
  if (picksLocked()) return;
  const previous = picks[teamId];
  const removing = previous === choice;

  // Taking a new team needs a free slot; switching or removing one you already hold
  // never does.
  if (!removing && !previous && pickCount() >= MAX_PICKS) {
    showError(
      el('picksError'),
      `You've used all ${MAX_PICKS} picks — tap one of your picks to free a slot.`
    );
    return;
  }

  if (removing) delete picks[teamId];
  else picks[teamId] = choice;
  renderPicks();
  showError(el('picksError'), '');
  if (!removing) burst(teamId);

  try {
    if (removing) await backend.removePick(user.id, teamId);
    else await backend.savePick(user.id, teamId, choice);
  } catch (error) {
    if (previous) picks[teamId] = previous;
    else delete picks[teamId];
    renderPicks();
    showError(
      el('picksError'),
      `Could not ${removing ? 'remove' : 'save'} that pick: ${error.message}`
    );
  }
}

function pickCount() {
  return Object.keys(picks).length;
}

// renderPicks() rebuilds every row, so the card to animate is found after that re-render.
function burst(teamId) {
  const card = document.querySelector(`.team[data-team="${teamId}"]`);
  const team = teams.find((t) => t.id === teamId);
  if (card && team) playPixelBurst(card, [teamColor(team.id), teamSecondaryColor(team.id)]);
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
    const teamLabel = document.createElement('span');
    teamLabel.textContent = `${team.name} ${team.line}`;
    teamCell.append(logoImg(team, 20), teamLabel);
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

async function renderStandings() {
  const board = el('leaderboard');
  board.innerHTML = '<p class="empty">Loading…</p>';
  showError(el('resultsError'), '');

  let everyone;
  let results;
  try {
    [everyone, results] = await Promise.all([backend.fetchEveryone(), backend.fetchResults()]);
  } catch (error) {
    board.innerHTML = '';
    board.append(Object.assign(document.createElement('p'), {
      className: 'empty',
      textContent: `Could not load standings: ${error.message}`
    }));
    return;
  }

  renderResultsEditor(results);

  const { rows, settledCount } = buildStandings(everyone.users, everyone.picks, results);
  if (!rows.length) {
    board.innerHTML = '<p class="empty">Nobody has made any picks yet.</p>';
    return;
  }
  if (!settledCount) {
    board.innerHTML =
      '<p class="empty">No team has clinched its over or under yet. Add records under "Enter results" to start scoring.</p>';
    return;
  }

  const table = document.createElement('table');
  const head = document.createElement('tr');
  head.append(th('#'), th('Name', 'team-col'), th('Correct'), th('Wrong'), th('Units'));
  const thead = document.createElement('thead');
  thead.appendChild(head);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((row, index) => {
    // Anyone level with the person above shares their rank.
    const tied =
      index > 0 && rows[index - 1].correct === row.correct && rows[index - 1].units === row.units;
    const tr = document.createElement('tr');
    const rank = document.createElement('td');
    rank.textContent = tied ? '' : String(index + 1);
    const name = document.createElement('td');
    name.className = 'team-col';
    name.textContent = row.name;
    const correct = document.createElement('td');
    correct.className = 'pick-over';
    correct.textContent = String(row.correct);
    const wrong = document.createElement('td');
    wrong.className = 'pick-under';
    wrong.textContent = String(row.wrong);
    const units = document.createElement('td');
    units.className = 'tally';
    units.textContent = (row.units >= 0 ? '+' : '') + row.units.toFixed(2);
    tr.append(rank, name, correct, wrong, units);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const caption = document.createElement('caption');
  caption.className = 'muted';
  caption.textContent = `${settledCount} of ${teams.length} teams settled`;
  table.appendChild(caption);

  board.innerHTML = '';
  board.appendChild(table);
}

function renderResultsEditor(results) {
  const list = el('resultsList');
  list.innerHTML = '';

  for (const team of teams) {
    const record = results[team.id] || { wins: 0, losses: 0 };
    const outcome = outcomeFor(team, record);

    const row = document.createElement('div');
    row.className = 'result-row';

    const info = document.createElement('div');
    info.className = 'team-info';
    const text = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'team-name';
    name.textContent = team.name;
    const line = document.createElement('div');
    line.className = 'team-line';
    line.textContent = `Win total ${team.line}`;
    text.append(name, line);
    info.append(logoImg(team, 24), text);

    const status = document.createElement('span');
    status.className = `status ${outcome ? `pick-${outcome}` : 'pending'}`;
    status.textContent = outcome ? `${outcome === 'over' ? 'Over' : 'Under'} hit` : 'Pending';

    const fields = document.createElement('div');
    fields.className = 'record-fields';
    const inputs = {};
    for (const field of ['wins', 'losses']) {
      const label = document.createElement('label');
      label.className = 'record-field';
      label.append(document.createTextNode(field === 'wins' ? 'W' : 'L'));
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = String(GAMES);
      input.step = field === 'wins' ? '0.5' : '1';
      input.value = String(record[field] ?? 0);
      inputs[field] = input;
      label.appendChild(input);
      fields.appendChild(label);
    }

    const commit = async () => {
      const wins = Number(inputs.wins.value) || 0;
      const losses = Number(inputs.losses.value) || 0;
      showError(el('resultsError'), '');
      if (wins < 0 || losses < 0 || wins + losses > GAMES) {
        showError(
          el('resultsError'),
          `${team.name}: a record has to be between 0-0 and a total of ${GAMES} games.`
        );
        return;
      }
      try {
        await backend.saveResult(team.id, wins, losses);
        await renderStandings();
      } catch (error) {
        showError(el('resultsError'), `Could not save ${team.name}: ${error.message}`);
      }
    };
    inputs.wins.addEventListener('change', commit);
    inputs.losses.addEventListener('change', commit);

    row.append(info, status, fields);
    list.appendChild(row);
  }
}

function th(text, className) {
  const cell = document.createElement('th');
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

async function populateUserPicker() {
  const select = el('userSelect');
  let people = [];
  try {
    people = await backend.fetchUsers();
  } catch {
    // Not being able to list names is no reason to block signing in by typing one.
    el('returningBlock').hidden = true;
    return;
  }
  if (!people.length) {
    el('returningBlock').hidden = true;
    return;
  }
  select.length = 1;
  for (const person of people) {
    const option = document.createElement('option');
    option.value = String(person.id);
    option.textContent = person.name;
    select.appendChild(option);
  }
  select.value = '';
  el('returningBlock').hidden = false;
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

el('userSelect').addEventListener('change', async (event) => {
  const id = Number(event.target.value);
  if (!id) return;
  showError(el('loginError'), '');
  const name = event.target.selectedOptions[0].textContent;
  try {
    await enterApp({ id, name });
  } catch (error) {
    showError(el('loginError'), error.message);
    event.target.value = '';
  }
});

el('switchUser').addEventListener('click', () => {
  user = null;
  picks = {};
  storeUser(null);
  el('nameInput').value = '';
  showView('login');
  populateUserPicker();
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.view;
    showView(target);
    if (target === 'everyone') renderEveryone();
    if (target === 'standings') renderStandings();
  });
});

(async function init() {
  teams = TEAMS;
  if (!isConfigured) el('localBanner').hidden = false;
  const stored = loadStoredUser();
  if (!stored) {
    showView('login');
    return populateUserPicker();
  }
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
    populateUserPicker();
  }
})();
