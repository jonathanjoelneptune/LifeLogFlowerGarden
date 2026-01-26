/* host_boot.js
 * This file builds the garden scene into #svgMount.
 * It depends on v94_garden.js only for optional data labels.
 */

(function () {
  'use strict';

  const HUD_STATUS = () => document.getElementById('hudStatus');
  const HUD_EXPORT = () => document.getElementById('hudExport');
  const MOUNT = () => document.getElementById('svgMount');

  function setHudStatus_(s) {
    const el = HUD_STATUS();
    if (el) el.textContent = s;
  }

  function setHudExport_(s) {
    const el = HUD_EXPORT();
    if (el) el.textContent = s;
  }

  function clearMount_() {
    const m = MOUNT();
    if (!m) return;
    m.innerHTML = '';
  }

  function svgEl_(name, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    if (attrs) {
      Object.keys(attrs).forEach(k => el.setAttribute(k, String(attrs[k])));
    }
    return el;
  }

  function buildScene_(exportStore) {
    clearMount_();

    const mount = MOUNT();
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;

    const svg = svgEl_('svg', {
      width: w,
      height: h,
      viewBox: `0 0 ${w} ${h}`,
      style: 'display:block; width:100%; height:100%;'
    });

    // Subtle vignette overlay
    const defs = svgEl_('defs');
    const rg = svgEl_('radialGradient', { id: 'vignette', cx: '50%', cy: '35%', r: '80%' });
    rg.appendChild(svgEl_('stop', { offset: '0%', 'stop-color': 'rgba(255,255,255,0.06)' }));
    rg.appendChild(svgEl_('stop', { offset: '100%', 'stop-color': 'rgba(0,0,0,0.25)' }));
    defs.appendChild(rg);
    svg.appendChild(defs);

    // Rows config (front-ish)
    const rows = 11;          // your earlier context: 11 rows
    const flowersPerRow = 10; // simple baseline
    const topY = h * 0.50;
    const rowGap = (h * 0.34) / (rows - 1);

    for (let r = 0; r < rows; r++) {
      const y = topY + r * rowGap;

      // Row line (debug style)
      const rowLine = svgEl_('line', {
        x1: 0,
        y1: y,
        x2: w,
        y2: y,
        stroke: 'rgba(255,255,255,0.06)',
        'stroke-width': 1
      });
      svg.appendChild(rowLine);

      for (let i = 0; i < flowersPerRow; i++) {
        const x = (w * 0.12) + (i * ((w * 0.76) / (flowersPerRow - 1)));
        const scale = 0.85 + (r / (rows - 1)) * 0.55;

        // Stem
        const stemH = 42 * scale;
        svg.appendChild(svgEl_('line', {
          x1: x, y1: y,
          x2: x, y2: y - stemH,
          stroke: 'rgba(30, 180, 90, 0.75)',
          'stroke-width': 2 * scale,
          'stroke-linecap': 'round'
        }));

        // Simple flower head (circle)
        const head = svgEl_('circle', {
          cx: x,
          cy: y - stemH,
          r: 7.5 * scale,
          fill: `rgba(255, 200, 80, ${0.65 + 0.25 * (1 - r / (rows - 1))})`,
          stroke: 'rgba(0,0,0,0.2)',
          'stroke-width': 1
        });
        svg.appendChild(head);
      }
    }

    // Example: show export summary if present
    if (exportStore && exportStore.loaded) {
      const days = Object.keys(exportStore.byDate || {}).length;
      const weeks = Object.keys(exportStore.byWeek || {}).length;

      const label = svgEl_('text', {
        x: 16,
        y: h - 18,
        fill: 'rgba(255,255,255,0.75)',
        'font-size': 12
      });
      label.textContent = `Export loaded: ${days} days, ${weeks} weeks (bot=${exportStore.bot})`;
      svg.appendChild(label);
    }

    // Vignette
    const overlay = svgEl_('rect', {
      x: 0, y: 0, width: w, height: h,
      fill: 'url(#vignette)'
    });
    svg.appendChild(overlay);

    mount.appendChild(svg);
  }

  async function boot_() {
    setHudStatus_('loading export…');

    let store = null;
    try {
      if (window.LLGardenExport && typeof window.LLGardenExport.ensureLoaded === 'function') {
        store = await window.LLGardenExport.ensureLoaded();
      }
    } catch (e) {
      // Do not block rendering if export fails
      store = null;
    }

    if (store && store.loaded) {
      setHudExport_('loaded (bot=' + store.bot + ')');
    } else {
      setHudExport_('not loaded');
    }

    setHudStatus_('building scene…');
    buildScene_(store);
    setHudStatus_('ready');
  }

  function wireHudButtons_() {
    const btnReload = document.getElementById('btnReload');
    const btnRebuild = document.getElementById('btnRebuild');

    if (btnReload) {
      btnReload.addEventListener('click', async function () {
        setHudStatus_('reloading export…');
        try {
          if (typeof window.ll_loadGardenExport_ === 'function') {
            const st = await window.ll_loadGardenExport_();
            setHudExport_('loaded (bot=' + st.bot + ')');
          } else {
            setHudExport_('no loader');
          }
        } catch (e) {
          setHudExport_('load failed');
        }
        setHudStatus_('ready');
      });
    }

    if (btnRebuild) {
      btnRebuild.addEventListener('click', function () {
        const st = window.__LL_GARDEN_EXPORT__;
        buildScene_(st && st.loaded ? st : null);
        setHudStatus_('ready');
      });
    }

    window.addEventListener('resize', function () {
      const st = window.__LL_GARDEN_EXPORT__;
      buildScene_(st && st.loaded ? st : null);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    wireHudButtons_();
    boot_();
  });
})();
