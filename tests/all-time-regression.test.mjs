import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = vm.createContext({ window: {}, console });
vm.runInContext(fs.readFileSync("scripts/player-widget-core.js", "utf8"), context);

const aggregate = vm.runInContext("mergePlayers", context);
const phases = vm.runInContext("mergePhaseData", context);
const mapping = vm.runInContext("resolveSeasons", context);

test("All-time selection includes both archived and new season", () => {
  const years = mapping("all", ["2025", "2026", "2027"]);
  assert.deepEqual(Array.from(years), ["2025", "2026", "2027"]);
});

test("All-time statistics sum goals, assists, games and penalties across seasons", () => {
  let players = [];
  const player = (games, goals, assists, penaltyMinutes) => ({name:"Sample Player",games,goals,assists,points:goals+assists,penaltyMinutes});
  players = aggregate(players, {league:37,players:[player(8,3,6,4)]}, "Senioren", false);
  players = aggregate(players, {league:37,players:[player(10,5,4,8)]}, "Senioren", false);
  assert.equal(players.length,1);
  assert.equal(players[0].games,18);
  assert.equal(players[0].goals,8);
  assert.equal(players[0].assists,10);
  assert.equal(players[0].points,18);
  assert.equal(players[0].penaltyMinutes,12);
  assert.equal(players[0].pointsPerGame,1);
});

test("Multiple phase results are combined once per player", () => {
  const p = (games, points) => ({name:"Sample Player",games,goals:points,assists:0,points,penaltyMinutes:0});
  const result = phases([{league:37,players:[p(6,7)]},{league:37,players:[p(2,3)]}],2027,"Senioren");
  assert.equal(result.players.length,1);
  assert.equal(result.players[0].games,8);
  assert.equal(result.players[0].points,10);
});

test("SIHF goalkeepers never appear among skater All-Time leaders", () => {
  let players = [];
  players = aggregate(players, {league:37,players:[
    {name:"Nietlispach Thomas",position:"Torhüter",games:6,goals:0,assists:0,points:0,penaltyMinutes:0},
    {name:"Field Skater",position:"Stürmer",games:6,goals:2,assists:1,points:3,penaltyMinutes:0}
  ]}, "Senioren", false);
  assert.equal(players.length, 1);
  assert.equal(players[0].name, "Field Skater");
});

test("Historical phase merger excludes goalie records without removing the source", () => {
  const data = [{league:37,players:[
    {name:"Nietlispach Thomas",position:"Torhüter",games:6,goals:0,assists:0,points:0,penaltyMinutes:0},
    {name:"Field Skater",position:"Verteidiger",games:4,goals:1,assists:0,points:1,penaltyMinutes:2}
  ]},{league:37,players:[{name:"Field Skater",position:"Verteidiger",games:2,goals:1,assists:1,points:2,penaltyMinutes:0}]}];
  const result = phases(data,2022,"Senioren");
  assert.deepEqual(result.players.map(p=>p.name),["Field Skater"]);
  assert.equal(result.players[0].points,3);
});
