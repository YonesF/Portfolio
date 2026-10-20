/* The previews on prosjekter.html play by themselves, like GIFs: muted,
   looping, and only while on screen, so a video neither loads nor runs out
   of sight (each is preload="none"). A click, Enter or Space holds one or
   lets it go again. Without this script, or for a reader who asks for less
   motion, each video keeps its controls and plays only when asked. */
(() => {
  const videos = [...document.querySelectorAll('video.pf-preview')];
  const lessMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!videos.length || lessMotion || !('IntersectionObserver' in window)) return;

  const onScreen = new Set();
  const held = new WeakSet();

  function play(video) {
    if (held.has(video) || document.hidden) return;
    video.play()?.catch(() => {});   // refused autoplay just leaves the poster
  }

  function toggle(video) {
    if (video.paused) { held.delete(video); play(video); }
    else { held.add(video); video.pause(); }
  }

  const observer = new IntersectionObserver(entries => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) { onScreen.add(target); play(target); }
      else { onScreen.delete(target); target.pause(); }
    });
  }, { threshold: 0.25 });

  videos.forEach(video => {
    video.controls = false;
    video.muted = true;   // the property is what autoplay rules check
    video.tabIndex = 0;
    video.addEventListener('click', () => toggle(video));
    video.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      toggle(video);
    });
    observer.observe(video);
  });

  document.addEventListener('visibilitychange', () => {
    onScreen.forEach(video => (document.hidden ? video.pause() : play(video)));
  });
})();
