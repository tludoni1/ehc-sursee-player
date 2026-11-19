// Discovers the current SIHF league and phase IDs from real match results.
// It updates mappings only after verifying matching team results and statistics.
// Historical season mappings are preserved unchanged.
import fs from "node:fs";

export const TEAM_CANDIDATES = {
  "Senioren": [37, 36, 35, 33, 39, 40, 41],
  "1 Mannschaft": [10, 18, 19],
  "2 Mannschaft": [19, 18, 10],
  "Damen": [43, 101, 104]
};

const API = "https://data.sihf.ch/statistic/api/cms/table";
const asString = value => String(value);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function makeTableUrl(alias, season, league, phase = "all") {
  const url = new URL(API);
  url.searchParams.set("alias", alias);
  url.searchParams.set("searchQuery", `1//${league}`);
  url.searchParams.set("filterBy", alias === "results" ? "Season,Phase,Date" : "Season,Phase");
  const date = `01.07.${season-1}-30.06.${season}`;
  url.searchParams.set("filterQuery", alias === "results" ? `${season}/${phase}/${date}` : `${season}/${phase}`);
  url.searchParams.set("language", "de");
  return url.toString();
}

export function verifyTable(body, alias, season, phase, league) {
  if (!body || !Array.isArray(body.data)) throw new Error(`Invalid ${alias} table for league ${league}`);
  for (const [field, desired] of [["Season", season], ["Phase", phase]]) {
    const entry = body.filters?.find(f => f.alias === field);
    if (!entry || asString(entry.selected) !== asString(desired)) {
      throw new Error(`Wrong SIHF ${field} echo: ${entry?.selected}; requested ${desired}`);
    }
  }
  if (typeof body.pages === "number" && body.pages !== body.data.length) {
    throw new Error(`Incomplete ${alias} table for league ${league}: ${body.data.length}/${body.pages}`);
  }
  return body;
}

async function getTable(alias, season, league, phase) {
  let error;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(makeTableUrl(alias, season, league, phase), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error(`SIHF HTTP ${response.status}`);
      return verifyTable(await response.json(), alias, season, phase, league);
    } catch (e) {
      error = e;
      if (attempt < 2) await sleep((attempt + 1) * 1000);
    }
  }
  throw error;
}

export function matchesTeam(row, teamId) {
  return Array.isArray(row) && row.some(cell =>
    cell && typeof cell === "object" && cell.id != null && asString(cell.id) === asString(teamId)
  );
}

export function nextSeasonEntries(season, matches) {
  const sorted = [...matches].sort((a, b) =>
    Number(!/regular/i.test(a.phase)) - Number(!/regular/i.test(b.phase))
    || a.phase.localeCompare(b.phase)
  );
  const entries = {};
  const filenames = new Set();
  sorted.forEach((match, index) => {
    const key = index === 0 ? asString(season) : `${season}-P${index}`;
    const safeName = match.phase.replace(/\s+/g, "-").replace(/\//g, "-").replace(/[^\w\-]/g, "");
    if (!safeName || filenames.has(safeName)) throw new Error("Duplicate/invalid SIHF phase filename");
    filenames.add(safeName);
    entries[key] = {
      leagueId: match.leagueId,
      teamId: match.teamId,
      region: "all",
      group: match.phaseId,
      phase: match.phase,
      phaseId: match.phaseId,
      api: "table"
    };
  });
  return entries;
}

async function discoverOne(team, season, previous) {
  const existing = Object.values(previous).filter(entry => entry.leagueId != null && entry.teamId != null);
  if (!existing.length) throw new Error(`No historical IDs for ${team}`);
  const teamIds = [...new Set(existing.map(e => Number(e.teamId)))];
  if (teamIds.length !== 1) throw new Error(`Ambiguous historical Team IDs for ${team}; review manually`);
  const teamId = teamIds[0];
  const ordered = [...new Set([
    ...existing.sort((a, b) => Number(b.phaseId != null) - Number(a.phaseId != null)).map(e => e.leagueId),
    ...TEAM_CANDIDATES[team]
  ])];
  const found = [];
  for (const leagueId of ordered) {
    let base;
    try { base = await getTable("results", season, leagueId, "all"); }
    catch (err) {
      console.warn(`Skipped unavailable ${team} league ${leagueId}: ${err.message}`);
      continue;
    }
    const options = base.filters?.find(f => f.alias === "Phase")?.entries || [];
    for (const option of options) {
      if (asString(option.alias) === "all") continue;
      const phaseId = Number(option.alias);
      if (!Number.isSafeInteger(phaseId)) continue;
      const phase = String(option.name || "");
      const results = await getTable("results", season, leagueId, phaseId);
      if (!results.data.some(row => matchesTeam(row, teamId))) continue;
      const players = await getTable("player", season, leagueId, phaseId);
      const skaters = players.data.filter(row => row[2] && asString(row[2].id) === asString(teamId));
      // A phase with games but no player statistics is not a successful import.
      if (!skaters.length) throw new Error(`No player statistics for ${team} phase ${phaseId}`);
      found.push({ leagueId, teamId, phaseId, phase });
      console.log(`Verified ${team}, season ${season}, league ${leagueId}, phase ${phaseId} (${phase}): ${skaters.length} rows`);
    }
    // The team is assigned to one league at a time; process all its phases.
    if (found.length) break;
  }
  if (!found.length) throw new Error(`No verified competition and phase for ${team} in ${season}`);
  return nextSeasonEntries(season, found);
}

export async function discoverSeason(season, source) {
  if (!Number.isInteger(season) || season < 2027) throw new Error("Expected season end-year >= 2027");
  const mappings = structuredClone(source);
  for (const team of Object.keys(TEAM_CANDIDATES)) {
    if (!mappings[team]) throw new Error(`Missing team ${team}`);
    const discovered = await discoverOne(team, season, mappings[team]);
    // Preserve all historical entries. Replace only this season after full verification.
    for (const key of Object.keys(mappings[team])) {
      if (key === String(season) || key.startsWith(`${season}-`)) delete mappings[team][key];
    }
    Object.assign(mappings[team], discovered);
  }
  return mappings;
}

if (process.argv[1]?.endsWith("discover-current-season.js")) {
  const now = new Date();
  const season = process.argv[2] ? Number(process.argv[2])
    : now.getUTCFullYear() + (now.getUTCMonth() >= 7 ? 1 : 0);
  const file = "data/mappings.json";
  try {
    const result = await discoverSeason(season, JSON.parse(fs.readFileSync(file, "utf8")));
    // Write only once after all four teams have passed; no partial mappings.
    fs.writeFileSync(file, JSON.stringify(result, null, 2) + "\n");
    const current = Object.fromEntries(Object.entries(result).map(([team, entries]) =>
      [team, Object.fromEntries(Object.entries(entries).filter(([key]) =>
        key === String(season) || key.startsWith(`${season}-`)))])
    );
    fs.writeFileSync(`data/mappings_${season}.json`, JSON.stringify(current, null, 2) + "\n");
    console.log(`Season ${season} verified for all four teams`);
  } catch (error) {
    console.error("SIHF discovery failed; historical mappings preserved:", error.message);
    process.exitCode = 1;
  }
}
