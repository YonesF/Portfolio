/* ══ Hero word navigation ═══════════════════
   ERFARINGER, PORTRETT, PROSJEKTER and KONTAKT are lettering inside the
   landing scene's WebGL canvas, so they cannot be styled or hovered from
   here. What can be reached is the transparent text node the Unicorn
   runtime lays over each word (data-us-text) for selection and screen
   readers: it carries the same font, size and position as the painted
   glyphs, and it moves with the stage's scale transform.

   So the words are measured rather than guessed. Each hit area is sized
   to a Range around the glyphs — not the layer's box, which is padded and
   would swallow the dead space beside short words — and each preview
   panel is parked in the empty band between the two columns, level with
   the word that opens it.

   The hit areas are placed on every device: with each section on its own
   page now, these four words are the only way into the site, so a phone
   has to be able to tap them. Only the preview panels are gated — they
   need hover to open and the middle of a wide window to sit in. */

(function initHeroWordNav() {
  const section = document.getElementById('landing');
  const layer = document.getElementById('heroNav');
  const stage = section?.querySelector('.us-scene__stage');
  if (!section || !layer || !stage) return;

  const hits = [...layer.querySelectorAll('.hero-hit')];
  const cards = new Map(
    [...layer.querySelectorAll('.hero-card')].map(card => [card.dataset.heroWord, card])
  );
  if (!hits.length) return;

  const MIN_VIEWPORT = 900;   // below this the middle band is too narrow
  const MIN_SCALE = 0.78;     // keep the panel legible on short windows
  const MAX_SCALE = 1.15;     // and stop it ballooning on very large ones
  const CARD_BASE = 400;      // preferred panel width at scene scale 1
  const GAP = 22;             // between a word and its panel, before scale
  const TOP_SAFE = 56;        // breathing room at the head of the scene
  const BOTTOM_SAFE = 80;     // breathing room at the foot of the scene

  const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // The word the pointer or keyboard is on, tracked separately from whether
  // the panels have been measured. The runtime rebuilds the scene's text
  // nodes on resize, which retracts the layer mid-hover; keeping the state
  // here means the next measure puts the right panel back instead of waiting
  // for the pointer to leave and come again.
  let hovered = null;
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
      if (cards.has(word) && !found.has(word)) found.set(word, node);
    });
    return found;
  }

  function renderPanels() {
    const live = layer.classList.contains('is-ready') &&
      layer.classList.contains('has-previews');
    cards.forEach((card, word) => card.classList.toggle('is-open', live && word === hovered));
  }

  function hide() {
    layer.classList.remove('is-ready');
    renderPanels();
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
    layer.style.setProperty('--hero-scale', clamp(scale, MIN_SCALE, MAX_SCALE));

    const rects = measureWords(words, box, scale);
    if (!rects) return hide();
    const middle = box.left + box.width / 2;

    // Panels want hover and room; the links below want neither.
    const previews = pointer.matches && window.innerWidth >= MIN_VIEWPORT;
    layer.classList.toggle('has-previews', previews);

    // The panel lives in the gap between the left and right columns of
    // words, so it can never cover the word it belongs to or the ones
    // opposite. Measured from the words themselves rather than assumed,
    // so re-arranging the scene does not strand it.
    const lefts = [...rects.values()].filter(r => r.left + r.width / 2 < middle);
    const rights = [...rects.values()].filter(r => r.left + r.width / 2 >= middle);
    const gap = GAP * scale;
    const bandStart = lefts.length ? Math.max(...lefts.map(r => r.right)) : base.left;
    const bandEnd = rights.length ? Math.min(...rights.map(r => r.left)) : base.right;
    const cardWidth = Math.round(
      clamp(bandEnd - bandStart - gap * 2, 200, CARD_BASE * scale)
    );

    hits.forEach(hit => {
      const word = hit.dataset.heroWord;
      const rect = rects.get(word);
      const card = cards.get(word);
      if (!rect || !card) return;

      // Where the panels are off there is no hover to aim with and the scene
      // has scaled the lettering right down, so the tap target is grown
      // around the glyphs. Kept just under the gap between the two rows of
      // words, so neighbouring targets never overlap.
      const padX = previews ? 0 : 12;
      const padY = previews ? 0 : 8;

      hit.style.left = `${rect.left - base.left - padX}px`;
      hit.style.top = `${rect.top - base.top - padY}px`;
      hit.style.width = `${rect.width + padX * 2}px`;
      hit.style.height = `${rect.height + padY * 2}px`;
      hit.style.fontSize = `${rect.height}px`;   // the ::after rule scales in em
      if (!previews) return;

      // Panels open inward, and take their edge from the column rather than
      // from the word: a tall panel beside a short word would otherwise
      // reach into the row above and cover the longer word sitting there.
      const onLeft = rect.left + rect.width / 2 < middle;
      card.style.width = `${cardWidth}px`;
      const height = card.offsetHeight;
      const left = onLeft ? bandStart + gap : bandEnd - gap - cardWidth;
      // Level with the word, pulled inside the scene's edges. The top
      // limit is applied last so that a panel too tall for a short window
      // overhangs the bottom rather than sliding under the fixed nav.
      const top = Math.max(
        base.top + TOP_SAFE,
        Math.min(rect.top + rect.height / 2 - height / 2,
          base.bottom - BOTTOM_SAFE - height)
      );

      card.style.left = `${Math.round(left - base.left)}px`;
      card.style.top = `${Math.round(top - base.top)}px`;
    });

    layer.classList.add('is-ready');
    renderPanels();
  }

  function measure() {
    cancelAnimationFrame(measureFrame);
    measureFrame = requestAnimationFrame(place);
  }

  hits.forEach(hit => {
    const word = hit.dataset.heroWord;
    const enter = () => { hovered = word; renderPanels(); };
    const leave = () => { if (hovered === word) hovered = null; renderPanels(); };
    hit.addEventListener('pointerenter', enter);
    hit.addEventListener('pointerleave', leave);
    hit.addEventListener('focus', enter);
    hit.addEventListener('blur', leave);
  });

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
