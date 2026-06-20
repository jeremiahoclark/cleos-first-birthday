import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTeamName, chooseBalancedTeam } from "../src/shared/teamNames.js";

test("generateTeamName returns a two-word festive name", () => {
  const name = generateTeamName(0);
  assert.match(name, /^[A-Z][a-z]+ [A-Z][a-z]+$/);
});

test("generateTeamName cycles through distinct names for the first teams", () => {
  const names = Array.from({ length: 8 }, (_, i) => generateTeamName(i));
  assert.equal(new Set(names).size, names.length, "first 8 team names should be unique");
});

test("generateTeamName is deterministic for a given index", () => {
  assert.equal(generateTeamName(3), generateTeamName(3));
});

test("chooseBalancedTeam picks the team with the fewest members", () => {
  const teams = [
    { id: "a", memberCount: 5 },
    { id: "b", memberCount: 2 },
    { id: "c", memberCount: 4 }
  ];
  assert.equal(chooseBalancedTeam(teams).id, "b");
});

test("chooseBalancedTeam skips teams at max capacity", () => {
  const teams = [
    { id: "a", memberCount: 7 },
    { id: "b", memberCount: 7 },
    { id: "c", memberCount: 6 }
  ];
  assert.equal(chooseBalancedTeam(teams, 7).id, "c");
});

test("chooseBalancedTeam returns null when every team is full", () => {
  const teams = [
    { id: "a", memberCount: 7 },
    { id: "b", memberCount: 7 }
  ];
  assert.equal(chooseBalancedTeam(teams, 7), null);
});

test("chooseBalancedTeam handles an empty roster", () => {
  assert.equal(chooseBalancedTeam([]), null);
  assert.equal(chooseBalancedTeam(), null);
});
