/* host_boot.js (v94)
 * Boot + UI controller for GitHub Pages.
 * Uses JSONP to load data from Apps Script (avoids CORS).
 */

(() => {
  const QS = new URLSearchParams(location.search);

  const el = {
    exec: document.getElementById("execInput"),
    bot: document.getElementById("botSelect"),
    limit: document.getElementById("limitInput"),
    btnReload: document.getElementById("btnReload"),
    btnRebuild: document.getElementById("btnRebuild"),
    btnCopy: document.getElementById("btnCopy"),
    status: document.getElementById("status"),
    hudlog: document.getElementById("hudlog"),
    svgRoot: document.getElementById("svgRoot"),
    readyTag: document.getElementById("readyTag"),
  };

  const state = {
    execUrl: "",
    bot: "winston",
    limit: 40,
    export: null,
  };

  function nowStr() {
    const d = new Date();
    return `[${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}]`;
  }

  function log(msg, level = "INFO") {
    const line = `${nowStr()} ${level}: ${msg}`;
    if (el.hudlog) {
      el.hudlog.textContent = (el.hudlog.textContent ? el.hudlog.textContent + "\n" : "") + line;
      el.hudlog.scrollTop = el.hudlog.scrollHeight;
    }
    // Keep console quiet unless error
    if (level === "ERROR") console.error(line);
    else console.log(line);
  }

  function setStatus(text) {
    if (el.status) el.status.textContent = text || "";
  }

  function normalizeExec(u) {
    if (!u) return "";
    u = String(u).trim();
    // Accept either /exec or full URL copied from Apps Script.
    return u.replace(/\/+$/, "");
  }

  function updateFromInputs() {
    state.execUrl = normalizeExec(el.exec?.value || "");
    state.bot = String(el.bot?.value || "winston");
    state.limit = Math.max(1, Math.min(500, Number(el.limit?.value || 40)));
  }

  function setInputsFromState() {
    if (el.exec) el.exec.value = state.execUrl || "";
    if (el.bot) el.bot.value = state.bot || "winston";
    if (el.limit) el.limit.value = String(state.limit || 40);
  }

  // JSONP loader (no CORS)
  function jsonp(url, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const cbName = `__llg_cb_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      const s = document.createElement("script");
      const t = setTimeout(() => {
        cleanup();
        reject(new Error("JSONP timeout"));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(t);
        try { delete window[cbName]; } catch {}
        if (s.parentNode) s.parentNode.removeChild(s);
      }

      window[cbName] = (data) => {
        cleanup();
        resolve(data);
      };

      const u = new URL(url);
      u.searchParams.set("format", "jsonp");
      u.searchParams.set("callback", cbName);
      u.searchParams.set("v", String(Date.now()));

      s.src = u.toString();
      s.async = true;
      s.onerror = () => {
        cleanup();
        reject(new Error("JSONP script load failed"));
      };

      document.head.appendChild(s);
    });
  }

  function exportUrl() {
    // We will call your WebApp.gs route:
    // /exec?r=api_garden_export&bot=winston&limit=40&format=jsonp&callback=...
    const base = state.execUrl;
    const u = new URL(base);
    u.searchParams.set("r", "api_garden_export");
    u.searchParams.set("bot", state.bot);
    u.searchParams.set("limit", String(state.limit));
    return u.toString();
  }

  async function loadExport() {
    updateFromInputs();
    if (!state.execUrl) {
      setStatus("Export: not loaded\nSet your exec URL above.");
      log("Exec URL missing.", "ERROR");
      return;
    }
    setStatus("Export: loading...");
    log(`Reload export requested bot=${state.bot} limit=${state.limit}`);

    const url = exportUrl();
    log(`Fetching export (JSONP): ${url}`);

    try {
      const payload = await jsonp(url);
      state.export = payload;

      const rows = Array.isArray(payload?.rows) ? payload.rows.length : 0;
      setStatus(`Export: loaded\nRows: ${rows}`);
      log(`Export loaded. rows=${rows}`);

      // If garden module exists, push export in and render.
      if (window.v94Garden && typeof window.v94Garden.setExport === "function") {
        window.v94Garden.setExport(payload);
      }
      if (window.v94Garden && typeof window.v94Garden.rebuild === "function") {
        window.v94Garden.rebuild();
      }
    } catch (err) {
      setStatus("Export: load FAILED\n" + (err?.message || String(err)));
      log(`Export load FAILED: ${err?.message || err}`, "ERROR");
    }
  }

  function copyShareLink() {
    updateFromInputs();
    const u = new URL(location.href);
    u.searchParams.set("bot", state.bot);
    u.searchParams.set("limit", String(state.limit));
    if (state.execUrl) u.searchParams.set("exec", state.execUrl);
    const txt = u.toString();
    navigator.clipboard?.writeText(txt);
    log("Share link copied.");
  }

  function initUI() {
    // Load from querystring if present
    if (QS.get("exec")) state.execUrl = normalizeExec(QS.get("exec"));
    if (QS.get("bot")) state.bot = String(QS.get("bot"));
    if (QS.get("limit")) state.limit = Number(QS.get("limit"));

    setInputsFromState();

    el.btnReload?.addEventListener("click", () => loadExport());
    el.btnRebuild?.addEventListener("click", () => window.v94Garden?.rebuild?.());
    el.btnCopy?.addEventListener("click", () => copyShareLink());

    el.exec?.addEventListener("change", () => { updateFromInputs(); log("Exec URL updated."); });
    el.bot?.addEventListener("change", () => { updateFromInputs(); log("Bot updated."); });
    el.limit?.addEventListener("change", () => { updateFromInputs(); log("Limit updated."); });

    setStatus("Export: not loaded");

    log("host_boot loaded.");
    log(`Page: ${location.pathname}`);
  }

  function waitForGardenModule(maxMs = 3000) {
    const t0 = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        if (window.v94Garden && typeof window.v94Garden.init === "function") return resolve(true);
        if (Date.now() - t0 > maxMs) return resolve(false);
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  async function boot() {
    initUI();

    const ok = await waitForGardenModule();
    if (!ok) {
      log("Missing v94Garden module. Check v94_garden.js is loading.", "ERROR");
      el.readyTag.textContent = "(ready)";
      return;
    }

    // init garden
    window.v94Garden.init({
      svgRoot: el.svgRoot,
      log,
    });

    el.readyTag.textContent = "(ready)";
    log("V94Garden.init OK.");

    // Auto-load export if exec is provided in querystring
    updateFromInputs();
    if (state.execUrl) loadExport();
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
