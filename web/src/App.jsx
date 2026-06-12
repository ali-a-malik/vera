import { useEffect, useRef, useState } from "react";
import { CSS } from "./theme";
import usePolling from "./usePolling";
import { initialState, useMockEngine } from "./mock";
import TopBar from "./components/TopBar";
import Dashboard from "./components/Dashboard";
import BugView from "./components/BugView";
import LoadModal from "./components/LoadModal";

export default function App() {
  const { state: live, connected, post } = usePolling("/api/state", 1000);
  const mock = useMockEngine(!connected);
  const sim = (connected ? live : mock) || initialState();

  const [view, setView] = useState("dashboard");
  const [modal, setModal] = useState(false);
  const [designs, setDesigns] = useState([
    { id: "fifo_8x8", name: "fifo_8x8" },
  ]);
  const [active, setActive] = useState("fifo_8x8");
  const [busy, setBusy] = useState(false);

  // remember the last bug so Bug detail still shows after a reset
  const lastBug = useRef(null);
  if (sim.bug) lastBug.current = sim.bug;

  // smooth coverage number tween
  const [disp, setDisp] = useState(0);
  const covTarget = useRef(0);
  covTarget.current = sim.coverage_percent;
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

  const start = async () => {
    setBusy(true);
    if (sim.status === "done" || sim.status === "error") await post("/api/reset");
    await post("/api/start", { dut: "buggy", demo: true });
    setBusy(false);
  };
  const stop = async () => {
    setBusy(true);
    await post("/api/stop");
    setBusy(false);
  };

  return (
    <div className="vera-root">
      <style>{CSS}</style>
      <TopBar
        sim={sim}
        connected={connected}
        busy={busy}
        onStart={start}
        onStop={stop}
        view={view}
        setView={setView}
        designs={designs}
        active={active}
        setActive={setActive}
        onLoadNew={() => setModal(true)}
        hasBug={Boolean(lastBug.current)}
      />

      {view === "dashboard" ? (
        <Dashboard sim={sim} disp={disp} onInspect={() => setView("bug")} />
      ) : (
        <BugView bug={lastBug.current} onBack={() => setView("dashboard")} />
      )}

      {modal && (
        <LoadModal
          onClose={() => setModal(false)}
          onLoad={(name, file) => {
            const id = `${name.replace(/\s+/g, "_")}_${Date.now()}`;
            setDesigns((ds) => [...ds, { id, name, file, fresh: true }]);
            setActive(id);
            setModal(false);
          }}
        />
      )}
    </div>
  );
}
