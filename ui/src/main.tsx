import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as ToggleGroup from './components/ui/toggle-group.js';
import * as Tooltip from './components/ui/tooltip.js';
import { Button } from './components/ui/button.js';
import { AlertCircle, ChevronLeft, ChevronRight, CircleAlert, Moon, Pause, Play, Sun, Terminal } from 'lucide-react';
import type { Step } from '../../src/schema.js';
import './style.css';

declare const __PRODUCT_NAME__: string;
type Session = { id:string; task:string; agent:string; durationMs:number; stepCount:number; failed:boolean; startedAt:string };
type Mode = 'both' | 'screenshot' | 'agent';
type Theme = 'light' | 'dark';

function duration(ms: number) { return ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${Math.floor(ms % 60000 / 1000)}s`; }
function action(step: Step) {
  const verb = step.toolName.replace(/^browser_/, '').replaceAll('_', ' ');
  const label = verb.charAt(0).toUpperCase() + verb.slice(1);
  const target = step.target;
  if (target?.role) return `${label}: ${target.role}${target.name ? ` “${target.name}”` : ''}${target.matchCount && target.matchCount > 1 ? ` (${target.matchCount} matches)` : ''}`;
  if (step.toolName === 'browser_navigate') return `${label}: ${String(step.arguments.url || '')}`;
  return label;
}
function cleanFailure(step: Step) {
  const text = step.failureReason || '';
  if (!text || /^### (Error|Result)$/.test(text)) {
    const match = /"message"\s*:\s*"([^"]+)/.exec(step.error || '');
    return match?.[1] || 'Action failed';
  }
  return text;
}
function AgentView({ step }: {step:Step}) {
  const lines = (step.agentView || '').split('\n');
  return <div className="agent-content" role="document" aria-label="Agent view">
    {lines.map((line, i) => <div key={i} className={step.target?.ref && line.includes(`[ref=${step.target.ref}]`) ? 'agent-line target-line' : 'agent-line'}>{line || ' '}</div>)}
  </div>;
}
function Frame({ step, sessionId, mode }: {step:Step; sessionId:string; mode:Mode}) {
  const image = step.screenshot ? `/api/sessions/${encodeURIComponent(sessionId)}/images/${step.screenshot}` : null;
  return <div className={`frames ${mode === 'both' ? 'both' : 'single'}`}>
    {(mode === 'both' || mode === 'screenshot') && <section className="frame-panel" aria-label="Screenshot">
      <div className="panel-heading" title="Browser screenshot captured after this action">Screenshot</div>
      <div className="shot-wrap">{image && <div className="shot-canvas"><img src={image} alt={`Browser after step ${step.index}`} />{step.clickPoint && <span className="click-ring" style={{left:`${step.clickPoint.x / step.clickPoint.width * 100}%`,top:`${step.clickPoint.y / step.clickPoint.height * 100}%`}} />}</div>}</div>
    </section>}
    {(mode === 'both' || mode === 'agent') && <section className="frame-panel" aria-label="Agent view">
      <div className="panel-heading" title="Accessibility snapshot returned to the agent for this action">Agent view</div>
      <AgentView step={step} />
    </section>}
  </div>;
}

function App() {
  const params = new URLSearchParams(location.search);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState(params.get('s') || '');
  const [steps, setSteps] = useState<Step[]>([]);
  const [at, setAt] = useState(Math.max(0, (Number(params.get('step')) || 1) - 1));
  const [mode, setMode] = useState<Mode>('both');
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(`${__PRODUCT_NAME__}-theme`);
    return stored === 'light' || stored === 'dark' ? stored : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [playing, setPlaying] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem(`${__PRODUCT_NAME__}-theme`, theme); }, [theme]);
  useEffect(() => { fetch('/api/sessions').then(r => r.json()).then((items:Session[]) => { setSessions(items); setSelected(current => current && items.some(x => x.id === current) ? current : items[0]?.id || ''); }); }, []);
  useEffect(() => { if (!selected) return; fetch(`/api/sessions/${encodeURIComponent(selected)}/steps`).then(r => r.json()).then((items:Step[]) => { setSteps(items); setAt(current => Math.min(current, Math.max(0, items.length-1))); }); }, [selected]);
  useEffect(() => { if (!selected) return; const next = new URL(location.href); next.searchParams.set('s', selected); next.searchParams.set('step', String(at + 1)); history.replaceState(null, '', next); }, [selected, at]);
  useEffect(() => { if (!playing) return; const timer = setInterval(() => setAt(current => { if (current >= steps.length-1) { setPlaying(false); return current; } return current+1; }), 1000); return () => clearInterval(timer); }, [playing, steps.length]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
      if (event.code === 'Space') { event.preventDefault(); setPlaying(value => !value); }
      if (event.code === 'ArrowLeft') { event.preventDefault(); setPlaying(false); setAt(value => Math.max(0, value-1)); }
      if (event.code === 'ArrowRight') { event.preventDefault(); setPlaying(false); setAt(value => Math.min(steps.length-1, value+1)); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [steps.length]);
  const current = steps[at];
  const selectedSession = useMemo(() => sessions.find(item => item.id === selected), [sessions,selected]);
  return <Tooltip.Provider delayDuration={250}><div className="shell">
    <aside className="sidebar">
      <div className="brand"><span>{__PRODUCT_NAME__}</span><Button type="button" size="icon" className="icon-button theme-button" onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</Button></div>
      <div className="sidebar-label">Sessions <span>{sessions.length}</span></div>
      <nav aria-label="Sessions" className="session-list">
        {sessions.map(item => <button type="button" className={`session ${item.id === selected ? 'selected' : ''}`} key={item.id} onClick={() => {setSelected(item.id); setAt(0); setPlaying(false);}}>
          <span className="session-title">{item.failed && <span className="failed-dot" aria-label="Has errors" />}{item.task}</span>
          <span className="session-meta">{item.agent} · {duration(item.durationMs)}</span>
        </button>)}
      </nav>
    </aside>
    <main className="main">
      {current ? <>
        <header className="topbar"><div className="session-heading"><h1>{selectedSession?.task}</h1><span>{selectedSession?.agent} · {duration(selectedSession?.durationMs || 0)}</span></div>
          <ToggleGroup.Root className="segmented" type="single" value={mode} onValueChange={(value: string) => {if (value) setMode(value as Mode);}} aria-label="Visible panels">
            <ToggleGroup.Item value="both" aria-label="Show both views" title="Show the browser screenshot and the snapshot returned to the agent">Both</ToggleGroup.Item><ToggleGroup.Item value="screenshot" aria-label="Show screenshot only" title="Show the browser screenshot captured after this action">Screenshot</ToggleGroup.Item><ToggleGroup.Item value="agent" aria-label="Show agent view only" title="Show the accessibility snapshot returned to the agent">Agent view</ToggleGroup.Item>
          </ToggleGroup.Root>
        </header>
        <Frame step={current} sessionId={selected} mode={mode} />
        <footer className="controls">
          <div className="action-row"><span className="action-copy">{current.error && <CircleAlert size={15} className="error-icon" aria-label="Error" />}{action(current)}</span>
            {current.error && <span className="failure">{cleanFailure(current)}</span>}
            {current.warnings.map(warning => <Tooltip.Root key={warning}><Tooltip.Trigger asChild><span className="warning" tabIndex={0}><AlertCircle size={13} />{warning === 'same-name' ? 'Same name' : 'Unnamed'}</span></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip" sideOffset={6}>{warning === 'same-name' ? 'More than one element has this role and name.' : 'The target has no accessible name.'}<Tooltip.Arrow className="tooltip-arrow" /></Tooltip.Content></Tooltip.Portal></Tooltip.Root>)}
          </div>
          <div className="transport"><Button type="button" size="icon" className="icon-button" onClick={() => {setPlaying(false);setAt(value=>Math.max(0,value-1));}} aria-label="Previous step"><ChevronLeft size={17}/></Button><Button type="button" size="icon" variant="outline" className="icon-button primary-control" onClick={() => setPlaying(value=>!value)} aria-label={playing?'Pause':'Play'}>{playing?<Pause size={16}/>:<Play size={16}/>}</Button><Button type="button" size="icon" className="icon-button" onClick={() => {setPlaying(false);setAt(value=>Math.min(steps.length-1,value+1));}} aria-label="Next step"><ChevronRight size={17}/></Button>
            <div className="timeline" aria-label="Step timeline">{steps.map((step,i)=><button key={step.index} type="button" className={`timeline-dot ${step.error?'error':''} ${i===at?'active':''}`} aria-label={`Step ${i+1}${step.error?', error':''}`} aria-current={i===at?'step':undefined} onClick={()=>{setPlaying(false);setAt(i);}} />)}</div>
            <span className="counter">{at+1}/{steps.length}</span>
          </div>
        </footer>
      </> : <div className="empty"><div className="empty-icon"><Terminal size={23}/></div><h1>See what your agent saw.</h1><code>node dist/cli.js setup</code><p>Sessions appear after your agent's first browser action.</p></div>}
    </main>
  </div></Tooltip.Provider>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
