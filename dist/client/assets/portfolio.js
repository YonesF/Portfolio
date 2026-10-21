/* ══════════════════════════════════════════════════════════════════════════
   YONES FEILI — PORTFOLIO INTERACTIVITY
   Exact behavioral replica of danielfeili.eu (portfolio4) + Lenis Smooth Scroll
   ══════════════════════════════════════════════════════════════════════════ */
(() => {
  /* ── 0. Initialize Lenis Smooth Scroll ── */
  const lenis = typeof window.Lenis === 'function'
    ? new window.Lenis({
        lerp: 0.08,
        duration: 1.2,
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 2
      })
    : null;

  if (lenis) {
    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  let isProgrammaticScroll = false;
  let programmaticScrollTimer = null;

  function smoothScrollTo(targetOrY, options = {}) {
    isProgrammaticScroll = true;
    clearTimeout(programmaticScrollTimer);
    const dur = options.duration ?? 1.2;
    programmaticScrollTimer = setTimeout(() => {
      isProgrammaticScroll = false;
    }, dur * 1000 + 80);

    if (lenis) {
      lenis.scrollTo(targetOrY, { duration: dur, ...options });
    } else if (typeof targetOrY === 'number') {
      window.scrollTo({ top: targetOrY, behavior: 'smooth' });
    } else if (targetOrY instanceof Element) {
      targetOrY.scrollIntoView({ behavior: 'smooth' });
    }
  }

  /* ── 1. Loading Screen (LoadingScreen.jsx) ── */
  const loader = document.getElementById('df-loader');
  const loaderBar = document.getElementById('df-loader-bar');
  const loaderStatus = document.getElementById('df-loader-status');

  if (loader && loaderBar && loaderStatus) {
    let progress = 0;
    const steps = [
      { at: 15, text: 'Loading assets' },
      { at: 45, text: 'Preparing portfolio' },
      { at: 75, text: 'Almost ready' },
      { at: 92, text: 'Finalizing' }
    ];

    const interval = setInterval(() => {
      progress += progress < 50 ? 2.2 : progress < 82 ? 1.6 : 1.1;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        loaderBar.style.width = '100%';
        loaderStatus.textContent = 'Finalizing';
        setTimeout(() => {
          loader.classList.add('is-exiting');
          setTimeout(() => loader.remove(), 850);
        }, 420);
        return;
      }
      loaderBar.style.width = `${progress}%`;
      for (const step of steps) {
        if (progress >= step.at) loaderStatus.textContent = step.text;
      }
    }, 35);
  }

  /* ── 2. Hero Rotating Words (app/page.jsx) ── */
  const wordEl = document.getElementById('df-rotating-word');
  if (wordEl) {
    const words = ['Web-GIS & 3D', 'JavaScript', 'C# & .NET', 'Python & AI', 'PostGIS & SQL'];
    let wordIndex = 0;

    setInterval(() => {
      wordEl.classList.remove('is-in');
      wordEl.classList.add('is-out');

      setTimeout(() => {
        wordIndex = (wordIndex + 1) % words.length;
        wordEl.textContent = words[wordIndex];
        wordEl.classList.remove('is-out');
        wordEl.classList.add('is-in');
      }, 320);
    }, 2500);
  }

  /* ── 3. Smooth Scroll Helper (scrollToSection.js) ── */
  function scrollToSection(sectionId) {
    if (sectionId === 'home') {
      smoothScrollTo(0);
      return;
    }
    const target = document.querySelector(`section[data-section="${sectionId}"]`);
    if (target) {
      smoothScrollTo(target);
    }
  }

  document.querySelectorAll('[data-scroll-to]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const targetId = el.getAttribute('data-scroll-to');
      closeOverlayMenu();
      scrollToSection(targetId);
    });
  });

  /* ── 4. Fullscreen Overlay Menu (ProjectNav.jsx & MobileNav.jsx) ── */
  const menuBtn = document.getElementById('df-menu-btn');
  const menuIconOpen = document.getElementById('df-menu-icon-open');
  const menuIconClose = document.getElementById('df-menu-icon-close');
  const overlayMenu = document.getElementById('df-overlay-menu');
  let menuOpen = false;

  function setMenuState(open) {
    menuOpen = open;
    if (!overlayMenu) return;
    overlayMenu.classList.toggle('is-open', open);
    overlayMenu.setAttribute('aria-hidden', String(!open));
    if (lenis) {
      if (open) lenis.stop();
      else lenis.start();
    }
    if (menuIconOpen && menuIconClose) {
      menuIconOpen.style.display = open ? 'none' : 'block';
      menuIconClose.style.display = open ? 'block' : 'none';
    }
  }

  function closeOverlayMenu() {
    if (menuOpen) setMenuState(false);
  }

  menuBtn?.addEventListener('click', () => setMenuState(!menuOpen));
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menuOpen) closeOverlayMenu();
  });

  /* ── 5. Header Mode, Active Section & BackToTop (Header.jsx, Nav.jsx, BackToTop.jsx) ── */
  const header = document.getElementById('df-header');
  const backToTop = document.getElementById('df-back-to-top');
  const navLinks = [...document.querySelectorAll('[data-nav-section]')];
  const sections = ['home', 'projects', 'skills', 'contact']
    .map(id => ({ id, el: document.querySelector(`section[data-section="${id}"]`) }))
    .filter(s => s.el);

  function handleMainScroll() {
    const y = window.scrollY;

    if (backToTop) {
      backToTop.classList.toggle('is-visible', y > 300);
    }

    let current = 'home';
    for (const s of sections) {
      const rect = s.el.getBoundingClientRect();
      if (rect.top <= 160 && rect.bottom >= 160) {
        current = s.id;
        break;
      }
    }

    if (header) {
      header.classList.toggle('is-projects-mode', current === 'projects');
    }

    navLinks.forEach(link => {
      const id = link.getAttribute('data-nav-section');
      link.classList.toggle('is-active', id === current);
    });
  }

  window.addEventListener('scroll', handleMainScroll, { passive: true });
  handleMainScroll();

  backToTop?.addEventListener('click', () => {
    smoothScrollTo(0);
  });

  /* ── 6. Projects Section Sticky Stage & Scroll Sync ── */
  const projectsSection = document.getElementById('projects');
  const projectItems = [...document.querySelectorAll('.df-project-item')];
  const sidebarItems = [...document.querySelectorAll('.df-projects__nav-item')];
  const blurBg = document.getElementById('df-projects-blur-bg');
  let activeProjectIndex = -1;

  function setSidebarProject(index) {
    if (index === activeProjectIndex || index < 0 || index >= projectItems.length) return;
    activeProjectIndex = index;

    sidebarItems.forEach((item, i) => {
      item.classList.toggle('is-active', i === index);
    });

    const activeCard = projectItems[index];
    const bgUrl = activeCard?.getAttribute('data-bg');
    if (blurBg && bgUrl) {
      blurBg.style.backgroundImage = `url('${bgUrl}')`;
    }
  }

  function setCardVisibility(card, visible) {
    const wasVisible = card.classList.contains('is-visible');
    if (wasVisible === visible) return;
    card.classList.toggle('is-visible', visible);
    const video = card.querySelector('video');
    if (visible) {
      video?.play()?.catch(() => {});
    } else {
      video?.pause();
    }
  }

  function updateProjectOnScroll() {
    if (!projectsSection || !projectItems.length) return;

    if (window.innerWidth < 768) {
      const viewportMid = window.innerHeight / 2;
      let closestIndex = 0;
      let closestDistance = Infinity;
      projectItems.forEach((item, index) => {
        item.style.removeProperty('--scroll-y');
        const rect = item.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - viewportMid);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      setSidebarProject(closestIndex);
      projectItems.forEach((card, i) => setCardVisibility(card, i === closestIndex));
      return;
    }

    const count = projectItems.length;
    const sectionTop = projectsSection.offsetTop;
    const scrollableDistance = Math.max(1, projectsSection.offsetHeight - window.innerHeight);
    const currentScrollY = lenis && typeof lenis.scroll === 'number' ? lenis.scroll : window.scrollY;
    const scrolledInto = currentScrollY - sectionTop;
    const progress = Math.min(1, Math.max(0, scrolledInto / scrollableDistance));

    // Map scroll across N full segments [0..count], with project i centered at (i + 0.5)
    const stagePos = progress * count;
    const targetIndex = Math.min(count - 1, Math.max(0, Math.floor(stagePos)));

    setSidebarProject(targetIndex);

    projectItems.forEach((card, i) => {
      const centerPos = i + 0.5;
      const offset = Math.max(-1, Math.min(1, stagePos - centerPos));
      const shiftPx = -offset * 460;
      card.style.setProperty('--scroll-y', `${shiftPx.toFixed(2)}px`);

      const isEdgeVisible =
        (i === 0 && stagePos <= 0.5) ||
        (i === count - 1 && stagePos >= count - 0.5);
      const isVisible = isEdgeVisible || Math.abs(offset) <= 0.45;

      setCardVisibility(card, isVisible);
    });
  }

  function handleProjectWheel(e) {
    if (!projectsSection || projectItems.length < 2) return;
    if (window.innerWidth < 768 || isProgrammaticScroll || menuOpen) return;

    const rect = projectsSection.getBoundingClientRect();
    const inProjectsZone = rect.top <= 16 && rect.bottom >= window.innerHeight - 16;
    if (!inProjectsZone) return;

    const count = projectItems.length;
    const maxIndex = count - 1;
    const sectionTop = projectsSection.offsetTop;
    const scrollableDistance = Math.max(1, projectsSection.offsetHeight - window.innerHeight);
    const currentScrollY = lenis && typeof lenis.scroll === 'number' ? lenis.scroll : window.scrollY;
    const stagePos = ((currentScrollY - sectionTop) / scrollableDistance) * count;
    const liveIndex = Math.min(maxIndex, Math.max(0, Math.floor(stagePos)));

    // Allow scrolling freely out of the top of Project 1 or bottom of Project 8
    if (liveIndex === 0 && stagePos <= 0.12 && e.deltaY < 0) return;
    if (liveIndex === maxIndex && stagePos >= count - 0.12 && e.deltaY > 0) return;

    const baseTargetY = lenis && typeof lenis.targetScroll === 'number' ? lenis.targetScroll : currentScrollY;
    const projectedTargetY = baseTargetY + e.deltaY;
    const projectedPos = ((projectedTargetY - sectionTop) / scrollableDistance) * count;

    // Cap target lead to at most 1 project ahead of the currently visible project
    // so Lenis keeps 100% of its native smooth lerp without skipping multiple projects at once
    if (e.deltaY > 0 && liveIndex < maxIndex && projectedPos > liveIndex + 1.48) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (e.deltaY < 0 && liveIndex > 0 && projectedPos < liveIndex - 0.48) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  if (projectItems.length) {
    setSidebarProject(0);

    sidebarItems.forEach((navItem, index) => {
      navItem.addEventListener('click', () => {
        if (!projectsSection) return;
        const sectionTop = projectsSection.offsetTop;
        const scrollableDistance = Math.max(1, projectsSection.offsetHeight - window.innerHeight);
        const ratio = (index + 0.5) / projectItems.length;
        const targetY = sectionTop + ratio * scrollableDistance;
        setSidebarProject(index);
        smoothScrollTo(targetY);
      });
    });

    if (lenis && typeof lenis.on === 'function') {
      lenis.on('scroll', updateProjectOnScroll);
    } else {
      window.addEventListener('scroll', updateProjectOnScroll, { passive: true });
    }
    window.addEventListener('wheel', handleProjectWheel, { passive: false, capture: true });
    window.addEventListener('resize', updateProjectOnScroll, { passive: true });
    updateProjectOnScroll();
  }
})();
