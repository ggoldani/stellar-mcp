import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import {
  decode,
  encode,
  guess,
  initSync,
  schema,
  types
} from "@stellar/stellar-xdr-json";

let initialized = false;

export function ensureXdrJsonInitialized(): void {
  if (initialized) {
    return;
  }
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("@stellar/stellar-xdr-json/stellar_xdr_json_bg.wasm");
  const bytes = readFileSync(wasmPath);
  initSync(bytes);
  initialized = true;
}

export function xdrTypesList(): string[] {
  ensureXdrJsonInitialized();
  return types();
}

export function xdrSchemaJsonString(typeName: string): string {
  ensureXdrJsonInitialized();
  return schema(typeName);
}

export function xdrGuessTypes(xdrBase64: string): string[] {
  ensureXdrJsonInitialized();
  return guess(xdrBase64);
}

export function xdrDecodeToJsonString(typeName: string, xdrBase64: string): string {
  ensureXdrJsonInitialized();
  return decode(typeName, xdrBase64);
}

export function xdrEncodeFromJsonString(typeName: string, json: string): string {
  ensureXdrJsonInitialized();
  return encode(typeName, json);
}
