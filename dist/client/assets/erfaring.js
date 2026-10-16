/* ══ Erfaring scene ═══════════════════════════
   The Unicorn Studio scene that opens the page. scenes.js has fetched it
   and is loading the Unicorn runtime; this starts the scene once the
   runtime is in, standing in for the scene handling in site.js, which this
   page does without.

   The scene is drawn at the size it is shown rather than at the 1.5
   pixels per CSS pixel it was exported at, unless the machine has a
   dedicated graphics card (perf.js's 'fine'). On a phone the stage is
   cropped far wider than the screen, so it is drawn coarser still, and on
   a machine that falls behind (perf.js's lite levels) it runs at half the
   frame rate.

   It only moves while the opening is on screen. The experience browser
   pauses it below the hero and in hidden tabs. Visitors who request
   reduced motion get its first frame, held. */

(function initErfaringScene() {
  const host = document.querySelector('.erf-scene__stage');
  if (!host) return;

  const perf = window.__perf;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = window.matchMedia('(max-width: 767px)');
  let scene = null;
  let storyActive = false;

  function sceneDpi() {
    const tier = perf ? perf.tier : 'normal';
    if (tier === 'fine') return 1.5;
    const dpi = tier === 'lowest' ? 0.75 : 1;
    return narrow.matches ? Math.min(dpi, 0.75) : dpi;
  }

  function sceneFps() {
    return perf && perf.lite ? 30 : 60;
  }

  function settle() {
    if (scene) scene.paused = reducedMotion.matches || storyActive || document.hidden;
  }

  function start() {
    const prefetched = window.__unicornSceneData?.(host) || Promise.resolve(null);
    prefetched
      .then(data => {
        const options = { element: host, dpi: sceneDpi(), fps: sceneFps() };
        // scenes.js hands the scene over inline; without it the runtime
        // fetches the cacheable copy itself.
        if (data?.source) {
          options.filePath = data.source;
        } else {
          options.projectId = host.getAttribute('data-us-project');
          options.production = true;
        }
        return Promise.resolve(window.UnicornStudio.addScene(options)).then(created => {
          scene = created;
          return data?.ready;
        });
      })
      .then(() => {
        // Two frames for the runtime to upload its textures before the
        // canvas fades up (erfaring.css).
        requestAnimationFrame(() => requestAnimationFrame(() => {
          host.dataset.sceneReady = '';
          settle();
          // Now there is real drawing to time (assets/perf.js).
          if (!scene.paused) perf?.probe();
        }));
      })
      .catch(error => console.error('Unicorn scene failed to load (erfaring):', error));
  }

  // A scene keeps the resolution it was created with, so it is re-tuned
  // when perf.js moves the page to another level or the window crosses
  // into phone width. This reaches into the runtime, whose canvas takes
  // its size from curtain.pixelRatio on every resize; guarded, so a
  // runtime that works differently simply keeps the scene as created.
  function tune() {
    if (!scene) return;
    try {
      const fps = sceneFps();
      if (scene.fps !== fps) {
        scene.fps = fps;
        scene.frameDuration = 1000 / fps;
      }
      const dpi = sceneDpi();
      if (!scene.curtain || typeof scene.refresh !== 'function' || Math.abs(dpi - scene.dpi) < 0.05) return;
      scene.dpi = dpi;
      scene.curtain.pixelRatio = dpi;
      // refresh(), not resize(): the runtime draws the still layers (the
      // photographs) once and keeps them in buffers that a bare resize()
      // reallocates empty, leaving the scene black (see site.js).
      scene.refresh();
    } catch (error) {
      console.warn('Unicorn scene could not be re-tuned:', error);
    }
  }

  perf?.onChange(tune);
  narrow.addEventListener('change', tune);
  reducedMotion.addEventListener('change', settle);
  document.addEventListener('visibilitychange', settle);
  window.addEventListener('erfaring:story', event => {
    storyActive = Boolean(event.detail?.active);
    settle();
  });

  if (window.__unicornRuntimeReady && window.UnicornStudio?.addScene) start();
  else window.addEventListener('unicorn-runtime-ready', start, { once: true });
})();

/* Progressive enhancement: the HTML remains a complete, printable experience
   list without JavaScript. Tabs only hide panels after their controls exist. */
(function initExperiencePage() {
  const root = document.documentElement;
  const tablist = document.querySelector('.project-tabs');
  const tabs = [...document.querySelectorAll('.project-tab')];
  const panels = tabs.map(tab => document.querySelector(tab.getAttribute('href')));
  const position = document.querySelector('.project-position');
  const pagination = document.querySelector('.project-pagination');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 760px)');
  let active = 0;

  function select(index, { focus = false, history = false } = {}) {
    active = (index + tabs.length) % tabs.length;
    tabs.forEach((tab, i) => {
      const selected = i === active;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panels[i].hidden = !selected;
      if (!selected) panels[i].querySelector('video')?.pause();
    });
    position.textContent = `${String(active + 1).padStart(2, '0')} / 04`;
    if (focus) tabs[active].focus({ preventScroll: true });
    if (history && location.hash !== `#${panels[active].id}`) {
      window.history.pushState(null, '', `#${panels[active].id}`);
    }
  }

  tablist.setAttribute('role', 'tablist');
  function orient() { tablist.setAttribute('aria-orientation', mobile.matches ? 'horizontal' : 'vertical'); }
  orient();
  mobile.addEventListener('change', orient);
  tabs.forEach((tab, i) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[i].id);
    panels[i].setAttribute('role', 'tabpanel');
    panels[i].setAttribute('aria-labelledby', tab.id);
    panels[i].tabIndex = 0;
    tab.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      select(i, { history: true });
    });
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = active + 1;
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = active - 1;
      else if (event.key === ' ') next = i;
      else return;
      event.preventDefault();
      select(next, { focus: true, history: true });
    });
  });
  function fromHash() {
    const index = panels.findIndex(panel => `#${panel.id}` === location.hash);
    if (index >= 0) select(index);
    else select(0);
  }
  root.classList.add('has-experience-tabs');
  fromHash();
  pagination.hidden = false;
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('popstate', fromHash);
  document.querySelector('.next-project').addEventListener('click', () => {
    select(active + 1, { history: true });
    panels[active].focus({ preventScroll: true });
    panels[active].scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' });
  });

  // Demos are deliberately opt-in: no competing autoplay or hidden downloads.
  document.querySelectorAll('.project-media').forEach(figure => {
    const video = figure.querySelector('video');
    const button = figure.querySelector('.media-toggle');
    let request = 0;
    button.hidden = false;
    const update = () => {
      button.innerHTML = video.paused ? 'Spill av demo <span aria-hidden="true">▶</span>' : 'Pause demo <span aria-hidden="true">Ⅱ</span>';
      button.setAttribute('aria-pressed', String(!video.paused));
    };
    update();
    video.addEventListener('play', update);
    video.addEventListener('pause', update);
    video.addEventListener('error', () => {
      button.textContent = 'Demo utilgjengelig';
      button.disabled = true;
    });
    button.addEventListener('click', async () => {
      if (!video.paused) { video.pause(); return; }
      const current = ++request;
      button.disabled = true;
      button.textContent = 'Laster demo…';
      try { await video.play(); }
      catch { update(); }
      finally {
        button.disabled = Boolean(video.error);
        if (current === request && video.closest('.experience').hidden) video.pause();
      }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) video.pause();
      }).observe(figure);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) document.querySelectorAll('.project-media video').forEach(video => video.pause());
  });
  reduced.addEventListener('change', () => {
    if (reduced.matches) document.querySelectorAll('.project-media video').forEach(video => video.pause());
  });

  if ('IntersectionObserver' in window) {
    const reveals = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      reveals.unobserve(entry.target);
    }), { threshold: 0.05 });
    document.querySelectorAll('[data-reveal]').forEach(element => {
      if (element.getBoundingClientRect().top > window.innerHeight && !reduced.matches) element.classList.add('will-reveal');
      reveals.observe(element);
    });
  }

  const progress = document.querySelector('.reading-progress');
  const hero = document.querySelector('.hero');
  let scheduled = false;
  let wasActive = false;
  function onScroll() {
    scheduled = false;
    const range = root.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${range > 0 ? Math.max(0, Math.min(1, window.scrollY / range)) : 0})`;
    const away = window.scrollY > hero.offsetHeight * .55;
    root.classList.toggle('is-scrolled', away);
    if (away !== wasActive) {
      wasActive = away;
      window.dispatchEvent(new CustomEvent('erfaring:story', { detail: { active: away } }));
    }
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(onScroll); } }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  onScroll();
})();
