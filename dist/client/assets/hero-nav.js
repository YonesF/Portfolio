/* ══ Hero word navigation ═══════════════════
   ERFARINGER, PORTRETT, PROSJEKTER and KONTAKT are lettering inside the
   landing scene's WebGL canvas, so they cannot be styled or hovered from
   here. What can be reached is the transparent text node the Unicorn
   runtime lays over each word (data-us-text) for selection and screen
   readers: it carries the same font, size and position as the painted
   glyphs, and it moves with the stage's scale transform.

   So the words are measured rather than guessed. Each hit area is sized
   to a Range around the glyphs — not the layer's box, which is padded and
   would swallow the dead space beside short words.

   The hit areas are placed on every device: with each section on its own
   page now, these four words are the only way into the site, so a phone
   has to be able to tap them. */

(function initHeroWordNav() {
  const section = document.getElementById('landing');
  const layer = document.getElementById('heroNav');
  const stage = section?.querySelector('.us-scene__stage');
  if (!section || !layer || !stage) return;

  const hits = [...layer.querySelectorAll('.hero-hit')];
  const names = new Set(hits.map(hit => hit.dataset.heroWord));
  if (!hits.length) return;

  const MIN_VIEWPORT = 900;   // below this the scene has scaled the lettering right down

  const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let measureFrame = 0;

  /* The layer's own box is padded out to a round number in the scene, so
     measuring it would hand short words a hit area half again their
     width. A Range around the text reports where the glyphs actually
     land. */
  function glyphRect(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1 ? rect : element.getBoundingClientRect();
  }

  /* Unicorn positions each text node inside the stage and then adds the
     stage's own offsetLeft/offsetTop on top. That is right when the stage
     is a static box inside a positioned wrapper, but here the stage IS the
     positioned box (absolute, left/top 50%), so the offset counts twice and
     every node lands half a stage right and below its glyphs. Nothing shows
     — the node is transparent — but we are measuring it.

     Decided per scene rather than per word: a doubled offset throws at
     least one word clear off the 1440x900 artboard, while a word that is
     merely near the edge stays within tolerance. So if everything already
     fits, the nodes are trusted as they are, and this keeps working if the
     pinned runtime ever stops double counting. */
  function measureWords(words, box, scale) {
    const tolerance = box.width * 0.05;
    const inside = rect =>
      rect.left >= box.left - tolerance && rect.right <= box.right + tolerance &&
      rect.top >= box.top - tolerance && rect.bottom <= box.bottom + tolerance;

    const raw = new Map([...words].map(([word, node]) => [word, glyphRect(node)]));
    if ([...raw.values()].every(inside)) return raw;

    const dx = stage.offsetLeft * scale;
    const dy = stage.offsetTop * scale;
    const shifted = new Map([...raw].map(([word, rect]) =>
      [word, new DOMRect(rect.left - dx, rect.top - dy, rect.width, rect.height)]));

    // If undoing the offset does not bring the whole set onto the artboard
    // then the scene is not what this expects, and guessing would put live
    // links over empty black.
    return [...shifted.values()].every(inside) ? shifted : null;
  }

  function sceneWords() {
    const found = new Map();
    stage.querySelectorAll('[data-us-text]').forEach(node => {
      const word = (node.innerText || node.textContent || '').trim().toUpperCase();
      if (names.has(word) && !found.has(word)) found.set(word, node);
    });
    return found;
  }

  function hide() {
    layer.classList.remove('is-ready');
  }

  function place() {
    const words = sceneWords();
    // Partial scenes happen while the runtime is still building or tearing
    // one down; placing half the words would leave links over nothing.
    if (words.size < hits.length) return hide();

    const base = section.getBoundingClientRect();
    const box = stage.getBoundingClientRect();
    // Read the scale off the stage itself rather than --scene-fit, so the
    // measurement cannot disagree with what is actually on screen.
    const scale = stage.offsetWidth ? box.width / stage.offsetWidth : 1;

    const rects = measureWords(words, box, scale);
    if (!rects) return hide();

    // A mouse on a wide window aims at the glyphs themselves. A finger, or
    // lettering the scene has scaled right down, gets the tap target grown
    // around them, kept just under the gap between the two rows of words
    // so neighbouring targets never overlap.
    const exact = pointer.matches && window.innerWidth >= MIN_VIEWPORT;
    const padX = exact ? 0 : 12;
    const padY = exact ? 0 : 8;

    hits.forEach(hit => {
      const rect = rects.get(hit.dataset.heroWord);
      if (!rect) return;
      hit.style.left = `${rect.left - base.left - padX}px`;
      hit.style.top = `${rect.top - base.top - padY}px`;
      hit.style.width = `${rect.width + padX * 2}px`;
      hit.style.height = `${rect.height + padY * 2}px`;
      hit.style.fontSize = `${rect.height}px`;   // the ::after rule scales in em
    });

    layer.classList.add('is-ready');
  }

  function measure() {
    cancelAnimationFrame(measureFrame);
    measureFrame = requestAnimationFrame(place);
  }

  // The scene's text nodes appear when the runtime builds it and are taken
  // away again when the lifecycle manager unloads it on the way down the
  // page, so watch the stage rather than measuring once.
  new MutationObserver(measure).observe(stage, { childList: true, subtree: true });
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('orientationchange', measure);
  pointer.addEventListener?.('change', measure);
  // Inter Tight arrives after first paint and changes every glyph width.
  document.fonts?.ready.then(measure);
  measure();
})();
