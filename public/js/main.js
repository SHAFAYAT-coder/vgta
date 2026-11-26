// Menu, intro cutscene, game loop, controls, camera, HUD, weapons, cheats, police and Ally
import { ROADS, MAP, pushOut, buildWorld } from './world.js';
import { Player, Vehicle, Companion, Thug, Civilian, wrap, animateHuman } from './entities.js';
import { askCompanion } from './ai.js';
import { WEAPONS, CHEATS, CHEAT_BY_CODE, Arsenal } from './weapons.js';
import { Cutscene } from './intro.js';

const $ = id => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);
const now = () => performance.now() / 1000;
const CAR_COLORS = [0xe11d48, 0xf59e0b, 0x10b981, 0x6366f1, 0xf5f5f5, 0x111827, 0x0ea5e9, 0xa855f7];

// ---------- Renderer, scene, camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const SKY = 0x9ec9f0;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 110, 280);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xdbeeff, 0x4a6b3a, 0.9));
const sun = new THREE.DirectionalLight(0xfff1d6, 1.0);
sun.position.set(60, 120, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, far: 400 });
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);

// ---------- World and characters ----------
const world = buildWorld(scene);
const player = new Player(scene);
const companion = new Companion(scene);
const arsenal = new Arsenal();
const allyArsenal = new Arsenal();
const vehicles = [];
const policeCars = [];
const thugs = [];
const civilians = [];
const effects = [];

const state = {
  started: false, chatOpen: false, cash: 500, name: 'Hunter',
  wanted: 0, lastCrime: -99, lastDecay: 0, lastPoliceSpawn: -99,
  deadAt: null, tracers: [], lastHud: 0, lastEmpty: -99, allyLast: -99
};
const keys = {};
let mouseDown = false;
let askResolver = null;

function roadPoint(minD = 0, maxD = 999, from = null) {
  let fallback = null;
  for (let i = 0; i < 80; i++) {
    const vertical = Math.random() < 0.5;
    const r = ROADS[Math.floor(Math.random() * ROADS.length)];
    const lane = rand(-2.4, 2.4);
    const p = vertical
      ? { x: r + lane, z: rand(-MAP + 6, MAP - 6), angle: Math.random() < 0.5 ? 0 : Math.PI }
      : { x: rand(-MAP + 6, MAP - 6), z: r + lane, angle: Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
    const d = from ? Math.hypot(p.x - from.x, p.z - from.z) : 0;
    if (d >= minD && d <= maxD) return p;
    fallback = fallback || p;
  }
  return fallback;
}

for (let i = 0; i < 10; i++) {
  vehicles.push(new Vehicle(scene, { ...roadPoint(), color: CAR_COLORS[i % CAR_COLORS.length] }));
}

const landmarkNames = Object.keys(world.landmarks);
for (let i = 0; i < 10; i++) {
  const lm = world.landmarks[landmarkNames[i % landmarkNames.length]];
  const p = pushOut(world.solids, lm.x + rand(-7, 7), lm.z + rand(-7, 7), 0.4);
  thugs.push(new Thug(scene, p.x, p.z));
}
for (let i = 0; i < 14; i++) {
  const p = pushOut(world.solids, rand(-80, 80), rand(-80, 80), 0.4);
  civilians.push(new Civilian(scene, p.x, p.z));
}

// Starting positions (Ally starts on the road, then walks in during the intro)
player.reset(0, 0);
companion.x = -16;
companion.z = 2;
companion.sync();

// ---------- UI ----------
const chatInput = $('chatInput');
const chatLog = $('chatLog');
let toastTimer = null;

function toast(text, ms = 2500) {
  $('toast').textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').textContent = ''; }, ms);
}

function addChat(who, text, cls) {
  const d = document.createElement('div');
  d.className = 'line ' + cls;
  d.textContent = `${who}: ${text}`;
  chatLog.appendChild(d);
  while (chatLog.children.length > 40) chatLog.removeChild(chatLog.firstChild);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.pitch = 1.1;
  u.rate = 1.05;
  speechSynthesis.speak(u);
}

function openChat() {
  state.chatOpen = true;
  for (const k in keys) keys[k] = false;
  mouseDown = false;
  chatInput.hidden = false;
  chatInput.value = '';
  chatInput.focus();
  if (document.pointerLockElement) document.exitPointerLock();
}

function closeChat() {
  state.chatOpen = false;
  chatInput.hidden = true;
  chatInput.blur();
}

// ---------- Fullscreen ----------
function requestFull() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
}

function toggleFull() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else requestFull();
}

// ---------- Intro cutscene ----------
// Ally's walk and the camera moves are scripted here. Edit or add beats to change the opening.
const INTRO_BEATS = [
  { type: 'cam', dur: 0.1,
    from: { p: [-70, 80, 70], l: [0, 0, 0] }, to: { p: [-70, 80, 70], l: [0, 0, 0] } },
  { type: 'title', text: 'STREET LEGENDS', dur: 3 },
  { type: 'cam', dur: 8,
    from: { p: [-70, 80, 70], l: [0, 0, 0] }, to: { p: [30, 60, -10], l: [10, 0, -20] } },
  { type: 'cam', dur: 6,
    from: { p: [30, 60, -10], l: [10, 0, -20] }, to: { p: [-4, 2.4, 10], l: [0, 1.4, 0] } },
  { type: 'walk', who: 'ally', dur: 5, from: [-16, 2], to: [2, 1] },
  { type: 'say', speaker: 'Ally', dur: 4,
    text: "Hey. I'm Ally. Welcome to the city." },
  { type: 'say', speaker: 'Ally', dur: 5,
    text: "Don't let the quiet fool you. Thugs own these streets, and the police are never far." },
  { type: 'say', speaker: 'Ally', dur: 5,
    text: 'I walk with you, I fight with you, I can drive, and I can get you almost anything. Just ask.' },
  { type: 'say', speaker: 'Ally', dur: 4,
    text: "Press T to type to me, or V to talk. Before we start, though... what should I call you?" },
  { type: 'ask', key: 'name',
    text: 'What should I call you? Type your name and press Enter.' },
  { type: 'say', speaker: 'Ally', dur: 4,
    text: a => `${a.name || 'Hunter'}. Good name. Let's make it a legend.` },
  { type: 'say', speaker: 'Ally', dur: 5,
    text: 'The Bank is across town. Get there, and we will see what this city is hiding.' }
];

function setActor(who, x, z, moving, yaw) {
  const a = who === 'ally' ? companion : player;
  a.x = x;
  a.z = z;
  a.yaw = yaw;
  a.speed = moving ? 3 : 0;
  a.sync();
  animateHuman(a.h, a.speed, now(), 'walk');
}

function showSubtitle(text, speaker) {
  const el = $('subtitle');
  el.textContent = speaker ? `${speaker}: ${text}` : text;
  el.className = speaker === 'Ally' ? 'ally' : '';
  if (speaker === 'Ally') {
    addChat('Ally', text, 'ally');
    speak(text);
  }
}

function askName(prompt) {
  showSubtitle(prompt, 'Ally');
  askResolver = value => cutscene.answer('name', value.trim().slice(0, 14) || 'Hunter');
  openChat();
  chatInput.placeholder = 'Type your name, then press Enter';
}

function finishIntro(answers) {
  askResolver = null;
  closeChat();
  $('subtitle').textContent = '';
  $('titleCard').classList.remove('show');
  state.name = (answers && answers.name) || 'Hunter';
  chatInput.placeholder = 'Tell Ally what to do, or type a cheat';

  player.reset(0, 0);
  companion.setRole('follow');
  setActor('ally', 2, 1, false, 0);
  setActor('player', 0, 0, false, 0);

  state.started = true;
  document.body.className = 'playing';
  toast('Click the screen to take control', 4000);
}

const cutscene = new Cutscene({
  title: text => {
    const el = $('titleCard');
    el.textContent = text;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2400);
  },
  say: (text, speaker) => showSubtitle(text, speaker),
  ask: (key, prompt) => askName(prompt),
  actor: setActor,
  end: finishIntro
});

$('btnStart').onclick = () => {
  requestFull();
  document.body.className = 'intro';
  cutscene.start(INTRO_BEATS);
};

$('btnSkip').onclick = () => cutscene.skip();
$('btnControls').onclick = () => { $('controls').hidden = !$('controls').hidden; };
$('btnFull').onclick = toggleFull;
$('btnPauseFull').onclick = toggleFull;
$('btnResume').onclick = () => {
  document.body.className = 'playing';
  renderer.domElement.requestPointerLock();
};
$('btnQuitMenu').onclick = () => location.reload();

// ---------- Wanted level and police ----------
function crime(level) {
  if (level <= 0) return;
  state.wanted = clamp(state.wanted + level, 0, 5);
  state.lastCrime = now();
}

function allVehicles() {
  return [...vehicles, ...policeCars];
}

function policeInput(v) {
  const dx = player.x - v.x, dz = player.z - v.z, d = Math.hypot(dx, dz);
  const diff = wrap(Math.atan2(-dx, -dz) - v.angle);
  return { up: d > 5, left: diff > 0.12, right: diff < -0.12 };
}

function spawnPolice() {
  const p = roadPoint(55, 90, player);
  if (!p) return;
  const v = new Vehicle(scene, { ...p, color: 0xffffff, police: true });
  v.driver = 'ai';
  policeCars.push(v);
}

function clearPolice() {
  policeCars.forEach(v => scene.remove(v.mesh));
  policeCars.length = 0;
}

function runOver(v) {
  for (const c of [...civilians, ...thugs]) {
    if (!c.alive || Math.hypot(c.x - v.x, c.z - v.z) > 2.2) continue;
    c.damage(999);
    if (c.isThug) {
      state.cash += 150;
      toast('Hit and run! +$150', 2000);
    } else {
      crime(2);
      toast('You hit a civilian!', 2000);
    }
  }
}

// ---------- Shooting, damage and effects ----------
function rayWall(origin, dir, maxT) {
  for (let t = 0.5; t < maxT; t += 0.5) {
    const x = origin.x + dir.x * t;
    const y = origin.y + dir.y * t;
    const z = origin.z + dir.z * t;
    if (y < 0) return t;
    for (const s of world.solids) {
      if (y < s.h && x > s.x1 && x < s.x2 && z > s.z1 && z < s.z2) return t;
    }
  }
  return Infinity;
}

function tracer(a, b) {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([a, b]),
    new THREE.LineBasicMaterial({ color: 0xffe9a6 })
  );
  scene.add(line);
  state.tracers.push({ line, life: 0.08 });
}

function castBullet(origin, dir, range) {
  let best = null, bestT = Infinity;
  for (const target of [...thugs, ...civilians]) {
    if (!target.alive) continue;
    const p = new THREE.Vector3(target.x, 1.0, target.z);
    const along = p.clone().sub(origin).dot(dir);
    if (along < 0 || along > range || along >= bestT) continue;
    const closest = origin.clone().addScaledVector(dir, along);
    if (closest.distanceTo(p) < 0.9) { best = target; bestT = along; }
  }
  const wallT = rayWall(origin, dir, range);
  if (best && bestT < wallT) return { target: best, dist: bestT };
  return { target: null, dist: Math.min(wallT, range) };
}

function hurt(target, dmg) {
  if (!target.alive) return;
  const wasCivilian = !!target.isCiv;
  target.damage(dmg);
  if (wasCivilian) crime(1);
  if (!target.alive) onKill(target);
}

function onKill(target) {
  if (target.isThug) {
    state.cash += 150;
    toast('Thug down! +$150', 1800);
  } else {
    crime(2);
    toast('Civilian down!', 1500);
  }
}

function explode(p, radius, dmg) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85, depthWrite: false })
  );
  m.position.copy(p);
  m.scale.setScalar(0.5);
  scene.add(m);
  effects.push({ mesh: m, life: 0.6, max: 0.6, radius });

  for (const e of [...thugs, ...civilians]) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d < radius) hurt(e, dmg * (1 - d / radius));
  }
  if (player.alive) {
    const d = Math.hypot(player.x - p.x, player.z - p.z);
    if (d < radius * 0.5) player.damage(dmg * 0.3 * (1 - d / (radius * 0.5)));
  }
}

const dirVec = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function meleeHit(w) {
  const fx = -Math.sin(player.camYaw), fz = -Math.cos(player.camYaw);
  let best = null, bd = w.range;
  for (const e of [...thugs, ...civilians]) {
    if (!e.alive) continue;
    const dx = e.x - player.x, dz = e.z - player.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d < bd && (dx * fx + dz * fz) / d > 0.4) { bd = d; best = e; }
  }
  if (best) {
    hurt(best, w.dmg);
    crime(1);
  }
}

function fireWeapon() {
  if (!state.started || state.chatOpen || !player.alive) return;
  const t = now();
  const w = arsenal.current();

  if (!arsenal.canFire(t)) {
    const a = arsenal.ammo[w.id];
    if (!w.melee && a.mag <= 0 && t - state.lastEmpty > 1.2) {
      state.lastEmpty = t;
      toast(a.reserve > 0 ? 'Empty. Press R to reload.' : 'Out of ammo for this weapon.', 1500);
    }
    return;
  }
  arsenal.consume(t);

  if (w.melee) {
    meleeHit(w);
    return;
  }

  const before = state.wanted;
  const origin = camera.position.clone();
  camera.getWorldDirection(dirVec);
  const base = dirVec.clone();
  const right = new THREE.Vector3().crossVectors(base, UP).normalize();
  const upv = new THREE.Vector3().crossVectors(right, base).normalize();

  let end = null;
  for (let i = 0; i < w.pellets; i++) {
    const dir = base.clone()
      .addScaledVector(right, (Math.random() - 0.5) * 2 * w.spread)
      .addScaledVector(upv, (Math.random() - 0.5) * 2 * w.spread)
      .normalize();
    const shot = castBullet(origin, dir, w.range);
    end = origin.clone().addScaledVector(dir, shot.dist);
    if (w.explode) continue;
    tracer(origin.clone().addScaledVector(dir, 1.2), end);
    if (shot.target) hurt(shot.target, w.dmg);
  }

  if (w.explode) explode(end, w.explode, w.dmg);
  crime(1);
  if (state.wanted > before) toast(`⭐ Wanted level ${state.wanted}`, 1800);
}

function reloadWeapon() {
  const ok = arsenal.reload();
  if (ok === null) toast('Melee weapons do not reload.', 1200);
  else if (ok === false) toast('No spare ammo.', 1200);
  else toast('Reloaded', 900);
}

function companionShoot(t) {
  if (!companion.alive || companion.vehicle) return;
  const w = allyArsenal.current();
  if (t - state.allyLast < w.rate) return;

  let best = null, bd = 24;
  for (const th of thugs) {
    if (!th.alive) continue;
    const d = Math.hypot(th.x - companion.x, th.z - companion.z);
    if (d < bd) { bd = d; best = th; }
  }
  if (!best) return;
  if (w.melee && bd > 3) return;

  state.allyLast = t;
  tracer(new THREE.Vector3(companion.x, 1.4, companion.z), new THREE.Vector3(best.x, 1.0, best.z));
  if (Math.random() < 0.65) hurt(best, w.dmg);
}

// ---------- Cheats ----------
function spawnCarNear() {
  const p = pushOut(world.solids, player.x + 4, player.z, 1.5);
  const v = new Vehicle(scene, {
    x: p.x, z: p.z, angle: player.camYaw,
    color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]
  });
  vehicles.push(v);
  toast('🚗 Car spawned beside you', 2000);
}

function runCheat(id) {
  switch (id) {
    case 'health':
      if (player.alive) player.hp = 100;
      toast('❤️ Health restored', 2000);
      break;
    case 'armor':
      if (player.alive) player.hp = 200;
      toast('🛡️ Armor added', 2000);
      break;
    case 'money':
      state.cash += 10000;
      toast('💵 +$10,000', 2000);
      break;
    case 'allguns':
      arsenal.giveAll();
      toast('🔫 Every weapon unlocked', 2500);
      break;
    case 'clearwanted':
      state.wanted = 0;
      clearPolice();
      toast('⭐ Wanted level cleared', 2000);
      break;
    case 'spawncar':
      spawnCarNear();
      break;
    default:
      return false;
  }
  return true;
}

// ---------- Getting in and out of cars ----------
function exitVehicle() {
  const v = player.vehicle;
  if (!v) return;
  v.driver = null;
  player.vehicle = null;
  const rx = Math.cos(v.angle), rz = -Math.sin(v.angle);
  const p = pushOut(world.solids, v.x + rx * 2.4, v.z + rz * 2.4, 0.4);
  player.x = p.x;
  player.z = p.z;
  player.yaw = v.angle;
  companion.unboard();
  toast('Out of the car.', 1200);
}

function tryEnterOrExit() {
  if (player.vehicle) {
    exitVehicle();
    return;
  }
  let best = null, bd = 4.2;
  for (const v of vehicles) {
    if (v.driver !== null) continue;
    const d = Math.hypot(v.x - player.x, v.z - player.z);
    if (d < bd) { bd = d; best = v; }
  }
  if (!best) return;
  best.driver = 'player';
  player.vehicle = best;
  if (companion.alive && companion.role === 'follow') companion.ride(best);
  toast('W drive · A/D steer · Space handbrake · E exit', 2500);
}

// ---------- Respawn at the hospital ----------
function respawn() {
  const h = world.landmarks.Hospital;
  player.reset(h.x + 2, h.z + 2);
  state.wanted = 0;
  clearPolice();
  state.deadAt = null;
  $('wasted').hidden = true;
  state.cash = Math.max(0, state.cash - 100);
  if (companion.alive) companion.teleportNear(player, world.solids);
  else companion.revive(player, world.solids);
  toast('You woke up at the hospital. -$100', 3500);
}

// ---------- Ally: talking and commands ----------
function findLandmark(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  const key = Object.keys(world.landmarks).find(k =>
    k.toLowerCase() === n || k.toLowerCase().includes(n) || n.includes(k.toLowerCase()));
  return key ? { name: key, ...world.landmarks[key] } : null;
}

function nearestThug() {
  let best = null, bd = Infinity;
  for (const t of thugs) {
    if (!t.alive) continue;
    const d = Math.hypot(t.x - companion.x, t.z - companion.z);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

function buildState() {
  const nearThugs = thugs.filter(t => t.alive &&
    Math.hypot(t.x - companion.x, t.z - companion.z) < 25).length;
  let nearest = Infinity;
  for (const v of vehicles) {
    if (v.driver === null) nearest = Math.min(nearest, Math.hypot(v.x - player.x, v.z - player.z));
  }
  return {
    playerName: state.name,
    landmarks: Object.keys(world.landmarks),
    cheats: Object.keys(CHEATS),
    weapons: arsenal.slots.map(id => {
      const w = WEAPONS[id];
      return w.melee ? id : `${id} (${arsenal.ammo[id].mag}/${arsenal.ammo[id].reserve})`;
    }),
    equipped: arsenal.current().id,
    allyWeapon: allyArsenal.current().id,
    player: { inCar: !!player.vehicle, hp: Math.round(player.hp), wanted: state.wanted, cash: state.cash },
    companion: { role: companion.role, hp: Math.round(companion.hp), alive: companion.alive, inCar: !!companion.vehicle },
    thugsNearCompanion: nearThugs,
    nearestFreeCarDistance: nearest === Infinity ? null : Math.round(nearest)
  };
}

function runAction(a) {
  switch (a.type) {
    case 'follow':
    case 'come':
      companion.unboard();
      companion.setRole('follow');
      break;
    case 'stay':
      companion.setRole('stay');
      break;
    case 'guard':
      companion.setRole('guard');
      break;
    case 'attack_nearest': {
      const t = nearestThug();
      if (t) companion.setRole('attack', t);
      else addChat('Ally', 'No thugs nearby.', 'ally');
      break;
    }
    case 'goto': {
      const lm = findLandmark(a.target);
      if (lm) {
        companion.setRole('goto', { x: lm.x, z: lm.z });
        toast(`Going to the ${lm.name}`, 2000);
      }
      break;
    }
    case 'drive_to': {
      const lm = findLandmark(a.target);
      if (!lm) break;
      if (companion.startDrive(lm, vehicles, player.vehicle)) toast(`Driving to the ${lm.name}`, 2000);
      else addChat('Ally', 'No free car nearby.', 'ally');
      break;
    }
    case 'dance':
      companion.setRole('dance');
      break;
    case 'wave':
      companion.setRole('wave');
      break;
    case 'board':
      if (player.vehicle) companion.ride(player.vehicle);
      else addChat('Ally', 'You are not in a car.', 'ally');
      break;
    case 'unboard':
      companion.unboard();
      break;
    case 'give_weapon':
      arsenal.give(a.target);
      arsenal.select(a.target);
      toast(`Got ${WEAPONS[a.target].name}`, 2000);
      break;
    case 'give_ally_weapon':
      allyArsenal.give(a.target);
      allyArsenal.select(a.target);
      toast(`Ally got a ${WEAPONS[a.target].name}`, 2000);
      break;
    case 'equip_weapon':
      if (arsenal.has(a.target)) arsenal.select(a.target);
      else toast("You don't have that weapon yet.", 2000);
      break;
    case 'cheat':
      runCheat(a.target);
      break;
  }
}

async function handleCommand(text) {
  addChat('You', text, 'you');

  const code = text.trim().toUpperCase().replace(/\s+/g, '');
  if (CHEAT_BY_CODE[code]) {
    const id = CHEAT_BY_CODE[code];
    addChat('Cheat', CHEATS[id].label, 'ally');
    runCheat(id);
    return;
  }

  const res = await askCompanion(text, buildState());
  addChat('Ally', res.say, 'ally');
  speak(res.say);
  for (const a of res.actions || []) runAction(a);
}

// ---------- Typing and voice ----------
chatInput.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    const text = chatInput.value.trim();
    if (askResolver) {
      const resolve = askResolver;
      askResolver = null;
      closeChat();
      resolve(text || 'Hunter');
      return;
    }
    closeChat();
    if (text) handleCommand(text);
  } else if (e.key === 'Escape' && !askResolver) {
    closeChat();
  }
});

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;
if (SR) {
  rec = new SR();
  rec.lang = 'en-US';
  rec.interimResults = false;
  rec.onresult = e => {
    const said = e.results[0][0].transcript;
    if (askResolver) {
      const resolve = askResolver;
      askResolver = null;
      resolve(said.trim() || 'Hunter');
      return;
    }
    handleCommand(said);
  };
  rec.onend = () => { listening = false; $('micBtn').classList.remove('live'); };
  rec.onerror = () => { listening = false; $('micBtn').classList.remove('live'); };
}

function toggleVoice() {
  if (!rec) {
    toast('Voice input is not supported in this browser.');
    return;
  }
  if (listening) {
    rec.stop();
    return;
  }
  listening = true;
  $('micBtn').classList.add('live');
  try {
    rec.start();
  } catch (e) {
    listening = false;
    $('micBtn').classList.remove('live');
  }
}
$('micBtn').onclick = toggleVoice;

// ---------- Input ----------
window.addEventListener('keydown', e => {
  // During the intro, only Escape (to skip) is active, and only when no question is waiting
  if (cutscene.active) {
    if (e.code === 'Escape' && !cutscene.waiting) cutscene.skip();
    return;
  }
  if (state.chatOpen) return;
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat || !state.started) return;

  if (e.code === 'KeyE') tryEnterOrExit();
  else if (e.code === 'KeyT') { e.preventDefault(); openChat(); }
  else if (e.code === 'KeyV') toggleVoice();
  else if (e.code === 'KeyR') reloadWeapon();
  else if (e.code === 'KeyQ') {
    arsenal.cycle();
    toast(`Weapon: ${arsenal.current().name}`, 1200);
  } else if (/^Digit[1-8]$/.test(e.code)) {
    arsenal.selectSlot(Number(e.code.slice(5)) - 1);
    toast(`Weapon: ${arsenal.current().name}`, 1200);
  }
});

window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  mouseDown = false;
});

renderer.domElement.addEventListener('mousedown', e => {
  if (e.button === 0 && document.pointerLockElement === renderer.domElement) mouseDown = true;
});
window.addEventListener('mouseup', () => { mouseDown = false; });

renderer.domElement.addEventListener('wheel', e => {
  if (!state.started) return;
  e.preventDefault();
  arsenal.cycle();
  toast(`Weapon: ${arsenal.current().name}`, 1000);
}, { passive: false });

renderer.domElement.addEventListener('click', () => {
  if (state.started && !state.chatOpen && !document.pointerLockElement) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement || state.chatOpen) return;
  player.camYaw -= e.movementX * 0.003;
  player.camPitch = clamp(player.camPitch - e.movementY * 0.0025, 0.05, 1.2);
});

// Releasing the mouse (Esc) opens the pause menu
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked) return;
  if (state.started && !state.chatOpen && document.body.classList.contains('playing')) {
    document.body.className = 'paused';
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Camera ----------
function updateCamera(dt) {
  const v = player.vehicle;
  if (v) player.camYaw = wrap(player.camYaw + wrap(v.angle - player.camYaw) * Math.min(1, dt * 2));
  const tx = v ? v.x : player.x;
  const tz = v ? v.z : player.z;
  const dist = v ? 10 : 5.5;
  const cp = Math.cos(player.camPitch), sp = Math.sin(player.camPitch);
  camera.position.set(
    tx + Math.sin(player.camYaw) * cp * dist,
    1.6 + sp * dist,
    tz + Math.cos(player.camYaw) * cp * dist
  );
  camera.lookAt(tx, 1.4, tz);
}

// ---------- HUD ----------
function updateHud(t) {
  if (t - state.lastHud < 0.1) return;
  state.lastHud = t;
  $('hpBar').style.width = clamp(Math.round(player.hp / 2), 0, 100) + '%';
  $('cash').textContent = '$' + state.cash;
  $('stars').textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
  $('weapon').textContent = arsenal.label();
  $('ally').textContent = `Ally · ${companion.role}${companion.alive ? '' : ' (down)'} · ${Math.round(companion.hp)} HP · ${allyArsenal.current().name}`;
  $('speed').textContent = player.vehicle ? `${Math.round(Math.abs(player.vehicle.speed) * 3.6)} km/h` : '';

  let prompt = '';
  if (player.vehicle) {
    prompt = 'Press E to get out';
  } else {
    for (const v of vehicles) {
      if (v.driver === null && Math.hypot(v.x - player.x, v.z - player.z) < 4.2) {
        prompt = 'Press E to enter car';
        break;
      }
    }
  }
  $('prompt').textContent = prompt;
}

// ---------- Game update ----------
function update(dt, t) {
  const live = !state.chatOpen;

  if (live && (mouseDown || keys.KeyF)) fireWeapon();

  player.update(dt, live ? {
    fwd: !!keys.KeyW, back: !!keys.KeyS, left: !!keys.KeyA, right: !!keys.KeyD,
    run: !!(keys.ShiftLeft || keys.ShiftRight)
  } : {}, world.solids);

  for (const v of allVehicles()) {
    let input = {};
    if (v.driver === 'player') {
      input = live ? {
        up: !!keys.KeyW, down: !!keys.KeyS, left: !!keys.KeyA, right: !!keys.KeyD,
        handbrake: !!keys.Space
      } : {};
    } else if (v.driver === 'ai') {
      input = v.police ? policeInput(v) : companion.driveInput;
    }
    const impact = v.update(dt, input, world.solids);
    if (v.driver === 'player') {
      if (impact > 6) player.damage(impact * 0.15);
      if (Math.abs(v.speed) > 4) runOver(v);
    }
  }
  if (player.vehicle) {
    player.x = player.vehicle.x;
    player.z = player.vehicle.z;
  }

  companion.update(dt, { player, solids: world.solids, enemies: thugs });
  companionShoot(t);

  const thugTargets = [player, companion];
  for (const th of thugs) th.update(dt, thugTargets, world.solids);
  for (const c of civilians) c.update(dt, player, world.solids);

  for (const v of policeCars) {
    if (player.alive && Math.hypot(player.x - v.x, player.z - v.z) < 4.5) player.damage(10 * dt);
    const on = Math.sin(t * 12) > 0;
    v.mesh.userData.red.color.setHex(on ? 0xff2222 : 0x330000);
    v.mesh.userData.blue.color.setHex(on ? 0x330000 : 0x2255ff);
  }

  if (state.wanted > 0) {
    if (t - state.lastCrime > 12 && t - state.lastDecay > 8) {
      state.wanted--;
      state.lastDecay = t;
      if (state.wanted === 0) {
        clearPolice();
        toast('You lost the police.', 2500);
      }
    }
    if (policeCars.length < state.wanted && t - state.lastPoliceSpawn > 2.5) {
      spawnPolice();
      state.lastPoliceSpawn = t;
    }
  }

  if (!player.alive && state.deadAt === null) {
    state.deadAt = t;
    exitVehicle();
    $('wasted').hidden = false;
  }
  if (state.deadAt !== null && t - state.deadAt > 4) respawn();

  for (let i = state.tracers.length - 1; i >= 0; i--) {
    const tr = state.tracers[i];
    tr.life -= dt;
    if (tr.life <= 0) {
      scene.remove(tr.line);
      state.tracers.splice(i, 1);
    }
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;
    const k = 1 - e.life / e.max;
    e.mesh.scale.setScalar(e.radius * (0.3 + k * 0.7));
    e.mesh.material.opacity = 0.85 * (1 - k);
    if (e.life <= 0) {
      scene.remove(e.mesh);
      effects.splice(i, 1);
    }
  }

  player.sync();
  updateCamera(dt);
  updateHud(t);
}

// ---------- Main loop ----------
let lastT = now();
function frame() {
  requestAnimationFrame(frame);
  const t = now();
  const dt = Math.min(0.05, t - lastT);
  lastT = t;

  if (cutscene.active) {
    const c = cutscene.update(dt);
    if (c) {
      camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
      camera.lookAt(c.look[0], c.look[1], c.look[2]);
    }
  } else if (state.started) {
    update(dt, t);
  } else {
    // Main menu: the camera slowly circles the city
    const a = t * 0.04;
    camera.position.set(Math.sin(a) * 75, 50, Math.cos(a) * 75);
    camera.lookAt(0, 0, 0);
  }

  renderer.render(scene, camera);
}

player.sync();
companion.sync();
frame();