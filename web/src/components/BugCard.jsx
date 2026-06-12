import { AlertTriangle, ArrowUpRight } from "lucide-react";

export default function BugCard({ bug, onInspect }) {
  return (
    <section className="panel bugcard" key="bugcard">
      <div className="bug-head">
        <AlertTriangle size={15} />
        <span>bug found — {bug.title}</span>
      </div>
      <div className="bug-repro mono">
        {bug.minimal_repro.map((r, i) => (
          <div key={i}><span className="rn">{i + 1}</span>{r}</div>
        ))}
      </div>
      <button className="inspect" onClick={onInspect}>
        Inspect failure <ArrowUpRight size={14} />
      </button>
    </section>
  );
}
