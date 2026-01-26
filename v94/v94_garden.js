/* v94_garden.js
 * Uses JSONP to load GardenExport from Apps Script without CORS.
 *
 * Requires Apps Script route:
 *   ?r=api_garden_export_jsonp&bot=winston&limit=40&callback=...
 */

(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  let host = {
    hud: () => {},
    setStatus: () => {}
  };

  let exportRows = [];

  function el(name, attrs = {}) {
    const n = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  }

  function clearSvg() {
    const svg = document.getElementById("svgRoot");
    if (!svg) return null;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    return svg;
  }

  function safeHex(c, fallback) {
    const s = String(c || "").trim();
    if (/^#[0-9a-fA-F]{3}$/.test(s) || /^#[0-9a-fA-F]{6}$/.test(s)) return s;
    return fallback;
  }

  function normalizeExport(raw) {
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw && Array.isArray(raw.rows)) arr = raw.rows;
    else if (raw && Array.isArray(raw.days)) arr = raw.days;
    else if (raw && raw.data && Array.isArray(raw.data)) arr = raw.data;
    return arr.filter(x => x && typeof x === "object");
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
    if (!exec) throw new Error("Missing exec URL");

    // IMPORTANT: your Apps Script uses r=api_garden_export / r=api_garden_export_jsonp
    const u = new URL(exec);
    u.searchParams.set("r", "api_garden_export_jsonp");
    u.searchParams.set("bot", bot || "winston");
    u.searchParams.set("limit", String(limit || 40));
    u.searchParams.set("v", String(Date.now()));

    host.hud("Fetching export (JSONP): " + u.toString());

    const raw = await jsonp(u.toString());
    if (!raw || raw.ok !== true) {
      const msg = raw?.error ? String(raw.error) : "Export returned ok=false or invalid payload";
      throw new Error(msg);
    }

    exportRows = normalizeExport(raw);
    return { rows: exportRows.length };
  }

  function rebuildScene() {
    const svg = clearSvg();
    if (!svg) return;

    const hasExport = exportRows.length > 0;

    const title = el("text", {
      x: 24, y: 34,
      fill: "rgba(255,255,255,0.75)",
      "font-size": "16",
      "font-family": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
    });
    title.textContent = hasExport ? `export render rows=${exportRows.length}` : "placeholder render (no export)";
    svg.appendChild(title);

    const cols = 10;
    const startX = 160;
    const spacingX = 160;
    const stemTopY = 520;
    const stemBottomY = 790;

    for (let i = 0; i < cols; i++) {
      const row = hasExport ? exportRows[i % exportRows.length] : null;

      const primary =
        safeHex(row?.Primary || row?.primary || row?.PrimaryHex || row?.primaryHex, "#f2c14e");
      const secondary =
        safeHex(row?.Secondary || row?.secondary || row?.SecondaryHex || row?.secondaryHex, "#ffecb3");

      const cx = startX + i * spacingX;

      svg.appendChild(el("line", {
        x1: cx, y1: stemBottomY, x2: cx, y2: stemTopY,
        stroke: "rgba(120,220,160,0.95)",
        "stroke-width": "3"
      }));

      // buds down the stem
      const budCount = 12;
      for (let b = 0; b < budCount; b++) {
        const t = b / (budCount - 1);
        const y = stemBottomY - t * (stemBottomY - stemTopY);
        const r = 4 + (1 - t) * 6;
        svg.appendChild(el("circle", { cx, cy: y, r, fill: "rgba(242,193,78,0.88)" }));
      }

      // flower head
      const headY = stemTopY - 26;
      for (let p = 0; p < 8; p++) {
        const ang = (Math.PI * 2 * p) / 8;
        const px = cx + Math.cos(ang) * 20;
        const py = headY + Math.sin(ang) * 16;
        svg.appendChild(el("ellipse", {
          cx: px, cy: py, rx: 18, ry: 12,
          fill: primary, opacity: "0.92"
        }));
      }
      svg.appendChild(el("circle", { cx, cy: headY, r: 12, fill: secondary, opacity: "0.96" }));

      if (hasExport) {
        const dk = row?.DateKey || row?.dateKey || row?.Date || row?.date || "";
        const label = el("text", {
          x: cx, y: headY - 40,
          fill: "rgba(255,255,255,0.7)",
          "font-size": "10",
          "text-anchor": "middle"
        });
        label.textContent = String(dk);
        svg.appendChild(label);
      }
    }

    host.hud(`Scene rebuild: ${hasExport ? "export" : "placeholder"}`);
  }

  function init(h) {
    host = { ...host, ...(h || {}) };
    host.hud("v94Garden init");
  }

  window.v94Garden = { init, loadExport, rebuildScene };
})();
