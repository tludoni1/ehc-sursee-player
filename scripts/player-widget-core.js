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

// --------------------------
// NEU: versteht mappings.json Struktur
// --------------------------
async function loadSeasonData(mappings, teamName, season, phase) {
  const teamMap = mappings[teamName];
  if (!teamMap) {
    console.warn(`⚠️ Kein Mapping für Team ${teamName}`);
    return { season, team: teamName, league: "", players: [] };
  }

  // Keys für diese Saison holen (z. B. "2025", "2025-P1")
  const seasonEntries = Object.entries(teamMap).filter(([key]) =>
    key.startsWith(season.toString())
  );

  if (seasonEntries.length === 0) {
    console.warn(`⚠️ Keine Einträge für ${teamName} ${season}`);
    return { season, team: teamName, league: "", players: [] };
  }

  // Phase-Filter anwenden
  let filtered = seasonEntries;
  if (phase === "regular") {
    filtered = seasonEntries.filter(([_, v]) =>
      v.phase.toLowerCase().includes("regular")
    );
  } else if (phase === "playoffs") {
    filtered = seasonEntries.filter(([_, v]) =>
      !v.phase.toLowerCase().includes("regular")
    );
  }

  let allData = [];
  for (const [key, entry] of filtered) {
    const safePhase = entry.phase
      .replace(/\s+/g, "-")
      .replace(/\//g, "-")
      .replace(/[^\w\-]/g, "");
    const file = `${season}-${safePhase}.json`;

    const url = `https://tludoni1.github.io/ehc-sursee-player/data/${teamName.replace(/\s+/g, "_")}/${file}?v=${Date.now()}`;

    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      allData.push(json);
    } else {
      console.warn("⚠️ Datei nicht gefunden:", url);
    }
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
