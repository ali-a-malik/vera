// The design source of truth — ported verbatim from VeraUI.jsx, plus the
// few additions marked at the bottom (start/stop controls, working dots,
// replay chip). One accent (emerald), one alert (rose), the rest grayscale.

export const CSS = `
:root{
  --bg:#08090b; --panel:#0d0f13; --bd:rgba(255,255,255,.06); --bd2:rgba(255,255,255,.11);
  --tx:#ECEDEE; --tx2:#9296a0; --tx3:#5b606b;
  --em:#34d399; --rose:#fb7185;
  --mono:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,monospace;
  --sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
}
body{ margin:0; }
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
.status.is-idle{ color:var(--tx2); background:rgba(255,255,255,.03); border-color:var(--bd2); }
.status.is-idle .status-dot{ background:var(--tx3); box-shadow:none; animation:none; }
.status.is-error{ color:var(--rose); background:rgba(251,113,133,.08); border-color:rgba(251,113,133,.25); }
.status.is-error .status-dot{ background:var(--rose); box-shadow:0 0 8px var(--rose); animation:none; }
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

/* --- additions for the live app (same design language) --- */
.line.clickable{ cursor:pointer; border-radius:6px; margin:0 -6px; padding:2px 6px; transition:background .15s; }
.line.clickable:hover{ background:rgba(255,255,255,.04); }
.line .exp-caret{ color:var(--tx3); flex:none; margin-left:auto; transition:transform .2s; }
.line .exp-caret.open{ transform:rotate(180deg); }
.test-detail{ margin:2px 0 4px 47px; padding:9px 12px; font-size:12px; line-height:1.6;
  color:var(--tx2); background:rgba(52,211,153,.04); border-left:2px solid rgba(52,211,153,.4);
  border-radius:0 8px 8px 0; animation:fadeUp .25s ease-out; }
.test-detail .td-meta{ color:var(--tx3); font-size:10.5px; margin-top:6px;
  font-family:var(--mono); }

.analysis-panel .hyp{ white-space:pre-wrap; }
.model-tag{ font-size:10px; color:var(--tx3); border:1px solid var(--bd);
  padding:2px 7px; border-radius:6px; font-family:var(--mono); }
.chat-box{ display:flex; flex-direction:column; gap:0; }
.chat-log{ display:flex; flex-direction:column; gap:10px; margin-top:14px;
  max-height:340px; overflow-y:auto; padding-right:4px; }
.chat-msg{ font-size:12.5px; line-height:1.6; }
.chat-msg .who{ font-size:10px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--tx3); font-family:var(--mono); margin-bottom:3px; }
.chat-msg.user{ color:var(--tx); }
.chat-msg.assistant{ color:var(--tx2); white-space:pre-wrap; }
.chat-msg.assistant .who{ color:var(--em); }
.chat-row{ display:flex; gap:8px; margin-top:14px; }
.chat-row .field{ margin-bottom:0; flex:1; font-size:12.5px; }
.chat-empty{ font-size:12px; color:var(--tx3); margin-top:14px; }
.btn-run{ display:inline-flex; align-items:center; gap:7px; }
.replay-chip{ display:inline-flex; align-items:center; gap:6px; font-size:11px; color:var(--tx3);
  border:1px dashed var(--bd2); padding:5px 10px; border-radius:8px; font-family:var(--mono); }
.working{ display:flex; align-items:center; gap:9px; font-size:12px; color:var(--tx3);
  font-family:var(--mono); }
.working .log-t{ min-width:38px; }
.working-dots::after{ content:'…'; animation:pulse 1.2s ease-in-out infinite; }
`;
