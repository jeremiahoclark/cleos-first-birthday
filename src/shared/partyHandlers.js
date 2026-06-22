// Party-wall, leaderboard, likes, comments, and media handlers for Cleo's quest.
// Kept in its own module so the main worker.js stays a thin router. All timing
// is server-authoritative: start = users.created_at (set at registration), and
// per-stage clears come from submission created_at timestamps.
//
// Speed ranking rewards socializing: a player's "active time" for a stage is
// measured from when that stage actually became available to them (the later of
// the scheduled unlock and their previous stage clear), so time spent mingling
// between unlocks is free and pure grinding is not rewarded.

import { isDryRun, persistWhenLive } from "./dryRun.js";
import { findQuestById } from "./quests.js";
import { samplePartyPosts, sampleLeaderboard } from "./samples.js";

const EVENT_ID = "cleo-first-birthday";

// Elapsed-from-start (seconds) at which each stage unlocks. Stage 1 = 0;
// stage 4 (slot 10) is gated on clearing stage 3, not on the clock.
export const STAGE_UNLOCK_SECONDS = { 2: 20 * 60, 3: 35 * 60 };

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function safeParse(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

// D1 CURRENT_TIMESTAMP is UTC "YYYY-MM-DD HH:MM:SS" with no zone marker.
// Normalize to ISO + Z so Date.parse treats it as UTC.
function toEpoch(value) {
  if (!value) return null;
  const iso = String(value).includes("T") ? String(value) : String(value).replace(" ", "T");
  const epoch = Date.parse(iso.endsWith("Z") ? iso : `${iso}Z`);
  return Number.isNaN(epoch) ? null : epoch;
}

function mediaPlaceholder() {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'>" +
    "<rect width='100%' height='100%' fill='#fff0f6'/>" +
    "<text x='50%' y='50%' font-size='140' text-anchor='middle' dominant-baseline='central'>🫧</text>" +
    "</svg>";
  return new Response(svg, {
    headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=60" }
  });
}

function submissionView(s) {
  const quest = findQuestById(s.quest_id);
  return {
    id: s.id,
    questSlot: Number(s.quest_slot),
    questId: s.quest_id,
    questTitle: quest?.title ?? `Quest ${s.quest_slot}`,
    prompt: quest?.prompt ?? "",
    caption: s.caption || "",
    requiredFields: safeParse(s.required_fields_json),
    imageUrl: s.media_key ? `/api/media/${s.id}` : null,
    compositionMode: s.composition_mode,
    createdAt: s.created_at
  };
}

export async function getMedia(env, id) {
  if (isDryRun(env) || !env.DB || !env.MEDIA_BUCKET) return mediaPlaceholder();
  try {
    const sub = await env.DB.prepare("SELECT media_key FROM submissions WHERE id = ?")
      .bind(id)
      .first();
    const key = sub?.media_key;
    if (!key) return mediaPlaceholder();
    const obj = await env.MEDIA_BUCKET.get(key);
    if (!obj) return mediaPlaceholder();
    const text = await obj.text();
    const match = text.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (match) {
      const mime = match[1] || "image/jpeg";
      if (match[2] === ";base64") {
        const bin = atob(match[3]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        return new Response(bytes, {
          headers: { "content-type": mime, "cache-control": "public, max-age=3600" }
        });
      }
      return new Response(match[3], {
        headers: { "content-type": mime, "cache-control": "public, max-age=3600" }
      });
    }
    return new Response(text, {
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  } catch {
    return mediaPlaceholder();
  }
}

export async function getLeaderboard(env) {
  if (isDryRun(env) || !env.DB) return json({ ...sampleLeaderboard(), dryRun: isDryRun(env) });

  let users;
  let subs;
  try {
    [users, subs] = await Promise.all([
      env.DB.prepare("SELECT id, game_name, real_name, created_at FROM users WHERE event_id = ?")
        .bind(EVENT_ID)
        .all(),
      env.DB.prepare(
        `SELECT user_id, quest_slot, quest_id, caption, required_fields_json, media_key, composition_mode, created_at
         FROM submissions WHERE event_id = ? AND status != 'rejected'`
      )
        .bind(EVENT_ID)
        .all()
    ]);
  } catch {
    // Schema not migrated yet — show samples instead of a 500.
    return json({ ...sampleLeaderboard(), dryRun: false });
  }

  const userList = users.results || [];
  if (!userList.length) return json({ ...sampleLeaderboard(), dryRun: isDryRun(env) });

  const byUser = new Map();
  for (const s of subs.results || []) {
    if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
    byUser.get(s.user_id).push(s);
  }

  const entries = [];
  for (const u of userList) {
    const list = byUser.get(u.id) || [];
    const slots = new Map(list.map((s) => [Number(s.quest_slot), s]));
    const score = slots.size;
    const startAt = toEpoch(u.created_at);

    const stageClear = (lo, hi) => {
      let latest = null;
      for (let sl = lo; sl <= hi; sl += 1) {
        const s = slots.get(sl);
        if (!s) return null;
        const t = toEpoch(s.created_at);
        if (latest === null || t > latest) latest = t;
      }
      return latest;
    };

    const s1 = stageClear(1, 3);
    const s2 = stageClear(4, 6);
    const s3 = stageClear(7, 9);
    const s4 = slots.get(10) ? toEpoch(slots.get(10).created_at) : null;

    // Active time per stage = clear − max(scheduled unlock, previous clear).
    // This makes waiting between unlocks free (social time) and only counts
    // actual questing, which discourages pure grinding.
    const d1 = s1 !== null && startAt !== null ? Math.max(0, (s1 - startAt) / 1000) : null;
    const s2Start = s2 !== null && s1 !== null && startAt !== null
      ? Math.max(startAt + STAGE_UNLOCK_SECONDS[2] * 1000, s1)
      : null;
    const d2 = s2 !== null && s2Start !== null ? Math.max(0, (s2 - s2Start) / 1000) : null;
    const s3Start = s3 !== null && s2 !== null && startAt !== null
      ? Math.max(startAt + STAGE_UNLOCK_SECONDS[3] * 1000, s2)
      : null;
    const d3 = s3 !== null && s3Start !== null ? Math.max(0, (s3 - s3Start) / 1000) : null;
    const d4 = s4 !== null && s3 !== null ? Math.max(0, (s4 - s3) / 1000) : null;

    const stages = [d1, d2, d3, d4];
    const finishedAll = s1 !== null && s2 !== null && s3 !== null && s4 !== null;
    const totalActive = stages.reduce((acc, d) => acc + (d ?? 0), 0);

    entries.push({
      userId: u.id,
      gameName: u.game_name,
      realName: u.real_name,
      score,
      finishedAll,
      totalActiveSeconds: finishedAll ? Math.round(totalActive) : null,
      stages: stages.map((d) => (d === null ? null : Math.round(d))),
      submissions: list
        .sort((a, b) => Number(a.quest_slot) - Number(b.quest_slot))
        .map(submissionView),
      sample: false
    });
  }

  entries.sort((a, b) => {
    if (a.finishedAll !== b.finishedAll) return a.finishedAll ? -1 : 1;
    if (a.totalActiveSeconds !== null && b.totalActiveSeconds !== null) {
      return a.totalActiveSeconds - b.totalActiveSeconds;
    }
    return 0;
  });

  const finisherIds = new Set(entries.filter((e) => e.finishedAll).slice(0, 10).map((e) => e.userId));
  const ranked = entries
    .filter((e) => finisherIds.has(e.userId))
    .map((e, i) => ({ ...e, rank: i + 1 }));
  const others = entries
    .filter((e) => !finisherIds.has(e.userId))
    .map((e) => ({ ...e, rank: null }));

  return json({ ranked, others, dryRun: isDryRun(env), sample: false });
}

export async function getPartyWall(url, env) {
  const userName = (url.searchParams.get("userName") || "").trim();

  if (isDryRun(env) || !env.DB) {
    return json({ posts: samplePartyPosts(), dryRun: isDryRun(env), sample: true });
  }

  let rows;
  try {
    rows = await env.DB.prepare(
      `SELECT s.id, s.user_id, s.quest_id, s.caption, s.required_fields_json, s.media_key, s.composition_mode, s.created_at,
              u.game_name,
              (SELECT COUNT(*) FROM likes l WHERE l.submission_id = s.id) AS like_count,
              (SELECT COUNT(*) FROM comments c WHERE c.submission_id = s.id) AS comment_count
       FROM submissions s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.event_id = ? AND s.status != 'rejected'
       ORDER BY s.created_at DESC
       LIMIT 200`
    )
      .bind(EVENT_ID)
      .all();
  } catch {
    return json({ posts: samplePartyPosts(), dryRun: false, sample: true });
  }

  const list = rows.results || [];
  if (!list.length) {
    return json({ posts: samplePartyPosts(), dryRun: false, sample: true });
  }

  const ids = list.map((r) => r.id);
  const placeholders = ids.map(() => "?").join(",");

  let likedIds = new Set();
  if (userName) {
    const liked = await env.DB.prepare(
      `SELECT submission_id FROM likes WHERE user_name = ? AND submission_id IN (${placeholders})`
    )
      .bind(userName, ...ids)
      .all();
    likedIds = new Set((liked.results || []).map((r) => r.submission_id));
  }

  const cmts = await env.DB.prepare(
    `SELECT id, submission_id, user_name, body, created_at
     FROM comments WHERE submission_id IN (${placeholders})
     ORDER BY created_at ASC LIMIT 500`
  )
    .bind(...ids)
    .all();
  const commentsBySub = new Map();
  for (const c of cmts.results || []) {
    if (!commentsBySub.has(c.submission_id)) commentsBySub.set(c.submission_id, []);
    commentsBySub.get(c.submission_id).push({
      id: c.id,
      userName: c.user_name,
      body: c.body,
      createdAt: c.created_at
    });
  }

  const posts = list.map((r) => {
    const quest = findQuestById(r.quest_id);
    return {
      id: r.id,
      userId: r.user_id,
      userName: r.game_name || "Guest",
      questId: r.quest_id,
      questTitle: quest?.title ?? "Party quest",
      prompt: quest?.prompt ?? "",
      caption: r.caption || "",
      requiredFields: safeParse(r.required_fields_json),
      imageUrl: r.media_key ? `/api/media/${r.id}` : null,
      createdAt: r.created_at,
      likeCount: r.like_count,
      likedByMe: likedIds.has(r.id),
      commentCount: r.comment_count,
      comments: commentsBySub.get(r.id) || [],
      sample: false
    };
  });

  return json({ posts, dryRun: isDryRun(env), sample: false });
}

export async function toggleLike(request, env) {
  const body = await parseJson(request);
  const submissionId = String(body.submissionId || "");
  const userName = String(body.userName || "").trim();
  if (!submissionId || !userName) {
    return json({ error: "submissionId and userName are required" }, { status: 400 });
  }

  let liked = true;
  await persistWhenLive(env, async () => {
    const del = await env.DB.prepare(
      "DELETE FROM likes WHERE submission_id = ? AND user_name = ?"
    )
      .bind(submissionId, userName)
      .run();
    if (del.meta && del.meta.changes > 0) {
      liked = false;
      return;
    }
    await env.DB.prepare(
      "INSERT INTO likes (id, event_id, submission_id, user_name) VALUES (?, ?, ?, ?)"
    )
      .bind(makeId("like"), EVENT_ID, submissionId, userName)
      .run();
    liked = true;
  });

  let likeCount = liked ? 1 : 0;
  if (!isDryRun(env) && env.DB) {
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM likes WHERE submission_id = ?")
      .bind(submissionId)
      .first();
    likeCount = Number(r?.n || 0);
  }
  return json({ liked, likeCount, dryRun: isDryRun(env) });
}

export async function addComment(request, env) {
  const body = await parseJson(request);
  const submissionId = String(body.submissionId || "");
  const userName = String(body.userName || "").trim();
  const textBody = String(body.body || "").trim().slice(0, 1000);
  if (!submissionId || !userName || !textBody) {
    return json({ error: "submissionId, userName, and body are required" }, { status: 400 });
  }

  const comment = {
    id: makeId(isDryRun(env) ? "dry_comment" : "comment"),
    submissionId,
    userName,
    body: textBody,
    createdAt: new Date().toISOString()
  };
  await persistWhenLive(env, async () => {
    await env.DB.prepare(
      "INSERT INTO comments (id, event_id, submission_id, user_name, body) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(comment.id, EVENT_ID, submissionId, userName, textBody)
      .run();
  });
  return json({ dryRun: isDryRun(env), persisted: true, comment });
}
