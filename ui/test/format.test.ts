import { test } from "node:test";
import assert from "node:assert/strict";
import { fmt } from "../src/shared/format.js";

test("fmt: integer displays without decimals", () => {
  assert.equal(fmt(12), "12");
  assert.equal(fmt(0), "0");
  assert.equal(fmt(5000), "5000");
});

test("fmt: one decimal stays one decimal", () => {
  assert.equal(fmt(1.2), "1.2");
  assert.equal(fmt(12.1), "12.1");
  assert.equal(fmt(-3.5), "-3.5");
});

test("fmt: two decimals stay two decimals", () => {
  assert.equal(fmt(1.23), "1.23");
  assert.equal(fmt(12.12), "12.12");
});

test("fmt: more than two decimals are capped at two (no trailing zeroes)", () => {
  assert.equal(fmt(12.112312312312312), "12.11");
  assert.equal(fmt(1.23456), "1.23");
});

test("fmt: values that round up", () => {
  assert.equal(fmt(12.999999999), "13");
  assert.equal(fmt(1.999), "2");
});

test("fmt: floating-point artifacts are cleaned", () => {
  assert.equal(fmt(1.1000000000000001), "1.1");
  assert.equal(fmt(0.30000000000000004), "0.3");
});

test("fmt: zero and negatives", () => {
  assert.equal(fmt(0), "0");
  assert.equal(fmt(-0), "0");
  assert.equal(fmt(-1.234), "-1.23");
});

test("fmt: non-numeric values pass through (used for '—' placeholders)", () => {
  assert.equal(fmt(undefined), "—");
  assert.equal(fmt(null), "—");
});