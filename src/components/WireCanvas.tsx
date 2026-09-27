import { useEffect, useRef } from 'react';
import type { AnalysisResult } from '../lib/analyze';
import { getActPosition } from '../lib/layout';

export type Phase = 'idle' | 'untangle' | 'group' | 'simplify' | 'act';

interface Props {
  phase: Phase;
  result: AnalysisResult | null;
}

const NODE_COUNT = 48;

function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const hsla = (hsl: string, alpha: number) => {
  const parts = hsl.split(/\s+/);
  if (parts.length < 3) return `hsla(0,0%,50%,${alpha})`;
  return `hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
};

/**
 * The wire engine. Same node/wire idiom as the portfolio's
 * ScrollMorphCanvas (chaos base positions, lerp-based morphing between
 * states, thin accent-colored connections), rebuilt standalone here rather
 * than imported, matching the pattern of every other spike in this body of
 * work (Sail Away, the 3D head mapper) carrying its own copy of shared
 * visual techniques instead of depending on the portfolio repo.
 *
 * Phases map directly to the product's MESS -> PATTERN -> STRUCTURE ->
 * ACTION arc:
 *  - idle: calm ambient drift, sparse connections. Cursor/touch drags
 *    nearby nodes (same velocity-drag technique as the homepage hero).
 *  - untangle: same nodes, more scatter + far more connections — the
 *    input's messiness made visible, not a spinner.
 *  - group: nodes pulled toward one cluster center per concept; edges
 *    limited to same-cluster pairs.
 *  - simplify: most nodes fade out; only the surviving ones (feeding the
 *    final concepts) remain, drifting toward their cluster center.
 *  - act: only `result.concepts.length` nodes remain, at their final
 *    layout positions, connected by `result.edges` — the resolved
 *    structure. Labels are rendered as HTML overlays in App.tsx, not
 *    canvas text, for legibility and accessibility.
 */
const WireCanvas = ({ phase, result }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const nx = useRef(new Float64Array(NODE_COUNT));
  const ny = useRef(new Float64Array(NODE_COUNT));
  const chaosX = useRef(new Float64Array(NODE_COUNT));
  const chaosY = useRef(new Float64Array(NODE_COUNT));
  const clusterX = useRef(new Float64Array(NODE_COUNT));
  const clusterY = useRef(new Float64Array(NODE_COUNT));
  const clusterOf = useRef(new Int32Array(NODE_COUNT));
  const opacity = useRef(new Float64Array(NODE_COUNT).fill(1));

  const phaseRef = useRef<Phase>(phase);
  const resultRef = useRef<AnalysisResult | null>(result);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { resultRef.current = result; }, [result]);

  // Cursor / touch drag — identical technique to the homepage hero: nodes
  // near the pointer get carried along its velocity, only while idle.
  const mouseX = useRef(-9999);
  const mouseY = useRef(-9999);
  const prevMouseX = useRef(-9999);
  const prevMouseY = useRef(-9999);
  const dragX = useRef(new Float64Array(NODE_COUNT));
  const dragY = useRef(new Float64Array(NODE_COUNT));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let vw = 0, vh = 0;
    const rand = seededRandom(7);

    const layoutChaos = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = vw * dpr;
      canvas.height = vh * dpr;
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      for (let i = 0; i < NODE_COUNT; i++) {
        chaosX.current[i] = rand() * vw;
        chaosY.current[i] = rand() * vh;
        if (nx.current[i] === 0 && ny.current[i] === 0) {
          nx.current[i] = chaosX.current[i];
          ny.current[i] = chaosY.current[i];
        }
      }
    };

    layoutChaos();
    window.addEventListener('resize', layoutChaos);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onMove = (x: number, y: number) => { mouseX.current = x; mouseY.current = y; };
    const onMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); };
    if (!reducedMotion) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('touchmove', onTouchMove, { passive: true });
    }

    let lastTs = 0;
    let lastClusterKey = '';

    const draw = (ts: number) => {
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0.016;
      lastTs = ts;
      const t = ts / 1000;
      const phaseNow = phaseRef.current;
      const res = resultRef.current;

      vw = window.innerWidth;
      vh = window.innerHeight;
      ctx.clearRect(0, 0, vw, vh);

      const css = getComputedStyle(document.documentElement);
      const fg = css.getPropertyValue('--foreground').trim();
      const accent = css.getPropertyValue('--accent').trim();

      // Recompute cluster centers once per new result (or lack thereof)
      const clusterKey = res ? `${res.concepts.length}:${res.type}` : 'none';
      if (clusterKey !== lastClusterKey) {
        lastClusterKey = clusterKey;
        const k = res ? Math.max(res.concepts.length, 1) : 5;
        const cx = vw / 2, cy = vh / 2 - 20;
        const radius = Math.min(vw, vh) * 0.22;
        for (let i = 0; i < NODE_COUNT; i++) {
          const cluster = i % k;
          clusterOf.current[i] = cluster;
          const angle = (cluster / k) * Math.PI * 2 - Math.PI / 2;
          const jitter = (rand() - 0.5) * 40;
          clusterX.current[i] = cx + Math.cos(angle) * radius + jitter;
          clusterY.current[i] = cy + Math.sin(angle) * radius + jitter;
        }
      }

      // Cursor/touch drag, idle only
      if (!reducedMotion && phaseNow === 'idle' && mouseX.current > -1000) {
        const RADIUS = 170, STRENGTH = 0.9;
        const mvx = prevMouseX.current > -1000 ? mouseX.current - prevMouseX.current : 0;
        const mvy = prevMouseY.current > -1000 ? mouseY.current - prevMouseY.current : 0;
        for (let i = 0; i < NODE_COUNT; i++) {
          const dx = nx.current[i] - mouseX.current, dy = ny.current[i] - mouseY.current;
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
      for (let i = 0; i < NODE_COUNT; i++) {
        dragX.current[i] *= (1 - dt * 1.8);
        dragY.current[i] *= (1 - dt * 1.8);
      }

      const survivingCount = res ? res.concepts.length : 0;

      for (let i = 0; i < NODE_COUNT; i++) {
        const ambX = Math.sin(t * 0.2 + i * 1.3) * 6;
        const ambY = Math.cos(t * 0.17 + i * 2.1) * 5;
        const isSurvivor = i < survivingCount;

        let tx = chaosX.current[i], ty = chaosY.current[i], targetOp = 0.55;

        if (phaseNow === 'idle') {
          tx = chaosX.current[i] + ambX; ty = chaosY.current[i] + ambY; targetOp = 0.45;
        } else if (phaseNow === 'untangle') {
          tx = chaosX.current[i] + ambX * 2.4; ty = chaosY.current[i] + ambY * 2.4; targetOp = 0.7;
        } else if (phaseNow === 'group') {
          tx = clusterX.current[i] + ambX * 0.6; ty = clusterY.current[i] + ambY * 0.6; targetOp = 0.6;
        } else if (phaseNow === 'simplify') {
          if (isSurvivor) { tx = clusterX.current[i]; ty = clusterY.current[i]; targetOp = 0.75; }
          else targetOp = 0;
        } else if (phaseNow === 'act') {
          if (isSurvivor && res) {
            const isCore = res.concepts[i]?.role === 'core';
            const pos = getActPosition(i, survivingCount, isCore, vw, vh);
            tx = pos.x; ty = pos.y;
            targetOp = 0.9;
          } else targetOp = 0;
        }

        const finalX = tx + dragX.current[i], finalY = ty + dragY.current[i];
        const spd = Math.min(dt * 3.5, 0.14);
        nx.current[i] += (finalX - nx.current[i]) * spd;
        ny.current[i] += (finalY - ny.current[i]) * spd;
        opacity.current[i] += (targetOp - opacity.current[i]) * Math.min(dt * 3, 0.15);
      }

      // Edges
      ctx.lineWidth = 0.6;
      if (phaseNow === 'idle' || phaseNow === 'untangle') {
        const threshold = phaseNow === 'untangle' ? 170 : 110;
        for (let i = 0; i < NODE_COUNT; i++) {
          for (let j = i + 1; j < NODE_COUNT; j++) {
            const dx = nx.current[i] - nx.current[j], dy = ny.current[i] - ny.current[j];
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < threshold) {
              const op = Math.min(opacity.current[i], opacity.current[j]) * (1 - d / threshold) * 0.3;
              ctx.strokeStyle = hsla(fg, op);
              ctx.beginPath(); ctx.moveTo(nx.current[i], ny.current[i]); ctx.lineTo(nx.current[j], ny.current[j]); ctx.stroke();
            }
          }
        }
      } else if (phaseNow === 'group' || phaseNow === 'simplify') {
        for (let i = 0; i < NODE_COUNT; i++) {
          for (let j = i + 1; j < NODE_COUNT; j++) {
            if (clusterOf.current[i] !== clusterOf.current[j]) continue;
            const dx = nx.current[i] - nx.current[j], dy = ny.current[i] - ny.current[j];
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 90) {
              const op = Math.min(opacity.current[i], opacity.current[j]) * 0.35;
              ctx.strokeStyle = hsla(accent, op);
              ctx.beginPath(); ctx.moveTo(nx.current[i], ny.current[i]); ctx.lineTo(nx.current[j], ny.current[j]); ctx.stroke();
            }
          }
        }
      } else if (phaseNow === 'act' && res) {
        ctx.lineWidth = 1;
        for (const [a, b] of res.edges) {
          const ai = res.concepts.findIndex((c) => c.id === a);
          const bi = res.concepts.findIndex((c) => c.id === b);
          if (ai < 0 || bi < 0) continue;
          const op = Math.min(opacity.current[ai], opacity.current[bi]) * 0.85;
          ctx.strokeStyle = hsla(accent, op);
          ctx.beginPath(); ctx.moveTo(nx.current[ai], ny.current[ai]); ctx.lineTo(nx.current[bi], ny.current[bi]); ctx.stroke();
        }
      }

      // Nodes
      for (let i = 0; i < NODE_COUNT; i++) {
        if (opacity.current[i] < 0.01) continue;
        const isSurvivor = i < survivingCount;
        const useAccent = phaseNow === 'act' || phaseNow === 'simplify' || phaseNow === 'group';
        const r = phaseNow === 'act' && isSurvivor ? 4 : 2;
        ctx.fillStyle = useAccent ? hsla(accent, opacity.current[i]) : hsla(fg, opacity.current[i]);
        ctx.beginPath();
        ctx.arc(nx.current[i], ny.current[i], r, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', layoutChaos);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true" />;
};

export default WireCanvas;
