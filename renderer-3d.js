import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

// The view consumes the existing floor simulation. It owns no game state and
// never changes an entity, a queue slot, or a saved career.
const SCALE = 0.01;
const FACE = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };
const TALK_STATES = new Set(['talking', 'probe', 'listen', 'advise', 'helping', 'handover', 'atBar', 'repair', 'presenting']);
const COLORS = { wood: '#be9367', edge: '#a7794f', floor: '#e8e6e0', ink: '#233246', blue: '#1674cf', green: '#689151' };

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function color(value, fallback) {
  try { return new THREE.Color(value || fallback); } catch { return new THREE.Color(fallback); }
}

export class FloorRenderer {
  constructor({ canvas, onSelect = () => {} }) {
    this.canvas = canvas;
    this.onSelect = onSelect;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#d9e4e8');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.camera = new THREE.OrthographicCamera(-12, 12, 12, -12, 0.1, 120);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI * 0.42;
    this.controls.minZoom = 0.55;
    this.controls.maxZoom = 5;
    this.controls.screenSpacePanning = true;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.85;
    this.controls.panSpeed = 0.85;
    this.materials = new Map();
    this.geometries = new Set();
    this.textures = new Set();
    this.actorGeometry = new Map();
    this.armGeometry = new Map();
    this.legGeometry = new Map();
    this.bubbles = new Map();
    this.actors = new Map();
    this.pickables = [];
    this.tables = new Map();
    this.layout = null;
    this.view = 'overview';
    this.focused = false;
    this.elapsed = 0;
    this.disposed = false;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pointerStart = null;
    this.projectVector = new THREE.Vector3();
    this.scene.add(new THREE.HemisphereLight('#fffaf0', '#8a9baf', 2.15));
    const key = new THREE.DirectionalLight('#fff0d5', 2.8);
    key.position.set(-8, 16, 9);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#dceeff', 1.15);
    rim.position.set(9, 9, -10);
    this.scene.add(rim);
    this.baseGeometry = {
      box: this.keep(new THREE.BoxGeometry(1, 1, 1)),
      sphere: this.keep(new THREE.SphereGeometry(1, 10, 7)),
      tinySphere: this.keep(new THREE.SphereGeometry(1, 6, 4)),
      cylinder: this.keep(new THREE.CylinderGeometry(1, 1, 1, 10)),
      circle: this.keep(new THREE.CircleGeometry(1, 20)),
      leaf: this.keep(new THREE.IcosahedronGeometry(1, 1)),
      hair: this.keep(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.48)),
      waitRing: this.keep(new THREE.RingGeometry(0.215, 0.24, 24)),
    };
    this.characterMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.selectionRing = new THREE.Mesh(this.keep(new THREE.RingGeometry(0.25, 0.29, 36)), this.material('#1783ef', { basic: true, opacity: 0.95 }));
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);
    this.tableSelection = new THREE.LineSegments(this.keep(new THREE.BufferGeometry()), new THREE.LineBasicMaterial({ color: '#1783ef', linewidth: 2 }));
    this.tableSelection.visible = false;
    this.scene.add(this.tableSelection);
    this.handlePointerDown = event => {
      if (event.isPrimary === false) { this.pointerStart = null; return; }
      if (event.button > 0) return;
      this.pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    };
    this.handlePointerUp = event => {
      const start = this.pointerStart;
      this.pointerStart = null;
      if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7) return;
      this.selectAt(event.clientX, event.clientY);
    };
    this.handlePointerCancel = () => { this.pointerStart = null; };
    canvas.addEventListener('pointerdown', this.handlePointerDown, { passive: true });
    canvas.addEventListener('pointerup', this.handlePointerUp, { passive: true });
    canvas.addEventListener('pointercancel', this.handlePointerCancel, { passive: true });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.setView('overview');
  }

  keep(geometry) { this.geometries.add(geometry); return geometry; }

  material(hex, options = {}) {
    const key = `${hex}:${options.basic || false}:${options.opacity ?? 1}:${options.roughness ?? 0.8}:${options.metalness ?? 0}`;
    if (this.materials.has(key)) return this.materials.get(key);
    const common = { color: hex, transparent: (options.opacity ?? 1) < 1, opacity: options.opacity ?? 1, side: THREE.DoubleSide };
    const material = options.basic ? new THREE.MeshBasicMaterial({ ...common, depthWrite: !common.transparent }) :
      new THREE.MeshStandardMaterial({ ...common, roughness: options.roughness ?? 0.8, metalness: options.metalness ?? 0 });
    this.materials.set(key, material);
    return material;
  }

  mesh(parent, geometry, material, x, y, z, sx = 1, sy = 1, sz = 1) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  }

  box(parent, hex, x, y, z, sx, sy, sz, options) {
    return this.mesh(parent, this.baseGeometry.box, this.material(hex, options), x, y, z, sx, sy, sz);
  }

  point(x, y, height = 0) {
    return new THREE.Vector3((x - (this.layout?.width || 1440) / 2) * SCALE, height, (y - (this.layout?.height || 1900) / 2) * SCALE);
  }

  // Parts are merged with vertex colors, so a person has one static body mesh
  // and just four articulated limbs instead of dozens of separate draw calls.
  mergeParts(parts) {
    const positions = [], normals = [], colors = [];
    const matrix = new THREE.Matrix4();
    const normalMatrix = new THREE.Matrix3();
    const vector = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (const part of parts) {
      const base = this.baseGeometry[part.shape];
      const geometry = base.index ? base.toNonIndexed() : base;
      matrix.compose(new THREE.Vector3(...part.position), quaternion.setFromEuler(new THREE.Euler(...(part.rotation || [0, 0, 0]))), scale.set(...part.scale));
      normalMatrix.getNormalMatrix(matrix);
      const rgb = color(part.color, '#888888');
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      for (let i = 0; i < position.count; i++) {
        vector.fromBufferAttribute(position, i).applyMatrix4(matrix);
        positions.push(vector.x, vector.y, vector.z);
        vector.fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix);
        normals.push(vector.x, vector.y, vector.z);
        colors.push(rgb.r, rgb.g, rgb.b);
      }
      if (geometry !== base) geometry.dispose();
    }
    const combined = this.keep(new THREE.BufferGeometry());
    combined.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    combined.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    combined.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    combined.computeBoundingSphere();
    return combined;
  }

  label(text, { width = 0.7, height = 0.24, background = '#f5f7f9', foreground = COLORS.ink, fontSize = 44 } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = background;
    roundedRect(context, 4, 10, 376, 106, 28);
    context.fill();
    context.fillStyle = foreground;
    context.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 192, 66, 355);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(texture);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(width, height, 1);
    return sprite;
  }

  buildWorld(layout) {
    this.layout = layout;
    this.world = new THREE.Group();
    this.scene.add(this.world);
    const width = layout.width * SCALE, height = layout.height * SCALE;
    this.box(this.world, '#b7c1c5', 0, -0.23, 0, width + 0.42, 0.28, height + 0.42);
    const floor = this.box(this.world, COLORS.floor, 0, -0.055, 0, width, 0.12, height);
    floor.userData.selection = null;
    const tileVertices = [];
    for (let x = -width / 2; x <= width / 2; x += 0.72) tileVertices.push(x, 0.011, -height / 2, x, 0.011, height / 2);
    for (let z = -height / 2; z <= height / 2; z += 0.72) tileVertices.push(-width / 2, 0.011, z, width / 2, 0.011, z);
    const tileGeometry = this.keep(new THREE.BufferGeometry());
    tileGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tileVertices, 3));
    this.world.add(new THREE.LineSegments(tileGeometry, new THREE.LineBasicMaterial({ color: '#d6d5d0', transparent: true, opacity: 0.65 })));
    this.box(this.world, '#fafaf7', -width / 2 + 0.14, 0.12, 0, 0.16, 0.24, height);
    this.box(this.world, '#fafaf7', width / 2 - 0.14, 0.12, 0, 0.16, 0.24, height);
    this.box(this.world, '#fafaf7', 0, 0.12, height / 2 - 0.08, width, 0.24, 0.13);

    for (const table of [...(layout.tables || []), ...(layout.support || [])]) this.buildTable(table);
    for (const wall of layout.walls || []) this.buildAccessoryWall(wall);
    for (const tree of layout.trees || []) this.buildTree(tree);
    for (const stool of layout.stools || []) this.buildStool(stool);
    if (layout.screen) this.buildScreen(layout.screen);
    if (layout.express) this.buildPoint(layout.express, 'EXPRESS', 0.91);
    if (layout.pointProduct) this.buildPoint(layout.pointProduct, 'POINT PRODUCT', 1.6);
    if (layout.pointGenius) this.buildPoint(layout.pointGenius, 'POINT GENIUS BAR', 1.85);
    if (layout.door) this.buildDoor(layout.door, 'INGRESSO', '#1680cf');
    if (layout.backDoor) this.buildDoor(layout.backDoor, 'OPERATIONS', '#688c79');
    this.batchStaticWorld();
    this.setView(this.view);
  }

  batchStaticWorld() {
    // These pieces never move and never own a selection target. Preserve the
    // table groups and label sprites; batch only repeated static meshes.
    this.world.updateMatrixWorld(true);
    const inverse = this.world.matrixWorld.clone().invert();
    const groups = new Map();
    this.world.traverse(object => {
      if (!object.isMesh || object.isInstancedMesh || Array.isArray(object.material)) return;
      for (let ancestor = object; ancestor && ancestor !== this.world; ancestor = ancestor.parent) {
        if (ancestor.userData.selection) return;
      }
      const key = `${object.geometry.uuid}:${object.material.uuid}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(object);
    });
    this.staticMeshesBefore = [...groups.values()].reduce((total, meshes) => total + meshes.length, 0);
    this.staticMeshesAfter = groups.size;
    this.staticBatches = 0;
    const matrix = new THREE.Matrix4();
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const batch = new THREE.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
      batch.userData.staticBatch = true;
      meshes.forEach((mesh, index) => {
        matrix.multiplyMatrices(inverse, mesh.matrixWorld);
        batch.setMatrixAt(index, matrix);
        mesh.removeFromParent();
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
      this.world.add(batch);
      this.staticBatches++;
    }
  }

  buildTable(table) {
    const group = new THREE.Group();
    const center = this.point(table.x + table.w / 2, table.y + table.h / 2);
    group.position.copy(center);
    group.userData.selection = { type: 'table', name: table.name };
    this.world.add(group);
    this.tables.set(table.name, { table, group });
    this.pickables.push(group);
    const width = table.w * SCALE, length = table.h * SCALE;
    const shadow = this.mesh(group, this.baseGeometry.circle, this.material('#283447', { basic: true, opacity: 0.10 }), 0.07, 0.018, 0.08, width * 0.7, length * 0.6, 1);
    shadow.rotation.x = -Math.PI / 2;
    this.box(group, COLORS.edge, 0, 0.665, 0, width, 0.09, length);
    this.box(group, COLORS.wood, 0, 0.73, 0, width + 0.012, 0.09, length + 0.018, { roughness: 0.52 });
    for (const x of [-width * 0.32, width * 0.32]) for (const z of [-length * 0.36, length * 0.36]) {
      this.box(group, '#ae845b', x, 0.33, z, 0.075, 0.65, 0.075);
    }
    const label = this.label(table.name, { width: 0.40, height: 0.15, background: table.kind === 'support' ? '#276782' : '#f5f0e6', foreground: table.kind === 'support' ? '#ffffff' : '#725940' });
    label.position.set(0, 0.89, -length * 0.45);
    group.add(label);
    const product = table.product || 'support';
    const palette = ['#578cb0', '#897eae', '#64a59a'];
    for (let i = 0; i < 3; i++) {
      const z = -length * 0.26 + i * length * 0.26;
      if (product === 'mac' || product === 'support') {
        this.box(group, '#d5dce0', 0, 0.792, z, 0.42, 0.023, 0.30, { metalness: 0.32 });
        const screen = this.box(group, '#374556', 0, 0.96, z - 0.12, 0.39, 0.29, 0.027);
        screen.rotation.x = -0.12;
        this.box(group, palette[i], 0, 0.964, z - 0.101, 0.345, 0.24, 0.007, { roughness: 0.35 });
      } else if (product === 'watch') {
        this.box(group, '#f4eee4', 0, 0.80, z, 0.36, 0.05, 0.19);
        for (const x of [-0.10, 0.10]) {
          this.box(group, i % 2 ? '#dfc3a4' : '#414e63', x, 0.835, z, 0.067, 0.01, 0.14);
          this.box(group, '#283445', x, 0.85, z, 0.073, 0.025, 0.07, { roughness: 0.25, metalness: 0.45 });
          this.box(group, '#5ca5cb', x, 0.865, z, 0.054, 0.004, 0.052, { basic: true });
        }
      } else if (product === 'help') {
        if (i === 1) this.box(group, '#efeeea', 0, 0.79, z, 0.36, 0.024, 0.25);
      } else if (product !== 'express') {
        const ipad = product === 'ipad';
        for (const x of ipad ? [0] : [-0.13, 0.13]) {
          this.box(group, '#f3f3f0', x, 0.80, z, ipad ? 0.27 : 0.15, 0.035, ipad ? 0.39 : 0.25);
          this.box(group, '#25313e', x, 0.827, z, ipad ? 0.245 : 0.12, 0.025, ipad ? 0.35 : 0.215, { roughness: 0.22 });
          this.box(group, palette[(i + (x > 0 ? 1 : 0)) % 3], x, 0.843, z, ipad ? 0.215 : 0.10, 0.005, ipad ? 0.30 : 0.178, { basic: true });
        }
      }
    }
    if (product === 'express') {
      this.box(group, '#faf7ed', 0, 0.797, length * 0.15, 0.39, 0.055, 0.32);
      this.box(group, '#364557', 0, 0.825, length * 0.15, 0.18, 0.018, 0.25);
      this.box(group, '#4a94b7', 0, 0.838, length * 0.15, 0.15, 0.01, 0.21);
      this.box(group, '#f7f1e3', 0, 0.805, -length * 0.1, 0.23, 0.075, 0.18);
    }
  }

  buildAccessoryWall(wall) {
    const group = new THREE.Group();
    group.position.copy(this.point(wall.x + wall.w / 2, wall.y + wall.h / 2));
    this.world.add(group);
    const width = wall.w * SCALE, length = wall.h * SCALE;
    this.box(group, '#e7d7c0', 0, 0.70, 0, width, 1.4, length);
    const side = wall.x < (this.layout.width / 2) ? 1 : -1;
    const front = side * (width * 0.5 + 0.011);
    this.box(group, '#f4eee4', front, 0.83, 0, 0.024, 1.07, length - 0.15);
    const shades = ['#d98973', '#7093ae', '#97ad8a', '#dfbe76', '#b4a0b4', '#74878e'];
    for (let z = -length / 2 + 0.45; z < length / 2 - 0.22; z += 0.47) {
      for (let r = 0; r < 3; r++) {
        const index = Math.round((z + length / 2) * 5 + r);
        this.box(group, '#fafaf6', front + side * 0.026, 0.43 + r * 0.29, z, 0.043, 0.205, 0.175);
        this.box(group, shades[index % shades.length], front + side * 0.053, 0.43 + r * 0.29, z, 0.014, 0.157, 0.12);
      }
    }
    this.box(group, '#af8459', front, 0.28, 0, 0.18, 0.055, length - 0.10);
  }

  buildTree(tree) {
    const group = new THREE.Group();
    group.position.copy(this.point(tree.x, tree.y));
    this.world.add(group);
    const radius = tree.r * SCALE;
    const shadow = this.mesh(group, this.baseGeometry.circle, this.material('#345341', { basic: true, opacity: 0.12 }), 0.16, 0.022, 0.1, radius * 1.07, radius * 0.85, 1);
    shadow.rotation.x = -Math.PI / 2;
    this.mesh(group, this.baseGeometry.cylinder, this.material('#e6dfd2'), 0, 0.23, 0, radius * 0.78, 0.45, radius * 0.78);
    this.mesh(group, this.baseGeometry.cylinder, this.material('#776253'), 0, 0.46, 0, radius * 0.72, 0.025, radius * 0.72);
    this.mesh(group, this.baseGeometry.cylinder, this.material('#8a7656'), 0, 0.97, 0, 0.09, 1.05, 0.09);
    const clusters = [[0, 1.93, 0, 0.62], [-0.30, 1.61, 0.12, 0.54], [0.29, 1.70, 0.08, 0.57], [0.04, 1.60, -0.28, 0.49]];
    clusters.forEach(([x, y, z, scale], index) => {
      const leaf = this.mesh(group, this.baseGeometry.leaf, this.material(['#79a266', '#6c9459', '#87ac72', '#5f8a52'][index]), x, y, z, scale, scale * 0.92, scale);
      leaf.rotation.set(index * 0.44, index * 0.75, index * 0.21);
    });
  }

  buildStool(stool) {
    const group = new THREE.Group();
    group.position.copy(this.point(stool.x, stool.y));
    this.world.add(group);
    this.mesh(group, this.baseGeometry.cylinder, this.material('#c79b6c'), 0, 0.39, 0, 0.235, 0.075, 0.235);
    for (const x of [-0.13, 0.13]) for (const z of [-0.13, 0.13]) this.box(group, '#ad8159', x, 0.19, z, 0.032, 0.37, 0.032);
  }

  buildScreen(screen) {
    const group = new THREE.Group();
    group.position.copy(this.point(screen.x + screen.w / 2, screen.y + screen.h / 2));
    this.world.add(group);
    this.box(group, '#1e344b', 0, 1.02, 0, screen.w * SCALE, 1.86, 0.16);
    this.box(group, '#6c9ca6', 0, 1.04, -0.091, screen.w * SCALE - 0.15, 1.68, 0.018, { basic: true });
    this.box(group, '#6c9ca6', 0, 1.04, 0.091, screen.w * SCALE - 0.15, 1.68, 0.018, { basic: true });
    const image = this.box(group, '#a5c6bc', -1.36, 1.04, -0.105, 2.82, 1.68, 0.022, { basic: true });
    image.rotation.z = -0.07;
    const caption = this.label('Today at Apple', { width: 2.12, height: 0.52, foreground: '#ffffff', background: '#365970', fontSize: 42 });
    caption.position.set(0, 2.18, 0);
    group.add(caption);
  }

  buildPoint(station, text, width) {
    const at = this.point(station.x, station.y);
    const marker = this.label(text, { width, height: 0.25, background: '#287dcc', foreground: '#ffffff', fontSize: 40 });
    marker.position.copy(at).add(new THREE.Vector3(0, 1.18, 0.28));
    this.world.add(marker);
    const geometry = this.keep(new THREE.RingGeometry(0.06, 0.085, 16));
    const material = this.material('#3288d4', { basic: true, opacity: 0.48 });
    (station.line || []).forEach(spot => {
      const marker = new THREE.Mesh(geometry, material);
      marker.position.copy(this.point(spot.x, spot.y, 0.025));
      marker.rotation.x = -Math.PI / 2;
      this.world.add(marker);
    });
  }

  buildDoor(door, text, tint) {
    const point = this.point(door.x, door.y);
    this.box(this.world, tint, point.x, 0.025, point.z, 1.1, 0.035, 0.44, { roughness: 0.65 });
    const label = this.label(text, { width: text === 'INGRESSO' ? 1.2 : 1.5, height: 0.28, background: tint, foreground: '#ffffff', fontSize: 38 });
    label.position.set(point.x, 0.32, point.z + (text === 'INGRESSO' ? 0.24 : -0.3));
    this.world.add(label);
  }

  bodyGeometry(entity) {
    const look = entity.look || {};
    const skin = look.skin || '#d7a483', hair = look.hair || '#654731';
    const shirt = entity.isStaff ? '#1475bd' : look.shirt || '#b36d67';
    const pants = look.pants || '#3d4b64';
    const key = [skin, hair, shirt, pants, !!entity.isStaff].join(':');
    if (!this.actorGeometry.has(key)) {
      const parts = [
        { shape: 'box', position: [0, 0.49, 0], scale: [0.24, 0.285, 0.16], color: shirt },
        { shape: 'box', position: [0, 0.342, 0], scale: [0.215, 0.09, 0.155], color: pants },
        { shape: 'cylinder', position: [0, 0.666, 0], scale: [0.052, 0.067, 0.052], color: skin },
        { shape: 'sphere', position: [0, 0.802, 0.008], scale: [0.149, 0.157, 0.143], color: skin },
        { shape: 'hair', position: [0, 0.817, 0], scale: [0.155, 0.153, 0.152], color: hair },
        { shape: 'tinySphere', position: [-0.052, 0.815, 0.14], scale: [0.015, 0.018, 0.008], color: '#222b36' },
        { shape: 'tinySphere', position: [0.052, 0.815, 0.14], scale: [0.015, 0.018, 0.008], color: '#222b36' },
        { shape: 'tinySphere', position: [0, 0.78, 0.149], scale: [0.02, 0.018, 0.012], color: skin },
        { shape: 'box', position: [0, 0.742, 0.138], scale: [0.037, 0.009, 0.007], color: '#986857' },
      ];
      if (entity.isStaff) parts.push(
        { shape: 'box', position: [0.049, 0.547, 0.085], scale: [0.061, 0.039, 0.008], color: '#ffffff' },
        { shape: 'box', position: [0.049, 0.547, 0.091], scale: [0.030, 0.008, 0.006], color: '#4598d1' },
      );
      this.actorGeometry.set(key, this.mergeParts(parts));
    }
    const armKey = [skin, shirt].join(':');
    if (!this.armGeometry.has(armKey)) this.armGeometry.set(armKey, this.mergeParts([
      { shape: 'cylinder', position: [0, -0.045, 0], scale: [0.047, 0.12, 0.047], color: shirt },
      { shape: 'cylinder', position: [0, -0.142, 0], scale: [0.033, 0.095, 0.033], color: skin },
      { shape: 'tinySphere', position: [0, -0.205, 0], scale: [0.039, 0.047, 0.036], color: skin },
    ]));
    if (!this.legGeometry.has(pants)) this.legGeometry.set(pants, this.mergeParts([
      { shape: 'cylinder', position: [0, -0.126, 0], scale: [0.048, 0.25, 0.047], color: pants },
      { shape: 'box', position: [0, -0.274, 0.025], scale: [0.108, 0.06, 0.168], color: '#34393e' },
      { shape: 'box', position: [0, -0.303, 0.025], scale: [0.11, 0.009, 0.17], color: '#e2e1d8' },
    ]));
    return { body: this.actorGeometry.get(key), arm: this.armGeometry.get(armKey), leg: this.legGeometry.get(pants) };
  }

  createActor(entity, key) {
    const root = new THREE.Group();
    root.userData.selection = { type: 'person', id: entity.id, isStaff: !!entity.isStaff };
    this.scene.add(root);
    const body = new THREE.Group();
    root.add(body);
    const geometry = this.bodyGeometry(entity);
    const bodyMesh = new THREE.Mesh(geometry.body, this.characterMaterial);
    body.add(bodyMesh);
    const limbs = {};
    for (const [name, x, y, mesh] of [['leftArm', -0.16, 0.583, geometry.arm], ['rightArm', 0.16, 0.583, geometry.arm], ['leftLeg', -0.066, 0.31, geometry.leg], ['rightLeg', 0.066, 0.31, geometry.leg]]) {
      const limb = new THREE.Mesh(mesh, this.characterMaterial);
      limb.position.set(x, y, 0);
      body.add(limb);
      limbs[name] = limb;
    }
    const shadow = this.mesh(root, this.baseGeometry.circle, this.material('#243447', { basic: true, opacity: 0.16 }), 0, 0.025, 0, 0.20, 0.17, 1);
    shadow.rotation.x = -Math.PI / 2;
    const waitRing = new THREE.Mesh(this.baseGeometry.waitRing, this.material('#e29d32', { basic: true, opacity: 0.7 }));
    waitRing.rotation.x = -Math.PI / 2;
    waitRing.position.y = 0.032;
    root.add(waitRing);
    const bag = new THREE.Group();
    limbs.rightArm.add(bag);
    bag.position.set(0, -0.257, 0.04);
    this.box(bag, '#f9f7ec', 0, -0.09, 0, 0.15, 0.18, 0.07);
    this.box(bag, '#72a3bd', 0, -0.085, 0.039, 0.055, 0.025, 0.004);
    this.box(bag, '#b1a89b', -0.04, 0.012, 0, 0.012, 0.062, 0.012);
    this.box(bag, '#b1a89b', 0.04, 0.012, 0, 0.012, 0.062, 0.012);
    this.box(bag, '#b1a89b', 0, 0.043, 0, 0.09, 0.013, 0.014);
    bag.visible = false;
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    bubble.position.y = 1.19;
    bubble.scale.set(0.33, 0.33, 1);
    bubble.visible = false;
    root.add(bubble);
    const gestureSeed = String(entity.id).split('').reduce((value, char) => value + char.charCodeAt(0), 0) * 0.37;
    const actor = { root, body, bodyMesh, limbs, bag, bubble, waitRing, entity, yaw: FACE[entity.facing] ?? 0, bubbleKey: null, lastWalk: entity.walk || 0, phase: 0,
      signature: this.visualSignature(entity), gestureSeed };
    body.rotation.y = actor.yaw;
    this.actors.set(key, actor);
    this.pickables.push(root);
    return actor;
  }

  visualSignature(entity) {
    const look = entity.look || {};
    return [look.skin, look.hair, look.shirt, look.pants, !!entity.isStaff, entity.role, entity.tier].join(':');
  }

  bubbleTexture(icon) {
    if (this.bubbles.has(icon)) return this.bubbles.get(icon);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    roundedRect(ctx, 10, 5, 108, 105, 29);
    ctx.fill();
    ctx.beginPath(); ctx.moveTo(56, 108); ctx.lineTo(64, 124); ctx.lineTo(75, 108); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#417692'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (icon === 'wait' || icon === 'clock') {
      ctx.beginPath(); ctx.arc(64, 57, 30, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(64, 37); ctx.lineTo(64, 58); ctx.lineTo(81, 68); ctx.stroke();
    } else if (icon === 'bag') {
      ctx.strokeRect(37, 46, 54, 43);
      ctx.beginPath(); ctx.arc(64, 45, 13, Math.PI, 0); ctx.stroke();
    } else if (icon === 'check') {
      ctx.strokeStyle = '#48876d'; ctx.beginPath(); ctx.moveTo(35, 57); ctx.lineTo(55, 76); ctx.lineTo(92, 37); ctx.stroke();
    } else if (icon === 'talk' || icon === 'chat') {
      ctx.fillStyle = '#417692';
      for (const x of [42, 64, 86]) { ctx.beginPath(); ctx.arc(x, 58, 6, 0, Math.PI * 2); ctx.fill(); }
    } else {
      const symbol = { heart: '♥', angry: '!', question: '?', cloud: '☁', eye: '◉', tools: '⚒', wrench: '⚒', bulb: '✦', music: '♪', smile: '☺', lightning: 'ϟ', phone: '▯', star: '★', warning: '!', sad: '…', trade: '↔', business: 'B', care: '+', acc: '+' }[icon] || '·';
      ctx.fillStyle = icon === 'angry' || icon === 'warning' ? '#c46954' : icon === 'heart' ? '#d67682' : '#417692';
      ctx.font = '700 68px -apple-system, BlinkMacSystemFont, Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(symbol, 64, 61);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(texture);
    this.bubbles.set(icon, texture);
    return texture;
  }

  reconcile(snapshot, realDt) {
    const live = new Set();
    const selected = snapshot.selected;
    this.selectionRing.visible = false;
    this.tableSelection.visible = false;
    const movingTime = !snapshot.paused;
    if (movingTime) this.elapsed += Math.min(Math.max(realDt || 0, 0), 0.1);
    const facingBlend = 1 - Math.exp(-Math.min(realDt || 1 / 60, 0.1) * 14);
    for (const entity of [...(snapshot.customers || []), ...(snapshot.staff || [])]) {
      if (entity.gone || entity.hidden) continue;
      const key = `${entity.isStaff ? 's' : 'c'}:${entity.id}`;
      live.add(key);
      const actor = this.actors.get(key) || this.createActor(entity, key);
      const signature = this.visualSignature(entity);
      if (signature !== actor.signature) {
        const geometry = this.bodyGeometry(entity);
        actor.bodyMesh.geometry = geometry.body;
        actor.limbs.leftArm.geometry = actor.limbs.rightArm.geometry = geometry.arm;
        actor.limbs.leftLeg.geometry = actor.limbs.rightLeg.geometry = geometry.leg;
        actor.signature = signature;
      }
      actor.entity = entity;
      actor.root.position.copy(this.point(entity.x, entity.y));
      const targetYaw = FACE[entity.facing] ?? 0;
      let turn = targetYaw - actor.yaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      if (movingTime) actor.yaw += turn * facingBlend;
      actor.body.rotation.y = actor.yaw;
      const walking = movingTime && Array.isArray(entity.path) && entity.path.length > 0;
      const talking = movingTime && !walking && TALK_STATES.has(entity.state);
      if (walking) {
        // Use simulation walk changes as the activity signal, but cap the gait
        // speed in real time so accelerated observation remains readable.
        const delta = Math.abs((entity.walk || 0) - actor.lastWalk);
        if (delta > 0.0001) actor.phase += Math.min(realDt || 1 / 60, 0.08) * 10;
        const stride = Math.sin(actor.phase) * 0.55;
        actor.limbs.leftLeg.rotation.x = stride;
        actor.limbs.rightLeg.rotation.x = -stride;
        actor.limbs.leftArm.rotation.x = -stride * 0.67;
        actor.limbs.rightArm.rotation.x = stride * 0.67;
        actor.limbs.leftArm.rotation.z = 0.04;
        actor.limbs.rightArm.rotation.z = -0.04;
        actor.body.position.y = Math.abs(Math.sin(actor.phase)) * 0.023;
      } else if (movingTime) {
        actor.limbs.leftLeg.rotation.x *= 0.76;
        actor.limbs.rightLeg.rotation.x *= 0.76;
        actor.limbs.leftArm.rotation.x = talking ? -0.32 + Math.sin(this.elapsed * 3.7 + actor.gestureSeed) * 0.14 : 0;
        actor.limbs.rightArm.rotation.x = talking ? -0.17 + Math.cos(this.elapsed * 2.6) * 0.09 : 0;
        actor.limbs.leftArm.rotation.z = talking ? 0.18 : 0.04;
        actor.limbs.rightArm.rotation.z = talking ? -0.14 : -0.04;
        actor.body.position.y = 0;
      }
      actor.lastWalk = entity.walk || 0;
      actor.bag.visible = Boolean((entity.role === 'ops' && (entity.state === 'delivering' || entity.order)) || (!entity.isStaff && entity.bought && entity.state === 'leaving'));
      actor.waitRing.visible = !!entity.expressAwaiting && !entity.outcome;
      const activeBubble = entity.bubble && (entity.bubble.until == null || entity.bubble.until >= snapshot.time) ? entity.bubble.icon :
        actor.waitRing.visible ? 'wait' : null;
      if (activeBubble !== actor.bubbleKey) {
        actor.bubbleKey = activeBubble;
        actor.bubble.visible = !!activeBubble;
        if (activeBubble) { actor.bubble.material.map = this.bubbleTexture(activeBubble); actor.bubble.material.needsUpdate = true; }
      }
      if (selected === entity || (selected && !selected.isTable && selected.id === entity.id && !!selected.isStaff === !!entity.isStaff)) {
        this.selectionRing.position.copy(actor.root.position);
        this.selectionRing.position.y = 0.038;
        this.selectionRing.visible = true;
      }
    }
    for (const [key, actor] of this.actors) {
      if (live.has(key)) continue;
      this.scene.remove(actor.root);
      this.pickables.splice(this.pickables.indexOf(actor.root), 1);
      actor.bubble.material.dispose();
      this.actors.delete(key);
    }
    const selectedTable = selected?.isTable ? selected.table : selected?.type === 'table' ? this.tables.get(selected.name)?.table : null;
    if (selectedTable) {
      const x0 = this.point(selectedTable.x - 10, selectedTable.y - 10, 0.795);
      const x1 = this.point(selectedTable.x + selectedTable.w + 10, selectedTable.y + selectedTable.h + 10, 0.795);
      const points = [x0.x, x0.y, x0.z, x1.x, x0.y, x0.z, x1.x, x0.y, x0.z, x1.x, x0.y, x1.z, x1.x, x0.y, x1.z, x0.x, x0.y, x1.z, x0.x, x0.y, x1.z, x0.x, x0.y, x0.z];
      this.tableSelection.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      this.tableSelection.geometry.computeBoundingSphere();
      this.tableSelection.visible = true;
    }
  }

  render(snapshot, realDt = 1 / 60) {
    if (this.disposed || !snapshot?.layout) return;
    if (!this.layout) this.buildWorld(snapshot.layout);
    this.reconcile(snapshot, realDt);
    this.updatePlayerFollow(snapshot.player);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  fitSpan() {
    const width = (this.layout?.width || 1440) * SCALE;
    const height = (this.layout?.height || 1900) * SCALE;
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const right = new THREE.Vector3().crossVectors(this.camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    let maxX = 0, maxY = 0;
    for (const x of [-width / 2, width / 2]) for (const z of [-height / 2, height / 2]) {
      const point = new THREE.Vector3(x, 0, z);
      maxX = Math.max(maxX, Math.abs(point.dot(right)));
      maxY = Math.max(maxY, Math.abs(point.dot(up)));
    }
    const aspect = (this.canvas.clientWidth || 850) / (this.canvas.clientHeight || 600);
    return Math.max(maxY * 2 + 2, maxX * 2 / aspect + 1.7) * 1.08;
  }

  setView(view, player = null) {
    this.view = ['overview', 'top', 'express', 'product', 'genius', 'player'].includes(view) ? view : 'overview';
    this.focused = this.view === 'player';
    this.followPosition = null;
    this.viewRegion = null;
    this.controls.enablePan = this.view !== 'player';
    this.camera.up.set(0, 1, 0);
    const stationKey = { express: 'express', product: 'pointProduct', genius: 'pointGenius' }[this.view];
    const station = this.layout?.[stationKey];
    if (this.view === 'player') {
      const visible = player && !player.hidden && !player.gone && Number.isFinite(player.x) && Number.isFinite(player.y);
      const center = visible ? this.point(player.x, player.y, 0.35) : this.controls.target.clone();
      this.controls.target.copy(center);
      this.camera.position.copy(center).add(new THREE.Vector3(4.4, 7.1, 5.5));
      if (visible) this.followPosition = center.clone();
    } else if (station) {
      const spots = [station, station.talk, ...(station.line || []), this.view === 'product' ? this.layout.door : null].filter(Boolean);
      const minX = Math.min(...spots.map(spot => spot.x)), maxX = Math.max(...spots.map(spot => spot.x));
      const minY = Math.min(...spots.map(spot => spot.y)), maxY = Math.max(...spots.map(spot => spot.y));
      // Include people, station labels and room around the queue, rather than
      // zooming onto only the colleague at the front of the line.
      this.viewRegion = [];
      for (const x of [minX - 100, maxX + 100]) for (const y of [minY - 80, maxY + 80]) {
        for (const height of [0, 1.55]) this.viewRegion.push(this.point(x, y, height));
      }
      const center = this.point((minX + maxX) / 2, (minY + maxY) / 2, 0.25);
      this.controls.target.copy(center);
      this.camera.position.copy(center).add(new THREE.Vector3(this.view === 'product' ? -4.4 : 4.4, 7.1, 5.5));
    } else {
      this.controls.target.set(0, 0.15, 0);
      this.camera.position.set(this.view === 'top' ? 0 : 16, this.view === 'top' ? 36 : 24, this.view === 'top' ? 0.01 : 20);
      this.span = this.fitSpan();
    }
    this.camera.zoom = 1;
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.resize();
  }

  updatePlayerFollow(player) {
    if (this.view !== 'player') return;
    if (!player || player.gone || !player.isPlayer) { this.setView('overview'); return; }
    // A break hides the character; hold the last view until they return.
    if (player.hidden || !Number.isFinite(player.x) || !Number.isFinite(player.y)) return;
    const center = this.point(player.x, player.y, 0.35);
    const delta = center.clone().sub(this.followPosition || this.controls.target);
    this.camera.position.add(delta);
    this.controls.target.add(delta);
    this.followPosition = center;
  }

  fitStationSpan(aspect) {
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const right = new THREE.Vector3().crossVectors(this.camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    let maxX = 0, maxY = 0;
    for (const point of this.viewRegion) {
      const relative = point.clone().sub(this.controls.target);
      maxX = Math.max(maxX, Math.abs(relative.dot(right)));
      maxY = Math.max(maxY, Math.abs(relative.dot(up)));
    }
    return Math.max(5.8, maxY * 2, maxX * 2 / aspect) * 1.08;
  }

  focus(entity) {
    if (!entity || !Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return;
    if (entity.isPlayer) { this.setView('player', entity); return; }
    const center = this.point(entity.x + (entity.w || 0) / 2, entity.y + (entity.h || 0) / 2, 0.25);
    this.focused = true;
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(offset);
    this.span = Math.max(5.8, 6.8 / ((this.canvas.clientWidth || 850) / (this.canvas.clientHeight || 600)));
    this.camera.zoom = 1;
    this.resize();
    this.controls.update();
  }

  resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 850);
    const height = Math.max(1, this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || 600);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    if (this.view === 'player') this.span = Math.max(5.8, 6.8 / aspect);
    else if (!this.focused) this.span = this.viewRegion ? this.fitStationSpan(aspect) : this.fitSpan();
    const span = this.span || 23;
    this.camera.left = -span * aspect / 2;
    this.camera.right = span * aspect / 2;
    this.camera.top = span / 2;
    this.camera.bottom = -span / 2;
    this.camera.updateProjectionMatrix();
  }

  selectAt(clientX, clientY) {
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    this.pointer.set((clientX - bounds.left) / bounds.width * 2 - 1, -((clientY - bounds.top) / bounds.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, true);
    for (const hit of hits) {
      // Ground contacts and waiting markers should not steal a click from a
      // nearby body. Bubbles belong to the same selectable character.
      let object = hit.object;
      while (object && !Object.hasOwn(object.userData, 'selection')) object = object.parent;
      if (object?.userData.selection) { this.onSelect({ ...object.userData.selection }); return; }
    }
    this.onSelect(null);
  }

  project(entity) {
    if (!entity || !this.layout) return null;
    this.projectVector.copy(this.point(entity.x, entity.y, 0.55)).project(this.camera);
    const bounds = this.canvas.getBoundingClientRect();
    return { x: bounds.left + (this.projectVector.x + 1) * bounds.width / 2, y: bounds.top + (1 - this.projectVector.y) * bounds.height / 2,
      visible: Math.abs(this.projectVector.x) <= 1 && Math.abs(this.projectVector.y) <= 1 && this.projectVector.z >= -1 && this.projectVector.z <= 1 };
  }

  getStats() {
    return { people: this.actors.size, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, pixelRatio: this.renderer.getPixelRatio(),
      staticMeshesBefore: this.staticMeshesBefore || 0, staticDrawCalls: this.staticMeshesAfter || 0, staticBatches: this.staticBatches || 0 };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.controls.dispose();
    this.scene.traverse(object => {
      if (object.isSprite) object.material.dispose();
      if (object.isLineSegments) object.material.dispose();
    });
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.characterMaterial.dispose();
    this.renderer.dispose();
    this.actors.clear();
    this.pickables.length = 0;
  }
}
