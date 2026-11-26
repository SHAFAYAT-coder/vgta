// Opening cutscene: camera flyover, title card, Ally walks in and talks, then asks for your name.
// Scenes are plain data (the beats), so you can add or change them without touching the engine.

const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerpArr = (a, b, e) => a.map((v, i) => v + (b[i] - v) * e);

export class Cutscene {
  // handlers: { title(text), say(text, speaker), ask(key, prompt), actor(who, x, z, moving, yaw), end(answers) }
  constructor(handlers) {
    this.h = handlers;
    this.beats = [];
    this.i = 0;
    this.t = 0;
    this.active = false;
    this.waiting = false;
    this.entered = false;
    this.answers = {};
    this.cam = null;
  }

  start(beats) {
    this.beats = beats;
    this.i = 0;
    this.t = 0;
    this.entered = false;
    this.waiting = false;
    this.answers = {};
    this.active = true;
  }

  skip() {
    if (!this.active) return;
    this.active = false;
    this.waiting = false;
    this.h.end(this.answers);
  }

  // Called when the player answers a question (for example, their name)
  answer(key, value) {
    if (!this.waiting) return;
    this.answers[key] = value;
    this.waiting = false;
    this.advance();
  }

  advance() {
    this.i++;
    this.t = 0;
    this.entered = false;
  }

  textOf(beat) {
    return typeof beat.text === 'function' ? beat.text(this.answers) : beat.text;
  }

  enter(beat) {
    if (beat.type === 'title') this.h.title(this.textOf(beat));
    if (beat.type === 'say') this.h.say(this.textOf(beat), beat.speaker || null);
    if (beat.type === 'ask') {
      this.waiting = true;
      this.h.ask(beat.key, this.textOf(beat));
    }
  }

  // Returns the camera { pos, look } for this frame, or null if none has been set yet
  update(dt) {
    if (!this.active) return null;
    if (this.i >= this.beats.length) {
      this.active = false;
      this.h.end(this.answers);
      return null;
    }

    const beat = this.beats[this.i];
    if (!this.entered) {
      this.entered = true;
      this.enter(beat);
    }
    if (beat.type === 'ask') return this.cam; // wait until the player answers

    const dur = beat.dur || 0;
    this.t += dt;
    const k = dur > 0 ? Math.min(1, this.t / dur) : 1;
    const e = ease(k);

    if (beat.type === 'cam') {
      this.cam = {
        pos: lerpArr(beat.from.p, beat.to.p, e),
        look: lerpArr(beat.from.l, beat.to.l, e)
      };
    } else if (beat.type === 'walk') {
      const [fx, fz] = beat.from;
      const [tx, tz] = beat.to;
      const x = fx + (tx - fx) * e;
      const z = fz + (tz - fz) * e;
      this.h.actor(beat.who, x, z, k < 1, Math.atan2(-(tx - fx), -(tz - fz)));
    }

    if (this.t >= dur) this.advance();
    return this.cam;
  }
}