/**
 * The "brain" of Brainy — takes raw text, returns a small structured graph
 * (never a wall of text). This is a mocked, heuristic version on purpose:
 * the plan (see project brief) is to prove the interaction and
 * visualization feel right before spending effort on a real LLM + backend.
 * `analyze()` is the one function to swap for a real model call later —
 * everything downstream (WireCanvas, App) only depends on this return
 * shape, not on how it was produced.
 */

export type StructureType = 'problem' | 'decision' | 'project' | 'idea' | 'unclear';

export interface ConceptNode {
  id: string;
  label: string;
  /** Role drives both position (see layout.ts) and the small text tag shown under the node. */
  role: 'core' | 'factor' | 'risk' | 'unknown' | 'next';
}

export interface AnalysisResult {
  type: StructureType;
  /** Short line shown above the structure, e.g. "Here's the shape of it." */
  headline: string;
  concepts: ConceptNode[];
  edges: [string, string][];
  /** Null when Brainy is deliberately not inventing one — see KEY UNKNOWN / NEXT QUESTION in the brief. */
  nextStep: string | null;
  /** Set only for the unclear/too-vague/nonsense paths — no graph is shown when this is set. */
  guidance?: string;
}

const MIN_LEN = 12;
const VAGUE_LEN = 40;

// Extremely small keyword heuristics — deliberately crude, this is the
// piece meant to be replaced by a real model. Kept in one place so that
// swap is a one-function change.
const DECISION_WORDS = /\b(decide|choos|either|or should i|which one|option|pick|between)\b/i;
const PROJECT_WORDS = /\b(build|building|launch|ship|ve been (working|thinking about)|project|side project|product|ve wanted to (start|make|build))\b/i;
const PROBLEM_WORDS = /\b(problem|issue|stuck|broken|struggl|keep(s)? happening|frustrat)\b/i;

function looksLikeNonsense(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 4) return true;
  // no vowels at all in a longer string reads as keyboard-mash
  if (letters.length > 8 && !/[aeiouAEIOU]/.test(letters)) return true;
  return false;
}

function splitClauses(text: string): string[] {
  return text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

function titleCase(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length > 42 ? t.slice(0, 40).trim() + '…' : t;
}

export function analyze(raw: string): AnalysisResult {
  const text = raw.trim();

  if (text.length < 3 || looksLikeNonsense(text)) {
    return {
      type: 'unclear',
      headline: "I couldn't find a clear problem to untangle.",
      concepts: [],
      edges: [],
      nextStep: null,
      guidance: 'Try one of these instead: a decision, a messy idea, a project, or a problem.',
    };
  }

  if (text.length < MIN_LEN) {
    return {
      type: 'unclear',
      headline: 'I need a little more to work with.',
      concepts: [],
      edges: [],
      nextStep: null,
      guidance: "What's the goal, the context, or the main constraint here?",
    };
  }

  const clauses = splitClauses(text);
  const distinctSignals = [DECISION_WORDS, PROJECT_WORDS, PROBLEM_WORDS].filter((re) => re.test(text)).length;

  // Multiple, genuinely different clauses each carrying their own signal
  // reads as "several unrelated threads" rather than one messy-but-single
  // situation — a crude proxy for the "multiple unrelated topics" case.
  if (clauses.length >= 3 && distinctSignals >= 2 && text.length > VAGUE_LEN * 3) {
    // Full clause text, not the truncated titleCase() version — clicking
    // "Focus on" re-runs analyze() on this label, and a pre-truncated
    // fragment (with its own trailing "…") starves the second pass of the
    // keywords it needs, pushing it into the generic idea fallback below.
    // Visual truncation for the button itself is CSS-only (see App.tsx).
    const threads = clauses.slice(0, 3).map((c, i) => ({
      id: `thread-${i}`,
      label: c.trim(),
      role: 'core' as const,
    }));
    return {
      type: 'unclear',
      headline: 'I found several different threads here.',
      concepts: threads,
      edges: [],
      nextStep: null,
      guidance: 'Untangle everything, or focus on one thread first?',
    };
  }

  if (text.length < VAGUE_LEN && distinctSignals === 0) {
    return {
      type: 'unclear',
      headline: 'I need a little more to work with.',
      concepts: [],
      edges: [],
      nextStep: null,
      guidance: "What's the goal, the context, or the main constraint here?",
    };
  }

  let type: StructureType = 'idea';
  if (DECISION_WORDS.test(text)) type = 'decision';
  else if (PROBLEM_WORDS.test(text)) type = 'problem';
  else if (PROJECT_WORDS.test(text)) type = 'project';

  const firstClause = titleCase(clauses[0] ?? text);
  const secondClause = clauses[1] ? titleCase(clauses[1]) : null;

  if (type === 'decision') {
    return {
      type,
      headline: "Here's the shape of the decision.",
      concepts: [
        { id: 'decision', label: firstClause, role: 'core' },
        { id: 'opt-a', label: 'Option A', role: 'factor' },
        { id: 'opt-b', label: 'Option B', role: 'factor' },
        { id: 'criteria', label: secondClause ?? 'What matters most', role: 'factor' },
        { id: 'unknown', label: 'Key unknown', role: 'unknown' },
      ],
      edges: [
        ['decision', 'opt-a'], ['decision', 'opt-b'],
        ['opt-a', 'criteria'], ['opt-b', 'criteria'],
        ['criteria', 'unknown'],
      ],
      nextStep: null,
      guidance: undefined,
    };
  }

  if (type === 'problem') {
    return {
      type,
      headline: "Here's the shape of the problem.",
      concepts: [
        { id: 'problem', label: firstClause, role: 'core' },
        { id: 'cause', label: secondClause ?? 'Likely cause', role: 'factor' },
        { id: 'constraint', label: 'Constraint', role: 'factor' },
        { id: 'consequence', label: 'Consequence', role: 'risk' },
        { id: 'next', label: 'Smallest useful step', role: 'next' },
      ],
      edges: [
        ['cause', 'problem'], ['constraint', 'problem'],
        ['problem', 'consequence'], ['problem', 'next'],
      ],
      nextStep: 'Try the smallest thing that would tell you if the cause is right.',
    };
  }

  if (type === 'project') {
    return {
      type,
      headline: "Here's the shape of the project.",
      concepts: [
        { id: 'goal', label: firstClause, role: 'core' },
        { id: 'context', label: secondClause ?? 'Who this is for', role: 'factor' },
        { id: 'constraint', label: 'Constraint', role: 'factor' },
        { id: 'risk', label: 'Biggest risk', role: 'risk' },
        { id: 'next', label: 'First useful step', role: 'next' },
      ],
      edges: [
        ['goal', 'context'], ['goal', 'constraint'],
        ['constraint', 'risk'], ['goal', 'next'],
      ],
      nextStep: 'Pick the one piece that, if it failed, would sink the rest — start there.',
    };
  }

  // idea — themes/relationships. A real second clause earns the honest
  // "no forced next step" treatment (matches "Complex idea" in the brief);
  // a single thin clause (e.g. after "Focus on" narrows to one fragment)
  // has nothing distinct to build a second theme from, so said so plainly
  // instead of faking one out of the same words already used for `core`.
  if (!secondClause) {
    return {
      type,
      headline: "Here's the one thing in this.",
      concepts: [{ id: 'core', label: firstClause, role: 'core' }],
      edges: [],
      nextStep: "Say what you'd do first if this were the only thing on your plate.",
    };
  }

  return {
    type,
    headline: "Here's what matters most, and what can wait.",
    concepts: [
      { id: 'core', label: firstClause, role: 'core' },
      { id: 'theme-a', label: secondClause, role: 'factor' },
      { id: 'theme-b', label: 'Related thread', role: 'factor' },
      { id: 'ignore', label: 'Can wait', role: 'unknown' },
    ],
    edges: [
      ['core', 'theme-a'], ['core', 'theme-b'], ['theme-b', 'ignore'],
    ],
    nextStep: null,
  };
}
