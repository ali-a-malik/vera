import { useRef, useState } from "react";
import { MessageCircle, Send, Sparkles } from "lucide-react";

// Analysis (written by fable-5 at run end) + grounded Q&A (opus-4-8 via
// Pioneer). Rendered on the Bug detail page.
export default function RunChat({ sim, connected }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);

  const analysis = sim.analysis;

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    const history = msgs.map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const d = await res.json();
      setMsgs((m) => [...m, {
        role: "assistant",
        content: d.ok ? d.answer : `(error: ${d.error})`,
      }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: `(error: ${e})` }]);
    }
    setBusy(false);
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50);
  };

  return (
    <div className="bug-cols">
      <section className="panel analysis-panel">
        <div className="lbl">
          <Sparkles size={11} /> run analysis
          <span className="model-tag">{analysis?.model || "fable-5"}</span>
        </div>
        <p className="hyp">
          {analysis?.text || "No analysis yet — it's written when a run completes."}
        </p>
      </section>

      <section className="panel chat-box">
        <div className="lbl">
          <MessageCircle size={11} /> ask vera about this run
          <span className="model-tag">opus-4-8 · pioneer</span>
        </div>
        <div className="chat-log" ref={logRef}>
          {msgs.length === 0 && (
            <div className="chat-empty">
              Ask anything — "why does the bug only show at 7 writes?", "what
              wasn't verified?", "walk me through test #3".
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              <div className="who">{m.role === "user" ? "you" : "vera"}</div>
              {m.content}
            </div>
          ))}
          {busy && (
            <div className="chat-msg assistant">
              <div className="who">vera</div>
              <span className="working-dots">thinking</span>
            </div>
          )}
        </div>
        <div className="chat-row">
          <input
            className="field" value={input} placeholder={connected ? "Ask about the bugs, coverage, the RTL…" : "engine offline — chat unavailable"}
            disabled={!connected || busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button className="btn-em btn-run" disabled={!connected || busy || !input.trim()} onClick={send}>
            <Send size={12} />
          </button>
        </div>
      </section>
    </div>
  );
}
