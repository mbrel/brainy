import { useEffect, useRef, useState } from 'react';
import WireCanvas, { type Phase } from './components/WireCanvas';
import { analyze } from './lib/analyze';
import type { AnalysisOutcome } from './lib/graph';
import type { ForceGraphSim } from './lib/forceGraph';

// Generous total run before labels are eligible to appear — the actual
// gate is sim.isSettled() (checked below), this is just a floor so the
// "untangling / grouping / simplifying" status text doesn't flash by
// instantly on a graph that happens to settle fast.
const MIN_PHASE_MS: Record<Exclude<Phase, 'idle' | 'act'>, number> = {
  untangle: 900,
  group: 900,
  simplify: 700,
};

function App() {
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [outcome, setOutcome] = useState<AnalysisOutcome | null>(null);
  const [labelsVisible, setLabelsVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const settleInterval = useRef<ReturnType<typeof setInterval>>();
  const simRef = useRef<ForceGraphSim | null>(null);
  const labelRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const rafRef = useRef<number>(0);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (settleInterval.current) clearInterval(settleInterval.current);
  };

  const runUntangle = (text: string) => {
    if (!text.trim()) return;
    clearTimers();
    setSelectedId(null);
    setLabelsVisible(false);
    const result = analyze(text);
    setOutcome(result);

    if (result.kind === 'unclear') {
      setPhase('act');
      return;
    }

    setPhase('untangle');
    timers.current.push(setTimeout(() => {
      setPhase('group');
      timers.current.push(setTimeout(() => {
        setPhase('simplify');
        timers.current.push(setTimeout(() => {
          setPhase('act');
          // Labels wait for the simulation to actually settle, not a fixed
          // timer — a graph with more tension takes longer to resolve, and
          // the labels shouldn't lie about that by appearing early.
          settleInterval.current = setInterval(() => {
            if (simRef.current?.isSettled()) {
              setLabelsVisible(true);
              if (settleInterval.current) clearInterval(settleInterval.current);
            }
          }, 150);
        }, MIN_PHASE_MS.simplify));
      }, MIN_PHASE_MS.group));
    }, MIN_PHASE_MS.untangle));
  };

  const startOver = () => {
    clearTimers();
    setOutcome(null);
    setPhase('idle');
    setInput('');
    setSelectedId(null);
    setLabelsVisible(false);
  };

  // Drives label positions directly via the DOM each frame — reading the
  // live simulation, not React state, so this never fights the physics
  // loop or re-renders 8 times a second for no reason.
  useEffect(() => {
    const tick = () => {
      const sim = simRef.current;
      if (sim) {
        for (const n of sim.nodes) {
          const el = labelRefs.current.get(n.id);
          if (el) el.style.transform = `translate(${n.x}px, ${n.y}px) translate(-50%, -50%)`;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const isThinking = phase === 'untangle' || phase === 'group' || phase === 'simplify';
  const showResult = phase === 'act' && outcome;
  const isUnclear = showResult && outcome.kind === 'unclear';
  const isGraph = showResult && outcome.kind === 'graph';

  return (
    <div className="min-h-screen relative">
      <WireCanvas phase={phase} outcome={phase === 'act' || isThinking ? outcome : null} simRef={simRef} />

      {phase === 'idle' && (
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-20">
          <div className="max-w-xl w-full text-center">
            <h1
              className="text-4xl md:text-5xl font-medium tracking-tight mb-3"
              style={{ fontFamily: "'Fraunces', serif", color: 'hsl(var(--foreground))' }}
            >
              Brainy
            </h1>
            <p
              className="text-base md:text-lg italic mb-12"
              style={{ fontFamily: "'Fraunces', serif", color: 'hsl(var(--muted-foreground))' }}
            >
              Turn your complex ideas into something simple.
            </p>

            <label htmlFor="thought" className="sr-only">What are you trying to figure out?</label>
            <textarea
              id="thought"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="I've been thinking about starting a side project, but I have too many ideas and don't know which one to pursue…"
              rows={5}
              className="w-full resize-none rounded-lg bg-transparent px-5 py-4 text-base leading-relaxed outline-none transition-colors"
              style={{
                fontFamily: "'Inter', sans-serif",
                color: 'hsl(var(--foreground))',
                border: '1px solid hsl(var(--foreground) / 0.15)',
              }}
            />

            <button
              onClick={() => runUntangle(input)}
              disabled={!input.trim()}
              className="mt-6 inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm tracking-wide transition-opacity disabled:opacity-30"
              style={{
                fontFamily: "'Inter', sans-serif",
                background: 'hsl(var(--foreground))',
                color: 'hsl(var(--background))',
              }}
            >
              Untangle →
            </button>
          </div>
        </div>
      )}

      {isThinking && (
        <div className="relative z-10 min-h-screen flex items-end justify-center px-6 pb-16 pointer-events-none">
          <p
            className="text-xs uppercase tracking-widest"
            style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--muted-foreground))' }}
          >
            {phase === 'untangle' ? 'Untangling' : phase === 'group' ? 'Grouping' : 'Simplifying'}
          </p>
        </div>
      )}

      {isUnclear && (
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-20">
          <div className="max-w-md w-full text-center">
            <p
              className="text-2xl md:text-3xl font-light italic leading-snug mb-4"
              style={{ fontFamily: "'Fraunces', serif", color: 'hsl(var(--foreground))' }}
            >
              {outcome.headline}
            </p>
            <p className="text-sm mb-8" style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--muted-foreground))' }}>
              {outcome.guidance}
            </p>
            <button onClick={startOver} className="text-sm underline underline-offset-4" style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--foreground))' }}>
              ← Try again
            </button>
          </div>
        </div>
      )}

      {isGraph && (
        <div className="relative z-10 min-h-screen flex flex-col">
          <div
            className="pt-12 px-6 text-center transition-opacity duration-700"
            style={{ opacity: labelsVisible ? 1 : 0 }}
          >
            <p
              className="text-xl md:text-2xl font-light italic"
              style={{ fontFamily: "'Fraunces', serif", color: 'hsl(var(--foreground))' }}
            >
              {outcome.headline}
            </p>
          </div>

          <div className="flex-1 relative" onClick={() => setSelectedId(null)}>
            {outcome.graph.concepts.map((concept) => {
              const isSelected = selectedId === concept.id;
              const connections = outcome.graph.relationships
                .filter((r) => r.source === concept.id || r.target === concept.id)
                .map((r) => (r.source === concept.id ? r.target : r.source))
                .map((id) => outcome.graph.concepts.find((c) => c.id === id)?.label)
                .filter(Boolean);

              return (
                <div
                  key={concept.id}
                  ref={(el) => { if (el) labelRefs.current.set(concept.id, el); }}
                  className="absolute flex flex-col items-center gap-1 transition-opacity duration-700"
                  style={{ left: 0, top: 0, maxWidth: 150, opacity: labelsVisible ? 1 : 0, zIndex: isSelected ? 20 : 1 }}
                >
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(isSelected ? null : concept.id);
                    }}
                    className="text-sm text-center leading-snug"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      color: 'hsl(var(--foreground))',
                      cursor: 'pointer',
                      borderBottom: `1px dotted hsl(var(--foreground) / ${isSelected ? '0.6' : '0.3'})`,
                      pointerEvents: 'auto',
                      transition: 'border-color 150ms ease',
                      marginTop: '18px',
                    }}
                  >
                    {concept.label}
                  </span>

                  {isSelected && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-full mt-2 text-left"
                      style={{
                        width: 200,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--foreground) / 0.15)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        boxShadow: '0 4px 20px hsl(var(--foreground) / 0.06)',
                      }}
                    >
                      <p className="text-[10px] uppercase tracking-widest mb-1" style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--accent))' }}>
                        {concept.group}
                      </p>
                      {connections.length > 0 ? (
                        <p className="text-xs leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--muted-foreground))' }}>
                          Connected to {connections.join(', ')}.
                        </p>
                      ) : (
                        <p className="text-xs leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--muted-foreground))' }}>
                          Standing on its own — nothing else here pulls on it.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            className="pb-16 px-6 flex flex-col items-center gap-6 transition-opacity duration-700"
            style={{ opacity: labelsVisible ? 1 : 0 }}
          >
            {outcome.nextStep && (
              <div className="text-center max-w-sm">
                <p className="text-[10px] uppercase tracking-widest mb-2" style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--muted-foreground))' }}>
                  Worth noticing
                </p>
                <p className="text-sm leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--foreground))' }}>
                  {outcome.nextStep}
                </p>
              </div>
            )}
            <button onClick={startOver} className="text-sm underline underline-offset-4" style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--muted-foreground))' }}>
              Start over →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
