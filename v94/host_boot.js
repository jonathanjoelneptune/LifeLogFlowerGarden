(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const ui = {
    readyTag: $("readyTag"),
    execInput: $("execInput"),
    botSelect: $("botSelect"),
    limitInput: $("limitInput"),
    btnReload: $("btnReload"),
    btnRebuild: $("btnRebuild"),
    btnCopy: $("btnCopy"),
    status: $("status"),
    hudlog: $("hudlog"),
  };

  const LOG_MAX = 40;
  const hudLines = [];

  function hudLog(line) {
    const ts = new Date().toLocaleTimeString();
    hudLines.push(`[${ts}] ${line}`);
    while (hudLines.length > LOG_MAX) hudLines.shift();
    ui.hudlog.textContent = hudLines.join("\n");
    ui.hudlog.scrollTop = ui.hudlog.scrollHeight;
  }

  function setStatus(text) {
    ui.status.textContent = text || "";
  }

  function parseQuery() {
    const url = new URL(window.location.href);
    return {
      exec: url.searchParams.get("exec") || "",
      bot: url.searchParams.get("bot") || "",
      limit: url.searchParams.get("limit") || "",
    };
  }

  function normalizeExec(execUrl) {
    return (execUrl || "").trim().replace(/\/+$/, "");
  }

  function initUIFromState() {
    const q = parseQuery();

    const storedExec = localStorage.getItem("v94_exec") || "";
    const exec = normalizeExec(q.exec || storedExec);

    const bot = (q.bot || localStorage.getItem("v94_bot") || "winston").trim();
    const limit = Number(q.limit || localStorage.getItem("v94_limit") || 40);

    ui.execInput.value = exec;
    ui.botSelect.value = (bot === "alfred") ? "alfred" : "winston";
    ui.limitInput.value = String(Number.isFinite(limit) ? limit : 40);

    if (exec) localStorage.setItem("v94_exec", exec);
    localStorage.setItem("v94_bot", ui.botSelect.value);
    localStorage.setItem("v94_limit", String(ui.limitInput.value));

    return { exec, bot: ui.botSelect.value, limit: Number(ui.limitInput.value) };
  }

  function bindUI() {
    ui.execInput.addEventListener("change", () => {
      const exec = normalizeExec(ui.execInput.value);
      ui.execInput.value = exec;
      localStorage.setItem("v94_exec", exec);
      hudLog(`Saved exec URL: ${exec ? "set" : "blank"}`);
      if (window.V94Garden) window.V94Garden.setExecUrl(exec);
    });

    ui.botSelect.addEventListener("change", () => {
      localStorage.setItem("v94_bot", ui.botSelect.value);
      hudLog(`Bot set: ${ui.botSelect.value}`);
      if (window.V94Garden) window.V94Garden.setBot(ui.botSelect.value);
    });

    ui.limitInput.addEventListener("change", () => {
      localStorage.setItem("v94_limit", String(ui.limitInput.value));
      hudLog(`Limit set: ${ui.limitInput.value}`);
      if (window.V94Garden) window.V94Garden.setLimit(Number(ui.limitInput.value));
    });

    ui.btnReload.addEventListener("click", async () => {
      if (!window.V94Garden) return;
      hudLog("Reload Export clicked");
      await window.V94Garden.loadExport();
    });

    ui.btnRebuild.addEventListener("click", () => {
      if (!window.V94Garden) return;
      hudLog("Rebuild Scene clicked");
      window.V94Garden.rebuildScene();
    });

    ui.btnCopy.addEventListener("click", async () => {
      if (!window.V94Garden) return;
      const link = window.V94Garden.getShareLink();
      try {
        await navigator.clipboard.writeText(link);
        hudLog("Share link copied to clipboard");
      } catch (e) {
        hudLog("Clipboard copy failed (browser blocked). Share link shown in Status.");
      }
      setStatus(`Share link:\n${link}`);
    });
  }

  function boot() {
    ui.readyTag.textContent = "ready";
    hudLog("Host boot start");

    const state = initUIFromState();
    bindUI();

    // Expose a small UI bridge so v94_garden can update panel without console dependence.
    window.V94UI = {
      hudLog,
      setStatus,
      getExec: () => normalizeExec(ui.execInput.value),
      getBot: () => ui.botSelect.value,
      getLimit: () => Number(ui.limitInput.value),
      setExec: (v) => { ui.execInput.value = normalizeExec(v); },
      setBot: (v) => { ui.botSelect.value = (v === "alfred") ? "alfred" : "winston"; },
      setLimit: (v) => { ui.limitInput.value = String(v); },
    };

    hudLog(`State: bot=${state.bot}, limit=${state.limit}, exec=${state.exec ? "set" : "missing"}`);

    // Kick garden init once scripts exist
    const tryInit = () => {
      if (!window.V94Garden) return false;
      window.V94Garden.init({
        execUrl: state.exec,
        bot: state.bot,
        limit: state.limit
      });
      return true;
    };

    if (!tryInit()) {
      const t = setInterval(() => {
        if (tryInit()) clearInterval(t);
      }, 50);
    }
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
