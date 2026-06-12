export default function StatsStrip({ counts, memory }) {
  const tiles = [
    ["tests generated", counts.tests_generated, false],
    ["bugs found", counts.bugs_found, true],
    ["est. hours saved", `~${counts.hours_saved_est}`, false],
    ["tokens used", `${Math.round(counts.tokens_used / 1000)}k`, false],
  ];
  return (
    <section className="stats">
      {tiles.map(([k, v, danger]) => (
        <div className="stat" key={k}>
          <div className="lbl">
            {k}
            {k === "tests generated" && memory?.patterns_learned > 0 && (
              <span className="mi-meta mono">· {memory.patterns_learned} patterns learned</span>
            )}
          </div>
          <div className={`stat-v mono ${danger && v ? "danger" : ""}`}>{v}</div>
        </div>
      ))}
    </section>
  );
}
