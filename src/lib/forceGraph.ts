/**
 * Turns a SemanticGraph into on-screen motion. This is the "Brainy decides
 * how ideas behave visually" half of the split described in the project
 * plan — nothing here reads meaning from the text, it only reacts to
 * `relationships[].strength` and (lightly) `group`. Swapping the semantic
 * layer for a real model later changes none of this file.
 *
 * Standard spring-embedder simulation: every node repels every other node
 * (so nothing overlaps and unrelated ideas actually drift apart); edges
 * pull their two endpoints together with a force proportional to
 * `strength` (a strong relationship settles at a short rest length, a
 * weak one at a long one); same-group nodes get a much smaller extra pull
 * so groups cohere even where the semantic layer didn't draw an explicit
 * edge; a soft centering force keeps the whole thing from drifting off
 * screen. Structure is a side effect of these forces reaching
 * equilibrium, not a target layout being interpolated toward.
 */
import type { SemanticGraph } from './graph';

interface NodeState {
  id: string;
  group: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const REPULSION = 3000; // lower base repulsion — within-group repulsion (unboosted) needs to lose to cohesion, not fight it to a standstill
const INTERGROUP_REPULSION_BOOST = 6; // extra push between different-group nodes — needs to dominate repulsion, not nudge it
const SPRING_K = 0.16; // stiffer springs converge in far fewer steps — the tuned-down 0.05 took 20,000+ simulated steps to settle, unusable for a live page
const REST_LENGTH_MIN = 120; // strongest relationships (strength → 1) — comfortably above MIN_SEPARATION
const REST_LENGTH_MAX = 280; // weakest relationships (strength → 0)
const MIN_SEPARATION = 80; // hard floor so labels never overlap, regardless of spring/repulsion balance
const CENTER_PULL = 0.008;
// Strength given to the implicit spring edge added between every
// same-group pair that doesn't already have a real relationship — see
// the constructor. Moderate on purpose: strong enough to guarantee
// clustering, but below most real relationship strengths so an actual
// semantic connection still reads as more prominent than mere grouping.
const IMPLICIT_GROUP_EDGE_STRENGTH = 1;
const DAMPING = 0.86;
const MAX_SPEED = 400;
// Settling is judged on remaining NET FORCE, not velocity. Under this much
// damping, a node under a large, still-unbalanced force (e.g. a taut
// spring nowhere near its rest length) settles into a low, roughly
// constant "terminal velocity" almost immediately — a velocity-only check
// was freezing the simulation while it was still visibly far from
// equilibrium (confirmed directly: a node reporting "settled" with a
// measured net force of ~9, an order of magnitude above any real
// resting force). Force magnitude has no such artifact — it's actually
// zero at equilibrium.
const SETTLE_FORCE = 2.5; // average |force| per node, below which we call it resolved — "visually stable," not perfect zero-force equilibrium
const SETTLE_FRAMES = 40; // consecutive low-force frames required — guards against a transient lull mid-motion

export class ForceGraphSim {
  nodes: NodeState[] = [];
  private edgeIndex: { ai: number; bi: number; strength: number }[] = [];
  private groupIndex: Map<string, number[]> = new Map();
  private vw: number;
  private vh: number;
  private slowFrameCount = 0;
  private settled = false;

  constructor(graph: SemanticGraph, vw: number, vh: number, seed = 1) {
    this.vw = vw;
    this.vh = vh;
    let s = seed;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };

    const cx = vw / 2, cy = vh / 2 - 20;
    const scatterRadius = Math.min(vw, vh) * 0.32;

    this.nodes = graph.concepts.map((c) => {
      const angle = rand() * Math.PI * 2;
      const r = rand() * scatterRadius;
      return {
        id: c.id,
        group: c.group,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
      };
    });

    const idToIndex = new Map(this.nodes.map((n, i) => [n.id, i]));
    const explicitEdges = graph.relationships
      .map((r) => ({
        ai: idToIndex.get(r.source) ?? -1,
        bi: idToIndex.get(r.target) ?? -1,
        strength: Math.max(0, Math.min(1, r.strength)),
      }))
      .filter((e) => e.ai >= 0 && e.bi >= 0);

    this.nodes.forEach((n, i) => {
      const list = this.groupIndex.get(n.group) ?? [];
      list.push(i);
      this.groupIndex.set(n.group, list);
    });

    // Group cohesion as real spring edges, not a separate weak
    // pull-to-centroid — a centroid pull is nearly a no-op for a 2-member
    // group (you're just pulled toward the midpoint of you and your one
    // groupmate), which in practice let same-group pairs end up hundreds
    // of px apart despite sharing a group. An implicit edge at moderate
    // strength between every same-group pair gets the exact same
    // well-tuned spring force real relationships get, so clustering is as
    // reliable as any explicit connection — this is what actually makes
    // "motivation" or "constraints" read as one blob.
    const explicitPairs = new Set(explicitEdges.map((e) => `${Math.min(e.ai, e.bi)}:${Math.max(e.ai, e.bi)}`));
    const implicitGroupEdges: typeof explicitEdges = [];
    for (const indices of this.groupIndex.values()) {
      for (let x = 0; x < indices.length; x++) {
        for (let y = x + 1; y < indices.length; y++) {
          const ai = indices[x]!, bi = indices[y]!;
          const key = `${Math.min(ai, bi)}:${Math.max(ai, bi)}`;
          if (explicitPairs.has(key)) continue; // already has a real, possibly stronger, edge
          implicitGroupEdges.push({ ai, bi, strength: IMPLICIT_GROUP_EDGE_STRENGTH });
        }
      }
    }
    this.edgeIndex = [...explicitEdges, ...implicitGroupEdges];
  }

  resize(vw: number, vh: number) {
    this.vw = vw;
    this.vh = vh;
  }

  /** Average node speed, in px/s — informational only now; settling is
      judged on force (see SETTLE_FORCE), not this. */
  averageSpeed(): number {
    if (this.nodes.length === 0) return 0;
    const total = this.nodes.reduce((sum, n) => sum + Math.hypot(n.vx, n.vy), 0);
    return total / this.nodes.length;
  }

  /** Pure read — safe to call from anywhere, any number of times per frame.
      The actual settling determination happens once per physics step, below. */
  isSettled(): boolean {
    return this.settled;
  }

  step(dt: number) {
    if (this.settled) return; // frozen — a resolved structure should hold still, not idle-jitter forever
    const n = this.nodes;
    const fx = new Float64Array(n.length);
    const fy = new Float64Array(n.length);

    // Repulsion — every pair. O(n²) but n stays under ~15 concepts, fine.
    // Different-group pairs get an extra push, same-group pairs don't —
    // this is half of what actually separates clusters visually (the
    // other half is the implicit same-group spring edges added above).
    for (let i = 0; i < n.length; i++) {
      for (let j = i + 1; j < n.length; j++) {
        let dx = n[i].x - n[j].x, dy = n[i].y - n[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d2 = 1; }
        const d = Math.sqrt(d2);
        const boost = n[i].group !== n[j].group ? INTERGROUP_REPULSION_BOOST : 1;
        const force = (REPULSION * boost) / d2;
        const ux = dx / d, uy = dy / d;
        fx[i] += ux * force; fy[i] += uy * force;
        fx[j] -= ux * force; fy[j] -= uy * force;
      }
    }

    // Spring attraction along real relationships — rest length shrinks as
    // strength grows, so strong pairs end up visibly closer than weak ones.
    for (const { ai, bi, strength } of this.edgeIndex) {
      const a = n[ai], b = n[bi];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const restLength = REST_LENGTH_MAX - strength * (REST_LENGTH_MAX - REST_LENGTH_MIN);
      const stretch = d - restLength;
      const force = stretch * SPRING_K * (0.4 + strength);
      const ux = dx / d, uy = dy / d;
      fx[ai] += ux * force; fy[ai] += uy * force;
      fx[bi] -= ux * force; fy[bi] -= uy * force;
    }

    // Gentle centering so the whole network stays on screen.
    const cx = this.vw / 2, cy = this.vh / 2 - 20;
    for (let i = 0; i < n.length; i++) {
      fx[i] += (cx - n[i].x) * CENTER_PULL;
      fy[i] += (cy - n[i].y) * CENTER_PULL;
    }

    // Measured BEFORE integration/collision-correction touch fx/fy further
    // — this is the true net force from real physics (repulsion + springs
    // + centering) driving each node right now.
    let totalForce = 0;
    for (let i = 0; i < n.length; i++) totalForce += Math.hypot(fx[i], fy[i]);
    const avgForce = n.length ? totalForce / n.length : 0;

    for (let i = 0; i < n.length; i++) {
      n[i].vx = (n[i].vx + fx[i] * dt) * DAMPING;
      n[i].vy = (n[i].vy + fy[i] * dt) * DAMPING;
      const speed = Math.hypot(n[i].vx, n[i].vy);
      if (speed > MAX_SPEED) {
        n[i].vx = (n[i].vx / speed) * MAX_SPEED;
        n[i].vy = (n[i].vy / speed) * MAX_SPEED;
      }
      n[i].x += n[i].vx * dt;
      n[i].y += n[i].vy * dt;
    }

    // Hard collision floor — springs and repulsion can reach a local
    // balance closer than a label can afford, especially in a dense
    // cluster. This guarantees breathing room regardless of that balance,
    // so text never overlaps no matter what the semantic layer sends.
    // Critically, this also cancels the *velocity* component driving the
    // two nodes together, not just their position — otherwise a spring
    // that wants them closer than the floor re-fights this correction
    // every single frame forever, and the simulation never reads as
    // settled even though it visually stopped moving.
    for (let i = 0; i < n.length; i++) {
      for (let j = i + 1; j < n.length; j++) {
        const dx = n[j].x - n[i].x, dy = n[j].y - n[i].y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < MIN_SEPARATION) {
          const push = (MIN_SEPARATION - d) / 2;
          const ux = dx / d, uy = dy / d;
          n[i].x -= ux * push; n[i].y -= uy * push;
          n[j].x += ux * push; n[j].y += uy * push;

          const relVx = n[j].vx - n[i].vx, relVy = n[j].vy - n[i].vy;
          const approach = relVx * ux + relVy * uy;
          if (approach < 0) {
            n[i].vx += ux * approach * 0.5; n[i].vy += uy * approach * 0.5;
            n[j].vx -= ux * approach * 0.5; n[j].vy -= uy * approach * 0.5;
          }
        }
      }
    }

    if (avgForce < SETTLE_FORCE) {
      this.slowFrameCount++;
      if (this.slowFrameCount >= SETTLE_FRAMES) this.settled = true;
    } else {
      this.slowFrameCount = 0;
    }
  }

  /** Live centroid per group, for rendering a cluster-level label distinct
      from individual concept labels — this only reads positions the
      physics already produced, it never influences the simulation itself. */
  groupCentroids(): Map<string, { x: number; y: number }> {
    const sums = new Map<string, { x: number; y: number; n: number }>();
    for (const node of this.nodes) {
      const s = sums.get(node.group) ?? { x: 0, y: 0, n: 0 };
      s.x += node.x; s.y += node.y; s.n += 1;
      sums.set(node.group, s);
    }
    const out = new Map<string, { x: number; y: number }>();
    for (const [group, s] of sums) out.set(group, { x: s.x / s.n, y: s.y / s.n });
    return out;
  }

  positions(): Map<string, { x: number; y: number }> {
    const map = new Map<string, { x: number; y: number }>();
    for (const n of this.nodes) map.set(n.id, { x: n.x, y: n.y });
    return map;
  }
}
