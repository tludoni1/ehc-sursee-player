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

// Neue SIHF-Tabellen-API; nur für explizit migrierte Saisons.
// Verifiziert die von SIHF zurückgegebenen Saison- und Phasenfilter.
async function fetchModernTable(alias, season, leagueId, phaseId) {
  const url = new URL("https://data.sihf.ch/statistic/api/cms/table");
  url.searchParams.set("alias", alias);
  url.searchParams.set("searchQuery", `1//${leagueId}`);
  url.searchParams.set("language", "de");
  url.searchParams.set("filterBy", "Season,Phase");
  url.searchParams.set("filterQuery", `${season}/${phaseId}`);

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error(`SIHF HTTP ${response.status}`);
      const body = await response.json();
      for (const [key, expected] of [["Season", season], ["Phase", phaseId]]) {
        const reported = body.filters?.find((item) => item.alias === key);
        if (!reported || String(reported.selected) !== String(expected)) {
          throw new Error(`SIHF lieferte einen falschen ${key}-Filter: ${reported?.selected}`);
        }
      }
      if (!Array.isArray(body.data)) throw new Error("SIHF lieferte kein data-Array");
      if (Number.isInteger(body.pages) && body.data.length !== body.pages) {
        throw new Error(`Unvollständige SIHF-Tabelle: ${body.data.length}/${body.pages}`);
      }
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
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
    const modern = entry.api === "table" && entry.phaseId != null;
    const raw = modern
      ? await fetchModernTable("player", season, leagueId, entry.phaseId)
      : await fetchWithRetry(url, 3);
    if (!raw.data || !Array.isArray(raw.data)) {
      throw new Error("API hat kein gültiges data-Array zurückgegeben");
    }

    // Der neue Tabellen-Endpunkt liefert die gesamte Liga/Gruppe.
    // Ausschliesslich die bestätigte EHC-Sursee-Team-ID übernehmen.
    const teamRows = modern
      ? raw.data.filter((row) => Array.isArray(row) && String(row[2]?.id) === String(teamId))
      : raw.data;
    if (modern && teamRows.length === 0) {
      throw new Error(`Keine Daten für Team-ID ${teamId} in SIHF-Phase ${entry.phaseId}`);
    }

    const players = teamRows.map((p) => ({
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
    throw new Error(`Datenabruf für ${teamName} ${seasonKey} fehlgeschlagen: ${err.message}`);
  }

  // Kein vorhandenes JSON überschreiben, wenn die API keine Datensätze liefert.
  // Insbesondere bei neuen Saisonfiltern ist ein leerer Erfolg nicht verlässlich.
  if (!out.players.length) {
    throw new Error(`Keine Spielerdaten für ${teamName} ${seasonKey}; bestehende Dateien bleiben unverändert`);
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

  let failures = 0;

  // Alle Teams
  for (const [teamName, seasons] of Object.entries(mappings)) {
    for (const [seasonKey, entry] of Object.entries(seasons)) {
      const season = parseInt(seasonKey.substring(0, 4), 10);
      if (season < 2014) continue; // nur ab 2014

      try {
        await fetchTeamSeason(teamName, seasonKey, entry);
      } catch (err) {
        console.error(`❌ Unhandled Fehler bei ${teamName} ${seasonKey}:`, err.message);
        failures++;
      }
    }
  }
  if (failures > 0) {
    console.error(`❌ ${failures} Datenabrufe fehlgeschlagen`);
    process.exitCode = 1;
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
