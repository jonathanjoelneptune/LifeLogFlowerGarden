/* v94_garden.js
 * LifeLog Garden v94
 * Real-ish scene renderer (SVG) wired to GardenExport API payload.
 *
 * Expected payload:
 *   { ok:true, meta:{...}, rows:[ {DateKey:"YYYY-MM-DD", PrimaryColor:"#...", SecondaryColor:"#...", ...}, ... ] }
 *
 * Exposes:
 *   window.v94Garden = { init(), setExport(payload), rebuild(), renderPlaceholder() }
 */

(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  function $(id) { return document.getElementById(id); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function safeStr(v) { return (v === null || v === undefined) ? "" : String(v); }
  function safeNum(v, def = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }
  function isHexColor(s) {
    if (!s) return false;
    const t = String(s).trim();
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t);
  }
  function colorOr(s, fallback) {
    return isHexColor(s) ? String(s).trim() : fallback;
  }
  function clearNode(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }
  function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) el.setAttribute(k, String(attrs[k]));
    }
    return el;
  }
  function addTitle(el, text) {
    const t = svgEl("title");
    t.textContent = text;
    el.appendChild(t);
  }

  const DEFAULTS = {
    primary: "#F4EDE7",
    secondary: "#D8E5DC",
    skyTop: "#0b1633",
    skyMid: "#15305d",
    skyGlow: "rgba(120,170,255,0.55)",
    hillFar: "#123026",
    hillNear: "#0f2a22",
    groundTop: "rgba(20,70,40,0.35)",
    groundBot: "rgba(10,35,25,0.92)",
    stem: "#3aa56a",
    stemDark: "#2d7f52",
    bead: "rgba(255,210,110,0.92)"
  };

  const state = {
    initialized: false,
    svg: null,
    exportPayload: null,
    viewW: 1600,
    viewH: 900
  };

  function hud(msg) {
    const el = $("hudlog");
    if (!el) return;
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    el.textContent += `\n[${hh}:${mm}:${ss}] ${msg}`;
    el.scrollTop = el.scrollHeight;
  }

  function initSvgRefs() {
    const svg = $("svgRoot");
    if (!svg) throw new Error("Missing #svgRoot");
    state.svg = svg;

    const vb = safeStr(svg.getAttribute("viewBox")).trim();
    if (vb) {
      const parts = vb.split(/\s+/).map(Number);
      if (parts.length === 4 && parts.every(Number.isFinite)) {
        state.viewW = parts[2];
        state.viewH = parts[3];
      }
    }
  }

  // --- Scene building blocks (SVG) ---

  function ensureDefs(root) {
    const defs = svgEl("defs");

    // Sky gradient
    const gSky = svgEl("linearGradient", { id: "v94Sky", x1: "0", y1: "0", x2: "0", y2: "1" });
    gSky.appendChild(svgEl("stop", { offset: "0%", "stop-color": DEFAULTS.skyTop }));
    gSky.appendChild(svgEl("stop", { offset: "55%", "stop-color": DEFAULTS.skyMid }));
    gSky.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#071022" }));
    defs.appendChild(gSky);

    // Sun glow radial
    const gSun = svgEl("radialGradient", { id: "v94Sun", cx: "35%", cy: "18%", r: "55%" });
    gSun.appendChild(svgEl("stop", { offset: "0%", "stop-color": "rgba(255,230,160,0.95)" }));
    gSun.appendChild(svgEl("stop", { offset: "25%", "stop-color": "rgba(255,210,120,0.45)" }));
    gSun.appendChild(svgEl("stop", { offset: "60%", "stop-color": DEFAULTS.skyGlow }));
    gSun.appendChild(svgEl("stop", { offset: "100%", "stop-color": "rgba(0,0,0,0)" }));
    defs.appendChild(gSun);

    // Ground gradient
    const gGround = svgEl("linearGradient", { id: "v94Ground", x1: "0", y1: "0", x2: "0", y2: "1" });
    gGround.appendChild(svgEl("stop", { offset: "0%", "stop-color": DEFAULTS.groundTop }));
    gGround.appendChild(svgEl("stop", { offset: "100%", "stop-color": DEFAULTS.groundBot }));
    defs.appendChild(gGround);

    // Soft fog band
    const gFog = svgEl("linearGradient", { id: "v94Fog", x1: "0", y1: "0", x2: "0", y2: "1" });
    gFog.appendChild(svgEl("stop", { offset: "0%", "stop-color": "rgba(255,255,255,0.10)" }));
    gFog.appendChild(svgEl("stop", { offset: "100%", "stop-color": "rgba(255,255,255,0)" }));
    defs.appendChild(gFog);

    root.appendChild(defs);
  }

  function hillsPath(yBase, amp, seed) {
    // Deterministic-ish hills using a few sine bumps
    const W = state.viewW;
    const step = 160;
    let d = `M 0 ${yBase}`;
    for (let x = 0; x <= W + step; x += step) {
      const t = (x / W) * Math.PI * 2;
      const y = yBase - (Math.sin(t * 1.3 + seed) * 0.55 + Math.sin(t * 0.7 + seed * 1.7) * 0.45) * amp;
      d += ` L ${x} ${Math.round(y)}`;
    }
    d += ` L ${W} ${state.viewH} L 0 ${state.viewH} Z`;
    return d;
  }

  function drawBackground(root) {
    const W = state.viewW, H = state.viewH;
    const sky = svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#v94Sky)" });
    root.appendChild(sky);

    const sun = svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#v94Sun)", opacity: 0.95 });
    root.appendChild(sun);

    // subtle stars
    const stars = svgEl("g", { opacity: 0.18 });
    for (let i = 0; i < 80; i++) {
      const x = (i * 97) % W;
      const y = (i * 53) % Math.round(H * 0.45);
      const r = 1 + ((i * 17) % 10) / 10;
      stars.appendChild(svgEl("circle", { cx: x, cy: y, r: r, fill: "rgba(255,255,255,0.9)" }));
    }
    root.appendChild(stars);

    // far hills
    root.appendChild(svgEl("path", {
      d: hillsPath(Math.round(H * 0.62), 38, 0.9),
      fill: DEFAULTS.hillFar,
      opacity: 0.55
    }));

    // near hills
    root.appendChild(svgEl("path", {
      d: hillsPath(Math.round(H * 0.70), 64, 1.7),
      fill: DEFAULTS.hillNear,
      opacity: 0.78
    }));

    // ground slab
    root.appendChild(svgEl("rect", {
      x: 0, y: Math.round(H * 0.62),
      width: W, height: Math.round(H * 0.38),
      fill: "url(#v94Ground)"
    }));

    // fog band
    root.appendChild(svgEl("rect", {
      x: 0,
      y: Math.round(H * 0.56),
      width: W,
      height: Math.round(H * 0.18),
      fill: "url(#v94Fog)"
    }));
  }

  function drawGrass(root) {
    const g = svgEl("g", { opacity: 0.55 });
    const W = state.viewW, H = state.viewH;
    const baseY = Math.round(H * 0.76);

    // quick "blade" strokes
    for (let i = 0; i < 420; i++) {
      const x = (i * 37) % W;
      const h = 14 + ((i * 19) % 38);
      const sway = ((i * 13) % 9) - 4;
      const y2 = baseY - h;
      g.appendChild(svgEl("path", {
        d: `M ${x} ${baseY} Q ${x + sway} ${baseY - h * 0.6} ${x + sway * 0.6} ${y2}`,
        stroke: "rgba(90,190,120,0.35)",
        "stroke-width": 1,
        fill: "none",
        "stroke-linecap": "round"
      }));
    }
    root.appendChild(g);
  }

  function makePetal(g, cx, cy, angleDeg, petalLen, petalWid, fill, opacity) {
    const a = angleDeg * Math.PI / 180;
    const ux = Math.cos(a), uy = Math.sin(a);
    const tipX = cx + ux * petalLen;
    const tipY = cy + uy * petalLen;
    const px = -uy, py = ux;
    const w = petalWid;

    const p1x = cx + px * w;
    const p1y = cy + py * w;

    const p2x = cx - px * w;
    const p2y = cy - py * w;

    g.appendChild(svgEl("path", {
      d: `M ${p1x} ${p1y} Q ${tipX} ${tipY} ${p2x} ${p2y} Q ${cx} ${cy} ${p1x} ${p1y} Z`,
      fill,
      opacity: opacity
    }));
  }

  function drawLeaf(g, x, y, dir, color) {
    // small bezier leaf
    const dx = dir * 34;
    const d = `M ${x} ${y}
               C ${x + dx * 0.35} ${y - 22}, ${x + dx * 0.85} ${y - 8}, ${x + dx} ${y - 26}
               C ${x + dx * 0.70} ${y - 16}, ${x + dx * 0.30} ${y - 8}, ${x} ${y} Z`;
    g.appendChild(svgEl("path", { d, fill: color, opacity: 0.55 }));
  }

  function normalizePayload(payload) {
    // Accept: full payload, or raw rows array
    if (Array.isArray(payload)) return { ok: true, rows: payload, meta: {} };
    if (payload && Array.isArray(payload.rows)) return payload;
    return { ok: false, rows: [], meta: {}, error: "Bad payload shape" };
  }

  function renderFromRows(rows) {
    if (!state.svg) return;

    clearNode(state.svg);

    const root = svgEl("g", { id: "v94SceneRoot" });
    state.svg.appendChild(root);
    ensureDefs(root);

    // background + grass
    drawBackground(root);
    drawGrass(root);

    // flower field group
    const field = svgEl("g", { id: "v94Field" });
    root.appendChild(field);

    const n = rows.length;
    if (!n) {
      renderPlaceholder();
      return;
    }

    // Layout: 10 columns, wrap to multiple bands
    const cols = 10;
    const marginX = 120;
    const usableW = state.viewW - marginX * 2;
    const dx = usableW / (cols - 1);

    const bandBottom = Math.round(state.viewH * 0.78);
    const bandTop = Math.round(state.viewH * 0.60);
    const bandH = Math.max(140, bandBottom - bandTop);

    const rowCount = Math.ceil(n / cols);
    const rowStep = rowCount <= 1 ? 0 : Math.floor(bandH / (rowCount - 1));

    for (let i = 0; i < n; i++) {
      const r = rows[i] || {};

      const dateKey = safeStr(r.DateKey);
      const primary = colorOr(r.PrimaryColor, DEFAULTS.primary);
      const secondary = colorOr(r.SecondaryColor, DEFAULTS.secondary);

      const dayLevel = safeNum(r.DayLevel, 0);
      const dailyScore = safeNum(r.DailyScore, 0);
      const totalEntries = safeNum(r.TotalEntries, 0);

      const col = i % cols;
      const rowIdx = Math.floor(i / cols);

      const x = Math.round(marginX + col * dx);
      const yBase = bandBottom - rowIdx * rowStep;

      const scoreBoost = clamp(dailyScore / 100, 0, 1);
      const entriesBoost = clamp(totalEntries / 18, 0, 1);
      const levelBoost = clamp(dayLevel / 5, 0, 1);

      const stemTopY = Math.round(yBase - (160 + 26 * scoreBoost + 14 * levelBoost));
      const headY = stemTopY - 26;

      const headR = Math.round(18 + 7 * scoreBoost + 4 * entriesBoost);
      const diskR = Math.round(headR * 0.48);
      const stemW = 3.4;

      const g = svgEl("g", { class: "flower" });
      field.appendChild(g);

      // Tooltip
      const tipLines = [
        dateKey ? `Date: ${dateKey}` : "Date: (missing)",
        safeStr(r.DayLevelLabel) ? `Day: ${safeStr(r.DayLevelLabel)}` : (dayLevel ? `DayLevel: ${dayLevel}` : ""),
        safeStr(r.WeekLevelLabel) ? `Week: ${safeStr(r.WeekLevelLabel)}` : "",
        dailyScore ? `DailyScore: ${dailyScore}` : "",
        totalEntries ? `Entries: ${totalEntries}` : "",
        safeStr(r.Haiku) ? `Haiku: ${safeStr(r.Haiku)}` : "",
        safeStr(r.DailyReflection) ? `Reflection: ${safeStr(r.DailyReflection)}` : ""
      ].filter(Boolean).join("\n");
      addTitle(g, tipLines);

      // Stem (slight sway)
      const sway = ((i % 5) - 2) * 6;
      g.appendChild(svgEl("path", {
        d: `M ${x} ${yBase} Q ${x + sway} ${Math.round((yBase + stemTopY) / 2)} ${x} ${stemTopY}`,
        stroke: DEFAULTS.stem,
        "stroke-width": stemW,
        "stroke-linecap": "round",
        fill: "none",
        opacity: 0.95
      }));

      g.appendChild(svgEl("path", {
        d: `M ${x + 1} ${yBase} Q ${x + sway + 1} ${Math.round((yBase + stemTopY) / 2)} ${x + 1} ${stemTopY}`,
        stroke: DEFAULTS.stemDark,
        "stroke-width": 1.2,
        "stroke-linecap": "round",
        fill: "none",
        opacity: 0.35
      }));

      // Leaves
      drawLeaf(g, x, Math.round(yBase - 60), -1, "rgba(80,175,110,1)");
      drawLeaf(g, x, Math.round(yBase - 84), +1, "rgba(70,160,105,1)");

      // Beads
      const beadCount = 10;
      for (let b = 0; b < beadCount; b++) {
        const t = b / (beadCount - 1);
        const y = Math.round(yBase + (stemTopY - yBase) * t);
        const rr = Math.round(4 + (1 - t) * 5);
        g.appendChild(svgEl("circle", {
          cx: x,
          cy: y,
          r: rr,
          fill: DEFAULTS.bead,
          opacity: 0.80
        }));
      }

      // Petals
      const petalCount = 12 + Math.round(8 * scoreBoost);
      const petalLen = headR + 12;
      const petalWid = Math.max(7, Math.round(headR * 0.40));
      for (let p = 0; p < petalCount; p++) {
        const ang = (360 / petalCount) * p + (rowIdx * 6);
        makePetal(g, x, headY, ang, petalLen, petalWid, primary, 0.90);
      }

      // Head rings
      g.appendChild(svgEl("circle", { cx: x, cy: headY, r: headR, fill: primary, opacity: 0.33 }));
      g.appendChild(svgEl("circle", { cx: x, cy: headY, r: diskR, fill: secondary, opacity: 0.96 }));

      // Date label
      const label = svgEl("text", {
        x: x,
        y: Math.round(headY - headR - 18),
        "text-anchor": "middle",
        "font-size": 12,
        fill: "rgba(255,255,255,0.72)"
      });
      label.textContent = dateKey || "";
      g.appendChild(label);
    }
  }

  function renderPlaceholder() {
    if (!state.svg) return;
    clearNode(state.svg);

    const root = svgEl("g");
    state.svg.appendChild(root);
    ensureDefs(root);

    drawBackground(root);
    drawGrass(root);

    // baseline stems row so you can see “something” without export
    const g = svgEl("g");
    root.appendChild(g);

    const cols = 10;
    const marginX = 120;
    const usableW = state.viewW - marginX * 2;
    const dx = usableW / (cols - 1);

    const groundY = Math.round(state.viewH * 0.78);
    const stemTopY = Math.round(state.viewH * 0.60);

    for (let i = 0; i < cols; i++) {
      const x = Math.round(marginX + i * dx);

      g.appendChild(svgEl("line", {
        x1: x, y1: groundY, x2: x, y2: stemTopY,
        stroke: DEFAULTS.stem, "stroke-width": 3, "stroke-linecap": "round", opacity: 0.95
      }));

      for (let b = 0; b < 9; b++) {
        const t = b / 8;
        const y = Math.round(groundY + (stemTopY - groundY) * t);
        const r = Math.round(4 + (1 - t) * 5);
        g.appendChild(svgEl("circle", { cx: x, cy: y, r, fill: DEFAULTS.bead, opacity: 0.82 }));
      }

      g.appendChild(svgEl("circle", { cx: x, cy: stemTopY - 24, r: 18, fill: DEFAULTS.primary, opacity: 0.9 }));
      g.appendChild(svgEl("circle", { cx: x, cy: stemTopY - 24, r: 9, fill: DEFAULTS.secondary, opacity: 0.95 }));
    }
  }

  function setExport(payload) {
    const norm = normalizePayload(payload);
    state.exportPayload = norm;

    const rows = norm && Array.isArray(norm.rows) ? norm.rows : [];
    renderFromRows(rows);

    hud(`Export applied. rows=${rows.length}`);
  }

  function rebuild() {
    const rows = state.exportPayload && Array.isArray(state.exportPayload.rows)
      ? state.exportPayload.rows
      : [];
    renderFromRows(rows);
    hud("Scene rebuilt.");
  }

  function init() {
    if (state.initialized) return;
    initSvgRefs();
    state.initialized = true;
    renderPlaceholder();
  }

  window.v94Garden = { init, setExport, rebuild, renderPlaceholder };

  try {
    init();
    console.log("v94_garden initialized.");
  } catch (e) {
    console.error("v94Garden init failed:", e);
    hud("ERROR: v94Garden init failed: " + (e && e.message ? e.message : String(e)));
  }
})();
