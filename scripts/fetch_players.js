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
const MAPPING_FILE = path.join("data", "mappings.json");

// universeller JSON/JSONP-Parser
function stripAnyJsonCallback(text) {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  if (start !== -1 && end !== -1) {
    return text.substring(start + 1, end);
  }
  return text; // plain JSON
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

// Mapping laden / speichern
function loadMappings() {
  if (fs.existsSync(MAPPING_FILE)) {
    return JSON.parse(fs.readFileSync(MAPPING_FILE, "utf-8"));
  }
  return {};
}

function saveMappings(mappings) {
  fs.mkdirSync(path.dirname(MAPPING_FILE), { recursive: true });
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(mappings, null, 2), "utf-8");
}

// Region + Phase dynamisch ermitteln oder aus Mapping laden
async function findRegionAndPhase(season, leagueId, teamId) {
  const mappings = loadMappings();
  const key = `${season}-${leagueId}-${teamId}`;

  if (mappings[key]) {
    console.log(`⚡ Mapping gefunden für ${key}:`, mappings[key]);
    return mappings[key];
  }

  // Basis-Request mit all/all/Team → liefert alle Phasen
  const url = `${BASE_URL}?alias=player&searchQuery=1/2015-2099/${leagueId}&filterQuery=${season}/${leagueId}/all/all/${teamId}&orderBy=points&orderByDescending=true&take=1&filterBy=Season,League,Team&callback=externalStatisticsCallback&skip=-1&language=de`;
  const raw = await fetchJson(url);

  const regionFilter = raw.filters?.find(f => f.alias.toLowerCase() === "region");
  const phaseFilter  = raw.filters?.find(f => f.alias.toLowerCase() === "phase");

  if (!regionFilter || !phaseFilter) {
    throw new Error("Region oder Phase nicht im Filter vorhanden");
  }

  const region = regionFilter.entries[0]; // meistens nur "CH"

  for (const phase of phaseFilter.entries) {
    const testQuery = `${season}/${leagueId}/${region.alias}/${phase.alias}/${teamId}`;
    const testUrl = `${BASE_URL}?alias=player&searchQuery=1/2015-2099/${leagueId}&filterQuery=${testQuery}&orderBy=points&orderByDescending=true&take=1&filterBy=Season,League,Region,Phase,Team&callback=externalStatisticsCallback&skip=-1&language=de`;

    const testRaw = await fetchJson(testUrl);

    if (testRaw.data && testRaw.data.length > 0) {
      console.log(`✅ Kombination gefunden für ${key}: Region=${region.alias}, Phase=${phase.alias}`);
      mappings[key] = { region: region.alias, group: phase.alias };
      saveMappings(mappings);
      return mappings[key];
    }
  }

  throw new Error(`Keine gültige Kombination für Team ${teamId}, Season ${season}`);
}

// Holt Player-Stats
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

// Main Loop
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
