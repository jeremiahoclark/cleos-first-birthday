import { test } from "node:test";
import assert from "node:assert/strict";
import { getLeaderboard } from "../src/shared/partyHandlers.js";

// isDryRun is fail-safe ON, so tests must explicitly opt into the live path.
const LIVE_ENV = { DRY_RUN: "false", BETA_MODE: "false" };

// Tiny D1-shaped mock: distinguishes the two getLeaderboard queries by SQL.
function mockDb(users, subs) {
  return {
    prepare(sql) {
      const handle = {
        bind() {
          return handle;
        },
        async all() {
          if (sql.includes("FROM users WHERE event_id")) return { results: users };
          if (sql.includes("FROM submissions WHERE event_id")) return { results: subs };
          return { results: [] };
        },
        async first() {
          return null;
        }
      };
      return handle;
    }
  };
}

function sub(userId, slot, at) {
  return {
    user_id: userId,
    quest_slot: slot,
    quest_id: `q${slot}`,
    caption: "",
    required_fields_json: "{}",
    media_key: `events/x/guests/${userId}/s${slot}`,
    composition_mode: "plain",
    created_at: at
  };
}

test("getLeaderboard ranks finishers by sum of per-stage active time, not end-start", async () => {
  // Player started at 12:00:00.
  const start = "2024-06-22 12:00:00";
  const users = [{ id: "u1", game_name: "Speedy", real_name: "Speedy", created_at: start }];
  const subs = [
    // Stage 1 cleared at 12:12 (12 min active).
    sub("u1", 1, "2024-06-22 12:05:00"),
    sub("u1", 2, "2024-06-22 12:08:00"),
    sub("u1", 3, "2024-06-22 12:12:00"),
    // Stage 2 unlocks at 12:20. Cleared 12:30 -> 10 min active (waited free).
    sub("u1", 4, "2024-06-22 12:24:00"),
    sub("u1", 5, "2024-06-22 12:27:00"),
    sub("u1", 6, "2024-06-22 12:30:00"),
    // Stage 3 unlocks at 12:35. Cleared 12:48 -> 13 min active.
    sub("u1", 7, "2024-06-22 12:40:00"),
    sub("u1", 8, "2024-06-22 12:44:00"),
    sub("u1", 9, "2024-06-22 12:48:00"),
    // Final quest 2 min after stage 3.
    sub("u1", 10, "2024-06-22 12:50:00")
  ];

  const res = await getLeaderboard({ ...LIVE_ENV, DB: mockDb(users, subs) });
  const body = await res.json();

  assert.equal(body.ranked.length, 1);
  const entry = body.ranked[0];
  assert.equal(entry.finishedAll, true);
  assert.equal(entry.rank, 1);
  // 12 + 10 + 13 + 2 = 37 min = 2220 s
  assert.equal(entry.totalActiveSeconds, 2220);
  assert.deepEqual(entry.stages, [720, 600, 780, 120]);
});

test("a fast stage-1 grind does not beat someone who finished — waiting between unlocks is free", async () => {
  const start = "2024-06-22 12:00:00";
  const users = [
    { id: "grinder", game_name: "Grinder", real_name: "Grinder", created_at: start },
    { id: "social", game_name: "Social", real_name: "Social", created_at: start }
  ];
  const subs = [
    // Grinder rushes stage 1 in 2 min but then is gated by the 20-min unlock.
    sub("grinder", 1, "2024-06-22 12:00:40"),
    sub("grinder", 2, "2024-06-22 12:01:20"),
    sub("grinder", 3, "2024-06-22 12:02:00"),
    sub("grinder", 4, "2024-06-22 12:24:00"),
    sub("grinder", 5, "2024-06-22 12:27:00"),
    sub("grinder", 6, "2024-06-22 12:30:00"),
    sub("grinder", 7, "2024-06-22 12:40:00"),
    sub("grinder", 8, "2024-06-22 12:44:00"),
    sub("grinder", 9, "2024-06-22 12:48:00"),
    sub("grinder", 10, "2024-06-22 12:50:00"),
    // Social takes 12 min on stage 1 (mingling) but the same later pace.
    sub("social", 1, "2024-06-22 12:05:00"),
    sub("social", 2, "2024-06-22 12:08:00"),
    sub("social", 3, "2024-06-22 12:12:00"),
    sub("social", 4, "2024-06-22 12:24:00"),
    sub("social", 5, "2024-06-22 12:27:00"),
    sub("social", 6, "2024-06-22 12:30:00"),
    sub("social", 7, "2024-06-22 12:40:00"),
    sub("social", 8, "2024-06-22 12:44:00"),
    sub("social", 9, "2024-06-22 12:48:00"),
    sub("social", 10, "2024-06-22 12:50:00")
  ];

  const res = await getLeaderboard({ ...LIVE_ENV, DB: mockDb(users, subs) });
  const body = await res.json();
  // Both finished; grinder only saved 10 min on stage 1, rest identical.
  const grinder = body.ranked.find((e) => e.gameName === "Grinder");
  const social = body.ranked.find((e) => e.gameName === "Social");
  assert.ok(grinder.totalActiveSeconds < social.totalActiveSeconds);
  assert.equal(grinder.stages[0], 120); // 2 min
  assert.equal(social.stages[0], 720); // 12 min
  // But the stage-1 savings is the ONLY difference (10 min).
  assert.equal(social.totalActiveSeconds - grinder.totalActiveSeconds, 600);
});

test("incomplete players land in others, unranked, with null stage times", async () => {
  const start = "2024-06-22 12:00:00";
  const users = [{ id: "u2", game_name: "Partway", real_name: "Partway", created_at: start }];
  const subs = [
    sub("u2", 1, "2024-06-22 12:05:00"),
    sub("u2", 2, "2024-06-22 12:08:00"),
    sub("u2", 3, "2024-06-22 12:12:00")
  ];
  const res = await getLeaderboard({ ...LIVE_ENV, DB: mockDb(users, subs) });
  const body = await res.json();
  assert.equal(body.ranked.length, 0);
  assert.equal(body.others.length, 1);
  assert.equal(body.others[0].finishedAll, false);
  assert.equal(body.others[0].rank, null);
  assert.equal(body.others[0].totalActiveSeconds, null);
});

test("empty event falls back to sample data", async () => {
  const res = await getLeaderboard({ ...LIVE_ENV, DB: mockDb([], []) });
  const body = await res.json();
  assert.equal(body.sample, true);
  assert.ok(body.ranked.length > 0);
});
