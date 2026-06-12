import { useCallback, useEffect, useRef, useState } from "react";

// Polls GET /api/state every `ms`. After 3 consecutive failures the app is
// considered disconnected and falls back to the self-running demo replay.
export default function usePolling(url, ms = 1000) {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const fails = useRef(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!alive) return;
        fails.current = 0;
        setState(json);
        setConnected(true);
      } catch {
        if (!alive) return;
        fails.current += 1;
        if (fails.current >= 3) setConnected(false);
      }
    };
    tick();
    const id = setInterval(tick, ms);
    return () => { alive = false; clearInterval(id); };
  }, [url, ms]);

  const post = useCallback(async (path, body) => {
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return await res.json();
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, []);

  return { state, connected, post };
}
