// Subjective award categories + their winners. Winners are picked by the host
// (with pin) and shown to everyone on the end screen. Stored in KV when live,
// module-local in dry mode.

import { isDryRun } from "./dryRun.js";

const EVENT_ID = "cleo-first-birthday";
const AWARDS_KEY = `awards:${EVENT_ID}`;

export const AWARD_CATEGORIES = [
  { id: "best-photo", emoji: "📸", title: "Best Photo" },
  { id: "best-new-friendship", emoji: "🤝", title: "Best New Friendship" },
  { id: "sweetest-message", emoji: "💌", title: "Sweetest Message" },
  { id: "most-chaotic-group-shot", emoji: "🎉", title: "Most Chaotic Group Shot" }
];

let dryAwards = {};

function safeParse(raw) {
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export async function getAwards(env) {
  if (isDryRun(env)) return { ...dryAwards };
  if (!env.DEVICE_KV) return {};
  const raw = await env.DEVICE_KV.get(AWARDS_KEY);
  return raw ? safeParse(raw) : {};
}

export async function setAward(env, categoryId, winner) {
  const all = await getAwards(env);
  all[categoryId] = winner; // { userId?, userName, submissionId? }
  if (isDryRun(env)) {
    dryAwards = all;
    return { ...dryAwards };
  }
  if (env.DEVICE_KV) await env.DEVICE_KV.put(AWARDS_KEY, JSON.stringify(all));
  return all;
}

export async function clearAward(env, categoryId) {
  const all = await getAwards(env);
  delete all[categoryId];
  if (isDryRun(env)) {
    dryAwards = all;
    return { ...dryAwards };
  }
  if (env.DEVICE_KV) await env.DEVICE_KV.put(AWARDS_KEY, JSON.stringify(all));
  return all;
}
