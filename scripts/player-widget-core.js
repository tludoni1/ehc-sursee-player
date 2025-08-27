// ==========================
// Farben (anpassbar)
// ==========================
const COLORS = {
  1: { header: "#D71920", text: "#000", line: "#ccc", bg: "#fff", hover: "#f5f5f5" },
  2: { header: "#333", text: "#000", line: "#ddd", bg: "#fff", hover: "#eee" },
  3: { header: "#fff", text: "#fff", line: "#D71920", bg: "#D71920", hover: "#A21318" }
};

// ==========================
// Team-Mapping für Kürzel
// ==========================
const TEAM_MAP = {
  "1T": "1 Mannschaft",
  "2T": "2 Mannschaft",
  "D": "Damen",
  "S": "Senioren"
};

// ==========================
// Liga-Mapping
// ==========================
const LEAGUE_MAP = {
  10: "2. Liga",
  18: "3. Liga",
  19: "4. Liga",
  33: "Senioren A",
  35: "Senioren B",
  36: "Senioren C",
  37: "Senioren D",
  39: "Veteranen A",
  40: "Veteranen B",
  41: "Division 50+",
  43: "SWHL B",
  101: "SWHL C",
  104: "SWHL D"
};

// ==========================
// Einstiegspunkt vom Loader
// ==========================
window.EHCPlayerWidgetCore = async function (config) {
  const container = config.el;
  container.innerHTML = `<div style="font-family:${config.font};">⏳ Lade Daten...</div>`;

  try {
    const mappings = await fetchMappings();

    // Seasons bestimmen
    const allSeasons = [...new Set(
      Object.keys(mappings[TEAM_MAP[config.team.split(",")[0].trim()] || config.team.split(",")[0]])
        .map((k) => k.split("-")[0])
    )];
    const seasons = resolveSeasons(config.season, allSeasons);

    // Teams bestimmen
    const teams = config.team.split(",").map((t) => t.trim());

    let players = [];
    for (const team of teams) {
      const teamName = TEAM_MAP[team] || team;
      for (const season of seasons) {
        const seasonData = await loadSeasonData(mappings, teamName, season, config.phase);
        players = mergePlayers(players, seasonData, teamName, config.showleague);
      }
    }

    // Sortierung
    players.sort((a, b) => (b[config.sort] || 0) - (a[config.sort] || 0));

    // Rendern
    container.innerHTML = renderTable(players, config);
    enableSorting(container, players, config);
  } catch (err) {
    container.innerHTML = `<div style="color:red;font-family:${config.font}">❌ Fehler: ${err.message}</div>`;
    console.error(err);
  }
};

// ==========================
// Hilfsfunktionen
// ==========================
async function fetchMappings() {
  const res = await fetch("https://tludoni1.github.io/ehc-sursee-player/data/mappings.json?v=" + Date.now());
  if (!res.ok) throw new Error("Konnte mappings.json nicht laden");
  return res.json();
}

function resolveSeasons(param, allSeasons) {
  if (param === "all") return allSeasons;
  if (param === "current") return [Math.max(...allSeasons.map((s) => parseInt(s)))];
  return param.split(",").map((s) => s.trim());
}

async function loadSeasonData(mappings, teamName, season, phase) {
  const teamMap = mappings[teamName];
  if (!teamMap) return { season, team: teamName, league: "", players: [] };

  const seasonEntries = Object.entries(teamMap).filter(([key]) => key.startsWith(season.toString()));
  if (seasonEntries.length === 0) return { season, team: teamName, league: "", players: [] };

  let filtered = seasonEntries;
  if (phase === "regular") filtered = seasonEntries.filter(([_, v]) => v.phase.toLowerCase().includes("regular"));
  else if (phase === "playoffs") filtered = seasonEntries.filter(([_, v]) => !v.phase.toLowerCase().includes("regular"));

  let allData = [];
  for (const [_, entry] of filtered) {
    const safePhase = entry.phase.replace(/\s+/g, "-").replace(/\//g, "-").replace(/[^\w\-]/g, "");
    const file = `${season}-${safePhase}.json`;
    const url = `https://tludoni1.github.io/ehc-sursee-player/data/${teamName.replace(/\s+/g, "_")}/${file}?v=${Date.now()}`;
    const res = await fetch(url);
    if (res.ok) allData.push(await res.json());
  }
  return mergePhaseData(allData, season, teamName);
}

function mergePhaseData(datasets, season, teamName) {
  if (datasets.length === 0) return { season, team: teamName, league: "", players: [] };
  if (datasets.length === 1) return datasets[0];

  const merged = { season, phase: "Merged", team: teamName, league: datasets[0].league, players: [] };
  datasets.forEach((ds) => {
    ds.players.forEach((p) => {
      let player = merged.players.find((x) => x.name === p.name);
      if (!player) {
        player = { ...p };
        merged.players.push(player);
      } else {
        player.games += p.games || 0;
        player.goals += p.goals || 0;
        player.assists += p.assists || 0;
        player.points += p.points || 0;
        player.pointsPerGame = player.points / (player.games || 1);
        player.penaltyMinutes += p.penaltyMinutes || 0;
      }
    });
  });
  return merged;
}

function mergePlayers(acc, seasonData, teamName, showleague) {
  for (const p of seasonData.players) {
    let player = acc.find((x) => x.name === p.name);
    if (!player) {
      player = { name: p.name, team: teamName, games: 0, goals: 0, assists: 0, points: 0, pointsPerGame: 0, penaltyMinutes: 0 };
      acc.push(player);
    }
    player.games += p.games || 0;
    player.goals += p.goals || 0;
    player.assists += p.assists || 0;
    player.points += p.points || 0;
    player.pointsPerGame = player.points / (player.games || 1);
    player.penaltyMinutes += p.penaltyMinutes || 0;
    if (showleague) player.league = LEAGUE_MAP[seasonData.league] || seasonData.league || "Mix";
  }
  return acc;
}

// ==========================
// Tabelle rendern
// ==========================
function renderTable(players, config) {
  const colors = COLORS[config.color] || COLORS[1];
  let html = `<div style="font-family:${config.font};">
    <h3 style="color:${colors.header}">${config.title}</h3>
    <table id="ehc-player-table" style="width:100%; border-collapse:collapse; font-size:14px;">
      <thead><tr style="background:${colors.bg}; color:${colors.header}; cursor:pointer;">`;

  html += `<th data-key="name" style="text-align:left; padding:4px;">Spieler</th>`;
  if (config.columns.games) html += `<th data-key="games" style="text-align:right; padding:4px;">Spiele</th>`;
  if (config.columns.goals) html += `<th data-key="goals" style="text-align:right; padding:4px;">Tore</th>`;
  if (config.columns.assists) html += `<th data-key="assists" style="text-align:right; padding:4px;">Assists</th>`;
  if (config.columns.points) html += `<th data-key="points" style="text-align:right; padding:4px;">Punkte</th>`;
  if (config.columns.pointsPerGame) html += `<th data-key="pointsPerGame" style="text-align:right; padding:4px;">P/GP</th>`;
  if (config.columns.penaltyMinutes) html += `<th data-key="penaltyMinutes" style="text-align:right; padding:4px;">Strafmin</th>`;
  if (config.showleague) html += `<th data-key="league" style="text-align:left; padding:4px;">Liga</th>`;

  html += `</tr></thead><tbody>`;

  for (const p of players) {
    html += `<tr style="border-bottom:1px solid ${colors.line};">
      <td style="text-align:left; padding:4px;">${p.name}</td>
      ${config.columns.games ? `<td style="text-align:right; padding:4px;">${p.games}</td>` : ""}
      ${config.columns.goals ? `<td style="text-align:right; padding:4px;">${p.goals}</td>` : ""}
      ${config.columns.assists ? `<td style="text-align:right; padding:4px;">${p.assists}</td>` : ""}
      ${config.columns.points ? `<td style="text-align:right; padding:4px;">${p.points}</td>` : ""}
      ${config.columns.pointsPerGame ? `<td style="text-align:right; padding:4px;">${p.pointsPerGame.toFixed(2)}</td>` : ""}
      ${config.columns.penaltyMinutes ? `<td style="text-align:right; padding:4px;">${p.penaltyMinutes}</td>` : ""}
      ${config.showleague ? `<td style="text-align:left; padding:4px;">${p.league || ""}</td>` : ""}
    </tr>`;
  }

  html += `</tbody></table></div>`;
  return html;
}

// ==========================
// Klick-Sortierung mit Asc/Desc Toggle + ▲▼ Indikator
// ==========================
function enableSorting(container, players, config) {
  const table = container.querySelector("#ehc-player-table");
  if (!table) return;

  // Sortierzustand pro Spalte merken
  if (!container.sortState) container.sortState = {};

  const headers = table.querySelectorAll("th[data-key]");
  headers.forEach((th) => {
    th.style.cursor = "pointer";

    // Vorhandene Sortier-Indikatoren zurücksetzen
    th.innerHTML = th.innerHTML.replace(/ ▲| ▼/g, "");

    const key = th.dataset.key;
    if (container.sortState[key] !== undefined) {
      th.innerHTML += container.sortState[key] ? " ▲" : " ▼";
    }

    th.addEventListener("click", () => {
      const key = th.dataset.key;

      // Toggle oder Default auf asc
      const currentAsc = container.sortState[key] === true;
      const newAsc = !currentAsc;
      container.sortState = { [key]: newAsc }; // nur eine Spalte aktiv merken

      players.sort((a, b) => {
        const va = a[key], vb = b[key];
        let cmp = 0;
        if (typeof va === "number" && typeof vb === "number") {
          cmp = va - vb;
        } else {
          cmp = String(va).localeCompare(String(vb));
        }
        return newAsc ? cmp : -cmp;
      });

      // Tabelle neu rendern
      container.innerHTML = renderTable(players, config);

      // Neu binden, Zustand bleibt in container.sortState
      enableSorting(container, players, config);
    });
  });
}
