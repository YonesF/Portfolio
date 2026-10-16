/* ══ Erfaring ═══════════════════════════════════
   The experience section of the front page (#erfaring), once a page of its
   own. Progressive enhancement: the HTML remains a complete, printable
   experience list without JavaScript. Tabs only hide panels after their
   controls exist. */

(function initExperience() {
  const section = document.getElementById('erfaring');
  if (!section) return;

  const root = document.documentElement;
  const tablist = section.querySelector('.project-tabs');
  const tabs = [...section.querySelectorAll('.project-tab')];
  const panels = tabs.map(tab => document.querySelector(tab.getAttribute('href')));
  const position = section.querySelector('.project-position');
  const pagination = section.querySelector('.project-pagination');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 760px)');
  let active = 0;

  /* ── The opening ─────────────────────────
     The title rises when the section is scrolled to rather than when the
     page loads, far out of sight; the line under it only fades while the
     opening is on screen (erfaring.css). */
  const hero = section.querySelector('.hero');
  if (hero && 'IntersectionObserver' in window && !reduced.matches) {
    hero.classList.add('is-armed');
    new IntersectionObserver(([entry]) => {
      hero.classList.toggle('in-view', entry.isIntersecting);
      if (entry.isIntersecting) hero.classList.add('is-in');
    }, { threshold: 0.2 }).observe(hero);
  }

  /* ── The experience browser ──────────── */
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
  // An address naming a panel opens it. Any other (#alder, #projects, …)
  // belongs to the rest of the page and leaves the choice as it is.
  function fromHash() {
    const index = panels.findIndex(panel => `#${panel.id}` === location.hash);
    if (index >= 0) select(index);
  }
  root.classList.add('has-experience-tabs');
  select(0);
  fromHash();
  pagination.hidden = false;
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('popstate', fromHash);
  section.querySelector('.next-project').addEventListener('click', () => {
    select(active + 1, { history: true });
    panels[active].focus({ preventScroll: true });
    // Through Lenis where the page has it (site.js), so the two never pull
    // the scroll position in different directions.
    if (window.__scrollToElement) window.__scrollToElement(panels[active]);
    else panels[active].scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth', block: 'start' });
  });

  // Demos are deliberately opt-in: no competing autoplay or hidden downloads.
  section.querySelectorAll('.project-media').forEach(figure => {
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
  const videos = () => section.querySelectorAll('.project-media video');
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) videos().forEach(video => video.pause());
  });
  reduced.addEventListener('change', () => {
    if (reduced.matches) videos().forEach(video => video.pause());
  });

  /* ── Reveals ─────────────────────────── */
  if ('IntersectionObserver' in window) {
    const reveals = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      reveals.unobserve(entry.target);
    }), { threshold: 0.05 });
    section.querySelectorAll('[data-reveal]').forEach(element => {
      if (element.getBoundingClientRect().top > window.innerHeight && !reduced.matches) element.classList.add('will-reveal');
      reveals.observe(element);
    });
  }
})();
