/* v94_garden.js
 * LifeLog Garden v94
 * GitHub Pages renderer wired to GardenExport API payload.
 *
 * Expected payload shape:
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

  function logToHud(msg) {
    // host_boot already writes into #hudlog. This is a safe supplement if needed.
    const el = $("hudlog");
    if (!el) return;
    const time = new Date();
    const hh = String(time.getHours()).padStart(2, "0");
    const mm = String(time.getMinutes()).padStart(2, "0");
    const ss = String(time.getSeconds()).padStart(2, "0");
    el.textContent += `\n[${hh}:${mm}:${ss}] ${msg}`;
    el.scrollTop = el.scrollHeight;
  }

  function initSvgRefs() {
    const svg = $("svgRoot");
    if (!svg) throw new Error("Missing #svgRoot");
    state.svg = svg;

    // Pull viewBox if present
    const vb = safeStr(svg.getAttribute("viewBox")).trim();
    if (vb) {
      const parts = vb.split(/\s+/).map(Number);
      if (parts.length === 4 && parts.every(Number.isFinite)) {
        state.viewW = parts[2];
        state.viewH = parts[3];
      }
    }
  }

  function renderPlaceholder() {
    if (!state.svg) return;
    clearNode(state.svg);

    const g = svgEl("g");
    state.svg.appendChild(g);

    // Just show a calm baseline row of stems as a fallback
    const cols = 10;
    const marginX = 120;
    const usableW = state.viewW - marginX * 2;
    const dx = usableW / (cols - 1);

    const groundY = Math.round(state.viewH * 0.66);
    const stemTopY = Math.round(state.viewH * 0.46);

    for (let i = 0; i < cols; i++) {
      const x = Math.round(marginX + i * dx);

      // stem line
      g.appendChild(svgEl("line", {
        x1: x, y1: groundY, x2: x, y2: stemTopY,
        stroke: DEFAULTS.stem,
        "stroke-width": 3,
        "stroke-linecap": "round",
        opacity: 0.95
      }));

      // beads
      const beadCount = 10;
      for (let b = 0; b < beadCount; b++) {
        const t = b / (beadCount - 1);
        const y = Math.round(groundY + (stemTopY - groundY) * t);
        const r = Math.round(4 + (1 - t) * 5);
        g.appendChild(svgEl("circle", {
          cx: x, cy: y, r,
          fill: DEFAULTS.bead,
          opacity: 0.85
        }));
      }

      // flower head
      g.appendChild(svgEl("circle", {
        cx: x, cy: stemTopY - 18, r: 18,
        fill: DEFAULTS.primary,
        opacity: 0.9
      }));
      g.appendChild(svgEl("circle", {
        cx: x, cy: stemTopY - 18, r: 9,
        fill: DEFAULTS.secondary,
        opacity: 0.95
      }));
    }
  }

  function makePetal(g, cx, cy, angleDeg, petalLen, petalWid, fill, opacity) {
    const a = angleDeg * Math.PI / 180;
    const ux = Math.cos(a), uy = Math.sin(a);

    // Base and tip points
    const tipX = cx + ux * petalLen;
    const tipY = cy + uy * petalLen;

    // Perp vector for width
    const px = -uy, py = ux;
    const w = petalWid;

    const p1x = cx + px * w;
    const p1y = cy + py * w;

    const p2x = cx - px * w;
    const p2y = cy - py * w;

    const path = svgEl("path", {
      d: `M ${p1x} ${p1y} Q ${tipX} ${tipY} ${p2x} ${p2y} Q ${cx} ${cy} ${p1x} ${p1y} Z`,
      fill,
      opacity: opacity
    });
    g.appendChild(path);
  }

  function renderFromRows(rows) {
    if (!state.svg) return;
    clearNode(state.svg);

    const root = svgEl("g", { id: "gardenRoot" });
    state.svg.appendChild(root);

    const n = rows.length;
    if (n === 0) {
      renderPlaceholder();
      return;
    }

    // Layout
    const cols = 10;
    const marginX = 110;
    const usableW = state.viewW - marginX * 2;
    const dx = usableW / (cols - 1);

    const topLabelY = Math.round(state.viewH * 0.43);
    const groundY = Math.round(state.viewH * 0.69);

    // Determine rows (wrap after 10)
    const rowCount = Math.ceil(n / cols);

    // Vertical spacing for multiple rows of flowers
    const bandTop = Math.round(state.viewH * 0.46);
    const bandBottom = Math.round(state.viewH * 0.64);
    const bandH = Math.max(120, bandBottom - bandTop);
    const rowStep = rowCount <= 1 ? 0 : Math.floor(bandH / (rowCount - 1));

    // Background guide line (subtle)
    root.appendChild(svgEl("line", {
      x1: marginX,
      y1: bandBottom,
      x2: state.viewW - marginX,
      y2: bandBottom,
      stroke: "rgba(255,255,255,0.08)",
      "stroke-width": 1
    }));

    for (let i = 0; i < n; i++) {
      const r = rows[i] || {};

      const dateKey = safeStr(r.DateKey);
      const primary = colorOr(r.PrimaryColor, DEFAULTS.primary);
      const secondary = colorOr(r.SecondaryColor, DEFAULTS.secondary);

      // These are optional, used for subtle scaling
      const dayLevel = safeNum(r.DayLevel, 0);         // may be blank
      const dailyScore = safeNum(r.DailyScore, 0);     // may be blank
      const totalEntries = safeNum(r.TotalEntries, 0); // may be blank

      // Column/row position
      const col = i % cols;
      const rowIdx = Math.floor(i / cols);

      const x = Math.round(marginX + col * dx);
      const yBase = bandBottom - rowIdx * rowStep;

      // Scale logic, very gentle (keeps consistent look even if fields blank)
      const scoreBoost = clamp(dailyScore / 100, 0, 1); // if your scores are 0-100
      const entriesBoost = clamp(totalEntries / 20, 0, 1);

      const stemTopY = Math.round(yBase - 150 - 30 * scoreBoost);
      const headY = stemTopY - 26;

      const headR = Math.round(16 + 6 * scoreBoost + 3 * entriesBoost);
      const diskR = Math.round(headR * 0.48);

      const stemW = 3.2;
      const beadCount = 10;

      // Group for one flower
      const g = svgEl("g", { class: "flower" });
      root.appendChild(g);

      // Tooltip summary
      const tipLines = [
        dateKey ? `Date: ${dateKey}` : "Date: (missing)",
        safeStr(r.DayLevelLabel) ? `Day: ${safeStr(r.DayLevelLabel)}` : (dayLevel ? `DayLevel: ${dayLevel}` : ""),
        safeStr(r.WeekLevelLabel) ? `Week: ${safeStr(r.WeekLevelLabel)}` : (safeStr(r.WeekLevel) ? `WeekLevel: ${safeStr(r.WeekLevel)}` : ""),
        dailyScore ? `DailyScore: ${dailyScore}` : "",
        totalEntries ? `Entries: ${totalEntries}` : "",
      ].filter(Boolean).join("\n");
      addTitle(g, tipLines);

      // Stem
      g.appendChild(svgEl("line", {
        x1: x, y1: yBase,
        x2: x, y2: stemTopY,
        stroke: DEFAULTS.stem,
        "stroke-width": stemW,
        "stroke-linecap": "round",
        opacity: 0.95
      }));

      // Stem highlight
      g.appendChild(svgEl("line", {
        x1: x + 1, y1: yBase,
        x2: x + 1, y2: stemTopY,
        stroke: DEFAULTS.stemDark,
        "stroke-width": 1.2,
        "stroke-linecap": "round",
        opacity: 0.35
      }));

      // Beads along stem
      for (let b = 0; b < beadCount; b++) {
        const t = b / (beadCount - 1);
        const y = Math.round(yBase + (stemTopY - yBase) * t);
        const rr = Math.round(4 + (1 - t) * 5);
        g.appendChild(svgEl("circle", {
          cx: x,
          cy: y,
          r: rr,
          fill: "rgba(255,210,110,0.92)",
          opacity: 0.82
        }));
      }

      // Flower head petals
      const petalCount = 10 + Math.round(6 * scoreBoost);
      const petalLen = headR + 10;
      const petalWid = Math.max(6, Math.round(headR * 0.38));
      const petalOpacity = 0.92;

      for (let p = 0; p < petalCount; p++) {
        const ang = (360 / petalCount) * p;
        makePetal(g, x, headY, ang, petalLen, petalWid, primary, petalOpacity);
      }

      // Inner disk and ring
      g.appendChild(svgEl("circle", {
        cx: x, cy: headY, r: headR,
        fill: primary,
        opacity: 0.35
      }));
      g.appendChild(svgEl("circle", {
        cx: x, cy: headY, r: diskR,
        fill: secondary,
        opacity: 0.96
      }));

      // Date label above the flower
      const label = svgEl("text", {
        x: x,
        y: topLabelY - rowIdx * 16,
        "text-anchor": "middle",
        "font-size": 12,
        fill: "rgba(255,255,255,0.65)"
      });
      label.textContent = dateKey || "";
      g.appendChild(label);
    }
  }

  function setExport(payload) {
    state.exportPayload = payload;

    const rows = payload && Array.isArray(payload.rows) ? payload.rows : [];
    renderFromRows(rows);
  }

  function rebuild() {
    const rows = state.exportPayload && Array.isArray(state.exportPayload.rows)
      ? state.exportPayload.rows
      : [];
    renderFromRows(rows);
  }

  function init() {
    if (state.initialized) return;
    initSvgRefs();
    state.initialized = true;

    // Initial render
    renderPlaceholder();
  }

  // Expose module expected by host_boot.js
  window.v94Garden = {
    init,
    setExport,
    rebuild,
    renderPlaceholder
  };

  // Auto-init on load
  try {
    init();
  } catch (e) {
    console.error("v94Garden init failed:", e);
    logToHud("ERROR: v94Garden init failed: " + (e && e.message ? e.message : String(e)));
  }

  // Helpful console trace
  console.log("v94_garden initialized.");
})();
