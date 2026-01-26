/* v94_garden.js
 * Owns: fetching export data and building SVG scene.
 *
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

  let exportRaw = null;
  let exportRows = []; // normalized rows

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
    // Accept several shapes:
    // 1) { rows: [...] }
    // 2) { days: [...] }
    // 3) [ ... ]
    // Each row/day: { dateKey, primary, secondary, title, mood, ... } optional
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (raw && Array.isArray(raw.rows)) arr = raw.rows;
    else if (raw && Array.isArray(raw.days)) arr = raw.days;
    else if (raw && raw.data && Array.isArray(raw.data)) arr = raw.data;

    // Ensure each item is an object
    arr = arr.filter(x => x && typeof x === "object");

    return arr;
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

    // Always show something
    const hasExport = exportRows.length > 0;

    // Layout: 10 columns, 1 row for now (Step A)
    const cols = 10;
    const baseY = 720;
    const spacingX = 160;
    const startX = 160;

    // Title hint (in SVG, top left area)
    const title = el("text", {
      x: 24, y: 36, fill: "rgba(255,255,255,0.75)",
      "font-size": "16",
      "font-family": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
    });
    title.textContent = hasExport ? "v94 export render" : "placeholder render (no export)";
    svg.appendChild(title);

    // Build 10 flowers
    for (let i = 0; i < cols; i++) {
      const row = hasExport ? exportRows[i % exportRows.length] : null;

      const primary = safeColor(row?.primary || row?.Primary || row?.primaryHex, "#f2c14e");
      const secondary = safeColor(row?.secondary || row?.Secondary || row?.secondaryHex, "#ffecb3");

      const cx = startX + i * spacingX;
      const stemTopY = 520;
      const stemBottomY = baseY + 70;

      // stem
      svg.appendChild(el("line", {
        x1: cx, y1: stemBottomY, x2: cx, y2: stemTopY,
        stroke: "rgba(120,220,160,0.95)", "stroke-width": "3"
      }));

      // buds up the stem (your current look)
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

      // flower head (simple for now)
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

      // label if export present
      if (hasExport) {
        const label = el("text", {
          x: cx, y: headY - 40,
          fill: "rgba(255,255,255,0.7)",
          "font-size": "10",
          "text-anchor": "middle"
        });
        label.textContent = row.dateKey || row.Date || row.date || "";
        svg.appendChild(label);
      }
    }

    host.hud(`Scene rebuild: ${hasExport ? "export" : "placeholder"}; rows=${exportRows.length}`);
  }

  async function loadExport({ exec, bot, limit }) {
    // Build URL
    const u = new URL(exec);
    u.searchParams.set("op", "gardenExport");
    u.searchParams.set("bot", bot || "winston");
    u.searchParams.set("limit", String(limit || 40));
    u.searchParams.set("format", "json");
    u.searchParams.set("v", "94");

    host.hud(`Fetching: ${u.toString()}`);

    // Fetch with CORS
    const r = await fetch(u.toString(), {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      headers: { "Accept": "application/json,text/plain,*/*" }
    });

    const ct = (r.headers.get("content-type") || "").toLowerCase();

    // If Apps Script returns HTML, this is where you will see it
    const text = await r.text();

    // Try JSON parse, but detect HTML quickly
    const looksLikeHtml = /^\s*</.test(text) && /<html|<!doctype/i.test(text);
    if (looksLikeHtml) {
      throw new Error("Apps Script returned HTML, not JSON. Update doGet to return ContentService JSON for op=gardenExport.");
    }

    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      throw new Error(`Could not parse JSON. content-type=${ct || "unknown"} firstChars=${text.slice(0, 60)}`);
    }

    exportRaw = raw;
    exportRows = normalizeExport(raw);

    if (!exportRows.length) {
      host.hud("Export parsed but produced 0 rows after normalization.");
    }

    return {
      rows: exportRows.length,
      rawType: Array.isArray(raw) ? "array" : typeof raw
    };
  }

  function init(h) {
    host = { ...host, ...(h || {}) };
    host.hud("v94Garden init");
  }

  window.v94Garden = {
    init,
    loadExport,
    rebuildScene
  };
})();
