// scripts/fetch_players.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

// Nur Senioren für den Test
const TEAM = {
  leagueId: 37,
  teamId: 105810,
  name: "Senioren D"
};

// Mapping: Saison -> gültige Region + GroupId
const GROUPS = {
  2022: { region: 1, group: 3567 },
  2023: { region: 1, group: 3867 },
  2024: { region: 1, group: 4297 },
  2025: { region: 1, group: 4659 },
};

// Seasons die wir testen
const SEASONS = [2022, 2023, 2024, 2025];

const BASE_URL = "https://data.sihf.ch/Statistic/api/cms/cache300";

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
  const json = text.replace(/^externalStatisticsCallback\(/, "").replace(/\);?$/, "");
  return JSON.parse(json);
}

async function fetchTeamSeason(season) {
  const { leagueId, teamId, name } = TEAM;
  const { region, group } = GROUPS[season];

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

  const outDir = path.join("data", "senioren");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${season}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf-8");

  console.log(`✅ Gespeichert: ${outFile}`);
}

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
