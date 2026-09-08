const STORAGE_KEY = 'nflou.user';

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

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Something went wrong.');
  return body;
}

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
    await api('/api/picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, teamId, choice })
    });
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
    data = await api('/api/everyone');
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
  picks = await api(`/api/picks/${user.id}`);
  renderPicks();
  showView('picks');
}

el('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  showError(el('loginError'), '');
  const name = el('nameInput').value.trim();
  try {
    await enterApp(await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    }));
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
  teams = await api('/api/teams');
  const stored = loadStoredUser();
  if (!stored) return showView('login');
  try {
    picks = await api(`/api/picks/${stored.id}`);
    user = stored;
    renderPicks();
    showView('picks');
  } catch {
    storeUser(null);
    showView('login');
  }
})();
