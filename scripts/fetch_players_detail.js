import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const BASE_URL = "https://data.sihf.ch/Statistic/api/cms/cache300";

// Ermöglicht die Übergabe eines benutzerdefinierten Mapping-Files per Parameter
const args = process.argv.slice(2);
const customMappingsIndex = args.indexOf("--mappings");
const MAPPING_FILE =
  customMappingsIndex !== -1
    ? args[customMappingsIndex + 1]
    : path.join("data", "mappings.json");

function stripJsonCallback(text) {
  const marker = "externalStatisticsCallback(";
  const start = text.indexOf(marker);
  const end = text.lastIndexOf(")");
  if (start === -1 || end === -1) {
    throw new Error("Kein Callback gefunden: " + text.substring(0, 100));
  }
  return text.substring(start + marker.length, end);
}

// Hilfsfunktion: Retry mit Backoff
async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
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
    } catch (err) {
      console.warn(`⚠️ Versuch ${i + 1} fehlgeschlagen: ${err.message}`);
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      } else {
        throw err;
      }
    }
  }
}

function loadMappings() {
  if (fs.existsSync(MAPPING_FILE)) {
    return JSON.parse(fs.readFileSync(MAPPING_FILE, "utf-8"));
  }
  throw new Error("Keine mappings.json gefunden!");
}

// Hilfsfunktion: Phase-Name → Dateiname
function sanitizePhase(phase) {
  return phase
    .replace(/\s+/g, "-")
    .replace(/\//g, "-")
    .replace(/[^\w\-]/g, "");
}

async function fetchTeamSeason(teamName, seasonKey, entry) {
  const { leagueId, teamId, region, group, phase } = entry;

  const season = parseInt(seasonKey.substring(0, 4), 10);
  const filterQuery = `${season}/${leagueId}/${region}/${group}/${teamId}`;

  const url = `${BASE_URL}?alias=player&searchQuery=1/2015-2099/3,10,18,19,33,35,36,38,37,39,40,41,43,101,44,45,46,104&filterQuery=${filterQuery}&orderBy=points&orderByDescending=true&take=200&filterBy=Season,League,Region,Phase,Team,Position,Licence&callback=externalStatisticsCallback&skip=-1&language=de`;

  console.log(`➡️  Fetching: ${teamName} ${seasonKey} (${phase})`);

  let out;
  try {
    const raw = await fetchWithRetry(url, 3);
    if (!raw.data || !Array.isArray(raw.data)) {
      throw new Error("API hat kein gültiges data-Array zurückgegeben");
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
      id: null, // wird später ergänzt
      jerseyNumber: null,
      ageGroup: null
    }));

    out = { season, phase, team: teamName, league: leagueId, players };
  } catch (err) {
    console.error(`❌ Fehler bei ${teamName} ${seasonKey}:`, err.message);
    out = {
      season,
      phase,
      team: teamName,
      league: leagueId,
      players: [],
      note: "Fehler beim Abruf – Daten nicht verfügbar"
    };
  }

  const outDir = path.join("data", teamName.replace(/\s+/g, "_"));
  fs.mkdirSync(outDir, { recursive: true });

  const phasePart = sanitizePhase(phase);
  const outFile = path.join(outDir, `${season}-${phasePart}.json`);

  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf-8");
  console.log(`✅ Gespeichert: ${outFile} (${out.players.length} Spieler)`);
}

async function main() {
  const mappings = loadMappings();

  // Alle Teams
  for (const [teamName, seasons] of Object.entries(mappings)) {
    for (const [seasonKey, entry] of Object.entries(seasons)) {
      const season = parseInt(seasonKey.substring(0, 4), 10);
      if (season < 2014) continue; // nur ab 2014

      try {
        await fetchTeamSeason(teamName, seasonKey, entry);
      } catch (err) {
        console.error(`❌ Unhandled Fehler bei ${teamName} ${seasonKey}:`, err.message);
      }
    }
  }
}

main();
