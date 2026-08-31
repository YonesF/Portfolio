/* ══ Fit a page to the screen ═══════════════
   The landing scales its 1440x900 artboard until it is contained by the
   window, so it is always exactly one screen with nothing to scroll. These
   pages carry real content rather than an artboard, so they cannot simply
   be scaled: shrinking a fixed-width layout would letterbox it, and on a
   short window that leaves the page floating in its own background with a
   fifth of the screen empty down each side.

   So this does what zooming out does instead. The page is laid out at a
   larger notional window — wide enough that scaling it back down covers the
   real one exactly — and then scaled. Content reflows into the extra width
   as it goes, which is why the two steps have to chase each other: a wider
   layout is a shorter one, a shorter one needs less scaling, and less
   scaling means a narrower layout. A few passes settle it.

   Desktop only. On a phone the page is already a single narrow column and
   scrolling is what a reader expects; zooming that out far enough to fit
   would leave the text too small to read. */

(function initPageFit() {
  const main = document.querySelector('main[data-page-fit]');
  if (!main) return;

  const MIN_WIDTH = 900;   // below this, leave the page alone and let it scroll
  const MIN_SCALE = 0.82;  // a floor: past this the page is unreadable, and
                           // scrolling is the better answer
  const ZOOM = 1.32;       // held a little closer than a strict fit — an exact
                           // fit reads as too far out, so the page is allowed
                           // to run slightly past the fold
  const MAX_PASSES = 6;
  const SETTLED = 0.004;   // stop once a pass barely moves the scale

  const root = document.documentElement;
  let frame = 0;
  let scale = 1;

  function apply(value, width) {
    main.style.setProperty('--page-fit', value);
    main.style.width = `${width}px`;
    root.style.setProperty('--fit-vh', `${window.innerHeight / value}px`);
  }

  function release() {
    main.classList.remove('is-fitted');
    main.style.removeProperty('--page-fit');
    main.style.removeProperty('width');
    main.style.removeProperty('margin-bottom');
    root.style.removeProperty('--fit-vh');
    root.style.removeProperty('overflow');
    scale = 1;
  }

  function measure() {
    frame = 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < MIN_WIDTH) return release();

    // Measured with the transform off: offsetHeight is the layout height and
    // ignores transforms, but the width the layout is given does not.
    main.classList.remove('is-fitted');

    let next = scale;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      apply(next, vw / next);
      const wanted = Math.min(1, Math.max(MIN_SCALE, (vh / main.offsetHeight) * ZOOM));
      if (Math.abs(wanted - next) < SETTLED) { next = wanted; break; }
      next = wanted;
    }

    scale = next;
    apply(scale, vw / scale);
    main.classList.add('is-fitted');

    // The transform changes what is drawn, not what is reserved, so the page
    // would still scroll by the difference. The margin takes back the layout
    // height; hiding the root's overflow takes back the scroll region, which
    // a transformed box leaves behind on its own.
    const natural = main.offsetHeight;
    main.style.marginBottom = `${Math.round(natural * scale - natural)}px`;
    root.style.overflow = natural * scale <= vh + 1 ? 'hidden' : '';
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(measure);
  }

  measure();
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule);
  // Fonts and the scene canvases both land after first paint, and both move
  // the height everything is measured against.
  document.fonts?.ready.then(schedule);
  new ResizeObserver(schedule).observe(main);
})();
