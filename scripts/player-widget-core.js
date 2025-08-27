// Farben-Sets (gleich wie Games-Widget, erweiterbar)
const COLORS = {
  1: { header: "#D71920", text: "#000", line: "#ccc", bg: "#fff", hover: "#f5f5f5" },
  2: { header: "#333", text: "#000", line: "#ddd", bg: "#fff", hover: "#eee" },
  3: { header: "#fff", text: "#fff", line: "#D71920", bg: "#D71920", hover: "#A21318" }
};

// Team-Mapping
const TEAM_MAP = {
  "1T": "1 Mannschaft",
  "2T": "2 Mannschaft",
  "D": "Damen",
  "S": "Senioren"
};

// Hauptfunktion, die vom Loader aufgerufen wird
window.EHCPlayerWidgetCore = async function (config) {
  const container = config.el;
  container.innerHTML = `<div style="font-family:${config.font};">⏳ Lade Daten...</div>`;

  try {
    // Seasons bestimmen
    const allSeasons = Object.keys(await fetchMappings());
    const seasons = resolveSeasons(config.season, allSeasons);

    // Teams bestimmen
    const teams = config.team.split(",").map((t) => t.trim());

    // Daten sammeln
    let players = [];
    for (const team of teams) {
      const teamName = TEAM_MAP[team] || team;
      for (const season of seasons) {
        const seasonData = await loadSeasonData(teamName, season, config.phase);
        players = mergePlayers(players, seasonData, teamName, config.showleague);
      }
    }

    // Sortieren
    players.sort((a, b) => (b[config.sort] || 0) - (a[config.sort] || 0));

    // Rendern
    container.innerHTML = renderTable(players, config);
  } catch (err) {
    container.innerHTML = `<div style="color:red;font-family:${config.font}">❌ Fehler: ${err.message}</div>`;
  }
};

// 🔎 Hilfsfunktionen
async function fetchMappings() {
  const res = await fetch("https://tludoni1.github.io/ehc-sursee-player/data/mappings.json?v=" + Date.now());
  return res.json();
}

function resolveSeasons(param, allSeasons) {
  if (param === "all") return [...new Set(allSeasons.map((k) => k.substring(0, 4)))];
  if (param === "current") return [Math.max(...allSeasons.map((k) => parseInt(k.substring(0, 4), 10)))];
  return param.split(",").map((s) => s.trim());
}

async function loadSeasonData(teamName, season, phase) {
  const url = `https://tludoni1.github.io/ehc-sursee-player/data/${teamName.replace(/\s+/g, "_")}/${season}*.json`; 
  // TODO: mit GitHub Pages geht kein Wildcard → du musst alle Phasen-Dateien einlesen. 
  // Für MVP nehmen wir nur Regular Season:
  const res = await fetch(`https://tludoni1.github.io/ehc-sursee-player/data/${teamName.replace(/\s+/g, "_")}/${season}-Regular-Season.json?v=${Date.now()}`);
  return res.json();
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
    if (showleague) player.league = seasonData.league || "Mix";
  }
  return acc;
}

function renderTable(players, config) {
  const colors = COLORS[config.color] || COLORS[1];
  let html = `<div style="font-family:${config.font};">
    <h3 style="color:${colors.header}">${config.title}</h3>
    <table style="width:100%; border-collapse:collapse; font-size:14px;">
      <thead>
        <tr style="background:${colors.bg}; color:${colors.header}; cursor:pointer;">`;

  if (config.columns.games) html += `<th>Spiele</th>`;
  if (config.columns.goals) html += `<th>Tore</th>`;
  if (config.columns.assists) html += `<th>Assists</th>`;
  if (config.columns.points) html += `<th>Punkte</th>`;
  if (config.columns.pointsPerGame) html += `<th>P/GP</th>`;
  if (config.columns.penaltyMinutes) html += `<th>Strafmin</th>`;
  if (config.showleague) html += `<th>Liga</th>`;

  html += `</tr></thead><tbody>`;

  for (const p of players) {
    html += `<tr style="border-bottom:1px solid ${colors.line};">
      ${config.columns.games ? `<td>${p.games}</td>` : ""}
      ${config.columns.goals ? `<td>${p.goals}</td>` : ""}
      ${config.columns.assists ? `<td>${p.assists}</td>` : ""}
      ${config.columns.points ? `<td>${p.points}</td>` : ""}
      ${config.columns.pointsPerGame ? `<td>${p.pointsPerGame.toFixed(2)}</td>` : ""}
      ${config.columns.penaltyMinutes ? `<td>${p.penaltyMinutes}</td>` : ""}
      ${config.showleague ? `<td>${p.league || ""}</td>` : ""}
    </tr>`;
  }

  html += `</tbody></table></div>`;
  return html;
}
