// The article page: everyone's blurbs, laid out as one long read.
//
// It loads its own data rather than sharing app.js, because it is a standalone page
// opened in a new tab — no sign-in, no picking, nothing to write back. The two backends
// mirror app.js's: Supabase when docs/config.js points at a project, this browser's
// localStorage when it doesn't.

import { TEAMS, teamLogoUrl, teamColor } from './teams.js?v=12';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config.js?v=12';

const REST = `${SUPABASE_URL}/rest/v1`;

async function rest(path) {
  const res = await fetch(`${REST}${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return (await res.json()) || [];
}

async function loadRemote() {
  const [users, picks, notes] = await Promise.all([
    rest('/users?select=id,name&order=created_at.asc,id.asc'),
    rest('/picks?select=user_id,team_id,choice'),
    rest('/notes?select=user_id,team_id,body')
  ]);
  return { users, picks, notes };
}

function loadLocal() {
  let store;
  try {
    store = JSON.parse(localStorage.getItem('nflou.local')) || {};
  } catch {
    store = {};
  }
  const picks = [];
  for (const [userId, byTeam] of Object.entries(store.picks || {})) {
    for (const [teamId, choice] of Object.entries(byTeam)) {
      picks.push({ user_id: Number(userId), team_id: teamId, choice });
    }
  }
  const notes = [];
  for (const [userId, byTeam] of Object.entries(store.notes || {})) {
    for (const [teamId, body] of Object.entries(byTeam)) {
      notes.push({ user_id: Number(userId), team_id: teamId, body });
    }
  }
  return { users: (store.users || []).map(({ id, name }) => ({ id, name })), picks, notes };
}

const teamsById = new Map(TEAMS.map((team) => [team.id, team]));
const el = (id) => document.getElementById(id);

// One writer's section: only the picks they actually wrote about, in the order the
// teams appear in TEAMS so every section reads the same way.
function writerSection(writer) {
  const section = document.createElement('section');
  section.className = 'writer';

  const head = document.createElement('div');
  head.className = 'writer-head';
  const name = document.createElement('h2');
  name.textContent = writer.name;
  const line = document.createElement('p');
  line.className = 'writer-line';
  const overs = writer.entries.filter((e) => e.choice === 'over').length;
  const unders = writer.entries.length - overs;
  line.textContent = `${writer.entries.length} of ${writer.pickCount} picks explained · ${overs} over, ${unders} under`;
  head.append(name, line);
  section.appendChild(head);

  for (const entry of writer.entries) {
    const team = entry.team;
    const item = document.createElement('article');
    item.className = 'entry';
    item.style.setProperty('--team', teamColor(team.id));

    const header = document.createElement('h3');
    header.className = 'entry-head';
    const logo = document.createElement('img');
    logo.className = 'entry-logo';
    logo.src = teamLogoUrl(team.id);
    logo.alt = '';
    logo.width = 34;
    logo.height = 34;
    logo.loading = 'lazy';
    logo.addEventListener('error', () => logo.remove());

    const text = document.createElement('span');
    const teamName = document.createElement('span');
    teamName.className = 'entry-team';
    teamName.textContent = team.name;
    const call = document.createElement('span');
    call.className = `entry-call ${entry.choice}`;
    const odds = entry.choice === 'over' ? team.overOdds : team.underOdds;
    call.textContent = `${entry.choice === 'over' ? 'Over' : 'Under'} ${team.line}${odds ? ` (${odds})` : ''}`;
    text.append(teamName, document.createTextNode(' '), call);
    header.append(logo, text);
    item.appendChild(header);

    // Blank lines in the textarea become paragraphs; single newlines are just wrapping.
    for (const para of entry.body.split(/\n\s*\n/)) {
      const p = document.createElement('p');
      p.textContent = para.replace(/\s*\n\s*/g, ' ').trim();
      if (p.textContent) item.appendChild(p);
    }
    section.appendChild(item);
  }

  const silent = writer.pickCount - writer.entries.length;
  if (silent > 0) {
    const note = document.createElement('p');
    note.className = 'writer-silent';
    note.textContent = `${cap(spell(silent))} more ${silent === 1 ? 'pick' : 'picks'} left without comment.`;
    section.appendChild(note);
  }
  return section;
}

// The opening paragraph, written from the picks themselves: whichever call the room
// agreed on hardest is the most interesting thing to lead with.
function cap(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function ledeText(writers, entryCount) {
  const tally = new Map();
  for (const writer of writers) {
    for (const entry of writer.entries) {
      const key = `${entry.team.id}:${entry.choice}`;
      tally.set(key, (tally.get(key) || 0) + 1);
    }
  }
  let best = null;
  for (const [key, count] of tally) {
    if (!best || count > best.count) best = { key, count };
  }

  const people = writers.length === 1 ? 'One of us' : `${cap(spell(writers.length))} of us`;
  const opening =
    `${people} took six teams and a side, and then had to say why. ` +
    `What follows is ${spell(entryCount)} ${entryCount === 1 ? 'call' : 'calls'}, argued in their own words.`;
  if (!best || best.count < 2) return opening;

  const [teamId, choice] = best.key.split(':');
  const team = teamsById.get(teamId);
  return (
    `${opening} The room is most united on the ${team.name}: ${spell(best.count)} of us went ` +
    `${choice} ${team.line}, for reasons that do not always agree.`
  );
}

function render(data) {
  const notesByUser = new Map();
  for (const row of data.notes) {
    if (!row.body || !row.body.trim()) continue;
    if (!notesByUser.has(row.user_id)) notesByUser.set(row.user_id, new Map());
    notesByUser.get(row.user_id).set(row.team_id, row.body.trim());
  }
  const picksByUser = new Map();
  for (const row of data.picks) {
    if (!picksByUser.has(row.user_id)) picksByUser.set(row.user_id, new Map());
    picksByUser.get(row.user_id).set(row.team_id, row.choice);
  }

  const writers = [];
  for (const person of data.users) {
    const theirPicks = picksByUser.get(person.id) || new Map();
    const theirNotes = notesByUser.get(person.id) || new Map();
    const entries = [];
    for (const team of TEAMS) {
      const choice = theirPicks.get(team.id);
      const body = theirNotes.get(team.id);
      // A blurb only runs if the pick behind it is still standing.
      if (choice && body) entries.push({ team, choice, body });
    }
    if (entries.length) {
      writers.push({ name: person.name, entries, pickCount: theirPicks.size });
    }
  }

  const body = el('article');
  body.innerHTML = '';

  if (!writers.length) {
    el('dek').textContent = 'Nothing written yet.';
    el('byline').hidden = true;
    body.appendChild(Object.assign(document.createElement('p'), {
      className: 'empty',
      textContent:
        'Nobody has explained a pick yet. Head back to the picks page and write a blurb ' +
        'under one of your six — this page fills itself in from those.'
    }));
    return;
  }

  const entryCount = writers.reduce((sum, w) => sum + w.entries.length, 0);
  el('dek').textContent =
    `Six teams each, one side apiece, and the arguments behind ${spell(entryCount)} of them.`;
  el('byline').textContent = `By ${listNames(writers.map((w) => w.name))}`;

  const lede = document.createElement('p');
  lede.className = 'lede';
  lede.textContent = ledeText(writers, entryCount);
  body.appendChild(lede);

  for (const writer of writers) body.appendChild(writerSection(writer));
}

// Prose spells out the small numbers; the sans-serif stat lines keep their numerals.
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
function spell(n) {
  return n < WORDS.length ? WORDS[n] : String(n);
}

function listNames(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

el('published').textContent = new Date().toLocaleDateString('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric'
});

(async function init() {
  try {
    render(isConfigured ? await loadRemote() : loadLocal());
  } catch (error) {
    el('dek').textContent = '';
    el('byline').hidden = true;
    el('article').innerHTML = '';
    el('article').appendChild(Object.assign(document.createElement('p'), {
      className: 'empty',
      textContent: `Could not load the picks: ${error.message}`
    }));
  }
})();
