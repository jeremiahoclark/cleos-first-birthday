import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { WALL_WARMUP_QUEST, WALL_WARMUP_STATUS } from "../src/shared/wallWarmup.js";

const LIVE_ENV = {
  DRY_RUN: "false",
  BETA_MODE: "false",
  EVENT_NAME: "Cleo's First Birthday Quest",
  HOST_PIN: "cleo",
  GAME_DURATION_SECONDS: "3600"
};

const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

function createHarness({ gameStarted = false } = {}) {
  const r2 = new Map();
  const submissions = [];
  const kv = new Map();
  if (gameStarted) {
    kv.set("game:cleo-first-birthday:state", JSON.stringify({ started: true, startedAt: new Date().toISOString() }));
  }
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
    DEVICE_KV: {
      async get(key) {
        return kv.get(key) ?? null;
      },
      async put(key, value) {
        kv.set(key, value);
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
                quest_slot: this.args[4],
                quest_id: this.args[5],
                caption: this.args[6],
                status: this.args[10],
                media_key: this.args[8]
              });
            }
            return { meta: { changes: 1 } };
          },
          async all() {
            if (sql.includes("FROM submissions s")) {
              return {
                results: submissions.map((row, index) => ({
                  id: row.id,
                  user_id: "user_1",
                  quest_id: row.quest_id,
                  caption: row.caption,
                  required_fields_json: "{}",
                  media_key: row.media_key,
                  composition_mode: "plain",
                  created_at: new Date(Date.now() - index * 1000).toISOString(),
                  game_name: "Party Guest",
                  like_count: 0,
                  comment_count: 0
                }))
              };
            }
            if (sql.includes("FROM comments")) return { results: [] };
            return { results: [] };
          },
          async first() {
            return null;
          }
        };
        return handle;
      }
    }
  };
  return { env, submissions, r2 };
}

test("wall warmup posts are accepted before the hunt starts", async () => {
  const { env, submissions, r2 } = createHarness();
  const res = await worker.fetch(
    new Request("http://localhost/api/wall-post", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "user_1",
        boardId: "user_1",
        caption: "Hi Cleo!",
        mediaDataUrl: TINY_JPEG
      })
    }),
    env
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.submission.questId, WALL_WARMUP_QUEST.id);
  assert.equal(body.submission.status, WALL_WARMUP_STATUS);
  assert.equal(submissions.length, 1);
  assert.equal(r2.size, 1);

  const wallRes = await worker.fetch(new Request("http://localhost/api/party-wall"), env);
  const wall = await wallRes.json();
  assert.equal(wall.posts.length, 1);
  assert.equal(wall.posts[0].caption, "Hi Cleo!");
  assert.equal(wall.posts[0].questTitle, WALL_WARMUP_QUEST.title);
});

test("wall warmup posts are rejected after the hunt starts", async () => {
  const { env } = createHarness({ gameStarted: true });
  const res = await worker.fetch(
    new Request("http://localhost/api/wall-post", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userId: "user_1",
        boardId: "user_1",
        caption: "Too late",
        mediaDataUrl: TINY_JPEG
      })
    }),
    env
  );
  assert.equal(res.status, 400);
});
