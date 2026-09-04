// Clock sizes are a percentage of the stage's smaller dimension and vary per
// scene so layout gets tested at more than one scale. The authored floor is
// 20%. The 88px CSS floor already rescues a tiny stage, but it is a last
// resort: at 20% a clock clears it on its own at ordinary classroom sizes
// rather than sitting pinned to the emergency minimum. The clock is the
// content in this game, so it should not be the smallest thing that still works.
export const SCENES = Object.freeze([
  { id: 'scene-01', name: 'Classroom', placeholder: 'Placeholder Scene 1', clock: { x: 18, y: 20, size: 22, type: 'analog' }, background: null, character: null, voice: null },
  { id: 'scene-02', name: 'Kitchen', placeholder: 'Placeholder Scene 2', clock: { x: 80, y: 18, size: 20, type: 'analog' }, background: null, character: null, voice: null },
  { id: 'scene-03', name: 'Living Room', placeholder: 'Placeholder Scene 3', clock: { x: 22, y: 46, size: 26, type: 'analog' }, background: null, character: null, voice: null },
  { id: 'scene-04', name: 'Bedroom', placeholder: 'Placeholder Scene 4', clock: { x: 76, y: 44, size: 24, type: 'analog' }, background: null, character: null, voice: null },
  { id: 'scene-05', name: 'Train Station', placeholder: 'Placeholder Scene 5', clock: { x: 50, y: 14, size: 20, type: 'analog' }, background: null, character: null, voice: null },
  { id: 'scene-06', name: 'Park', placeholder: 'Placeholder Scene 6', clock: { x: 72, y: 12, size: 20, type: 'analog' }, background: null, character: null, voice: null },
  { id: 'scene-07', name: 'Library', placeholder: 'Placeholder Scene 7', clock: { x: 16, y: 66, size: 24, type: 'analog' }, background: null, character: null, voice: null },
  { id: 'scene-08', name: 'Gym', placeholder: 'Placeholder Scene 8', clock: { x: 30, y: 13, size: 20, type: 'analog' }, background: null, character: null, voice: null },
  { id: 'scene-09', name: 'Cafeteria', placeholder: 'Placeholder Scene 9', clock: { x: 50, y: 52, size: 30, type: 'analog' }, background: null, character: null, voice: null },
  { id: 'scene-10', name: 'Hallway', placeholder: 'Placeholder Scene 10', clock: { x: 82, y: 62, size: 22, type: 'analog' }, background: null, character: null, voice: null },
  { id: 'scene-11', name: 'Music Room', placeholder: 'Placeholder Scene 11', clock: { x: 26, y: 58, size: 27, type: 'analog' }, background: null, character: null, voice: null },
  { id: 'scene-12', name: 'School Gate', placeholder: 'Placeholder Scene 12', clock: { x: 38, y: 18, size: 20, type: 'analog' }, background: null, character: null, voice: null },
].map((scene) => Object.freeze({ ...scene, clock: Object.freeze(scene.clock) })));

export function allScenes() {
  return [...SCENES];
}

export function getScene(id) {
  return SCENES.find((scene) => scene.id === id) || null;
}
