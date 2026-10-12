'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const {makeEnvironment, gameDirectory} = require('./environment.cjs');

// Real Three.js cameras, geometry, scene graphs, instances and raycasting.
// Only WebGL output and the label canvas drawing are stubs; these tests do not
// claim to exercise a browser, a GPU, OrbitControls events, or visual appearance.
const modules = Promise.all([
  import(pathToFileURL(path.join(gameDirectory, 'vendor/three.module.js')).href),
  import(pathToFileURL(path.join(gameDirectory, 'renderer-3d.js')).href),
]);
const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

function canvas(width = 850, height = 600) {
  const context = new Proxy({}, {get: (target, key) => key in target ? target[key] : () => {}, set: (target, key, value) => {target[key] = value; return true;}});
  return {width, height, clientWidth: width, clientHeight: height, getContext: () => context,
    getBoundingClientRect() {return {left: 11, top: 13, width: this.clientWidth, height: this.clientHeight};},
    addEventListener() {}, removeEventListener() {}};
}

const look = {skin: '#e0ac85', hair: '#6b4226', shirt: '#e05a47', pants: '#2c3e50'};
const staff = extra => ({id: 'S0', isStaff: true, role: 'express', tier: 'Specialist', x: 1145, y: 740, facing: 'left', walk: 0, path: [], state: 'talking', look: {...look}, ...extra});
const customer = extra => ({id: 'C0', isStaff: false, x: 700, y: 410, facing: 'down', walk: 0, path: [], state: 'waiting', look: {...look}, ...extra});
const snapshot = extra => ({customers: [], staff: [], selected: null, time: 600, paused: false, ...extra});

async function fixture({width = 850, height = 600, world = false} = {}) {
  const [THREE, {BetaFloorRenderer}] = await modules;
  global.document = {createElement: type => {assert.equal(type, 'canvas'); return canvas();}};
  const view = Object.create(BetaFloorRenderer.prototype);
  const camera = new THREE.OrthographicCamera(-12, 12, 12, -12, 0.1, 120);
  Object.assign(view, {canvas: canvas(width, height), camera, scene: new THREE.Scene(), layout: null,
    geometries: new Set(), materials: new Map(), textures: new Set(), actorGeometry: new Map(), armGeometry: new Map(), legGeometry: new Map(),
    actors: new Map(), pickables: [], tables: new Map(), bubbles: new Map(), elapsed: 0, view: 'overview', focused: false, disposed: false,
    raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2(), projectVector: new THREE.Vector3(),
    characterMaterial: new THREE.MeshLambertMaterial({vertexColors: true}),
    selectionRing: new THREE.Mesh(), tableSelection: new THREE.LineSegments(new THREE.BufferGeometry()),
    controls: {target: new THREE.Vector3(), update() {camera.lookAt(this.target); camera.updateMatrixWorld(true);}},
    renderer: {setSize() {}, getPixelRatio: () => 1, info: {render: {calls: 0, triangles: 0}}},
  });
  view.baseGeometry = {
    box: view.keep(new THREE.BoxGeometry(1, 1, 1)), sphere: view.keep(new THREE.SphereGeometry(1, 10, 7)),
    tinySphere: view.keep(new THREE.SphereGeometry(1, 6, 4)), cylinder: view.keep(new THREE.CylinderGeometry(1, 1, 1, 10)),
    circle: view.keep(new THREE.CircleGeometry(1, 20)), leaf: view.keep(new THREE.IcosahedronGeometry(1, 1)),
    hair: view.keep(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.48)),
    waitRing: view.keep(new THREE.RingGeometry(0.215, 0.24, 24)),
  };
  const env = makeEnvironment({seed: 0x3dbe7a});
  const layout = JSON.parse(JSON.stringify(env.context.PLFloorView.snapshot().layout));
  if (world) view.buildWorld(deepFreeze(layout));
  else {view.layout = layout; view.setView('overview');}
  return {THREE, view, layout};
}

test('Three.js scene math only, without WebGL: frozen simulation entities remain unchanged and finite', async () => {
  const {view} = await fixture();
  const input = deepFreeze(snapshot({staff: [staff()], customers: [customer({walk: 1, path: [{x: 740, y: 410}]})]}));
  const before = JSON.stringify(input);
  view.reconcile(input, 1 / 60);
  view.reconcile(input, 1 / 60);
  assert.equal(JSON.stringify(input), before);
  assert.equal(view.actors.size, 2);
  view.scene.traverse(object => {
    for (const axis of ['x', 'y', 'z']) assert.ok(Number.isFinite(object.rotation[axis]), `${object.type} rotation ${axis}`);
    if (object.isMesh && object.geometry.getAttribute('position')) for (const value of object.geometry.getAttribute('position').array) assert.ok(Number.isFinite(value));
  });
});

test('pause freezes articulated walking and speaking poses while the camera remains independent', async () => {
  const {view} = await fixture();
  const speaker = deepFreeze(staff());
  const walker = deepFreeze(customer({walk: 2, path: [{x: 740, y: 410}]}));
  view.reconcile(snapshot({staff: [speaker], customers: [walker]}), 0.05);
  view.reconcile(snapshot({staff: [speaker], customers: [{...walker, walk: 3}]}), 0.05);
  const pose = () => [...view.actors.values()].map(actor => ({bodyY: actor.body.position.y, yaw: actor.body.rotation.y,
    limbs: Object.values(actor.limbs).map(limb => [limb.rotation.x, limb.rotation.z])}));
  const before = pose();
  for (let frame = 0; frame < 5; frame++) view.reconcile(snapshot({staff: [speaker], customers: [walker], paused: true}), 0.1);
  assert.deepEqual(pose(), before);
  view.setView('top');
  assert.deepEqual(pose(), before);
});

test('customers exiting after purchase remain visible until gone; hidden and departed people release pick targets', async () => {
  const {view} = await fixture();
  const leaving = deepFreeze(customer({state: 'leaving', outcome: 'bought', bought: true, path: [{x: 1250, y: -10}]}));
  view.reconcile(snapshot({customers: [leaving], staff: [staff()]}), 1 / 60);
  assert.equal(view.actors.size, 2);
  assert.equal(view.actors.get('c:C0').bag.visible, true);
  view.reconcile(snapshot({customers: [{...leaving, gone: true}], staff: [staff({hidden: true})]}), 1 / 60);
  assert.equal(view.actors.size, 0);
  assert.equal(view.pickables.length, 0);
});

test('a recycled person ID keeps mesh identity and refreshes appearance for a new day', async () => {
  const {view} = await fixture();
  view.reconcile(snapshot({customers: [customer()]}), 1 / 60);
  const actor = view.actors.get('c:C0');
  const root = actor.root, original = actor.bodyMesh.geometry;
  const changed = deepFreeze(customer({look: {...look, skin: '#7a4b2e', shirt: '#6ab04c', pants: '#3b3b44'}}));
  view.reconcile(snapshot({customers: [changed]}), 1 / 60);
  assert.equal(view.actors.get('c:C0').root, root);
  assert.notEqual(actor.bodyMesh.geometry, original);
  assert.equal(actor.entity, changed);
});

test('real orthographic cameras fit the complete floor in overview and top views on desktop and mobile', async () => {
  const {THREE, view, layout} = await fixture();
  for (const [width, height] of [[850, 600], [360, 600], [1200, 500]]) {
    view.canvas.clientWidth = width; view.canvas.clientHeight = height;
    for (const mode of ['overview', 'top']) {
      view.setView(mode);
      for (const x of [0, layout.width]) for (const y of [0, layout.height]) {
        const projected = view.point(x, y, 0).project(view.camera);
        assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, `${mode} ${width}×${height} corner ${x},${y}`);
        assert.ok(projected.z > -1 && projected.z < 1);
      }
      assert.ok(view.camera instanceof THREE.OrthographicCamera);
    }
  }
});

test('nonselectable static fixtures use real InstancedMesh batches while tables and labels keep their identities', async () => {
  const {THREE, view, layout} = await fixture({world: true});
  const stats = view.getStats();
  assert.ok(stats.staticMeshesBefore > 500, 'The fixture includes the full store accessory display');
  assert.ok(stats.staticDrawCalls < stats.staticMeshesBefore / 8, 'Repeated static pieces require far fewer draw calls');
  assert.ok(stats.staticBatches > 5);
  let instances = 0, labels = 0;
  view.world.traverse(object => {
    if (object.isInstancedMesh) {
      assert.ok(object instanceof THREE.InstancedMesh);
      instances += object.count;
      assert.ok(object.boundingSphere && Number.isFinite(object.boundingSphere.radius));
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < object.count; i++) {object.getMatrixAt(i, matrix); assert.ok(matrix.elements.every(Number.isFinite));}
    }
    if (object.isSprite) labels++;
  });
  assert.ok(instances > 500);
  assert.ok(labels >= layout.tables.length + layout.support.length);
  assert.equal(view.tables.size, layout.tables.length + layout.support.length);
  for (const {table, group} of view.tables.values()) {
    assert.ok(view.pickables.includes(group));
    assert.deepEqual(group.userData.selection, {type: 'table', name: table.name});
    assert.ok(group.children.some(object => object.isMesh && !object.isInstancedMesh));
  }
});

test('real Three.js raycasting selects string-ID staff, customers and tables after static batching', async () => {
  const {view, layout} = await fixture({world: true});
  const colleague = staff({x: 1000, y: 725});
  const shopper = customer({id: 'customer-string-id', x: 700, y: 410});
  view.reconcile(snapshot({staff: [colleague], customers: [shopper]}), 1 / 60);
  view.setView('top');
  view.scene.updateMatrixWorld(true);
  let selected;
  view.onSelect = hit => {selected = hit;};
  for (const person of [colleague, shopper]) {
    const screen = view.project(person);
    assert.equal(screen.visible, true);
    view.selectAt(screen.x, screen.y);
    assert.deepEqual(selected, {type: 'person', id: person.id, isStaff: person.isStaff});
  }
  const table = layout.tables.find(table => table.name === 'B1');
  const tableScreen = view.project({x: table.x + table.w / 2, y: table.y + table.h / 2});
  view.selectAt(tableScreen.x, tableScreen.y);
  assert.deepEqual(selected, {type: 'table', name: 'B1'});
  const blank = view.project({x: 50, y: 50});
  view.selectAt(blank.x, blank.y);
  assert.equal(selected, null);
});
