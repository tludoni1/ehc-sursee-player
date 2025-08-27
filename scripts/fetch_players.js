import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const TEAM = {
  leagueId: 37,
  teamId: 105810,
  name: "Senioren D"
};

const SEASONS = [2022, 2023, 2024, 2025];
const BASE_URL = "https://data.sihf.ch/Statistic/api/cms/cache300";

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

// 🔍 Region + Phase dynamisch bestimmen
async function findRegionAndPhase(season, leagueId, teamId) {
  // 1. Basis-Request: nur Season + League, Rest = all
  const url = `${BASE_URL}?alias=player&searchQuery=1/2015-2099/${leagueId}&filterQuery=${season}/${leagueId}/all/all/all&orderBy=points&orderByDescending=true&take=1&filterBy=Season,League&callback=externalStatisticsCallback&skip=-1&language=de`;

  const raw = await fetchJson(url);

  if (!raw.filters) {
    throw new Error("Keine Filter im Player-Response gefunden");
  }

  console.log("🔎 Gefundene Filter:");
  for (const f of raw.filters) {
    console.log(`   - alias=${f.alias}, title=${f.title}`);
    if (f.entries) {
      console.log("     entries:", f.entries.map(e => `${e.name} (${e.alias})`).join(", "));
    }
  }

  const regionFilter = raw.filters.find(f => f.alias.toLowerCase() === "region");
  const phaseFilter  = raw.filters.find(f => f.alias.toLowerCase() === "phase");

  if (!regionFilter || !phaseFilter) {
    throw new Error("Region oder Phase nicht im Filter vorhanden");
  }

  const region = regionFilter.entries[0]; // meist nur "CH"

  // 2. Alle Phasen ausprobieren
  for (const phase of phaseFilter.entries) {
    const testQuery = `${season}/${leagueId}/${region.alias}/${phase.alias}/${teamId}`;
    const testUrl = `${BASE_URL}?alias=player&searchQuery=1/2015-2099/${leagueId}&filterQuery=${testQuery}&orderBy=points&orderByDescending=true&take=1&filterBy=Season,League,Region,Phase,Team&callback=externalStatisticsCallback&skip=-1&language=de`;

    const testRaw = await fetchJson(testUrl);

    if (testRaw.data && testRaw.data.length > 0) {
      console.log(`✅ Kombination gefunden für ${season}: Region=${region.alias}, Phase=${phase.alias}`);
      return { region: region.alias, group: phase.alias };
    }
  }

  throw new Error(`Keine gültige Kombination für Team ${teamId}, Season ${season}`);
}

// 📥 Holt Player-Stats
async function fetchTeamSeason(season) {
  const { leagueId, teamId, name } = TEAM;
  const { region, group } = await findRegionAndPhase(season, leagueId, teamId);

  const filterQuery = `${season}/${leagueId}/${region}/${group}/${teamId}`;

  const url = `${BASE_URL}?alias=player&searchQuery=1/2015-2099/${leagueId}&filterQuery=${filterQuery}&orderBy=points&orderByDescending=true&take=200&filterBy=Season,League,Region,Phase,Team,Position,Licence&callback=externalStatisticsCallback&skip=-1&language=de`;

  console.log(`➡️  Fetching stats: ${season}`);

  const raw = await fetchJson(url);

  if (!raw.data || !Array.isArray(raw.data)) {
    throw new Error("Player API hat kein gültiges data-Array zurückgegeben.");
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
