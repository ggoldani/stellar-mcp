import { NetworkError } from "./errors.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sanitizeUrlForLogs(input: string): string {
  try {
    const parsed = new URL(input);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return input;
  }
}

export async function fetchJsonWithTimeout<T>(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  retries = 2
): Promise<T> {
  const safeUrl = sanitizeUrlForLogs(input);
  let attempt = 0;
  let lastError: Error | undefined;

  while (attempt <= retries) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
    try {
      const response = await fetch(input, {
        ...init,
        signal: abortController.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw new NetworkError(
          `HTTP ${response.status} from ${safeUrl}. Response body: ${body.slice(0, 256)}`
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown HTTP request error";
      lastError = new NetworkError(
        `Network request failed for ${safeUrl}: ${message}`
      );
      if (attempt === retries) {
        break;
      }
      await sleep(100 * 2 ** attempt);
      attempt += 1;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new NetworkError(`Network request failed for ${safeUrl}.`);
}

export async function fetchTextWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  retries = 2
): Promise<string> {
  const safeUrl = sanitizeUrlForLogs(input);
  let attempt = 0;
  let lastError: Error | undefined;

  while (attempt <= retries) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
    try {
      const response = await fetch(input, {
        ...init,
        signal: abortController.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw new NetworkError(
          `HTTP ${response.status} from ${safeUrl}. Response body: ${body.slice(0, 256)}`
        );
      }

      return await response.text();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown HTTP request error";
      lastError = new NetworkError(
        `Network request failed for ${safeUrl}: ${message}`
      );
      if (attempt === retries) {
        break;
      }
      await sleep(100 * 2 ** attempt);
      attempt += 1;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new NetworkError(`Network request failed for ${safeUrl}.`);
}
