import * as THREE from './vendor/three.module.js';

// The display furniture is visual only. Everything lives below its existing
// selectable table group, and shared resources belong to the renderer.
const SILVER = '#c8ccd0';
const GRAPHITE = '#555961';
const WHITE = '#f5f4ef';
const INK = '#171b22';
const CASES = ['#9caec5', '#cfbdba', '#bcb7a3', '#404956', '#a8b4a7', '#e1d5c5'];

function roundedShape(radius = 0.065) {
  const shape = new THREE.Shape();
  shape.moveTo(radius, 0);
  shape.lineTo(1 - radius, 0);
  shape.quadraticCurveTo(1, 0, 1, radius);
  shape.lineTo(1, 1 - radius);
  shape.quadraticCurveTo(1, 1, 1 - radius, 1);
  shape.lineTo(radius, 1);
  shape.quadraticCurveTo(0, 1, 0, 1 - radius);
  shape.lineTo(0, radius);
  shape.quadraticCurveTo(0, 0, radius, 0);
  return shape;
}

function screenMaterial(view, style) {
  const material = view.material('#ffffff', { basic: true }).clone();
  material.toneMapped = false;
  view.materials.set(`storeDisplay:screen:${style}`, material);
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx || typeof ctx.createLinearGradient !== 'function' || typeof ctx.ellipse !== 'function') {
    material.color.set(['#406385', '#ad8c81', '#263345'][style]);
    return material;
  }
  canvas.width = canvas.height = 256;
  const gradient = ctx.createLinearGradient(0, 0, 256, 256);
  if (!gradient || typeof gradient.addColorStop !== 'function') {
    material.color.set(['#406385', '#ad8c81', '#263345'][style]);
    return material;
  }
  const palettes = [
    ['#101b32', '#405a7f', '#759cbb'],
    ['#2e283b', '#9a7775', '#e0c8a6'],
    ['#101824', '#263348', '#3a4e64'],
  ];
  palettes[style].forEach((hex, index) => gradient.addColorStop(index / 2, hex));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  if (style < 2) {
    // Quiet orbital wallpaper remains legible without a luminous, neon block.
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.ellipse(132, 144, 34 + i * 15, 73 + i * 10, -0.48, 0, Math.PI * 2);
      ctx.strokeStyle = style === 0 ? `rgba(191,216,231,${0.46 - i * 0.045})` : `rgba(244,219,188,${0.53 - i * 0.05})`;
      ctx.lineWidth = 6 + i;
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.fillRect(106, 235, 44, 3);
  } else {
    ctx.strokeStyle = '#c69f83'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(128, 92, 38, 0, Math.PI * 1.75); ctx.stroke();
    ctx.strokeStyle = '#8fb1a4'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(128, 92, 25, -0.3, Math.PI * 1.5); ctx.stroke();
    ctx.fillStyle = '#dce2e7';
    ctx.fillRect(64, 157, 128, 5);
    ctx.fillRect(77, 173, 102, 4);
    ctx.fillStyle = '#91a2b8';
    ctx.fillRect(86, 194, 84, 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  view.textures.add(texture);
  material.map = texture;
  material.needsUpdate = true;
  return material;
}

function assets(view) {
  if (view.storeDisplayAssets) return view.storeDisplayAssets;
  const shape = roundedShape();
  const slab = view.keep(new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, steps: 1, curveSegments: 3 }));
  slab.translate(-0.5, -0.5, -0.5);
  const screen = view.keep(new THREE.ShapeGeometry(roundedShape(0.055), 3));
  screen.translate(-0.5, -0.5, 0);
  const ring = view.keep(new THREE.TorusGeometry(1, 0.15, 5, 20));
  view.storeDisplayAssets = { slab, screen, ring, screens: [0, 1, 2].map(style => screenMaterial(view, style)) };
  return view.storeDisplayAssets;
}

function group(parent, x = 0, y = 0, z = 0, yaw = 0) {
  const result = new THREE.Group();
  result.position.set(x, y, z);
  result.rotation.y = yaw;
  parent.add(result);
  return result;
}

function slab(view, parent, hex, x, y, z, width, height, depth, options = {}) {
  return view.mesh(parent, assets(view).slab, view.material(hex, options), x, y, z, width, height, depth);
}

function screen(view, parent, x, y, z, width, height, style = 0) {
  return view.mesh(parent, assets(view).screen, assets(view).screens[style % 3], x, y, z, width, height, 1);
}

function line(view, parent, a, b, radius = 0.003, color = '#eeeae1') {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const vector = end.clone().sub(start);
  const mesh = view.mesh(parent, view.baseGeometry.cylinder, view.material(color, { roughness: 0.5, metalness: color === SILVER ? 0.65 : 0 }),
    (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, radius, vector.length(), radius);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
  return mesh;
}

function cable(view, parent, x, z, top) {
  line(view, parent, [x, top + 0.006, z], [x * 0.40, top + 0.006, z + 0.035], 0.0024);
  line(view, parent, [x * 0.40, top + 0.006, z + 0.035], [Math.sign(x) * 0.032, top + 0.006, z - 0.025], 0.0024);
}

function priceDisc(view, parent, x, z, top) {
  const disc = view.mesh(parent, view.baseGeometry.cylinder, view.material('#f4f3ed', { roughness: 0.5 }), x, top + 0.0045, z, 0.027, 0.006, 0.021);
  disc.rotation.y = Math.PI / 2;
  view.box(parent, '#a4a9ab', x, top + 0.008, z, 0.017, 0.0015, 0.003);
}

function laptop(view, parent, x, z, top, yaw, variant, closed = false) {
  const device = group(parent, x, top, z, yaw);
  device.name = 'display-mac';
  const shell = variant % 2 ? GRAPHITE : SILVER;
  const base = slab(view, device, shell, 0, 0.010, 0, 0.325, 0.225, 0.018, { roughness: 0.33, metalness: 0.7 });
  base.rotation.x = -Math.PI / 2;
  if (closed) {
    const lid = slab(view, device, shell, 0, 0.026, 0, 0.323, 0.223, 0.012, { roughness: 0.35, metalness: 0.65 });
    lid.rotation.x = -Math.PI / 2;
    const mark = view.mesh(device, view.baseGeometry.sphere, view.material('#b0b5b9', { metalness: 0.6, roughness: 0.3 }), 0, 0.033, 0, 0.012, 0.0014, 0.013);
    mark.rotation.y = 0.25;
    return;
  }
  view.box(device, INK, 0, 0.020, -0.025, 0.262, 0.002, 0.104, { roughness: 0.6 });
  for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
    view.box(device, '#646a73', -0.108 + col * 0.043, 0.0215, -0.061 + row * 0.034, 0.032, 0.001, 0.024, { roughness: 0.7 });
  }
  view.box(device, variant % 2 ? '#777d86' : '#a9afb4', 0, 0.021, 0.073, 0.103, 0.0015, 0.054, { metalness: 0.4, roughness: 0.38 });
  for (const side of [-1, 1]) view.box(device, '#858c93', side * 0.146, 0.021, -0.022, 0.009, 0.001, 0.099);
  const lid = group(device, 0, 0.027, -0.096);
  lid.rotation.x = -Math.PI / 9; // 110 degrees open relative to the keyboard.
  slab(view, lid, shell, 0, 0.105, 0, 0.321, 0.212, 0.009, { metalness: 0.6, roughness: 0.3 });
  slab(view, lid, INK, 0, 0.105, 0.0051, 0.308, 0.199, 0.0018, { roughness: 0.35 });
  screen(view, lid, 0, 0.108, 0.0064, 0.294, 0.181, variant % 2);
  view.box(lid, INK, 0, 0.201, 0.007, 0.019, 0.006, 0.001);
}

function tablet(view, parent, x, z, top, yaw, variant, { small = false, pencil = false, information = false } = {}) {
  const stand = group(parent, x, top, z, yaw);
  stand.name = information ? 'display-information-ipad' : 'display-ipad';
  const scale = small ? 0.69 : 1;
  view.box(stand, '#d9dcdb', 0, 0.011, 0, 0.173 * scale, 0.021, 0.135 * scale, { metalness: 0.55, roughness: 0.35 });
  const foot = view.box(stand, '#b5b9ba', 0, 0.038 * scale, -0.015, 0.103 * scale, 0.060 * scale, 0.024, { metalness: 0.65, roughness: 0.28 });
  foot.rotation.x = -0.25;
  const device = group(stand, 0, 0.078 * scale, -0.012);
  device.rotation.x = -Math.PI * 0.38; // Low, gently inclined landscape display.
  slab(view, device, variant % 2 ? '#a5a8af' : '#d0d0cb', 0, 0, 0, 0.286 * scale, 0.207 * scale, 0.009, { metalness: 0.55, roughness: 0.32 });
  slab(view, device, '#1b1c23', 0, 0, 0.0052, 0.278 * scale, 0.199 * scale, 0.0018, { roughness: 0.3 });
  screen(view, device, 0, 0, 0.0064, 0.257 * scale, 0.177 * scale, information ? 2 : variant % 2);
  if (pencil) line(view, device, [-0.117 * scale, 0.109 * scale, 0], [0.112 * scale, 0.109 * scale, 0], 0.0035, '#f1f0ea');
  return stand;
}

function phone(view, parent, x, y, z, variant, height = 0.175) {
  const width = height * 0.48;
  const device = group(parent, x, y, z);
  device.name = 'display-iphone';
  device.rotation.x = -Math.PI / 9; // Portrait phones stand at about 70 degrees.
  slab(view, device, CASES[variant % CASES.length], 0, height / 2, 0, width, height, 0.009, { metalness: 0.45, roughness: 0.32 });
  slab(view, device, INK, 0, height / 2, 0.0051, width * 0.94, height * 0.963, 0.0015, { roughness: 0.25 });
  screen(view, device, 0, height / 2, 0.0061, width * 0.84, height * 0.88, variant % 2);
  slab(view, device, '#11151c', 0, height * 0.91, 0.0068, width * 0.32, height * 0.023, 0.001);
  view.box(device, '#bdc3c5', width * 0.51, height * 0.62, 0, 0.0018, height * 0.14, 0.004, { metalness: 0.5 });
  for (const offset of [-1, 1]) {
    const lens = view.mesh(device, view.baseGeometry.cylinder, view.material('#29323d', { roughness: 0.25, metalness: 0.5 }),
      -width * 0.25, height * (0.84 + offset * 0.042), -0.006, height * 0.035, 0.003, height * 0.035);
    lens.rotation.x = Math.PI / 2;
  }
  return device;
}

function phoneDock(view, parent, x, z, top, yaw, count, variant) {
  const dock = group(parent, x, top, z, yaw);
  dock.name = 'display-phone-dock';
  const width = count === 1 ? 0.118 : 0.368;
  const base = slab(view, dock, WHITE, 0, 0.010, 0, width, 0.128, 0.018, { roughness: 0.45 });
  base.rotation.x = -Math.PI / 2;
  for (let i = 0; i < count; i++) {
    const offset = count === 1 ? 0 : (i - (count - 1) / 2) * 0.116;
    line(view, dock, [offset, 0.019, -0.024], [offset, 0.065, -0.024], 0.004, SILVER);
    phone(view, dock, offset, 0.047, -0.019, variant + i);
    view.box(dock, '#aaaeb0', offset, 0.020, 0.047, 0.022, 0.001, 0.004);
  }
}

function watch(view, parent, x, y, z, variant, scale = 1) {
  const holder = group(parent, x, y, z);
  holder.name = 'display-watch';
  const band = view.mesh(holder, assets(view).ring, view.material(['#62656d', '#c1b9a6', '#847a8b', '#a6aaa1'][variant % 4], { roughness: 0.58 }),
    0, 0, 0, 0.051 * scale, 0.057 * scale, 0.051 * scale);
  band.rotation.y = Math.PI / 2;
  const face = group(holder, 0, 0.014 * scale, 0.044 * scale);
  face.rotation.x = -0.52;
  slab(view, face, variant % 2 ? '#b4b5b2' : '#70767b', 0, 0, 0, 0.056 * scale, 0.063 * scale, 0.017 * scale, { metalness: 0.65, roughness: 0.28 });
  slab(view, face, '#11191e', 0, 0, 0.009 * scale, 0.047 * scale, 0.054 * scale, 0.001 * scale);
  screen(view, face, 0, 0, 0.010 * scale, 0.044 * scale, 0.050 * scale, 2);
  const crown = view.mesh(face, view.baseGeometry.cylinder, view.material('#a9adb0', { metalness: 0.65, roughness: 0.25 }),
    0.030 * scale, 0.008 * scale, 0, 0.007 * scale, 0.007 * scale, 0.007 * scale);
  crown.rotation.z = Math.PI / 2;
}

function watchDisplays(view, parent, width, length, top) {
  for (const [bar, side] of [[-1, -1], [1, 1]]) {
    const z = bar * length * 0.205;
    view.box(parent, WHITE, 0, top + 0.013, z, 0.157, 0.025, length * 0.34, { roughness: 0.48 });
    for (let i = 0; i < 3; i++) {
      const dz = z + (i - 1) * length * 0.104;
      const height = 0.20 + (i % 3) * 0.051;
      line(view, parent, [0, top + 0.026, dz], [0, top + height, dz], 0.0045, SILVER);
      const mounted = group(parent, 0, top + height + 0.035, dz, side * Math.PI / 2);
      watch(view, mounted, 0, 0, 0, i + (bar > 0 ? 3 : 0));
    }
  }
  for (const side of [-1, 1]) {
    const x = side * width * 0.31;
    const z = -side * length * 0.32;
    tablet(view, parent, x, z, top, side * Math.PI / 2, 0, { small: true, information: true });
    cable(view, parent, x, z, top);
    const baseZ = side * length * 0.17;
    view.box(parent, WHITE, x, top + 0.011, baseZ, 0.137, 0.021, 0.145, { roughness: 0.48 });
    const display = group(parent, x, top + 0.080, baseZ, side * Math.PI / 2);
    display.rotation.x = -0.35;
    watch(view, display, 0, 0, 0, side + 2, 0.82);
    priceDisc(view, parent, x + side * 0.06, baseZ + 0.13, top);
  }
}

export function buildProductDisplay(view, parent, table, { width, length, top }) {
  assets(view);
  const product = table.kind === 'support' ? 'support' : table.product || 'support';
  const rows = [-1, 1];
  const positions = [-length * 0.30, 0, length * 0.30];
  if (product === 'watch') {
    watchDisplays(view, parent, width, length, top);
    return;
  }
  if (product === 'express') {
    tablet(view, parent, 0, length * 0.15, top, Math.PI / 2, 0, { small: true, information: true });
    view.box(parent, '#f3f1e9', 0, top + 0.030, -length * 0.10, 0.19, 0.060, 0.15, { roughness: 0.48 });
    view.box(parent, '#333c47', 0, top + 0.064, -length * 0.10, 0.10, 0.008, 0.067);
    return;
  }
  if (product === 'help') {
    tablet(view, parent, 0, -length * 0.08, top, Math.PI / 2, 0, { small: true, information: true });
    return;
  }
  for (const side of rows) {
    const x = side * width * 0.27;
    const yaw = side * Math.PI / 2;
    positions.forEach((z, index) => {
      const variant = index + (side > 0 ? 3 : 0);
      if (product === 'mac') {
        laptop(view, parent, x, z, top, yaw, variant, side < 0 && index === 2);
        priceDisc(view, parent, side * width * 0.41, z + length * 0.11, top);
      } else if (product === 'ipad') {
        tablet(view, parent, x, z, top, yaw, variant, { pencil: index === 1 });
        priceDisc(view, parent, side * width * 0.41, z + length * 0.10, top);
      } else if (product === 'support') {
        // The central power rail belongs to the support table furniture.
        phoneDock(view, parent, side * width * 0.25, z, top, yaw, 1, variant);
      } else {
        phoneDock(view, parent, x, z, top, yaw, 3, variant);
      }
      cable(view, parent, side * width * 0.18, z, top);
    });
  }
}
