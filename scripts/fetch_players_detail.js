import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const BASE_URL = "https://data.sihf.ch/Statistic/api/cms/cache300";
const MAPPING_FILE = path.join("data", "mappings.json");

function stripJsonCallback(text) {
  const marker = "externalStatisticsCallback(";
  const start = text.indexOf(marker);
  const end = text.lastIndexOf(")");
  if (start === -1 || end === -1) {
    throw new Error("Kein Callback gefunden: " + text.substring(0, 100));
  }
  return text.substring(start + marker.length, end);
}

async function fetchJson(url) {
  const cacheBuster = `v=${Date.now()}`;
  const fullUrl = url + (url.includes("?") ? "&" : "?") + cacheBuster;

  const res = await fetch(fullUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://www.sihf.ch/"
    }
  });

  const text = await res.text();
  return JSON.parse(stripJsonCallback(text));
}

function loadMappings() {
  if (fs.existsSync(MAPPING_FILE)) {
    return JSON.parse(fs.readFileSync(MAPPING_FILE, "utf-8"));
  }
  throw new Error("Keine mappings.json gefunden!");
}

function sanitizePhase(phase) {
  return phase
    .replace(/\s+/g, "-")
    .replace(/\//g, "-")
    .replace(/[^\w\-]/g, "");
}

// ---------------------------------------------------
// NEU: GameIDs abfragen
// ---------------------------------------------------
async function fetchGameIds(season, leagueId, region, group, teamId) {
  const url = `${BASE_URL}?alias=results&searchQuery=1,10/2015-2099/3,10,18,19,33,35,36,38,37,39,40,41,43,101,44,45,46,104,83&filterQuery=${season}/${leagueId}/${region}/${group}/all/all/${teamId}/all&orderBy=date&orderByDescending=false&take=200&filterBy=season,league,region,phase,date,deferredState,team1,team2&callback=externalStatisticsCallback&skip=-1&language=de`;

  const raw = await fetchJson(url);
  if (!raw.data) return [];

  const gameIds = [];
  for (const row of raw.data) {
    for (const cell of row) {
      if (cell && typeof cell === "object" && cell.type === "linkToGameDetail") {
        gameIds.push(cell.gameId);
      }
    }
  }
  return gameIds;
}

// ---------------------------------------------------
// NEU: Spieler aus GameDetail holen
// ---------------------------------------------------
async function fetchGamePlayers(gameId) {
  const url = `https://data.sihf.ch/statistic/api/cms/gameoverview?alias=gameDetail&searchQuery=${gameId}&callback=externalStatisticsCallback&language=de`;
  const raw = await fetchJson(url);
  return raw.players || [];
}

// ---------------------------------------------------
// Hauptfunktion pro Team/Saison
// ---------------------------------------------------
async function fetchTeamSeason(teamName, seasonKey, entry) {
  const { leagueId, teamId, region, group, phase } = entry;

  const season = parseInt(seasonKey.substring(0, 4), 10);

  const filterQuery = `${season}/${leagueId}/${region}/${group}/${teamId}`;
  const url = `${BASE_URL}?alias=player&searchQuery=1/2015-2099/3,10,18,19,33,35,36,38,37,39,40,41,43,101,44,45,46,104&filterQuery=${filterQuery}&orderBy=points&orderByDescending=true&take=200&filterBy=Season,League,Region,Phase,Team,Position,Licence&callback=externalStatisticsCallback&skip=-1&language=de`;

  console.log(`➡️  Fetching: ${teamName} ${seasonKey} (${phase})`);

  const raw = await fetchJson(url);

  if (!raw.data || !Array.isArray(raw.data)) {
    throw new Error(
      "API hat kein gültiges data-Array zurückgegeben. Schlüssel: " +
        Object.keys(raw)
    );
  }

  // Basisdaten (wie bisher)
  const players = raw.data.map((p) => ({
    rank: p[0],
    name: p[1],
    position: p[3],
    games: parseInt(p[4]),
    goals: parseInt(p[5]),
    assists: parseInt(p[6]),
    points: parseInt(p[7]),
    pointsPerGame: parseFloat(p[8]),
    penaltyMinutes: parseInt(p[9])
  }));

  // NEU: zusätzliche Details aus ein paar Spielen mergen
  const gameIds = await fetchGameIds(season, leagueId, region, group, teamId);
  const sample = gameIds.slice(0, 3); // nimm 3 Spiele

  let metaPlayers = [];
  for (const gId of sample) {
    const list = await fetchGamePlayers(gId);
    metaPlayers.push(...list);
  }

  for (const p of players) {
    const match = metaPlayers.find((mp) => mp.fullName === p.name);
    if (match) {
      p.id = match.id;
      p.jerseyNumber = match.jerseyNumber;
      p.ageGroup = match.ageGroup;
    }
  }

  // Speichern
  const out = {
    season,
    phase,
    team: teamName,
    league: leagueId,
    players
  };

  const outDir = path.join("data", teamName.replace(/\s+/g, "_"));
  fs.mkdirSync(outDir, { recursive: true });

  const phasePart = sanitizePhase(phase);
  const outFile = path.join(outDir, `${season}-${phasePart}.json`);

  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf-8");

  console.log(`✅ Gespeichert: ${outFile} (${players.length} Spieler)`);
}

// ---------------------------------------------------
// MAIN
// ---------------------------------------------------
async function main() {
  const mappings = loadMappings();

  for (const [teamName, seasons] of Object.entries(mappings)) {
    for (const [seasonKey, entry] of Object.entries(seasons)) {
      try {
        await fetchTeamSeason(teamName, seasonKey, entry);
      } catch (err) {
        console.error(`❌ Fehler bei ${teamName} ${seasonKey}:`, err.message);
      }
    }
  }
}

main();
