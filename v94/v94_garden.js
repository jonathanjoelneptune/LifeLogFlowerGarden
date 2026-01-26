/* v94_garden.js
 * Minimal v94 GitHub Pages garden renderer wired to GardenExport API.
 * Exposes window.V94Garden = { init, loadExport, rebuildScene, getState }.
 */
(() => {
  const NS = "http://www.w3.org/2000/svg";

  const state = {
    inited: false,
    svg: null,
    data: null,       // normalized entries
    lastFetch: null,
    cfg: { execUrl: "", bot: "winston", limit: 40 }
  };

  function defaultHud(msg) { console.log(msg); }

  function hudCall(hud, msg, kind) {
    try { (hud || defaultHud)(msg, kind); } catch { /* ignore */ }
  }

  function $(id) { return document.getElementById(id); }

  function clearSvg(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function el(name, attrs = {}, parent) {
    const n = document.createElementNS(NS, name);
    Object.keys(attrs).forEach((k) => n.setAttribute(k, String(attrs[k])));
    if (parent) parent.appendChild(n);
    return n;
  }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  // Placeholder layout similar to what you’re seeing now.
  function buildPlaceholder(svg) {
    clearSvg(svg);

    // Visual baseline: columns of “buds” and stems.
    const baseY = 780;
    const topY = 520;
    const cols = 10;

    for (let i = 0; i < cols; i++) {
      const x = 180 + i * 140;

      // Stem
      el("line", {
        x1: x, y1: topY + 30,
        x2: x, y2: baseY,
        stroke: "rgba(90, 220, 140, 0.9)",
        "stroke-width": 3
      }, svg);

      // Buds
      const steps = 10;
      for (let j = 0; j < steps; j++) {
        const y = topY + j * 26;
        const r = 5 + j * 1.0;
        el("circle", {
          cx: x, cy: y, r,
          fill: "rgba(255, 205, 110, 0.92)"
        }, svg);
      }
    }
  }

  function normalizeExportPayload(payload) {
    // Accept a few possible shapes.
    // Ideal: { ok:true, rows:[{dateKey, primaryColor, secondaryColor, ...}, ...] }
    // Also accept: { rows: [...] } or directly: [...]
    let rows = null;

    if (Array.isArray(payload)) rows = payload;
    else if (payload && Array.isArray(payload.rows)) rows = payload.rows;
    else if (payload && payload.data && Array.isArray(payload.data)) rows = payload.data;

    if (!rows) return { rows: [], meta: payload || {} };

    // Normalize fields.
    const norm = rows.map((r, idx) => {
      const o = r || {};
      const dateKey = o.dateKey || o.date || o.day || String(idx);
      const pc = o.primaryColor || o.primary || o.colorPrimary || "#ffcc66";
      const sc = o.secondaryColor || o.secondary || o.colorSecondary || "#ffdca3";
      const mood = o.mood || o.tag || o.label || "";
      return { idx, dateKey, primaryColor: pc, secondaryColor: sc, mood };
    });

    return { rows: norm, meta: payload || {} };
  }

  function buildSceneFromData(svg, rows, hud) {
    clearSvg(svg);

    // Simple v94 “rows as columns” for now:
    // 10 columns, stack down each column.
    const cols = 10;
    const colW = 140;
    const startX = 180;
    const topY = 520;
    const baseY = 790;

    // Ground baseline line (helps visually)
    el("line", {
      x1: 0, y1: baseY,
      x2: 1600, y2: baseY,
      stroke: "rgba(255,255,255,0.06)",
      "stroke-width": 2
    }, svg);

    const perCol = Math.ceil(rows.length / cols);

    rows.forEach((row, i) => {
      const col = i % cols;
      const rowInCol = Math.floor(i / cols);

      const x = startX + col * colW;
      const y = topY + rowInCol * 28;

      // Stem
      el("line", {
        x1: x, y1: y + 18,
        x2: x, y2: baseY,
        stroke: "rgba(90, 220, 140, 0.9)",
        "stroke-width": 3
      }, svg);

      // Flower head (two-tone)
      const rOuter = 14;
      const rInner = 8;

      el("circle", { cx: x, cy: y, r: rOuter, fill: row.primaryColor, opacity: 0.95 }, svg);
      el("circle", { cx: x, cy: y, r: rInner, fill: row.secondaryColor, opacity: 0.95 }, svg);

      // Small date label (tiny, subtle)
      const t = el("text", {
        x: x + 18,
        y: y + 4,
        fill: "rgba(255,255,255,0.55)",
        "font-size": 10
      }, svg);
      t.textContent = String(row.dateKey).slice(0, 10);
    });

    hudCall(hud, `Scene built from export rows=${rows.length}`);
  }

  async function fetchExport({ execUrl, bot, limit, hud }) {
    const url = new URL(execUrl);
    url.searchParams.set("bot", bot);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("format", "json");
    url.searchParams.set("v", String(Date.now())); // cache buster

    hudCall(hud, `Fetching export: ${url.toString()}`);

    // Note: Apps Script may require you to open the exec URL once to authorize.
    const resp = await fetch(url.toString(), {
      method: "GET",
      credentials: "omit",
      cache: "no-store"
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }

    const text = await resp.text();

    // Some scripts might return JSON with leading junk. Try JSON parse safely.
    try {
      return JSON.parse(text);
    } catch (e) {
      // Give a better error with a snippet.
      const snip = text.slice(0, 180).replace(/\s+/g, " ");
      throw new Error(`Response was not JSON. Snippet: "${snip}"`);
    }
  }

  function init({ hud } = {}) {
    if (state.inited) return;

    const svg = $("svgRoot");
    if (!svg) {
      hudCall(hud, "Missing #svgRoot in DOM.", "error");
      return;
    }

    state.svg = svg;
    state.inited = true;

    buildPlaceholder(svg);
    hudCall(hud, "v94_garden initialized. Placeholder scene rendered.");
  }

  async function loadExport({ execUrl, bot, limit, hud } = {}) {
    if (!state.inited) init({ hud });
    if (!state.svg) throw new Error("SVG not ready");

    state.cfg.execUrl = execUrl || state.cfg.execUrl || "";
    state.cfg.bot = bot || state.cfg.bot || "winston";
    state.cfg.limit = isFinite(limit) ? Number(limit) : state.cfg.limit;

    const payload = await fetchExport({ execUrl: state.cfg.execUrl, bot: state.cfg.bot, limit: state.cfg.limit, hud });

    const norm = normalizeExportPayload(payload);
    state.data = norm.rows;
    state.lastFetch = { at: new Date().toISOString(), meta: norm.meta };

    // Build the scene from loaded data
    buildSceneFromData(state.svg, state.data, hud);

    return { count: state.data.length, meta: state.lastFetch };
  }

  function rebuildScene({ hud } = {}) {
    if (!state.inited) init({ hud });
    if (!state.svg) return;

    if (state.data && state.data.length) {
      buildSceneFromData(state.svg, state.data, hud);
    } else {
      buildPlaceholder(state.svg);
      hudCall(hud, "No export loaded. Rebuilt placeholder scene.");
    }
  }

  function getState() {
    return JSON.parse(JSON.stringify({
      inited: state.inited,
      cfg: state.cfg,
      hasData: !!(state.data && state.data.length),
      dataCount: state.data ? state.data.length : 0,
      lastFetch: state.lastFetch
    }));
  }

  window.V94Garden = {
    init,
    loadExport,
    rebuildScene,
    getState
  };
})();
