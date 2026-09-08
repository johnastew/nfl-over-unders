// 2026 NFL win totals. Lines and odds from DraftKings as of Sept. 3, 2026,
// as published by CBS Sports. Odds are display-only.
export const TEAMS = [
  { id: 'ARI', name: 'Arizona Cardinals',     conference: 'NFC', division: 'West',  line: 3.5,  overOdds: '-136', underOdds: '+115' },
  { id: 'ATL', name: 'Atlanta Falcons',       conference: 'NFC', division: 'South', line: 7.5,  overOdds: '+120', underOdds: '-140' },
  { id: 'BAL', name: 'Baltimore Ravens',      conference: 'AFC', division: 'North', line: 11.5, overOdds: '+115', underOdds: '-140' },
  { id: 'BUF', name: 'Buffalo Bills',         conference: 'AFC', division: 'East',  line: 10.5, overOdds: '-120', underOdds: '+100' },
  { id: 'CAR', name: 'Carolina Panthers',     conference: 'NFC', division: 'South', line: 7.5,  overOdds: '+115', underOdds: '-136' },
  { id: 'CHI', name: 'Chicago Bears',         conference: 'NFC', division: 'North', line: 9.5,  overOdds: '+105', underOdds: '-125' },
  { id: 'CIN', name: 'Cincinnati Bengals',    conference: 'AFC', division: 'North', line: 10.5, overOdds: '+115', underOdds: '-140' },
  { id: 'CLE', name: 'Cleveland Browns',      conference: 'AFC', division: 'North', line: 5.5,  overOdds: '-125', underOdds: '+105' },
  { id: 'DAL', name: 'Dallas Cowboys',        conference: 'NFC', division: 'East',  line: 9.5,  overOdds: '+100', underOdds: '-120' },
  { id: 'DEN', name: 'Denver Broncos',        conference: 'AFC', division: 'West',  line: 9.5,  overOdds: '-115', underOdds: '-105' },
  { id: 'DET', name: 'Detroit Lions',         conference: 'NFC', division: 'North', line: 10.5, overOdds: '-115', underOdds: '-105' },
  { id: 'GB',  name: 'Green Bay Packers',     conference: 'NFC', division: 'North', line: 9.5,  overOdds: '-130', underOdds: '+110' },
  { id: 'HOU', name: 'Houston Texans',        conference: 'AFC', division: 'South', line: 9.5,  overOdds: '-146', underOdds: '+124' },
  { id: 'IND', name: 'Indianapolis Colts',    conference: 'AFC', division: 'South', line: 7.5,  overOdds: '-140', underOdds: '+115' },
  { id: 'JAX', name: 'Jacksonville Jaguars',  conference: 'AFC', division: 'South', line: 8.5,  overOdds: '-140', underOdds: '+116' },
  { id: 'KC',  name: 'Kansas City Chiefs',    conference: 'AFC', division: 'West',  line: 10.5, overOdds: '+115', underOdds: '-140' },
  { id: 'LV',  name: 'Las Vegas Raiders',     conference: 'AFC', division: 'West',  line: 5.5,  overOdds: '-150', underOdds: '+125' },
  { id: 'LAC', name: 'Los Angeles Chargers',  conference: 'AFC', division: 'West',  line: 9.5,  overOdds: '-140', underOdds: '+115' },
  { id: 'LAR', name: 'Los Angeles Rams',      conference: 'NFC', division: 'West',  line: 11.5, overOdds: '-130', underOdds: '+110' },
  { id: 'MIA', name: 'Miami Dolphins',        conference: 'AFC', division: 'East',  line: 3.5,  overOdds: '-140', underOdds: '+110' },
  { id: 'MIN', name: 'Minnesota Vikings',     conference: 'NFC', division: 'North', line: 8.5,  overOdds: '-120', underOdds: '+100' },
  { id: 'NE',  name: 'New England Patriots',  conference: 'AFC', division: 'East',  line: 10.5, overOdds: '+115', underOdds: '-140' },
  { id: 'NO',  name: 'New Orleans Saints',    conference: 'NFC', division: 'South', line: 7.5,  overOdds: '-120', underOdds: '+100' },
  { id: 'NYG', name: 'New York Giants',       conference: 'NFC', division: 'East',  line: 7.5,  overOdds: '-110', underOdds: '-110' },
  { id: 'NYJ', name: 'New York Jets',         conference: 'AFC', division: 'East',  line: 5.5,  overOdds: '-115', underOdds: '-105' },
  { id: 'PHI', name: 'Philadelphia Eagles',   conference: 'NFC', division: 'East',  line: 10.5, overOdds: '+115', underOdds: '-140' },
  { id: 'PIT', name: 'Pittsburgh Steelers',   conference: 'AFC', division: 'North', line: 8.5,  overOdds: '+110', underOdds: '-130' },
  { id: 'SF',  name: 'San Francisco 49ers',   conference: 'NFC', division: 'West',  line: 9.5,  overOdds: '-146', underOdds: '+120' },
  { id: 'SEA', name: 'Seattle Seahawks',      conference: 'NFC', division: 'West',  line: 10.5, overOdds: '-115', underOdds: '-105' },
  { id: 'TB',  name: 'Tampa Bay Buccaneers',  conference: 'NFC', division: 'South', line: 8.5,  overOdds: '+115', underOdds: '-136' },
  { id: 'TEN', name: 'Tennessee Titans',      conference: 'AFC', division: 'South', line: 6.5,  overOdds: '+100', underOdds: '-120' },
  { id: 'WAS', name: 'Washington Commanders', conference: 'NFC', division: 'East',  line: 7.5,  overOdds: '+105', underOdds: '-125' }
];

export const TEAM_IDS = new Set(TEAMS.map((t) => t.id));

// ESPN serves a logo per team at a predictable URL. Their slug is the lowercase team id
// for all but Washington, which they call "wsh".
const LOGO_SLUGS = { WAS: 'wsh' };

export function teamLogoUrl(teamId) {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${LOGO_SLUGS[teamId] || teamId.toLowerCase()}.png`;
}
