// Dry mode (a.k.a. BETA_MODE) is the safety default. It is ON unless an env var
// is set to the EXACT string "false". This fail-safe means a typo, a missing
// binding, or an unexpected value never silently enables writes to Cloudflare
// storage. Either DRY_RUN or BETA_MODE can turn it off; BOTH must read "false"
// for writes to happen, so the stricter of the two always wins.
export function isDryRun(env = {}) {
  const off = (value) => String(value).toLowerCase() === "false";
  const dryRunOff = env.DRY_RUN != null && off(env.DRY_RUN);
  const betaOff = env.BETA_MODE != null && off(env.BETA_MODE);

  // If neither var is present at all, default to dry mode (true).
  if (env.DRY_RUN == null && env.BETA_MODE == null) return true;

  // A var that is present but not "false" keeps dry mode on. Going live
  // requires every var that IS present to explicitly say "false".
  if (env.DRY_RUN != null && !dryRunOff) return true;
  if (env.BETA_MODE != null && !betaOff) return true;
  return false;
}

export async function persistWhenLive(env, operation) {
  if (isDryRun(env)) {
    return { persisted: false, dryRun: true };
  }
  const result = await operation();
  return { persisted: true, dryRun: false, result };
}
