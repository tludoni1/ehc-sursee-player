import fs from "fs";
import path from "path";
import fetch from "node-fetch";

const BASE_URL = "https://data.sihf.ch/Statistic/api/cms/cache300";
const MAPPING_FILE = path.join("data", "mappings.json");

// ==========================
// JSON Callback entfernen
// ==========================
function stripJsonCallback(text) {
  const marker = "externalStatisticsCallback(";
  const start = text.indexOf(marker);
  const end = text.lastIndexOf(")");
  if (start === -1 || end === -1) {
    throw new Error("Kein Callback gefunden: " + text.substring(0, 100));
  }
  return text.substring(start + marker.length, end);
}

// ==========================
// Retry mit Backoff
// ==========================
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

// ==========================
// Mappings laden
// ==========================
function loadMappings() {
  if (fs.existsSync(MAPPING_FILE)) {
    return JSON.parse(fs.readFileSync(MAPPING_FILE, "utf-8"));
  }
  throw new Error("Keine mappings.json gefunden!");
}

// ==========================
// Phase-Name → Dateiname
// ==========================
function sanitizePhase(phase) {
  return phase
    .replace(/\s+/g, "-")
    .replace(/\//g, "-")
    .replace(/[^\w\-]/g, "");
}

// ==========================
// Hilfsfunktion: Minuten parsen
// ==========================
function parseMinutesPlayed(value) {
  if (!value || typeof value !== "string") return 0;
  const parts = value.split(":").map((x) => parseInt(x, 10));
  if (parts.length === 2) {
    // MM:SS
    return parts[0] + parts[1] / 60;
  } else if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 60 + parts[1] + parts[2] / 60;
  } else {
    return 0;
  }
}

// ==========================
// Team & Saison abrufen
// ==========================
async function fetchTeamSeasonGoalies(teamName, seasonKey, entry) {
  const { leagueId, teamId, region, group, phase } = entry;

  const season = parseInt(seasonKey.substring(0, 4), 10);
  const filterQuery = `${season}/${leagueId}/${region}/${group}/${teamId}`;

  const url = `${BASE_URL}?alias=goalkeeper&searchQuery=1/2015-2099/3,10,18,19,33,35,36,38,37,39,40,41,43,101,44,45,46,104&filterQuery=${filterQuery}&orderBy=goalsAgainstAverage&orderByDescending=false&take=200&filterBy=Season,League,Region,Phase,Team,Licence&callback=externalStatisticsCallback&skip=-1&language=de`;

  console.log(`🥅 Fetching Goalies: ${teamName} ${seasonKey} (${phase})`);

  let out;
  try {
    const raw = await fetchWithRetry(url, 3);
    if (!raw.data || !Array.isArray(raw.data)) {
      throw new Error("API hat kein gültiges data-Array zurückgegeben");
    }

    const goalies = raw.data.map((g) => {
      const minutesPlayed = parseMinutesPlayed(g[7]); // Spalte MIP
      const goalsAgainst = parseInt(g[5]) || 0;
      const gaa = minutesPlayed > 0 ? (goalsAgainst * 60) / minutesPlayed : 0;

      return {
        rank: g[0] || "",
        name: g[1],
        team: g[2]?.name || teamName,
        gamesPlayed: parseInt(g[3]) || 0,
        firstKeeper: parseInt(g[4]) || 0,
        goalsAgainst,
        goalsAgainstAverage: parseFloat(gaa.toFixed(2)),
        minutesPlayed: parseFloat(minutesPlayed.toFixed(2)),
        penaltyMinutes: parseInt(g[8]) || 0,
        goals: parseInt(g[9]) || 0,
        assists: parseInt(g[10]) || 0
      };
    });

    out = { season, phase, team: teamName, league: leagueId, goalies };
  } catch (err) {
    console.error(`❌ Fehler bei ${teamName} ${seasonKey}:`, err.message);
    out = {
      season,
      phase,
      team: teamName,
      league: leagueId,
      goalies: [],
      note: "Fehler beim Abruf – Daten nicht verfügbar"
    };
  }

  const outDir = path.join("data", teamName.replace(/\s+/g, "_"), "Goaltenders");
  fs.mkdirSync(outDir, { recursive: true });

  const phasePart = sanitizePhase(phase);
  const outFile = path.join(outDir, `${season}-${phasePart}.json`);

  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf-8");
  console.log(`✅ Gespeichert: ${outFile} (${out.goalies.length} Goalies)`);
}

// ==========================
// MAIN
// ==========================
async function main() {
  const mappings = loadMappings();

  for (const [teamName, seasons] of Object.entries(mappings)) {
    for (const [seasonKey, entry] of Object.entries(seasons)) {
      const season = parseInt(seasonKey.substring(0, 4), 10);
      if (season < 2014) continue; // nur ab 2014

      try {
        await fetchTeamSeasonGoalies(teamName, seasonKey, entry);
      } catch (err) {
        console.error(
          `❌ Unhandled Fehler bei ${teamName} ${seasonKey}:`,
          err.message
        );
      }
    }
  }
}

main();
