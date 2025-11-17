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

// Retry mit Backoff
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
      console.warn(`⚠️ Goalie-Versuch ${i + 1} fehlgeschlagen: ${err.message}`);
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

function sanitizePhase(phase) {
  return phase
    .replace(/\s+/g, "-")
    .replace(/\//g, "-")
    .replace(/[^\w\-]/g, "");
}

async function fetchTeamSeasonGoalies(teamName, seasonKey, entry) {
  const { leagueId, teamId, region, group, phase } = entry;
  const season = parseInt(seasonKey.substring(0, 4), 10);

  // hier: teamId einfügen, damit nur Torhüter dieses Teams
  const filterQuery = `${season}/${leagueId}/${region}/${group}/${teamId}`;
  const url = `${BASE_URL}?alias=goalkeeper&searchQuery=1/2015-2099/3,10,18,19,33,35,36,38,37,39,40,41,43,101,44,45,46,104&filterQuery=${filterQuery}&orderBy=goalsAgainstAverage&orderByDescending=false&take=200&filterBy=Season,League,Region,Phase,Team,Licence&callback=externalStatisticsCallback&skip=-1&language=de`;

  console.log(`🥅 Fetching Goalies: ${teamName} ${seasonKey} (${phase})`);

  let out;
  try {
    const raw = await fetchWithRetry(url, 3);
    if (!raw.data || !Array.isArray(raw.data)) {
      throw new Error("API hat kein gültiges data-Array zurückgegeben");
    }

    const goalies = raw.data.map((p) => ({
      rank: p[0],
      name: p[1],
      team: p[2]?.name || "",
      gamesPlayed: parseInt(p[3]),
      firstKeeper: parseInt(p[4]),
      goalsAgainst: parseInt(p[5]),
      goalsAgainstAverage: parseFloat(p[6]),
      secondsPlayed: p[7],
      penaltyMinutes: parseInt(p[8]),
      goals: parseInt(p[9]),
      assists: parseInt(p[10]),
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

  const outDir = path.join("data", teamName.replace(/\s+/g, "_"), "Goaltenders");
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
      if (season < 2014) continue; // nur ab 2014
      try {
        await fetchTeamSeasonGoalies(teamName, seasonKey, entry);
      } catch (err) {
        console.error(`❌ Unhandled Fehler bei Goalies ${teamName} ${seasonKey}:`, err.message);
      }
    }
  }
}

main();
