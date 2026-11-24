// Copied from the unslop-ui skill (scripts/spring.js), turned into a plain script: window.Spring, window.Motion.
// Springs for interface motion, described the way Apple describes them (WWDC23 "Animate with
// springs"): a duration (how long until it feels settled, in seconds) and a bounce (0 none, 0.15
// lively, 0.3 playful; above about 0.4 looks exaggerated). Solved exactly rather than stepped, so it
// looks the same at any frame rate; when the target changes mid-flight it keeps its speed, so an
// interrupted morph bends instead of jumping. No dependencies; copy into the project.
//
// One value:
//   const s = new Spring(0, { duration: 0.5, bounce: 0.18 });
//   s.to(300, performance.now() / 1000);           // aim somewhere, from wherever it is now
//   s.value(performance.now() / 1000);              // where it is
// Several values drawn together (stops calling onFrame once all have settled):
//   const m = new Motion({ w: 104, h: 30 }, (v) => draw(v));
//   m.to({ w: 392, h: 52 }, { duration: 0.5, bounce: 0.18 });
//   m.set({ w: 104 });                               // jump, no motion
// Reduced motion (the system setting) makes every Motion change a jump.
const TAU = Math.PI * 2;

// duration (seconds) and bounce (-1 to 1) to stiffness and damping, mass 1, as SwiftUI defines them
function springFrom({ duration = 0.45, bounce = 0 } = {}) {
  const k = (TAU / duration) ** 2;
  const c = bounce >= 0 ? (2 * TAU * (1 - bounce)) / duration : (2 * TAU) / (duration * (1 + bounce));
  return { k, c };
}

class Spring {
  constructor(value = 0, opts) {
    this.target = value;
    this.x0 = 0; // where it started, relative to the target
    this.v0 = 0;
    this.t0 = 0;
    this.configure(opts);
  }
  configure(opts) {
    const { k, c } = springFrom(opts);
    this.w0 = Math.sqrt(k);
    this.zeta = c / (2 * this.w0);
  }
  // displacement from the target and velocity, t seconds after the last change
  _at(t) {
    const { w0, x0: A, v0 } = this;
    // a bounce of 0 lands a hair either side of 1 in floating point; both other formulas blow up there
    const zeta = Math.abs(this.zeta - 1) < 1e-6 ? 1 : this.zeta;
    if (zeta < 1) {
      const a = zeta * w0, wd = w0 * Math.sqrt(1 - zeta * zeta), B = (v0 + a * A) / wd;
      const e = Math.exp(-a * t), cos = Math.cos(wd * t), sin = Math.sin(wd * t);
      return [e * (A * cos + B * sin), e * ((B * wd - a * A) * cos - (A * wd + a * B) * sin)];
    }
    if (zeta === 1) {
      const B = v0 + w0 * A, e = Math.exp(-w0 * t);
      return [e * (A + B * t), e * (v0 - w0 * B * t)];
    }
    const s = Math.sqrt(zeta * zeta - 1), r1 = -w0 * (zeta - s), r2 = -w0 * (zeta + s);
    const C2 = (v0 - r1 * A) / (r2 - r1), C1 = A - C2, e1 = Math.exp(r1 * t), e2 = Math.exp(r2 * t);
    return [C1 * e1 + C2 * e2, r1 * C1 * e1 + r2 * C2 * e2];
  }
  value(now) { return this.target + this._at(Math.max(0, now - this.t0))[0]; }
  velocity(now) { return this._at(Math.max(0, now - this.t0))[1]; }
  // aim somewhere new from wherever it is now, keeping its speed; opts may change the feel
  to(target, now, opts) {
    const [x, v] = this._at(Math.max(0, now - this.t0));
    const at = this.target + x;
    if (opts) this.configure(opts);
    this.target = target;
    this.x0 = at - target;
    this.v0 = v;
    this.t0 = now;
  }
  jump(value, now) { this.target = value; this.x0 = 0; this.v0 = 0; this.t0 = now; }
  settled(now, eps = 0.01) {
    const [x, v] = this._at(Math.max(0, now - this.t0));
    return Math.abs(x) < eps && Math.abs(v) < eps * 10;
  }
}

const calm = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// A set of named springs that draw together; onFrame(values) runs every frame until all have settled.
class Motion {
  constructor(values, onFrame, opts = { duration: 0.45, bounce: 0.15 }) {
    this.onFrame = onFrame;
    this.springs = {};
    for (const [k, v] of Object.entries(values)) this.springs[k] = new Spring(v, opts);
    this.raf = 0;
    this.eps = {}; // per key: how close counts as there (pixels settle at 0.01; give small ratios finer)
  }
  get values() {
    const now = performance.now() / 1000, out = {};
    for (const [k, s] of Object.entries(this.springs)) out[k] = s.value(now);
    return out;
  }
  to(targets, opts) {
    const now = performance.now() / 1000;
    for (const [k, v] of Object.entries(targets)) {
      if (!this.springs[k]) this.springs[k] = new Spring(v, opts);
      if (calm()) this.springs[k].jump(v, now);
      else this.springs[k].to(v, now, opts);
    }
    this._kick();
  }
  set(values) {
    const now = performance.now() / 1000;
    for (const [k, v] of Object.entries(values)) (this.springs[k] ||= new Spring(v)).jump(v, now);
    this._kick();
  }
  _kick() { if (!this.raf) this.raf = requestAnimationFrame(() => this._frame()); }
  _frame() {
    this.raf = 0;
    const now = performance.now() / 1000;
    const out = {};
    let moving = false;
    for (const [k, s] of Object.entries(this.springs)) {
      out[k] = s.value(now);
      if (!s.settled(now, this.eps[k] ?? 0.01)) moving = true;
      else out[k] = s.target;
    }
    this.onFrame(out);
    if (moving) this._kick();
  }
}

window.Spring = Spring; window.Motion = Motion; window.springFrom = springFrom;
