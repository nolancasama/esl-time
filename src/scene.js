import { renderClock } from './clock.js';

function layer(className) {
  const element = document.createElement('div');
  element.className = `scene-layer ${className}`;
  return element;
}

/** Mount one scene and keep clock updates isolated from the other scene layers. */
export function mountScene(stage, scene, time) {
  const background = layer('scene-background');
  const label = document.createElement('span');
  label.className = 'scene-placeholder-label';
  label.textContent = scene.placeholder;
  background.append(label);

  const clock = layer('scene-clock');
  clock.style.left = `${scene.clock.x}%`;
  clock.style.top = `${scene.clock.y}%`;

  const foreground = layer('scene-foreground');
  foreground.setAttribute('aria-hidden', 'true');

  stage.replaceChildren(background, clock, foreground);

  // Size is based on the stage's smaller side, not the viewport. This keeps a
  // 16% clock legible and proportionally identical in landscape and portrait.
  const sizeClock = () => {
    const box = stage.getBoundingClientRect();
    const requested = Math.min(box.width, box.height) * scene.clock.size / 100;
    // The frozen 16% scene becomes only ~60 CSS pixels at 1024x600 after the
    // controls are reserved. An accessibility floor keeps all twelve numerals
    // readable while larger screens still follow the authored percentage.
    const pixels = Math.max(88, requested);
    clock.style.width = `${pixels}px`;
    clock.style.height = `${pixels}px`;
  };

  let currentTime = time;
  const drawClock = () => {
    clock.replaceChildren(renderClock(scene.clock.type, currentTime));
  };
  drawClock();
  sizeClock();

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sizeClock) : null;
  if (observer) observer.observe(stage);
  else window.addEventListener('resize', sizeClock);

  return {
    setTime(nextTime) {
      currentTime = nextTime;
      drawClock();
    },
    destroy() {
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', sizeClock);
    },
    elements: { background, clock, foreground },
  };
}
