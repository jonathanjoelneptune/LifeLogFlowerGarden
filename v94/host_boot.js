/* host_boot.js
 * Boots the GitHub Pages UI and wires it to v94Garden + the Apps Script Web App.
 *
 * Query params supported:
 *   ?exec=<encoded exec url>&bot=winston&limit=40&format=jsonp|json
 */

(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function nowStamp() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `[${hh}:${mm}:${ss}]`;
  }

  function hud(msg, level) {
    const el = $("hudlog");
    const status = $("status");
    const line = `${nowStamp()} ${level ? level + ": " : ""}${msg}`;

    if (el) {
      el.textContent += (el.textContent ? "\n" : "") + line;
      el.scrollTop = el.scrollHeight;
    }
    if (status) {
      // keep short status text on top, but do not spam it
      if (level === "ERROR") status.textContent = msg;
      if (level === "INFO" && !status.textContent) status.textContent = msg;
    }

    // also console
    if (level === "ERROR") console.error(line);
    else console.log(line);
  }

  function getQuery() {
    const u = new URL(window.location.href);
    return u.searchParams;
  }

  function setReadyTag(text) {
    const el = $("readyTag");
    if (el) el.textContent = text ? `(${text})` : "";
  }

  function saveState(state) {
    try { localStorage.setItem("v94_state", JSON.stringify(state)); } catch (e) {}
  }

  function loadState() {
    try {
      const s = localStorage.getItem("v94_state");
      return s ? JSON.parse(s) : {};
    } catch (e) {
      return {};
    }
  }

  function encodeExec(execUrl) {
    return encodeURIComponent(execUrl || "");
  }

  function buildShareLink(state) {
    const u = new URL(window.location.href);
    u.search = "";
    if (state.exec) u.searchParams.set("exec", state.exec);
    if (state.bot) u.searchParams.set("bot", state.bot);
    if (state.limit) u.searchParams.set("limit", String(state.limit));
    if (state.format) u.searchParams.set("format", state.format);
    return u.toString();
  }

  function jsonp(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const cb = `__v94jsonp_${Math.random().toString(16).slice(2)}`;
      const s = document.createElement("script");
      let done = false;

      const t = setTimeout(() => {
        if (done) return;
        done = true;
        try { delete window[cb]; } catch (e) {}
        s.remove();
        reject(new Error("JSONP timeout"));
      }, timeoutMs || 12000);

      window[cb] = (data) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        try { delete window[cb]; } catch (e) {}
        s.remove();
        resolve(data);
      };

      const u = new URL(url);
      u.searchParams.set("callback", cb);
      // cache-bust
      u.searchParams.set("_", String(Date.now()));

      s.src = u.toString();
      s.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        try { delete window[cb]; } catch (e) {}
        s.remove();
        reject(new Error("JSONP load error"));
      };

      document.head.appendChild(s);
    });
  }

  async function fetchJson(url, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 12000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  function normalizeExecInput(exec) {
    if (!exec) return "";
    const s = String(exec).trim();
    return s.replace(/\s+/g, "");
  }

  async function loadExport(state) {
    if (!state.exec) throw new Error("Missing exec URL");

    // We call your Apps Script route:
    //   /exec?r=api_garden_export&bot=winston&limit=40
    const u = new URL(state.exec);
    u.searchParams.set("r", "api_garden_export");
    u.searchParams.set("bot", state.bot || "winston");
    u.searchParams.set("limit", String(state.limit || 40));

    // format=json uses fetch, format=jsonp uses jsonp
    const fmt = (state.format || "jsonp").toLowerCase();
    if (fmt === "json") {
      u.searchParams.set("format", "json");
      hud(`Fetching export (fetch): ${u.toString()}`, "INFO");
      const payload = await fetchJson(u.toString(), 14000);
      return payload;
    }

    // default jsonp
    hud(`Fetching export (JSONP): ${u.toString()}`, "INFO");
    const payload = await jsonp(u.toString(), 14000);
    return payload;
  }

  function applyExport(payload) {
    if (!window.v94Garden || !window.v94Garden.setExport) {
      throw new Error("Missing window.v94Garden.setExport. Check v94_garden.js loaded.");
    }
    window.v94Garden.setExport(payload);
  }

  function init() {
    const qp = getQuery();
    const persisted = loadState();

    const execParam = qp.get("exec");
    const botParam = qp.get("bot");
    const limitParam = qp.get("limit");
    const fmtParam = qp.get("format");

    const state = {
      exec: normalizeExecInput(execParam || persisted.exec || ""),
      bot: (botParam || persisted.bot || "winston"),
      limit: Number(limitParam || persisted.limit || 40),
      format: (fmtParam || persisted.format || "jsonp")
    };

    // Bind UI
    const execInput = $("execInput");
    const botSelect = $("botSelect");
    const limitInput = $("limitInput");
    const btnReload = $("btnReload");
    const btnRebuild = $("btnRebuild");
    const btnCopy = $("btnCopy");

    if (execInput) execInput.value = state.exec || "";
    if (botSelect) botSelect.value = state.bot || "winston";
    if (limitInput) limitInput.value = String(state.limit || 40);

    setReadyTag(state.exec ? "exec set" : "ready");

    // Ensure garden module is initialized
    if (!window.v94Garden || !window.v94Garden.init) {
      hud("Missing v94Garden module. Check v94_garden.js is loading.", "ERROR");
    } else {
      try {
        window.v94Garden.init();
        hud("V94Garden.init OK.", "INFO");
      } catch (e) {
        hud(`V94Garden.init FAILED: ${e && e.message ? e.message : String(e)}`, "ERROR");
      }
    }

    function saveFromUi() {
      const exec = normalizeExecInput(execInput ? execInput.value : state.exec);
      const bot = botSelect ? botSelect.value : state.bot;
      const limit = clampInt(limitInput ? limitInput.value : state.limit, 40, 1, 8000);

      state.exec = exec;
      state.bot = bot;
      state.limit = limit;

      saveState(state);
      setReadyTag(state.exec ? "exec set" : "ready");
      hud("Exec URL updated.", "INFO");
    }

    async function reload() {
      try {
        saveFromUi();
        if (!state.exec) {
          hud("Export not loaded. Set your exec URL above.", "ERROR");
          return;
        }
        hud(`Reload export requested bot=${state.bot} limit=${state.limit}`, "INFO");
        const payload = await loadExport(state);

        const rows = payload && Array.isArray(payload.rows) ? payload.rows : [];
        hud(`Export loaded. rows=${rows.length}`, "INFO");

        applyExport(payload);
        hud(`Export applied. rows=${rows.length}`, "INFO");
        hud("Scene rendered from export.", "INFO");
      } catch (e) {
        hud(`Export load failed: ${e && e.message ? e.message : String(e)}`, "ERROR");
      }
    }

    function rebuild() {
      try {
        if (!window.v94Garden || !window.v94Garden.rebuild) {
          hud("Rebuild failed. v94Garden.rebuild missing.", "ERROR");
          return;
        }
        window.v94Garden.rebuild();
        hud("Rebuild scene complete.", "INFO");
      } catch (e) {
        hud(`Rebuild failed: ${e && e.message ? e.message : String(e)}`, "ERROR");
      }
    }

    async function copyShare() {
      try {
        saveFromUi();
        const link = buildShareLink(state);
        await navigator.clipboard.writeText(link);
        hud("Share link copied to clipboard.", "INFO");
      } catch (e) {
        hud("Copy failed. Your browser may block clipboard access.", "ERROR");
      }
    }

    if (btnReload) btnReload.addEventListener("click", reload);
    if (btnRebuild) btnRebuild.addEventListener("click", rebuild);
    if (btnCopy) btnCopy.addEventListener("click", copyShare);

    // Auto-load if exec is present
    if (state.exec) {
      reload();
    } else {
      hud("Export not loaded. Set your exec URL above.", "INFO");
    }
  }

  function clampInt(v, def, min, max) {
    const n = Number(v);
    if (!isFinite(n)) return def;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  // Start
  try {
    hud("host_boot loaded.", "INFO");
    hud(`Page: ${window.location.pathname}`, "INFO");
    init();
  } catch (e) {
    console.error(e);
  }
})();
