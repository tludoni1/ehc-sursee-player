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

// 🔧 universeller Parser: klappt für JSONP (egal welcher Callback) und reines JSON
function stripAnyJsonCallback(text) {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  if (start === -1 || end === -1) {
    throw new Error("Kein JSONP-Format erkannt: " + text.substring(0, 100));
  }
  return text.substring(start + 1, end);
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
    // Wenn JSONP (enthält Klammern), Callback rausstrippen
    if (text.includes("(") && text.includes(")")) {
      return JSON.parse(stripAnyJsonCallback(text));
    }
    // sonst plain JSON
    return JSON.parse(text);
  } catch (err) {
    throw new Error("Fehler beim Parsen der Antwort: " + text.substring(0, 120));
  }
}

// 🔍 Holt dynamisch Region + Group IDs für Team/Saison
async function fetchGroupInfo(season, leagueId, teamId) {
  const url = `${BASE_URL}?alias=standings&searchQuery=${season}/${leagueId}/&filterQuery=${season}/${leagueId}/&language=de`;

  const raw = await fetchJson(url);

  if (!raw.data || !Array.isArray(raw.data)) {
    throw new Error("Standings API hat kein gültiges data-Array zurückgegeben.");
  }

  for (const region of raw.data) {
    const regionId = region.Id;
    for (const group of region.Groups || []) {
      const groupId = group.Id;
      const team = (group.Teams || []).find((t) => t.Id === teamId);
      if (team) {
        console.log(`🔎 Gefunden: season ${season} -> region ${regionId}, group ${groupId}`);
        return { region: regionId, group: groupId };
      }
    }
  }

  throw new Error(`Keine Region/Group für Team ${teamId} in Season ${season} gefunden`);
}

// Holt Player-Stats
async function fetchTeamSeason(season) {
  const { leagueId, teamId, name } = TEAM;

  const { region, group } = await fetchGroupInfo(season, leagueId, teamId);

  const filterQuery = `${season}/${leagueId}/${region}/${group}/${teamId}`;

  const url = `${BASE_URL}?alias=player&searchQuery=1/2015-2099/3,10,18,19,33,35,36,38,37,39,40,41,43,101,44,45,46,104&filterQuery=${filterQuery}&orderBy=points&orderByDescending=true&take=200&filterBy=Season,League,Region,Phase,Team,Position,Licence&callback=externalStatisticsCallback&skip=-1&language=de`;

  console.log(`➡️  Fetching stats: ${season}`);

  const raw = await fetchJson(url);

  if (!raw.data || !Array.isArray(raw.data)) {
    throw new Error("Player API hat kein gültiges data-Array zurückgegeben. Schlüssel: " + Object.keys(raw));
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
