/* v94_garden.js
 * LifeLog Garden v94
 * Real renderer wired to GardenExport API payload.
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

  // Deterministic PRNG from string (DateKey, WeekKey, etc.)
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }
  function mulberry32(seed) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFromKey(key) {
    const s = xmur3(key || "seed")();
    return mulberry32(s);
  }

  function hexToRgb(hex) {
    const h = String(hex).trim().replace("#", "");
    const full = (h.length === 3)
      ? (h[0] + h[0] + h[1] + h[1] + h[2] + h[2])
      : h;
    const n = parseInt(full, 16);
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255
    };
  }
  function rgbToHex(r, g, b) {
    const to2 = (x) => String(clamp(Math.round(x), 0, 255).toString(16)).padStart(2, "0");
    return "#" + to2(r) + to2(g) + to2(b);
  }
  function mixHex(a, b, t) {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    return rgbToHex(
      A.r + (B.r - A.r) * t,
      A.g + (B.g - A.g) * t,
      A.b + (B.b - A.b) * t
    );
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
    defs: null,
    exportPayload: null,
    viewW: 1600,
    viewH: 900
  };

  function logToHud(msg) {
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

    const vb = safeStr(svg.getAttribute("viewBox")).trim();
    if (vb) {
      const parts = vb.split(/\s+/).map(Number);
      if (parts.length === 4 && parts.every(Number.isFinite)) {
        state.viewW = parts[2];
        state.viewH = parts[3];
      }
    }

    // defs for gradients, filters, etc.
    state.defs = svgEl("defs");
    state.svg.appendChild(state.defs);

    // Soft glow filter for flower heads (subtle)
    const flt = svgEl("filter", { id: "v94Glow", x: "-30%", y: "-30%", width: "160%", height: "160%" });
    flt.appendChild(svgEl("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "1.4", result: "blur" }));
    flt.appendChild(svgEl("feColorMatrix", {
      in: "blur",
      type: "matrix",
      values: "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.55 0",
      result: "blurAlpha"
    }));
    const merge = svgEl("feMerge");
    merge.appendChild(svgEl("feMergeNode", { in: "blurAlpha" }));
    merge.appendChild(svgEl("feMergeNode", { in: "SourceGraphic" }));
    flt.appendChild(merge);
    state.defs.appendChild(flt);
  }

  function renderPlaceholder() {
    if (!state.svg) return;
    clearNode(state.svg);
    state.svg.appendChild(state.defs);

    const g = svgEl("g");
    state.svg.appendChild(g);

    const cols = 10;
    const marginX = 120;
    const usableW = state.viewW - marginX * 2;
    const dx = usableW / (cols - 1);

    const groundY = Math.round(state.viewH * 0.69);
    const stemTopY = Math.round(state.viewH * 0.49);

    for (let i = 0; i < cols; i++) {
      const x = Math.round(marginX + i * dx);

      g.appendChild(svgEl("line", {
        x1: x, y1: groundY, x2: x, y2: stemTopY,
        stroke: DEFAULTS.stem,
        "stroke-width": 3,
        "stroke-linecap": "round",
        opacity: 0.95
      }));

      const beadCount = 12;
      for (let b = 0; b < beadCount; b++) {
        const t = b / (beadCount - 1);
        const y = Math.round(groundY + (stemTopY - groundY) * t);
        const r = Math.round(4 + (1 - t) * 6);
        g.appendChild(svgEl("circle", {
          cx: x, cy: y, r,
          fill: DEFAULTS.bead,
          opacity: 0.85
        }));
      }

      // Simple head
      g.appendChild(svgEl("circle", {
        cx: x, cy: stemTopY - 22, r: 20,
        fill: DEFAULTS.primary,
        opacity: 0.95,
        filter: "url(#v94Glow)"
      }));
      g.appendChild(svgEl("circle", {
        cx: x, cy: stemTopY - 22, r: 9,
        fill: DEFAULTS.secondary,
        opacity: 0.95
      }));
    }
  }

  function makePetalPath(cx, cy, angleDeg, petalLen, petalWid, curl) {
    const a = angleDeg * Math.PI / 180;
    const ux = Math.cos(a), uy = Math.sin(a);
    const px = -uy, py = ux;

    const tipX = cx + ux * petalLen;
    const tipY = cy + uy * petalLen;

    const w = petalWid;
    const p1x = cx + px * w;
    const p1y = cy + py * w;

    const p2x = cx - px * w;
    const p2y = cy - py * w;

    // Curl offsets
    const c1x = cx + ux * (petalLen * 0.55) + px * (curl * 0.9);
    const c1y = cy + uy * (petalLen * 0.55) + py * (curl * 0.9);
    const c2x = cx + ux * (petalLen * 0.55) - px * (curl * 0.9);
    const c2y = cy + uy * (petalLen * 0.55) - py * (curl * 0.9);

    return `M ${p1x} ${p1y} C ${c1x} ${c1y} ${tipX} ${tipY} ${tipX} ${tipY}
            C ${tipX} ${tipY} ${c2x} ${c2y} ${p2x} ${p2y}
            Q ${cx} ${cy} ${p1x} ${p1y} Z`;
  }

  function addLeaf(g, x, y, side, len, wid, color, opacity, rotDeg) {
    const dir = side; // -1 left, +1 right
    const cx = x + dir * (wid * 0.35);
    const cy = y;

    const tipX = x + dir * len;
    const tipY = y - len * 0.2;

    const c1x = cx + dir * (len * 0.55);
    const c1y = cy - len * 0.55;

    const c2x = cx + dir * (len * 0.55);
    const c2y = cy + len * 0.15;

    const backX = x;
    const backY = y;

    const path = svgEl("path", {
      d: `M ${backX} ${backY} C ${c1x} ${c1y} ${tipX} ${tipY} ${tipX} ${tipY}
          C ${tipX} ${tipY} ${c2x} ${c2y} ${backX} ${backY} Z`,
      fill: color,
      opacity: opacity
    });
    if (rotDeg) {
      path.setAttribute("transform", `rotate(${rotDeg} ${x} ${y})`);
    }
    g.appendChild(path);
  }

  function renderFromRows(rows) {
    if (!state.svg) return;

    clearNode(state.svg);
    state.svg.appendChild(state.defs);

    const root = svgEl("g", { id: "gardenRoot" });
    state.svg.appendChild(root);

    const n = rows.length;
    if (n === 0) {
      renderPlaceholder();
      return;
    }

    // Layout: use 10 columns (like your screenshot), wrap if >10
    const cols = 10;
    const marginX = 120;
    const usableW = state.viewW - marginX * 2;
    const dx = usableW / (cols - 1);

    const bandBottom = Math.round(state.viewH * 0.74);
    const bandTop = Math.round(state.viewH * 0.47);
    const bandH = Math.max(160, bandBottom - bandTop);

    const rowCount = Math.ceil(n / cols);
    const rowStep = rowCount <= 1 ? 0 : Math.floor(bandH / (rowCount - 1));

    const labelBaseY = Math.round(state.viewH * 0.46);

    // subtle baseline
    root.appendChild(svgEl("line", {
      x1: marginX,
      y1: bandBottom,
      x2: state.viewW - marginX,
      y2: bandBottom,
      stroke: "rgba(255,255,255,0.06)",
      "stroke-width": 1
    }));

    for (let i = 0; i < n; i++) {
      const r = rows[i] || {};

      const dateKey = safeStr(r.DateKey);
      const weekKey = safeStr(r.WeekKey);

      const primary = colorOr(r.PrimaryColor, DEFAULTS.primary);
      const secondary = colorOr(r.SecondaryColor, DEFAULTS.secondary);

      const dayLevel = safeNum(r.DayLevel, 0);
      const dailyScore = safeNum(r.DailyScore, 0);
      const totalEntries = safeNum(r.TotalEntries, 0);

      const rng = rngFromKey(dateKey || String(i));

      // Position
      const col = i % cols;
      const rowIdx = Math.floor(i / cols);

      const x = Math.round(marginX + col * dx);
      const yBase = bandBottom - rowIdx * rowStep;

      // Scale using score/entries (keeps stable when blanks)
      const scoreBoost = clamp(dailyScore / 100, 0, 1);
      const entriesBoost = clamp(totalEntries / 25, 0, 1);
      const levelBoost = clamp(dayLevel / 5, 0, 1);

      const stemLen = 270 + 90 * scoreBoost + 30 * levelBoost;
      const stemTopY = Math.round(yBase - stemLen);
      const headY = stemTopY - (38 + 10 * scoreBoost);

      const headR = Math.round(28 + 10 * scoreBoost + 4 * entriesBoost);
      const diskR = Math.round(headR * 0.38);

      // Greens vary slightly by weekKey
      const stemBase = DEFAULTS.stem;
      const stemHi = DEFAULTS.stemDark;
      const stemMix = weekKey ? (rng() * 0.25) : 0.1;
      const stemCol = mixHex(stemBase, "#5bd49a", stemMix);
      const stemCol2 = mixHex(stemHi, "#1e6f46", stemMix * 0.7);

      // Group
      const g = svgEl("g", { class: "flower" });
      root.appendChild(g);

      // Tooltip
      const tipLines = [
        dateKey ? `Date: ${dateKey}` : "Date: (missing)",
        weekKey ? `Week: ${weekKey}` : "",
        safeStr(r.DayLevelLabel) ? `Day: ${safeStr(r.DayLevelLabel)}` : (dayLevel ? `DayLevel: ${dayLevel}` : ""),
        safeStr(r.WeekLevelLabel) ? `WeekLevel: ${safeStr(r.WeekLevelLabel)}` : "",
        dailyScore ? `DailyScore: ${dailyScore}` : "",
        totalEntries ? `Entries: ${totalEntries}` : "",
      ].filter(Boolean).join("\n");
      addTitle(g, tipLines);

      // Stem
      g.appendChild(svgEl("path", {
        d: `M ${x} ${yBase} C ${x + (rng() * 10 - 5)} ${yBase - stemLen * 0.35},
                          ${x + (rng() * 14 - 7)} ${yBase - stemLen * 0.72},
                          ${x} ${stemTopY}`,
        fill: "none",
        stroke: stemCol,
        "stroke-width": 6.0,
        "stroke-linecap": "round",
        opacity: 0.95
      }));
      // stem highlight
      g.appendChild(svgEl("path", {
        d: `M ${x + 1} ${yBase} C ${x + 1 + (rng() * 8 - 4)} ${yBase - stemLen * 0.35},
                          ${x + 1 + (rng() * 10 - 5)} ${yBase - stemLen * 0.72},
                          ${x + 1} ${stemTopY}`,
        fill: "none",
        stroke: stemCol2,
        "stroke-width": 2.0,
        "stroke-linecap": "round",
        opacity: 0.35
      }));

      // Leaves (2-4)
      const leafCount = 2 + (rng() < 0.6 ? 1 : 2);
      for (let k = 0; k < leafCount; k++) {
        const t = 0.18 + (k / Math.max(1, leafCount - 1)) * 0.62;
        const ly = Math.round(yBase - stemLen * t);
        const side = (k % 2 === 0) ? -1 : 1;
        const len = 42 + 26 * rng() + 20 * scoreBoost;
        const wid = 18 + 10 * rng();
        const leafCol = mixHex(stemCol, "#cbe7d8", 0.18 + 0.18 * rng());
        const rot = (side * (18 + 14 * rng())) + (rng() * 8 - 4);
        addLeaf(g, x, ly, side, len, wid, leafCol, 0.45, rot);
      }

      // Beads along stem (gold)
      const beadCount = 12 + Math.round(6 * entriesBoost);
      for (let b = 0; b < beadCount; b++) {
        const t = b / (beadCount - 1);
        const y = Math.round(yBase + (stemTopY - yBase) * t);
        const rr = Math.round(4 + (1 - t) * 8);
        g.appendChild(svgEl("circle", {
          cx: x,
          cy: y,
          r: rr,
          fill: "rgba(255,210,110,0.88)",
          opacity: 0.82
        }));
      }

      // Flower head: layered petals with primary/secondary
      const outerPetals = 14 + Math.round(8 * scoreBoost) + Math.round(4 * entriesBoost);
      const innerPetals = Math.max(10, outerPetals - 4);

      const outerLen = headR + 24;
      const outerWid = Math.max(10, Math.round(headR * 0.42));
      const innerLen = headR + 12;
      const innerWid = Math.max(8, Math.round(headR * 0.32));

      // Outer petals: primary, slightly varied
      for (let p = 0; p < outerPetals; p++) {
        const ang = (360 / outerPetals) * p + (rng() * 10 - 5);
        const curl = (rng() * 8 - 4);
        const fill = mixHex(primary, "#ffffff", 0.10 + 0.12 * rng());
        const path = svgEl("path", {
          d: makePetalPath(x, headY, ang, outerLen, outerWid, curl),
          fill,
          opacity: 0.92
        });
        path.setAttribute("filter", "url(#v94Glow)");
        g.appendChild(path);
      }

      // Inner petals: blend primary->secondary for depth
      for (let p = 0; p < innerPetals; p++) {
        const ang = (360 / innerPetals) * p + (rng() * 10 - 5);
        const curl = (rng() * 7 - 3.5);
        const blend = 0.35 + 0.25 * rng();
        const fill = mixHex(primary, secondary, blend);
        const path = svgEl("path", {
          d: makePetalPath(x, headY, ang, innerLen, innerWid, curl),
          fill,
          opacity: 0.88
        });
        g.appendChild(path);
      }

      // Head disks
      const rim = mixHex(primary, "#000000", 0.12);
      g.appendChild(svgEl("circle", {
        cx: x, cy: headY, r: headR + 1,
        fill: rim,
        opacity: 0.18
      }));
      g.appendChild(svgEl("circle", {
        cx: x, cy: headY, r: headR,
        fill: primary,
        opacity: 0.34
      }));
      g.appendChild(svgEl("circle", {
        cx: x, cy: headY, r: diskR + 6,
        fill: mixHex(primary, secondary, 0.55),
        opacity: 0.70
      }));
      g.appendChild(svgEl("circle", {
        cx: x, cy: headY, r: diskR,
        fill: secondary,
        opacity: 0.96
      }));

      // Center spark
      g.appendChild(svgEl("circle", {
        cx: x - 2, cy: headY - 2,
        r: Math.max(3, Math.round(diskR * 0.22)),
        fill: "rgba(255,255,255,0.72)",
        opacity: 0.65
      }));

      // Date label above head
      const label = svgEl("text", {
        x: x,
        y: labelBaseY - rowIdx * 16,
        "text-anchor": "middle",
        "font-size": 12,
        fill: "rgba(255,255,255,0.65)"
      });
      label.textContent = dateKey || "";
      g.appendChild(label);
    }
  }

  function normalizePayload(payload) {
    // Accept a few shapes, but produce {ok, rows, meta}
    if (!payload) return { ok: false, rows: [], meta: {} };

    // Apps Script returns { ok:true, meta:{...}, rows:[...] }
    if (Array.isArray(payload.rows)) return payload;

    // Some older versions might return {data:[...]}
    if (Array.isArray(payload.data)) return { ok: true, meta: payload.meta || {}, rows: payload.data };

    return { ok: !!payload.ok, meta: payload.meta || {}, rows: [] };
  }

  function setExport(payload) {
    state.exportPayload = normalizePayload(payload);
    const rows = Array.isArray(state.exportPayload.rows) ? state.exportPayload.rows : [];
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
    renderPlaceholder();
  }

  window.v94Garden = {
    init,
    setExport,
    rebuild,
    renderPlaceholder
  };

  try {
    init();
  } catch (e) {
    console.error("v94Garden init failed:", e);
    logToHud("ERROR: v94Garden init failed: " + (e && e.message ? e.message : String(e)));
  }

  console.log("v94_garden initialized.");
})();
