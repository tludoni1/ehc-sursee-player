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
window.EHCGoalieWidgetCore = async function (config) {
  const container = config.el;
  container.innerHTML = `<div style="font-family:${config.font};">⏳ Lade Goalies...</div>`;

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

    let goalies = [];
    for (const team of teams) {
      const teamName = TEAM_MAP[team] || team;
      for (const season of seasons) {
        const seasonData = await loadSeasonData(mappings, teamName, season, config.phase);
        goalies = mergeGoalies(goalies, seasonData, teamName, config.showleague);
      }
    }

    // Sortierung
    goalies.sort((a, b) => (b[config.sort] || 0) - (a[config.sort] || 0));

    // Rendern
    container.innerHTML = renderTable(goalies, config);
    enableSorting(container, goalies, config);
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
  if (!teamMap) return { season, team: teamName, league: "", goalies: [] };

  const seasonEntries = Object.entries(teamMap).filter(([key]) => key.startsWith(season.toString()));
  if (seasonEntries.length === 0) return { season, team: teamName, league: "", goalies: [] };

  let filtered = seasonEntries;
  if (phase === "regular") filtered = seasonEntries.filter(([_, v]) => v.phase.toLowerCase().includes("regular"));
  else if (phase === "playoffs") filtered = seasonEntries.filter(([_, v]) => !v.phase.toLowerCase().includes("regular"));

  let allData = [];
  for (const [_, entry] of filtered) {
    const safePhase = entry.phase.replace(/\s+/g, "-").replace(/\//g, "-").replace(/[^\w\-]/g, "");
    const file = `${season}-${safePhase}.json`;
    const url = `https://tludoni1.github.io/ehc-sursee-player/data/${teamName.replace(/\s+/g, "_")}/Goaltenders/${file}?v=${Date.now()}`;
    const res = await fetch(url);
    if (res.ok) allData.push(await res.json());
  }
  return mergePhaseData(allData, season, teamName);
}

function mergePhaseData(datasets, season, teamName) {
  if (datasets.length === 0) return { season, team: teamName, league: "", goalies: [] };
  if (datasets.length === 1) return datasets[0];

  const merged = { season, phase: "Merged", team: teamName, league: datasets[0].league, goalies: [] };
  datasets.forEach((ds) => {
    ds.goalies.forEach((g) => {
      let goalie = merged.goalies.find((x) => x.name === g.name);
      if (!goalie) {
        goalie = { ...g };
        merged.goalies.push(goalie);
      } else {
        goalie.gamesPlayed += g.gamesPlayed || 0;
        goalie.firstKeeper += g.firstKeeper || 0;
        goalie.goalsAgainst += g.goalsAgainst || 0;
        goalie.secondsPlayed += g.secondsPlayed || 0;
        goalie.penaltyInMinutes += g.penaltyInMinutes || 0;
        goalie.goals += g.goals || 0;
        goalie.assists += g.assists || 0;
      }
    });
  });
  return merged;
}

function mergeGoalies(acc, seasonData, teamName, showleague) {
  for (const g of seasonData.goalies) {
    let goalie = acc.find((x) => x.name === g.name);
    if (!goalie) {
      goalie = {
        name: g.name,
        team: teamName,
        gamesPlayed: 0,
        firstKeeper: 0,
        goalsAgainst: 0,
        goalsAgainstAverage: 0,
        secondsPlayed: 0,
        penaltyInMinutes: 0,
        goals: 0,
        assists: 0
      };
      acc.push(goalie);
    }
    goalie.gamesPlayed += g.gamesPlayed || 0;
    goalie.firstKeeper += g.firstKeeper || 0;
    goalie.goalsAgainst += g.goalsAgainst || 0;
    goalie.secondsPlayed += g.secondsPlayed || 0;
    goalie.penaltyInMinutes += g.penaltyInMinutes || 0;
    goalie.goals += g.goals || 0;
    goalie.assists += g.assists || 0;
    if (showleague) goalie.league = LEAGUE_MAP[seasonData.league] || seasonData.league || "Mix";
  }
  return acc;
}

// ==========================
// Tabelle rendern
// ==========================
function renderTable(goalies, config) {
  const colors = COLORS[config.color] || COLORS[1];
  let html = `<div style="font-family:${config.font};">
    <h3 style="color:${colors.header}">${config.title}</h3>
    <table id="ehc-goalie-table" style="width:100%; border-collapse:collapse; font-size:14px;">
      <thead><tr style="background:${colors.bg}; color:${colors.header}; cursor:pointer;">`;

  html += `<th data-key="name" style="text-align:left; padding:4px;">Goalie</th>`;
  if (config.columns.gamesPlayed) html += `<th data-key="gamesPlayed" style="text-align:right; padding:4px;">GP</th>`;
  if (config.columns.firstKeeper) html += `<th data-key="firstKeeper" style="text-align:right; padding:4px;">GPI</th>`;
  if (config.columns.goalsAgainst) html += `<th data-key="goalsAgainst" style="text-align:right; padding:4px;">GA</th>`;
  if (config.columns.goalsAgainstAverage) html += `<th data-key="goalsAgainstAverage" style="text-align:right; padding:4px;">GAA</th>`;
  if (config.columns.secondsPlayed) html += `<th data-key="secondsPlayed" style="text-align:right; padding:4px;">MIP</th>`;
  if (config.columns.penaltyInMinutes) html += `<th data-key="penaltyInMinutes" style="text-align:right; padding:4px;">PIM</th>`;
  if (config.columns.goals) html += `<th data-key="goals" style="text-align:right; padding:4px;">G</th>`;
  if (config.columns.assists) html += `<th data-key="assists" style="text-align:right; padding:4px;">A</th>`;
  if (config.showleague) html += `<th data-key="league" style="text-align:left; padding:4px;">Liga</th>`;

  html += `</tr></thead><tbody>`;

  for (const g of goalies) {
    html += `<tr style="border-bottom:1px solid ${colors.line};">
      <td style="text-align:left; padding:4px;">${g.name}</td>
      ${config.columns.gamesPlayed ? `<td style="text-align:right; padding:4px;">${g.gamesPlayed}</td>` : ""}
      ${config.columns.firstKeeper ? `<td style="text-align:right; padding:4px;">${g.firstKeeper}</td>` : ""}
      ${config.columns.goalsAgainst ? `<td style="text-align:right; padding:4px;">${g.goalsAgainst}</td>` : ""}
      ${config.columns.goalsAgainstAverage ? `<td style="text-align:right; padding:4px;">${g.goalsAgainstAverage}</td>` : ""}
      ${config.columns.secondsPlayed ? `<td style="text-align:right; padding:4px;">${g.secondsPlayed}</td>` : ""}
      ${config.columns.penaltyInMinutes ? `<td style="text-align:right; padding:4px;">${g.penaltyInMinutes}</td>` : ""}
      ${config.columns.goals ? `<td style="text-align:right; padding:4px;">${g.goals}</td>` : ""}
      ${config.columns.assists ? `<td style="text-align:right; padding:4px;">${g.assists}</td>` : ""}
      ${config.showleague ? `<td style="text-align:left; padding:4px;">${g.league || ""}</td>` : ""}
    </tr>`;
  }

  html += `</tbody></table></div>`;
  return html;
}

// ==========================
// Klick-Sortierung
// ==========================
function enableSorting(container, goalies, config) {
  const table = container.querySelector("#ehc-goalie-table");
  if (!table) return;
  if (!container.sortState) container.sortState = {};

  const headers = table.querySelectorAll("th[data-key]");
  headers.forEach((th) => {
    th.style.cursor = "pointer";
    th.innerHTML = th.innerHTML.replace(/ ▲| ▼/g, "");
    const key = th.dataset.key;
    if (container.sortState[key] !== undefined) {
      th.innerHTML += container.sortState[key] ? " ▲" : " ▼";
    }

    th.addEventListener("click", () => {
      const currentAsc = container.sortState[key] === true;
      const newAsc = !currentAsc;
      container.sortState = { [key]: newAsc };
      goalies.sort((a, b) => {
        const va = a[key], vb = b[key];
        let cmp = 0;
        if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
        else cmp = String(va).localeCompare(String(vb));
        return newAsc ? cmp : -cmp;
      });
      container.innerHTML = renderTable(goalies, config);
      enableSorting(container, goalies, config);
    });
  });
}
