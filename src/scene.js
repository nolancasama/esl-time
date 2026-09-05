import { renderClock } from './clock.js';
import { SCENE_IMAGE } from './data/scenes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// How much clear space around the painted clock must stay on screen. The clock
// is the content of this game, so framing may crop anything else but never it.
const CLOCK_MARGIN = 1.45;

// The readable floor carried over from the placeholder clock: below roughly
// this, twelve numerals and a fractional hour hand stop being legible. A scene
// whose painted clock is small in its artwork (the distant tower in the town
// square) is pushed in on until it clears this, rather than shown unreadable.
const MIN_FACE_PX = 88;

function layer(className) {
  const element = document.createElement('div');
  element.className = `scene-layer ${className}`;
  return element;
}

/**
 * Where a visible window of `visibleSpan` should start along one axis.
 *
 * Prefers the artwork's own centre framing, and pans only as far as needed to
 * keep the clock (plus its margin) inside the window. Returns a source-image
 * coordinate, so both the <img> and the overlay can be driven from it.
 */
function windowOrigin(imageSpan, visibleSpan, centre, margin) {
  const slack = Math.max(0, imageSpan - visibleSpan);
  let origin = slack / 2;
  const lowest = centre + margin - visibleSpan;
  const highest = centre - margin;
  if (lowest <= highest) origin = Math.min(Math.max(origin, lowest), highest);
  return Math.min(Math.max(origin, 0), slack);
}

/** Mount one scene and keep clock updates isolated from the other scene layers. */
export function mountScene(stage, scene, time) {
  const background = layer('scene-background');

  const image = document.createElement('img');
  image.className = 'scene-image';
  image.src = scene.image;
  image.alt = '';
  image.decoding = 'async';

  const overlay = document.createElementNS(SVG_NS, 'svg');
  overlay.setAttribute('class', 'scene-hands');
  overlay.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  overlay.setAttribute('aria-hidden', 'true');

  background.append(image, overlay);

  const foreground = layer('scene-foreground');
  foreground.setAttribute('aria-hidden', 'true');

  stage.replaceChildren(background, foreground);

  // The artwork fills the stage (`cover`) rather than letterboxing, because at
  // the smallest supported stage a contained 3:2 image leaves ~40% of the width
  // empty and shrinks every clock below the readable floor. The visible source
  // rect is computed once per size and applied to BOTH the image (as
  // object-position) and the overlay (as its viewBox), so the two always share
  // one coordinate space and the hands cannot drift off the painted clock.
  const fitScene = () => {
    const box = stage.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const cover = Math.max(box.width / SCENE_IMAGE.width, box.height / SCENE_IMAGE.height);
    const face = 2 * Math.min(scene.clock.rx, scene.clock.ry);
    const scale = Math.max(cover, MIN_FACE_PX / face);
    const visibleWidth = Math.min(SCENE_IMAGE.width, box.width / scale);
    const visibleHeight = Math.min(SCENE_IMAGE.height, box.height / scale);
    const margin = Math.max(scene.clock.rx, scene.clock.ry) * CLOCK_MARGIN;

    const x = windowOrigin(SCENE_IMAGE.width, visibleWidth, scene.clock.cx, margin);
    const y = windowOrigin(SCENE_IMAGE.height, visibleHeight, scene.clock.cy, margin);

    const slackX = SCENE_IMAGE.width - visibleWidth;
    const slackY = SCENE_IMAGE.height - visibleHeight;
    // object-position percentages resolve against exactly this slack, which is
    // what keeps the <img> crop identical to the viewBox below.
    image.style.objectPosition = `${slackX ? (x / slackX) * 100 : 50}% ${slackY ? (y / slackY) * 100 : 50}%`;
    overlay.setAttribute('viewBox', `${x} ${y} ${visibleWidth} ${visibleHeight}`);
  };

  let currentTime = time;
  const drawClock = () => {
    overlay.replaceChildren(renderClock(scene.clock.type, currentTime, {
      geometry: scene.clock,
      label: `Clock showing ${currentTime.h}:${String(currentTime.m).padStart(2, '0')}`,
    }));
  };
  drawClock();
  fitScene();

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fitScene) : null;
  if (observer) observer.observe(stage);
  else window.addEventListener('resize', fitScene);

  return {
    setTime(nextTime) {
      currentTime = nextTime;
      drawClock();
    },
    destroy() {
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', fitScene);
    },
    elements: { background, image, overlay, foreground },
  };
}
