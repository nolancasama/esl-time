const SVG_NS = 'http://www.w3.org/2000/svg';
const renderers = new Map();

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function analogRenderer(time, opts = {}) {
  const svg = svgElement('svg', {
    viewBox: '0 0 200 200',
    role: 'img',
    'aria-label': opts.label || `Analog clock showing ${time.h}:${String(time.m).padStart(2, '0')}`,
  });
  svg.classList.add('analog-clock');

  svg.append(svgElement('circle', { class: 'clock-rim', cx: 100, cy: 100, r: 96 }));
  svg.append(svgElement('circle', { class: 'clock-face', cx: 100, cy: 100, r: 89 }));

  const ticks = svgElement('g', { class: 'clock-ticks', 'aria-hidden': 'true' });
  for (let minute = 0; minute < 60; minute += 1) {
    const major = minute % 5 === 0;
    ticks.append(svgElement('line', {
      class: major ? 'clock-tick clock-tick-major' : 'clock-tick',
      x1: 100,
      y1: major ? 13 : 15,
      x2: 100,
      y2: major ? 23 : 19,
      transform: `rotate(${minute * 6} 100 100)`,
    }));
  }
  svg.append(ticks);

  const numerals = svgElement('g', { class: 'clock-numerals', 'aria-hidden': 'true' });
  for (let hour = 1; hour <= 12; hour += 1) {
    const angle = (hour * 30 - 90) * Math.PI / 180;
    const numeral = svgElement('text', {
      x: 100 + Math.cos(angle) * 69,
      y: 100 + Math.sin(angle) * 69,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    numeral.textContent = String(hour);
    numerals.append(numeral);
  }
  svg.append(numerals);

  // The fractional hour angle is the lesson: 7:30 must sit between 7 and 8.
  const hourAngle = (time.h % 12) * 30 + time.m * 0.5;
  const minuteAngle = time.m * 6;
  svg.append(svgElement('line', {
    class: 'clock-hand clock-hour-hand',
    x1: 100,
    y1: 108,
    x2: 100,
    y2: 59,
    transform: `rotate(${hourAngle} 100 100)`,
  }));
  svg.append(svgElement('line', {
    class: 'clock-hand clock-minute-hand',
    x1: 100,
    y1: 110,
    x2: 100,
    y2: 37,
    transform: `rotate(${minuteAngle} 100 100)`,
  }));
  svg.append(svgElement('circle', { class: 'clock-pin-outer', cx: 100, cy: 100, r: 7 }));
  svg.append(svgElement('circle', { class: 'clock-pin', cx: 100, cy: 100, r: 3.5 }));
  return svg;
}

export function registerClockRenderer(type, fn) {
  if (!type || typeof fn !== 'function') throw new TypeError('A clock type and renderer are required.');
  renderers.set(type, fn);
}

export function renderClock(type, time, opts = {}) {
  const renderer = renderers.get(type);
  if (!renderer) throw new Error(`No clock renderer registered for "${type}".`);
  return renderer(time, opts);
}

registerClockRenderer('analog', analogRenderer);
