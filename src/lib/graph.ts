/**
 * The semantic layer's output shape — deliberately dumb data, no layout.
 *
 * This is the boundary the whole rewrite hinges on: a model (today, a
 * hand-written fixture; later, Claude via Lovable's built-in AI) decides
 * WHAT concepts exist and HOW STRONGLY they relate. It never decides
 * WHERE anything sits on screen, what clusters visually, or what an edge
 * looks like. That's forceGraph.ts's job, entirely downstream of this.
 *
 * `group` is semantic metadata (what kind of thing this concept is —
 * a motivation, a constraint, a source of uncertainty), not a layout
 * instruction. The visual system may use it as a soft hint, but the
 * actual clustering must emerge from `relationships`, or the whole
 * "discovered, not drawn" premise collapses back into a diagram with
 * extra steps.
 */

export interface SemanticConcept {
  id: string;
  label: string;
  group: string;
}

export interface SemanticRelationship {
  source: string;
  target: string;
  /** 0 (barely related) – 1 (practically the same thought). */
  strength: number;
}

export interface SemanticGraph {
  concepts: SemanticConcept[];
  relationships: SemanticRelationship[];
}

export type AnalysisOutcome =
  | {
      kind: 'graph';
      graph: SemanticGraph;
      /** Short line shown once the network has settled. */
      headline: string;
      nextStep: string | null;
    }
  | {
      kind: 'unclear';
      headline: string;
      guidance: string;
    };
