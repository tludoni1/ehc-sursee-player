import test from "node:test";
import assert from "node:assert/strict";
import {makeTableUrl, verifyTable, matchesTeam, nextSeasonEntries, TEAM_CANDIDATES} from "../scripts/discover-current-season.js";

test("SIHF season is selected by season end year and actual phase", () => {
  const u=new URL(makeTableUrl("results",2028,37,71620));
  assert.equal(u.searchParams.get("filterQuery"),"2028/71620/01.07.2027-30.06.2028");
  assert.equal(u.searchParams.get("searchQuery"),"1//37");
});

test("Reject fallback to a different year or phase", () => {
  const base={data:[],pages:0,filters:[{alias:"Season",selected:"2028"},{alias:"Phase",selected:"999"}]};
  assert.throws(()=>verifyTable(base,"player",2028,71620,37),/Wrong SIHF Phase/);
  assert.throws(()=>verifyTable(base,"player",2027,999,37),/Wrong SIHF Season/);
});

test("Only actual Sursee team ID from nested game rows counts", () => {
  assert.equal(matchesTeam([{id:103941,type:"team"},{id:12345,type:"team"}],103941),true);
  assert.equal(matchesTeam([{id:12345,type:"team"},{id:23456,type:"team"}],103941),false);
});

test("Distinct phases create stable mappings with history-compatible filenames", () => {
 const found=nextSeasonEntries(2028,[
  {leagueId:10,teamId:103941,phaseId:88888,phase:"Playoffs 1/4 Final"},
  {leagueId:10,teamId:103941,phaseId:77777,phase:"Regular Season Gr. 3"}
 ]);
 assert.equal(found["2028"].phaseId,77777);
 assert.equal(found["2028-P1"].phaseId,88888);
 assert.equal(found["2028"].api,"table");
 assert.ok(TEAM_CANDIDATES["1 Mannschaft"].includes(10));
});

test("Identical phase filenames are refused", () => {
  assert.throws(()=>nextSeasonEntries(2028,[
   {leagueId:10,teamId:103941,phaseId:1,phase:"Regular Season"},
   {leagueId:10,teamId:103941,phaseId:2,phase:"Regular Season"}]),/Duplicate/);
});
