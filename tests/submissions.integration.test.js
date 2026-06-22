import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

const LIVE_ENV = {
  DRY_RUN: "false",
  BETA_MODE: "false",
  EVENT_NAME: "Cleo's First Birthday Quest",
  HOST_PIN: "cleo",
  GAME_DURATION_SECONDS: "3600",
  DEVICE_KV: { get: async () => null, put: async () => {} }
};

const TINY_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

function createHarness() {
  const r2 = new Map();
  const submissions = [];
  const users = [];
  const env = {
    ...LIVE_ENV,
    MEDIA_BUCKET: {
      async put(key, value) {
        r2.set(key, value);
      },
      async get(key) {
        const value = r2.get(key);
        return value == null ? null : { text: async () => value };
      }
    },
    DB: {
      prepare(sql) {
        const handle = {
          bind(...args) {
            this.args = args;
            return this;
          },
          async run() {
            if (sql.includes("INSERT INTO submissions")) {
              submissions.push({
                id: this.args[0],
                event_id: this.args[1],
                team_id: this.args[2],
                user_id: this.args[3],
                quest_slot: this.args[4],
                quest_id: this.args[5],
                caption: this.args[6],
                required_fields_json: this.args[7],
                media_key: this.args[8],
                composition_mode: this.args[9],
                status: this.args[10],
                created_at: "2024-06-22 12:00:00",
                game_name: "Tester"
              });
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          },
          async all() {
            if (sql.includes("FROM submissions s")) {
              return {
                results: submissions.map((row) => ({
                  ...row,
                  like_count: 0,
                  comment_count: 0
                }))
              };
            }
            if (sql.includes("FROM likes")) return { results: [] };
            if (sql.includes("FROM comments")) return { results: [] };
            return { results: [] };
          },
          async first() {
            if (sql.includes("FROM submissions WHERE id")) {
              return submissions.find((row) => row.id === this.args[0]) || null;
            }
            return null;
          }
        };
        return handle;
      }
    }
  };
  return { env, r2, submissions };
}

test("submitQuest stores collage + slot images in R2 and returns one wall post", async () => {
  const { env, r2, submissions } = createHarness();
  const payload = {
    boardId: "board_1",
    userId: "user_1",
    questSlot: 8,
    questId: "cleo-museum",
    caption: "Our museum wing",
    requiredFields: {},
    compositionMode: "collage",
    mediaDataUrl: TINY_JPEG,
    slotImages: [TINY_JPEG, TINY_JPEG],
    slotLabels: ["Party decor", "Food or cake nearby"]
  };

  const submitRes = await worker.fetch(
    new Request("http://localhost/api/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }),
    env
  );
  assert.equal(submitRes.status, 200);
  const submitBody = await submitRes.json();
  assert.equal(submitBody.persisted, true);
  assert.equal(submissions.length, 1);

  const mediaKey = submitBody.submission.mediaKey;
  assert.ok(r2.has(mediaKey));
  assert.ok([...r2.keys()].some((key) => key.includes("/slots/1-party-decor.jpg")));
  assert.ok([...r2.keys()].some((key) => key.includes("/slots/2-food-or-cake-nearby.jpg")));

  const wallRes = await worker.fetch(new Request("http://localhost/api/party-wall"), env);
  const wallBody = await wallRes.json();
  assert.equal(wallBody.posts.length, 1);
  assert.equal(wallBody.posts[0].caption, "Our museum wing");
  assert.equal(wallBody.posts[0].imageUrls.length, 2);
  assert.deepEqual(wallBody.posts[0].slotLabels, ["Party decor", "Food or cake nearby"]);
});

test("submitQuest replaces prior slot on resubmit — one card per quest slot on wall", async () => {
  const { env, submissions } = createHarness();
  const base = {
    boardId: "board_1",
    userId: "user_1",
    questSlot: 3,
    questId: "silly-hat-snapshot",
    requiredFields: { "Hat wearer's first name": "Mario", "The hat story": "Fiesta hat" },
    compositionMode: "caption",
    mediaDataUrl: TINY_JPEG
  };

  await worker.fetch(
    new Request("http://localhost/api/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...base, caption: "First take" })
    }),
    env
  );
  await worker.fetch(
    new Request("http://localhost/api/submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...base, caption: "Better take" })
    }),
    env
  );

  assert.equal(submissions.length, 2);
  const wallRes = await worker.fetch(new Request("http://localhost/api/party-wall"), env);
  const wallBody = await wallRes.json();
  assert.equal(wallBody.posts.length, 2);
  const captions = wallBody.posts.map((post) => post.caption).sort();
  assert.deepEqual(captions, ["Better take", "First take"]);
});
