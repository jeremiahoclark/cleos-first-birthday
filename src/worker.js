import { generateQuestBoard, scoreSubmissions } from "./shared/quests.js";
import { generateTeamName } from "./shared/teamNames.js";
import { createDeviceFingerprint, getClientIp, hashDeviceFingerprint } from "./shared/device.js";
import { isDryRun, persistWhenLive } from "./shared/dryRun.js";

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

async function getTeamCount(env) {
  if (isDryRun(env) || !env.DB) return 0;
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM teams WHERE event_id = ?")
    .bind(EVENT_ID)
    .first();
  return row?.count ?? 0;
}

async function assignTeam(env, teamHint) {
  if (isDryRun(env) || !env.DB) {
    const index = Math.abs([...String(teamHint)].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 8;
    const id = `dry_team_${index + 1}`;
    return {
      id,
      name: generateTeamName(index),
      quests: generateQuestBoard(id)
    };
  }

  const existing = await env.DB.prepare(
    `SELECT teams.id, teams.name, teams.quest_board_json, COUNT(users.id) AS member_count
     FROM teams
     LEFT JOIN users ON users.team_id = teams.id
     WHERE teams.event_id = ?
     GROUP BY teams.id
     ORDER BY member_count ASC, teams.created_at ASC`
  )
    .bind(EVENT_ID)
    .all();

  const team = existing.results?.find((candidate) => Number(candidate.member_count) < 7);
  if (team) {
    return {
      id: team.id,
      name: team.name,
      quests: JSON.parse(team.quest_board_json)
    };
  }

  const index = await getTeamCount(env);
  const id = makeId("team");
  const name = generateTeamName(index);
  const quests = generateQuestBoard(id);
  await env.DB.prepare("INSERT INTO teams (id, event_id, name, quest_board_json) VALUES (?, ?, ?, ?)")
    .bind(id, EVENT_ID, name, JSON.stringify(quests))
    .run();
  return { id, name, quests };
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
  const team = await assignTeam(env, `${deviceId}:${gameName}`);
  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "";
  const acceptLanguage = request.headers.get("accept-language") || "";
  const fingerprint = createDeviceFingerprint({ deviceId, userAgent, ip, acceptLanguage });
  const deviceHash = await hashDeviceFingerprint(fingerprint, crypto);

  const persistence = await persistWhenLive(env, async () => {
    await env.DB.prepare(
      `INSERT INTO users
       (id, event_id, real_name, game_name, team_id, device_id, device_hash, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(userId, EVENT_ID, realName, gameName, team.id, deviceId, deviceHash, ip, userAgent)
      .run();
    await env.DEVICE_KV.put(`device:${deviceHash}`, JSON.stringify({ userId, teamId: team.id, eventId: EVENT_ID }));
    return { userId };
  });

  return json({
    dryRun: isDryRun(env),
    persisted: persistence.persisted,
    user: { id: userId, realName, gameName, deviceId, deviceHash },
    team
  });
}

async function submitQuest(request, env) {
  const body = await parseJson(request);
  const submission = {
    id: makeId(isDryRun(env) ? "dry_submission" : "submission"),
    eventId: EVENT_ID,
    teamId: String(body.teamId || ""),
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

  if (!submission.teamId || !submission.userId || !submission.questId || !submission.questSlot) {
    return json({ error: "teamId, userId, questSlot, and questId are required" }, { status: 400 });
  }

  const mediaKey = `events/${EVENT_ID}/teams/${submission.teamId}/${submission.id}`;
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
        submission.teamId,
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
    submission: { ...submission, mediaDataUrl: isDryRun(env) ? submission.mediaDataUrl : undefined, mediaKey },
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

async function getStatus(env) {
  return json({
    event: {
      id: EVENT_ID,
      name: env.EVENT_NAME || "Cleo's First Birthday Team Quest",
      durationSeconds: Number(env.GAME_DURATION_SECONDS || 3600)
    },
    dryRun: isDryRun(env),
    quests: generateQuestBoard("preview-board")
  });
}

async function getAdmin(env) {
  if (isDryRun(env) || !env.DB) {
    return json({
      dryRun: true,
      teams: [],
      submissions: [],
      message: "Dry mode is active. Live D1/KV/R2 reads are intentionally skipped."
    });
  }

  const [teams, submissions] = await Promise.all([
    env.DB.prepare("SELECT id, name, score, created_at FROM teams WHERE event_id = ? ORDER BY created_at").bind(EVENT_ID).all(),
    env.DB.prepare(
      "SELECT id, team_id, user_id, quest_slot, quest_id, caption, status, created_at FROM submissions WHERE event_id = ? ORDER BY created_at DESC"
    )
      .bind(EVENT_ID)
      .all()
  ]);

  return json({ dryRun: false, teams: teams.results || [], submissions: submissions.results || [] });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/status") return getStatus(env);
    if (url.pathname === "/api/register" && request.method === "POST") return registerUser(request, env);
    if (url.pathname === "/api/submissions" && request.method === "POST") return submitQuest(request, env);
    if (url.pathname === "/api/feedback" && request.method === "POST") return submitFeedback(request, env);
    if (url.pathname === "/api/admin") return getAdmin(env);
    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
