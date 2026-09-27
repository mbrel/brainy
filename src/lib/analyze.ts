/**
 * Stands in for the semantic layer (see project plan step 4 — Lovable AI /
 * Haiku eventually replaces the fixture lookup below with a real
 * extraction call). The guardrails are real and will stay: cheap,
 * instant, and worth keeping even once a model is wired in, so an
 * obviously empty or nonsense input never spends a call.
 *
 * Everything downstream (forceGraph, WireCanvas, App) depends only on
 * `AnalysisOutcome` — nothing here decides layout, clustering, or how a
 * concept looks on screen.
 */
import type { AnalysisOutcome } from './graph';
import { fixtures, type FixtureName } from './fixtures';

const MIN_LEN = 12;

function looksLikeNonsense(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 4) return true;
  if (letters.length > 8 && !/[aeiouAEIOU]/.test(letters)) return true;
  return false;
}

// Dev-only way to exercise every fixture without needing real extraction
// yet — e.g. localhost:5173/?fixture=ideaSprawl. Falls back to the
// primary, most-tuned fixture otherwise.
function pickFixture(): FixtureName {
  if (typeof window === 'undefined') return 'sideProject';
  const requested = new URLSearchParams(window.location.search).get('fixture');
  return requested && requested in fixtures ? (requested as FixtureName) : 'sideProject';
}

export function analyze(raw: string): AnalysisOutcome {
  const text = raw.trim();

  if (text.length < 3 || looksLikeNonsense(text)) {
    return {
      kind: 'unclear',
      headline: "I couldn't find a clear problem to untangle.",
      guidance: 'Try one of these instead: a decision, a messy idea, a project, or a problem.',
    };
  }

  if (text.length < MIN_LEN) {
    return {
      kind: 'unclear',
      headline: 'I need a little more to work with.',
      guidance: "What's the goal, the context, or the main constraint here?",
    };
  }

  // TEMPORARY: real text is accepted and validated above, but the actual
  // graph is a fixture until step 4 swaps this for a live extraction call.
  return fixtures[pickFixture()];
}
