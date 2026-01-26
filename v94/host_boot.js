/* host_boot.js
 * GitHub Pages boot + UI wiring.
 * Owns: query params, localStorage, panel controls, HUD log.
 * Calls into: window.V94Garden (from v94_garden.js)
 */
(() => {
  const LS_KEY = "LLG_V94_HOSTCFG_v1";

  function $(id) { return document.getElementById(id); }

  function nowStr() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function hud(msg, kind = "info") {
    const el = $("hudlog");
    if (!el) return;
    const line = `[${nowStr()}] ${kind.toUpperCase()}: ${msg}\n`;
    el.textContent += line;
    el.scrollTop = el.scrollHeight;
    // Also mirror to console so you have both.
    if (kind === "error") console.error(msg);
    else if (kind === "warn") console.warn(msg);
    else console.log(msg);
  }

  function setStatus(text) {
    const el = $("status");
    if (!el) return;
    el.textContent = text || "";
  }

  function loadCfg() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }

  function saveCfg(cfg) {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg || {}));
  }

  function readQuery() {
    const u = new URL(window.location.href);
    const exec = u.searchParams.get("exec") || "";
    const bot = u.searchParams.get("bot") || "";
    const limit = u.searchParams.get("limit") || "";
    return { exec, bot, limit };
  }

  function setQuery(exec, bot, limit) {
    const u = new URL(window.location.href);
    if (exec) u.searchParams.set("exec", exec); else u.searchParams.delete("exec");
    if (bot) u.searchParams.set("bot", bot); else u.searchParams.delete("bot");
    if (limit) u.searchParams.set("limit", String(limit || "")); else u.searchParams.delete("limit");
    window.history.replaceState({}, "", u.toString());
  }

  function normalizeExecUrl(exec) {
    if (!exec) return "";
    let s = String(exec).trim();
    // If user pasted /dev, convert to /exec.
    s = s.replace(/\/dev(\?.*)?$/i, "/exec");
    return s;
  }

  async function reloadExport() {
    const exec = normalizeExecUrl($("execInput").value);
    const bot = $("botSelect").value;
    const limit = Math.max(1, Math.min(500, parseInt($("limitInput").value || "40", 10)));

    if (!exec || exec.includes("XXXX")) {
      setStatus("Export: not loaded\nTip: paste your Apps Script Web App exec URL.");
      hud("Missing exec URL. Paste Apps Script /exec URL in the input.", "warn");
      return;
    }

    saveCfg({ exec, bot, limit });
    setQuery(exec, bot, limit);

    setStatus("Export: loading...");
    hud(`Reload export requested bot=${bot} limit=${limit}`);

    if (!window.V94Garden || typeof window.V94Garden.loadExport !== "function") {
      hud("V94Garden not found. v94_garden.js failed to load. Check Network tab for 404.", "error");
      setStatus("Export: not loaded\nERROR: v94_garden.js not loaded (check filenames / Network).");
      return;
    }

    try {
      const result = await window.V94Garden.loadExport({ execUrl: exec, bot, limit, hud });
      const n = (result && result.count) ? result.count : 0;
      setStatus(`Export: loaded\nRows: ${n}\nBot: ${bot}\nLimit: ${limit}`);
      hud(`Export loaded OK. rows=${n}`);
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      setStatus(`Export: not loaded\nERROR: ${msg}\nTip: open the exec URL in a new tab once to authorize.`);
      hud(`Export load FAILED: ${msg}`, "error");
    }
  }

  function rebuildScene() {
    if (!window.V94Garden || typeof window.V94Garden.rebuildScene !== "function") {
      hud("V94Garden.rebuildScene missing. v94_garden.js failed to load.", "error");
      return;
    }
    hud("Rebuild scene requested.");
    window.V94Garden.rebuildScene({ hud });
  }

  async function copyShareLink() {
    const exec = normalizeExecUrl($("execInput").value);
    const bot = $("botSelect").value;
    const limit = Math.max(1, Math.min(500, parseInt($("limitInput").value || "40", 10)));

    setQuery(exec, bot, limit);
    const link = window.location.href;

    try {
      await navigator.clipboard.writeText(link);
      hud("Share link copied to clipboard.");
      setStatus((($("status").textContent || "").trim() + "\n\nShare link copied.").trim());
    } catch {
      hud("Clipboard copy failed. (Browser permissions) Here is the link in console.", "warn");
      console.log("Share link:", link);
      setStatus((($("status").textContent || "").trim() + "\n\nCopy failed. Link printed to console.").trim());
    }
  }

  function wireUI() {
    $("btnReload").addEventListener("click", reloadExport);
    $("btnRebuild").addEventListener("click", rebuildScene);
    $("btnCopy").addEventListener("click", copyShareLink);

    $("execInput").addEventListener("change", () => {
      const v = normalizeExecUrl($("execInput").value);
      $("execInput").value = v;
      hud("Exec URL updated.");
    });
  }

  function applyInitialValues() {
    const cfg = loadCfg();
    const q = readQuery();

    const exec = normalizeExecUrl(q.exec || cfg.exec || "");
    const bot = (q.bot || cfg.bot || "winston").toLowerCase();
    const limit = parseInt(q.limit || cfg.limit || "40", 10);

    $("execInput").value = exec;
    $("botSelect").value = (bot === "alfred") ? "alfred" : "winston";
    $("limitInput").value = String(isFinite(limit) ? limit : 40);

    setQuery(exec, $("botSelect").value, $("limitInput").value);

    $("readyTag").textContent = "ready";
    hud("host_boot loaded.");
    hud(`Page: ${window.location.pathname}`);
    hud(`Scripts expected: ./host_boot.js and ./v94_garden.js`);
    if (!exec) setStatus("Export: not loaded\nTip: paste your Apps Script Web App exec URL.");
    else setStatus("Export: not loaded\nTip: click Reload Export.");

    // Build placeholder scene immediately so you always see something.
    if (window.V94Garden && typeof window.V94Garden.init === "function") {
      window.V94Garden.init({ hud });
      hud("V94Garden.init OK.");
    } else {
      hud("V94Garden.init missing. v94_garden.js may not be loaded yet.", "warn");
    }
  }

  window.addEventListener("error", (evt) => {
    hud(`Window error: ${evt.message || evt}`, "error");
  });

  window.addEventListener("unhandledrejection", (evt) => {
    const msg = (evt && evt.reason && evt.reason.message) ? evt.reason.message : String(evt.reason || evt);
    hud(`Unhandled promise rejection: ${msg}`, "error");
  });

  document.addEventListener("DOMContentLoaded", () => {
    wireUI();
    applyInitialValues();
  });
})();
