/* v94_garden.js (CORS-safe JSONP)
 * Exposes:
 *   window.v94Garden.init(host)
 *   window.v94Garden.loadExport({exec, bot, limit})
 *   window.v94Garden.rebuildScene()
 */
(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  let host = {
    hud: () => {},
    setStatus: () => {},
    getExec: () => "",
    getBot: () => "winston",
    getLimit: () => 40
  };

  let exportRows = [];

  function el(name, attrs = {}) {
    const n = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
    return n;
  }

  function clearSvg() {
    const svg = document.getElementById("svgRoot");
    while (svg && svg.firstChild) svg.removeChild(svg.firstChild);
    return svg;
  }

  function normalizeExport(raw) {
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw && Array.isArray(raw.rows)) arr = raw.rows;
    else if (raw && Array.isArray(raw.days)) arr = raw.days;
    else if (raw && raw.data && Array.isArray(raw.data)) arr = raw.data;
    return arr.filter(x => x && typeof x === "object");
  }

  function safeColor(c, fallback) {
    const s = String(c || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) return s;
    return fallback;
  }

  function rebuildScene() {
    const svg = clearSvg();
    if (!svg) return;

    const hasExport = exportRows.length > 0;

    const cols = 10;
    const baseY = 720;
    const spacingX = 160;
    const startX = 160;

    const title = el("text", {
      x: 24, y: 36, fill: "rgba(255,255,255,0.75)",
      "font-size": "16",
      "font-family": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
    });
    title.textContent = hasExport ? "v94 export render" : "placeholder render (no export)";
    svg.appendChild(title);

    for (let i = 0; i < cols; i++) {
      const row = hasExport ? exportRows[i % exportRows.length] : null;

      const primary = safeColor(row?.Primary || row?.primary || row?.primaryHex, "#f2c14e");
      const secondary = safeColor(row?.Secondary || row?.secondary || row?.secondaryHex, "#ffecb3");

      const cx = startX + i * spacingX;
      const stemTopY = 520;
      const stemBottomY = baseY + 70;

      svg.appendChild(el("line", {
        x1: cx, y1: stemBottomY, x2: cx, y2: stemTopY,
        stroke: "rgba(120,220,160,0.95)", "stroke-width": "3"
      }));

      const budCount = 12;
      for (let b = 0; b < budCount; b++) {
        const t = b / (budCount - 1);
        const y = stemBottomY - t * (stemBottomY - stemTopY);
        const r = 4 + (1 - t) * 6;

        svg.appendChild(el("circle", {
          cx, cy: y, r,
          fill: "rgba(242,193,78,0.88)"
        }));
      }

      const headY = stemTopY - 24;
      const petalR = 18;
      for (let p = 0; p < 8; p++) {
        const ang = (Math.PI * 2 * p) / 8;
        const px = cx + Math.cos(ang) * 20;
        const py = headY + Math.sin(ang) * 16;
        svg.appendChild(el("ellipse", {
          cx: px, cy: py, rx: petalR, ry: petalR * 0.7,
          fill: primary,
          opacity: "0.9"
        }));
      }
      svg.appendChild(el("circle", { cx, cy: headY, r: 12, fill: secondary, opacity: "0.95" }));

      if (hasExport) {
        const label = el("text", {
          x: cx, y: headY - 40,
          fill: "rgba(255,255,255,0.7)",
          "font-size": "10",
          "text-anchor": "middle"
        });
        label.textContent = row.DateKey || row.dateKey || row.Date || row.date || "";
        svg.appendChild(label);
      }
    }

    host.hud(`Scene rebuild: ${hasExport ? "export" : "placeholder"}; rows=${exportRows.length}`);
  }

  function jsonp(url, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const cbName = "__v94jsonp_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      let done = false;

      const cleanup = () => {
        if (script && script.parentNode) script.parentNode.removeChild(script);
        try { delete window[cbName]; } catch (_) { window[cbName] = undefined; }
      };

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error("JSONP timeout"));
      }, timeoutMs);

      window[cbName] = (data) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        reject(new Error("JSONP script load error"));
      };

      const u = new URL(url);
      u.searchParams.set("callback", cbName);

      script.src = u.toString();
      document.head.appendChild(script);
    });
  }

  async function loadExport({ exec, bot, limit }) {
    // IMPORTANT: Your Apps Script routes on "r"
    // Use JSONP route to avoid CORS
    const u = new URL(exec);
    u.searchParams.set("r", "api_garden_export_jsonp");
    u.searchParams.set("bot", bot || "winston");
    u.searchParams.set("limit", String(limit || 40));
    u.searchParams.set("v", String(Date.now()));

    host.hud(`Fetching export (JSONP): ${u.toString()}`);

    const raw = await jsonp(u.toString());
    if (!raw || raw.ok !== true) {
      const err = raw?.error ? String(raw.error) : "Unknown export error";
      throw new Error(err);
    }

    exportRows = normalizeExport(raw);

    return {
      rows: exportRows.length,
      rawType: Array.isArray(raw) ? "array" : typeof raw
    };
  }

  function init(h) {
    host = { ...host, ...(h || {}) };
    host.hud("v94Garden init");
  }

  window.v94Garden = { init, loadExport, rebuildScene };
})();
