/* Unicorn Studio stage fitting, scene prefetch + runtime loader — shared by every page. */

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
      // data-scene-cover fills the section and crops, rather than fitting
      // inside it and letterboxing.
      var fitW = box.clientWidth / 1440;
      var fitH = box.clientHeight / 900;
      var scale = 'sceneCover' in stage.dataset
        ? Math.max(fitW, fitH)
        : Math.min(fitW, fitH);
      stage.style.setProperty('--scene-fit', scale);
    });
  }
  fit();
  window.__fitUnicornStages = fit;
})();

// Each scene's data and images are requested here, alongside the runtime,
// rather than by the runtime once it has loaded and compiled its shaders —
// which left the backdrop empty, then half-drawn, for seconds. The images
// are also swapped for lighter local copies: Unicorn Studio serves exactly
// what was uploaded, 1–3 MB PNGs, and a scene only looks right once they
// are in. They are keyed by the original URL, so an image replaced in
// Unicorn Studio simply loads from there instead.
(function prefetchUnicornScenes() {
  const UPLOADS = 'https://assets.unicorn.studio/images/qluaEl6gyOdCxoPIS9xlujFSyS23/';
  const LIGHTER_IMAGES = {
    'Hepastheus%20marble.png': 'assets/scenes/prosjekter-marble.webp',
    'Yones%20marble-portrait-1440x900.png': 'assets/scenes/landing-portrait.webp',
    'ChatGPT%20Image%20Aug%2022,%202026,%2002_41_05%20PM.png': 'assets/scenes/om-meg-scene.webp',
    'remix_image%203.png': 'assets/scenes/erfaring-backdrop.webp',
    'ChatGPT%20Image%20Aug%2023,%202026,%2004_02_24%20PM_nobg_1787497389910.png': 'assets/scenes/erfaring-figure.webp',
    'Eagle%20marble_nobg_1787498270726.png': 'assets/scenes/erfaring-eagle.webp'
  };
  const ASSET_URL = /(?:https?:\/\/|assets\/)[^"]+?\.(?:png|jpe?g|webp|gif|ttf|otf|woff2?)(?:\?[^"]*)?(?=")/gi;
  const FONT_URL = /\.(?:ttf|otf|woff2?)(?:\?|$)/i;
  const scenes = new Map();

  function sceneUrl(host) {
    // Unicorn's production CDN, which browsers may cache; the runtime's
    // default refetches every scene with a fresh ?v=<timestamp>. If a
    // republished scene does not show up, add ?update=<n> to its
    // data-us-project to fetch around the CDN's copy.
    return host.getAttribute('data-us-project-src') ||
      `https://assets.unicorn.studio/embeds/${host.getAttribute('data-us-project')}`;
  }

  // The runtime requests images and fonts with CORS, so these match and
  // are reused rather than downloaded twice.
  function preload(url, as) {
    return new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = as;
      link.href = url;
      link.crossOrigin = 'anonymous';
      link.onload = link.onerror = resolve;
      document.head.appendChild(link);
    });
  }

  function prefetch(host, index) {
    return fetch(sceneUrl(host))
      .then(response => response.ok ? response.text() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(text => {
        Object.keys(LIGHTER_IMAGES).forEach(name => {
          text = text.split(UPLOADS + name).join(LIGHTER_IMAGES[name]);
        });

        // Handed over inline: given the id of a JSON element as its
        // filePath, the runtime reads the scene from it instead of fetching.
        const source = document.createElement('script');
        source.type = 'application/json';
        source.id = `unicorn-scene-${index}`;
        source.textContent = text;
        document.head.appendChild(source);

        const urls = [...new Set(text.match(ASSET_URL) || [])];
        urls.filter(url => FONT_URL.test(url)).forEach(url => preload(url, 'font'));
        const images = urls.filter(url => !FONT_URL.test(url)).map(url => preload(url, 'image'));
        const ready = Promise.race([
          Promise.all(images),
          // Never keep a scene hidden behind one stalled request.
          new Promise(resolve => setTimeout(resolve, 10000))
        ]);
        return { source: source.id, ready };
      })
      .catch(error => {
        console.warn('Unicorn scene prefetch failed; the runtime will fetch it itself.', error);
        return null;
      });
  }

  document.querySelectorAll('[data-us-project], [data-us-project-src]')
    .forEach((host, index) => scenes.set(host, prefetch(host, index)));
  window.__unicornSceneData = host => scenes.get(host) || Promise.resolve(null);
})();

(function loadUnicornStudio() {
  // Kontakt has no scene, so it skips the runtime's ~190 kB altogether.
  if (!document.querySelector('[data-us-project], [data-us-project-src]')) return;

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
