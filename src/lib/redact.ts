const SECRET_KEY_PATTERN = /\bS[A-Z2-7]{20,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi;

const BLOCKED_KEYS = new Set([
  "secret",
  "secretkey",
  "secret_key",
  "seed",
  "token",
  "authorization",
  "apiKey",
  "apikey",
  "privatekey",
  "private_key"
].map((entry) => entry.toLowerCase()));

function shouldDropKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return BLOCKED_KEYS.has(normalized);
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(SECRET_KEY_PATTERN, "[REDACTED_SECRET]")
    .replace(BEARER_PATTERN, "[REDACTED_BEARER]");
}

export function sanitizeDebugPayload<T>(payload: T): T {
  if (Array.isArray(payload)) {
    return payload.map((entry) => sanitizeDebugPayload(entry)) as T;
  }

  if (payload && typeof payload === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (shouldDropKey(key)) {
        continue;
      }
      result[key] = sanitizeDebugPayload(value);
    }
    return result as T;
  }

  if (typeof payload === "string") {
    return redactSensitiveText(payload) as T;
  }

  return payload;
}
