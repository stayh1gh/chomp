/**
 * The contract every agent turn ends with: one fenced ```json block
 * (schemas/turn-result.schema.json). The runner — never the agent — turns it into card
 * state and chat messages. Validation is by hand: the shape is small and the error
 * messages go straight back to the agent on a retry.
 */

const STATUSES = new Set(["done", "answered", "needs_input", "blocked"]);

/** The last ```json fenced block in `text`, parsed, or null. */
export function extractTurnJson(text) {
  const blocks = [...(text ?? "").matchAll(/```json\s*\n([\s\S]*?)```/g)];
  if (!blocks.length) return null;
  try {
    return JSON.parse(blocks[blocks.length - 1][1]);
  } catch {
    return null;
  }
}

/** Returns a list of problems; empty means valid. */
export function validateTurn(r) {
  const errs = [];
  if (!r || typeof r !== "object") return ["turn result is not a JSON object"];
  if (!STATUSES.has(r.status)) errs.push(`status must be one of ${[...STATUSES].join(", ")}`);
  if (typeof r.summary !== "string" || !r.summary.trim()) errs.push("summary must be a non-empty string");
  if (r.status === "needs_input") {
    if (!Array.isArray(r.questions) || r.questions.length < 1 || r.questions.length > 5) {
      errs.push("needs_input requires 1–5 questions");
    } else {
      r.questions.forEach((q, i) => {
        if (typeof q?.question !== "string" || !q.question.trim()) errs.push(`questions[${i}].question is required`);
        if (q.options !== undefined && (!Array.isArray(q.options) || q.options.some((o) => typeof o !== "string"))) {
          errs.push(`questions[${i}].options must be an array of strings`);
        }
      });
    }
  }
  if (r.status === "blocked" && (typeof r.blocker !== "string" || !r.blocker.trim())) {
    errs.push("blocked requires a blocker string saying what you need");
  }
  if (r.links !== undefined) {
    if (typeof r.links !== "object" || Array.isArray(r.links)) errs.push("links must be an object of name → url");
    else for (const [k, v] of Object.entries(r.links)) if (!/^https?:\/\//.test(v)) errs.push(`links.${k} must be an http(s) url`);
  }
  if (r.figma_nodes !== undefined && (!Array.isArray(r.figma_nodes) || r.figma_nodes.some((id) => typeof id !== "string" || !/^\d+[:-]\d+$/.test(id)))) {
    errs.push('figma_nodes must be an array of Figma node ids like "12:34"');
  }
  return errs;
}

/** Normalizes questions: stable ids, options default to []. */
export function normalizeQuestions(questions) {
  return questions.map((q, i) => ({
    id: q.id ?? `q${i + 1}`,
    question: q.question.trim(),
    options: q.options ?? [],
    recommended: q.recommended ?? null,
  }));
}

/** Renders answered questions back to the agent as prose. */
export function answersToProse(questions, answers) {
  const lines = questions.map((q) => {
    const a = answers?.[q.id];
    const answer = a && String(a).trim() ? String(a).trim() : "No answer — use your best judgment and state the assumption.";
    return `- ${q.question}\n  → ${answer}`;
  });
  return `Answers to your questions:\n${lines.join("\n")}`;
}
