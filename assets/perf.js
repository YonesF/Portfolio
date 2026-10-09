/* ══ Rendering budget ════════════════════════
   Most of what moves on this site is drawn by the graphics card on every
   frame: the Unicorn scenes, the 3D project wall, the glass blurs laid
   over them. A fast machine does that without effort. On integrated
   graphics it falls behind, and once frames come late everything comes
   late with them — the scroll, the cursor, every hover.

   So a page draws at one of three levels, and times its own frames once a
   scene is running (site.js asks for that) to settle on the right one:

   - fine: the scenes as Unicorn exports them, at 1.5 pixels per CSS
     pixel. Drawn larger than they are shown and scaled down, which is what
     gives their grain its look; on an ordinary screen that is two to three
     times the pixels of normal, through every effect pass.
   - normal: each scene drawn at the size it is shown (site.js). Finer
     grain, a fraction of the work.
   - lite: the scenes at 30 frames a second and coarser still, the project
     wall without antialiasing (project-stage.js), the browser's own
     scrolling in place of Lenis's, and none of the glass blurs or the
     decorative drifts (site.css).

   A dedicated graphics card starts at fine, anything else at normal, and a
   plainly weak machine (two CPU threads, or 2 GB of memory) at lite. A
   page that keeps up at normal is then tried at fine, once; a level that
   falls behind steps down. Fine has to hold about 55 frames a second,
   normal about 45.

   The level is kept for the tab's session, so the next page starts there
   at once. ?quality=fine, normal or lite in the address fixes it for the
   session instead (?lite=1 and ?lite=0 are short for lite and fine), and
   ?quality=auto hands the choice back to the measurements.

   Loaded in the head, ahead of the stylesheets, so a lite page has its
   class on <html> before anything is painted. */

(function () {
  const KEY = 'portfolio-quality';
  const LEVELS = ['lite', 'normal', 'fine'];
  const KEEPS_UP = { fine: 18.5, normal: 22 }; // ms, the typical frame each level must beat
  const PROBE_DELAY = 600;  // ms after a scene appears or changes, past fade-ins and reallocation
  const PROBE_SPAN = 2000;  // ms of frames to judge by
  const MAX_PROBES = 3;     // normal, then fine, then back to normal at the most

  const root = document.documentElement;
  const listeners = [];
  // The level, the session's record of having tried fine, and whether the
  // address fixed it. The level stays null until something reads it, so
  // the graphics card is only looked at once there is a scene to draw.
  let state = recall();
  let probes = 0;
  let probing = false;

  function recall() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY));
      return saved && LEVELS.includes(saved.level) ? saved : null;
    } catch (error) {
      return null;
    }
  }

  function remember() {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (error) { /* storage blocked */ }
  }

  // A dedicated card, or Apple's own chips, by name. Chrome and Safari mask
  // RENDERER and give the real one through the debug extension; Firefox
  // gives a cleaned-up real one directly and warns about the extension.
  function dedicatedGpu() {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      if (!gl) return false;
      let renderer = String(gl.getParameter(gl.RENDERER));
      if (/webkit|mozilla/i.test(renderer)) {
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /nvidia|geforce|quadro|radeon(\(tm\))? (rx|pro)|apple m\d/i.test(renderer);
    } catch (error) {
      return false;
    }
  }

  function level() {
    if (!state) {
      state = { level: dedicatedGpu() ? 'fine' : 'normal', triedFine: false, fixed: false };
      state.triedFine = state.level === 'fine';
    }
    return state.level;
  }

  function setLevel(next) {
    state.level = next;
    if (next === 'fine') state.triedFine = true;
    remember();
    root.classList.toggle('perf-lite', next === 'lite');
    listeners.slice().forEach(listener => listener(next));
  }

  const params = new URLSearchParams(location.search);
  const asked = params.get('quality') || { 1: 'lite', 0: 'fine' }[params.get('lite')];
  if (LEVELS.includes(asked)) {
    state = { level: asked, triedFine: true, fixed: true };
    remember();
  } else if (asked === 'auto') {
    state = null;
    try { sessionStorage.removeItem(KEY); } catch (error) { /* storage blocked */ }
  }
  if (!state && (
    (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2) ||
    (navigator.deviceMemory > 0 && navigator.deviceMemory <= 2)
  )) {
    state = { level: 'lite', triedFine: true, fixed: false };
  }
  root.classList.toggle('perf-lite', state?.level === 'lite');

  // Times PROBE_SPAN of frames and hands over the typical one.
  function measure(done) {
    let gaps = [];
    let spent = 0;
    let last = 0;
    requestAnimationFrame(function frame(now) {
      const gap = last ? now - last : 0;
      last = now;
      // A second or more between frames is a hidden tab or a sleeping
      // machine rather than the page, so the measurement starts over.
      if (gap > 1000) {
        gaps = [];
        spent = 0;
      } else if (gap) {
        gaps.push(gap);
        spent += gap;
      }
      if (spent < PROBE_SPAN) {
        requestAnimationFrame(frame);
        return;
      }
      // The slowest tenth is left out: one-off stalls (an image decode, a
      // garbage collection) say nothing about the frames that follow.
      gaps.sort((a, b) => a - b);
      const typical = gaps.slice(0, Math.ceil(gaps.length * 0.9));
      done(typical.reduce((sum, value) => sum + value, 0) / typical.length);
    });
  }

  // Run on each page, as each page's scene costs something different: a
  // machine that kept up on the landing can still fall behind on Erfaring.
  // After any change the new level is timed in turn, so a step up that
  // turns out too heavy is taken back at once. A page without a scene
  // (Kontakt) is drawn alike at fine and normal, so there the only
  // question is whether the machine keeps up at all.
  function probe({ scene = true } = {}) {
    if (probing || probes >= MAX_PROBES || state?.fixed) return;
    if ((scene ? level() : state?.level) === 'lite') return;
    probing = true;
    probes += 1;
    setTimeout(() => measure(typical => {
      probing = false;
      if (state?.fixed || state?.level === 'lite') return;
      if (!scene) {
        if (typical > KEEPS_UP.normal) {
          state = state || { level: 'normal', triedFine: false, fixed: false };
          setLevel('lite');
        }
        return;
      }
      const current = state.level;
      if (typical > KEEPS_UP[current]) {
        setLevel(LEVELS[LEVELS.indexOf(current) - 1]);
      } else if (current === 'normal' && !state.triedFine && typical <= KEEPS_UP.fine) {
        setLevel('fine');
      } else {
        remember();
        return;
      }
      probe();
    }), PROBE_DELAY);
  }

  window.__perf = {
    // Read by the scenes; settles the starting level on first use.
    get tier() { return level(); },
    // Read by everything else; never needs the graphics card looked at.
    get lite() { return state?.level === 'lite'; },
    onChange(listener) { listeners.push(listener); },
    probe
  };
})();
