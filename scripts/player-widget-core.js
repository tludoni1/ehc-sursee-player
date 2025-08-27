// Liga-Namen auflösen
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

// Rendering mit Sortier-Events
function renderTable(players, config) {
  const colors = COLORS[config.color] || COLORS[1];

  let html = `<div style="font-family:${config.font};">
    <h3 style="color:${colors.header};">${config.title}</h3>
    <table style="width:100%; border-collapse:collapse; font-size:14px;" id="ehc-table">
      <thead>
        <tr style="background:${colors.bg}; color:${colors.header}; cursor:pointer;">`;

  // Name-Spalte immer anzeigen
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
      ${config.showleague ? `<td style="text-align:left; padding:4px;">${LEAGUE_MAP[p.league] || p.league || ""}</td>` : ""}
    </tr>`;
  }

  html += `</tbody></table></div>`;

  setTimeout(() => addSorting(config), 0); // Sorting aktivieren
  return html;
}

// Klick-Sortierung
function addSorting(config) {
  const table = document.getElementById("ehc-table");
  if (!table) return;

  const headers = table.querySelectorAll("th[data-key]");
  headers.forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-key");
      const rows = Array.from(table.querySelectorAll("tbody tr"));
      const asc = th.dataset.asc === "true" ? false : true;
      th.dataset.asc = asc;

      rows.sort((a, b) => {
        const va = a.querySelector(`td:nth-child(${th.cellIndex + 1})`).innerText;
        const vb = b.querySelector(`td:nth-child(${th.cellIndex + 1})`).innerText;

        let cmp = 0;
        if (!isNaN(va) && !isNaN(vb)) {
          cmp = parseFloat(va) - parseFloat(vb);
        } else {
          cmp = va.localeCompare(vb);
        }
        return asc ? cmp : -cmp;
      });

      rows.forEach((r) => table.querySelector("tbody").appendChild(r));
    });
  });
}
