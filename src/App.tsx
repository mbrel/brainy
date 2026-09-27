import { useEffect, useRef, useState } from 'react';
import WireCanvas, { type Phase } from './components/WireCanvas';
import { analyze, type AnalysisResult } from './lib/analyze';
import { getActPosition } from './lib/layout';

const PHASE_DURATIONS: Record<Exclude<Phase, 'idle' | 'act'>, number> = {
  untangle: 1400,
  group: 1300,
  simplify: 1100,
};

const EXAMPLES = ['A decision', 'A messy idea', 'A project', 'A problem'];

const roleTag: Record<string, string> = {
  core: '',
  factor: '',
  risk: 'Risk',
  unknown: 'Unknown',
  next: 'Next step',
};

function App() {
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const runUntangle = (text: string) => {
    if (!text.trim()) return;
    clearTimers();
    const analysis = analyze(text);

    setPhase('untangle');
    timers.current.push(setTimeout(() => {
      setPhase('group');
      timers.current.push(setTimeout(() => {
        setPhase('simplify');
        timers.current.push(setTimeout(() => {
          setResult(analysis);
          setPhase('act');
        }, PHASE_DURATIONS.simplify));
      }, PHASE_DURATIONS.group));
    }, PHASE_DURATIONS.untangle));
  };

  const startOver = () => {
    clearTimers();
    setResult(null);
    setPhase('idle');
    setInput('');
  };

  const isThinking = phase === 'untangle' || phase === 'group' || phase === 'simplify';
  const showResult = phase === 'act' && result;
  const isUnclear = showResult && result.type === 'unclear';
  const survivors = showResult && !isUnclear ? result.concepts : [];

  return (
    <div className="min-h-screen relative">
      <WireCanvas phase={phase} result={phase === 'act' ? result : null} />

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

      {showResult && isUnclear && (
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-20">
          <div className="max-w-md w-full text-center">
            <p
              className="text-2xl md:text-3xl font-light italic leading-snug mb-4"
              style={{ fontFamily: "'Fraunces', serif", color: 'hsl(var(--foreground))' }}
            >
              {result.headline}
            </p>
            {result.guidance && (
              <p className="text-sm mb-8" style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--muted-foreground))' }}>
                {result.guidance}
              </p>
            )}

            {result.concepts.length > 0 ? (
              <div className="flex flex-col gap-3 mb-8">
                {result.concepts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => runUntangle(c.label)}
                    title={c.label}
                    className="text-sm rounded-full px-4 py-2 transition-opacity hover:opacity-70"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      border: '1px solid hsl(var(--foreground) / 0.15)',
                      color: 'hsl(var(--foreground))',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block',
                    }}
                  >
                    Focus on: {c.label}
                  </button>
                ))}
                <button
                  onClick={() => runUntangle(input)}
                  className="text-sm underline underline-offset-4 mt-2"
                  style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--muted-foreground))' }}
                >
                  Untangle everything instead
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-2 mb-8">
                {EXAMPLES.map((ex) => (
                  <span
                    key={ex}
                    className="text-xs uppercase tracking-widest px-3 py-1.5 rounded-full"
                    style={{ fontFamily: "'Inter', sans-serif", border: '1px solid hsl(var(--foreground) / 0.1)', color: 'hsl(var(--muted-foreground))' }}
                  >
                    {ex}
                  </span>
                ))}
              </div>
            )}

            <button onClick={startOver} className="text-sm underline underline-offset-4" style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--foreground))' }}>
              ← Try again
            </button>
          </div>
        </div>
      )}

      {showResult && !isUnclear && (
        <div className="relative z-10 min-h-screen flex flex-col">
          <div className="pt-12 px-6 text-center">
            <p
              className="text-xl md:text-2xl font-light italic"
              style={{ fontFamily: "'Fraunces', serif", color: 'hsl(var(--foreground))' }}
            >
              {result.headline}
            </p>
          </div>

          <div className="flex-1 relative">
            {survivors.map((concept, i) => {
              const isCore = concept.role === 'core';
              const pos = getActPosition(i, survivors.length, isCore, viewport.w, viewport.h);
              const tag = roleTag[concept.role];
              return (
                <div
                  key={concept.id}
                  className="absolute -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none"
                  style={{ left: pos.x, top: pos.y + (isCore ? 14 : 12), maxWidth: 160 }}
                >
                  {tag && (
                    <span
                      className="text-[10px] uppercase tracking-widest"
                      style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--accent))' }}
                    >
                      {tag}
                    </span>
                  )}
                  <span
                    className="text-sm text-center leading-snug"
                    style={{
                      fontFamily: isCore ? "'Fraunces', serif" : "'Inter', sans-serif",
                      fontWeight: isCore ? 500 : 400,
                      fontSize: isCore ? '17px' : '13px',
                      color: 'hsl(var(--foreground))',
                    }}
                  >
                    {concept.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pb-16 px-6 flex flex-col items-center gap-6">
            <div className="text-center max-w-sm">
              <p
                className="text-[10px] uppercase tracking-widest mb-2"
                style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--muted-foreground))' }}
              >
                {result.nextStep ? 'Next step' : 'Key unknown'}
              </p>
              <p className="text-sm leading-relaxed" style={{ fontFamily: "'Inter', sans-serif", color: 'hsl(var(--foreground))' }}>
                {result.nextStep ?? "There isn't a clean next step yet — that's honest, not a gap in the analysis."}
              </p>
            </div>
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
