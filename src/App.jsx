import React, { useState, useEffect, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, ReferenceLine, ResponsiveContainer,
} from "recharts";
import {
  Check, AlertTriangle, ArrowUpRight, ArrowLeft, Cpu, Bug, Activity,
  Upload, X, FileCode, ChevronDown,
} from "lucide-react";

const POINTS = [
  "wrote until full",
  "read until empty",
  "simultaneous read + write",
  "pointer wrap-around",
  "write while full",
  "read while empty",
];

const BUG = {
  title: "full asserts one slot early",
  severity: "functional",
  repro: [
    "reset",
    "write × 7  (count → 7)",
    "read full  → HIGH   (expected LOW)",
    "8th write rejected · one slot lost",
  ],
  expected: { full: "0", count: "7" },
  got: { full: "1", count: "7" },
  hypothesis:
    "The full condition compares count >= DEPTH-1 instead of count >= DEPTH — a one-slot off-by-one. The FIFO reports full at 7 of 8 entries, silently dropping the 8th write. Only stimulus that fills the buffer to the brink and reads `full` exposes it.",
  fix: {
    from: "assign full = (count == DEPTH-1);",
    to: "assign full = (count == DEPTH);",
  },
};

// scripted, self-running scenario. each beat advances the loop.
const BEATS = [
  { log: ["info", "reading fifo_8x8 interface · 6 coverage goals"], status: "running", tok: 3 },
  { log: ["dim", "agent · targeting wrote-until-full"], tok: 1 },
  { log: ["ok", "test #1 generated · compiled · ran 1,000 cycles"], cov: 18, hit: 0, tests: 1, tok: 4 },
  { log: ["dim", "agent · targeting read-until-empty"], tok: 1 },
  { log: ["ok", "test #2 generated · compiled · ran 1,000 cycles"], cov: 34, hit: 1, tests: 2, tok: 3 },
  { log: ["dim", "agent · targeting simultaneous read + write"], tok: 1 },
  { log: ["warn", "compile error in test #3 · feeding error back to model"], tok: 2 },
  { log: ["ok", "test #3 fixed · compiled · ran 1,000 cycles"], cov: 52, hit: 2, tests: 3, tok: 4 },
  { log: ["dim", "agent · targeting pointer wrap-around"], tok: 1 },
  { log: ["ok", "test #4 generated · compiled · ran 1,000 cycles"], cov: 67, hit: 3, tests: 4, tok: 3 },
  { log: ["dim", "agent · targeting write-while-full"], tok: 1 },
  { log: ["ok", "test #5 generated · ran 1,000 cycles"], cov: 83, hit: 4, tests: 5, tok: 4 },
  { log: ["warn", "scoreboard mismatch · shrinking failure to minimal repro"], tok: 2 },
  { log: ["err", "bug · full asserts one slot early"], bug: true, bugs: 1, tok: 4 },
  { log: ["dim", "agent · targeting read-while-empty"], tok: 1 },
  { log: ["ok", "test #6 generated · compiled · ran 1,000 cycles"], cov: 100, hit: 5, tests: 6, status: "done", tok: 4 },
  { log: ["done", "coverage target reached · 6 / 6 corner cases"], tok: 0 },
];

const INIT = {
  status: "idle",
  cov: 0,
  iter: 0,
  clock: 0,
  history: [{ iter: 0, coverage: 0 }],
  points: [false, false, false, false, false, false],
  log: [],
  counts: { tests: 0, bugs: 0, hours: 0, tokens: 0 },
  bug: null,
  lastBug: null,
};

const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export default function App() {
  const [sim, setSim] = useState(INIT);
  const [view, setView] = useState("dashboard");
  const [designs, setDesigns] = useState([
    { id: "fifo_8x8", name: "fifo_8x8", cov: 100, bugs: 1 },
    { id: "axi_arbiter", name: "axi_arbiter", cov: 88, bugs: 0 },
  ]);
  const [active, setActive] = useState("fifo_8x8");
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState(false);
  const [disp, setDisp] = useState(0);
  const covTarget = useRef(0);

  useEffect(() => {
    covTarget.current = sim.cov;
  }, [sim.cov]);

  // smooth coverage number tween
  useEffect(() => {
    let raf;
    const loop = () => {
      setDisp((d) => {
        const diff = covTarget.current - d;
        return Math.abs(diff) < 0.4 ? covTarget.current : d + diff * 0.13;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // the self-running engine
  useEffect(() => {
    let timer;
    let step = 0;
    let cancelled = false;

    const apply = (b) =>
      setSim((s) => {
        const n = { ...s, counts: { ...s.counts } };
        n.clock = s.clock + (b.tok ? 2 : 1);
        if (b.status) n.status = b.status;
        if (b.cov != null) {
          n.cov = b.cov;
          n.iter = b.tests ?? s.iter;
          n.history = [...s.history, { iter: b.tests ?? s.iter, coverage: b.cov }];
        }
        if (b.hit != null) n.points = s.points.map((p, i) => (i === b.hit ? true : p));
        if (b.tests != null) n.counts.tests = b.tests;
        if (b.bugs != null) n.counts.bugs = b.bugs;
        if (b.tok) n.counts.tokens = s.counts.tokens + b.tok * 1000;
        n.counts.hours = Math.round((b.tests ?? s.counts.tests) * 2.3);
        if (b.bug) { n.bug = BUG; n.lastBug = BUG; }
        if (b.log) {
          n.log = [
            ...s.log,
            { level: b.log[0], text: b.log[1], t: fmt(n.clock) },
          ].slice(-7);
        }
        return n;
      });

    const reset = () => {
      setSim((s) => ({ ...INIT, lastBug: s.lastBug }));
      covTarget.current = 0;
    };

    const tick = () => {
      if (cancelled) return;
      if (step < BEATS.length) {
        apply(BEATS[step]);
        step += 1;
        timer = setTimeout(tick, 1250);
      } else {
        timer = setTimeout(() => {
          reset();
          step = 0;
          tick();
        }, 3800);
      }
    };

    reset();
    timer = setTimeout(tick, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  const running = sim.status === "running";
  const done = sim.status === "done";
  const activeName = (designs.find((d) => d.id === active) || {}).name || "—";

  return (
    <div className="vera-root">
      <style>{CSS}</style>

      {/* top bar */}
      <header className="bar">
        <div className="bar-l">
          <div className="mark" aria-hidden="true" />
          <span className="word">Vera</span>
          <span className="bar-sub mono">autonomous verification engineer</span>
        </div>
        <div className="bar-r">
          <span className={`status ${done ? "is-done" : ""}`}>
            <span className="status-dot" />
            {done ? "complete" : running ? "running" : "idle"}
          </span>
          <div className="dut-wrap">
            <button className="chip mono" onClick={() => setMenu((m) => !m)} title="Switch or load a design">
              <Cpu size={12} /> {activeName} <ChevronDown size={12} className="chip-caret" />
            </button>
            {menu && (
              <>
                <div className="menu-catch" onClick={() => setMenu(false)} />
                <div className="menu">
                  <div className="menu-lbl">designs</div>
                  {designs.map((d) => (
                    <button
                      key={d.id}
                      className={`menu-item ${d.id === active ? "on" : ""}`}
                      onClick={() => { setActive(d.id); setMenu(false); }}
                    >
                      <span className="mi-name mono">{d.name}</span>
                      <span className="mi-meta">
                        {d.fresh ? "not yet run" : `${d.cov}% · ${d.bugs} bug${d.bugs === 1 ? "" : "s"}`}
                      </span>
                      {d.id === active && <Check size={13} className="mi-check" />}
                    </button>
                  ))}
                  <div className="menu-div" />
                  <button className="menu-add" onClick={() => { setMenu(false); setModal(true); }}>
                    <Upload size={13} /> Load new design
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="seg">
            <button
              className={view === "dashboard" ? "on" : ""}
              onClick={() => setView("dashboard")}
            >
              Dashboard
            </button>
            <button
              className={view === "bug" ? "on" : ""}
              onClick={() => setView("bug")}
            >
              Bug detail
              {sim.bug && <span className="seg-dot" />}
            </button>
          </div>
        </div>
      </header>

      {view === "dashboard" ? (
        <Dashboard sim={sim} disp={disp} done={done} onInspect={() => setView("bug")} />
      ) : (
        <BugView bug={sim.lastBug} onBack={() => setView("dashboard")} />
      )}

      {modal && (
        <LoadModal
          onClose={() => setModal(false)}
          onLoad={(name, file) => {
            const id = `${name.replace(/\s+/g, "_")}_${Date.now()}`;
            setDesigns((ds) => [...ds, { id, name, file, cov: 0, bugs: 0, fresh: true }]);
            setActive(id);
            setModal(false);
          }}
        />
      )}
    </div>
  );
}

function LoadModal({ onClose, onLoad }) {
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const pick = (f) => {
    if (!f) return;
    setFile(f);
    if (!name) setName(f.name.replace(/\.(v|sv|vh)$/i, ""));
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files && e.dataTransfer.files[0]);
  };
  const ready = name.trim() && file;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>Load a design</span>
          <button className="x" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <label className="field-lbl">chip name</label>
        <input
          className="field" value={name} autoFocus placeholder="e.g. my_fifo"
          onChange={(e) => setName(e.target.value)}
        />

        <label className="field-lbl">verilog source</label>
        <div
          className={`drop ${drag ? "drag" : ""} ${file ? "has" : ""}`}
          onClick={() => inputRef.current && inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef} type="file" accept=".v,.sv,.vh" hidden
            onChange={(e) => pick(e.target.files && e.target.files[0])}
          />
          {file ? (
            <div className="file-row">
              <FileCode size={16} />
              <span className="mono">{file.name}</span>
              <span className="file-sz mono">{(file.size / 1024).toFixed(1)} KB</span>
            </div>
          ) : (
            <>
              <Upload size={18} />
              <span>drop a .v / .sv file, or <u>browse</u></span>
            </>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-em" disabled={!ready} onClick={() => onLoad(name.trim(), file)}>
            Load design
          </button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ sim, disp, done, onInspect }) {
  return (
    <main className="grid">
      {/* hero coverage */}
      <section className="panel hero">
        <div className="hero-l">
          <div className="lbl">functional coverage</div>
          <div className="cov-num mono">
            {Math.round(disp)}<span className="cov-pct">%</span>
          </div>
          <div className="hero-meta mono">
            iteration {sim.iter} · target 95%
          </div>
        </div>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sim.history} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="cov" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="iter" hide />
              <YAxis
                domain={[0, 100]} ticks={[0, 50, 100]} width={40}
                axisLine={false} tickLine={false}
                tick={{ fill: "#5b606b", fontSize: 11, fontFamily: "monospace" }}
              />
              <ReferenceLine
                y={95} stroke="rgba(255,255,255,.18)" strokeDasharray="4 4"
                label={{ value: "target", position: "right", fill: "#5b606b", fontSize: 10 }}
              />
              <Area
                type="monotone" dataKey="coverage" stroke="#34d399" strokeWidth={2}
                fill="url(#cov)" dot={false} activeDot={false} isAnimationActive
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* checklist */}
      <section className="panel">
        <div className="lbl">corner cases</div>
        <ul className="checks">
          {POINTS.map((p, i) => (
            <li key={p} className={sim.points[i] ? "hit" : ""}>
              <span className="tick">
                {sim.points[i] ? <Check size={13} strokeWidth={3} /> : null}
              </span>
              {p}
            </li>
          ))}
        </ul>
      </section>

      {/* activity */}
      <section className="panel feed">
        <div className="lbl"><Activity size={11} /> agent activity</div>
        <div className="log">
          {sim.log.map((l, i) => (
            <div key={`${l.t}-${i}-${l.text}`} className={`line lv-${l.level}`}>
              <span className="log-t mono">{l.t}</span>
              <span className="log-dot" />
              <span className="mono">{l.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* bug card */}
      {sim.bug && (
        <section className="panel bugcard" key="bugcard">
          <div className="bug-head">
            <AlertTriangle size={15} />
            <span>bug found — {sim.bug.title}</span>
          </div>
          <div className="bug-repro mono">
            {sim.bug.repro.map((r, i) => (
              <div key={i}><span className="rn">{i + 1}</span>{r}</div>
            ))}
          </div>
          <button className="inspect" onClick={onInspect}>
            Inspect failure <ArrowUpRight size={14} />
          </button>
        </section>
      )}

      {/* stats */}
      <section className="stats">
        {[
          ["tests generated", sim.counts.tests, false],
          ["bugs found", sim.counts.bugs, true],
          ["est. hours saved", `~${sim.counts.hours}`, false],
          ["tokens used", `${Math.round(sim.counts.tokens / 1000)}k`, false],
        ].map(([k, v, danger]) => (
          <div className="stat" key={k}>
            <div className="lbl">{k}</div>
            <div className={`stat-v mono ${danger && v ? "danger" : ""}`}>{v}</div>
          </div>
        ))}
      </section>
    </main>
  );
}

function BugView({ bug, onBack }) {
  if (!bug) {
    return (
      <main className="empty">
        <Bug size={26} />
        <p>No failure captured yet.</p>
        <span className="mono">The agent is still hunting — failures land here when found.</span>
        <button className="inspect" onClick={onBack}>
          <ArrowLeft size={14} /> Back to dashboard
        </button>
      </main>
    );
  }
  return (
    <main className="buggrid">
      <div className="bug-top">
        <button className="back" onClick={onBack}>
          <ArrowLeft size={14} /> dashboard
        </button>
        <h2>{bug.title}</h2>
        <span className="sev mono">{bug.severity}</span>
      </div>

      {/* waveform — the signature */}
      <section className="panel wave-panel">
        <div className="lbl">waveform · failing cycle</div>
        <Waveform />
        <div className="wave-cap mono">
          <span className="rose-key" /> actual&nbsp;&nbsp;
          <span className="em-key" /> expected&nbsp;&nbsp;·&nbsp;&nbsp;
          <code>full</code> rises at count = 7, one cycle before count = 8
        </div>
      </section>

      <div className="bug-cols">
        <section className="panel">
          <div className="lbl">minimal repro</div>
          <div className="bug-repro mono tall">
            {bug.repro.map((r, i) => (
              <div key={i}><span className="rn">{i + 1}</span>{r}</div>
            ))}
          </div>
          <div className="lbl" style={{ marginTop: 16 }}>scoreboard</div>
          <table className="cmp mono">
            <thead>
              <tr><th></th><th>full</th><th>count</th></tr>
            </thead>
            <tbody>
              <tr><td>expected</td><td className="em">{bug.expected.full}</td><td>{bug.expected.count}</td></tr>
              <tr><td>got</td><td className="rose">{bug.got.full}</td><td>{bug.got.count}</td></tr>
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="lbl">root-cause hypothesis</div>
          <p className="hyp">{bug.hypothesis}</p>
          <div className="lbl" style={{ marginTop: 16 }}>suggested fix</div>
          <div className="diff mono">
            <div className="d-rm">- {bug.fix.from}</div>
            <div className="d-add">+ {bug.fix.to}</div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Waveform() {
  const CYC = 12, x0 = 92, cw = 48, w = x0 + CYC * cw, rh = 26, gap = 18;
  const rows = [
    { name: "clk", arr: Array.from({ length: CYC }, (_, i) => i % 2), color: "rgba(255,255,255,.30)", dash: false },
    { name: "wr_en", arr: Array.from({ length: CYC }, (_, i) => (i < 8 ? 1 : 0)), color: "rgba(255,255,255,.45)", dash: false },
    { name: "full · exp", arr: Array.from({ length: CYC }, (_, i) => (i >= 8 ? 1 : 0)), color: "#34d399", dash: true },
    { name: "full · act", arr: Array.from({ length: CYC }, (_, i) => (i >= 7 ? 1 : 0)), color: "#fb7185", dash: false },
  ];
  const path = (arr, top) => {
    const hi = top + 4, lo = top + rh - 4;
    const y = (v) => (v ? hi : lo);
    let d = `M ${x0} ${y(arr[0])}`;
    for (let i = 1; i < CYC; i++) {
      const xi = x0 + i * cw;
      d += ` H ${xi}`;
      if (arr[i] !== arr[i - 1]) d += ` V ${y(arr[i])}`;
    }
    d += ` H ${x0 + CYC * cw}`;
    return d;
  };
  const totalH = rows.length * (rh + gap) + 26;
  const bandX = x0 + 7 * cw;
  const counts = Array.from({ length: CYC }, (_, i) => Math.min(i + 1, 8));

  return (
    <svg className="wave" viewBox={`0 0 ${w + 16} ${totalH}`} width="100%">
      {/* failing-cycle band */}
      <rect x={bandX} y={6} width={cw} height={rows.length * (rh + gap) - gap + 4}
        fill="rgba(251,113,133,.10)" />
      <line x1={bandX} y1={6} x2={bandX} y2={rows.length * (rh + gap) - gap + 10}
        stroke="rgba(251,113,133,.4)" strokeWidth="1" strokeDasharray="3 3" />
      {/* cycle gridlines */}
      {Array.from({ length: CYC + 1 }, (_, i) => (
        <line key={i} x1={x0 + i * cw} y1={6} x2={x0 + i * cw}
          y2={rows.length * (rh + gap) - gap + 6}
          stroke="rgba(255,255,255,.04)" strokeWidth="1" />
      ))}
      {rows.map((r, ri) => {
        const top = 6 + ri * (rh + gap);
        return (
          <g key={r.name}>
            <text x={8} y={top + rh / 2 + 4} className="wlbl">{r.name}</text>
            <path d={path(r.arr, top)} fill="none" stroke={r.color}
              strokeWidth="1.6" strokeDasharray={r.dash ? "5 4" : "0"}
              className="wsig" style={{ animationDelay: `${ri * 0.12}s` }} />
          </g>
        );
      })}
      {/* count readout */}
      <text x={8} y={totalH - 4} className="wlbl">count</text>
      {counts.map((c, i) => (
        <text key={i} x={x0 + i * cw + cw / 2} y={totalH - 4}
          className="wcount" textAnchor="middle">{c}</text>
      ))}
    </svg>
  );
}

const CSS = `
:root{
  --bg:#08090b; --panel:#0d0f13; --bd:rgba(255,255,255,.06); --bd2:rgba(255,255,255,.11);
  --tx:#ECEDEE; --tx2:#9296a0; --tx3:#5b606b;
  --em:#34d399; --rose:#fb7185;
  --mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
  --sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
}
.vera-root{ background:var(--bg); color:var(--tx); font-family:var(--sans);
  min-height:100vh; padding:22px 26px 32px; -webkit-font-smoothing:antialiased;
  background-image:radial-gradient(circle at 50% -10%, rgba(52,211,153,.06), transparent 45%),
    radial-gradient(circle at 1px 1px, rgba(255,255,255,.025) 1px, transparent 0);
  background-size:auto, 22px 22px; }
.vera-root *{ box-sizing:border-box; }
.mono{ font-family:var(--mono); }
.lbl{ font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--tx3);
  display:flex; align-items:center; gap:6px; }

.bar{ display:flex; align-items:center; justify-content:space-between; gap:16px;
  padding-bottom:18px; margin-bottom:20px; border-bottom:1px solid var(--bd); flex-wrap:wrap; }
.bar-l{ display:flex; align-items:center; gap:10px; }
.mark{ width:16px; height:16px; border-radius:5px; background:var(--em);
  box-shadow:0 0 14px var(--em); transform:rotate(45deg); }
.word{ font-size:17px; font-weight:600; letter-spacing:-.01em; }
.bar-sub{ font-size:11px; color:var(--tx3); }
.bar-r{ display:flex; align-items:center; gap:10px; }
.status{ display:inline-flex; align-items:center; gap:7px; font-size:12px; color:var(--em);
  background:rgba(52,211,153,.08); border:1px solid rgba(52,211,153,.22);
  padding:5px 11px; border-radius:8px; }
.status.is-done{ color:var(--em); }
.status-dot{ width:7px; height:7px; border-radius:50%; background:var(--em);
  box-shadow:0 0 8px var(--em); animation:pulse 1.6s ease-in-out infinite; }
.chip{ display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:var(--tx2);
  background:none; border:1px solid var(--bd); padding:5px 10px; border-radius:8px;
  font-family:var(--mono); cursor:pointer; margin:0; transition:.18s; }
.chip:hover{ color:var(--tx); border-color:var(--bd2); background:rgba(255,255,255,.03); }
.chip-caret{ color:var(--tx3); margin-left:1px; }
.dut-wrap{ position:relative; }
.menu-catch{ position:fixed; inset:0; z-index:40; }
.menu{ position:absolute; right:0; top:38px; width:238px; background:var(--panel);
  border:1px solid var(--bd2); border-radius:12px; padding:6px; z-index:45;
  box-shadow:0 18px 44px rgba(0,0,0,.5); animation:cardIn .18s ease-out; }
.menu-lbl{ font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--tx3);
  padding:6px 9px 5px; }
.menu-item{ width:100%; display:flex; align-items:center; gap:8px; background:none; border:none;
  color:var(--tx); font-family:var(--sans); text-align:left; padding:8px 9px; border-radius:8px;
  cursor:pointer; transition:.14s; }
.menu-item:hover{ background:rgba(255,255,255,.05); }
.menu-item.on{ background:rgba(52,211,153,.08); }
.mi-name{ font-size:12.5px; flex:1; }
.mi-meta{ font-size:10.5px; color:var(--tx3); }
.mi-check{ color:var(--em); flex:none; }
.menu-div{ height:1px; background:var(--bd); margin:5px 4px; }
.menu-add{ width:100%; display:flex; align-items:center; gap:8px; background:none; border:none;
  color:var(--em); font-family:var(--sans); font-size:12.5px; text-align:left; padding:8px 9px;
  border-radius:8px; cursor:pointer; transition:.14s; }
.menu-add:hover{ background:rgba(52,211,153,.08); }
.seg{ display:flex; border:1px solid var(--bd); border-radius:9px; padding:3px; gap:2px; }
.seg button{ position:relative; background:none; border:none; color:var(--tx2);
  font-family:var(--sans); font-size:12.5px; padding:5px 12px; border-radius:6px; cursor:pointer;
  transition:.18s; }
.seg button:hover{ color:var(--tx); }
.seg button.on{ background:rgba(255,255,255,.07); color:var(--tx); }
.seg-dot{ position:absolute; top:5px; right:5px; width:5px; height:5px; border-radius:50%;
  background:var(--rose); box-shadow:0 0 6px var(--rose); }

.grid{ display:grid; grid-template-columns:1.6fr 1fr; grid-auto-rows:min-content; gap:16px; }
.panel{ background:var(--panel); border:1px solid var(--bd); border-radius:15px; padding:18px 20px; }
.hero{ grid-column:1 / -1; display:grid; grid-template-columns:230px 1fr; gap:24px; align-items:center; }
.cov-num{ font-size:58px; font-weight:600; line-height:1; color:var(--em); letter-spacing:-.02em;
  margin-top:10px; text-shadow:0 0 30px rgba(52,211,153,.25); }
.cov-pct{ font-size:26px; color:var(--tx3); margin-left:2px; }
.hero-meta{ font-size:12px; color:var(--tx3); margin-top:12px; }
.chart{ height:170px; }

.checks{ list-style:none; margin:14px 0 0; padding:0; display:flex; flex-direction:column; gap:11px; }
.checks li{ display:flex; align-items:center; gap:10px; font-size:13.5px; color:var(--tx3);
  transition:color .4s; }
.checks li .tick{ width:18px; height:18px; border-radius:6px; border:1px solid var(--bd2);
  display:flex; align-items:center; justify-content:center; color:#06281d; transition:.4s; }
.checks li.hit{ color:var(--tx); }
.checks li.hit .tick{ background:var(--em); border-color:var(--em); color:#04231a;
  animation:tickglow .8s ease-out; }

.feed .log{ margin-top:14px; display:flex; flex-direction:column; gap:9px; min-height:170px; }
.line{ display:flex; align-items:center; gap:9px; font-size:12px; color:var(--tx2);
  animation:fadeUp .3s ease-out; }
.log-t{ color:var(--tx3); font-size:11px; min-width:38px; }
.log-dot{ width:5px; height:5px; border-radius:50%; background:var(--tx3); flex:none; }
.lv-ok, .lv-done{ color:var(--em); } .lv-ok .log-dot, .lv-done .log-dot{ background:var(--em); }
.lv-err{ color:var(--rose); } .lv-err .log-dot{ background:var(--rose); box-shadow:0 0 6px var(--rose); }
.lv-warn{ color:var(--tx); } .lv-warn .log-dot{ background:var(--tx2); }
.lv-dim{ color:var(--tx3); }

.bugcard{ grid-column:1 / -1; border-color:rgba(251,113,133,.28);
  background:linear-gradient(180deg, rgba(251,113,133,.05), rgba(251,113,133,.01));
  animation:cardIn .45s cubic-bezier(.2,.8,.2,1); }
.bug-head{ display:flex; align-items:center; gap:9px; color:var(--rose); font-size:14.5px;
  font-weight:500; }
.bug-repro{ margin-top:12px; display:flex; flex-direction:column; gap:7px; font-size:12px;
  color:var(--tx2); }
.bug-repro.tall{ gap:9px; }
.rn{ display:inline-block; width:18px; color:var(--tx3); }
.inspect{ margin-top:14px; display:inline-flex; align-items:center; gap:7px;
  background:rgba(251,113,133,.12); border:1px solid rgba(251,113,133,.3); color:var(--rose);
  font-family:var(--sans); font-size:12.5px; padding:7px 13px; border-radius:9px; cursor:pointer;
  transition:.18s; }
.inspect:hover{ background:rgba(251,113,133,.2); }

.stats{ grid-column:1 / -1; display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
.stat{ background:var(--panel); border:1px solid var(--bd); border-radius:12px; padding:14px 16px; }
.stat-v{ font-size:26px; font-weight:600; margin-top:7px; letter-spacing:-.01em; }
.stat-v.danger{ color:var(--rose); }

/* bug view */
.buggrid{ display:flex; flex-direction:column; gap:16px; }
.bug-top{ display:flex; align-items:center; gap:14px; }
.bug-top h2{ font-size:18px; font-weight:600; margin:0; letter-spacing:-.01em; }
.back{ display:inline-flex; align-items:center; gap:6px; background:none; border:1px solid var(--bd);
  color:var(--tx2); font-family:var(--sans); font-size:12px; padding:6px 11px; border-radius:8px;
  cursor:pointer; transition:.18s; }
.back:hover{ color:var(--tx); border-color:var(--bd2); }
.sev{ font-size:11px; color:var(--rose); background:rgba(251,113,133,.1);
  border:1px solid rgba(251,113,133,.25); padding:4px 9px; border-radius:7px; }
.wave-panel{ padding-bottom:14px; }
.wave{ margin-top:14px; display:block; }
.wlbl{ fill:var(--tx3); font-size:11px; font-family:var(--mono); }
.wcount{ fill:var(--tx2); font-size:10.5px; font-family:var(--mono); }
.wsig{ stroke-dasharray:1400; animation:draw 1s ease-out forwards; }
.wave-cap{ font-size:11px; color:var(--tx3); margin-top:12px; display:flex; align-items:center;
  gap:4px; flex-wrap:wrap; }
.wave-cap code{ color:var(--tx); }
.rose-key,.em-key{ display:inline-block; width:14px; height:2px; vertical-align:middle; margin-right:2px; }
.rose-key{ background:var(--rose); } .em-key{ background:var(--em); }
.bug-cols{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.cmp{ width:100%; border-collapse:collapse; margin-top:12px; font-size:12px; }
.cmp th{ text-align:left; color:var(--tx3); font-weight:400; padding:5px 8px; font-size:11px; }
.cmp td{ padding:6px 8px; color:var(--tx2); border-top:1px solid var(--bd); }
.cmp td.em{ color:var(--em); } .cmp td.rose{ color:var(--rose); }
.hyp{ font-size:13px; line-height:1.65; color:var(--tx2); margin:12px 0 0; }
.diff{ margin-top:12px; font-size:12px; border-radius:9px; overflow:hidden; border:1px solid var(--bd); }
.d-rm{ background:rgba(251,113,133,.09); color:var(--rose); padding:8px 12px; }
.d-add{ background:rgba(52,211,153,.09); color:var(--em); padding:8px 12px; }
.em{ color:var(--em); } .rose{ color:var(--rose); }

.empty{ display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:10px; padding:80px 0; color:var(--tx3); text-align:center; }
.empty p{ color:var(--tx); font-size:15px; margin:4px 0 0; }
.empty span{ font-size:12px; }
.empty .inspect{ margin-top:18px; background:rgba(255,255,255,.05); border-color:var(--bd);
  color:var(--tx2); }

.overlay{ position:fixed; inset:0; background:rgba(4,5,7,.66); backdrop-filter:blur(3px);
  display:flex; align-items:center; justify-content:center; z-index:50; padding:20px;
  animation:ovIn .2s ease-out; }
.modal{ width:100%; max-width:440px; background:var(--panel); border:1px solid var(--bd2);
  border-radius:16px; padding:20px 22px 18px; box-shadow:0 24px 60px rgba(0,0,0,.5);
  animation:cardIn .28s cubic-bezier(.2,.8,.2,1); }
.modal-head{ display:flex; align-items:center; justify-content:space-between; font-size:15px;
  font-weight:600; margin-bottom:18px; }
.modal-head .x{ background:none; border:none; color:var(--tx3); cursor:pointer; padding:4px;
  border-radius:6px; display:flex; transition:.18s; }
.modal-head .x:hover{ color:var(--tx); background:rgba(255,255,255,.06); }
.field-lbl{ display:block; font-size:10.5px; letter-spacing:.1em; text-transform:uppercase;
  color:var(--tx3); margin:0 0 7px; }
.field{ width:100%; background:#08090b; border:1px solid var(--bd); border-radius:9px;
  color:var(--tx); font-family:var(--mono); font-size:13px; padding:10px 12px; margin-bottom:16px;
  outline:none; transition:.18s; }
.field:focus{ border-color:var(--em); box-shadow:0 0 0 3px rgba(52,211,153,.15); }
.drop{ display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px;
  border:1.5px dashed var(--bd2); border-radius:11px; padding:22px; color:var(--tx2);
  font-size:12.5px; cursor:pointer; text-align:center; transition:.18s; }
.drop u{ color:var(--em); text-decoration:none; }
.drop:hover{ border-color:var(--tx3); }
.drop.drag{ border-color:var(--em); background:rgba(52,211,153,.06); color:var(--tx); }
.drop.has{ border-style:solid; border-color:rgba(52,211,153,.4); cursor:default; }
.file-row{ display:flex; align-items:center; gap:9px; color:var(--em); font-size:12.5px; }
.file-sz{ color:var(--tx3); }
.modal-foot{ display:flex; justify-content:flex-end; gap:10px; margin-top:20px; }
.btn-ghost{ background:none; border:1px solid var(--bd); color:var(--tx2); font-family:var(--sans);
  font-size:12.5px; padding:8px 14px; border-radius:9px; cursor:pointer; transition:.18s; }
.btn-ghost:hover{ color:var(--tx); border-color:var(--bd2); }
.btn-em{ background:var(--em); border:1px solid var(--em); color:#04231a; font-family:var(--sans);
  font-weight:500; font-size:12.5px; padding:8px 16px; border-radius:9px; cursor:pointer;
  transition:.18s; }
.btn-em:hover{ box-shadow:0 0 16px rgba(52,211,153,.4); }
.btn-em:disabled{ opacity:.4; cursor:not-allowed; box-shadow:none; }
@keyframes ovIn{ from{ opacity:0; } to{ opacity:1; } }

@keyframes pulse{ 0%,100%{ opacity:1; } 50%{ opacity:.35; } }
@keyframes fadeUp{ from{ opacity:0; transform:translateY(5px); } to{ opacity:1; transform:none; } }
@keyframes tickglow{ 0%{ box-shadow:0 0 0 0 rgba(52,211,153,.5); } 100%{ box-shadow:0 0 0 8px rgba(52,211,153,0); } }
@keyframes cardIn{ from{ opacity:0; transform:scale(.985) translateY(6px); } to{ opacity:1; transform:none; } }
@keyframes draw{ to{ stroke-dashoffset:0; } }

@media (max-width:760px){
  .grid{ grid-template-columns:1fr; } .hero{ grid-template-columns:1fr; }
  .stats{ grid-template-columns:repeat(2,1fr); } .bug-cols{ grid-template-columns:1fr; }
}
@media (prefers-reduced-motion: reduce){
  *{ animation:none !important; transition:none !important; }
  .wsig{ stroke-dasharray:0; }
}
`;

