/* host_boot.js
 * LifeLog Garden v94 host bootstrap for GitHub Pages.
 * - Reads exec/bot/limit from query params + localStorage
 * - Loads export from Apps Script Web App
 * - Calls window.v94Garden.setExport(payload)
 */

(function () {
  "use strict";

  const LS_EXEC = "v94_exec_url";
  const LS_BOT = "v94_bot";
  const LS_LIMIT = "v94_limit";

  function $(id) { return document.getElementById(id); }

  function log(msg, level = "INFO") {
    const el = $("hudlog");
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    const line = `[${hh}:${mm}:${ss}] ${level}: ${msg}`;
    if (el) {
      el.textContent += (el.textContent ? "\n" : "") + line;
      el.scrollTop = el.scrollHeight;
    }
    // Also mirror to console
    (level === "ERROR" ? console.error : console.log)(line);
  }

  function setStatus(text) {
    const el = $("status");
    if (el) el.textContent = text || "";
  }

  function getQuery() {
    const out = {};
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of q.entries()) out[k] = v;
    return out;
  }

  function normalizeExecUrl(url) {
    if (!url) return "";
    const s = String(url).trim();
    if (!s) return "";
    // Allow both /exec and /dev, but prefer /exec
    return s;
  }

  function buildExportUrl(execUrl, bot, limit) {
    const u = new URL(execUrl);
    // Your WebApp.gs uses r=api_garden_export
    u.searchParams.set("r", "api_garden_export");
    u.searchParams.set("bot", bot || "winston");
    u.searchParams.set("limit", String(limit || 40));
    // optional “format” for your own future use (ignored by WebApp.gs if not used)
    u.searchParams.set("format", "json");
    // cache buster
    u.searchParams.set("v", String(Date.now()));
    return u.toString();
  }

  async function tryFetchJson(url) {
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      credentials: "omit"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }

  function jsonp(url, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const cbName = "__v94_jsonp_cb_" + Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("JSONP timeout"));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[cbName]; } catch (_) { window[cbName] = undefined; }
        if (script && script.parentNode) script.parentNode.removeChild(script);
      }

      window[cbName] = (data) => {
        cleanup();
        resolve(data);
      };

      const u = new URL(url);
      u.searchParams.set("callback", cbName);

      const script = document.createElement("script");
      script.src = u.toString();
      script.async = true;
      script.onerror = () => {
        cleanup();
        reject(new Error("JSONP script error"));
      };
      document.head.appendChild(script);
    });
  }

  function applyUiState(state) {
    const execInput = $("execInput");
    const botSelect = $("botSelect");
    const limitInput = $("limitInput");

    if (execInput) execInput.value = state.execUrl || "";
    if (botSelect) botSelect.value = state.bot || "winston";
    if (limitInput) limitInput.value = String(state.limit || 40);

    const readyTag = $("readyTag");
    if (readyTag) readyTag.textContent = state.execUrl ? "(exec set)" : "(exec missing)";
  }

  function getUiState() {
    return {
      execUrl: normalizeExecUrl($("execInput") ? $("execInput").value : ""),
      bot: ($("botSelect") ? $("botSelect").value : "winston"),
      limit: Number($("limitInput") ? $("limitInput").value : 40) || 40
    };
  }

  function saveState(state) {
    try {
      if (state.execUrl) localStorage.setItem(LS_EXEC, state.execUrl);
      localStorage.setItem(LS_BOT, state.bot || "winston");
      localStorage.setItem(LS_LIMIT, String(state.limit || 40));
    } catch (_) {}
  }

  function loadState() {
    const q = getQuery();
    const execUrl = normalizeExecUrl(q.exec || q.execUrl || localStorage.getItem(LS_EXEC) || "");
    const bot = (q.bot || localStorage.getItem(LS_BOT) || "winston").toLowerCase();
    const limit = Number(q.limit || localStorage.getItem(LS_LIMIT) || 40) || 40;
    return { execUrl, bot, limit };
  }

  async function loadExportAndRender() {
    const s = getUiState();
    if (!s.execUrl) {
      setStatus("Missing Exec URL. Paste your Apps Script Web App /exec URL.");
      log("Reload export requested but exec URL missing.", "ERROR");
      return;
    }

    saveState(s);

    const url = buildExportUrl(s.execUrl, s.bot, s.limit);
    log(`Reload export requested bot=${s.bot} limit=${s.limit}`);
    setStatus("Loading export...");

    let payload = null;

    // First try normal fetch (works if Apps Script returns CORS headers for your deployment)
    try {
      log(`Fetching export (fetch): ${url}`);
      payload = await tryFetchJson(url);
    } catch (e) {
      // Fallback to JSONP if fetch fails
      log(`Fetch failed, trying JSONP fallback. Reason: ${e && e.message ? e.message : String(e)}`, "ERROR");
      try {
        log(`Fetching export (JSONP): ${url}`);
        payload = await jsonp(url);
      } catch (e2) {
        setStatus("Export load failed. Check Apps Script deployment + permissions.");
        log(`Export load FAILED: ${e2 && e2.message ? e2.message : String(e2)}`, "ERROR");
        return;
      }
    }

    if (!payload || payload.ok === false) {
      const err = payload && payload.error ? payload.error : "Unknown export error";
      setStatus("Export returned error: " + err);
      log("Export returned ok=false: " + err, "ERROR");
      return;
    }

    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    log(`Export loaded. rows=${rows.length}`);
    setStatus(`Export OK. rows=${rows.length}`);

    if (!window.v94Garden) {
      log("Missing v94Garden module. Check v94_garden.js is loading.", "ERROR");
      return;
    }

    try {
      window.v94Garden.setExport(payload);
      log("Scene rendered from export.");
    } catch (e3) {
      log("Render failed: " + (e3 && e3.message ? e3.message : String(e3)), "ERROR");
    }
  }

  function rebuildScene() {
    if (!window.v94Garden) {
      log("Missing v94Garden module. Check v94_garden.js is loading.", "ERROR");
      return;
    }
    try {
      window.v94Garden.rebuild();
    } catch (e) {
      log("Rebuild failed: " + (e && e.message ? e.message : String(e)), "ERROR");
    }
  }

  function copyShareLink() {
    const s = getUiState();
    const u = new URL(window.location.href);
    if (s.execUrl) u.searchParams.set("exec", s.execUrl);
    u.searchParams.set("bot", s.bot || "winston");
    u.searchParams.set("limit", String(s.limit || 40));
    const text = u.toString();
    navigator.clipboard.writeText(text).then(() => {
      setStatus("Share link copied to clipboard.");
      log("Share link copied.");
    }).catch(() => {
      setStatus("Could not copy link (clipboard blocked).");
      log("Clipboard copy failed.", "ERROR");
    });
  }

  function wireUi() {
    const btnReload = $("btnReload");
    const btnRebuild = $("btnRebuild");
    const btnCopy = $("btnCopy");

    if (btnReload) btnReload.addEventListener("click", loadExportAndRender);
    if (btnRebuild) btnRebuild.addEventListener("click", rebuildScene);
    if (btnCopy) btnCopy.addEventListener("click", copyShareLink);

    const execInput = $("execInput");
    if (execInput) {
      execInput.addEventListener("change", () => {
        const s = getUiState();
        saveState(s);
        log("Exec URL updated.");
        const readyTag = $("readyTag");
        if (readyTag) readyTag.textContent = s.execUrl ? "(exec set)" : "(exec missing)";
      });
    }
  }

  function boot() {
    log("host_boot loaded.");
    log("Page: " + window.location.pathname);

    const s = loadState();
    applyUiState(s);
    wireUi();

    // init garden module
    if (window.v94Garden && typeof window.v94Garden.init === "function") {
      try {
        window.v94Garden.init();
        log("V94Garden.init OK.");
      } catch (e) {
        log("V94Garden.init failed: " + (e && e.message ? e.message : String(e)), "ERROR");
      }
    } else {
      log("Missing v94Garden module at boot. v94_garden.js not loaded yet?", "ERROR");
    }

    // auto-load export if execUrl present
    if (s.execUrl) {
      loadExportAndRender();
    } else {
      setStatus("Paste your Apps Script Web App /exec URL, then click Reload Export.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
