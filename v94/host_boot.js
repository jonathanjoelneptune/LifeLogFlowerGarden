/* host_boot.js
 * Owns: URL params, localStorage, UI wiring, logging.
 * Depends on: window.v94Garden
 */
(() => {
  const LS_EXEC = "v94_exec";
  const LS_BOT  = "v94_bot";
  const LS_LIMIT = "v94_limit";

  const $ = (id) => document.getElementById(id);

  function nowTag() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function hud(msg) {
    const el = $("hudlog");
    const line = `[${nowTag()}] ${msg}`;
    if (el) {
      el.textContent = (el.textContent ? el.textContent + "\n" : "") + line;
      el.scrollTop = el.scrollHeight;
    }
    // Also print to console so you can see it even if HUD is off screen
    console.log(line);
  }

  function setStatus(msg) {
    const el = $("status");
    if (el) el.textContent = msg || "";
  }

  function parseQuery() {
    const u = new URL(window.location.href);
    return {
      exec: u.searchParams.get("exec") || "",
      bot: u.searchParams.get("bot") || "",
      limit: u.searchParams.get("limit") || "",
      autoload: u.searchParams.get("autoload") || "1"
    };
  }

  function sanitizeExec(s) {
    const v = (s || "").trim();
    if (!v) return "";
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(v)) {
      // allow script.googleusercontent too if you use that flavor
      if (!/^https:\/\/script\.googleusercontent\.com\/macros\/s\/.+\/exec/.test(v)) {
        return v; // keep it, but we will warn
      }
    }
    return v;
  }

  function buildShareLink(exec, bot, limit) {
    const u = new URL(window.location.href);
    u.searchParams.set("exec", exec || "");
    u.searchParams.set("bot", bot || "winston");
    u.searchParams.set("limit", String(limit || 40));
    u.searchParams.set("autoload", "1");
    return u.toString();
  }

  function initUI() {
    const q = parseQuery();

    // Load defaults from LS
    const execLS = localStorage.getItem(LS_EXEC) || "";
    const botLS = localStorage.getItem(LS_BOT) || "winston";
    const limitLS = localStorage.getItem(LS_LIMIT) || "40";

    // Query overrides LS if present
    const exec = sanitizeExec(q.exec || execLS);
    const bot = (q.bot || botLS || "winston").trim();
    const limit = Number(q.limit || limitLS || 40) || 40;

    $("execInput").value = exec;
    $("botSelect").value = (bot === "alfred") ? "alfred" : "winston";
    $("limitInput").value = String(Math.max(1, Math.min(500, limit)));

    $("readyTag").textContent = "ready";

    $("btnReload").addEventListener("click", async () => {
      await reloadExport();
    });

    $("btnRebuild").addEventListener("click", () => {
      if (!window.v94Garden) {
        hud("ERROR: v94Garden not loaded");
        return;
      }
      window.v94Garden.rebuildScene();
    });

    $("btnCopy").addEventListener("click", async () => {
      const execNow = sanitizeExec($("execInput").value);
      const botNow = $("botSelect").value;
      const limitNow = Number($("limitInput").value) || 40;
      const link = buildShareLink(execNow, botNow, limitNow);
      try {
        await navigator.clipboard.writeText(link);
        setStatus("Copied share link to clipboard.");
        hud("Share link copied.");
      } catch (e) {
        setStatus("Could not copy automatically. Link in console.");
        hud(`Share link: ${link}`);
      }
    });

    // Persist settings on change
    $("execInput").addEventListener("change", () => {
      const v = sanitizeExec($("execInput").value);
      $("execInput").value = v;
      localStorage.setItem(LS_EXEC, v);
      hud(`exec saved (${v ? "set" : "blank"})`);
    });
    $("botSelect").addEventListener("change", () => {
      localStorage.setItem(LS_BOT, $("botSelect").value);
      hud(`bot saved ${$("botSelect").value}`);
    });
    $("limitInput").addEventListener("change", () => {
      const v = String(Number($("limitInput").value) || 40);
      localStorage.setItem(LS_LIMIT, v);
      hud(`limit saved ${v}`);
    });

    // Init garden module
    if (!window.v94Garden) {
      hud("ERROR: v94Garden missing. Check script include path.");
      setStatus("Error: v94Garden missing. Check scripts loaded.");
      return;
    }

    window.v94Garden.init({
      hud,
      setStatus,
      getExec: () => sanitizeExec($("execInput").value),
      getBot: () => $("botSelect").value,
      getLimit: () => Number($("limitInput").value) || 40
    });

    hud(`Host boot start. state: bot=${$("botSelect").value}, limit=${$("limitInput").value}, exec=${exec ? "set" : "missing"}`);

    // Autoload if exec exists
    const shouldAutoload = (q.autoload !== "0");
    if (shouldAutoload && exec) {
      reloadExport().catch(err => {
        hud(`autoload reload failed: ${String(err)}`);
      });
    } else {
      // Still build placeholder so you always see something
      window.v94Garden.rebuildScene();
      if (!exec) setStatus("Export not loaded.\nPaste your exec URL, then click Reload Export.");
    }
  }

  async function reloadExport() {
    const exec = sanitizeExec($("execInput").value);
    if (!exec) {
      setStatus("No exec URL.\nPaste your Apps Script Web App exec URL first.");
      hud("reload export: exec missing");
      return;
    }
    localStorage.setItem(LS_EXEC, exec);

    const bot = $("botSelect").value;
    const limit = Number($("limitInput").value) || 40;

    hud(`Reload export: bot=${bot}, limit=${limit}`);
    setStatus("Loading export...");

    try {
      const res = await window.v94Garden.loadExport({ exec, bot, limit });
      setStatus(`Export loaded.\nrows=${res.rows}  rawType=${res.rawType}`);
      hud(`Export loaded: rows=${res.rows}, rawType=${res.rawType}`);
      window.v94Garden.rebuildScene();
    } catch (e) {
      setStatus(`Export load failed.\n${String(e)}\n\nCommon causes:\n- Apps Script returned HTML instead of JSON\n- CORS blocked\n- Wrong deployment access`);
      hud(`Export load failed: ${String(e)}`);
      console.error(e);
    }
  }

  window.addEventListener("DOMContentLoaded", initUI);
})();
