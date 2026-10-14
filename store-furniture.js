import * as THREE from './vendor/three.module.js';

// Display furniture only. Coordinates, reservations and actor paths belong to
// the floor simulation and are never changed by these builders.
const UP = new THREE.Vector3(0, 1, 0);
const OAK_JOINT = '#bd9669';

function wedgeGeometry(view) {
  if (view.storePowerWedgeGeometry) return view.storePowerWedgeGeometry;
  const a = [-0.5, 0, -0.5], b = [0.5, 0, -0.5], c = [0, 1, -0.5];
  const d = [-0.5, 0, 0.5], e = [0.5, 0, 0.5], f = [0, 1, 0.5];
  const positions = [], uvs = [];
  const triangle = (first, second, third) => {
    positions.push(...first, ...second, ...third);
    uvs.push(0, 0, 1, 0, 0.5, 1);
  };
  triangle(a, c, b); triangle(d, e, f);
  triangle(a, d, f); triangle(a, f, c);
  triangle(b, c, f); triangle(b, f, e);
  triangle(a, b, e); triangle(a, e, d);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  view.storePowerWedgeGeometry = view.keep(geometry);
  return view.storePowerWedgeGeometry;
}

function barSeatGeometry(view) {
  if (view.storeBarSeatGeometry) return view.storeBarSeatGeometry;
  const shape = new THREE.Shape();
  const half = 0.175, thickness = 0.026;
  const curve = x => 0.021 * (x / half) ** 2;
  shape.moveTo(-half, curve(-half));
  for (let i = 1; i <= 8; i++) {
    const x = -half + i * half / 4;
    shape.lineTo(x, curve(x));
  }
  for (let i = 8; i >= 0; i--) {
    const x = -half + i * half / 4;
    shape.lineTo(x, curve(x) - thickness);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.27, steps: 1, bevelEnabled: false });
  geometry.translate(0, 0, -0.135);
  view.storeBarSeatGeometry = view.keep(geometry);
  return view.storeBarSeatGeometry;
}

function oakBox(view, group, x, y, z, width, height, length) {
  return view.mesh(group, view.baseGeometry.box, view.woodMaterial(), x, y, z, width, height, length);
}

function wire(view, group, material, from, to, radius = 0.0055) {
  const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const middle = start.add(end).multiplyScalar(0.5);
  const mesh = view.mesh(group, view.baseGeometry.cylinder, material,
    middle.x, middle.y, middle.z, radius, direction.length(), radius);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  return mesh;
}

function powerModules(view, group, { width, length, top }) {
  const wedgeWidth = Math.min(0.12, width * 0.15), height = 0.075;
  const moduleLength = Math.min(0.34, length * 0.17);
  const slope = Math.atan2(height, wedgeWidth / 2);
  const white = view.material('#f3f1e9', { roughness: 0.48 });
  const dark = view.material('#413f39', { roughness: 0.8 });
  for (const z of [-length * 0.29, length * 0.29]) {
    view.mesh(group, wedgeGeometry(view), view.woodMaterial(), 0, top + 0.001, z,
      wedgeWidth, height, moduleLength);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const panel = new THREE.Group();
        const x = side * wedgeWidth * 0.27;
        panel.position.set(x, top + height * 0.46 + 0.002, z + (i ? 0.07 : -0.07));
        panel.rotation.z = -side * slope;
        group.add(panel);
        view.mesh(panel, view.baseGeometry.box, white, 0, 0, 0, 0.041, 0.004, 0.052);
        if (i === 0) {
          // Two small recessed sockets read clearly without printed symbols.
          for (const offset of [-0.008, 0.008]) {
            view.mesh(panel, view.baseGeometry.cylinder, dark, offset, 0.0025, 0, 0.0035, 0.0015, 0.0035);
          }
        } else {
          view.mesh(panel, view.baseGeometry.box, dark, 0, 0.0025, 0, 0.021, 0.0015, 0.005);
        }
      }
    }
  }
}

export function buildTableFrame(view, group, table, { width, length }) {
  const top = table.kind === 'support' ? 0.91 : 0.79;
  const thickness = 0.10, gap = 0.018;
  const halfWidth = (width - gap) / 2;
  for (const side of [-1, 1]) {
    oakBox(view, group, side * (gap + halfWidth) / 2, top - thickness / 2, 0,
      halfWidth, thickness, length);
  }
  // The slit is open between two boards. Its dark bottom sits below the top;
  // matching oak bridges close the last few centimetres at either end.
  view.box(group, '#68543c', 0, top - 0.048, 0, gap * 0.86, 0.022, length - 0.18);
  for (const end of [-1, 1]) {
    oakBox(view, group, 0, top - thickness / 2, end * (length / 2 - 0.045), gap, thickness, 0.09);
  }

  const legSize = 0.11, inset = legSize / 2 + 0.018;
  const legHeight = top - thickness - 0.012;
  const xs = [-width / 2 + inset, width / 2 - inset];
  const zs = [-length / 2 + inset, length / 2 - inset];
  for (const x of xs) for (const z of zs) {
    oakBox(view, group, x, 0.012 + legHeight / 2, z, legSize, legHeight, legSize);
    view.box(group, OAK_JOINT, x, top + 0.0002, z, legSize * 0.90, 0.001, legSize * 0.92,
      { roughness: 0.66 });
  }
  const apronY = top - thickness - 0.035;
  for (const x of xs) oakBox(view, group, x, apronY, 0, 0.045, 0.07, length - inset * 2);
  for (const z of zs) oakBox(view, group, 0, apronY, z, width - inset * 2, 0.07, 0.045);
  if (table.kind === 'support') powerModules(view, group, { width, length, top });
  return { top };
}

export function buildTodayStool(view, stool) {
  const group = new THREE.Group();
  group.name = 'Today at Apple oak cube';
  group.position.copy(view.point(stool.x, stool.y));
  view.world.add(group);
  const size = 0.40, height = 0.42, floor = 0.012, wall = 0.028;
  const middle = floor + height / 2, top = floor + height;
  for (const x of [-1, 1]) {
    oakBox(view, group, x * (size - wall) / 2, middle, 0, wall, height, size);
  }
  oakBox(view, group, 0, top - wall / 2, 0, size, wall, size);
  oakBox(view, group, 0, floor + wall / 2, 0, size, wall, size);
  oakBox(view, group, 0, middle, -(size - wall) / 2, size - wall * 2, height - wall * 2, wall);
  for (const x of [-1, 1]) {
    oakBox(view, group, x * (size - wall) / 2, middle, (size - wall) / 2, wall, height, wall);
  }
  for (const y of [floor + wall / 2, top - wall / 2]) {
    oakBox(view, group, 0, y, (size - wall) / 2, size, wall, wall);
  }
  view.box(group, '#352d2c', 0, middle, 0.174, 0.35, 0.365, 0.018, { roughness: 0.9 });
  view.box(group, '#6b4946', 0, middle, 0.184, 0.326, 0.345, 0.018, { roughness: 0.88 });
  view.mesh(group, view.baseGeometry.circle, view.material('#211e1d', { roughness: 0.96 }),
    0, middle + 0.018, 0.1937, 0.055, 0.014, 1);
  for (const x of [-1, 1]) for (const z of [-0.14, 0.14]) {
    view.box(group, OAK_JOINT, x * 0.186, top + 0.0001, z, 0.024, 0.001, 0.045, { roughness: 0.7 });
  }
}

export function buildBarStools(view, group, { width, length, top }) {
  const chrome = view.material('#b7bdbc', { metalness: 0.85, roughness: 0.28 });
  const seatHeight = Math.min(0.60, top - 0.28);
  // Between the existing service positions, never at their actor-slot centres.
  for (const side of [-1, 1]) for (const z of [-length * 0.25, length * 0.235]) {
    const stool = new THREE.Group();
    stool.name = 'Genius Bar wire stool';
    stool.position.set(side * (width / 2 + 0.13), 0, z);
    stool.rotation.y = side * Math.PI / 2;
    group.add(stool);
    view.mesh(stool, barSeatGeometry(view), view.woodMaterial(), 0, seatHeight, 0);
    const upper = seatHeight - 0.025, foot = 0.023;
    for (const x of [-1, 1]) {
      for (const end of [-1, 1]) {
        wire(view, stool, chrome, [x * 0.12, upper, end * 0.085], [x * 0.145, foot, end * 0.12]);
      }
      wire(view, stool, chrome, [x * 0.145, foot, -0.12], [x * 0.145, foot, 0.12]);
    }
    for (const end of [-1, 1]) {
      wire(view, stool, chrome, [-0.12, upper, end * 0.085], [0.12, upper, end * 0.085]);
    }
    wire(view, stool, chrome, [-0.136, 0.22, 0.108], [0.136, 0.22, 0.108]);
  }
}
