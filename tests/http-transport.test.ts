import assert from "node:assert/strict";
import test from "node:test";

import { validateMcpPostRequest } from "../src/transports/http.js";

function requestWithHeaders(headers: Record<string, string>) {
  return {
    headers
  } as const;
}

test("validateMcpPostRequest rejects transfer-encoding", () => {
  const result = validateMcpPostRequest(
    requestWithHeaders({
      "content-type": "application/json",
      "content-length": "10",
      "transfer-encoding": "chunked"
    }) as never,
    1024
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
    assert.match(result.error, /transfer-encoding/i);
  }
});

test("validateMcpPostRequest rejects missing content-length", () => {
  const result = validateMcpPostRequest(
    requestWithHeaders({
      "content-type": "application/json"
    }) as never,
    1024
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 411);
  }
});

test("validateMcpPostRequest rejects invalid negative content-length", () => {
  const result = validateMcpPostRequest(
    requestWithHeaders({
      "content-type": "application/json",
      "content-length": "-1"
    }) as never,
    1024
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
  }
});

test("validateMcpPostRequest rejects non-numeric content-length", () => {
  const result = validateMcpPostRequest(
    requestWithHeaders({
      "content-type": "application/json",
      "content-length": "abc"
    }) as never,
    1024
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 400);
  }
});

test("validateMcpPostRequest rejects oversized content-length", () => {
  const result = validateMcpPostRequest(
    requestWithHeaders({
      "content-type": "application/json",
      "content-length": "2048"
    }) as never,
    1024
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, 413);
  }
});

test("validateMcpPostRequest accepts bounded JSON request", () => {
  const result = validateMcpPostRequest(
    requestWithHeaders({
      "content-type": "application/json; charset=utf-8",
      "content-length": "256"
    }) as never,
    1024
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.contentLength, 256);
  }
});
