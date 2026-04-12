import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safePathSchema, isUnsafeUrlHost } from "../../src/lib/validate.js";

describe("safePathSchema", () => {
  const valid = [
    "./contracts/token.wasm",
    "token.wasm",
    "/home/user/project/target/release/token.wasm",
    "/opt/stellar/contracts/hello.wasm",
    "./build/hello_world.wasm",
  ];
  const invalid = [
    "/etc/passwd",
    "/etc/shadow",
    "../../etc/hosts",
    "../release/token.wasm",
    "/proc/self/mem",
    "/sys/kernel/notes",
    "/dev/stdin",
    "/root/.ssh/id_rsa",
    "/boot/vmlinuz",
    "/var/log/auth.log",
    "./../../secrets/key.pem",
    "/etc/../etc/hosts",
  ];
  for (const path of valid) {
    it(`accepts ${path}`, () => {
      assert.doesNotThrow(() => safePathSchema.parse(path));
    });
  }
  for (const path of invalid) {
    it(`rejects ${path}`, () => {
      assert.throws(() => safePathSchema.parse(path));
    });
  }
});

describe("isUnsafeUrlHost", () => {
  const safe = [
    "https://api.example.com",
    "https://anchor.stellar.org",
    "https://api.anchor.com/sep/transfer",
    "https://1.2.3.4", // public IP
  ];
  const unsafe = [
    "http://169.254.169.254/latest/meta-data/", // cloud metadata
    "https://localhost/path",
    "https://127.0.0.1/api",
    "https://10.0.0.1/internal",
    "https://192.168.1.1/admin",
    "https://172.16.0.1/private",
    "http://evil.com/api", // non-https
    "not-a-url",
  ];
  for (const url of safe) {
    it(`allows ${url}`, () => {
      assert.strictEqual(isUnsafeUrlHost(url), false);
    });
  }
  for (const url of unsafe) {
    it(`blocks ${url}`, () => {
      assert.strictEqual(isUnsafeUrlHost(url), true);
    });
  }
});
