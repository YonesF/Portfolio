/* ─── Lenis + GSAP ScrollTrigger ────────── */
// Declared first so the scroll-driven code further down can reach it.
// Lenis honours prefers-reduced-motion by default, falling back to
// native scrolling.
//
// No autoRaf here: ScrollTrigger still receives every Lenis update and
// both systems share GSAP's clock while scrolling. The Lenis callback is
// detached after four settled frames, allowing GSAP's ticker to sleep
// normally whenever no other tween is active.
const lenis = new Lenis();
gsap.registerPlugin(ScrollTrigger, SplitText);
gsap.ticker.lagSmoothing(0);

const lenisTicker = (() => {
  const SETTLED_FRAMES = 4;
  let attached = false;
  let resetClock = true;
  let settledFrames = 0;

  function detach() {
    if (!attached) return;
    gsap.ticker.remove(drive);
    attached = false;
    document.documentElement.dataset.lenisTicker = 'idle';
  }

  function drive(time) {
    const timeMs = time * 1000;
    if (resetClock) {
      // Do not treat time spent asleep as one enormous animation frame.
      lenis.time = timeMs;
      resetClock = false;
    }
    lenis.raf(timeMs);

    const distance = Math.abs(lenis.targetScroll - lenis.animatedScroll);
    if (lenis.isScrolling || distance > 0.1) {
      settledFrames = 0;
      return;
    }

    settledFrames += 1;
    if (settledFrames >= SETTLED_FRAMES) detach();
  }

  function wake() {
    settledFrames = 0;
    if (attached || document.hidden) return;
    resetClock = true;
    attached = true;
    document.documentElement.dataset.lenisTicker = 'running';
    gsap.ticker.add(drive);
  }

  lenis.on('scroll', instance => {
    ScrollTrigger.update();
    if (instance.isScrolling) wake();
  });
  lenis.on('virtual-scroll', wake);

  // Programmatic anchor navigation must wake from a fully idle page.
  const scrollTo = lenis.scrollTo.bind(lenis);
  lenis.scrollTo = (...args) => {
    wake();
    return scrollTo(...args);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) detach();
    else wake();
  });

  wake();
  return { wake, get running() { return attached; } };
})();

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* One browser frame for all viewport-driven reads and updates. */
const viewportFrame = (() => {
  const subscribers = [];
  let frame = 0;
  let scrollPending = false;
  let resizePending = false;

  function flush() {
    frame = 0;
    const state = {
      scrolled: scrollPending,
      resized: resizePending,
      scrollY: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight
    };
    scrollPending = false;
    resizePending = false;

    subscribers.forEach(subscription => {
      if ((state.scrolled && subscription.scroll) || (state.resized && subscription.resize)) {
        subscription.callback(state);
      }
    });
  }

  function request(type) {
    if (type === 'scroll') scrollPending = true;
    else resizePending = true;
    if (!frame) frame = requestAnimationFrame(flush);
  }

  function subscribe(callback, { scroll = false, resize = false } = {}) {
    const subscription = { callback, scroll, resize };
    subscribers.push(subscription);
    return () => {
      const index = subscribers.indexOf(subscription);
      if (index >= 0) subscribers.splice(index, 1);
    };
  }

  window.addEventListener('scroll', () => request('scroll'), { passive: true });
  window.addEventListener('resize', () => request('resize'), { passive: true });
  window.addEventListener('orientationchange', () => request('resize'));

  return { subscribe, requestResize: () => request('resize') };
})();

if (window.__fitUnicornStages) {
  viewportFrame.subscribe(window.__fitUnicornStages, { resize: true });
}

/* One active render section at a time */
const renderSectionActivity = (() => {
  const main = document.querySelector('main');
  const sections = [...main.querySelectorAll(':scope > section')];
  const listeners = new Set();
  const warmRemovalTimers = new Map();
  const WARM_COOLDOWN = 1400;
  let activeSection = null;
  let effectiveSection = null;
  let direction = 1;
  let lastScrollY = window.scrollY;

  function sectionAtViewportCenter() {
    const centerX = Math.max(0, Math.min(window.innerWidth - 1, window.innerWidth / 2));
    const centerY = Math.max(0, Math.min(window.innerHeight - 1, window.innerHeight / 2));
    const hit = document.elementFromPoint(centerX, centerY);
    const hitSection = hit?.closest('section');
    if (hitSection && hitSection.parentElement === main) return hitSection;

    let bestSection = null;
    let bestVisibleArea = 0;
    sections.forEach(section => {
      const rect = section.getBoundingClientRect();
      const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
      const visibleArea = visibleWidth * visibleHeight;
      if (visibleArea > bestVisibleArea) {
        bestVisibleArea = visibleArea;
        bestSection = section;
      }
    });
    return bestSection;
  }

  function setSectionWarm(section, shouldWarm, immediate = false) {
    const removalTimer = warmRemovalTimers.get(section);
    if (shouldWarm) {
      if (removalTimer) clearTimeout(removalTimer);
      warmRemovalTimers.delete(section);
      section.classList.add('is-render-warm');
      return;
    }

    if (!section.classList.contains('is-render-warm')) return;
    if (immediate) {
      if (removalTimer) clearTimeout(removalTimer);
      warmRemovalTimers.delete(section);
      section.classList.remove('is-render-warm');
      return;
    }
    if (removalTimer) return;

    warmRemovalTimers.set(section, window.setTimeout(() => {
      warmRemovalTimers.delete(section);
      section.classList.remove('is-render-warm');
    }, WARM_COOLDOWN));
  }

  function syncWarmSections(immediate = false) {
    const wanted = new Set();
    if (effectiveSection) {
      const activeIndex = sections.indexOf(effectiveSection);
      wanted.add(effectiveSection);
      const nextSection = sections[activeIndex + direction];
      if (nextSection) wanted.add(nextSection);
    }

    sections.forEach(section => setSectionWarm(section, wanted.has(section), immediate));
  }

  function publish(nextSection, force = false) {
    activeSection = nextSection;
    const nextEffective = document.hidden ? null : activeSection;
    const changed = nextEffective !== effectiveSection;

    effectiveSection = nextEffective;
    if (changed || force) {
      sections.forEach(section => {
        section.classList.toggle('is-render-active', section === effectiveSection);
      });
      document.documentElement.dataset.activeRenderSection = effectiveSection?.id || '';
      listeners.forEach(listener => listener(effectiveSection));
    }
    syncWarmSections(!effectiveSection);
  }

  function update(frameState) {
    if (frameState?.scrolled) {
      const delta = frameState.scrollY - lastScrollY;
      lastScrollY = frameState.scrollY;
      if (Math.abs(delta) >= 2) direction = delta > 0 ? 1 : -1;
    }
    publish(sectionAtViewportCenter());
  }

  viewportFrame.subscribe(update, { scroll: true, resize: true });
  document.addEventListener('visibilitychange', () => {
    publish(document.hidden ? activeSection : sectionAtViewportCenter(), true);
  });

  publish(sectionAtViewportCenter(), true);

  return {
    get active() { return effectiveSection; },
    isActive(section) { return section === effectiveSection; },
    onChange(listener) {
      listeners.add(listener);
      listener(effectiveSection);
      return () => listeners.delete(listener);
    }
  };
})();

/* Keep only the active Unicorn scene and its directional neighbour warm. */
(function initUnicornSceneLifecycle() {
  const sections = [...document.querySelectorAll('main > section')];
  // A scene is named either by its Unicorn project id or, in the built
  // bundle, by a JSON file shipped alongside the page.
  const entries = [...document.querySelectorAll('[data-us-project], [data-us-project-src]')]
    .map(host => ({
      host,
      section: host.closest('section'),
      projectId: host.getAttribute('data-us-project'),
      filePath: host.getAttribute('data-us-project-src'),
      scene: null,
      promise: null,
      destroyTimer: 0,
      visible: false,
      wanted: false
    }))
    .filter(entry => entry.section && (entry.projectId || entry.filePath));
  if (!entries.length) return;

  const entryBySection = new Map(entries.map(entry => [entry.section, entry]));
  const DESTROY_DELAY = 650;
  let runtimeReady = Boolean(window.__unicornRuntimeReady && window.UnicornStudio?.addScene);
  let activeSection = renderSectionActivity.active;
  let direction = 1;
  let lastScrollY = window.scrollY;
  let navigationTarget = null;
  let navigationTimer = 0;
  let syncFrame = 0;

  function updateSceneCount() {
    document.documentElement.dataset.unicornLiveScenes = String(
      entries.filter(entry => entry.scene).length
    );
  }

  function mark(entry, state, paused = true) {
    entry.host.dataset.renderState = state;
    entry.host.dataset.renderPaused = paused ? 'true' : 'false';
  }

  function sceneOptions(entry) {
    const options = {
      element: entry.host
    };
    if (entry.filePath) options.filePath = entry.filePath;
    else options.projectId = entry.projectId;
    const ariaLabel = entry.host.getAttribute('data-us-arialabel');
    const altText = entry.host.getAttribute('data-us-alttext');
    if (ariaLabel) options.ariaLabel = ariaLabel;
    if (altText) options.altText = altText;

    ['scale', 'dpi', 'fps'].forEach(name => {
      const value = entry.host.getAttribute(`data-us-${name}`);
      if (value !== null && Number.isFinite(Number(value))) options[name] = Number(value);
    });
    return options;
  }

  function destroyEntry(entry) {
    clearTimeout(entry.destroyTimer);
    entry.destroyTimer = 0;
    if (entry.scene) {
      try { entry.scene.destroy(); }
      catch (error) { console.warn('Unicorn scene teardown failed:', error); }
      entry.scene = null;
    }
    mark(entry, 'unloaded');
    updateSceneCount();
  }

  function releaseEntry(entry) {
    if (!entry.scene && !entry.promise) {
      clearTimeout(entry.destroyTimer);
      entry.destroyTimer = 0;
      mark(entry, 'unloaded');
      return;
    }

    if (entry.scene) entry.scene.paused = true;
    mark(entry, entry.visible ? 'visible-paused' : (entry.promise ? 'loading' : 'cooling'));

    // Keep the last rendered frame while any part of its section remains
    // visible. Once fully offscreen, release its WebGL context shortly
    // after to avoid churn from tiny direction reversals at a boundary.
    if (entry.visible || entry.destroyTimer) return;
    entry.destroyTimer = window.setTimeout(() => {
      entry.destroyTimer = 0;
      if (entry.wanted || entry.visible || entry.promise) return;
      destroyEntry(entry);
    }, DESTROY_DELAY);
  }

  function applyEntryState(entry) {
    if (!entry.scene) return;
    if (!entry.wanted) {
      releaseEntry(entry);
      return;
    }

    clearTimeout(entry.destroyTimer);
    entry.destroyTimer = 0;
    const isActive = !document.hidden && entry.section === activeSection;
    entry.scene.paused = !isActive;
    mark(entry, isActive ? 'active' : 'warm', !isActive);
  }

  function ensureEntry(entry) {
    clearTimeout(entry.destroyTimer);
    entry.destroyTimer = 0;
    if (entry.scene) {
      applyEntryState(entry);
      return;
    }
    if (entry.promise || !runtimeReady) {
      mark(entry, runtimeReady ? 'loading' : 'waiting');
      return;
    }

    mark(entry, 'loading');
    entry.promise = Promise.resolve(window.UnicornStudio.addScene(sceneOptions(entry)))
      .then(scene => {
        entry.promise = null;
        entry.scene = scene;
        updateSceneCount();
        applyEntryState(entry);
      })
      .catch(error => {
        entry.promise = null;
        mark(entry, 'error');
        console.error(`Unicorn scene failed to load (${entry.section.id}):`, error);
      });
  }

  function adjacentEntry(section) {
    const index = sections.indexOf(section);
    if (index < 0) return null;
    return entryBySection.get(sections[index + direction]) || null;
  }

  function syncLifecycle() {
    syncFrame = 0;

    if (document.hidden) {
      entries.forEach(entry => {
        if (entry.scene) {
          entry.scene.paused = true;
          mark(entry, 'warm');
        }
      });
      return;
    }

    if (navigationTarget === activeSection) {
      navigationTarget = null;
      clearTimeout(navigationTimer);
      navigationTimer = 0;
    }

    const wanted = new Set();
    const activeEntry = entryBySection.get(activeSection);
    const nextEntry = adjacentEntry(activeSection);
    if (activeEntry) wanted.add(activeEntry);
    if (nextEntry) wanted.add(nextEntry);
    if (navigationTarget && entryBySection.has(navigationTarget)) {
      wanted.add(entryBySection.get(navigationTarget));
    }

    entries.forEach(entry => {
      entry.wanted = wanted.has(entry);
      if (entry.wanted) ensureEntry(entry);
      else releaseEntry(entry);
    });
  }

  function scheduleSync() {
    if (!syncFrame) syncFrame = requestAnimationFrame(syncLifecycle);
  }

  entries.forEach(entry => mark(entry, 'unloaded'));
  updateSceneCount();

  renderSectionActivity.onChange(section => {
    activeSection = section;
    scheduleSync();
  });

  viewportFrame.subscribe(({ scrollY: nextY }) => {
    const delta = nextY - lastScrollY;
    lastScrollY = nextY;
    if (Math.abs(delta) < 2) return;
    const nextDirection = delta > 0 ? 1 : -1;
    if (nextDirection !== direction) {
      direction = nextDirection;
      scheduleSync();
    }
  }, { scroll: true });

  const visibilityObserver = new IntersectionObserver(changes => {
    changes.forEach(change => {
      const entry = entryBySection.get(change.target);
      if (entry) entry.visible = change.isIntersecting;
    });
    scheduleSync();
  }, { threshold: 0 });
  entries.forEach(entry => visibilityObserver.observe(entry.section));

  // A long anchor jump can skip every intermediate section. Start its
  // scene immediately so it is ready before Lenis reaches the target.
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a[href^="#"]');
    const hash = link?.getAttribute('href');
    if (!hash || hash === '#') return;
    const target = hash === '#top'
      ? document.getElementById('landing')
      : document.querySelector(hash)?.closest('section');
    if (!target || !entryBySection.has(target)) return;

    navigationTarget = target;
    clearTimeout(navigationTimer);
    navigationTimer = window.setTimeout(() => {
      navigationTarget = null;
      navigationTimer = 0;
      scheduleSync();
    }, 8000);
    scheduleSync();
  }, true);

  window.addEventListener('unicorn-runtime-ready', () => {
    runtimeReady = true;
    scheduleSync();
  }, { once: true });
  window.addEventListener('pageshow', scheduleSync);

  scheduleSync();
})();

// In-page links are handled here so anchor movement wakes the idle Lenis ticker.
document.addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const hash = link.getAttribute('href');
  if (hash === '#' || !document.querySelector(hash)) return;
  event.preventDefault();
  history.replaceState(null, '', hash);
  lenis.scrollTo(hash);
});

/* Smooth zoom handoff between the site's main scenes */
(function initSceneTransitions() {
  const main = document.querySelector('main');
  if (!main) return;

  const definitions = [
    // Landing and Alder read as one continuous field. The depth handoff
    // starts as Alder gives way to the content-led Experience section.
    { id: 'landing' },
    { id: 'alder', ambient: '.us-scene__blend', zoom: 'out' },
    { id: 'erfaring', ambient: ':scope > .container' },
    { id: 'projects', ambient: '.projects-gallery__intro' },
    { id: 'contact', ambient: ':scope > .container' }
  ];

  const scenes = definitions.map((definition, index) => {
    const element = document.getElementById(definition.id);
    if (!element) return null;

    element.style.setProperty('--scene-drift-duration', `${9 + (index % 4) * 1.35}s`);
    element.style.setProperty('--scene-drift-delay', `${index * -1.15}s`);

    // ambient is optional: a section whose only content is a full-bleed
    // scene has nothing that can be drifted without exposing its edges.
    const ambient = definition.ambient ? element.querySelector(definition.ambient) : null;
    ambient?.classList.add('scene-ambient');

    if (!definition.zoom) return null;

    element.classList.add('scene-section');
    element.style.setProperty('--scene-layer', definitions.length - index);

    const shade = document.createElement('div');
    shade.className = 'scene-transition-shade';
    shade.setAttribute('aria-hidden', 'true');
    element.prepend(shade);

    return {
      element,
      zoomIn: definition.zoom === 'in',
      zoomOut: definition.zoom === 'out',
      current: null,
      target: null
    };
  }).filter(Boolean);

  if (!scenes.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = value => Math.min(1, Math.max(0, value));
  const easeInOut = value => value * value * (3 - 2 * value);
  let frame = 0;
  let needsMeasure = true;

  function measureScenes() {
    const viewportHeight = Math.max(window.innerHeight, 1);
    const mainTop = main.getBoundingClientRect().top + window.scrollY;
    const mobile = window.innerWidth <= 700;
    const incomingZoom = mobile ? 0.055 : 0.075;
    const outgoingZoom = mobile ? 0.085 : 0.11;

    scenes.forEach(scene => {
      const top = mainTop + scene.element.offsetTop - window.scrollY;
      const bottom = top + scene.element.offsetHeight;
      const enter = clamp((viewportHeight - top) / (viewportHeight * 0.78));
      const exit = clamp((viewportHeight * 0.92 - bottom) / (viewportHeight * 0.92));
      const enterEase = scene.zoomIn ? easeInOut(enter) : 1;
      const exitEase = scene.zoomOut ? easeInOut(exit) : 0;

      scene.target = {
        scale: 1 + (1 - enterEase) * incomingZoom - exitEase * outgoingZoom,
        y: (1 - enterEase) * (mobile ? 26 : 42) - exitEase * (mobile ? 22 : 34),
        opacity: (0.68 + enterEase * 0.32) * (1 - exitEase * 0.38),
        shade: (1 - enterEase) * 0.28 + exitEase * 0.78,
        origin: enterEase * 50 + exitEase * 50
      };

      if (!scene.current) scene.current = { ...scene.target };
    });
  }

  function paintScene(scene) {
    scene.element.style.setProperty('--scene-scale', scene.current.scale.toFixed(5));
    scene.element.style.setProperty('--scene-y', `${scene.current.y.toFixed(2)}px`);
    scene.element.style.setProperty('--scene-opacity', scene.current.opacity.toFixed(4));
    scene.element.style.setProperty('--scene-shade', scene.current.shade.toFixed(4));
    scene.element.style.setProperty('--scene-origin-y', `${scene.current.origin.toFixed(2)}%`);
  }

  function resetScenes() {
    scenes.forEach(scene => {
      scene.current = null;
      scene.target = null;
      scene.element.classList.remove('is-frame-animating');
      ['--scene-scale', '--scene-y', '--scene-opacity', '--scene-shade', '--scene-origin-y']
        .forEach(property => scene.element.style.removeProperty(property));
    });
  }

  function animateScenes() {
    frame = 0;
    if (reduceMotion.matches) {
      resetScenes();
      return;
    }

    if (needsMeasure) {
      measureScenes();
      needsMeasure = false;
    }

    let moving = false;
    scenes.forEach(scene => {
      const speed = 0.14;
      Object.keys(scene.target).forEach(key => {
        const difference = scene.target[key] - scene.current[key];
        scene.current[key] += difference * speed;
        if (Math.abs(difference) > (key === 'y' || key === 'origin' ? 0.04 : 0.0005)) moving = true;
      });
      paintScene(scene);
    });

    if (moving || needsMeasure) {
      frame = requestAnimationFrame(animateScenes);
    } else {
      scenes.forEach(scene => scene.element.classList.remove('is-frame-animating'));
    }
  }

  function requestSceneUpdate(runInSharedFrame = false) {
    needsMeasure = true;
    scenes.forEach(scene => {
      const nearViewport = scene.element.classList.contains('is-render-active') ||
        scene.element.classList.contains('is-render-warm');
      scene.element.classList.toggle('is-frame-animating', nearViewport);
    });
    if (frame) return;
    if (runInSharedFrame) animateScenes();
    else frame = requestAnimationFrame(animateScenes);
  }

  viewportFrame.subscribe(() => requestSceneUpdate(true), { scroll: true, resize: true });
  reduceMotion.addEventListener?.('change', () => requestSceneUpdate());
  requestSceneUpdate();
})();

/* Build expensive scroll effects only while the browser has idle time. */
const idleWork = (() => {
  const tasks = [];
  let handle = 0;

  function flush(deadline) {
    handle = 0;
    do {
      const task = tasks.shift();
      task?.();
    } while (tasks.length && deadline.timeRemaining() > 6);
    schedule();
  }

  function schedule() {
    if (handle || !tasks.length) return;
    if ('requestIdleCallback' in window) {
      handle = window.requestIdleCallback(flush, { timeout: 700 });
    } else {
      handle = window.setTimeout(() => flush({ timeRemaining: () => 12 }), 48);
    }
  }

  function add(task) {
    tasks.push(task);
    schedule();
  }

  return { add };
})();

let scrollTriggerRefreshFrame = 0;
function requestScrollTriggerRefresh() {
  if (scrollTriggerRefreshFrame) return;
  scrollTriggerRefreshFrame = requestAnimationFrame(() => {
    scrollTriggerRefreshFrame = 0;
    ScrollTrigger.refresh();
  });
}

/* ─── Scroll reveal + headline split ───── */
(function initScrollReveals() {
  if (prefersReducedMotion.matches) return;

  idleWork.add(() => {
    // Batch groups everything entering on the same frame, preserving the
    // original reveal timing while doing the setup before interaction.
    ScrollTrigger.batch('.reveal', {
      start: 'top 88%',
      once: true,
      onEnter: batch => {
        batch.forEach(el => el.classList.add('visible'));
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.95,
          ease: 'power3.out',
          stagger: 0.08,
          overwrite: true
        });
      }
    });

    requestScrollTriggerRefresh();
  });

  // SplitText still waits for the real fonts, then builds during idle
  // rather than while the visitor is entering each section.
  document.fonts.ready.then(() => {
    idleWork.add(() => {
      gsap.utils.toArray('.section__title:not(#erfaring-h)').forEach(title => {
        SplitText.create(title, {
          type: 'lines,chars',
          mask: 'lines',
          autoSplit: true,
          onSplit: self => gsap.from(self.chars, {
            yPercent: 110,
            opacity: 0,
            duration: 0.85,
            ease: 'power3.out',
            stagger: 0.018,
            scrollTrigger: { trigger: title, start: 'top 85%', once: true }
          })
        });
      });
      requestScrollTriggerRefresh();
    });
  });
})();

/* ─── Contact form (Formsubmit.co via AJAX) ── */
// Guarded: the standalone Erfaring page ships the same bundle without a form.
const cForm = document.getElementById('cForm');
const cBtn  = document.getElementById('cFormBtn');
const btnDefault = cBtn ? cBtn.innerHTML : '';

if (cForm && cBtn) cForm.addEventListener('submit', e => {
  e.preventDefault();

  /* Basic client-side validation */
  const name  = cForm.querySelector('#f-name').value.trim();
  const email = cForm.querySelector('#f-email').value.trim();
  const msg   = cForm.querySelector('#f-msg').value.trim();
  if (!name || !email || !msg) { return; }

  /* Show loading state */
  cBtn.disabled = true;
  cBtn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px">Sender…<span class="spinner" style="width:14px;height:14px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;display:inline-block;animation:spin .6s linear infinite"></span></span>';

  /* Send to Formsubmit.co AJAX endpoint */
  fetch(cForm.action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(Object.fromEntries(new FormData(cForm)))
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      cBtn.innerHTML = 'Sendt! ✓';
      cBtn.style.background = 'var(--green-mid)';
      cForm.reset();
      setTimeout(() => { cBtn.innerHTML = btnDefault; cBtn.disabled = false; cBtn.style.background = ''; }, 4000);
    } else {
      throw new Error('Submission failed');
    }
  })
  .catch(() => {
    cBtn.innerHTML = 'Feil — prøv igjen';
    cBtn.style.background = '#b04040';
    setTimeout(() => { cBtn.innerHTML = btnDefault; cBtn.disabled = false; cBtn.style.background = ''; }, 4000);
  });
});

/* ─── Kontakt backdrop video ───────────── */
// The clip is preload="none", so nothing is fetched until the reader is
// nearly at the section, and it stops again the moment they scroll past or
// leave the tab — a background should never cost anything while unwatched.
(function initContactBackdrop() {
  const video = document.querySelector('.contact__video');
  if (!video) return;

  // Reduced motion keeps the poster frame and never starts the clip at all,
  // and so does a metered connection — 830 kB of decoration is not worth
  // spending on someone's data plan.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (navigator.connection?.saveData) return;

  let onScreen = false;

  function sync() {
    // play() rejects if the browser declines autoplay; the poster stands in.
    if (onScreen && !document.hidden) video.play().catch(() => {});
    else video.pause();
  }

  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  }, { rootMargin: '300px 0px' }).observe(video);

  document.addEventListener('visibilitychange', sync);
})();

/* ─── Shared firefly glow sprite cache ─── */
const _glowSpriteCache = new Map();
function makeGlowSprite(r, g, b) {
  const key = `${r},${g},${b}`;
  if (_glowSpriteCache.has(key)) return _glowSpriteCache.get(key);
  const s = 48;
  const d = s * 2;
  const oc = document.createElement('canvas');
  oc.width = oc.height = d;
  const oct = oc.getContext('2d');
  const grad = oct.createRadialGradient(s, s, 0, s, s, s);
  grad.addColorStop(0,   `rgba(${r},${g},${b},0.7)`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},0.15)`);
  grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
  oct.fillStyle = grad;
  oct.fillRect(0, 0, d, d);
  const entry = { canvas: oc, half: s };
  _glowSpriteCache.set(key, entry);
  return entry;
}


/* ─── Erfaring ambient fireflies ──────── */
(function initErfaringFireflies() {
  const section = document.querySelector('.erfaring');
  const canvas  = document.getElementById('erfaringCanvas');
  if (!section || !canvas) return;

  const ctx = canvas.getContext('2d');
  let flies = [], animId = null, started = false;
  let sectionIntersecting = false;
  let sectionVisible = false;

  const ffColors = [
    { r: 184, g: 210, b: 160 },
    { r: 132, g: 196, b: 154 },
    { r: 200, g: 230, b: 208 },
    { r: 220, g: 200, b: 140 },
    { r: 160, g: 210, b: 170 },
    { r: 210, g: 195, b: 148 },
  ];

  function resize() {
    const r = section.getBoundingClientRect();
    canvas.width  = r.width;
    canvas.height = r.height;
  }

  class Fly {
    constructor() {
      const w = canvas.width, h = canvas.height;
      this.x = Math.random() * w;
      this.y = Math.random() * h;
      this.size = Math.random() * 1.6 + 0.7;
      this.baseAlpha = Math.random() * 0.3 + 0.12;
      this.alpha = 0;
      this.targetAlpha = this.baseAlpha;
      this.color = ffColors[Math.floor(Math.random() * ffColors.length)];
      this.glowSprite = makeGlowSprite(this.color.r, this.color.g, this.color.b);
      this.vx = (Math.random() - 0.5) * 0.22;
      this.vy = (Math.random() - 0.5) * 0.16;
      this.phase = Math.random() * Math.PI * 2;
      this.pulseSpeed = Math.random() * 0.014 + 0.005;
      this.glowSize = this.size * (Math.random() * 5 + 7);
      this.w = w; this.h = h;
    }
    update() {
      this.phase += this.pulseSpeed;
      this.alpha += (this.targetAlpha - this.alpha) * 0.025;
      const pulse = Math.sin(this.phase) * 0.5 + 0.5;
      this.x += Math.sin(this.phase * 0.7) * 0.32 + this.vx;
      this.y += Math.cos(this.phase * 0.5) * 0.22 + this.vy;
      if (this.x < -20) this.x = this.w + 20;
      if (this.x > this.w + 20) this.x = -20;
      if (this.y < -20) this.y = this.h + 20;
      if (this.y > this.h + 20) this.y = -20;
      return pulse;
    }
    draw(pulse) {
      const a = this.alpha * (0.35 + pulse * 0.65);
      if (a < 0.01) return;
      const g = this.glowSize;
      ctx.globalAlpha = a;
      ctx.drawImage(this.glowSprite.canvas, this.x - g, this.y - g, g * 2, g * 2);
      ctx.globalAlpha = 1;
      const { r, g: cg, b } = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * (0.7 + pulse * 0.3), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${Math.min(r+40,255)},${Math.min(cg+40,255)},${Math.min(b+20,255)},${a})`;
      ctx.fill();
    }
  }

  function initFlies() {
    resize();
    flies = [];
    const count = Math.min(Math.floor(canvas.width / 20), 48);
    for (let i = 0; i < count; i++) {
      const f = new Fly();
      f.phase = Math.random() * Math.PI * 2;
      flies.push(f);
    }
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    flies.forEach(f => { const p = f.update(); f.draw(p); });
    animId = sectionVisible ? requestAnimationFrame(animate) : null;
  }

  function syncSectionActivity(activeSection = renderSectionActivity.active) {
    const nextVisible = sectionIntersecting && activeSection === section;
    if (nextVisible === sectionVisible) return;
    sectionVisible = nextVisible;

    if (!sectionVisible && animId) {
      cancelAnimationFrame(animId);
      animId = null;
      return;
    }

    if (sectionVisible && !started) {
      started = true;
      section.classList.add('erf-alive');
      initFlies();
      flies.forEach(f => { f.targetAlpha = f.baseAlpha; });
    }
    if (sectionVisible && !animId && started) animate();
  }

  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      sectionIntersecting = e.isIntersecting;
      syncSectionActivity();
    });
  }, { threshold: 0.08 });

  obs.observe(section);
  renderSectionActivity.onChange(syncSectionActivity);

  viewportFrame.subscribe(() => {
    if (flies.length) {
      resize();
      flies.forEach(f => { f.w = canvas.width; f.h = canvas.height; });
    }
  }, { resize: true });
})();

/* ─── Compositor-only project carousel ────── */
(function initProjectCarousel() {
  const track = document.querySelector('#projects .projects-gallery__track');
  const sourceGroup = track?.querySelector('.projects-gallery__group');
  if (!track || !sourceGroup || track.classList.contains('is-carousel-ready')) return;

  const duplicateGroup = sourceGroup.cloneNode(true);
  duplicateGroup.setAttribute('aria-hidden', 'true');
  duplicateGroup.removeAttribute('role');
  duplicateGroup.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  duplicateGroup.querySelectorAll('[aria-labelledby]').forEach(element => element.removeAttribute('aria-labelledby'));
  duplicateGroup.querySelectorAll('a').forEach(link => link.setAttribute('tabindex', '-1'));
  duplicateGroup.querySelectorAll('.reveal').forEach(element => {
    element.classList.remove('reveal');
    element.style.removeProperty('opacity');
    element.style.removeProperty('visibility');
    element.style.removeProperty('transform');
  });

  track.prepend(duplicateGroup);
  track.classList.add('is-carousel-ready');
})();

/* ─── Project card videos ─────────────────── */
// Placed after the carousel has cloned its group, so the duplicate's copies
// are wired up as well. Both copies of a clip share one URL, so the browser
// downloads each file once however many elements point at it.
//
// Nothing is fetched until the gallery is near the viewport, and everything
// stops again when it leaves or the tab is hidden — four small decodes are
// cheap while they are being watched and pure waste when they are not.
(function initProjectVideos() {
  const section = document.getElementById('projects');
  const videos = [...document.querySelectorAll('.project-visual__video')];
  if (!section || !videos.length) return;

  // Reduced motion and metered connections keep the poster frames.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (navigator.connection?.saveData) return;

  let onScreen = false;

  function sync() {
    videos.forEach(video => {
      // Cloned nodes carry the attribute but not always the property, and
      // autoplay is refused without it.
      video.muted = true;
      if (onScreen && !document.hidden) video.play().catch(() => {});
      else video.pause();
    });
  }

  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    sync();
  }, { rootMargin: '300px 0px' }).observe(section);

  document.addEventListener('visibilitychange', sync);
})();

/* ─── Smooth carousel braking ─────────────── */
(function initProjectCarouselBraking() {
  const section = document.getElementById('projects');
  const track = section?.querySelector('.projects-gallery__track');
  if (!section || !track || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let rampFrame = 0;
  let releaseTimer = 0;

  function getCarouselAnimation() {
    return track.getAnimations().find(animation => animation.animationName === 'projectsCarouselRight');
  }

  function rampPlayback(targetRate, duration) {
    if (rampFrame) cancelAnimationFrame(rampFrame);
    rampFrame = 0;

    const animation = getCarouselAnimation();
    if (!animation) return;

    const fromRate = Number.isFinite(animation.playbackRate) ? animation.playbackRate : 1;
    if (targetRate > 0 && animation.playState === 'paused') {
      animation.playbackRate = Math.max(0.001, fromRate);
      animation.play();
    }

    const startedAt = performance.now();

    function step(now) {
      if (!section.classList.contains('is-render-active') || animation.playState === 'idle') {
        rampFrame = 0;
        return;
      }

      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress * progress * (3 - 2 * progress);
      const nextRate = fromRate + (targetRate - fromRate) * eased;
      animation.playbackRate = Math.max(0.001, nextRate);

      if (progress < 1) {
        rampFrame = requestAnimationFrame(step);
        return;
      }

      rampFrame = 0;
      if (targetRate === 0) {
        animation.pause();
        animation.playbackRate = 0;
      } else {
        animation.playbackRate = 1;
      }
    }

    rampFrame = requestAnimationFrame(step);
  }

  function slowStop() {
    clearTimeout(releaseTimer);
    rampPlayback(0, 1100);
  }

  function slowResume() {
    clearTimeout(releaseTimer);
    rampPlayback(1, 850);
  }

  function resumeAfterTouch() {
    clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(slowResume, 1200);
  }

  section.querySelectorAll('.project-card__tilt').forEach(surface => {
    surface.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') slowStop();
    }, { passive: true });
    surface.addEventListener('pointerleave', event => {
      if (event.pointerType !== 'touch') slowResume();
    }, { passive: true });
    surface.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') slowStop();
    }, { passive: true });
    surface.addEventListener('pointerup', event => {
      if (event.pointerType === 'touch') resumeAfterTouch();
    }, { passive: true });
    surface.addEventListener('pointercancel', event => {
      if (event.pointerType === 'touch') resumeAfterTouch();
    }, { passive: true });
  });
})();

/* ─── Magnetic links ──────────────────── */
(function initMagnetic() {
  if (window.innerWidth < 768) return;
  const magnets = document.querySelectorAll('[data-magnetic]');
  const rects = new Map();

  function measureMagnets() {
    magnets.forEach(el => rects.set(el, el.getBoundingClientRect()));
  }

  measureMagnets();
  viewportFrame.subscribe(measureMagnets, { resize: true });

  magnets.forEach(el => {
    el.addEventListener('mouseenter', () => rects.set(el, el.getBoundingClientRect()));

    el.addEventListener('mousemove', e => {
      const rect = rects.get(el);
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      el.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
    });

    el.addEventListener('mouseleave', () => {
      el.style.transform = 'translate(0, 0)';
    });
  });
})();

/* ─── Interactive side leaves ──────────── */
(function buildSideLeaves() {
  const container = document.getElementById('side-leaves');
  if (!window.matchMedia('(pointer: fine) and (hover: hover)').matches) return;

  /* Leaf shape templates — drawn from left-centre origin so rotation looks natural */
  const shapes = [
    /* Rounded laurel leaf */
    (s) => `<svg width="${s}" height="${s * 1.6}" viewBox="0 0 40 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 60 C8 48, 4 32, 10 18 C13 10, 20 4, 20 4 C20 4, 27 10, 30 18 C36 32, 32 48, 20 60Z" fill="FILL" opacity="OP"/>
  <line x1="20" y1="4" x2="20" y2="60" stroke="VEIN" stroke-width="0.8"/>
  <path d="M20 20 Q14 26, 11 34" stroke="VEIN" stroke-width="0.5" fill="none"/>
  <path d="M20 20 Q26 26, 29 34" stroke="VEIN" stroke-width="0.5" fill="none"/>
  <path d="M20 36 Q15 41, 13 48" stroke="VEIN" stroke-width="0.4" fill="none"/>
  <path d="M20 36 Q25 41, 27 48" stroke="VEIN" stroke-width="0.4" fill="none"/>
</svg>`,
    /* Narrow willow leaf */
    (s) => `<svg width="${s * 0.55}" height="${s * 1.8}" viewBox="0 0 22 72" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M11 68 C5 52, 3 36, 7 20 C8 14, 11 4, 11 4 C11 4, 14 14, 15 20 C19 36, 17 52, 11 68Z" fill="FILL" opacity="OP"/>
  <line x1="11" y1="4" x2="11" y2="68" stroke="VEIN" stroke-width="0.6"/>
</svg>`,
    /* Oak-ish lobed leaf */
    (s) => `<svg width="${s}" height="${s * 1.3}" viewBox="0 0 48 62" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M24 58 C12 46, 6 36, 8 26 C9 20, 6 14, 10 10 C14 6, 18 10, 22 8 C22 8, 24 4, 24 4 C24 4, 26 8, 26 8 C30 10, 34 6, 38 10 C42 14, 39 20, 40 26 C42 36, 36 46, 24 58Z" fill="FILL" opacity="OP"/>
  <line x1="24" y1="4" x2="24" y2="58" stroke="VEIN" stroke-width="0.8"/>
  <path d="M24 22 Q18 28, 13 30" stroke="VEIN" stroke-width="0.5" fill="none"/>
  <path d="M24 22 Q30 28, 35 30" stroke="VEIN" stroke-width="0.5" fill="none"/>
  <path d="M24 38 Q18 43, 15 48" stroke="VEIN" stroke-width="0.4" fill="none"/>
  <path d="M24 38 Q30 43, 33 48" stroke="VEIN" stroke-width="0.4" fill="none"/>
</svg>`,
  ];

  const palette = [
    { fill: '#5a9e6f', vein: '#3d7a52', op: '0.55' },
    { fill: '#84c49a', vein: '#5a9e6f', op: '0.45' },
    { fill: '#3d7a52', vein: '#2a5438', op: '0.5' },
    { fill: '#a8d5b5', vein: '#6fa882', op: '0.4' },
    { fill: '#c8e6d0', vein: '#84c49a', op: '0.35' },
    { fill: '#8a7240', vein: '#5c4a28', op: '0.3' }, /* occasional golden */
  ];

  /* Config: leaves placed along left & right edges at various heights */
  const configs = [
    /* LEFT SIDE — peek from left edge, anchor point is left */
    { side: 'left', top: '8%', rot: -20, size: 60, shape: 0, colorIdx: 0 },
    { side: 'left', top: '22%', rot: -30, size: 44, shape: 1, colorIdx: 2 },
    { side: 'left', top: '38%', rot: -15, size: 72, shape: 2, colorIdx: 1 },
    { side: 'left', top: '54%', rot: -25, size: 50, shape: 0, colorIdx: 4 },
    { side: 'left', top: '70%', rot: -18, size: 38, shape: 1, colorIdx: 3 },
    { side: 'left', top: '85%', rot: -35, size: 64, shape: 2, colorIdx: 5 },
    /* RIGHT SIDE — peek from right edge, mirrored */
    { side: 'right', top: '12%', rot: 20, size: 58, shape: 0, colorIdx: 1 },
    { side: 'right', top: '28%', rot: 28, size: 46, shape: 2, colorIdx: 0 },
    { side: 'right', top: '44%', rot: 16, size: 68, shape: 1, colorIdx: 4 },
    { side: 'right', top: '60%', rot: 22, size: 52, shape: 0, colorIdx: 2 },
    { side: 'right', top: '75%', rot: 32, size: 40, shape: 2, colorIdx: 3 },
    { side: 'right', top: '90%', rot: 18, size: 66, shape: 1, colorIdx: 5 },
  ];

  const leafEls = [];

  configs.forEach((cfg, i) => {
    const c = palette[cfg.colorIdx];
    const tmpl = shapes[cfg.shape];
    let svgStr = tmpl(cfg.size)
      .replace(/FILL/g, c.fill)
      .replace(/VEIN/g, c.vein)
      .replace(/OP/g, c.op);

    const el = document.createElement('div');
    el.className = 'side-leaf is-entering';

    /* Position & base transform */
    const isLeft = cfg.side === 'left';
    el.style.top = cfg.top;

    /* leaves extend slightly off-screen edge so only tip is visible */
    if (isLeft) {
      el.style.left = '0';
      el.style.transformOrigin = 'left center';
      el.style.transform = `rotate(${cfg.rot}deg) translateX(-55%)`;
    } else {
      el.style.right = '0';
      el.style.transformOrigin = 'right center';
      /* mirror the SVG horizontally */
      svgStr = svgStr.replace('<svg ', `<svg style="transform:scaleX(-1)" `);
      el.style.transform = `rotate(${cfg.rot}deg) translateX(55%)`;
    }

    el.innerHTML = svgStr;

    /* Gentle perpetual sway */
    const svg = el.querySelector('svg');
    svg.style.animation = `leafWave ${3.5 + i * 0.4}s ease-in-out infinite`;
    svg.style.setProperty('--base-rot', cfg.rot + 'deg');
    svg.style.transformOrigin = isLeft ? 'left center' : 'right center';
    svg.style.display = 'block';

    container.appendChild(el);
    leafEls.push({ el, cfg, isLeft });

    /* Fade in after brief stagger, then release the temporary layer. */
    const revealDelay = 300 + i * 80;
    const finishEntrance = () => el.classList.remove('is-entering');
    el.addEventListener('transitionend', event => {
      if (event.propertyName === 'opacity') finishEntrance();
    }, { once: true });
    setTimeout(() => el.classList.add('visible'), revealDelay);
    setTimeout(finishEntrance, revealDelay + 1300);
  });

  /* Mouse parallax — leaves breathe slightly toward cursor */
  let targetX = 0, targetY = 0, curX = 0, curY = 0;
  let leafSettled = true;
  let leafFrame = 0;

  document.addEventListener('mousemove', e => {
    targetX = (e.clientX / window.innerWidth - 0.5);
    targetY = (e.clientY / window.innerHeight - 0.5);
    leafSettled = false;
    container.classList.add('is-moving');
    if (!leafFrame) leafFrame = requestAnimationFrame(animLeaves);
  });

  function animLeaves() {
    leafFrame = 0;
    if (leafSettled) {
      container.classList.remove('is-moving');
      return;
    }

    curX += (targetX - curX) * 0.04;
    curY += (targetY - curY) * 0.04;

    const dxRemain = Math.abs(targetX - curX);
    const dyRemain = Math.abs(targetY - curY);
    if (dxRemain < 0.0005 && dyRemain < 0.0005) {
      curX = targetX;
      curY = targetY;
      leafSettled = true;
    }

    leafEls.forEach(({ el, cfg, isLeft }) => {
      const shiftX = curX * (isLeft ? -18 : 18);
      const shiftY = curY * 10;
      const rotDelta = curX * (isLeft ? -4 : 4);
      const peekPct = isLeft
        ? `translateX(calc(-55% + ${shiftX}px))`
        : `translateX(calc(55% + ${shiftX}px))`;
      el.style.transform = `rotate(${cfg.rot + rotDelta}deg) ${peekPct} translateY(${shiftY}px)`;
    });

    if (!leafSettled) leafFrame = requestAnimationFrame(animLeaves);
    else container.classList.remove('is-moving');
  }

})();
