import { isDryRun } from "./dryRun.js";

const EVENT_ID = "cleo-first-birthday";
const CONNECTIONS_KEY = `stats:${EVENT_ID}:connections`;

let dryConnectionCount = 0;

export function connectionStatsKey() {
  return CONNECTIONS_KEY;
}

export async function getConnectionCount(env) {
  if (isDryRun(env)) return dryConnectionCount;
  if (!env.DEVICE_KV) return 0;
  const raw = await env.DEVICE_KV.get(CONNECTIONS_KEY);
  return Number(raw) || 0;
}

export async function incrementConnectionCount(env) {
  if (isDryRun(env)) {
    dryConnectionCount += 1;
    return dryConnectionCount;
  }
  if (!env.DEVICE_KV) return 0;
  const current = Number(await env.DEVICE_KV.get(CONNECTIONS_KEY)) || 0;
  const next = current + 1;
  await env.DEVICE_KV.put(CONNECTIONS_KEY, String(next));
  return next;
}
