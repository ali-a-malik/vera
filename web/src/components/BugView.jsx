import { ArrowLeft, Bug } from "lucide-react";
import Waveform from "./Waveform";

const fmtVal = (v) => (v === true ? "1" : v === false ? "0" : String(v));

export default function BugView({ bug, onBack }) {
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

  const fields = Object.keys(bug.expected || {});
  const writes = (bug.minimal_ops || []).filter((o) => o.op === "write").length || 7;

  return (
    <main className="buggrid">
      <div className="bug-top">
        <button className="back" onClick={onBack}>
          <ArrowLeft size={14} /> dashboard
        </button>
        <h2>{bug.title}</h2>
        <span className="sev mono">{bug.severity || "functional"}</span>
      </div>

      <section className="panel wave-panel">
        <div className="lbl">waveform · failing cycle</div>
        <Waveform writes={writes} />
        <div className="wave-cap mono">
          <span className="rose-key" /> actual&nbsp;&nbsp;
          <span className="em-key" /> expected&nbsp;&nbsp;·&nbsp;&nbsp;
          <code>full</code> rises at count = {writes}, one cycle before count = {writes + 1}
        </div>
      </section>

      <div className="bug-cols">
        <section className="panel">
          <div className="lbl">minimal repro</div>
          <div className="bug-repro mono tall">
            {bug.minimal_repro.map((r, i) => (
              <div key={i}><span className="rn">{i + 1}</span>{r}</div>
            ))}
          </div>
          <div className="lbl" style={{ marginTop: 16 }}>scoreboard</div>
          <table className="cmp mono">
            <thead>
              <tr><th></th>{fields.map((f) => <th key={f}>{f}</th>)}</tr>
            </thead>
            <tbody>
              <tr>
                <td>expected</td>
                {fields.map((f) => <td key={f} className="em">{fmtVal(bug.expected[f])}</td>)}
              </tr>
              <tr>
                <td>got</td>
                {fields.map((f) => <td key={f} className="rose">{fmtVal(bug.got[f])}</td>)}
              </tr>
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="lbl">root-cause hypothesis</div>
          <p className="hyp">{bug.hypothesis}</p>
          {bug.fix && (
            <>
              <div className="lbl" style={{ marginTop: 16 }}>suggested fix</div>
              <div className="diff mono">
                <div className="d-rm">- {bug.fix.from}</div>
                <div className="d-add">+ {bug.fix.to}</div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
