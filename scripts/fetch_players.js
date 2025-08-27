import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const TEAM = {
  leagueId: 37,
  teamId: 105810,
  name: "Senioren D"
};

const SEASONS = [2025];
const BASE_URL = "https://data.sihf.ch/Statistic/api/cms/cache300";
const MAPPING_FILE = path.join("data", "mappings.json");

// JSON/JSONP-Parser
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

  try {
    if (text.includes("(") && text.includes(")")) {
      return JSON.parse(stripAnyJsonCallback(text));
    }
    return JSON.parse(text);
  } catch (err) {
    throw new Error("Fehler beim Parsen der Antwort: " + text.substring(0, 200));
  }
}

// Mapping laden
function loadMappings() {
  if (fs.existsSync(MAPPING_FILE)) {
    return JSON.parse(fs.readFileSync(MAPPING_FILE, "utf-8"));
  }
  return {};
}

async function findRegionAndPhase(season, leagueId, teamId) {
  const mappings = loadMappings();
  const key = `${season}-${leagueId}-${teamId}`;

  if (!mappings[key]) {
    throw new Error(`❌ Kein Mapping für ${key} gefunden – bitte in data/mappings.json ergänzen`);
  }

  console.log(`⚡ Mapping genutzt für ${key}:`, mappings[key]);
  return mappings[key];
}

// 📥 Holt Player-Stats
async function fetchTeamSeason(season) {
  const { leagueId, teamId, name } = TEAM;
  const { region, group } = await findRegionAndPhase(season, leagueId, teamId);

  const filterQuery = `${season}/${leagueId}/${region}/${group}/${teamId}`;

  const url = `${BASE_URL}?alias=player&searchQuery=1/2015-2099/${leagueId}&filterQuery=${filterQuery}&orderBy=points&orderByDescending=true&take=200&filterBy=Season,League,Region,Phase,Team,Position,Licence&callback=externalStatisticsCallback&skip=-1&language=de`;

  console.log(`➡️  Fetching stats: ${season}`);

  const raw = await fetchJson(url);

    let table = null;

  if (Array.isArray(raw.data)) {
    table = raw.data;
  } else if (Array.isArray(raw.rows)) {
    table = raw.rows;
  }

  if (!table) {
    throw new Error("Player API hat weder data noch rows mit Spielerinformationen zurückgegeben.");
  }

  const players = table.map((p) => ({
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


  const out = {
    season,
    team: name,
    league: leagueId,
    players,
  };

  const outDir = path.join("data", "senioren");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${season}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf-8");

  console.log(`✅ Gespeichert: ${outFile} (${players.length} Spieler)`);
}

// ▶️ Main Loop
async function main() {
  for (const season of SEASONS) {
    try {
      await fetchTeamSeason(season);
    } catch (err) {
      console.error(`❌ Fehler bei senioren ${season}:`, err.message);
    }
  }
}

main();
