import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDeviceFingerprint,
  hashDeviceFingerprint,
  getClientIp
} from "../src/shared/device.js";

test("createDeviceFingerprint joins the available signals", () => {
  const fp = createDeviceFingerprint({
    deviceId: "dev-1",
    userAgent: "UA",
    ip: "1.2.3.4",
    acceptLanguage: "en-US"
  });
  assert.equal(fp, "dev-1|UA|1.2.3.4|en-US");
});

test("createDeviceFingerprint drops empty signals", () => {
  const fp = createDeviceFingerprint({ deviceId: "dev-1", userAgent: "", ip: "1.2.3.4" });
  assert.equal(fp, "dev-1|1.2.3.4");
});

test("hashDeviceFingerprint is a stable 64-char hex SHA-256", async () => {
  const hash = await hashDeviceFingerprint("dev-1|UA|1.2.3.4");
  assert.match(hash, /^[0-9a-f]{64}$/);
  const again = await hashDeviceFingerprint("dev-1|UA|1.2.3.4");
  assert.equal(hash, again, "same input must hash to the same value");
});

test("hashDeviceFingerprint differs for different devices", async () => {
  const a = await hashDeviceFingerprint("dev-1|UA");
  const b = await hashDeviceFingerprint("dev-2|UA");
  assert.notEqual(a, b);
});

test("getClientIp prefers CF-Connecting-IP", () => {
  const headers = new Headers({ "CF-Connecting-IP": "9.9.9.9", "X-Forwarded-For": "1.1.1.1, 2.2.2.2" });
  assert.equal(getClientIp({ headers }), "9.9.9.9");
});

test("getClientIp falls back to the first X-Forwarded-For entry", () => {
  const headers = new Headers({ "X-Forwarded-For": "1.1.1.1, 2.2.2.2" });
  assert.equal(getClientIp({ headers }), "1.1.1.1");
});

test("getClientIp returns empty string when no ip headers are present", () => {
  const headers = new Headers({});
  assert.equal(getClientIp({ headers }), "");
});
