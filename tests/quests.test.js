import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QUEST_STAGES,
  FINAL_QUEST,
  generateQuestBoard,
  scoreSubmissions,
  createSeededRandom
} from "../src/shared/quests.js";

test("quest pool matches the plan structure: 3 stages, 3 slots each, 2 quests per slot", () => {
  assert.equal(QUEST_STAGES.length, 3);
  for (const stage of QUEST_STAGES) {
    assert.equal(stage.slots.length, 3, `stage ${stage.stage} must have 3 slots`);
    for (const pair of stage.slots) {
      assert.equal(pair.length, 2, "each slot must offer exactly two possible quests");
    }
  }
});

test("The Silly Hat Snapshot exists in the pool", () => {
  const allQuests = QUEST_STAGES.flatMap((stage) => stage.slots.flat());
  assert.ok(
    allQuests.some((quest) => quest.id === "silly-hat-snapshot"),
    "Silly Hat Snapshot must be a possible quest"
  );
});

test("generateQuestBoard always returns exactly 10 quests in slots 1-10", () => {
  const board = generateQuestBoard("team-alpha");
  assert.equal(board.length, 10);
  assert.deepEqual(
    board.map((quest) => quest.slot),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
});

test("slots 1-9 are each drawn from the correct staged pair", () => {
  const board = generateQuestBoard("team-bravo");
  let slot = 1;
  for (const stage of QUEST_STAGES) {
    for (const pair of stage.slots) {
      const allowedIds = pair.map((quest) => quest.id);
      const chosen = board[slot - 1];
      assert.ok(
        allowedIds.includes(chosen.id),
        `slot ${slot} must come from its pair (${allowedIds.join(", ")}), got ${chosen.id}`
      );
      assert.equal(chosen.stage, stage.stage);
      slot += 1;
    }
  }
});

test("slot 10 is always The Future Advice Council", () => {
  for (const seed of ["a", "b", "c", "team-x", "team-y", "12345"]) {
    const board = generateQuestBoard(seed);
    assert.equal(board[9].id, FINAL_QUEST.id);
    assert.equal(board[9].id, "future-advice-council");
    assert.equal(board[9].slot, 10);
  }
});

test("the board is deterministic per seed but varies across seeds", () => {
  const a1 = generateQuestBoard("repeat-seed").map((q) => q.id);
  const a2 = generateQuestBoard("repeat-seed").map((q) => q.id);
  assert.deepEqual(a1, a2, "same seed must produce the same board");

  // Across many seeds we should see at least two distinct slot-1 choices.
  const slot1Choices = new Set();
  for (let i = 0; i < 40; i += 1) {
    slot1Choices.add(generateQuestBoard(`seed-${i}`)[0].id);
  }
  assert.ok(slot1Choices.size >= 2, "randomization should produce different boards");
});

test("createSeededRandom yields stable numbers in [0,1)", () => {
  const rand = createSeededRandom("fixed");
  const values = [rand(), rand(), rand()];
  for (const value of values) {
    assert.ok(value >= 0 && value < 1, `value ${value} out of range`);
  }
  const rand2 = createSeededRandom("fixed");
  assert.deepEqual([rand2(), rand2(), rand2()], values);
});

test("scoring: 1 point per completed quest, max 10", () => {
  const submissions = Array.from({ length: 10 }, (_, i) => ({ questSlot: i + 1, status: "submitted" }));
  assert.equal(scoreSubmissions(submissions), 10);
});

test("scoring: no partial credit and no double counting a slot", () => {
  const submissions = [
    { questSlot: 1, status: "submitted" },
    { questSlot: 1, status: "submitted" }, // duplicate slot, still 1 point
    { questSlot: 2, status: "submitted" }
  ];
  assert.equal(scoreSubmissions(submissions), 2);
});

test("scoring: rejected submissions do not score", () => {
  const submissions = [
    { questSlot: 1, status: "rejected" },
    { questSlot: 2, status: "submitted" }
  ];
  assert.equal(scoreSubmissions(submissions), 1);
});

test("scoring: invalid slots are ignored", () => {
  const submissions = [
    { questSlot: 0, status: "submitted" },
    { questSlot: 11, status: "submitted" },
    { questSlot: "x", status: "submitted" },
    { questSlot: 5, status: "submitted" }
  ];
  assert.equal(scoreSubmissions(submissions), 1);
});

test("scoring: empty input scores zero", () => {
  assert.equal(scoreSubmissions(), 0);
  assert.equal(scoreSubmissions([]), 0);
});
