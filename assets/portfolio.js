/* Small enhancements only: every section, link and demo works without these. */
(() => {
  const nav = document.querySelector('.portfolio-nav');
  if (!nav) return;

  const links = [...nav.querySelectorAll('a[href^="#"]')]
    .filter(link => link.getAttribute('href') !== '#top');
  const sections = links.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  let frame = 0;

  document.querySelector('.pf-skip-link')?.addEventListener('click', () => {
    document.getElementById('alder')?.focus({ preventScroll: true });
  });

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
