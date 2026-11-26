// Map, roads, buildings, trees, landmarks and collision helpers
export const MAP = 90;
export const ROAD_W = 9;
export const ROADS = [-60, -30, 0, 30, 60];
const BLOCKS = [-75, -45, -15, 15, 45, 75];

export const LANDMARKS = {
  Bank:             { x: 30,  z: -30, color: 0x22c55e },
  Hospital:         { x: -30, z: 30,  color: 0xef4444 },
  'Police Station': { x: -60, z: -60, color: 0x3b82f6 },
  Garage:           { x: 60,  z: 60,  color: 0xf59e0b },
  Park:             { x: 0,   z: -60, color: 0x84cc16 }
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Pushes a point out of buildings and trees, and keeps it inside the map
export function pushOut(solids, x, z, r) {
  x = clamp(x, -MAP + r, MAP - r);
  z = clamp(z, -MAP + r, MAP - r);
  for (const s of solids) {
    const minX = s.x1 - r, maxX = s.x2 + r, minZ = s.z1 - r, maxZ = s.z2 + r;
    if (x > minX && x < maxX && z > minZ && z < maxZ) {
      const dl = x - minX, dr = maxX - x, dn = z - minZ, df = maxZ - z;
      const m = Math.min(dl, dr, dn, df);
      if (m === dl) x = minX;
      else if (m === dr) x = maxX;
      else if (m === dn) z = minZ;
      else z = maxZ;
    }
  }
  return { x, z };
}

// Floating name tag that stays visible through walls
export function makeLabel(text, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = color;
  g.font = 'bold 26px Segoe UI, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(text).slice(0, 18), 128, 32);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), transparent: true, depthTest: false
  }));
  sprite.scale.set(2.4, 0.6, 1);
  return sprite;
}

let windowTex = null;
function windowTexture() {
  if (windowTex) return windowTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e6e6e6';
  g.fillRect(0, 0, 64, 64);
  [[8, 8], [38, 8], [8, 38], [38, 38]].forEach(([x, y]) => {
    g.fillStyle = Math.random() < 0.35 ? '#ffd27a' : '#2b3a55';
    g.fillRect(x, y, 18, 18);
  });
  windowTex = new THREE.CanvasTexture(c);
  windowTex.wrapS = THREE.RepeatWrapping;
  windowTex.wrapT = THREE.RepeatWrapping;
  return windowTex;
}

export function buildWorld(scene) {
  const solids = [];
  const landmarks = {};

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP * 2, MAP * 2),
    new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Roads and lane markings
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.95 });
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
  const dashV = new THREE.BoxGeometry(0.35, 0.02, 4);
  const dashH = new THREE.BoxGeometry(4, 0.02, 0.35);
  for (const r of ROADS) {
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, MAP * 2), roadMat);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(r, 0.02, 0);
    vRoad.receiveShadow = true;
    scene.add(vRoad);

    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(MAP * 2, ROAD_W), roadMat);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0.02, r);
    hRoad.receiveShadow = true;
    scene.add(hRoad);

    for (let p = -MAP + 3; p < MAP; p += 7) {
      const a = new THREE.Mesh(dashV, lineMat);
      a.position.set(r, 0.03, p);
      scene.add(a);
      const b = new THREE.Mesh(dashH, lineMat);
      b.position.set(p, 0.03, r);
      scene.add(b);
    }
  }

  const wallColors = [0xc7b9a6, 0x8ea3b8, 0xb45f4f, 0x6b7d8f, 0xd9d2c3, 0x4e6a5b];
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3524 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1d3d24 });

  const addBuilding = (x1, x2, z1, z2, h) => {
    const w = x2 - x1, d = z2 - z1;
    const tex = windowTexture().clone();
    tex.repeat.set(w / 6, h / 6);
    tex.needsUpdate = true;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ map: tex, color: pick(wallColors), roughness: 0.9 })
    );
    m.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    solids.push({ x1, x2, z1, z2, h });
  };

  const addTree = (x, z) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 2.2, 8), trunkMat);
    trunk.position.set(x, 1.1, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3.6, 10), leafMat);
    crown.position.set(x, 3.7, z);
    crown.castShadow = true;
    scene.add(crown);
    solids.push({ x1: x - 0.4, x2: x + 0.4, z1: z - 0.4, z2: z + 0.4, h: 3 });
  };

  // City blocks: buildings, or small parks with trees
  for (const bx of BLOCKS) {
    for (const bz of BLOCKS) {
      if (Math.random() < 0.25) {
        for (const [dx, dz] of [[-3, -3], [3, 3], [-3, 3], [3, -3]]) {
          if (Math.random() < 0.7) addTree(bx + dx, bz + dz);
        }
        continue;
      }
      const w = rand(8, 14), d = rand(8, 14), h = rand(6, 28);
      const x = bx + rand(-2, 2), z = bz + rand(-2, 2);
      addBuilding(x - w / 2, x + w / 2, z - d / 2, z + d / 2, h);
    }
  }

  // Landmarks: glowing beam, ring and name
  for (const [name, lm] of Object.entries(LANDMARKS)) {
    landmarks[name] = { x: lm.x, z: lm.z };
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 40, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: lm.color, transparent: true, opacity: 0.25, depthWrite: false })
    );
    beam.position.set(lm.x, 20, lm.z);
    scene.add(beam);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3, 32),
      new THREE.MeshBasicMaterial({ color: lm.color, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(lm.x, 0.05, lm.z);
    scene.add(ring);

    const label = makeLabel(name, '#' + lm.color.toString(16).padStart(6, '0'));
    label.position.set(lm.x, 6, lm.z);
    scene.add(label);
  }

  return { solids, landmarks };
}