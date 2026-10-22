import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTurnJson, validateTurn, answersToProse, normalizeQuestions } from "./turn-result.mjs";

test("takes the last json block", () => {
  const text = 'thinking\n```json\n{"status":"blocked"}\n```\nmore\n```json\n{"status":"done","summary":"ok"}\n```';
  assert.deepEqual(extractTurnJson(text), { status: "done", summary: "ok" });
  assert.equal(extractTurnJson("no block"), null);
  assert.equal(extractTurnJson("```json\n{nope\n```"), null);
});

test("validates by status", () => {
  assert.deepEqual(validateTurn({ status: "done", summary: "ok" }), []);
  assert.ok(validateTurn({ status: "done" }).length);
  assert.ok(validateTurn({ status: "needs_input", summary: "s" }).length);
  assert.ok(validateTurn({ status: "needs_input", summary: "s", questions: Array(6).fill({ question: "q" }) }).length);
  assert.deepEqual(validateTurn({ status: "needs_input", summary: "s", questions: [{ question: "q", options: ["a"] }] }), []);
  assert.ok(validateTurn({ status: "blocked", summary: "s" }).length);
  assert.ok(validateTurn({ status: "done", summary: "s", links: { figma: "javascript:alert(1)" } }).length);
  assert.ok(validateTurn(null).length);
  assert.deepEqual(validateTurn({ status: "done", summary: "s", figma_nodes: ["12:34", "12-35"] }), []);
  assert.ok(validateTurn({ status: "done", summary: "s", figma_nodes: "12:34" }).length);
  assert.ok(validateTurn({ status: "done", summary: "s", figma_nodes: ["Direction A"] }).length);
});

test("answers render as prose, blanks become 'use your judgment'", () => {
  const qs = normalizeQuestions([{ question: "Who?" }, { question: "Where?", options: ["a", "b"] }]);
  assert.equal(qs[1].id, "q2");
  const prose = answersToProse(qs, { q1: "Talent" });
  assert.match(prose, /Who\?\n  → Talent/);
  assert.match(prose, /Where\?\n  → No answer — use your best judgment/);
});
