// Read-only diagnostic of the documented SIHF table endpoint.
// This file never writes production data and never displays player names.
const leagues = [
  { team: "Senioren", leagueId: 37, teamId: 105810 },
  { team: "1 Mannschaft", leagueId: 10, teamId: 103941 },
  { team: "2 Mannschaft", leagueId: 19, teamId: 104319 },
  { team: "Damen", leagueId: 43, teamId: 103700 },
];

const lookupTeam = (value, teamId) => {
  if (Array.isArray(value)) return value.some((v) => lookupTeam(v, teamId));
  if (!value || typeof value !== "object") return false;
  if (["team", "Team"].includes(value.type) && String(value.id) === String(teamId)) return true;
  if ("id" in value && String(value.id) === String(teamId)) return true;
  return Object.values(value).some((v) => typeof v === "object" && lookupTeam(v, teamId));
};

let missing = 0;
for (const alias of ["player", "goalkeeper"]) {
  for (const { team, leagueId, teamId } of leagues) {
    const url = new URL("https://data.sihf.ch/statistic/api/cms/table");
    url.searchParams.set("alias", alias);
    url.searchParams.set("searchQuery", `1//${leagueId}`);
    url.searchParams.set("language", "de");
    url.searchParams.set("filterBy", "Season");
    url.searchParams.set("filterQuery", "2027");
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      const rows = Array.isArray(raw.data) ? raw.data : Array.isArray(raw) ? raw : [];
      const matches = rows.filter((row) => lookupTeam(row, teamId)).length;
      console.log(JSON.stringify({
        alias, team, leagueId, teamId, status: res.status,
        responseKeys: Object.keys(raw).slice(0, 16),
        dataRows: rows.length, identifiedTeamRows: matches,
        filters: raw.filters ?? raw.filter ?? raw.selectedFilters ?? null,
        sampleRowCellTypes: rows.length && Array.isArray(rows[0]) ? rows[0].map((v) => typeof v) : [],
        selectedLeague: raw.filters?.find((f) => f.alias === "League")?.selected ?? null,
        firstTeamCells: rows.slice(0, 3).map(row => Array.isArray(row) ? row[2] : null),
        distinctTeamIds: [...new Set(rows.flatMap(row => Array.isArray(row) && row[2]?.id != null ? [String(row[2].id)] : []))].sort().slice(0, 50),
      }));
      if (!matches) missing++;
    } catch (error) {
      missing++;
      console.error(JSON.stringify({ alias, team, error: error.message }));
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}
if (missing) {
  console.error(`${missing} / 8 dataset(s) did not confirm the requested team. Review API schema and filters.`);
  process.exitCode = 1;
}
