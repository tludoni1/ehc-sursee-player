import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const TEAMS = {
  senioren: { leagueId: 37, teamId: 105810, name: "Senioren D" },
  erste:    { leagueId: 10, teamId: 103941, name: "1. Mannschaft" },
  damen:    { leagueId: 43, teamId: 103700, name: "Damen" },
  zweite:   { leagueId: 19, teamId: 104319, name: "2. Mannschaft" }
};

const SEASONS = [2022, 2023, 2024, 2025];
const BASE_URL = "https://data.sihf.ch/Statistic/api/cms/cache300";
const MAPPING_FILE = path.join("data", "mappings.json");

function stripAnyJsonCallback(text) {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  if (start !== -1 && end !== -1) {
    return text.substring(start + 1, end);
  }
  return text;
}

async function fetchJson(url) {
  const cacheBuster = `v=${Date.now()}`;
  const fullUrl = url + (url.includes("?") ? "&" : "?") + cacheBuster;

  const res = await fetch(fullUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://www.sihf.ch/",
    },
  });

  const text = await res.text();
  return JSON.parse(stripAnyJsonCallback(text));
}

function loadMappings() {
  if (fs.existsSync(MAPPING_FILE)) {
    return JSON.parse(fs.readFileSync(MAPPING_FILE, "utf-8"));
  }
  return {};
}

async function fetchTeamSeason(teamKey, team, season, mapping) {
  const { leagueId, teamId, name } = team;
  const mapKey = `${season}-${leagueId}-${teamId}`;
  const entry = mapping[mapKey];

  if (!entry) {
    console.error(`❌ Kein Mapping für ${mapKey}`);
    return;
  }

  const filterQuery = `${season}/${leagueId}/${entry.region}/${entry.group}/${teamId}`;
  const url = `${BASE_URL}?alias=player&searchQuery=1/2015-2099/${leagueId}&filterQuery=${filterQuery}&orderBy=points&orderByDescending=true&take=200&filterBy=Season,League,Region,Phase,Team,Position,Licence&callback=externalStatisticsCallback&skip=-1&language=de`;

  console.log(`➡️  Fetching: ${teamKey} ${season}`);
  const raw = await fetchJson(url);

  if (!raw.data || !Array.isArray(raw.data)) {
    console.error(`❌ Fehler bei ${teamKey} ${season}: Keine Daten`);
    return;
  }

  const players = raw.data.map((p) => ({
    rank: p[0],
    name: p[1],
    position: p[3],
    games: parseInt(p[4]),
    goals: parseInt(p[5]),
    assists: parseInt(p[6]),
    points: parseInt(p[7]),
    pointsPerGame: parseFloat(p[8]),
    penaltyMinutes: parseInt(p[9]),
  }));

  const out = { season, team: name, league: leagueId, players };

  const outDir = path.join("data", teamKey);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${season}.json`);

  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf-8");
  console.log(`✅ Gespeichert: ${outFile} (${players.length} Spieler)`);
}

async function main() {
  const mapping = loadMappings();
  for (const [key, team] of Object.entries(TEAMS)) {
    for (const season of SEASONS) {
      try {
        await fetchTeamSeason(key, team, season, mapping);
      } catch (err) {
        console.error(`❌ Fehler bei ${key} ${season}:`, err.message);
      }
    }
  }
}

main();
