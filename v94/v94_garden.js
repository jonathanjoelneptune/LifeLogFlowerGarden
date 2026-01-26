/* v94_garden.js (v94)
 * Scene builder. Exposes window.v94Garden for host_boot.
 */

(() => {
  const api = {
    _svg: null,
    _log: null,
    _export: null,

    init({ svgRoot, log }) {
      this._svg = svgRoot;
      this._log = typeof log === "function" ? log : (() => {});
      this._log("v94_garden initialized.");
      this._renderPlaceholder();
    },

    setExport(payload) {
      this._export = payload;
      const rows = Array.isArray(payload?.rows) ? payload.rows.length : 0;
      this._log(`Export set. rows=${rows}`);
    },

    rebuild() {
      if (!this._svg) return;
      const rows = Array.isArray(this._export?.rows) ? this._export.rows : null;
      if (!rows || rows.length === 0) {
        this._log("Scene rebuild: no export. (placeholder render)");
        this._renderPlaceholder();
        return;
      }
      this._renderFromRows(rows);
    },

    _clear() {
      while (this._svg.firstChild) this._svg.removeChild(this._svg.firstChild);
    },

    _renderPlaceholder() {
      this._clear();
      // keep the placeholder stems minimal (what you see now)
      const svg = this._svg;
      const W = 1600, H = 900;
      const baseY = 760;

      for (let i = 0; i < 10; i++) {
        const x = 140 + i * 150;
        svg.appendChild(line(x, baseY, x, 520, "rgba(90,220,140,0.85)", 3));
        for (let k = 0; k < 12; k++) {
          svg.appendChild(circle(x, 740 - k * 18, 7 + (k % 3), "rgba(255,210,90,0.85)"));
        }
      }
      this._log("Placeholder scene rendered.");
    },

    _renderFromRows(rows) {
      this._clear();
      const svg = this._svg;
      const W = 1600, H = 900;

      const baseY = 760;
      const stemTopY = 520;

      // Render last N rows across the front row slots
      const N = Math.min(10, rows.length);
      const slice = rows.slice(rows.length - N);

      slice.forEach((r, i) => {
        const x = 160 + i * 140;

        // Label from DateKey if present
        const dateKey = r.DateKey || r.dateKey || r.date || "";
        if (dateKey) {
          const t = text(x, 470, dateKey, "rgba(255,255,255,0.65)", 14);
          t.setAttribute("text-anchor", "middle");
          svg.appendChild(t);
        }

        // Stem
        svg.appendChild(line(x, baseY, x, stemTopY, "rgba(90,220,140,0.9)", 4));

        // Simple flower head
        svg.appendChild(circle(x, stemTopY - 20, 28, "rgba(255,210,90,0.92)"));
        svg.appendChild(circle(x, stemTopY - 20, 12, "rgba(255,245,220,0.95)"));

        // Little “beads” down the stem (keeps your current look)
        for (let k = 0; k < 12; k++) {
          svg.appendChild(circle(x, baseY - 30 - k * 18, 7 + (k % 3), "rgba(255,210,90,0.82)"));
        }
      });

      this._log("Scene rendered from export.");
    },
  };

  // Helpers
  function ns(tag) { return document.createElementNS("http://www.w3.org/2000/svg", tag); }

  function line(x1, y1, x2, y2, stroke, w) {
    const el = ns("line");
    el.setAttribute("x1", x1); el.setAttribute("y1", y1);
    el.setAttribute("x2", x2); el.setAttribute("y2", y2);
    el.setAttribute("stroke", stroke);
    el.setAttribute("stroke-width", w);
    el.setAttribute("stroke-linecap", "round");
    return el;
  }

  function circle(cx, cy, r, fill) {
    const el = ns("circle");
    el.setAttribute("cx", cx);
    el.setAttribute("cy", cy);
    el.setAttribute("r", r);
    el.setAttribute("fill", fill);
    return el;
  }

  function text(x, y, str, fill, size) {
    const el = ns("text");
    el.setAttribute("x", x);
    el.setAttribute("y", y);
    el.setAttribute("fill", fill);
    el.setAttribute("font-size", size);
    el.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif");
    el.textContent = str;
    return el;
  }

  // Expose
  window.v94Garden = api;
  window.V94Garden = api;
})();
