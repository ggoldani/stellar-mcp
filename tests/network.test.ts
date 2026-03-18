import assert from "node:assert/strict";
import test from "node:test";

import { recommendFeeStroops } from "../src/tools/network.js";

test("recommendFeeStroops returns p99 when above base fee", () => {
  assert.equal(recommendFeeStroops("5000", "100"), "5000");
});

test("recommendFeeStroops falls back to base fee when p99 is lower", () => {
  assert.equal(recommendFeeStroops("50", "100"), "100");
});
