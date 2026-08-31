/* Unicorn Studio stage fitting + runtime loader — shared by every page. */

// The opening scenes have fixed 1440x900 artboards, so scale each to
// contain its section rather than letting the canvas restretch it —
// fixed-pixel type would otherwise overflow narrow viewports.
(function () {
  var stages = document.querySelectorAll('[data-scene-fit]');
  function fit() {
    stages.forEach(function (stage) {
      var box = stage.parentNode;
      // A fill scene takes the artboard's aspect at the section's own
      // width, so it runs edge to edge instead of being letterboxed.
      // Measured rather than done in CSS with 100vw, which would
      // include the scrollbar and leave a sliver below the scene.
      // data-scene-fill-min opts a scene out below a given width,
      // for one whose HTML overlay needs the taller viewport section.
      if ('sceneFill' in stage.dataset) {
        var fills = window.innerWidth >= (+stage.dataset.sceneFillMin || 0);
        box.style.height = fills
          ? Math.round(box.clientWidth * 900 / 1440) + 'px'
          : '';
        box.style.minHeight = fills ? '0px' : '';
      }
      var scale = Math.min(box.clientWidth / 1440, box.clientHeight / 900);
      stage.style.setProperty('--scene-fit', scale);
    });
  }
  fit();
  window.__fitUnicornStages = fit;
})();

(function loadUnicornStudio() {
  function announceRuntime() {
    if (!window.UnicornStudio?.addScene) {
      console.error('Unicorn Studio runtime loaded without addScene support.');
      return;
    }
    window.__unicornRuntimeReady = true;
    window.dispatchEvent(new CustomEvent('unicorn-runtime-ready'));
  }

  if (window.UnicornStudio?.addScene) {
    announceRuntime();
    return;
  }

  window.UnicornStudio = { isInitialized: false };
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.2.12/dist/unicornStudio.umd.js';
  script.onload = announceRuntime;
  script.onerror = () => console.error('Unicorn Studio runtime failed to load.');
  (document.head || document.body).appendChild(script);
})();
