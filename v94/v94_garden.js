(function () {
  "use strict";

  const DEFAULTS = {
    execUrl: "",
    bot: "winston",
    limit: 40,
  };

  const state = {
    ...DEFAULTS,
    exportData: null,
  };

  const dom = {
    svg: null,
  };

  function uiLog(msg) {
    if (window.V94UI && window.V94UI.hudLog) window.V94UI.hudLog(msg);
  }
  function uiStatus(msg) {
    if (window.V94UI && window.V94UI.setStatus) window.V94UI.setStatus(msg);
  }

  function $(sel) {
    return document.querySelector(sel);
  }

  function initDom() {
    dom.svg = document.getElementById("svgRoot");
    if (!dom.svg) throw new Error("Missing #svgRoot");
  }

  function clearSvg() {
    while (dom.svg.firstChild) dom.svg.removeChild(dom.svg.firstChild);
  }

  function drawPlaceholderScene() {
    clearSvg();

    // Placeholder row stems and “buds”
    // This is just to prove render loop is alive.
    const W = 1600;
    const H = 900;

    const groundY = 900 * 0.62; // visually lines up with ground div
    const cols = 10;
    const xPad = 140;
    const xSpan = (W - 2 * xPad) / (cols - 1);

    for (let c = 0; c < cols; c++) {
      const x = xPad + c * xSpan;

      // stem
      const stem = document.createElementNS("http://www.w3.org/2000/svg", "line");
      stem.setAttribute("x1", x);
      stem.setAttribute("x2", x);
      stem.setAttribute("y1", groundY + 180);
      stem.setAttribute("y2", groundY - 140);
      stem.setAttribute("stroke", "rgba(120, 220, 160, 0.85)");
      stem.setAttribute("stroke-width", "3");
      dom.svg.appendChild(stem);

      // buds
      for (let i = 0; i < 10; i++) {
        const y = groundY - 140 + i * 28;
        const r = 5 + (9 - i) * 0.6;

        const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dot.setAttribute("cx", x);
        dot.setAttribute("cy", y);
        dot.setAttribute("r", r);
        dot.setAttribute("fill", "rgba(255, 208, 90, 0.78)");
        dom.svg.appendChild(dot);
      }
    }
  }

  function getExportUrl() {
    const exec = (state.execUrl || "").trim().replace(/\/+$/, "");
    if (!exec) return "";

    // This is the API contract we are using for v94.
    // Your Apps Script doGet should route on r=api_garden_export.
    const url = new URL(exec);
    url.searchParams.set("r", "api_garden_export");
    url.searchParams.set("bot", state.bot);
    url.searchParams.set("limit", String(state.limit));
    return url.toString();
  }

  async function loadExport() {
    const url = getExportUrl();

    if (!url) {
      uiStatus(
        "Export: not loaded\n\nSet your exec URL in the box above.\n" +
        "You can also pass it via URL:\n" +
        "?exec=YOUR_WEBAPP_EXEC_URL&bot=winston&limit=40"
      );
      uiLog("Export load skipped: exec URL missing");
      state.exportData = null;
      return null;
    }

    uiLog(`Fetching export: bot=${state.bot}, limit=${state.limit}`);
    uiLog(`GET ${url}`);

    uiStatus("Export: loading...");

    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        credentials: "omit",
      });

      uiLog(`HTTP ${res.status} ${res.statusText}`);

      const text = await res.text();

      // Try JSON parse first, but also show raw on failure
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        uiStatus(
          "Export: failed to parse JSON\n\n" +
          "This usually means Apps Script returned HTML or an error page.\n\n" +
          "First 400 chars:\n" + text.slice(0, 400)
        );
        uiLog("JSON parse failed. Apps Script did not return JSON.");
        state.exportData = null;
        return null;
      }

      state.exportData = data;

      const n = Array.isArray(data?.rows) ? data.rows.length : (Array.isArray(data) ? data.length : null);
      uiStatus(`Export: loaded\nRows: ${n !== null ? n : "unknown"}`);

      uiLog(`Export loaded. rows=${n !== null ? n : "unknown"}`);

      // For now we still show placeholder scene, but you can switch to real render next.
      rebuildScene();

      return data;
    } catch (err) {
      uiStatus(
        "Export: fetch failed\n\n" +
        String(err && err.message ? err.message : err)
      );
      uiLog(`Fetch failed: ${String(err && err.message ? err.message : err)}`);
      state.exportData = null;
      return null;
    }
  }

  function rebuildScene() {
    drawPlaceholderScene();

    // If export is loaded, we mark something visible as proof
    if (state.exportData) {
      uiLog("Scene rebuild: export present (placeholder render still active)");
    } else {
      uiLog("Scene rebuild: no export (placeholder render)");
    }
  }

  function setExecUrl(v) {
    state.execUrl = (v || "").trim().replace(/\/+$/, "");
    uiLog(`execUrl set: ${state.execUrl ? "set" : "blank"}`);
  }

  function setBot(v) {
    state.bot = (v === "alfred") ? "alfred" : "winston";
    uiLog(`bot set: ${state.bot}`);
  }

  function setLimit(v) {
    const n = Number(v);
    state.limit = Number.isFinite(n) ? Math.max(1, Math.min(500, n)) : DEFAULTS.limit;
    uiLog(`limit set: ${state.limit}`);
  }

  function getShareLink() {
    const base = window.location.origin + window.location.pathname;
    const u = new URL(base, window.location.origin);
    if (state.execUrl) u.searchParams.set("exec", state.execUrl);
    u.searchParams.set("bot", state.bot);
    u.searchParams.set("limit", String(state.limit));
    return u.toString();
  }

  function init(opts) {
    initDom();

    state.execUrl = (opts?.execUrl || state.execUrl || "").trim().replace(/\/+$/, "");
    state.bot = (opts?.bot === "alfred") ? "alfred" : "winston";
    state.limit = Number.isFinite(Number(opts?.limit)) ? Number(opts.limit) : state.limit;

    uiLog("V94Garden init");
    uiLog(`bot=${state.bot}, limit=${state.limit}, exec=${state.execUrl ? "set" : "missing"}`);

    rebuildScene();

    // Auto-load export only if exec is present
    if (state.execUrl) loadExport();
    else uiStatus("Export: not loaded\n\nSet your exec URL above.");
  }

  // Expose everything you need
  window.V94Garden = {
    init,
    loadExport,
    rebuildScene,
    setExecUrl,
    setBot,
    setLimit,
    getShareLink,
    getState: () => ({ ...state }),
  };

})();
