// scripts/fetch_goalies.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const BASE_URL = "https://data.sihf.ch/Statistic/api/cms/cache300";
const MAPPING_FILE = path.join("data", "mappings_goalies.json");

function stripJsonCallback(text) {
  const marker = "externalStatisticsCallback(";
  const start = text.indexOf(marker);
  const end = text.lastIndexOf(")");
  if (start === -1 || end === -1) {
    throw new Error("Kein Callback gefunden: " + text.substring(0, 100));
  }
  return text.substring(start + marker.length, end);
}

// Retry mit Backoff (wie bei players)
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
      console.warn(`⚠️ [Goalies] Versuch ${i + 1} fehlgeschlagen: ${err.message}`);
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
  throw new Error("Keine mappings_goalies.json gefunden!");
}

function sanitizePhase(phase) {
  return phase
    .replace(/\s+/g, "-")
    .replace(/\//g, "-")
    .replace(/[^\w\-]/g, "");
}

async function fetchGoalieSeason(teamName, seasonKey, entry) {
  const { leagueId, region, group, phase } = entry;

  const season = parseInt(seasonKey.substring(0, 4), 10);
  const filterQuery = `${season}/${leagueId}/${region}/${group}`;

  const url = `${BASE_URL}?alias=goalkeeper&searchQuery=1/2015-2099/3,10,18,19,33,35,36,38,37,39,40,41,43,101,44,45,46,104&filterQuery=${filterQuery}&orderBy=goalsAgainstAverage&orderByDescending=false&take=200&filterBy=Season,League,Region,Phase,Team,Licence&callback=externalStatisticsCallback&skip=-1&language=de`;

  console.log(`➡️  Fetching Goalies: ${teamName} ${seasonKey} (${phase})`);

  let out;
  try {
    const raw = await fetchWithRetry(url, 3);
    if (!raw.data || !Array.isArray(raw.data)) {
      throw new Error("API hat kein gültiges data-Array zurückgegeben");
    }

    const goalies = raw.data.map((g) => ({
      rank: g[0],
      name: g[1],
      team: typeof g[2] === "object" ? g[2].name : g[2],
      games: parseInt(g[3]) || 0,
      gamesFirst: parseInt(g[4]) || 0,
      goalsAgainst: parseInt(g[5]) || 0,
      gaa: parseFloat(g[6]) || null,
      minutes: g[7],
      penaltyMinutes: parseInt(g[8]) || 0,
      goals: parseInt(g[9]) || 0,
      assists: parseInt(g[10]) || 0,
      id: null,
      jerseyNumber: null,
      ageGroup: null
    }));

    out = { season, phase, team: teamName, league: leagueId, goalies };
  } catch (err) {
    console.error(`❌ Fehler bei Goalies ${teamName} ${seasonKey}:`, err.message);
    out = {
      season,
      phase,
      team: teamName,
      league: leagueId,
      goalies: [],
      note: "Fehler beim Abruf – Daten nicht verfügbar"
    };
  }

  const outDir = path.join("data", teamName.replace(/\s+/g, "_"), "goalies");
  fs.mkdirSync(outDir, { recursive: true });

  const phasePart = sanitizePhase(phase);
  const outFile = path.join(outDir, `${season}-${phasePart}.json`);

  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf-8");
  console.log(`✅ Gespeichert: ${outFile} (${out.goalies.length} Goalies)`);
}

async function main() {
  const mappings = loadMappings();

  for (const [teamName, seasons] of Object.entries(mappings)) {
    for (const [seasonKey, entry] of Object.entries(seasons)) {
      const season = parseInt(seasonKey.substring(0, 4), 10);
      if (season < 2014) continue;

      try {
        await fetchGoalieSeason(teamName, seasonKey, entry);
      } catch (err) {
        console.error(`❌ Unhandled Fehler bei Goalies ${teamName} ${seasonKey}:`, err.message);
      }
    }
  }
}

main();
