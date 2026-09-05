import { renderClock } from './clock.js';
import { SCENE_IMAGE } from './data/scenes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Breathing room kept around the painted clock when the scene is cropped to
// fill the screen. The clock is the content: everything else may go.
const CLOCK_MARGIN = 1.2;

/**
 * Where a visible window of `visibleSpan` starts along one axis.
 *
 * Prefers the artwork's own centre framing and pans only as far as needed to
 * keep the clock, plus its margin, inside the window. Returns a source-image
 * coordinate so the image and the overlay can be driven from the same rect.
 */
function windowOrigin(imageSpan, visibleSpan, centre, margin) {
  const slack = Math.max(0, imageSpan - visibleSpan);
  let origin = slack / 2;
  const lowest = centre + margin - visibleSpan;
  const highest = centre - margin;
  if (lowest <= highest) origin = Math.min(Math.max(origin, lowest), highest);
  return Math.min(Math.max(origin, 0), slack);
}

function layer(className) {
  const element = document.createElement('div');
  element.className = `scene-layer ${className}`;
  return element;
}

/**
 * Mount one scene and keep clock updates isolated from the other scene layers.
 * `onFit` receives the painted clock's rectangle in stage pixels whenever the
 * framing is computed, so overlaid UI can keep clear of it.
 */
export function mountScene(stage, scene, time, { onFit } = {}) {
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

  // The scene fills the screen edge to edge. One visible source rect drives
  // both the image (as object-position) and the overlay (as its viewBox), so
  // the two share a coordinate space and the hands cannot drift off the
  // painted clock. The rect keeps the clock in frame at any aspect ratio;
  // what gets cropped is the bottom of the composition, which is floor and
  // furniture, never a clock.
  const fitScene = () => {
    const box = stage.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const scale = Math.max(box.width / SCENE_IMAGE.width, box.height / SCENE_IMAGE.height);
    const visibleWidth = Math.min(SCENE_IMAGE.width, box.width / scale);
    const visibleHeight = Math.min(SCENE_IMAGE.height, box.height / scale);
    const margin = Math.max(scene.clock.rx, scene.clock.ry) * CLOCK_MARGIN;

    const x = windowOrigin(SCENE_IMAGE.width, visibleWidth, scene.clock.cx, margin);
    const y = windowOrigin(SCENE_IMAGE.height, visibleHeight, scene.clock.cy, margin);

    const slackX = SCENE_IMAGE.width - visibleWidth;
    const slackY = SCENE_IMAGE.height - visibleHeight;
    image.style.objectPosition = `${slackX ? (x / slackX) * 100 : 50}% ${slackY ? (y / slackY) * 100 : 50}%`;
    overlay.setAttribute('viewBox', `${x} ${y} ${visibleWidth} ${visibleHeight}`);

    if (onFit) {
      const pixels = box.width / visibleWidth;
      onFit({
        left: (scene.clock.cx - scene.clock.rx - x) * pixels,
        right: (scene.clock.cx + scene.clock.rx - x) * pixels,
        top: (scene.clock.cy - scene.clock.ry - y) * pixels,
        bottom: (scene.clock.cy + scene.clock.ry - y) * pixels,
        width: box.width,
      });
    }
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
