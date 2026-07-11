/* ========================================================================
   DESIGN SYSTEM — Deep Space Theme
   ======================================================================== */
:root {
  --bg-primary: #050510;
  --bg-secondary: #0a0e1a;
  --bg-panel: rgba(8, 12, 28, 0.88);
  --bg-panel-hover: rgba(15, 22, 45, 0.92);
  --border-subtle: rgba(80, 120, 200, 0.15);
  --border-active: rgba(0, 212, 255, 0.4);
  --text-primary: #e0e8f0;
  --text-secondary: #8899aa;
  --text-muted: #556677;
  --accent-cyan: #00d4ff;
  --accent-magenta: #ff3366;
  --accent-gold: #ffd700;
  --accent-green: #00ff88;
  --gw-color: #00ff88;
  --gamma-color: #ffffff;
  --xray-color: #00ccff;
  --uv-color: #9966ff;
  --optical-color: #ffdd00;
  --ir-color: #ff4400;
  --radio-color: #ff8800;
  --neutrino-color: #66ffcc;
  --glass-blur: 12px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --font-sans: 'Inter', -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --transition-fast: 150ms ease;
  --transition-med: 300ms ease;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; }
body {
  font-family: var(--font-sans);
  background: var(--bg-primary);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.25); border-radius: 3px; }

/* ========================================================================
   LAYOUT — CSS Grid Application Shell
   ======================================================================== */
#app {
  display: grid;
  grid-template-areas:
    "header  header"
    "viewport sidebar"
    "panels  sidebar"
    "timeline timeline";
  grid-template-columns: 1fr 330px;
  grid-template-rows: 48px 1fr 210px 64px;
  width: 100vw;
  height: 100vh;
  gap: 6px;
  padding: 6px;
  background: radial-gradient(ellipse at 50% 0%, rgba(10, 20, 60, 0.5) 0%, var(--bg-primary) 70%);
}

/* ========================================================================
   HEADER
   ======================================================================== */
#header {
  grid-area: header;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--bg-panel);
  backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}
#header h1 {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.5px;
  background: linear-gradient(135deg, var(--accent-cyan), var(--accent-magenta));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
#header .subtitle {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 400;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.phase-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 20px;
  background: rgba(0, 212, 255, 0.15);
  color: var(--accent-cyan);
  border: 1px solid rgba(0, 212, 255, 0.3);
  text-transform: uppercase;
  letter-spacing: 1px;
  transition: all var(--transition-med);
}
.learn-btn {
  font-size: 11px;
  font-weight: 500;
  padding: 4px 12px;
  border-radius: 20px;
  background: rgba(255, 51, 102, 0.12);
  color: var(--accent-magenta);
  border: 1px solid rgba(255, 51, 102, 0.3);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.learn-btn:hover { background: rgba(255, 51, 102, 0.25); }

/* ========================================================================
   3D VIEWPORT
   ======================================================================== */
#viewport-panel {
  grid-area: viewport;
  position: relative;
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  background: #000008;
}
#three-canvas {
  width: 100% !important;
  height: 100% !important;
  display: block;
}
#viewport-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 16px;
  background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
  pointer-events: none;
}
#viewport-overlay > * { pointer-events: auto; }
.play-btn, .reset-btn, .skip-btn {
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--border-subtle);
  border-radius: 20px;
  cursor: pointer;
  transition: all var(--transition-fast);
  color: var(--text-primary);
}
.play-btn {
  padding: 6px 20px;
  background: rgba(0, 212, 255, 0.2);
  border-color: var(--accent-cyan);
}
.play-btn:hover { background: rgba(0, 212, 255, 0.35); }
.reset-btn {
  padding: 6px 14px;
  background: rgba(255, 51, 102, 0.15);
  border-color: rgba(255,51,102,0.4);
}
.reset-btn:hover { background: rgba(255, 51, 102, 0.3); }
.skip-btn {
  padding: 5px 10px;
  background: rgba(255,255,255,0.06);
  font-size: 11px;
}
.skip-btn:hover { background: rgba(255,255,255,0.12); }
.speed-control {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}
.speed-control input[type="range"] {
  width: 70px;
  accent-color: var(--accent-cyan);
}
#speed-label {
  font-family: var(--font-mono);
  color: var(--accent-cyan);
  min-width: 40px;
}
#viewport-phase-label {
  position: absolute;
  top: 12px;
  left: 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-cyan);
  text-shadow: 0 0 20px rgba(0,212,255,0.5);
  pointer-events: none;
}
#immersive-hint {
  position:absolute; left:16px; bottom:54px; z-index:4;
  padding:7px 10px; border-radius:999px;
  background:rgba(3,8,22,.62); border:1px solid rgba(122,233,255,.2);
  color:#8fa5c5; font-size:9px; letter-spacing:.04em; pointer-events:none;
  backdrop-filter:blur(8px);
}
#viewport-time-label {
  position: absolute;
  top: 12px;
  right: 16px;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  pointer-events: none;
}
#evolution-caption {
  position: absolute;
  left: 16px;
  top: 62px;
  z-index: 13;
  max-width: 390px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(3, 8, 20, 0.70);
  border: 1px solid rgba(120, 190, 255, 0.18);
  backdrop-filter: blur(9px);
  color: #c6d4e7;
  font-size: 11px;
  line-height: 1.5;
  pointer-events: none;
}
#evolution-caption strong { color: #eef8ff; font-size: 11px; }
#evolution-caption .detail { display:block; margin-top:3px; color:#8ea6bf; font-size:9px; }

/* ========================================================================
   SIDEBAR (Controls + Info)
   ======================================================================== */
#sidebar {
  grid-area: sidebar;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}
.panel {
  background: var(--bg-panel);
  backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px;
  overflow-y: auto;
}
.panel-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-secondary);
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.panel-title::before {
  content: '';
  width: 3px;
  height: 12px;
  background: var(--accent-cyan);
  border-radius: 2px;
}

/* Controls Panel */
#controls-panel { flex: 1; min-height: 0; }
.control-group {
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.control-group:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.control-group-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 8px;
}
.control-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.control-row label {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.control-row .value {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--accent-cyan);
  min-width: 55px;
  text-align: right;
}
.control-row input[type="range"] {
  flex: 1;
  margin: 0 8px;
  height: 4px;
  accent-color: var(--accent-cyan);
  cursor: pointer;
}
.eos-select {
  width: 100%;
  padding: 5px 8px;
  font-size: 12px;
  font-family: var(--font-sans);
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  cursor: pointer;
  outline: none;
}
.eos-select:focus { border-color: var(--accent-cyan); }

/* Info Panel */
#info-panel { flex: 0 0 auto; max-height: 280px; }
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
}
.info-item {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 3px 0;
}
.info-item .label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.info-item .val {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--accent-green);
  transition: color var(--transition-fast);
}

/* ========================================================================
   BOTTOM PANELS (GW + EM)
   ======================================================================== */
#panels-area {
  grid-area: panels;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.chart-panel {
  background: var(--bg-panel);
  backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 8px;
  display: flex;
  flex-direction: column;
}
.chart-panel .panel-title { margin-bottom: 6px; }
.chart-panel canvas {
  flex: 1;
  width: 100%;
  border-radius: var(--radius-sm);
}
.em-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-top: 4px;
}
.em-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 9px;
  color: var(--text-muted);
  cursor: default;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255,255,255,0.035);
  border: 1px solid rgba(255,255,255,0.055);
}
.em-legend-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

/* ========================================================================
   TIMELINE
   ======================================================================== */
#timeline-panel {
  grid-area: timeline;
  background: var(--bg-panel);
  backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}
#timeline-track {
  flex: 1;
  height: 36px;
  position: relative;
  cursor: ew-resize;
  touch-action: none;
  user-select: none;
}
#timeline-track.dragging #timeline-cursor { transform: translateX(-5px) scale(1.35); box-shadow: 0 0 16px var(--accent-cyan); }
#timeline-track:hover #timeline-bar { background: rgba(255,255,255,0.14); }
#timeline-bar {
  position: absolute;
  top: 16px;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
}
#timeline-progress {
  position: absolute;
  top: 16px;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent-cyan), var(--accent-magenta));
  border-radius: 2px;
  transition: width 100ms linear;
}
#timeline-cursor {
  position: absolute;
  top: 12px;
  width: 10px;
  height: 10px;
  background: var(--accent-cyan);
  border-radius: 50%;
  transform: translateX(-5px);
  box-shadow: 0 0 8px var(--accent-cyan);
  z-index: 5;
}
.tl-event {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  text-align: center;
  font-size: 8px;
  color: var(--text-muted);
  transition: color var(--transition-fast);
  white-space: nowrap;
}
.tl-event.active { color: var(--accent-cyan); }
.tl-event .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  margin: 2px auto 2px;
  transition: all var(--transition-fast);
}
.tl-event.active .dot {
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan);
}
#timeline-time-label {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  min-width: 90px;
  text-align: right;
}

/* ========================================================================
   EDUCATIONAL MODAL
   ======================================================================== */
#edu-modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(6px);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}
#edu-modal-overlay.visible { display: flex; }
#edu-modal {
  background: var(--bg-secondary);
  border: 1px solid var(--border-active);
  border-radius: var(--radius-lg);
  padding: 28px 32px;
  max-width: 560px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(0,212,255,0.1);
  animation: modalIn 300ms ease;
}
@keyframes modalIn {
  from { transform: translateY(20px) scale(0.96); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}
#edu-modal .modal-icon { font-size: 32px; margin-bottom: 8px; }
#edu-modal h2 {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 6px;
  background: linear-gradient(135deg, var(--accent-cyan), #88ddff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
#edu-modal .question {
  font-size: 14px;
  font-style: italic;
  color: var(--text-secondary);
  margin-bottom: 14px;
}
#edu-modal .explanation {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  margin-bottom: 16px;
}
#edu-modal .equation {
  font-family: var(--font-mono);
  font-size: 13px;
  background: rgba(0,212,255,0.06);
  border: 1px solid rgba(0,212,255,0.15);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  color: var(--accent-cyan);
  margin-bottom: 14px;
  text-align: center;
  overflow-x: auto;
}
.modal-nav {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}
.modal-nav button {
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  padding: 6px 16px;
  border-radius: 20px;
  border: 1px solid var(--border-subtle);
  background: rgba(255,255,255,0.06);
  color: var(--text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.modal-nav button:hover { background: rgba(255,255,255,0.12); }
.modal-close {
  background: rgba(255,51,102,0.15) !important;
  border-color: rgba(255,51,102,0.3) !important;
  color: var(--accent-magenta) !important;
}

/* Refined viewport overlays */
.viewport-hint {
  position: absolute;
  left: 16px;
  top: 38px;
  max-width: 310px;
  padding: 7px 10px;
  border-radius: 8px;
  background: rgba(3, 7, 18, 0.56);
  border: 1px solid rgba(120, 180, 255, 0.12);
  color: rgba(205, 220, 245, 0.68);
  font-size: 9px;
  letter-spacing: 0.03em;
  backdrop-filter: blur(8px);
  pointer-events: none;
}
.scene-chip {
  position: absolute;
  right: 16px;
  top: 38px;
  display: flex;
  gap: 6px;
  pointer-events: none;
}
.scene-chip span {
  padding: 4px 7px;
  border-radius: 999px;
  background: rgba(4, 9, 22, 0.58);
  border: 1px solid rgba(130, 180, 255, 0.12);
  color: rgba(190, 208, 238, 0.72);
  font-size: 8px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}


/* ========================================================================
   SCIENTIFIC SCENE ANNOTATIONS
   ======================================================================== */
#scene-annotations {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 12;
  overflow: hidden;
}
.scene-annotation {
  position: absolute;
  transform: translate(-50%, -50%);
  min-width: 92px;
  padding: 5px 8px 5px 9px;
  border: 1px solid rgba(130, 205, 255, 0.34);
  border-radius: 7px;
  background: rgba(3, 8, 20, 0.78);
  backdrop-filter: blur(8px);
  color: #eaf5ff;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 260ms ease, border-color 260ms ease, background 260ms ease;
  box-shadow: 0 4px 16px rgba(0,0,0,.25);
}
.scene-annotation.visible { opacity: .94; }
.scene-annotation::before {
  content: '';
  position: absolute;
  right: 100%;
  top: 50%;
  width: 24px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(123, 216, 255, .7));
}
.scene-annotation .sub {
  display: block;
  margin-top: 2px;
  color: #8ea6bf;
  font-size: 7px;
  font-weight: 400;
  letter-spacing: .02em;
  text-transform: none;
}
#annotation-toggle {
  position: absolute;
  top: 38px;
  right: 14px;
  z-index: 14;
  padding: 5px 9px;
  border-radius: 16px;
  border: 1px solid rgba(120,190,255,.28);
  background: rgba(3,8,20,.66);
  color: #a9bdd2;
  font-size: 9px;
  cursor: pointer;
  backdrop-filter: blur(8px);
}
#annotation-toggle.active { color: var(--accent-cyan); border-color: rgba(0,212,255,.5); }

/* ========================================================================
   RESPONSIVE
   ======================================================================== */
@media (max-width: 1100px) {
  #app {
    grid-template-areas:
      "header"
      "viewport"
      "sidebar"
      "panels"
      "timeline";
    grid-template-columns: 1fr;
    grid-template-rows: 48px 50vh auto 200px 64px;
    height: auto;
    min-height: 100vh;
    overflow-y: auto;
  }
  #panels-area { grid-template-columns: 1fr; }
  body { overflow-y: auto; }
}

/* ========================================================================
   ANIMATIONS
   ======================================================================== */
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes glow {
  0%, 100% { box-shadow: 0 0 5px var(--accent-cyan); }
  50% { box-shadow: 0 0 15px var(--accent-cyan), 0 0 30px rgba(0,212,255,0.3); }
}
.pulsing { animation: pulse 2s ease-in-out infinite; }
