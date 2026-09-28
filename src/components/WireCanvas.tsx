import { useEffect, useRef } from 'react';
import type { AnalysisOutcome } from '../lib/graph';
import { ForceGraphSim } from '../lib/forceGraph';

export type Phase = 'idle' | 'untangle' | 'group' | 'simplify' | 'act';

interface Props {
  phase: Phase;
  outcome: AnalysisOutcome | null;
  /** Set by this component once the simulation exists, so App.tsx can read
      live positions for its HTML label overlays without re-rendering per frame. */
  simRef: React.MutableRefObject<ForceGraphSim | null>;
}

const AMBIENT_COUNT = 48;

function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const hsla = (hsl: string, alpha: number) => {
  const parts = hsl.split(/\s+/);
  if (parts.length < 3) return `hsla(0,0%,50%,${alpha})`;
  return `hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
};

// Deterministic per-string seed, so the same edge always bows the same
// way frame to frame (and re-render to re-render) instead of jittering.
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

/**
 * A relationship rendered as a stream of thought, not a ruler line: a
 * quadratic bow (direction/amount seeded per edge, so it's stable, not
 * random noise every frame) and a width that tapers from thick at the
 * source to thin at the target — "node → thick wire → tapering wire →
 * node" rather than a uniform connector. Canvas has no native
 * variable-width stroke, so this walks the curve in short segments,
 * interpolating width per segment; round caps hide the seams.
 */
function drawOrganicEdge(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number,
  seed: number, color: string,
  widthStart: number, widthEnd: number,
) {
  const rand = seededRandom(seed);
  const dx = bx - ax, dy = by - ay;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist, ny = dx / dist;
  const bowSign = rand() > 0.5 ? 1 : -1;
  const bowAmount = Math.min(dist * 0.16, 70) * (0.4 + rand() * 0.6) * bowSign;
  const midX = (ax + bx) / 2 + nx * bowAmount;
  const midY = (ay + by) / 2 + ny * bowAmount;

  const SEGMENTS = 14;
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  let prevX = ax, prevY = ay;
  for (let s = 1; s <= SEGMENTS; s++) {
    const t = s / SEGMENTS;
    const it = 1 - t;
    const x = it * it * ax + 2 * it * t * midX + t * t * bx;
    const y = it * it * ay + 2 * it * t * midY + t * t * by;
    ctx.lineWidth = widthStart + (widthEnd - widthStart) * t;
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.stroke();
    prevX = x; prevY = y;
  }
}

/**
 * Two layers share this one canvas:
 *
 * 1. Ambient background dots — pure atmosphere, unrelated to any input,
 *    identical in spirit to the portfolio homepage's hero wires. Full
 *    opacity only at `idle`; fades out once real analysis starts, so it
 *    never competes with the actual thinking.
 *
 * 2. The semantic graph itself, once `outcome.kind === 'graph'` — driven
 *    entirely by a live ForceGraphSim (see forceGraph.ts). This component
 *    does not decide where anything sits; it only steps the simulation
 *    each frame and draws its current state. Structure emerges from the
 *    physics settling, not from a scripted target layout.
 */
const WireCanvas = ({ phase, outcome, simRef }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const ax = useRef(new Float64Array(AMBIENT_COUNT));
  const ay = useRef(new Float64Array(AMBIENT_COUNT));
  const ambientOpacity = useRef(1);

  const phaseRef = useRef<Phase>(phase);
  const outcomeRef = useRef<AnalysisOutcome | null>(outcome);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { outcomeRef.current = outcome; }, [outcome]);

  // Cursor / touch drag on the ambient layer only — identical technique to
  // the homepage hero.
  const mouseX = useRef(-9999);
  const mouseY = useRef(-9999);
  const prevMouseX = useRef(-9999);
  const prevMouseY = useRef(-9999);
  const dragX = useRef(new Float64Array(AMBIENT_COUNT));
  const dragY = useRef(new Float64Array(AMBIENT_COUNT));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let vw = 0, vh = 0;
    const rand = seededRandom(7);

    const layoutAmbient = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = vw * dpr;
      canvas.height = vh * dpr;
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      for (let i = 0; i < AMBIENT_COUNT; i++) {
        ax.current[i] = rand() * vw;
        ay.current[i] = rand() * vh;
      }
      simRef.current?.resize(vw, vh);
    };

    layoutAmbient();
    window.addEventListener('resize', layoutAmbient);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onMove = (x: number, y: number) => { mouseX.current = x; mouseY.current = y; };
    const onMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); };
    if (!reducedMotion) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('touchmove', onTouchMove, { passive: true });
    }

    let lastTs = 0;
    let simGraphKey = '';

    const draw = (ts: number) => {
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0.016;
      lastTs = ts;
      const t = ts / 1000;
      const phaseNow = phaseRef.current;
      const outcomeNow = outcomeRef.current;

      vw = window.innerWidth;
      vh = window.innerHeight;
      ctx.clearRect(0, 0, vw, vh);

      const css = getComputedStyle(document.documentElement);
      const fg = css.getPropertyValue('--foreground').trim();
      const accent = css.getPropertyValue('--accent').trim();

      const currentGraph = outcomeNow?.kind === 'graph' ? outcomeNow.graph : null;

      // (Re)create the simulation exactly once per new graph — scattered
      // start positions, from there physics owns everything.
      const graphKey = currentGraph ? JSON.stringify(currentGraph.concepts.map((c) => c.id)) : '';
      if (currentGraph && graphKey !== simGraphKey) {
        simGraphKey = graphKey;
        simRef.current = new ForceGraphSim(currentGraph, vw, vh);
      } else if (!currentGraph) {
        simGraphKey = '';
        simRef.current = null;
      }

      // Ambient layer — full at idle, fades out once real analysis starts.
      const ambientTarget = phaseNow === 'idle' ? 0.45 : 0;
      ambientOpacity.current += (ambientTarget - ambientOpacity.current) * Math.min(dt * 2.5, 0.12);

      if (!reducedMotion && phaseNow === 'idle' && mouseX.current > -1000) {
        const RADIUS = 170, STRENGTH = 0.9;
        const mvx = prevMouseX.current > -1000 ? mouseX.current - prevMouseX.current : 0;
        const mvy = prevMouseY.current > -1000 ? mouseY.current - prevMouseY.current : 0;
        for (let i = 0; i < AMBIENT_COUNT; i++) {
          const dx = ax.current[i] - mouseX.current, dy = ay.current[i] - mouseY.current;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < RADIUS) {
            const falloff = 1 - d / RADIUS;
            dragX.current[i] += mvx * falloff * falloff * STRENGTH;
            dragY.current[i] += mvy * falloff * falloff * STRENGTH;
          }
        }
      }
      prevMouseX.current = mouseX.current;
      prevMouseY.current = mouseY.current;

      if (ambientOpacity.current > 0.01) {
        ctx.lineWidth = 0.6;
        const positions: [number, number][] = [];
        for (let i = 0; i < AMBIENT_COUNT; i++) {
          dragX.current[i] *= (1 - dt * 1.8);
          dragY.current[i] *= (1 - dt * 1.8);
          const ambX = Math.sin(t * 0.2 + i * 1.3) * 6 + dragX.current[i];
          const ambY = Math.cos(t * 0.17 + i * 2.1) * 5 + dragY.current[i];
          positions.push([ax.current[i] + ambX, ay.current[i] + ambY]);
        }
        for (let i = 0; i < AMBIENT_COUNT; i++) {
          for (let j = i + 1; j < AMBIENT_COUNT; j++) {
            const dx = positions[i][0] - positions[j][0], dy = positions[i][1] - positions[j][1];
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 110) {
              const op = ambientOpacity.current * (1 - d / 110) * 0.3;
              ctx.strokeStyle = hsla(fg, op);
              ctx.beginPath(); ctx.moveTo(...positions[i]); ctx.lineTo(...positions[j]); ctx.stroke();
            }
          }
        }
        ctx.fillStyle = hsla(fg, ambientOpacity.current);
        for (const [x, y] of positions) {
          ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
        }
      }

      // The semantic graph — the actual product.
      const sim = simRef.current;
      if (sim && currentGraph) {
        if (!sim.isSettled()) sim.step(dt);
        const settled = sim.isSettled();

        // The single strongest relationship becomes the "so what" once the
        // network has resolved — everything else recedes slightly so this
        // one reads as the point, not just another edge among many.
        let strongest: { source: string; target: string } | null = null;
        if (settled && currentGraph.relationships.length > 0) {
          const top = currentGraph.relationships.reduce((a, b) => (b.strength > a.strength ? b : a));
          strongest = { source: top.source, target: top.target };
        }
        const pulse = 0.75 + Math.sin(t * 2.4) * 0.25;

        // Edges: organic bowed, tapering strokes — width and opacity both
        // scaled by relationship strength, so weak ties read as faint
        // threads and strong ones as clearly drawn streams, never a
        // uniform diagram connector.
        for (const rel of currentGraph.relationships) {
          if (rel.strength < 0.1) continue;
          const a = sim.nodes.find((n) => n.id === rel.source);
          const b = sim.nodes.find((n) => n.id === rel.target);
          if (!a || !b) continue;
          const isStrongest = strongest && rel.source === strongest.source && rel.target === strongest.target;
          const op = (0.15 + rel.strength * 0.55) * (isStrongest ? pulse : 1);
          const baseWidth = 0.6 + rel.strength * (isStrongest ? 4.2 : 3);
          const color = hsla(settled ? accent : fg, isStrongest ? Math.min(1, op * 1.3) : op);
          drawOrganicEdge(ctx, a.x, a.y, b.x, b.y, hashSeed(rel.source + rel.target), color, baseWidth * 1.3, baseWidth * 0.45);
        }

        ctx.fillStyle = hsla(settled ? accent : fg, 0.9);
        for (const n of sim.nodes) {
          ctx.beginPath(); ctx.arc(n.x, n.y, settled ? 4 : 3, 0, Math.PI * 2); ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', layoutAmbient);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true" />;
};

export default WireCanvas;
