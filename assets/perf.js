/* ══ Rendering budget ════════════════════════
   Most of what moves on this site is drawn by the graphics card on every
   frame: the Unicorn scenes, the 3D project wall, the glass blurs laid
   over them. A fast machine does that without effort. On integrated
   graphics it falls behind, and once frames come late everything comes
   late with them — the scroll, the cursor, every hover.

   So each page starts at full quality and times its own frames once a
   scene is running (site.js asks for that). If they arrive too slowly,
   the page turns lite for the rest of the visit:

   - the scenes draw 30 frames a second, at the screen's own resolution or
     coarser (site.js), and the project wall drops its antialiasing and
     extra pixel density (project-stage.js);
   - scrolling goes back to the browser's own, which stays smooth while the
     page is busy, where Lenis's eased scroll trails the wheel;
   - site.css drops the glass blurs over moving pictures and holds the
     decorative drifts still.

   A machine that is plainly weak from the outset (two CPU threads, or
   2 GB of memory) starts lite. The outcome is kept for the tab's session,
   so the next page starts light at once instead of measuring again, and
   ?lite=1 or ?lite=0 in the address forces either mode the same way.

   Loaded in the head, ahead of the stylesheets, so the class is on <html>
   before anything is painted. */

(function () {
  const KEY = 'portfolio-lite';
  const PROBE_DELAY = 600;  // ms after a scene appears, past its fade-in and first uploads
  const PROBE_SPAN = 2000;  // ms of frames to judge by
  const SLOW_FRAME = 22;    // ms; a typical frame slower than this is under ~45 fps

  const root = document.documentElement;
  const listeners = [];
  let lite = false;
  let forcedFull = false;
  let probed = false;

  function remember(value) {
    try { sessionStorage.setItem(KEY, value); } catch (error) { /* storage blocked */ }
  }

  function recall() {
    try { return sessionStorage.getItem(KEY); } catch (error) { return null; }
  }

  function setLite(next) {
    if (next === lite) return;
    lite = next;
    root.classList.toggle('perf-lite', lite);
    listeners.slice().forEach(listener => listener(lite));
  }

  const forced = new URLSearchParams(location.search).get('lite');
  if (forced === '1' || forced === '0') remember(forced);
  const stored = recall();
  forcedFull = stored === '0';
  setLite(stored === '1' || (!forcedFull && (
    (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2) ||
    (navigator.deviceMemory > 0 && navigator.deviceMemory <= 2)
  )));

  // One measurement per page: each page's scene costs something different,
  // so a machine that kept up with the landing can still fall behind on
  // Erfaring, and is caught there.
  function probe() {
    if (lite || forcedFull || probed) return;
    probed = true;
    setTimeout(() => {
      let gaps = [];
      let spent = 0;
      let last = 0;
      requestAnimationFrame(function frame(now) {
        if (lite) return;
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
        const mean = typical.reduce((sum, value) => sum + value, 0) / typical.length;
        if (mean > SLOW_FRAME) {
          remember('1');
          setLite(true);
        }
      });
    }, PROBE_DELAY);
  }

  window.__perf = {
    get lite() { return lite; },
    onChange(listener) { listeners.push(listener); },
    probe
  };
})();
