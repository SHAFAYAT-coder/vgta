// Weapons, ammo, and cheat codes

const DEFS = {
  pistol:  { name: 'Pistol',         icon: '🔫', dmg: 25,  rate: 0.35, range: 90,  pellets: 1, spread: 0.01,  mag: 12,       reserve: 60,  price: 0 },
  smg:     { name: 'SMG',            icon: '🔫', dmg: 12,  rate: 0.08, range: 70,  pellets: 1, spread: 0.035, mag: 30,       reserve: 150, price: 300 },
  shotgun: { name: 'Shotgun',        icon: '💥', dmg: 14,  rate: 0.9,  range: 35,  pellets: 8, spread: 0.09,  mag: 8,        reserve: 32,  price: 500 },
  rifle:   { name: 'Assault Rifle',  icon: '🔫', dmg: 18,  rate: 0.11, range: 130, pellets: 1, spread: 0.02,  mag: 30,       reserve: 180, price: 600 },
  sniper:  { name: 'Sniper Rifle',   icon: '🎯', dmg: 120, rate: 1.4,  range: 320, pellets: 1, spread: 0.001, mag: 5,        reserve: 30,  price: 900 },
  grenade: { name: 'Grenade',        icon: '💣', dmg: 90,  rate: 1.0,  range: 60,  pellets: 1, spread: 0,     mag: 3,        reserve: 0,   price: 250, explode: 4.5 },
  rpg:     { name: 'RPG Rocket',     icon: '🚀', dmg: 150, rate: 1.6,  range: 160, pellets: 1, spread: 0,     mag: 2,        reserve: 6,   price: 1200, explode: 6 },
  bat:     { name: 'Baseball Bat',   icon: '⚾', dmg: 40,  rate: 0.5,  range: 2.6, pellets: 1, spread: 0,     mag: Infinity, reserve: 0,   price: 0, melee: true }
};

export const WEAPONS = Object.fromEntries(
  Object.entries(DEFS).map(([id, d]) => [id, { id, ...d }])
);

export const CHEATS = {
  health:      { code: 'HEALTH',      label: 'Full health' },
  armor:       { code: 'ARMOR',       label: 'Extra armor (up to 200 HP)' },
  money:       { code: 'MONEY',       label: '+$10,000' },
  allguns:     { code: 'ALLGUNS',     label: 'Every weapon, full ammo' },
  clearwanted: { code: 'CLEARWANTED', label: 'Clear wanted level' },
  spawncar:    { code: 'SPAWNCAR',    label: 'Spawn a car beside you' }
};

export const CHEAT_BY_CODE = Object.fromEntries(
  Object.entries(CHEATS).map(([id, c]) => [c.code, id])
);

// Tracks what a character owns and how much ammo they have
export class Arsenal {
  constructor() {
    this.slots = [];
    this.ammo = {};
    this.index = 0;
    this.lastShot = -99;
    this.give('pistol');
  }

  has(id) {
    return this.slots.includes(id);
  }

  give(id) {
    const w = WEAPONS[id];
    if (!w) return false;
    if (this.has(id)) {
      if (!w.melee) this.ammo[id].reserve += w.reserve;
      return true;
    }
    this.slots.push(id);
    this.ammo[id] = { mag: w.mag, reserve: w.reserve };
    return true;
  }

  giveAll() {
    for (const id of Object.keys(WEAPONS)) {
      this.give(id);
      const w = WEAPONS[id];
      if (!w.melee) {
        this.ammo[id].mag = w.mag;
        this.ammo[id].reserve = w.reserve * 2 + w.mag;
      }
    }
  }

  select(id) {
    const i = this.slots.indexOf(id);
    if (i >= 0) this.index = i;
  }

  selectSlot(n) {
    if (n >= 0 && n < this.slots.length) this.index = n;
  }

  cycle() {
    this.index = (this.index + 1) % this.slots.length;
  }

  current() {
    return WEAPONS[this.slots[this.index]];
  }

  canFire(t) {
    const w = this.current();
    if (t - this.lastShot < w.rate) return false;
    if (w.melee) return true;
    return this.ammo[w.id].mag > 0;
  }

  consume(t) {
    const w = this.current();
    this.lastShot = t;
    if (!w.melee) this.ammo[w.id].mag -= 1;
  }

  // Returns true if reloaded, false if no spare ammo, null for melee weapons
  reload() {
    const w = this.current();
    if (w.melee) return null;
    const a = this.ammo[w.id];
    const take = Math.min(w.mag - a.mag, a.reserve);
    if (take <= 0) return false;
    a.mag += take;
    a.reserve -= take;
    return true;
  }

  label() {
    const w = this.current();
    if (w.melee) return `${w.icon} ${w.name}`;
    const a = this.ammo[w.id];
    return `${w.icon} ${w.name}  ${a.mag}/${a.reserve}`;
  }
}