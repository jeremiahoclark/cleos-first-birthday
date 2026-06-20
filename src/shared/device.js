export function createDeviceFingerprint({ deviceId, userAgent = "", ip = "", acceptLanguage = "" }) {
  return [deviceId, userAgent, ip, acceptLanguage].filter(Boolean).join("|");
}

export async function hashDeviceFingerprint(input, cryptoImpl = globalThis.crypto) {
  const encoder = new TextEncoder();
  const digest = await cryptoImpl.subtle.digest("SHA-256", encoder.encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    ""
  );
}

