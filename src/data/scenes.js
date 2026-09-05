// Scene artwork is 1536x1024. Every clock geometry below is expressed in those
// SOURCE IMAGE PIXELS, not in stage percentages, so the hand overlay lands on
// the painted clock no matter how the stage is sized: the overlay SVG uses this
// same box as its viewBox and the same fit rule as the <img>, so the two share
// one coordinate space and cannot drift apart.
//
// The clocks are painted with a face, numerals and a centre pin but NO hands.
// The game supplies only the hands.
//
// rx / ry are the ellipse semi-axes of the painted FACE (inside the rim), not a
// single radius: these faces are hand-drawn ovals rather than true circles
// (the school library reads 0.78 wide-to-tall), so hands are mapped through
// that ellipse to follow the same foreshortening the artwork has.
// Measured by fitting the face region in each image; see DESIGN_DECISIONS.md.
export const SCENE_IMAGE = Object.freeze({ width: 1536, height: 1024 });

export const SCENES = Object.freeze([
  { id: 'scene-01', name: 'Classroom', image: 'assets/scenes/01-classroom.webp',
    defaultTime: { h: 7, m: 0 },
    clock: { type: 'painted', cx: 443.0, cy: 156.5, rx: 94.0, ry: 96.5 }, character: null, voice: null },
  { id: 'scene-02', name: 'Kitchen', image: 'assets/scenes/02-kitchen.webp',
    defaultTime: { h: 7, m: 15 },
    clock: { type: 'painted', cx: 1268.7, cy: 147.8, rx: 99.3, ry: 104.8 }, character: null, voice: null },
  { id: 'scene-03', name: 'Living Room', image: 'assets/scenes/03-living-room.webp',
    defaultTime: { h: 7, m: 30 },
    clock: { type: 'painted', cx: 303.2, cy: 290.7, rx: 98.2, ry: 104.3 }, character: null, voice: null },
  { id: 'scene-04', name: 'Bedroom', image: 'assets/scenes/04-bedroom.webp',
    defaultTime: { h: 7, m: 45 },
    clock: { type: 'painted', cx: 1237.4, cy: 206.8, rx: 96.4, ry: 107.2 }, character: null, voice: null },
  { id: 'scene-05', name: 'Train Station', image: 'assets/scenes/05-train-station.webp',
    defaultTime: { h: 2, m: 5 },
    clock: { type: 'painted', cx: 764.1, cy: 139.5, rx: 97.1, ry: 102.5 }, character: null, voice: null },
  { id: 'scene-06', name: 'Park', image: 'assets/scenes/06-park.webp',
    defaultTime: { h: 11, m: 20 },
    clock: { type: 'painted', cx: 1296.7, cy: 116.4, rx: 75.7, ry: 81.6 }, character: null, voice: null },
  { id: 'scene-07', name: 'School Library', image: 'assets/scenes/07-school-library.webp',
    defaultTime: { h: 4, m: 35 },
    clock: { type: 'painted', cx: 268.4, cy: 455.5, rx: 83.4, ry: 106.5 }, character: null, voice: null },
  { id: 'scene-08', name: 'Gym', image: 'assets/scenes/08-gym.webp',
    defaultTime: { h: 9, m: 50 },
    clock: { type: 'painted', cx: 1101.2, cy: 230.0, rx: 94.2, ry: 109.0 }, character: null, voice: null },
  { id: 'scene-09', name: 'Cafeteria', image: 'assets/scenes/09-cafeteria.webp',
    defaultTime: { h: 12, m: 0 },
    clock: { type: 'painted', cx: 1142.9, cy: 161.5, rx: 105.9, ry: 113.5 }, character: null, voice: null },
  // The artwork for this scene is an outdoor town square with a clock tower,
  // not the hallway the original scene list named. Named for what is drawn.
  { id: 'scene-10', name: 'Town Square', image: 'assets/scenes/10-town-square.webp',
    defaultTime: { h: 3, m: 25 },
    clock: { type: 'painted', cx: 1019.1, cy: 214.2, rx: 41.4, ry: 43.8 }, character: null, voice: null },
  { id: 'scene-11', name: 'Art Room', image: 'assets/scenes/11-art-room.webp',
    defaultTime: { h: 6, m: 40 },
    clock: { type: 'painted', cx: 1147.2, cy: 221.7, rx: 98.8, ry: 107.7 }, character: null, voice: null },
  { id: 'scene-12', name: 'Grand Library', image: 'assets/scenes/12-grand-library.webp',
    defaultTime: { h: 10, m: 55 },
    clock: { type: 'painted', cx: 893.1, cy: 151.7, rx: 103.1, ry: 112.3 }, character: null, voice: null },
].map((scene) => Object.freeze({
  ...scene,
  clock: Object.freeze(scene.clock),
  defaultTime: Object.freeze(scene.defaultTime),
})));

export function allScenes() {
  return [...SCENES];
}

export function getScene(id) {
  return SCENES.find((scene) => scene.id === id) || null;
}
