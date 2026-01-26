/* host_boot.js (v94)
 * Owns:
 *  - panel wiring
 *  - localStorage persistence
 *  - calls into window.v94Garden
 */

(() => {
  const LS_EXEC = "v94_exec_url";
  const LS_BOT  = "v94_bot";
  const LS_LIM  = "v94_limit";

  const $ = (id) => document.getElementById(id);

  const execInput  = $("execInput");
  const botSelect  = $("botSelect");
  const limitInput = $("limitInput");
  const btnReload  = $("btnReload");
  const btnRebuild = $("btnRebuild");
  const btnCopy    = $("btnCopy");
  const statusEl   = $("status");
  const hudlogEl   = $("hudlog");
  const readyTag   = $("readyTag");

  function nowStamp() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2,"0");
    const mm = String(d.getMinutes()).padStart(2,"0");
    const ss = String(d.getSeconds()).padStart(2,"0");
    return `[${hh}:${mm}:${ss}]`;
  }

  function hud(msg, level = "INFO") {
    const line = `${nowStamp()} ${level}: ${msg}`;
    if (hudlogEl) {
      hudlogEl.textContent = (hudlogEl.textContent ? hudlogEl.textContent + "\n" : "") + line;
      hudlogEl.scrollTop = hudlogEl.scrollHeight;
    }
    // Also mirror to console for easier debugging
    if (level === "ERROR") console.error(line);
    else console.log(line);
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }

  function getExec()  { return (execInput?.value || "").trim(); }
  function getBot()   { return (botSelect?.value || "winston").trim(); }
  function getLimit() { return Number(limitInput?.value || 40) || 40; }

  function saveState() {
    localStorage.setItem(LS_EXEC, getExec());
    localStorage.setItem(LS_BOT, getBot());
    localStorage.setItem(LS_LIM, String(getLimit()));
  }

  function loadState() {
    const ex = localStorage.getItem(LS_EXEC) || "";
    const bt = localStorage.getItem(LS_BOT)  || "winston";
    const lm = localStorage.getItem(LS_LIM)  || "40";

    if (execInput) execInput.value = ex;
    if (botSelect) botSelect.value = bt;
    if (limitInput) limitInput.value = lm;
  }

  function buildShareLink() {
    const u = new URL(window.location.href);
    const exec = getExec();
    const bot = getBot();
    const lim = getLimit();

    if (exec) u.searchParams.set("exec", exec);
    u.searchParams.set("bot", bot);
    u.searchParams.set("limit", String(lim));
    return u.toString();
  }

  function applyQueryParams() {
    const u = new URL(window.location.href);
    const exec = u.searchParams.get("exec") || "";
    const bot  = u.searchParams.get("bot") || "";
    const lim  = u.searchParams.get("limit") || "";

    if (exec && execInput) execInput.value = exec;
    if (bot && botSelect) botSelect.value = bot;
    if (lim && limitInput) limitInput.value = lim;

    // remove params from address bar if you want, but keep as-is for now
  }

  async function reloadExport() {
    saveState();

    const exec = getExec();
    const bot = getBot();
    const limit = getLimit();

    if (!exec) {
      setStatus("Export: not loaded\nPaste your exec URL, then Reload Export.");
      hud("Reload blocked: exec URL missing", "ERROR");
      return;
    }

    try {
      setStatus("Export: loading...");
      hud(`Reload export requested bot=${bot} limit=${limit}`);
      const info = await window.v94Garden.loadExport({ exec, bot, limit });
      setStatus(`Export: loaded\nRows: ${info.rows}`);
      hud(`Export loaded. rows=${info.rows}`);
      window.v94Garden.rebuildScene();
    } catch (err) {
      setStatus("Export: failed\n" + String(err?.message || err));
      hud("Export load FAILED: " + String(err?.message || err), "ERROR");
    }
  }

  function rebuildScene() {
    hud("Rebuild scene requested");
    window.v94Garden.rebuildScene();
  }

  async function copyShareLink() {
    try {
      const link = buildShareLink();
      await navigator.clipboard.writeText(link);
      hud("Share link copied to clipboard");
      setStatus("Share link copied.");
    } catch (e) {
      hud("Clipboard copy failed: " + String(e?.message || e), "ERROR");
      setStatus("Copy failed. Your browser may block clipboard access.");
    }
  }

  // --- boot ---
  loadState();
  applyQueryParams();

  if (readyTag) readyTag.textContent = "ready";

  execInput?.addEventListener("change", () => { saveState(); hud("Exec URL updated."); });
  botSelect?.addEventListener("change", () => { saveState(); hud("Bot updated."); });
  limitInput?.addEventListener("change", () => { saveState(); hud("Limit updated."); });

  btnReload?.addEventListener("click", reloadExport);
  btnRebuild?.addEventListener("click", rebuildScene);
  btnCopy?.addEventListener("click", copyShareLink);

  // init garden module
  if (!window.v94Garden || typeof window.v94Garden.init !== "function") {
    hud("Missing v94Garden module. Check v94_garden.js is loading.", "ERROR");
    return;
  }

  window.v94Garden.init({ hud, setStatus });

  hud("host_boot loaded.");
  hud(`Page: ${window.location.pathname}`);
  hud("Scripts expected: ./host_boot.js and ./v94_garden.js");

  // Start with placeholder render (no export loaded yet)
  window.v94Garden.rebuildScene();
  setStatus("Export: not loaded\nPaste your exec URL, then Reload Export.");
})();
