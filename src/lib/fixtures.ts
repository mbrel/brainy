/**
 * Hand-designed stand-ins for the semantic layer, used to build and tune
 * the entire visual/physics system before any real model is wired in
 * (step 4 of the plan). Real extraction later returns the exact same
 * `AnalysisOutcome` shape — nothing downstream should need to change.
 */
import type { AnalysisOutcome } from './graph';

/** The primary fixture — spend most tuning time getting this one to feel alive. */
export const sideProject: AnalysisOutcome = {
  kind: 'graph',
  headline: "Here's how these pull apart.",
  nextStep: "Enjoyment and time are pulling against each other — that's the actual tension, not whether the idea is good.",
  graph: {
    concepts: [
      { id: 'side-project', label: 'Side project', group: 'motivation' },
      { id: 'enjoyment', label: 'Enjoyment', group: 'motivation' },
      { id: 'time', label: 'Time', group: 'constraint' },
      { id: 'effort', label: 'Effort', group: 'constraint' },
      { id: 'validation', label: 'Validation', group: 'uncertainty' },
      { id: 'audience', label: 'Audience', group: 'uncertainty' },
      { id: 'new-idea', label: 'New idea', group: 'alternative' },
      { id: 'opportunity', label: 'Opportunity cost', group: 'alternative' },
    ],
    relationships: [
      { source: 'side-project', target: 'enjoyment', strength: 0.9 },
      { source: 'side-project', target: 'time', strength: 0.7 },
      { source: 'time', target: 'effort', strength: 0.8 },
      { source: 'side-project', target: 'validation', strength: 0.5 },
      { source: 'validation', target: 'audience', strength: 0.9 },
      { source: 'new-idea', target: 'side-project', strength: 0.4 },
      { source: 'new-idea', target: 'opportunity', strength: 0.7 },
      { source: 'opportunity', target: 'time', strength: 0.3 },
    ],
  },
};

/** Dense, few concepts — tests tight clustering with almost no slack. */
export const tightDecision: AnalysisOutcome = {
  kind: 'graph',
  headline: 'Two things, pulling hard on each other.',
  nextStep: null,
  graph: {
    concepts: [
      { id: 'offer', label: 'New offer', group: 'option' },
      { id: 'current-job', label: 'Current role', group: 'option' },
      { id: 'stability', label: 'Stability', group: 'criteria' },
      { id: 'growth', label: 'Growth', group: 'criteria' },
    ],
    relationships: [
      { source: 'offer', target: 'growth', strength: 0.85 },
      { source: 'current-job', target: 'stability', strength: 0.8 },
      { source: 'offer', target: 'stability', strength: 0.2 },
      { source: 'current-job', target: 'growth', strength: 0.25 },
    ],
  },
};

/** Sprawling, many weak edges — tests that unrelated nodes actually drift apart. */
export const ideaSprawl: AnalysisOutcome = {
  kind: 'graph',
  headline: 'A lot here — most of it loosely held.',
  nextStep: 'Two or three of these are doing real work. The rest can wait without guilt.',
  graph: {
    concepts: [
      { id: 'newsletter', label: 'Newsletter', group: 'channel' },
      { id: 'audience-a', label: 'Audience', group: 'growth' },
      { id: 'video', label: 'Video series', group: 'channel' },
      { id: 'consistency', label: 'Consistency', group: 'constraint' },
      { id: 'rebrand', label: 'Rebrand', group: 'identity' },
      { id: 'name', label: 'New name', group: 'identity' },
      { id: 'community', label: 'Community', group: 'growth' },
      { id: 'burnout', label: 'Burnout', group: 'constraint' },
      { id: 'income', label: 'Income', group: 'goal' },
    ],
    relationships: [
      { source: 'newsletter', target: 'audience-a', strength: 0.6 },
      { source: 'newsletter', target: 'consistency', strength: 0.7 },
      { source: 'video', target: 'audience-a', strength: 0.5 },
      { source: 'video', target: 'consistency', strength: 0.6 },
      { source: 'rebrand', target: 'name', strength: 0.9 },
      { source: 'community', target: 'audience-a', strength: 0.4 },
      { source: 'burnout', target: 'consistency', strength: 0.5 },
      { source: 'income', target: 'audience-a', strength: 0.3 },
      { source: 'rebrand', target: 'income', strength: 0.15 },
    ],
  },
};

/** One dominant hub with everything orbiting it — tests a star topology. */
export const problemHub: AnalysisOutcome = {
  kind: 'graph',
  headline: 'Everything traces back to one thing.',
  nextStep: 'Fix the hub, and the rest may resolve on their own.',
  graph: {
    concepts: [
      { id: 'onboarding', label: 'Onboarding drop-off', group: 'problem' },
      { id: 'confusion', label: 'Confusion', group: 'cause' },
      { id: 'copy', label: 'Unclear copy', group: 'cause' },
      { id: 'support-load', label: 'Support load', group: 'consequence' },
      { id: 'churn', label: 'Early churn', group: 'consequence' },
    ],
    relationships: [
      { source: 'confusion', target: 'onboarding', strength: 0.8 },
      { source: 'copy', target: 'confusion', strength: 0.7 },
      { source: 'onboarding', target: 'support-load', strength: 0.6 },
      { source: 'onboarding', target: 'churn', strength: 0.75 },
    ],
  },
};

/** Two clean, unconnected pairs — tests that separate clusters actually separate. */
export const isolatedPairs: AnalysisOutcome = {
  kind: 'graph',
  headline: "Two separate things, that's all.",
  nextStep: null,
  graph: {
    concepts: [
      { id: 'diet', label: 'Diet', group: 'health' },
      { id: 'sleep', label: 'Sleep', group: 'health' },
      { id: 'client', label: 'Client work', group: 'business' },
      { id: 'pricing', label: 'Pricing', group: 'business' },
    ],
    relationships: [
      { source: 'diet', target: 'sleep', strength: 0.6 },
      { source: 'client', target: 'pricing', strength: 0.7 },
    ],
  },
};

/** A single concept — tests the degenerate no-relationships case. */
export const singleConcept: AnalysisOutcome = {
  kind: 'graph',
  headline: "Here's the one thing in this.",
  nextStep: "Say what you'd do first if this were the only thing on your plate.",
  graph: {
    concepts: [{ id: 'core', label: 'Whether to move cities', group: 'core' }],
    relationships: [],
  },
};

export const fixtures = {
  sideProject,
  tightDecision,
  ideaSprawl,
  problemHub,
  isolatedPairs,
  singleConcept,
};

export type FixtureName = keyof typeof fixtures;
