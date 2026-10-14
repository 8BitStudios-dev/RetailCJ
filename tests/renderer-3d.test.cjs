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
  const [THREE, {FloorRenderer}] = await modules;
  global.document = {createElement: type => {assert.equal(type, 'canvas'); return canvas();}};
  const view = Object.create(FloorRenderer.prototype);
  const camera = new THREE.OrthographicCamera(-12, 12, 12, -12, 0.1, 120);
  Object.assign(view, {canvas: canvas(width, height), camera, scene: new THREE.Scene(), layout: null,
    geometries: new Set(), materials: new Map(), textures: new Set(), actorGeometry: new Map(), armGeometry: new Map(), legGeometry: new Map(),
    actors: new Map(), pickables: [], tables: new Map(), bubbles: new Map(), elapsed: 0, view: 'overview', focused: false, disposed: false,
    raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2(), projectVector: new THREE.Vector3(),
    characterMaterial: new THREE.MeshLambertMaterial({vertexColors: true}),
    selectionRing: new THREE.Mesh(), tableSelection: new THREE.LineSegments(new THREE.BufferGeometry()),
    controls: {target: new THREE.Vector3(), update() {camera.lookAt(this.target); camera.updateMatrixWorld(true);}},
    renderer: {setSize() {}, render() {}, getPixelRatio: () => 1, info: {render: {calls: 0, triangles: 0}}},
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
  return {THREE, view, layout, env};
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

test('Product, Genius Bar and Express cameras frame their real point, customers and queues through desktop/mobile resizes', async () => {
  const {THREE, view, layout, env} = await fixture();
  const unchangedLayout = JSON.stringify(layout);
  assert.equal(env.context.PLFloorView.snapshot().layout.pointProduct, env.evaluate('POINT_IN'));
  assert.equal(env.context.PLFloorView.snapshot().layout.pointGenius, env.evaluate('POINT_GB'));
  assert.deepEqual(layout.pointProduct, JSON.parse(env.evaluate('JSON.stringify(POINT_IN)')));
  assert.deepEqual(layout.pointGenius, JSON.parse(env.evaluate('JSON.stringify(POINT_GB)')));

  const assertInside = (position, description) => {
    const screen = position.clone().project(view.camera);
    assert.ok(Math.abs(screen.x) < 0.99 && Math.abs(screen.y) < 0.99,
      `${description} is clipped: NDC ${screen.x.toFixed(3)},${screen.y.toFixed(3)}`);
    assert.ok(screen.z > -1 && screen.z < 1, `${description} is outside the depth range`);
  };
  for (const [mode, point] of [['product', layout.pointProduct], ['genius', layout.pointGenius], ['express', layout.express]]) {
    assert.ok(point && point.talk && point.line.length > 0, `${mode} supplies the actual simulation point and queue`);
    const locations = [point, point.talk, ...point.line, ...(mode === 'product' ? [layout.door] : [])];
    const people = locations.slice(1).map((location, index) => customer({id: `${mode}-${index}`,
      x: location.x, y: location.y, state: 'waiting'}));
    view.reconcile(snapshot({staff: [staff({id: mode, x: point.x, y: point.y, state: 'idle'})], customers: people}), 0);
    view.canvas.clientWidth = 850; view.canvas.clientHeight = 600;
    view.setView(mode);
    assert.equal(view.view, mode, 'The requested point is a real camera view, not an overview fallback');
    const target = view.controls.target.clone();
    const cameraPosition = view.camera.position.clone();

    // Resize only: a selected point must survive orientation changes without
    // selecting it again, and its entire real queue must remain in the frame.
    for (const [width, height] of [[850, 600], [360, 700], [1280, 480], [390, 600], [850, 600]]) {
      view.canvas.clientWidth = width; view.canvas.clientHeight = height;
      view.resize();
      assert.equal(view.view, mode);
      assert.ok(view.controls.target.equals(target), `${mode} focus moved after resize`);
      assert.ok(view.camera.position.equals(cameraPosition), `${mode} viewing direction moved after resize`);
      assert.equal(view.focused, false, 'A point view is independent of following a selected person');
      const description = `${mode} ${width}×${height}`;
      for (const [index, location] of locations.entries()) {
        for (const height of [0, 1.1]) assertInside(view.point(location.x, location.y, height), `${description} point ${index} height ${height}`);
      }
      // Use the real merged Three.js body geometry, not just actor centers.
      // This catches a queue fitting while a character's head or limbs clip.
      view.scene.updateMatrixWorld(true);
      for (const actor of view.actors.values()) {
        const bounds = new THREE.Box3().setFromObject(actor.body);
        assert.ok(bounds.getSize(new THREE.Vector3()).length() > 0.7);
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) assertInside(new THREE.Vector3(x, y, z), `${description} actor ${actor.entity.id}`);
      }
    }
  }
  assert.equal(JSON.stringify(layout), unchangedLayout, 'Framing cannot modify the simulation layout');
});

test('nonselectable static fixtures use real InstancedMesh batches while tables and labels keep their identities', async () => {
  const {THREE, view, layout} = await fixture({world: true});
  const stats = view.getStats();
  assert.ok(stats.staticMeshesBefore > 500, 'The fixture includes the full store accessory display');
  assert.ok(stats.staticDrawCalls < stats.staticMeshesBefore / 8, 'Repeated static pieces require far fewer draw calls');
  assert.ok(stats.staticBatches > 5);
  assert.ok(stats.tableDrawCalls < stats.tableMeshesBefore, 'Detailed selectable displays must also benefit from batching');
  assert.ok(stats.tableDrawCalls <= (layout.tables.length + layout.support.length) * 36, 'Display detail must keep table draw calls bounded');
  assert.ok(stats.tableBatches > 0);
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
    assert.ok(group.children.some(object => object.isMesh), 'A selectable table keeps real geometry, including instanced parts');
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
  for (const table of [...layout.tables, ...layout.support]) {
    // Aim at the solid tabletop, not the intentional central cable slit.
    const tableScreen = view.project({x: table.x + table.w * 0.22, y: table.y + table.h * 0.18});
    assert.equal(tableScreen.visible, true);
    view.selectAt(tableScreen.x, tableScreen.y);
    assert.deepEqual(selected, {type: 'table', name: table.name});
  }
  const blank = view.project({x: 50, y: 50});
  view.selectAt(blank.x, blank.y);
  assert.equal(selected, null);
});

test('the personal camera follows frozen player snapshots while preserving orbit, zoom, pause and mobile framing', async () => {
  const {THREE, view, layout} = await fixture();
  const first = deepFreeze(staff({id: 'PLAYER', isPlayer: true, role: 'specialist', x: 900, y: 330, state: 'idle'}));
  view.setView('player', first);
  assert.equal(view.view, 'player');
  assert.equal(view.focused, true);
  assert.equal(view.controls.enablePan, false, 'Following permits rotation and zoom while retaining the player as its anchor');
  const initial = view.point(first.x, first.y);
  assert.ok(Math.abs(view.controls.target.x - initial.x) < 1e-9);
  assert.ok(Math.abs(view.controls.target.z - initial.z) < 1e-9);

  // Simulate an orbit/zoom adjustment independent of gameplay. A follow update
  // must translate the existing camera, not reset the player's chosen angle.
  const offset = new THREE.Vector3(-5, 6, 4);
  view.camera.position.copy(view.controls.target).add(offset);
  view.camera.zoom = 1.7;
  view.camera.updateProjectionMatrix();
  view.controls.update();
  const moved = deepFreeze({...first, x: 1150, y: 900, path: [{x: 1250, y: 950}], walk: 1});
  const input = deepFreeze(snapshot({layout, staff: [moved], player: moved}));
  const before = JSON.stringify(input);
  view.render(input, 0.05);
  const center = view.point(moved.x, moved.y);
  assert.ok(Math.abs(view.controls.target.x - center.x) < 1e-9);
  assert.ok(Math.abs(view.controls.target.z - center.z) < 1e-9);
  assert.ok(view.camera.position.clone().sub(view.controls.target).distanceTo(offset) < 1e-9);
  assert.equal(view.camera.zoom, 1.7);
  assert.equal(JSON.stringify(input), before, 'The camera cannot move or mutate the simulation player');

  const stationaryTarget = view.controls.target.clone();
  const stationaryPosition = view.camera.position.clone();
  const paused = deepFreeze({...input, paused: true});
  for (let frame = 0; frame < 6; frame++) view.render(paused, 0.1);
  assert.ok(view.controls.target.equals(stationaryTarget));
  assert.ok(view.camera.position.equals(stationaryPosition));
  assert.equal(view.camera.zoom, 1.7);
  for (const [width, height] of [[360, 700], [1280, 480], [390, 600], [850, 600]]) {
    view.canvas.clientWidth = width; view.canvas.clientHeight = height;
    view.resize();
    assert.equal(view.view, 'player');
    assert.ok(view.controls.target.equals(stationaryTarget));
    assert.ok(view.camera.position.clone().sub(view.controls.target).distanceTo(offset) < 1e-9);
    assert.equal(view.camera.zoom, 1.7);
    view.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(view.actors.get('s:PLAYER').body);
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const screen = new THREE.Vector3(x, y, z).project(view.camera);
        assert.ok(Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1, `The complete player must fit ${width}×${height}`);
      }
  }
});

test('following holds a hidden player, resolves a new entity with the same ID, and stops for manual cameras or absent players', async () => {
  const {view, layout} = await fixture();
  const first = deepFreeze(staff({id: 'PLAYER', isPlayer: true, role: 'specialist', x: 900, y: 330, state: 'idle'}));
  view.setView('player', first);
  view.render(deepFreeze(snapshot({layout, staff: [first], player: first})), 0.05);
  const heldTarget = view.controls.target.clone();
  const heldCamera = view.camera.position.clone();
  const hidden = deepFreeze({...first, x: -300, y: 2200, hidden: true, state: 'onBreak'});
  view.render(deepFreeze(snapshot({layout, staff: [hidden], player: hidden})), 0.05);
  assert.equal(view.view, 'player');
  assert.ok(view.controls.target.equals(heldTarget), 'A hidden player must not drag the camera outside the floor');
  assert.ok(view.camera.position.equals(heldCamera));

  const nextDay = deepFreeze({...first, x: 260, y: 1650, state: 'idle'});
  assert.notEqual(nextDay, first);
  view.render(deepFreeze(snapshot({layout, staff: [nextDay], player: nextDay})), 0.05);
  const currentPoint = view.point(nextDay.x, nextDay.y);
  assert.ok(Math.abs(view.controls.target.x - currentPoint.x) < 1e-9);
  assert.ok(Math.abs(view.controls.target.z - currentPoint.z) < 1e-9);
  assert.equal(view.actors.get('s:PLAYER').entity, nextDay, 'Both geometry and follow resolve the current entity');

  view.setView('express');
  const expressTarget = view.controls.target.clone();
  const expressCamera = view.camera.position.clone();
  const otherPosition = deepFreeze({...nextDay, x: 1200, y: 170});
  view.render(deepFreeze(snapshot({layout, staff: [otherPosition], player: otherPosition})), 0.05);
  assert.equal(view.view, 'express');
  assert.ok(view.controls.target.equals(expressTarget));
  assert.ok(view.camera.position.equals(expressCamera), 'A manual camera must stop automatic following');
  assert.equal(view.controls.enablePan, true);

  view.setView('player', otherPosition);
  view.render(deepFreeze(snapshot({layout, staff: [], player: null})), 0.05);
  assert.equal(view.view, 'overview', 'Removing the eligible player cannot keep stale follow state');
  assert.equal(view.focused, false);
  assert.equal(view.controls.enablePan, true);
});

test('the first 3D world build keeps the personal view and anchors it to the first current player snapshot', async () => {
  const {view, layout} = await fixture();
  const player = deepFreeze(staff({id: 'PLAYER', isPlayer: true, role: 'specialist', x: 700, y: 410, state: 'idle'}));
  view.layout = null;
  view.setView('player', player);
  const frame = deepFreeze(snapshot({layout, staff: [player], player}));
  const before = JSON.stringify(frame);
  view.render(frame, 0);
  assert.equal(view.view, 'player');
  assert.equal(view.layout, layout);
  assert.equal(view.actors.get('s:PLAYER').entity, player);
  const anchor = view.point(player.x, player.y);
  assert.ok(Math.abs(view.controls.target.x - anchor.x) < 1e-9);
  assert.ok(Math.abs(view.controls.target.z - anchor.z) < 1e-9);
  assert.equal(JSON.stringify(frame), before);
});

test('detailed store displays remain finite and distinct within furniture bounds and release all their shared resources', async () => {
  const {THREE, view, layout} = await fixture({world: true});
  const layoutBefore = JSON.stringify(layout);
  const geometries = new Set(), materials = new Set(), textures = new Set(), instances = new Set();
  const cachedMaterials = new Set(view.materials.values());
  view.world.traverse(object => {
    if (object.geometry && !object.isSprite) {
      geometries.add(object.geometry);
      assert.ok(view.geometries.has(object.geometry), 'World geometry has an explicit renderer owner');
      const positions = object.geometry.getAttribute('position');
      if (positions) for (const coordinate of positions.array) assert.ok(Number.isFinite(coordinate));
    }
    if (object.isInstancedMesh) instances.add(object);
    for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
      materials.add(material);
      if (object.isMesh) assert.ok(cachedMaterials.has(material), 'Furniture and display materials use the shared renderer cache');
      for (const value of Object.values(material)) if (value && value.isTexture) {
        textures.add(value);
        assert.ok(view.textures.has(value), 'Procedural surfaces and display textures have an explicit renderer owner');
      }
    }
  });
  assert.ok(textures.size > 0);
  const signatures = new Map();
  view.world.updateMatrixWorld(true);
  for (const {table, group} of view.tables.values()) {
    const inverse = group.matrixWorld.clone().invert();
    const bounds = new THREE.Box3();
    const displayParts = [];
    group.traverse(object => {
      if (!object.isMesh || !object.visible) return;
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      if (objectMaterials.every(material => material.transparent && material.opacity < 0.25)) return; // floor shadows and invisible hit surfaces
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const objectMatrix = inverse.clone().multiply(object.matrixWorld);
      const count = object.isInstancedMesh ? object.count : 1;
      for (let index = 0; index < count; index++) {
        const localMatrix = objectMatrix.clone();
        if (object.isInstancedMesh) {
          const instance = new THREE.Matrix4(); object.getMatrixAt(index, instance);
          assert.ok(instance.elements.every(Number.isFinite));
          localMatrix.multiply(instance);
        }
        const part = object.geometry.boundingBox.clone().applyMatrix4(localMatrix);
        assert.ok([...part.min.toArray(), ...part.max.toArray()].every(Number.isFinite));
        bounds.union(part);
        if (part.max.y > 0.84) {
          const size = part.getSize(new THREE.Vector3()), center = part.getCenter(new THREE.Vector3());
          displayParts.push([...size.toArray(), ...center.toArray()].map(value => value.toFixed(3)).join(','));
        }
      }
    });
    assert.equal(bounds.isEmpty(), false, `${table.name} has physical furniture`);
    const size = bounds.getSize(new THREE.Vector3());
    const support = table.kind === 'support';
    assert.ok(size.x <= table.w * 0.01 + (support ? 1.4 : 0.2), `${table.name} must not extend unreasonably into adjacent aisles`);
    assert.ok(size.z <= table.h * 0.01 + 0.4, `${table.name} keeps its layout footprint along the aisle`);
    assert.ok(bounds.min.y >= -0.03 && bounds.max.y < 1.8, `${table.name} has plausible finite furniture height`);
    if (['iphone', 'ipad', 'mac', 'watch'].includes(table.product)) {
      assert.ok(displayParts.length > 0, `${table.product} has a display above the table`);
      if (!signatures.has(table.product)) signatures.set(table.product, displayParts.sort().join('|'));
    }
  }
  assert.equal(signatures.size, 4, 'All four product families are represented');
  assert.equal(new Set(signatures.values()).size, 4, 'Product families have different physical displays');
  assert.equal(JSON.stringify(layout), layoutBefore, 'Furniture cannot move simulation tables, stools or queues');

  const resources = new Set([...geometries, ...materials, ...textures, ...instances]);
  const disposed = new Map([...resources].map(resource => [resource, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
  view.resizeObserver = {disconnect() {}};
  view.controls.dispose = () => {};
  view.renderer.dispose = () => {};
  view.dispose();
  for (const [resource, count] of disposed) assert.ok(count > 0, `${resource.type || 'texture'} must be released when rebuilding a renderer`);
  assert.equal(view.pickables.length, 0);
  const firstDisposal = [...disposed.values()];
  view.dispose();
  assert.deepEqual([...disposed.values()], firstDisposal, 'Disposing twice must not release resources again');
});
