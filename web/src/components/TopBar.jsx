import { useState } from "react";
import { Check, ChevronDown, Cpu, Play, Square, Upload } from "lucide-react";

export default function TopBar({
  sim, connected, busy, onStart, onStop, view, setView,
  designs, active, setActive, onLoadNew, hasBug,
}) {
  const [menu, setMenu] = useState(false);
  const running = sim.status === "running";
  const done = sim.status === "done";
  const error = sim.status === "error";
  const activeDesign = designs.find((d) => d.id === active) || {};
  const activeName = activeDesign.name || sim.dut || "—";

  return (
    <header className="bar">
      <div className="bar-l">
        <div className="mark" aria-hidden="true" />
        <span className="word">Vera</span>
        <span className="bar-sub mono">autonomous verification engineer</span>
      </div>
      <div className="bar-r">
        {!connected && <span className="replay-chip">demo replay — engine offline</span>}
        <span className={`status ${done ? "is-done" : ""} ${error ? "is-error" : ""} ${sim.status === "idle" ? "is-idle" : ""}`}>
          <span className="status-dot" />
          {error ? "error" : done ? "complete" : running ? "running" : "idle"}
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
                      {d.fresh
                        ? "not yet run"
                        : d.id === active
                          ? `${sim.coverage_percent}% · ${sim.counts.bugs_found} bug${sim.counts.bugs_found === 1 ? "" : "s"}`
                          : ""}
                    </span>
                    {d.id === active && <Check size={13} className="mi-check" />}
                  </button>
                ))}
                <div className="menu-div" />
                <button className="menu-add" onClick={() => { setMenu(false); onLoadNew(); }}>
                  <Upload size={13} /> Load new design
                </button>
              </div>
            </>
          )}
        </div>

        <div className="seg">
          <button className={view === "dashboard" ? "on" : ""} onClick={() => setView("dashboard")}>
            Dashboard
          </button>
          <button className={view === "bug" ? "on" : ""} onClick={() => setView("bug")}>
            Bug detail
            {hasBug && <span className="seg-dot" />}
          </button>
        </div>

        {connected && (running ? (
          <button className="btn-ghost btn-run" disabled={busy} onClick={onStop}>
            <Square size={12} /> Stop
          </button>
        ) : (
          <button className="btn-em btn-run" disabled={busy} onClick={onStart}>
            <Play size={12} /> {done || error ? "Run again" : "Start"}
          </button>
        ))}
      </div>
    </header>
  );
}
