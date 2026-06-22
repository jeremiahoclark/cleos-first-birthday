import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wallImageUrls,
  wallPostCaption,
  wallSlotLabels,
  resolveMediaKey,
  orderedSlotEntries
} from "../src/shared/wallPosts.js";
import { getMedia, getPartyWall } from "../src/shared/partyHandlers.js";

const LIVE_ENV = { DRY_RUN: "false", BETA_MODE: "false" };
const TINY_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";

function mockR2(store) {
  return {
    async get(key) {
      const value = store.get(key);
      if (value == null) return null;
      return { text: async () => value };
    },
    async put(key, value) {
      store.set(key, value);
    }
  };
}

function mockWallDb(rows) {
  const store = new Map(rows.map((row) => [row.id, row]));
  return {
    prepare(sql) {
      const handle = {
        bind(...args) {
          this.args = args;
          return this;
        },
        async all() {
          if (sql.includes("FROM submissions s")) {
            return {
              results: [...store.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
            };
          }
          if (sql.includes("FROM likes")) return { results: [] };
          if (sql.includes("FROM comments")) return { results: [] };
          return { results: [] };
        },
        async first() {
          if (sql.includes("FROM submissions WHERE id")) {
            return store.get(this.args[0]) || null;
          }
          return null;
        }
      };
      return handle;
    }
  };
}

test("wallPostCaption keeps user caption and text fields, not R2 keys", () => {
  const text = wallPostCaption({
    caption: "Met Sam by the cake",
    requiredFields: {
      "Person's name": "Sam",
      "Cleo with a favorite object": "events/cleo/slots/1.jpg"
    }
  });
  assert.equal(text, "Met Sam by the cake — Sam");
});

test("multi-slot submissions map to one wall post with multiple image URLs", () => {
  const requiredFields = {
    "Party decor": "events/cleo/guests/u1/sub1/slots/2-party-decor.jpg",
    "Food or cake nearby": "events/cleo/guests/u1/sub1/slots/3-food-or-cake-nearby.jpg",
    "Cleo with a favorite object": "events/cleo/guests/u1/sub1/slots/1-cleo-with-a-favorite-object.jpg",
    "A guest making her smile": "events/cleo/guests/u1/sub1/slots/4-a-guest-making-her-smile.jpg"
  };
  const urls = wallImageUrls("sub_1", "events/cleo/guests/u1/sub1", requiredFields);
  assert.equal(urls.length, 4);
  assert.deepEqual(
    urls,
    [
      "/api/media/sub_1/slot/0",
      "/api/media/sub_1/slot/1",
      "/api/media/sub_1/slot/2",
      "/api/media/sub_1/slot/3"
    ]
  );
  assert.deepEqual(wallSlotLabels(requiredFields), [
    "Cleo with a favorite object",
    "Party decor",
    "Food or cake nearby",
    "A guest making her smile"
  ]);
});

test("single-photo submissions still use the main media endpoint", () => {
  const urls = wallImageUrls("sub_2", "events/cleo/guests/u1/sub2", {
    "Their name": "Ravi"
  });
  assert.deepEqual(urls, ["/api/media/sub_2"]);
});

test("getMedia serves slot images from R2 by submission id", async () => {
  const mediaKey = "events/cleo-first-birthday/guests/u1/sub_abc";
  const slotKey = `${mediaKey}/slots/1-party-decor.jpg`;
  const bucket = mockR2(new Map([[slotKey, TINY_JPEG]]));
  const requiredFields = { "Party decor": slotKey };
  const env = {
    ...LIVE_ENV,
    MEDIA_BUCKET: bucket,
    DB: mockWallDb([
      {
        id: "sub_abc",
        media_key: mediaKey,
        required_fields_json: JSON.stringify(requiredFields)
      }
    ])
  };

  const main = await getMedia(env, "sub_abc");
  assert.equal(main.status, 200);
  // Main collage key is not stored in this fixture — placeholder is expected.
  assert.match(main.headers.get("content-type") || "", /svg/);

  const slot = await getMedia(env, "sub_abc/slot/0");
  assert.equal(slot.status, 200);
  assert.match(slot.headers.get("content-type") || "", /image\/jpeg/);
  assert.equal(resolveMediaKey({ mediaKey, requiredFields, slotIndex: 0 }), slotKey);
});

test("getPartyWall returns one grouped card with imageUrls for multi-slot quest", async () => {
  const mediaKey = "events/cleo-first-birthday/guests/u1/sub_wall";
  const requiredFields = {
    Alpha: `${mediaKey}/slots/1-alpha.jpg`,
    Beta: `${mediaKey}/slots/2-beta.jpg`
  };
  const env = {
    ...LIVE_ENV,
    DB: mockWallDb([
      {
        id: "sub_wall",
        user_id: "u1",
        quest_id: "cleo-museum",
        caption: "Museum night",
        required_fields_json: JSON.stringify(requiredFields),
        media_key: mediaKey,
        composition_mode: "collage",
        created_at: "2024-06-22 12:10:00",
        game_name: "Party Pro",
        like_count: 2,
        comment_count: 1
      }
    ])
  };

  const res = await getPartyWall(new URL("http://localhost/api/party-wall"), env);
  const body = await res.json();
  assert.equal(body.posts.length, 1);
  const post = body.posts[0];
  assert.equal(post.caption, "Museum night");
  assert.equal(post.imageUrls.length, 2);
  assert.equal(wallPostCaption(post), "Museum night");
  assert.deepEqual(post.slotLabels, ["Alpha", "Beta"]);
});

test("orderedSlotEntries sorts slot keys deterministically", () => {
  const entries = orderedSlotEntries({
    z: "events/x/slots/9-z.jpg",
    a: "events/x/slots/1-a.jpg",
    m: "events/x/slots/5-m.jpg"
  });
  assert.deepEqual(
    entries.map(([, value]) => value),
    ["events/x/slots/1-a.jpg", "events/x/slots/5-m.jpg", "events/x/slots/9-z.jpg"]
  );
});
