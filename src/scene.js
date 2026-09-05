import { renderClock } from './clock.js';
import { SCENE_IMAGE } from './data/scenes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function layer(className) {
  const element = document.createElement('div');
  element.className = `scene-layer ${className}`;
  return element;
}

/** Mount one scene and keep clock updates isolated from the other scene layers. */
export function mountScene(stage, scene, time) {
  const background = layer('scene-background');

  // A blurred copy of the same picture fills the stage behind the scene, so a
  // 3:2 illustration on a much wider stage reads as framed rather than as an
  // image stranded between empty bars. Same URL, so it costs no extra fetch.
  const backdrop = document.createElement('img');
  backdrop.className = 'scene-backdrop';
  backdrop.src = scene.image;
  backdrop.alt = '';
  backdrop.decoding = 'async';
  backdrop.setAttribute('aria-hidden', 'true');

  const image = document.createElement('img');
  image.className = 'scene-image';
  image.src = scene.image;
  image.alt = '';
  image.decoding = 'async';

  // The whole scene is always shown: the image is contained and the overlay
  // uses the artwork's full pixel box with the matching fit rule, so SVG user
  // units are source-image pixels and the hands track the painted clock at
  // every size without any measurement.
  const overlay = document.createElementNS(SVG_NS, 'svg');
  overlay.setAttribute('class', 'scene-hands');
  overlay.setAttribute('viewBox', `0 0 ${SCENE_IMAGE.width} ${SCENE_IMAGE.height}`);
  overlay.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  overlay.setAttribute('aria-hidden', 'true');

  background.append(backdrop, image, overlay);

  const foreground = layer('scene-foreground');
  foreground.setAttribute('aria-hidden', 'true');

  stage.replaceChildren(background, foreground);

  let currentTime = time;
  const drawClock = () => {
    overlay.replaceChildren(renderClock(scene.clock.type, currentTime, {
      geometry: scene.clock,
      label: `Clock showing ${currentTime.h}:${String(currentTime.m).padStart(2, '0')}`,
    }));
  };
  drawClock();

  return {
    setTime(nextTime) {
      currentTime = nextTime;
      drawClock();
    },
    destroy() {},
    elements: { background, backdrop, image, overlay, foreground },
  };
}
