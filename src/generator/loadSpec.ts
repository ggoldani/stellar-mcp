import { readFileSync } from "node:fs";
import { Spec } from "@stellar/stellar-sdk/contract";
import { z } from "zod";

const specFileSchema = z.object({
  format: z.literal("stellarmcp-contract-spec-v1"),
  version: z.literal(1),
  entries: z.array(z.string().min(1)).min(1)
});

export type LoadedSpec = {
  spec: Spec;
  entriesBase64: string[];
};

export function loadSpecFromWasmFile(path: string): LoadedSpec {
  const wasm = readFileSync(path);
  const spec = Spec.fromWasm(wasm);
  return {
    spec,
    entriesBase64: spec.entries.map((e) => e.toXDR("base64"))
  };
}

export function loadSpecFromJsonFile(path: string): LoadedSpec {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const parsed = specFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Invalid contract spec JSON (${path}): ${parsed.error.message}. Expected format "stellarmcp-contract-spec-v1", version 1, entries[].`
    );
  }
  const spec = new Spec(parsed.data.entries);
  return { spec, entriesBase64: parsed.data.entries };
}

export function loadSpecFromPath(path: string): LoadedSpec {
  if (path.endsWith(".wasm")) {
    return loadSpecFromWasmFile(path);
  }
  return loadSpecFromJsonFile(path);
}
