// Player, cars, the AI companion, thugs and civilians
import { pushOut, makeLabel } from './world.js';

export const WALK = 3.0;
export const RUN = 6.2;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const rand = (a, b) => a + Math.random() * (b - a);

// ---------- Human model ----------
function limb(w, len, color, x, y) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, len, w),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  );
  m.position.y = -len / 2;
  m.castShadow = true;
  pivot.add(m);
  return pivot;
}

export function makeHuman({ shirt, pants, skin = 0xd9b08c, hair = 0x2a1d14 }) {
  const group = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.36), mat(shirt));
  torso.position.y = 1.28;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), mat(skin));
  head.position.y = 1.9;
  const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.14, 0.44), mat(hair));
  hairMesh.position.y = 2.14;
  const legL = limb(0.22, 0.85, pants, -0.16, 0.85);
  const legR = limb(0.22, 0.85, pants, 0.16, 0.85);
  const armL = limb(0.18, 0.7, shirt, -0.42, 1.6);
  const armR = limb(0.18, 0.7, shirt, 0.42, 1.6);
  group.add(torso, head, hairMesh, legL, legR, armL, armR);
  group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group, torso, head, legL, legR, armL, armR };
}

export function animateHuman(h, speed, t, mode = 'walk') {
  const s = Math.sin(t * 9) * Math.min(1, speed / 3);
  h.legL.rotation.x = s * 0.7;
  h.legR.rotation.x = -s * 0.7;
  h.armL.rotation.x = -s * 0.5;
  h.armR.rotation.x = s * 0.5;
  h.armL.rotation.z = 0;
  h.armR.rotation.z = 0;
  h.group.rotation.z = 0;
  if (mode === 'wave') {
    h.armR.rotation.x = -2.7 + Math.sin(t * 10) * 0.35;
    h.armR.rotation.z = -0.2;
    h.legL.rotation.x = 0;
    h.legR.rotation.x = 0;
  } else if (mode === 'dance') {
    h.armL.rotation.x = -2.4 + Math.sin(t * 9) * 0.6;
    h.armR.rotation.x = -2.4 + Math.cos(t * 9) * 0.6;
    h.legL.rotation.x = 0;
    h.legR.rotation.x = 0;
    h.group.rotation.z = Math.sin(t * 9) * 0.08;
  }
}

// ---------- Car model ----------
function makeCarMesh(color, police) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2735, roughness: 0.1, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const lightM = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 3.9), paint);
  body.position.y = 0.8;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2), glass);
  cab.position.set(0, 1.45, -0.1);
  g.add(body, cab);

  [[-1, -1.35], [1, -1.35], [-1, 1.35], [1, 1.35]].forEach(([x, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.36, 16), dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.42, z);
    g.add(w);
  });

  [-0.6, 0.6].forEach(x => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.06), lightM);
    h.position.set(x, 0.85, -1.97);
    g.add(h);
  });

  if (police) {
    const red = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const blue = new THREE.MeshBasicMaterial({ color: 0x2255ff });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.4), dark);
    bar.position.set(0, 1.9, 0);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.3), red);
    r.position.set(-0.35, 1.98, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.3), blue);
    b.position.set(0.35, 1.98, 0);
    g.add(bar, r, b);
    g.userData.red = red;
    g.userData.blue = blue;
  }

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------- Player (you, on foot) ----------
export class Player {
  constructor(scene) {
    this.h = makeHuman({ shirt: 0x2f6fd6, pants: 0x2b2b3a });
    scene.add(this.h.group);
    this.x = 0; this.z = 0; this.yaw = 0;
    this.camYaw = 0; this.camPitch = 0.35;
    this.hp = 100; this.alive = true; this.vehicle = null;
    this.speed = 0; this.t = 0; this.lastHurt = -99;
  }

  reset(x, z) {
    Object.assign(this, { x, z, yaw: 0, hp: 100, alive: true, vehicle: null, speed: 0, lastHurt: -99 });
  }

  damage(a) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - a);
    this.lastHurt = performance.now() / 1000;
    if (this.hp <= 0) this.alive = false;
  }

  update(dt, input, solids) {
    this.t += dt;
    if (!this.alive || this.vehicle) { this.speed = 0; return; }

    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let mx = 0, mz = 0;
    if (input.fwd) { mx += fx; mz += fz; }
    if (input.back) { mx -= fx; mz -= fz; }
    if (input.right) { mx += rx; mz += rz; }
    if (input.left) { mx -= rx; mz -= rz; }

    const len = Math.hypot(mx, mz);
    if (len > 0) {
      const sp = input.run ? RUN : WALK;
      const p = pushOut(solids, this.x + (mx / len) * sp * dt, this.z + (mz / len) * sp * dt, 0.35);
      this.x = p.x; this.z = p.z;
      this.yaw = Math.atan2(-mx, -mz);
      this.speed = sp;
    } else {
      this.speed = 0;
    }
    animateHuman(this.h, this.speed, this.t, 'walk');

    if (this.hp < 100 && performance.now() / 1000 - this.lastHurt > 6) {
      this.hp = Math.min(100, this.hp + 8 * dt);
    }
  }

  sync() {
    this.h.group.position.set(this.x, 0, this.z);
    this.h.group.rotation.y = this.yaw;
    this.h.group.rotation.x = this.alive ? 0 : -Math.PI / 2;
    this.h.group.visible = !this.vehicle;
  }
}

// ---------- Cars (yours, Ally's, parked and police) ----------
export class Vehicle {
  constructor(scene, { x, z, angle, color, police = false }) {
    this.mesh = makeCarMesh(color, police);
    scene.add(this.mesh);
    this.x = x; this.z = z; this.angle = angle;
    this.speed = 0; this.driver = null; this.police = police;
    this.sync();
  }

  // input: { up, down, left, right, handbrake }. Returns the impact speed if it crashed.
  update(dt, input, solids) {
    const MAX = 26, ACC = 16, BRAKE = 26, FRIC = 5, TURN = 2.1;

    if (input.up) this.speed += ACC * dt;
    else if (input.down) this.speed -= BRAKE * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), FRIC * dt);
    if (input.handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 30 * dt);
    this.speed = clamp(this.speed, -MAX * 0.4, MAX);

    if (Math.abs(this.speed) > 0.5) {
      const dir = this.speed > 0 ? 1 : -1;
      if (input.left) this.angle += TURN * dt * dir;
      if (input.right) this.angle -= TURN * dt * dir;
    }
    this.angle = wrap(this.angle);

    const nx = this.x - Math.sin(this.angle) * this.speed * dt;
    const nz = this.z - Math.cos(this.angle) * this.speed * dt;
    const p = pushOut(solids, nx, nz, 1.5);
    let impact = 0;
    if (Math.abs(p.x - nx) > 1e-4 || Math.abs(p.z - nz) > 1e-4) {
      impact = Math.abs(this.speed);
      this.speed *= -0.25;
    }
    this.x = p.x; this.z = p.z;
    this.sync();
    return impact;
  }

  sync() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.angle;
  }
}

// ---------- Ally, the AI companion ----------
export class Companion {
  constructor(scene) {
    this.h = makeHuman({ shirt: 0x16a34a, pants: 0x1f2937, hair: 0x7c2d12 });
    const tag = makeLabel('Ally', '#86efac');
    tag.position.y = 2.7;
    this.h.group.add(tag);
    scene.add(this.h.group);

    this.x = 2; this.z = 0; this.yaw = 0; this.speed = 0; this.t = 0;
    this.hp = 100; this.alive = true; this.respawnT = 0; this.attackCD = 0;
    this.role = 'follow';     // follow, stay, guard, attack, goto, toCar, drive, ride, dance, wave
    this.target = null;
    this.timer = 0;
    this.vehicle = null;
    this.targetVehicle = null;
    this.destination = null;
    this.driveInput = {};
    this.ctxSolids = [];
  }

  setRole(role, data = null) {
    if (this.vehicle && role !== 'ride' && role !== 'drive') this.leaveVehicle();
    this.role = role;
    this.target = data;
    this.timer = role === 'dance' ? 5 : role === 'wave' ? 2.5 : 0;
    if (role !== 'toCar') this.targetVehicle = null;
  }

  ride(v) {
    this.vehicle = v;
    this.role = 'ride';
    this.target = null;
  }

  unboard() {
    if (this.vehicle && this.role === 'ride') {
      this.vehicle = null;
      this.setRole('follow');
    }
  }

  leaveVehicle() {
    if (!this.vehicle) return;
    if (this.vehicle.driver === 'ai') this.vehicle.driver = null;
    this.vehicle = null;
    this.driveInput = {};
  }

  // Finds the nearest free car and sends Ally to take it
  startDrive(dest, vehicles, playerVehicle) {
    let best = null, bd = 80;
    for (const v of vehicles) {
      if (v.driver !== null || v === playerVehicle || v.police) continue;
      const d = Math.hypot(v.x - this.x, v.z - this.z);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) return false;
    this.destination = dest;
    this.targetVehicle = best;
    this.setRole('toCar');
    return true;
  }

  damage(a) {
    if (!this.alive) return;
    this.hp -= a;
    if (this.hp <= 0) {
      this.alive = false;
      this.respawnT = 10;
      this.leaveVehicle();
      this.role = 'follow';
    }
  }

  revive(p, solids) {
    this.alive = true; this.hp = 100; this.respawnT = 0;
    this.role = 'follow';
    this.teleportNear(p, solids);
  }

  teleportNear(p, solids) {
    this.leaveVehicle();
    const q = pushOut(solids, p.x + 2, p.z + 1.5, 0.4);
    this.x = q.x; this.z = q.z; this.speed = 0;
  }

  // Walks toward a point. Returns the distance before moving.
  moveTo(tx, tz, speed, dt, solids) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d < 0.01) { this.speed = 0; return d; }
    this.yaw = Math.atan2(-dx, -dz);
    const step = Math.min(d, speed * dt);
    const p = pushOut(solids, this.x + (dx / d) * step, this.z + (dz / d) * step, 0.4);
    this.x = p.x; this.z = p.z;
    this.speed = speed;
    return d;
  }

  pickTarget(ctx) {
    if (this.role === 'attack') {
      if (this.target && this.target.alive) return this.target;
      this.setRole('follow');
      return null;
    }
    const radius = this.role === 'guard' ? 16 : (this.role === 'follow' || this.role === 'stay') ? 9 : 0;
    if (!radius) return null;
    let best = null, bd = radius;
    for (const e of ctx.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - this.x, e.z - this.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  fight(dt, target) {
    const d = Math.hypot(target.x - this.x, target.z - this.z);
    if (d > 1.5) {
      this.moveTo(target.x, target.z, 4.2, dt, this.ctxSolids);
      return;
    }
    this.speed = 0;
    this.yaw = Math.atan2(-(target.x - this.x), -(target.z - this.z));
    if (this.attackCD <= 0) {
      target.damage(14);
      this.attackCD = 0.55;
    }
  }

  followPlayer(dt, ctx) {
    const p = ctx.player;
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    if (d > 45) { this.teleportNear(p, ctx.solids); return; }
    if (d > 3) this.moveTo(p.x, p.z, d > 12 ? 6 : 3, dt, ctx.solids);
    else this.speed = 0;
  }

  toCar(dt, ctx) {
    const v = this.targetVehicle;
    if (!v || v.driver !== null) { this.setRole('follow'); return; }
    const d = this.moveTo(v.x, v.z, 4, dt, ctx.solids);
    if (d < 3.2) {
      v.driver = 'ai';
      this.vehicle = v;
      this.role = 'drive';
      this.targetVehicle = null;
      this.driveInput = {};
    }
  }

  driveStep() {
    const v = this.vehicle, dest = this.destination;
    if (!v || !dest) { this.setRole('follow'); return; }
    const dx = dest.x - v.x, dz = dest.z - v.z, d = Math.hypot(dx, dz);
    if (d < 8) {
      this.leaveVehicle();
      this.setRole('stay');
      return;
    }
    const diff = wrap(Math.atan2(-dx, -dz) - v.angle);
    this.driveInput = { up: true, down: false, left: diff > 0.08, right: diff < -0.08 };
  }

  placeWithVehicle() {
    const v = this.vehicle;
    this.yaw = v.angle;
    if (this.role === 'drive') { this.x = v.x; this.z = v.z; return; }
    // Passenger sits on the right-hand side
    const rx = Math.cos(v.angle), rz = -Math.sin(v.angle);
    this.x = v.x + rx * 0.45;
    this.z = v.z + rz * 0.45;
  }

  think(dt, ctx) {
    this.ctxSolids = ctx.solids;

    if (this.vehicle) {
      if (this.role === 'drive') this.driveStep();
      if (this.vehicle) this.placeWithVehicle();
      return;
    }
    if (this.role === 'ride' || this.role === 'drive') this.role = 'follow';

    const enemy = this.pickTarget(ctx);
    if (enemy) { this.fight(dt, enemy); return; }

    switch (this.role) {
      case 'follow':
        this.followPlayer(dt, ctx);
        break;
      case 'goto':
        if (this.moveTo(this.target.x, this.target.z, 3.2, dt, ctx.solids) < 1.6) this.setRole('stay');
        break;
      case 'toCar':
        this.toCar(dt, ctx);
        break;
      case 'dance':
      case 'wave':
        this.timer -= dt;
        if (this.timer <= 0) this.setRole('follow');
        break;
      default:
        this.speed = 0;
    }
  }

  sync() {
    this.h.group.position.set(this.x, 0, this.z);
    this.h.group.rotation.y = this.yaw;
    this.h.group.rotation.x = this.alive ? 0 : -Math.PI / 2;
    this.h.group.visible = this.alive && (!this.vehicle || this.role === 'ride');
  }

  update(dt, ctx) {
    this.t += dt;
    this.attackCD = Math.max(0, this.attackCD - dt);
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.revive(ctx.player, ctx.solids);
    } else {
      this.think(dt, ctx);
    }
    this.sync();
    const mode = this.role === 'dance' ? 'dance' : this.role === 'wave' ? 'wave' : 'walk';
    animateHuman(this.h, this.speed, this.t, mode);
  }
}

// ---------- Thugs (enemies) ----------
export class Thug {
  constructor(scene, x, z) {
    this.h = makeHuman({ shirt: 0x7f1d1d, pants: 0x111111, hair: 0x050505 });
    scene.add(this.h.group);
    this.x = x; this.z = z; this.yaw = 0; this.speed = 0;
    this.hp = 60; this.alive = true; this.cool = 0; this.t = Math.random() * 10;
    this.isThug = true;
    this.h.group.position.set(x, 0, z);
  }

  damage(a) {
    if (!this.alive) return;
    this.hp -= a;
    if (this.hp <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.h.group.rotation.x = -Math.PI / 2;
    this.h.group.position.y = 0.25;
  }

  update(dt, targets, solids) {
    if (!this.alive) return;
    this.t += dt;
    this.cool -= dt;
    this.speed = 0;

    let best = null, bd = 24;
    for (const t of targets) {
      if (!t.alive) continue;
      const d = Math.hypot(t.x - this.x, t.z - this.z);
      if (d < bd) { bd = d; best = t; }
    }

    if (best) {
      const dx = best.x - this.x, dz = best.z - this.z;
      this.yaw = Math.atan2(-dx, -dz);
      if (bd > 1.5) {
        const sp = 3.6, step = Math.min(bd - 1.2, sp * dt);
        const p = pushOut(solids, this.x + (dx / bd) * step, this.z + (dz / bd) * step, 0.4);
        this.x = p.x; this.z = p.z;
        this.speed = sp;
      } else if (this.cool <= 0) {
        best.damage(6);
        this.cool = 0.5;
      }
    }

    this.h.group.position.set(this.x, 0, this.z);
    this.h.group.rotation.y = this.yaw;
    animateHuman(this.h, this.speed, this.t, 'walk');
  }
}

// ---------- Civilians (run from you, and count as crimes if you hurt them) ----------
export class Civilian {
  constructor(scene, x, z) {
    this.h = makeHuman({ shirt: Math.floor(Math.random() * 0xffffff), pants: 0x334155, hair: 0x3b2a1a });
    scene.add(this.h.group);
    this.x = x; this.z = z; this.yaw = Math.random() * 6;
    this.hp = 30; this.alive = true; this.goal = null; this.t = Math.random() * 5;
    this.isCiv = true;
    this.h.group.position.set(x, 0, z);
  }

  damage(a) {
    if (!this.alive) return;
    this.hp -= a;
    if (this.hp <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.h.group.rotation.x = -Math.PI / 2;
    this.h.group.position.y = 0.25;
  }

  update(dt, player, solids) {
    if (!this.alive) return;
    this.t += dt;
    const dP = Math.hypot(player.x - this.x, player.z - this.z);
    let dx, dz, sp;
    if (dP < 7 && player.alive) {
      dx = this.x - player.x; dz = this.z - player.z; sp = 4.2;
    } else {
      if (!this.goal || Math.hypot(this.goal.x - this.x, this.goal.z - this.z) < 1.2) {
        this.goal = { x: rand(-80, 80), z: rand(-80, 80) };
      }
      dx = this.goal.x - this.x; dz = this.goal.z - this.z; sp = 1.2;
    }
    const d = Math.hypot(dx, dz) || 1;
    const p = pushOut(solids, this.x + (dx / d) * sp * dt, this.z + (dz / d) * sp * dt, 0.35);
    const moved = Math.hypot(p.x - this.x, p.z - this.z);
    this.x = p.x; this.z = p.z;
    if (moved > 1e-4) this.yaw = Math.atan2(-dx, -dz);
    this.h.group.position.set(this.x, 0, this.z);
    this.h.group.rotation.y = this.yaw;
    animateHuman(this.h, dt > 0 ? moved / dt : 0, this.t, 'walk');
  }
}