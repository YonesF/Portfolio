/* Small enhancements only: every section, link and demo works without these. */
(() => {
  /* ── The sticky menu marks the section being read ── */
  const nav = document.querySelector('.portfolio-nav');
  if (nav) {
    const links = [...nav.querySelectorAll('a[href^="#"]')]
      .filter(link => link.getAttribute('href') !== '#top');
    const sections = links.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
    let frame = 0;

    function updateNavigation() {
      frame = 0;
      const threshold = nav.offsetHeight + window.innerHeight * 0.3;
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const active = atBottom ? sections.at(-1) : sections.filter(section => section.getBoundingClientRect().top <= threshold).at(-1);
      links.forEach(link => {
        if (active && link.getAttribute('href') === `#${active.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }

    function scheduleNavigation() {
      if (!frame) frame = requestAnimationFrame(updateNavigation);
    }

    window.addEventListener('scroll', scheduleNavigation, { passive: true });
    window.addEventListener('resize', scheduleNavigation, { passive: true });
    updateNavigation();
  }

  document.querySelector('.pf-skip-link')?.addEventListener('click', () => {
    document.getElementById('alder')?.focus({ preventScroll: true });
  });

  /* ── Arbeid, Utdanning and Kompetanse as tabs ──
     Without this script the three lists simply stand one under another,
     each with its own heading. */
  const tabs = document.querySelector('.pf-tabs');
  const tablist = tabs?.querySelector('[role="tablist"]');
  if (tabs && tablist) {
    const buttons = [...tablist.querySelectorAll('[role="tab"]')];
    const panels = buttons.map(button => document.getElementById(button.getAttribute('aria-controls')));

    function select(index, { focus = false } = {}) {
      buttons.forEach((button, i) => {
        const selected = i === index;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        panels[i].hidden = !selected;
      });
      if (focus) buttons[index].focus();
    }

    buttons.forEach((button, i) => {
      panels[i].setAttribute('role', 'tabpanel');
      panels[i].setAttribute('aria-labelledby', button.id);
      panels[i].tabIndex = 0;
      button.addEventListener('click', () => select(i));
      button.addEventListener('keydown', event => {
        const last = buttons.length - 1;
        const next = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        select(next, { focus: true });
      });
    });

    tablist.hidden = false;
    tabs.classList.add('is-tabbed');
    select(0);
  }

  /* ── Demo videos: one at a time, paused when out of sight ── */
  const videos = [...document.querySelectorAll('.pf-project__media video')];
  videos.forEach(video => {
    video.addEventListener('play', () => videos.forEach(other => {
      if (other !== video) other.pause();
    }));
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (!entry.isIntersecting) entry.target.pause(); });
    }, { threshold: 0 });
    videos.forEach(video => observer.observe(video));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) videos.forEach(video => video.pause());
  });
})();
