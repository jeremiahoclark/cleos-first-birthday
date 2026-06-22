import { generateQuestBoard, scoreSubmissions } from "./shared/quests.js";
import { createDeviceFingerprint, getClientIp, hashDeviceFingerprint } from "./shared/device.js";
import { isDryRun, persistWhenLive } from "./shared/dryRun.js";
import { getConnectionCount, incrementConnectionCount } from "./shared/partyStats.js";
import { HOST_SIDE_QUESTS, findHostSideQuest } from "./shared/sideQuests.js";
import { getGameState, startGame, resetGame } from "./shared/gameState.js";
import { WALL_WARMUP_QUEST, WALL_WARMUP_STATUS } from "./shared/wallWarmup.js";
import { AWARD_CATEGORIES, getAwards, setAward, clearAward } from "./shared/awards.js";
import {
  getLeaderboard,
  getPartyWall,
  toggleLike,
  addComment,
  getMedia,
  STAGE_UNLOCK_SECONDS
} from "./shared/partyHandlers.js";

const EVENT_ID = "cleo-first-birthday";

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

function createPlayerBoard(userId) {
  return {
    id: userId,
    quests: generateQuestBoard(userId)
  };
}

async function registerUser(request, env) {
  const body = await parseJson(request);
  const realName = String(body.realName || "").trim();
  const gameName = String(body.gameName || "").trim();
  const deviceId = String(body.deviceId || "").trim();

  if (!realName || !gameName || !deviceId) {
    return json({ error: "realName, gameName, and deviceId are required" }, { status: 400 });
  }

  const userId = makeId(isDryRun(env) ? "dry_user" : "user");
  const board = createPlayerBoard(userId);
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "";
  const acceptLanguage = request.headers.get("accept-language") || "";
  const fingerprint = createDeviceFingerprint({ deviceId, userAgent, ip, acceptLanguage });
  const deviceHash = await hashDeviceFingerprint(fingerprint, crypto);

  const persistence = await persistWhenLive(env, async () => {
    // Solo play: one guest, one board. team_id reuses the user id for schema compatibility.
    await env.DB.prepare("INSERT INTO teams (id, event_id, name, quest_board_json) VALUES (?, ?, ?, ?)")
      .bind(userId, EVENT_ID, gameName, JSON.stringify(board.quests))
      .run();
    await env.DB.prepare(
      `INSERT INTO users
       (id, event_id, real_name, game_name, team_id, device_id, device_hash, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(userId, EVENT_ID, realName, gameName, userId, deviceId, deviceHash, ip, userAgent)
      .run();
    await env.DEVICE_KV.put(`device:${deviceHash}`, JSON.stringify({ userId, boardId: userId, eventId: EVENT_ID }));
    return { userId };
  });

  return json({
    dryRun: isDryRun(env),
    persisted: persistence.persisted,
    user: { id: userId, realName, gameName, deviceId, deviceHash },
    board
  });
}

async function submitQuest(request, env) {
  const body = await parseJson(request);
  const boardId = String(body.boardId || body.teamId || "");
  const slotImages = Array.isArray(body.slotImages) ? body.slotImages.map(String) : [];
  const slotLabels = Array.isArray(body.slotLabels) ? body.slotLabels.map(String) : [];
  const submission = {
    id: makeId(isDryRun(env) ? "dry_submission" : "submission"),
    eventId: EVENT_ID,
    boardId,
    userId: String(body.userId || ""),
    questSlot: Number(body.questSlot),
    questId: String(body.questId || ""),
    caption: String(body.caption || ""),
    requiredFields: body.requiredFields || {},
    compositionMode: String(body.compositionMode || "plain"),
    mediaName: String(body.mediaName || ""),
    mediaDataUrl: String(body.mediaDataUrl || ""),
    status: "submitted",
    createdAt: new Date().toISOString()
  };

  if (!submission.boardId || !submission.userId || !submission.questId || !submission.questSlot) {
    return json({ error: "boardId, userId, questSlot, and questId are required" }, { status: 400 });
  }

  const mediaKey = `events/${EVENT_ID}/guests/${submission.userId}/${submission.id}`;
  const persistence = await persistWhenLive(env, async () => {
    if (submission.mediaDataUrl && env.MEDIA_BUCKET) {
      await env.MEDIA_BUCKET.put(mediaKey, submission.mediaDataUrl, {
        httpMetadata: { contentType: "text/plain; charset=utf-8" }
      });
    }
    for (let i = 0; i < slotImages.length; i += 1) {
      if (!slotImages[i] || !env.MEDIA_BUCKET) continue;
      const label = slotLabels[i] || `slot-${i + 1}`;
      const slotKey = `${mediaKey}/slots/${i + 1}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}.jpg`;
      await env.MEDIA_BUCKET.put(slotKey, slotImages[i], {
        httpMetadata: { contentType: "text/plain; charset=utf-8" }
      });
      submission.requiredFields[label] = slotKey;
    }
    await env.DB.prepare(
      `INSERT INTO submissions
       (id, event_id, team_id, user_id, quest_slot, quest_id, caption, required_fields_json, media_key, composition_mode, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        submission.id,
        EVENT_ID,
        submission.boardId,
        submission.userId,
        submission.questSlot,
        submission.questId,
        submission.caption,
        JSON.stringify(submission.requiredFields),
        mediaKey,
        submission.compositionMode,
        submission.status
      )
      .run();
    return { mediaKey };
  });

  return json({
    dryRun: isDryRun(env),
    persisted: persistence.persisted,
    submission: {
      ...submission,
      mediaDataUrl: isDryRun(env) ? submission.mediaDataUrl : undefined,
      slotImages: isDryRun(env) ? slotImages : undefined,
      mediaKey
    },
    score: scoreSubmissions([submission])
  });
}

async function submitFeedback(request, env) {
  const body = await parseJson(request);
  const message = String(body.message || "").trim();
  const category = String(body.category || "idea").trim();
  if (!message) return json({ error: "message is required" }, { status: 400 });

  const feedback = {
    id: makeId(isDryRun(env) ? "dry_feedback" : "feedback"),
    eventId: EVENT_ID,
    userId: String(body.userId || ""),
    category,
    message,
    createdAt: new Date().toISOString()
  };

  const persistence = await persistWhenLive(env, async () => {
    await env.DB.prepare("INSERT INTO feedback (id, event_id, user_id, category, message) VALUES (?, ?, ?, ?, ?)")
      .bind(feedback.id, EVENT_ID, feedback.userId || null, feedback.category, feedback.message)
      .run();
  });

  return json({ dryRun: isDryRun(env), persisted: persistence.persisted, feedback });
}

function hostPinValid(env, pin) {
  const expected = String(env.HOST_PIN || "").trim();
  if (!expected) return false;
  return String(pin || "").trim() === expected;
}

async function recordConnection(request, env) {
  const body = await parseJson(request);
  if (!body.metSomeoneNew) {
    return json({ dryRun: isDryRun(env), connectionCount: await getConnectionCount(env) });
  }

  if (isDryRun(env)) {
    const connectionCount = await incrementConnectionCount(env);
    return json({ dryRun: true, persisted: false, connectionCount });
  }

  const persistence = await persistWhenLive(env, async () => incrementConnectionCount(env));
  return json({
    dryRun: false,
    persisted: persistence.persisted,
    connectionCount: persistence.result ?? (await getConnectionCount(env))
  });
}

async function submitHostSideQuest(request, env) {
  const body = await parseJson(request);
  if (!hostPinValid(env, body.hostPin)) {
    return json({ error: "Invalid host pin" }, { status: 403 });
  }

  const sideQuest = findHostSideQuest(String(body.sideQuestId || ""));
  if (!sideQuest) return json({ error: "Unknown side quest" }, { status: 400 });

  const userId = String(body.userId || "host");
  const submission = {
    id: makeId(isDryRun(env) ? "dry_side" : "side_submission"),
    eventId: EVENT_ID,
    boardId: userId,
    userId,
    questSlot: 0,
    questId: sideQuest.id,
    caption: String(body.caption || sideQuest.title),
    requiredFields: { sideQuest: sideQuest.title, prompt: sideQuest.prompt },
    compositionMode: "plain",
    mediaName: `${sideQuest.id}.jpg`,
    mediaDataUrl: String(body.mediaDataUrl || ""),
    status: "side_quest",
    createdAt: new Date().toISOString()
  };

  const mediaKey = `events/${EVENT_ID}/host/${userId}/${submission.id}`;
  const persistence = await persistWhenLive(env, async () => {
    if (submission.mediaDataUrl && env.MEDIA_BUCKET) {
      await env.MEDIA_BUCKET.put(mediaKey, submission.mediaDataUrl, {
        httpMetadata: { contentType: "text/plain; charset=utf-8" }
      });
    }
    await env.DB.prepare(
      `INSERT INTO submissions
       (id, event_id, team_id, user_id, quest_slot, quest_id, caption, required_fields_json, media_key, composition_mode, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        submission.id,
        EVENT_ID,
        submission.boardId,
        submission.userId,
        submission.questSlot,
        submission.questId,
        submission.caption,
        JSON.stringify(submission.requiredFields),
        mediaKey,
        submission.compositionMode,
        submission.status
      )
      .run();
    return { mediaKey };
  });

  return json({
    dryRun: isDryRun(env),
    persisted: persistence.persisted,
    submission: {
      ...submission,
      mediaDataUrl: isDryRun(env) ? submission.mediaDataUrl : undefined,
      mediaKey
    }
  });
}

async function submitWallWarmup(request, env) {
  const body = await parseJson(request);
  const game = await getGameState(env);
  if (game.started) {
    return json({ error: "The hunt has started — post quest photos instead." }, { status: 400 });
  }

  const userId = String(body.userId || "");
  const boardId = String(body.boardId || body.teamId || userId);
  const mediaDataUrl = String(body.mediaDataUrl || "");
  if (!userId || !boardId || !mediaDataUrl) {
    return json({ error: "userId, boardId, and mediaDataUrl are required" }, { status: 400 });
  }

  const submission = {
    id: makeId(isDryRun(env) ? "dry_wall" : "wall_submission"),
    eventId: EVENT_ID,
    boardId,
    userId,
    questSlot: 0,
    questId: WALL_WARMUP_QUEST.id,
    caption: String(body.caption || "").trim(),
    requiredFields: {},
    compositionMode: "plain",
    mediaName: "waiting-room.jpg",
    mediaDataUrl,
    status: WALL_WARMUP_STATUS,
    createdAt: new Date().toISOString()
  };

  const mediaKey = `events/${EVENT_ID}/guests/${submission.userId}/${submission.id}`;
  const persistence = await persistWhenLive(env, async () => {
    if (submission.mediaDataUrl && env.MEDIA_BUCKET) {
      await env.MEDIA_BUCKET.put(mediaKey, submission.mediaDataUrl, {
        httpMetadata: { contentType: "text/plain; charset=utf-8" }
      });
    }
    await env.DB.prepare(
      `INSERT INTO submissions
       (id, event_id, team_id, user_id, quest_slot, quest_id, caption, required_fields_json, media_key, composition_mode, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        submission.id,
        EVENT_ID,
        submission.boardId,
        submission.userId,
        submission.questSlot,
        submission.questId,
        submission.caption,
        JSON.stringify(submission.requiredFields),
        mediaKey,
        submission.compositionMode,
        submission.status
      )
      .run();
    return { mediaKey };
  });

  return json({
    dryRun: isDryRun(env),
    persisted: persistence.persisted,
    submission: {
      ...submission,
      mediaDataUrl: isDryRun(env) ? submission.mediaDataUrl : undefined,
      mediaKey
    }
  });
}

async function startGameHandler(request, env) {
  const body = await parseJson(request);
  if (!hostPinValid(env, body.hostPin)) {
    return json({ error: "Invalid host pin" }, { status: 403 });
  }
  const game = await startGame(env);
  return json({ dryRun: isDryRun(env), game });
}

async function resetGameHandler(request, env) {
  const body = await parseJson(request);
  if (!hostPinValid(env, body.hostPin)) {
    return json({ error: "Invalid host pin" }, { status: 403 });
  }
  const game = await resetGame(env);
  return json({ dryRun: isDryRun(env), game });
}

async function getAwardsHandler(env) {
  return json({ categories: AWARD_CATEGORIES, winners: await getAwards(env) });
}

async function setAwardHandler(request, env) {
  const body = await parseJson(request);
  if (!hostPinValid(env, body.hostPin)) {
    return json({ error: "Invalid host pin" }, { status: 403 });
  }
  const categoryId = String(body.categoryId || "");
  const winners = body.winner
    ? await setAward(env, categoryId, body.winner)
    : await clearAward(env, categoryId);
  return json({ dryRun: isDryRun(env), categories: AWARD_CATEGORIES, winners });
}

async function getStatus(env) {
  return json({
    event: {
      id: EVENT_ID,
      name: env.EVENT_NAME || "Cleo's First Birthday Quest",
      durationSeconds: Number(env.GAME_DURATION_SECONDS || 3600)
    },
    dryRun: isDryRun(env),
    game: await getGameState(env),
    connectionCount: await getConnectionCount(env),
    // Per-stage unlock thresholds (seconds elapsed since the host starts the game).
    // Stage 1 = 0; stage 4 (slot 10) is gated on clearing stage 3, not the clock.
    stageUnlocks: STAGE_UNLOCK_SECONDS,
    quests: generateQuestBoard("preview-board")
  });
}

async function getHostSideQuests() {
  return json({ sideQuests: HOST_SIDE_QUESTS });
}

async function getAdmin(env) {
  if (isDryRun(env) || !env.DB) {
    return json({
      dryRun: true,
      guests: [],
      submissions: [],
      message: "Dry mode is active. Live D1/KV/R2 reads are intentionally skipped."
    });
  }

  const [guests, submissions] = await Promise.all([
    env.DB.prepare(
      `SELECT u.id, u.game_name, u.real_name, u.created_at,
              COUNT(DISTINCT CASE WHEN s.status != 'rejected' AND s.quest_slot BETWEEN 1 AND 10 THEN s.quest_slot END) AS score
       FROM users u
       LEFT JOIN submissions s ON s.user_id = u.id AND s.event_id = u.event_id
       WHERE u.event_id = ?
       GROUP BY u.id
       ORDER BY score DESC, u.created_at ASC`
    )
      .bind(EVENT_ID)
      .all(),
    env.DB.prepare(
      "SELECT id, user_id, quest_slot, quest_id, caption, status, created_at FROM submissions WHERE event_id = ? ORDER BY created_at DESC"
    )
      .bind(EVENT_ID)
      .all()
  ]);

  return json({ dryRun: false, guests: guests.results || [], submissions: submissions.results || [] });
}

function withAbsoluteSocialUrls(html, origin) {
  return html.replaceAll('content="/og-image.png"', `content="${origin}/og-image.png"`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (pathname === "/api/status") return getStatus(env);
    if (pathname === "/api/register" && request.method === "POST") return registerUser(request, env);
    if (pathname === "/api/submissions" && request.method === "POST") return submitQuest(request, env);
    if (pathname === "/api/wall-post" && request.method === "POST") return submitWallWarmup(request, env);
    if (pathname === "/api/connections" && request.method === "POST") return recordConnection(request, env);
    if (pathname === "/api/host/side-quests") return getHostSideQuests();
    if (pathname === "/api/host/side-quest" && request.method === "POST") return submitHostSideQuest(request, env);
    if (pathname === "/api/host/start" && request.method === "POST") return startGameHandler(request, env);
    if (pathname === "/api/host/reset" && request.method === "POST") return resetGameHandler(request, env);
    if (pathname === "/api/awards") return getAwardsHandler(env);
    if (pathname === "/api/host/award" && request.method === "POST") return setAwardHandler(request, env);
    if (pathname === "/api/feedback" && request.method === "POST") return submitFeedback(request, env);
    if (pathname === "/api/leaderboard") return getLeaderboard(env);
    if (pathname === "/api/party-wall" || pathname === "/api/wall") return getPartyWall(url, env);
    if (pathname === "/api/likes" && request.method === "POST") return toggleLike(request, env);
    if (pathname === "/api/comments" && request.method === "POST") return addComment(request, env);
    if (pathname.startsWith("/api/media/") && request.method === "GET") {
      return getMedia(env, pathname.slice("/api/media/".length));
    }
    if (pathname === "/api/admin") return getAdmin(env);
    if (pathname.startsWith("/api/")) return json({ error: "Not found" }, { status: 404 });
    const assetResponse = await env.ASSETS.fetch(request);
    const isHtml =
      pathname === "/" ||
      pathname === "/index.html" ||
      assetResponse.headers.get("content-type")?.includes("text/html");
    if (!isHtml || !assetResponse.ok) return assetResponse;
    const html = await assetResponse.text();
    return new Response(withAbsoluteSocialUrls(html, url.origin), {
      status: assetResponse.status,
      headers: assetResponse.headers
    });
  }
};
