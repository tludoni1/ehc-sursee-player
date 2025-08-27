// scripts/fetch_players.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

// Mapping für die Teams
const TEAMS = {
  "senioren": { leagueId: 37, teamId: 105810, name: "Senioren D" },
  "erste":    { leagueId: 10, teamId: 103941, name: "1. Mannschaft" },
  "damen":    { leagueId: 43, teamId: 103700, name: "Damen" },
  "zweite":   { leagueId: 19, teamId: 104319, name: "2. Mannschaft" },
};

const GROUPS = {
  "senioren": {
    2022: { region: 1, group: 3567 },
    2023: { region: 1, group: 3867 },
    2024: { region: 1, group: 4297 },
    2025: { region: 1, group: 4659 }
  }
}


// Seasons die wir einmalig ziehen wollen
const SEASONS = [2022, 2023, 2024, 2025];

// Basis-URL der SIHF API
const BASE_URL = "https://data.sihf.ch/Statistic/api/cms/cache300";

// Hilfsfunktion: fetch mit Timestamp zum Cache umgehen
async function fetchJson(url) {
  const cacheBuster = `v=${Date.now()}`;
  const fullUrl = url + (url.includes("?") ? "&" : "?") + cacheBuster;

  const res = await fetch(fullUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://www.sihf.ch/",
    },
  });

  if (!res.ok) {
    throw new Error(`Fehler beim Laden: ${res.status} ${res.statusText}`);
  }

  // API liefert JSONP -> wir müssen den Wrapper "externalStatisticsCallback(...)" abschneiden
  const text = await res.text();
  const json = text.replace(/^externalStatisticsCallback\(/, "").replace(/\);?$/, "");
  return JSON.parse(json);
}

// Hauptfunktion
async function fetchTeamSeason(teamKey, season) {
  const { leagueId, teamId, name } = TEAMS[teamKey];

  // FilterQuery: Season/League/Region/Phase/Team
  // Wir versuchen mit 0 als Region/Phase → evtl. gruppenunabhängig
  const { region, group } = GROUPS[teamKey][season];
  const filterQuery = `${season}/${leagueId}/${region}/${group}/${teamId}`;

  const url = `${BASE_URL}?alias=player&searchQuery=1/2015-2099/3,10,18,19,33,35,36,38,37,39,40,41,43,101,44,45,46,104&filterQuery=${filterQuery}&orderBy=points&orderByDescending=true&take=200&filterBy=Season,League,Region,Phase,Team,Position,Licence&callback=externalStatisticsCallback&skip=-1&language=de`;

  const data = await fetchJson(url);

  const players = data.map((p) => ({
    id: p.PlayerId,
    name: `${p.FirstName} ${p.LastName}`,
    position: p.Position,
    games: p.GP,
    goals: p.Goals,
    assists: p.Assists,
    points: p.Points,
    pointsPerGame: p.PPG,
    penaltyMinutes: p.PIM,
  }));

  const out = {
    season,
    team: name,
    league: leagueId,
    players,
  };

  // Ordner erstellen
  const outDir = path.join("data", teamKey);
  fs.mkdirSync(outDir, { recursive: true });

  // Datei schreiben
  const outFile = path.join(outDir, `${season}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf-8");

  console.log(`✅ Gespeichert: ${outFile}`);
}

// Alle Teams + Seasons abarbeiten
async function main() {
  for (const season of SEASONS) {
    for (const teamKey of Object.keys(TEAMS)) {
      try {
        await fetchTeamSeason(teamKey, season);
      } catch (err) {
        console.error(`❌ Fehler bei ${teamKey} ${season}:`, err.message);
      }
    }
  }
}

main();
