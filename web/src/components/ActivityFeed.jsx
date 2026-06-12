import { useState } from "react";
import { Activity, ChevronDown } from "lucide-react";

export default function ActivityFeed({ log, tests = [], running }) {
  const [open, setOpen] = useState(null); // test id currently expanded
  const lines = log.slice(-7);
  const byId = Object.fromEntries(tests.map((t) => [t.id, t]));

  return (
    <section className="panel feed">
      <div className="lbl"><Activity size={11} /> agent activity</div>
      <div className="log">
        {lines.map((l, i) => {
          const test = l.test != null ? byId[l.test] : null;
          const isOpen = test && open === test.id;
          return (
            <div key={`${l.t}-${i}-${l.text}`}>
              <div
                className={`line lv-${l.level} ${test ? "clickable" : ""}`}
                onClick={test ? () => setOpen(isOpen ? null : test.id) : undefined}
                title={test ? "What does this test do?" : undefined}
              >
                <span className="log-t mono">{l.t}</span>
                <span className="log-dot" />
                <span className="mono">{l.text}</span>
                {test && <ChevronDown size={12} className={`exp-caret ${isOpen ? "open" : ""}`} />}
              </div>
              {isOpen && (
                <div className="test-detail">
                  {test.explanation}
                  <div className="td-meta">
                    target: {test.target}{test.ops?.length ? ` · ${test.ops.length} ops` : ""} · {test.source}
                    {test.gained?.length ? ` · closed: ${test.gained.join(", ")}` : ""}
                    {test.mismatches ? ` · ${test.mismatches} mismatch${test.mismatches > 1 ? "es" : ""}` : ""}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {running && (
          <div className="working">
            <span className="log-t mono" />
            <span className="working-dots">working</span>
          </div>
        )}
      </div>
    </section>
  );
}
