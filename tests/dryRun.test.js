import { test } from "node:test";
import assert from "node:assert/strict";
import { isDryRun, persistWhenLive } from "../src/shared/dryRun.js";

test("dry mode is ON by default when DRY_RUN is unset", () => {
  assert.equal(isDryRun({}), true);
  assert.equal(isDryRun(), true);
});

test("dry mode stays ON for any value except the exact string 'false'", () => {
  assert.equal(isDryRun({ DRY_RUN: "true" }), true);
  assert.equal(isDryRun({ DRY_RUN: "TRUE" }), true);
  assert.equal(isDryRun({ DRY_RUN: "1" }), true);
  assert.equal(isDryRun({ DRY_RUN: "yes" }), true);
});

test("dry mode turns OFF only with explicit 'false'", () => {
  assert.equal(isDryRun({ DRY_RUN: "false" }), false);
  assert.equal(isDryRun({ DRY_RUN: "FALSE" }), false);
});

test("BETA_MODE is an alias: it can turn dry mode off on its own", () => {
  assert.equal(isDryRun({ BETA_MODE: "false" }), false);
  assert.equal(isDryRun({ BETA_MODE: "true" }), true);
  // present-but-not-false keeps dry mode on
  assert.equal(isDryRun({ BETA_MODE: "1" }), true);
});

test("the stricter of DRY_RUN / BETA_MODE wins (any present var that isn't 'false' keeps it on)", () => {
  // both off -> live
  assert.equal(isDryRun({ DRY_RUN: "false", BETA_MODE: "false" }), false);
  // one still on -> dry
  assert.equal(isDryRun({ DRY_RUN: "false", BETA_MODE: "true" }), true);
  assert.equal(isDryRun({ DRY_RUN: "true", BETA_MODE: "false" }), true);
});

test("persistWhenLive does NOT run the storage operation in dry mode", async () => {
  let ran = false;
  const result = await persistWhenLive({ DRY_RUN: "true" }, async () => {
    ran = true;
    return "wrote-to-cloudflare";
  });
  assert.equal(ran, false, "the write callback must never execute in dry mode");
  assert.equal(result.persisted, false);
  assert.equal(result.dryRun, true);
  assert.equal(result.result, undefined);
});

test("persistWhenLive runs the storage operation when dry mode is off", async () => {
  let ran = false;
  const result = await persistWhenLive({ DRY_RUN: "false" }, async () => {
    ran = true;
    return "wrote-to-cloudflare";
  });
  assert.equal(ran, true);
  assert.equal(result.persisted, true);
  assert.equal(result.dryRun, false);
  assert.equal(result.result, "wrote-to-cloudflare");
});

test("default (no DRY_RUN var) behaves as dry mode and skips persistence", async () => {
  let ran = false;
  const result = await persistWhenLive({}, async () => {
    ran = true;
  });
  assert.equal(ran, false);
  assert.equal(result.persisted, false);
});
