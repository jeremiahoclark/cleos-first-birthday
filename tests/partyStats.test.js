import test from "node:test";
import assert from "node:assert/strict";
import { getConnectionCount, incrementConnectionCount } from "../src/shared/partyStats.js";
import { findHostSideQuest, HOST_SIDE_QUESTS } from "../src/shared/sideQuests.js";
import { scoreSubmissions } from "../src/shared/quests.js";

test("connection counter increments in dry mode", async () => {
  const env = { DRY_RUN: "true", BETA_MODE: "true" };
  const start = await getConnectionCount(env);
  const next = await incrementConnectionCount(env);
  assert.equal(next, start + 1);
});

test("host side quests are defined and discoverable", () => {
  assert.ok(HOST_SIDE_QUESTS.length >= 3);
  const quest = findHostSideQuest("host-cake-moment");
  assert.ok(quest);
  assert.equal(quest.title, "Cake Moment");
});

test("side quest submissions do not affect guest score", () => {
  const submissions = [
    { questSlot: 1, status: "submitted" },
    { questSlot: 0, status: "side_quest" }
  ];
  assert.equal(scoreSubmissions(submissions), 1);
});
