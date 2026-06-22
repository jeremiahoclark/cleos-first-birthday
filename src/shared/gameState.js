// Global game state controlled by the host. One "Start the hunt" button kicks
// off the game for EVERYONE — the global `startedAt` is what stage unlocks count
// from, so all guests share the same unlock clock regardless of when they joined.
//
// Stored in KV when live; a module-local variable in dry mode (matches the
// pattern in partyStats.js).

import { isDryRun } from "./dryRun.js";

const EVENT_ID = "cleo-first-birthday";
const STATE_KEY = `game:${EVENT_ID}:state`;

let dryState = { started: false, startedAt: null };

export function gameStateKey() {
  return STATE_KEY;
}

export async function getGameState(env) {
  if (isDryRun(env)) return { ...dryState };
  if (!env.DEVICE_KV) return { started: false, startedAt: null };
  const raw = await env.DEVICE_KV.get(STATE_KEY);
  if (!raw) return { started: false, startedAt: null };
  try {
    return JSON.parse(raw);
  } catch {
    return { started: false, startedAt: null };
  }
}

export async function startGame(env) {
  const state = { started: true, startedAt: new Date().toISOString() };
  if (isDryRun(env)) {
    dryState = state;
    return { ...dryState };
  }
  if (env.DEVICE_KV) await env.DEVICE_KV.put(STATE_KEY, JSON.stringify(state));
  return state;
}

export async function resetGame(env) {
  const state = { started: false, startedAt: null };
  if (isDryRun(env)) {
    dryState = state;
    return { ...dryState };
  }
  if (env.DEVICE_KV) await env.DEVICE_KV.put(STATE_KEY, JSON.stringify(state));
  return state;
}
