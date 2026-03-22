import type { AppConfig } from "../config.js";

/**
 * Mirrors StellarMCP signing policy: unsigned / expert paths for generated Soroban tools.
 */
export function isUnsignedSigningMode(config: AppConfig): boolean {
  return (
    config.autoSignPolicy === "safe" ||
    (config.autoSignPolicy === "guarded" && config.autoSignLimit === 0) ||
    (!config.autoSignPolicy && !config.autoSign)
  );
}
