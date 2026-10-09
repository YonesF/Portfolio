/* ══ Prosjekter: the projects on a curved 3D wall ═══════════════════════
   The projects as screens on the inside of a curve: the chosen one faces
   the viewer and the rest turn inward toward the edges. Drag or swipe, use
   the arrows or arrow keys, scroll sideways, or click a screen to turn the
   wall; the chosen project's text and link sit underneath. Built on
   Three.js (WebGL). The grid in the page stays the source of every
   project's text and media, and site.js leaves it in place if this never
   starts (no WebGL, reduced motion, or the library fails to load).

   Kept smooth by doing as little as possible:
   - It draws only when something changes, while the wall moves or the
     centre video has a new frame, never as a constant loop beside the
     background scene's own WebGL.
   - Only the centre project's recording plays, as a video texture; every
     other screen shows its poster still, so one video decodes at a time.
   - Textures are mipmapped and anisotropic, so screens turned away stay
     clean instead of shimmering.
   - On a lite page (assets/perf.js) it draws one pixel per CSS pixel,
     without antialiasing, and filters textures less finely. */

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
const perf = window.__perf || { lite: false, onChange() {} };

// The wall, in units of one screen's width.
const PANEL_W = 1;
const PANEL_H = 9 / 16;
// Fitted to the reference layout: the first screen to either side at
// about 1.1 screen widths out and 0.83 wide, the second at 1.75 and 0.25.
const RADIUS = 1.5;                        // of the curve the screens stand on
const STEP = 43.5 * Math.PI / 180;         // angle between neighbouring screens
// Seen from well back, like the reference: perspective then barely grows
// the nearer screens, and the curve reads as screens turning away and
// narrowing toward the edges rather than looming larger.
const CAMERA_BACK = 6 * RADIUS;            // camera distance behind the curve's axis
const MIN_PANELS = 10;                     // projects repeat until the wall is this full
const VISIBLE_SLOTS = 2.6;                 // screens further round than this are hidden
const SETTLE = 9;                          // how quickly the wall glides into place (per second)
const VIDEO_DELAY = 220;                   // ms a project must stay centred before it plays

const section = document.getElementById('projects');
const stage = section && section.querySelector('.project-stage');

if (section && stage && section.classList.contains('has-stage')) {
  startStage().catch(error => {
    console.warn('3D project wall unavailable; showing the grid instead.', error);
    section.classList.remove('has-stage');
    stage.hidden = true;
  });
}

function readProjects() {
  return [...section.querySelectorAll('.projects-gallery__group .project-card')].map(card => {
    const video = card.querySelector('.project-visual__video');
    const still = card.querySelector('.project-visual__slides img');
    return {
      card,
      name: card.querySelector('.project-card__title').textContent.trim(),
      type: card.querySelector('.project-card__type')?.textContent.trim() || '',
      tone: card.style.getPropertyValue('--project-tone').trim() || '#89d2a2',
      poster: video ? video.getAttribute('poster') : still?.getAttribute('src'),
      videoSrc: video?.querySelector('source')?.getAttribute('src') || null
    };
  });
}

async function startStage() {
  const THREE = await import(THREE_URL);
  const projects = readProjects();
  if (!projects.length) throw new Error('no projects found');

  const view = stage.querySelector('.project-stage__view');
  const canvas = view.querySelector('.project-stage__canvas');
  const focus = view.querySelector('.project-stage__focus');
  const details = stage.querySelector('.project-stage__details');
  const el = {
    focusTitle: focus.querySelector('.project-stage__focus-title'),
    focusType: focus.querySelector('.project-stage__focus-type'),
    type: details.querySelector('.project-stage__type'),
    title: details.querySelector('.project-stage__title'),
    desc: details.querySelector('.project-stage__desc'),
    extra: details.querySelector('.project-stage__extra'),
    tags: details.querySelector('.project-stage__tags'),
    link: details.querySelector('.project-stage__link')
  };

  // Multisampling only where it shows: at two device pixels per CSS pixel
  // the screens' edges are already fine, and a lite page goes without.
  // Fixed once the context exists, so a page that turns lite later keeps it.
  const antialias = !perf.lite && (window.devicePixelRatio || 1) < 2;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 50);
  camera.position.set(0, 0, CAMERA_BACK);
  const geometry = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), perf.lite ? 4 : 16);
  const loader = new THREE.TextureLoader();

  // Cover the screen with a still or video of another shape, cropping the
  // overflow evenly rather than stretching it.
  function coverFit(texture, width, height) {
    const media = width / height;
    const panel = PANEL_W / PANEL_H;
    if (media > panel) {
      texture.repeat.set(panel / media, 1);
      texture.offset.set((1 - panel / media) / 2, 0);
    } else {
      texture.repeat.set(1, media / panel);
      texture.offset.set(0, (1 - media / panel) / 2);
    }
  }

  projects.forEach(project => {
    const still = loader.load(project.poster, texture => {
      coverFit(texture, texture.image.width, texture.image.height);
      invalidate();
    });
    still.colorSpace = THREE.SRGBColorSpace;
    still.anisotropy = anisotropy;
    project.still = still;
  });

  const copies = Math.max(1, Math.ceil(MIN_PANELS / projects.length));
  const panels = [];
  for (let copy = 0; copy < copies; copy += 1) {
    projects.forEach((project, index) => {
      const material = new THREE.MeshBasicMaterial({ map: project.still, transparent: true });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      panels.push({ mesh, project: index });
    });
  }
  const count = panels.length;
  const wrap = value => ((value % count) + count) % count;
  const projectAt = slot => panels[wrap(Math.round(slot))].project;

  /* ── Motion ───────────────────────────── */
  // offset is the wall's position in screens; it glides toward target.
  let offset = 0;
  let target = 0;
  let dragging = null;
  let lastTime = 0;
  let frame = 0;

  function invalidate() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function place() {
    panels.forEach((panel, i) => {
      // Signed distance from the centre, the short way round the loop.
      let slot = wrap(i - offset);
      if (slot > count / 2) slot -= count;
      const angle = slot * STEP;
      const { mesh } = panel;
      mesh.visible = Math.abs(slot) < VISIBLE_SLOTS;
      if (!mesh.visible) return;
      mesh.position.set(Math.sin(angle) * RADIUS, 0, -Math.cos(angle) * RADIUS);
      mesh.rotation.y = -angle;
      // The furthest screens fade into the background rather than ending.
      mesh.material.opacity = Math.min(1, Math.max(0, VISIBLE_SLOTS - Math.abs(slot)) * 1.4);
    });
  }

  function tick(now) {
    frame = 0;
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = now;
    if (!dragging) {
      offset += (target - offset) * (1 - Math.exp(-dt * SETTLE));
      if (Math.abs(target - offset) < 0.0005) offset = target;
    }
    place();
    renderer.render(scene, camera);
    chooseFront();
    const moving = Boolean(dragging) || offset !== target;
    // The hover panel belongs to a centred, still screen.
    view.classList.toggle('is-moving', moving);
    if (moving) invalidate();
    else lastTime = 0;
  }

  /* ── The centred project ──────────────── */
  let front = -1;
  let shownDetails = -1;
  let swapTimer = 0;
  let videoTimer = 0;
  let playing = -1;
  let inView = true;

  function chooseFront() {
    const next = projectAt(offset);
    if (next === front) return;
    front = next;
    const project = projects[front];
    focus.style.setProperty('--stage-tone', project.tone);
    el.focusTitle.textContent = project.name;
    el.focusType.textContent = project.type;
    showDetails(front);
    clearTimeout(videoTimer);
    videoTimer = window.setTimeout(() => playVideo(front), VIDEO_DELAY);
  }

  function fillDetails(project) {
    const body = project.card.querySelector('.project-card__body');
    details.style.setProperty('--project-tone', project.tone);
    el.type.textContent = project.type;
    el.title.textContent = project.name;
    el.desc.textContent = body.querySelector('.project-card__desc')?.textContent.trim() || '';
    el.extra.replaceChildren(...['.project-card__note', '.project-card__more']
      .map(selector => body.querySelector(selector))
      .filter(Boolean)
      .map(node => node.cloneNode(true)));
    el.tags.replaceChildren(...[...body.querySelectorAll('.project-card__tag')].map(tag => tag.cloneNode(true)));
    const link = body.querySelector('.project-card__link');
    el.link.hidden = !link;
    if (link) {
      el.link.href = link.href;
      el.link.replaceChildren(...[...link.childNodes].map(node => node.cloneNode(true)));
    }
  }

  function showDetails(index) {
    if (index === shownDetails) return;
    const first = shownDetails < 0;
    shownDetails = index;
    clearTimeout(swapTimer);
    if (first) {
      fillDetails(projects[index]);
      return;
    }
    // A quick fade out, swap, and back in.
    details.classList.add('is-swapping');
    swapTimer = window.setTimeout(() => {
      fillDetails(projects[shownDetails]);
      details.classList.remove('is-swapping');
    }, 160);
  }

  function setMap(index, texture) {
    panels.forEach(panel => {
      if (panel.project !== index || panel.mesh.material.map === texture) return;
      panel.mesh.material.map = texture;
      panel.mesh.material.needsUpdate = true;
    });
    invalidate();
  }

  function stopVideo(index) {
    const project = projects[index];
    if (!project?.video) return;
    project.wanted = false;
    project.video.pause();
    setMap(index, project.still);
  }

  function playVideo(index) {
    if (playing !== index) stopVideo(playing);
    playing = index;
    const project = projects[index];
    if (!project.videoSrc || !inView || document.hidden) return;

    if (!project.video) {
      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = project.videoSrc;
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      video.addEventListener('loadedmetadata', () => coverFit(texture, video.videoWidth, video.videoHeight));
      project.video = video;
      project.videoTexture = texture;
    }

    const { video } = project;
    project.wanted = true;
    project.chain = (project.chain || 0) + 1;
    const chain = project.chain;
    // The poster stays up until there is a frame to replace it with.
    const show = () => { if (project.wanted && chain === project.chain) setMap(index, project.videoTexture); };
    if (video.readyState >= 2) show();
    else video.addEventListener('loadeddata', show, { once: true });
    video.play().catch(() => {});
    // Redraw once per new video frame, and only then.
    if ('requestVideoFrameCallback' in video) {
      const onFrame = () => {
        if (!project.wanted || chain !== project.chain) return;
        invalidate();
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    } else {
      const poll = () => {
        if (!project.wanted || chain !== project.chain) return;
        invalidate();
        window.setTimeout(poll, 1000 / 30);
      };
      poll();
    }
  }

  function syncPlayback() {
    if (inView && !document.hidden) playVideo(front);
    else stopVideo(playing);
  }

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    syncPlayback();
  }).observe(view);
  document.addEventListener('visibilitychange', syncPlayback);

  /* ── Size ─────────────────────────────── */
  let slotPx = 200;

  function toScreen(point) {
    const v = point.clone().project(camera);
    return { x: (v.x + 1) / 2 * view.clientWidth, y: (1 - v.y) / 2 * view.clientHeight };
  }

  function resize() {
    const width = view.clientWidth;
    const height = view.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, perf.lite ? 1 : 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // The centre screen's share of the width comes from site.css, which
    // also sizes the view to suit it.
    const share = parseFloat(getComputedStyle(view).getPropertyValue('--stage-share')) || 0.3;
    const distance = RADIUS + CAMERA_BACK;
    const halfWidth = (PANEL_W / 2) / (share * distance);
    camera.fov = 2 * Math.atan(halfWidth / camera.aspect) * 180 / Math.PI;
    camera.updateProjectionMatrix();

    // Where the centre screen lands, for the hover panel and drag speed.
    const z = -RADIUS;
    const topLeft = toScreen(new THREE.Vector3(-PANEL_W / 2, PANEL_H / 2, z));
    const bottomRight = toScreen(new THREE.Vector3(PANEL_W / 2, -PANEL_H / 2, z));
    Object.assign(focus.style, {
      left: `${Math.round(topLeft.x)}px`,
      top: `${Math.round(topLeft.y)}px`,
      width: `${Math.round(bottomRight.x - topLeft.x)}px`,
      height: `${Math.round(bottomRight.y - topLeft.y)}px`
    });
    const neighbour = toScreen(new THREE.Vector3(Math.sin(STEP) * RADIUS, 0, -Math.cos(STEP) * RADIUS));
    slotPx = Math.max(60, neighbour.x - width / 2);
    invalidate();
  }

  new ResizeObserver(resize).observe(view);
  perf.onChange(resize);

  /* ── Input ────────────────────────────── */
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function turnBy(delta) {
    target = Math.round(target) + delta;
    invalidate();
  }

  function slotUnder(event) {
    const box = canvas.getBoundingClientRect();
    pointer.set((event.clientX - box.left) / box.width * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(panels.map(panel => panel.mesh).filter(mesh => mesh.visible))[0];
    if (!hit) return null;
    const index = panels.findIndex(panel => panel.mesh === hit.object);
    let slot = wrap(index - Math.round(offset));
    if (slot > count / 2) slot -= count;
    return slot;
  }

  function overCentre(event) {
    const box = focus.getBoundingClientRect();
    return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
  }

  view.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    dragging = { id: event.pointerId, startX: event.clientX, startOffset: offset, moved: 0, samples: [{ t: performance.now(), x: event.clientX }] };
    view.setPointerCapture(event.pointerId);
    view.classList.add('is-dragging');
    invalidate();
  });

  view.addEventListener('pointermove', event => {
    if (!dragging) {
      if (event.pointerType === 'mouse') view.classList.toggle('is-hover', overCentre(event));
      return;
    }
    if (event.pointerId !== dragging.id) return;
    const dx = event.clientX - dragging.startX;
    dragging.moved = Math.max(dragging.moved, Math.abs(dx));
    offset = dragging.startOffset - dx / slotPx;
    target = offset;
    dragging.samples.push({ t: performance.now(), x: event.clientX });
    if (dragging.samples.length > 6) dragging.samples.shift();
    view.classList.remove('is-hover');
    invalidate();
  });

  function endDrag(event) {
    if (!dragging || event.pointerId !== dragging.id) return;
    const { moved, samples } = dragging;
    dragging = null;
    view.classList.remove('is-dragging');
    if (moved < 6) {
      // A click: bring that screen round, if it isn't the centre one.
      const slot = slotUnder(event);
      target = Math.round(offset) + (slot || 0);
    } else {
      // A flick carries on a little before it settles on a screen.
      const first = samples[0];
      const last = samples[samples.length - 1];
      const velocity = (last.t - first.t) > 0 ? -(last.x - first.x) / (last.t - first.t) / slotPx : 0;
      target = Math.round(offset + Math.max(-3, Math.min(3, velocity * 220)));
    }
    invalidate();
  }

  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);
  view.addEventListener('pointerleave', () => view.classList.remove('is-hover'));

  // Sideways scrolling (trackpads, shift+wheel) turns the wall; plain
  // vertical scrolling is left to the page.
  let wheelTimer = 0;
  view.addEventListener('wheel', event => {
    const dx = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : (event.shiftKey ? event.deltaY : 0);
    if (!dx) return;
    event.preventDefault();
    offset += dx / slotPx;
    target = offset;
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => { target = Math.round(offset); invalidate(); }, 120);
    invalidate();
  }, { passive: false });

  view.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); turnBy(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); turnBy(1); }
  });
  stage.querySelector('[data-stage="prev"]').addEventListener('click', () => turnBy(-1));
  stage.querySelector('[data-stage="next"]').addEventListener('click', () => turnBy(1));

  resize();
  chooseFront();
  section.classList.add('is-stage-ready');
}
