import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const BASE_URL = "https://data.sihf.ch/Statistic/api/cms";
const MAPPING_FILE = path.join("data", "mappings.json");

const DEBUG_TEAM = "1 Mannschaft"; // nur dieses Team wird verarbeitet
const MAX_GAMES = 6; // Anzahl Spiele pro Saison

// ==========================
// Hilfsfunktionen
// ==========================
function stripJsonCallback(text) {
  const marker = "externalStatisticsCallback(";
  const start = text.indexOf(marker);
  const end = text.lastIndexOf(")");
  if (start === -1 || end === -1) return text;
  return text.substring(start + marker.length, end);
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
    return JSON.parse(stripJsonCallback(text));
  } catch (err) {
    throw new Error("❌ JSON Parse Error: " + text.substring(0, 200));
  }
}

function loadMappings() {
  if (!fs.existsSync(MAPPING_FILE)) throw new Error("Keine mappings.json gefunden!");
  return JSON.parse(fs.readFileSync(MAPPING_FILE, "utf-8"));
}

function sanitizePhase(phase) {
  return phase.replace(/\s+/g, "-").replace(/\//g, "-").replace(/[^\w\-]/g, "");
}

// ==========================
// GameIDs holen
// ==========================
async function fetchGameIds(season, leagueId, teamId) {
  const from = `${season - 1}-08-01`;
  const to = `${season}-07-31`;

  const url = `${BASE_URL}/cache300?alias=results&searchQuery=1,10/2015-2099/3,10,18,19,33,35,36,38,37,39,40,41,43,101,44,45,46,104&filterQuery=${season}/${leagueId}/all/all/${from}-${to}/all/${teamId}/all&orderBy=date&orderByDescending=false&take=50&filterBy=season,league,region,phase,date,deferredState,team1,team2&callback=externalStatisticsCallback&skip=-1&language=de`;

  const raw = await fetchJson(url);
  const games = (raw.data || []).map((row) => {
    const g = row.find((c) => c?.type === "linkToGameDetail");
    return g?.gameId;
  });
  return games.filter(Boolean).slice(0, MAX_GAMES);
}

// ==========================
// GameDetail holen
// ==========================
async function fetchGameDetail(gameId) {
  const url = `${BASE_URL}/gameoverview?alias=gameDetail&searchQuery=${gameId}&callback=externalStatisticsCallback&language=de`;
  return fetchJson(url);
}

// ==========================
// Spieler mit IDs mergen
// ==========================
function mergePlayersWithDetails(basePlayers, details) {
  const playerMap = new Map();
  details.players.forEach((p) => {
    playerMap.set(p.fullName.trim(), {
      id: p.id,
      jerseyNumber: p.jerseyNumber,
      ageGroup: p.ageGroup,
    });
  });

  let withId = [];
  let withoutId = [];

  basePlayers.forEach((bp) => {
    const match = playerMap.get(bp.name.trim());
    if (match) {
      withId.push({ ...bp, ...match });
    } else {
      withoutId.push(bp.name);
      withId.push({ ...bp, id: null, jerseyNumber: null, ageGroup: null });
    }
  });

  return { withId, withoutId };
}

// ==========================
// Hauptlogik pro Saison
// ==========================
async function processSeason(teamName, seasonKey, entry) {
  const { leagueId, teamId, region, group, phase } = entry;
  const season = parseInt(seasonKey.substring(0, 4), 10);

  console.log(`\n➡️  Saison ${season} (${phase})`);

  // 1. Basisdaten
  const filterQuery = `${season}/${leagueId}/${region}/${group}/${teamId}`;
  const url = `${BASE_URL}/cache300?alias=player&searchQuery=1/2015-2099/3,10,18,19,33,35,36,38,37,39,40,41,43,101,44,45,46,104&filterQuery=${filterQuery}&orderBy=points&orderByDescending=true&take=200&filterBy=Season,League,Region,Phase,Team,Position,Licence&callback=externalStatisticsCallback&skip=-1&language=de`;
  const raw = await fetchJson(url);

  const basePlayers = (raw.data || []).map((p) => ({
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

  // 2. GameIDs
  const gameIds = await fetchGameIds(season, leagueId, teamId);
  console.log(`   📌 ${gameIds.length} Spiele gefunden:`, gameIds);

  // 3. Details holen & mergen
  let enriched = basePlayers;
  let allWithout = [];

  for (const gameId of gameIds) {
    const detail = await fetchGameDetail(gameId);
    const { withId, withoutId } = mergePlayersWithDetails(enriched, detail);
    enriched = withId;
    allWithout.push(...withoutId);
  }

  const uniqueWithout = [...new Set(allWithout)];

  return {
    season,
    phase,
    team: teamName,
    league: leagueId,
    players: enriched,
    missingPlayers: uniqueWithout,
  };
}

// ==========================
// MAIN
// ==========================
async function main() {
  const mappings = loadMappings();
  const teamSeasons = mappings[DEBUG_TEAM];

  if (!teamSeasons) {
    console.error(`❌ Team ${DEBUG_TEAM} nicht in mappings.json gefunden!`);
    return;
  }

  let debugOut = [];

  for (const [seasonKey, entry] of Object.entries(teamSeasons)) {
    try {
      const seasonData = await processSeason(DEBUG_TEAM, seasonKey, entry);
      debugOut.push(seasonData);
    } catch (err) {
      console.error(`❌ Fehler bei ${DEBUG_TEAM} ${seasonKey}:`, err.message);
    }
  }

  const outFile = path.join("data", "debug-players.json");
  fs.writeFileSync(outFile, JSON.stringify(debugOut, null, 2), "utf-8");

  console.log(`\n✅ Debug-Ausgabe gespeichert: ${outFile}`);
}

main();
