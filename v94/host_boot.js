/* host_boot.js
 * GitHub Pages hosted boot strapper for v94+
 * - Fetch GardenExport from Apps Script
 * - Supports bot selection via ?bot=winston
 * - Calls window.LifeLogGarden.init({ data, config })
 */

(() => {
  const STATUS_EL = document.getElementById("hostStatus");
  const ERR_WRAP = document.getElementById("hostError");
  const ERR_TEXT = document.getElementById("hostErrorText");

  const nowIso = () => new Date().toISOString();

  const setStatus = (lines) => {
    try {
      STATUS_EL.textContent = lines.filter(Boolean).join("\n");
    } catch (_) {}
  };

  const showError = (title, detail) => {
    try {
      ERR_WRAP.style.display = "flex";
      ERR_TEXT.textContent = `${title}\n\n${detail || ""}`.trim();
    } catch (_) {}
  };

  const qp = new URLSearchParams(location.search);
  const BOT = (qp.get("bot") || "winston").trim();
  const ROUTE_MODE = (qp.get("route") || "r").trim(); // "r" or "direct"
  const CACHE_MODE = (qp.get("cache") || "1").trim(); // "1" use cache fallback, "0" disable
  const DEBUG = (qp.get("debug") || "0").trim() === "1";

  // IMPORTANT: Set this to your Apps Script web app /exec URL (no query string needed)
  // Based on your screenshot, it looks like:
  // https://script.google.com/macros/s/AKfycbxPOVYXzpDdh2Fo4CRecf7R9BhPfk4sHLCskUnm0Qv9BlhbirAXI_ZVbG3U82FZ2Nt/exec
  const API_EXEC_BASE =
    (window.__GARDEN_API_EXEC_BASE && String(window.__GARDEN_API_EXEC_BASE).trim()) ||
    "https://script.google.com/macros/s/AKfycbxPOVYXzpDdh2Fo4CRecf7R9BhPfk4sHLCskUnm0Qv9BlhbirAXI_ZVbG3U82FZ2Nt/exec";

  const cacheKey = `LifeLogGardenExport:${API_EXEC_BASE}:${BOT}:${ROUTE_MODE}`;

  const buildApiUrl = () => {
    const u = new URL(API_EXEC_BASE);

    if (ROUTE_MODE === "direct") {
      // Example: /exec?bot=winston (if your handler uses bot only)
      u.searchParams.set("bot", BOT);
    } else {
      // Default: /exec?r=api_garden_export&bot=winston
      u.searchParams.set("r", "api_garden_export");
      u.searchParams.set("bot", BOT);
    }

    // Cache-bust to avoid GitHub Pages / browser caching issues
    u.searchParams.set("_ts", String(Date.now()));
    return u.toString();
  };

  const safeJsonParse = (s) => {
    try { return JSON.parse(s); } catch (_) { return null; }
  };

  const readCache = () => {
    if (CACHE_MODE !== "1") return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      const obj = safeJsonParse(raw);
      if (!obj || typeof obj !== "object") return null;
      return obj;
    } catch (_) {
      return null;
    }
  };

  const writeCache = (data) => {
    if (CACHE_MODE !== "1") return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        savedAt: nowIso(),
        data
      }));
    } catch (_) {}
  };

  const fetchGardenExport = async () => {
    const url = buildApiUrl();

    setStatus([
      `LifeLog Garden Walk (Hosted)`,
      `bot=${BOT}  route=${ROUTE_MODE}  cache=${CACHE_MODE}  debug=${DEBUG ? "1" : "0"}`,
      `API: ${API_EXEC_BASE}`,
      `Fetch: ${url}`,
      `Status: fetching...`
    ]);

    const res = await fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-store"
    });

    const text = await res.text();
    let json = safeJsonParse(text);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}\n\nBody:\n${text.slice(0, 4000)}`);
    }

    if (!json) {
      // Some backends return text with JSON prefix or whitespace. Try a second pass.
      const trimmed = text.trim();
      json = safeJsonParse(trimmed);
    }

    if (!json) {
      throw new Error(`Response was not valid JSON.\n\nFirst 4000 chars:\n${text.slice(0, 4000)}`);
    }

    return { url, json };
  };

  const bootGarden = async () => {
    try {
      const { url, json } = await fetchGardenExport();
      writeCache(json);

      setStatus([
        `LifeLog Garden Walk (Hosted)`,
        `bot=${BOT}  route=${ROUTE_MODE}  cache=${CACHE_MODE}  debug=${DEBUG ? "1" : "0"}`,
        `API: ${API_EXEC_BASE}`,
        `Fetch: OK`,
        `Payload keys: ${Object.keys(json).slice(0, 12).join(", ")}${Object.keys(json).length > 12 ? " ..." : ""}`,
        `Status: waiting for v94 init...`
      ]);

      // Wait for your v94 code to load and register the global
      const waitStart = performance.now();
      const timeoutMs = 12000;

      while (!(window.LifeLogGarden && typeof window.LifeLogGarden.init === "function")) {
        await new Promise(r => setTimeout(r, 50));
        if (performance.now() - waitStart > timeoutMs) {
          throw new Error(
            "Timed out waiting for window.LifeLogGarden.init.\n\n" +
            "Fix: load your v94 garden JS after host_boot.js and expose:\n" +
            "window.LifeLogGarden = { init: ({ data, config }) => { ... } };\n"
          );
        }
      }

      const config = {
        bot: BOT,
        routeMode: ROUTE_MODE,
        apiExecBase: API_EXEC_BASE,
        fetchedFrom: url,
        fetchedAt: nowIso(),
        debug: DEBUG
      };

      setStatus([
        `LifeLog Garden Walk (Hosted)`,
        `bot=${BOT}  route=${ROUTE_MODE}  cache=${CACHE_MODE}  debug=${DEBUG ? "1" : "0"}`,
        `API: ${API_EXEC_BASE}`,
        `Fetch: OK`,
        `Init: calling window.LifeLogGarden.init(...)`,
      ]);

      // Call your v94 init
      window.LifeLogGarden.init({ data: json, config });

      setStatus([
        `LifeLog Garden Walk (Hosted)`,
        `bot=${BOT}  route=${ROUTE_MODE}  cache=${CACHE_MODE}  debug=${DEBUG ? "1" : "0"}`,
        `API: ${API_EXEC_BASE}`,
        `Fetch: OK`,
        `Init: OK`,
      ]);
    } catch (err) {
      const cached = readCache();
      if (cached && cached.data) {
        setStatus([
          `LifeLog Garden Walk (Hosted)`,
          `bot=${BOT}  route=${ROUTE_MODE}  cache=${CACHE_MODE}  debug=${DEBUG ? "1" : "0"}`,
          `API: ${API_EXEC_BASE}`,
          `Fetch: FAILED, using cache`,
          `Cache savedAt: ${cached.savedAt || "(unknown)"}`,
          `Init: waiting for v94 init...`
        ]);

        try {
          const waitStart = performance.now();
          const timeoutMs = 12000;
          while (!(window.LifeLogGarden && typeof window.LifeLogGarden.init === "function")) {
            await new Promise(r => setTimeout(r, 50));
            if (performance.now() - waitStart > timeoutMs) {
              throw new Error(
                "Timed out waiting for window.LifeLogGarden.init (cache mode).\n\n" +
                "Fix: load your v94 garden JS after host_boot.js and expose:\n" +
                "window.LifeLogGarden = { init: ({ data, config }) => { ... } };\n"
              );
            }
          }

          window.LifeLogGarden.init({
            data: cached.data,
            config: {
              bot: BOT,
              routeMode: ROUTE_MODE,
              apiExecBase: API_EXEC_BASE,
              fetchedFrom: "(cache)",
              fetchedAt: nowIso(),
              debug: DEBUG,
              cacheUsed: true
            }
          });

          setStatus([
            `LifeLog Garden Walk (Hosted)`,
            `bot=${BOT}  route=${ROUTE_MODE}  cache=${CACHE_MODE}  debug=${DEBUG ? "1" : "0"}`,
            `API: ${API_EXEC_BASE}`,
            `Fetch: FAILED, cache used`,
            `Init: OK (cache)`,
          ]);
          return;
        } catch (cacheErr) {
          showError("Fetch failed and cache init failed", String(cacheErr && cacheErr.stack ? cacheErr.stack : cacheErr));
          return;
        }
      }

      const msg = String(err && err.stack ? err.stack : err);
      setStatus([
        `LifeLog Garden Walk (Hosted)`,
        `bot=${BOT}  route=${ROUTE_MODE}  cache=${CACHE_MODE}  debug=${DEBUG ? "1" : "0"}`,
        `API: ${API_EXEC_BASE}`,
        `Fetch: FAILED`,
        `Status: error (see overlay)`
      ]);
      showError("Fetch or init error", msg);
    }
  };

  // Start ASAP
  bootGarden();
})();
