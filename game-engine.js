/**
 * @fileoverview BlockForge Pro — Canvas Game Engine
 * @description  Full-featured 2D game development environment with:
 *   - Scene graph with layered rendering
 *   - Entity-Component system (ECS)
 *   - Physics: gravity, velocity, collision (AABB + circle)
 *   - Sprite sheets & animation frames
 *   - Tilemap editor with flood-fill
 *   - Particle system
 *   - Input manager (keyboard + gamepad + touch)
 *   - Audio manager (Web Audio API)
 *   - Camera with pan/zoom/follow
 *   - Timeline & tweening
 *   - Asset manager
 *   - Live code editor with hot-reload
 *   - Performance profiler overlay
 *
 * @version 1.0.0
 */

'use strict';

/* ============================================================
   §1  GAME ENGINE NAMESPACE
============================================================ */
const BFGame = (() => {

  /* ──────────────────────────────────────────────────────────
     CONSTANTS
  ────────────────────────────────────────────────────────── */
  const VERSION    = '1.0.0';
  const FPS_TARGET = 60;
  const FRAME_MS   = 1000 / FPS_TARGET;

  /* ──────────────────────────────────────────────────────────
     §1.1  MATH UTILITIES
  ────────────────────────────────────────────────────────── */
  const Math2D = {
    clamp:  (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    lerp:   (a, b, t)   => a + (b - a) * t,
    dist:   (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    angle:  (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
    norm:   (x, y) => { const m = Math.hypot(x, y) || 1; return { x: x/m, y: y/m }; },
    dot:    (ax, ay, bx, by) => ax*bx + ay*by,
    rand:   (lo, hi) => lo + Math.random() * (hi - lo),
    randInt:(lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1)),
    wrap:   (v, lo, hi) => { const r = hi - lo; return ((v - lo) % r + r) % r + lo; },
    degToRad: d => d * Math.PI / 180,
    radToDeg: r => r * 180 / Math.PI,
  };

  /* ──────────────────────────────────────────────────────────
     §1.2  VECTOR2
  ────────────────────────────────────────────────────────── */
  class Vec2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    add(v)    { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v)    { return new Vec2(this.x - v.x, this.y - v.y); }
    scale(s)  { return new Vec2(this.x * s, this.y * s); }
    dot(v)    { return this.x * v.x + this.y * v.y; }
    len()     { return Math.hypot(this.x, this.y); }
    norm()    { const l = this.len() || 1; return new Vec2(this.x/l, this.y/l); }
    clone()   { return new Vec2(this.x, this.y); }
    set(x, y) { this.x = x; this.y = y; return this; }
    static zero()  { return new Vec2(0, 0); }
    static from(o) { return new Vec2(o.x || 0, o.y || 0); }
  }

  /* ──────────────────────────────────────────────────────────
     §1.3  RECT (AABB)
  ────────────────────────────────────────────────────────── */
  class Rect {
    constructor(x, y, w, h) { this.x = x; this.y = y; this.w = w; this.h = h; }
    get right()  { return this.x + this.w; }
    get bottom() { return this.y + this.h; }
    get cx()     { return this.x + this.w / 2; }
    get cy()     { return this.y + this.h / 2; }
    intersects(r) {
      return this.x < r.right && this.right > r.x &&
             this.y < r.bottom && this.bottom > r.y;
    }
    contains(px, py) {
      return px >= this.x && px <= this.right && py >= this.y && py <= this.bottom;
    }
    expand(n) { return new Rect(this.x-n, this.y-n, this.w+n*2, this.h+n*2); }
  }

  /* ──────────────────────────────────────────────────────────
     §2  ASSET MANAGER
  ────────────────────────────────────────────────────────── */
  class AssetManager {
    constructor() {
      this._images  = new Map();
      this._audio   = new Map();
      this._pending = 0;
      this._total   = 0;
    }

    /** Load an image asset. Returns a Promise<HTMLImageElement>. */
    loadImage(key, src) {
      if (this._images.has(key)) return Promise.resolve(this._images.get(key));
      this._pending++; this._total++;
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload  = () => { this._images.set(key, img); this._pending--; resolve(img); };
        img.onerror = () => { this._pending--; reject(new Error(`Image load failed: ${src}`)); };
        img.src = src;
      });
    }

    /** Load an audio buffer via Web Audio API. */
    async loadAudio(key, src, ctx) {
      if (this._audio.has(key)) return this._audio.get(key);
      this._pending++; this._total++;
      try {
        const res  = await fetch(src);
        const buf  = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);
        this._audio.set(key, decoded);
        this._pending--;
        return decoded;
      } catch(e) {
        this._pending--;
        console.warn('[BFGame] Audio load failed:', src, e);
        return null;
      }
    }

    getImage(key)  { return this._images.get(key) || null; }
    getAudio(key)  { return this._audio.get(key)  || null; }
    get progress() { return this._total ? (this._total - this._pending) / this._total : 1; }
    get loaded()   { return this._pending === 0; }
  }

  /* ──────────────────────────────────────────────────────────
     §3  INPUT MANAGER
  ────────────────────────────────────────────────────────── */
  class InputManager {
    constructor(canvas) {
      this._keys     = new Set();
      this._prevKeys = new Set();
      this._mouse    = { x:0, y:0, buttons: new Set(), prevButtons: new Set() };
      this._touches  = new Map();
      this._gamepad  = null;
      this._canvas   = canvas;
      this._attach();
    }

    _attach() {
      const c = this._canvas;
      window.addEventListener('keydown',  e => { this._keys.add(e.code); e.preventDefault(); });
      window.addEventListener('keyup',    e => this._keys.delete(e.code));
      c.addEventListener('mousemove', e => {
        const r = c.getBoundingClientRect();
        this._mouse.x = e.clientX - r.left;
        this._mouse.y = e.clientY - r.top;
      });
      c.addEventListener('mousedown', e => this._mouse.buttons.add(e.button));
      c.addEventListener('mouseup',   e => this._mouse.buttons.delete(e.button));
      c.addEventListener('touchstart', e => {
        const r = c.getBoundingClientRect();
        [...e.changedTouches].forEach(t => {
          this._touches.set(t.identifier, { x: t.clientX - r.left, y: t.clientY - r.top });
        });
        e.preventDefault();
      }, { passive: false });
      c.addEventListener('touchend', e => {
        [...e.changedTouches].forEach(t => this._touches.delete(t.identifier));
      });
      window.addEventListener('gamepadconnected',    e => { this._gamepad = e.gamepad; });
      window.addEventListener('gamepaddisconnected', () => { this._gamepad = null; });
    }

    /** Call once per frame to snapshot previous state. */
    update() {
      this._prevKeys = new Set(this._keys);
      this._mouse.prevButtons = new Set(this._mouse.buttons);
      if (this._gamepad) {
        const gp = navigator.getGamepads()[this._gamepad.index];
        if (gp) this._gamepad = gp;
      }
    }

    isDown(code)    { return this._keys.has(code); }
    isPressed(code) { return this._keys.has(code) && !this._prevKeys.has(code); }
    isReleased(code){ return !this._keys.has(code) && this._prevKeys.has(code); }

    mouseDown(btn = 0)    { return this._mouse.buttons.has(btn); }
    mousePressed(btn = 0) { return this._mouse.buttons.has(btn) && !this._mouse.prevButtons.has(btn); }
    get mouseX() { return this._mouse.x; }
    get mouseY() { return this._mouse.y; }

    get touches() { return [...this._touches.values()]; }

    axis(negCode, posCode) {
      return (this.isDown(posCode) ? 1 : 0) - (this.isDown(negCode) ? 1 : 0);
    }

    gamepadAxis(idx) {
      return this._gamepad ? (this._gamepad.axes[idx] || 0) : 0;
    }
    gamepadButton(idx) {
      return this._gamepad ? this._gamepad.buttons[idx]?.pressed : false;
    }
  }

  /* ──────────────────────────────────────────────────────────
     §4  AUDIO MANAGER
  ────────────────────────────────────────────────────────── */
  class AudioManager {
    constructor() {
      this._ctx    = null;
      this._master = null;
      this._sfx    = null;
      this._music  = null;
      this._init();
    }

    _init() {
      try {
        this._ctx    = new (window.AudioContext || window.webkitAudioContext)();
        this._master = this._ctx.createGain();
        this._sfx    = this._ctx.createGain();
        this._music  = this._ctx.createGain();
        this._sfx.connect(this._master);
        this._music.connect(this._master);
        this._master.connect(this._ctx.destination);
      } catch(e) {
        console.warn('[BFGame] Web Audio not available');
      }
    }

    resume() { this._ctx?.resume(); }

    /** Play a decoded AudioBuffer as a one-shot sound effect. */
    playSFX(buffer, opts = {}) {
      if (!this._ctx || !buffer) return;
      const src  = this._ctx.createBufferSource();
      const gain = this._ctx.createGain();
      src.buffer = buffer;
      src.loop   = opts.loop || false;
      gain.gain.value = opts.volume ?? 1;
      src.connect(gain);
      gain.connect(this._sfx);
      src.start(0);
      return src;
    }

    /** Generate a procedural tone (no asset needed). */
    beep(freq = 440, duration = 0.1, type = 'square', volume = 0.3) {
      if (!this._ctx) return;
      const osc  = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type      = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, this._ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this._sfx);
      osc.start();
      osc.stop(this._ctx.currentTime + duration);
    }

    setMasterVolume(v) { if (this._master) this._master.gain.value = Math2D.clamp(v, 0, 1); }
    setSFXVolume(v)    { if (this._sfx)    this._sfx.gain.value    = Math2D.clamp(v, 0, 1); }
    setMusicVolume(v)  { if (this._music)  this._music.gain.value  = Math2D.clamp(v, 0, 1); }
    get ctx() { return this._ctx; }
  }

  /* ──────────────────────────────────────────────────────────
     §5  CAMERA
  ────────────────────────────────────────────────────────── */
  class Camera {
    constructor(w, h) {
      this.x      = 0;
      this.y      = 0;
      this.zoom   = 1;
      this.angle  = 0;
      this.width  = w;
      this.height = h;
      this._target = null;
      this._shake  = { x:0, y:0, duration:0, intensity:0 };
    }

    follow(entity, lerp = 0.1) { this._target = { entity, lerp }; }
    stopFollow() { this._target = null; }

    shake(intensity = 8, duration = 0.3) {
      this._shake.intensity = intensity;
      this._shake.duration  = duration;
    }

    update(dt) {
      if (this._target) {
        const { entity, lerp } = this._target;
        const tx = entity.x - this.width  / 2 / this.zoom;
        const ty = entity.y - this.height / 2 / this.zoom;
        this.x = Math2D.lerp(this.x, tx, lerp);
        this.y = Math2D.lerp(this.y, ty, lerp);
      }
      if (this._shake.duration > 0) {
        this._shake.duration -= dt;
        this._shake.x = Math2D.rand(-this._shake.intensity, this._shake.intensity);
        this._shake.y = Math2D.rand(-this._shake.intensity, this._shake.intensity);
      } else {
        this._shake.x = 0; this._shake.y = 0;
      }
    }

    /** Apply camera transform to a 2D context. */
    apply(ctx) {
      ctx.save();
      ctx.translate(this.width/2 + this._shake.x, this.height/2 + this._shake.y);
      ctx.scale(this.zoom, this.zoom);
      ctx.rotate(this.angle);
      ctx.translate(-this.x - this.width/2/this.zoom, -this.y - this.height/2/this.zoom);
    }

    restore(ctx) { ctx.restore(); }

    /** Convert screen coords to world coords. */
    screenToWorld(sx, sy) {
      return {
        x: (sx - this.width/2)  / this.zoom + this.x + this.width/2/this.zoom,
        y: (sy - this.height/2) / this.zoom + this.y + this.height/2/this.zoom,
      };
    }

    worldToScreen(wx, wy) {
      return {
        x: (wx - this.x - this.width/2/this.zoom)  * this.zoom + this.width/2,
        y: (wy - this.y - this.height/2/this.zoom) * this.zoom + this.height/2,
      };
    }
  }

  /* ──────────────────────────────────────────────────────────
     §6  ENTITY-COMPONENT SYSTEM
  ────────────────────────────────────────────────────────── */

  /** Base component — attach to entities. */
  class Component {
    constructor() { this.entity = null; }
    init()         {}
    update(dt)     {}
    draw(ctx)      {}
    destroy()      {}
  }

  /** Base entity — a node in the scene graph. */
  class Entity {
    constructor(opts = {}) {
      this.id         = opts.id || ('e_' + Math.random().toString(36).slice(2));
      this.name       = opts.name || 'Entity';
      this.x          = opts.x || 0;
      this.y          = opts.y || 0;
      this.width      = opts.width  || 32;
      this.height     = opts.height || 32;
      this.rotation   = opts.rotation || 0;
      this.scaleX     = opts.scaleX || 1;
      this.scaleY     = opts.scaleY || 1;
      this.alpha      = opts.alpha ?? 1;
      this.visible    = opts.visible ?? true;
      this.active     = opts.active  ?? true;
      this.layer      = opts.layer   || 0;
      this.tags       = new Set(opts.tags || []);
      this._components = new Map();
      this._children   = [];
      this._parent     = null;
      this.scene       = null;
    }

    addComponent(comp) {
      comp.entity = this;
      this._components.set(comp.constructor.name, comp);
      comp.init();
      return this;
    }

    getComponent(cls) { return this._components.get(cls.name) || null; }
    hasComponent(cls) { return this._components.has(cls.name); }

    removeComponent(cls) {
      const c = this._components.get(cls.name);
      if (c) { c.destroy(); this._components.delete(cls.name); }
      return this;
    }

    addChild(entity) {
      entity._parent = this;
      entity.scene   = this.scene;
      this._children.push(entity);
      return this;
    }

    removeChild(entity) {
      this._children = this._children.filter(c => c !== entity);
      entity._parent = null;
    }

    get worldX() { return this._parent ? this._parent.worldX + this.x : this.x; }
    get worldY() { return this._parent ? this._parent.worldY + this.y : this.y; }
    get bounds()  { return new Rect(this.worldX - this.width/2, this.worldY - this.height/2, this.width, this.height); }

    update(dt) {
      if (!this.active) return;
      this._components.forEach(c => c.update(dt));
      this._children.forEach(c => c.update(dt));
    }

    draw(ctx) {
      if (!this.visible) return;
      ctx.save();
      ctx.globalAlpha *= this.alpha;
      ctx.translate(this.worldX, this.worldY);
      ctx.rotate(this.rotation);
      ctx.scale(this.scaleX, this.scaleY);
      this._drawSelf(ctx);
      this._components.forEach(c => c.draw(ctx));
      this._children.forEach(c => c.draw(ctx));
      ctx.restore();
    }

    _drawSelf(ctx) {} // Override in subclasses

    destroy() {
      this._components.forEach(c => c.destroy());
      this._children.forEach(c => c.destroy());
      if (this._parent) this._parent.removeChild(this);
    }

    hasTag(tag) { return this.tags.has(tag); }
    addTag(tag) { this.tags.add(tag); return this; }
  }

  /* ──────────────────────────────────────────────────────────
     §7  BUILT-IN COMPONENTS
  ────────────────────────────────────────────────────────── */

  /** Physics: velocity, gravity, friction, bounce. */
  class PhysicsComponent extends Component {
    constructor(opts = {}) {
      super();
      this.vx       = opts.vx || 0;
      this.vy       = opts.vy || 0;
      this.gravity  = opts.gravity ?? 800;
      this.friction = opts.friction ?? 0.85;
      this.bounce   = opts.bounce   ?? 0;
      this.mass     = opts.mass     ?? 1;
      this.grounded = false;
      this.static   = opts.static  ?? false;
    }

    applyForce(fx, fy) {
      this.vx += fx / this.mass;
      this.vy += fy / this.mass;
    }

    applyImpulse(ix, iy) { this.vx += ix; this.vy += iy; }

    update(dt) {
      if (this.static) return;
      this.vy += this.gravity * dt;
      this.entity.x += this.vx * dt;
      this.entity.y += this.vy * dt;
      if (!this.grounded) {
        this.vx *= Math.pow(this.friction, dt * 60);
      }
    }
  }

  /** Sprite: draws an image or a coloured rectangle. */
  class SpriteComponent extends Component {
    constructor(opts = {}) {
      super();
      this.image    = opts.image  || null;  // HTMLImageElement
      this.color    = opts.color  || '#6366f1';
      this.srcX     = opts.srcX   || 0;
      this.srcY     = opts.srcY   || 0;
      this.srcW     = opts.srcW   || null;
      this.srcH     = opts.srcH   || null;
      this.flipX    = opts.flipX  || false;
      this.flipY    = opts.flipY  || false;
      this.radius   = opts.radius || 0;     // > 0 → draw circle
    }

    draw(ctx) {
      const e = this.entity;
      const w = e.width, h = e.height;
      ctx.save();
      if (this.flipX) ctx.scale(-1, 1);
      if (this.flipY) ctx.scale(1, -1);

      if (this.radius > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
      } else if (this.image) {
        const sw = this.srcW || this.image.width;
        const sh = this.srcH || this.image.height;
        ctx.drawImage(this.image, this.srcX, this.srcY, sw, sh, -w/2, -h/2, w, h);
      } else {
        ctx.fillStyle = this.color;
        ctx.fillRect(-w/2, -h/2, w, h);
      }
      ctx.restore();
    }
  }

  /** Sprite animation: cycles through frames on a sprite sheet. */
  class AnimatorComponent extends Component {
    constructor(opts = {}) {
      super();
      this._anims   = new Map();  // name → { frames, fps, loop }
      this._current = null;
      this._frame   = 0;
      this._timer   = 0;
      this._playing = false;
    }

    /** Define an animation clip.
     * @param {string} name
     * @param {{x,y,w,h}[]} frames  Array of source rects on the sprite sheet
     * @param {number} fps
     * @param {boolean} loop
     */
    define(name, frames, fps = 12, loop = true) {
      this._anims.set(name, { frames, fps, loop });
      return this;
    }

    play(name, restart = false) {
      if (this._current === name && !restart) return;
      this._current = name;
      this._frame   = 0;
      this._timer   = 0;
      this._playing = true;
    }

    stop() { this._playing = false; }

    update(dt) {
      if (!this._playing || !this._current) return;
      const anim = this._anims.get(this._current);
      if (!anim) return;
      this._timer += dt;
      const frameDur = 1 / anim.fps;
      while (this._timer >= frameDur) {
        this._timer -= frameDur;
        this._frame++;
        if (this._frame >= anim.frames.length) {
          if (anim.loop) { this._frame = 0; }
          else { this._frame = anim.frames.length - 1; this._playing = false; }
        }
      }
      // Update sprite source rect
      const sprite = this.entity.getComponent(SpriteComponent);
      if (sprite && anim.frames[this._frame]) {
        const f = anim.frames[this._frame];
        sprite.srcX = f.x; sprite.srcY = f.y;
        sprite.srcW = f.w; sprite.srcH = f.h;
      }
    }

    get currentFrame() { return this._frame; }
    get isPlaying()    { return this._playing; }
  }

  /** Collider: AABB or circle collision detection. */
  class ColliderComponent extends Component {
    constructor(opts = {}) {
      super();
      this.type     = opts.type   || 'aabb';  // 'aabb' | 'circle'
      this.offsetX  = opts.offsetX || 0;
      this.offsetY  = opts.offsetY || 0;
      this.width    = opts.width  || null;   // null → use entity size
      this.height   = opts.height || null;
      this.radius   = opts.radius || null;
      this.isTrigger = opts.isTrigger || false;
      this.layer    = opts.layer  || 0;
      this.onCollide = opts.onCollide || null;
    }

    get bounds() {
      const e = this.entity;
      const w = this.width  || e.width;
      const h = this.height || e.height;
      return new Rect(
        e.worldX + this.offsetX - w/2,
        e.worldY + this.offsetY - h/2,
        w, h
      );
    }

    get circleRadius() { return this.radius || Math.max(this.entity.width, this.entity.height) / 2; }
    get cx() { return this.entity.worldX + this.offsetX; }
    get cy() { return this.entity.worldY + this.offsetY; }

    /** Test collision with another ColliderComponent. */
    test(other) {
      if (this.type === 'circle' && other.type === 'circle') {
        return Math2D.dist(this.cx, this.cy, other.cx, other.cy) < this.circleRadius + other.circleRadius;
      }
      if (this.type === 'aabb' && other.type === 'aabb') {
        return this.bounds.intersects(other.bounds);
      }
      // Mixed: AABB vs circle
      const [circ, box] = this.type === 'circle' ? [this, other] : [other, this];
      const b = box.bounds;
      const cx = Math2D.clamp(circ.cx, b.x, b.right);
      const cy = Math2D.clamp(circ.cy, b.y, b.bottom);
      return Math2D.dist(circ.cx, circ.cy, cx, cy) < circ.circleRadius;
    }

    draw(ctx) {
      if (!window._BFGameDebug) return;
      ctx.save();
      ctx.strokeStyle = this.isTrigger ? 'rgba(255,200,0,.8)' : 'rgba(0,255,100,.8)';
      ctx.lineWidth = 1;
      if (this.type === 'circle') {
        ctx.beginPath();
        ctx.arc(this.offsetX, this.offsetY, this.circleRadius, 0, Math.PI*2);
        ctx.stroke();
      } else {
        const b = this.bounds;
        ctx.strokeRect(b.x - this.entity.worldX, b.y - this.entity.worldY, b.w, b.h);
      }
      ctx.restore();
    }
  }

  /** Text label component. */
  class TextComponent extends Component {
    constructor(opts = {}) {
      super();
      this.text     = opts.text   || '';
      this.font     = opts.font   || '14px Inter, sans-serif';
      this.color    = opts.color  || '#fff';
      this.align    = opts.align  || 'center';
      this.baseline = opts.baseline || 'middle';
      this.shadow   = opts.shadow || null;  // { color, blur, x, y }
      this.stroke   = opts.stroke || null;  // { color, width }
    }

    draw(ctx) {
      ctx.save();
      ctx.font         = this.font;
      ctx.textAlign    = this.align;
      ctx.textBaseline = this.baseline;
      if (this.shadow) {
        ctx.shadowColor   = this.shadow.color || 'rgba(0,0,0,.5)';
        ctx.shadowBlur    = this.shadow.blur  || 4;
        ctx.shadowOffsetX = this.shadow.x     || 0;
        ctx.shadowOffsetY = this.shadow.y     || 2;
      }
      if (this.stroke) {
        ctx.strokeStyle = this.stroke.color;
        ctx.lineWidth   = this.stroke.width || 2;
        ctx.strokeText(this.text, 0, 0);
      }
      ctx.fillStyle = this.color;
      ctx.fillText(this.text, 0, 0);
      ctx.restore();
    }
  }

  /* ──────────────────────────────────────────────────────────
     §8  PARTICLE SYSTEM
  ────────────────────────────────────────────────────────── */
  class Particle {
    constructor(opts) {
      this.x     = opts.x;
      this.y     = opts.y;
      this.vx    = opts.vx;
      this.vy    = opts.vy;
      this.life  = opts.life;
      this.maxLife = opts.life;
      this.size  = opts.size;
      this.color = opts.color;
      this.alpha = 1;
      this.gravity = opts.gravity || 0;
      this.shrink  = opts.shrink  || 0;
      this.fade    = opts.fade    ?? true;
    }

    update(dt) {
      this.vy   += this.gravity * dt;
      this.x    += this.vx * dt;
      this.y    += this.vy * dt;
      this.life -= dt;
      this.size  = Math.max(0, this.size - this.shrink * dt);
      if (this.fade) this.alpha = Math.max(0, this.life / this.maxLife);
    }

    get dead() { return this.life <= 0 || this.size <= 0; }
  }

  class ParticleEmitter {
    constructor(opts = {}) {
      this.x          = opts.x || 0;
      this.y          = opts.y || 0;
      this.rate       = opts.rate    || 20;   // particles/sec
      this.burst      = opts.burst   || 0;    // one-shot burst count
      this.life       = opts.life    || [0.5, 1.5];
      this.speed      = opts.speed   || [50, 150];
      this.angle      = opts.angle   || [0, Math.PI*2];
      this.size       = opts.size    || [4, 12];
      this.colors     = opts.colors  || ['#6366f1','#ec4899','#f59e0b'];
      this.gravity    = opts.gravity || 0;
      this.shrink     = opts.shrink  || 2;
      this.fade       = opts.fade    ?? true;
      this.active     = true;
      this._particles = [];
      this._timer     = 0;

      if (this.burst > 0) this._doBurst();
    }

    _spawn() {
      const angle = Math2D.rand(...this.angle);
      const speed = Math2D.rand(...this.speed);
      return new Particle({
        x:       this.x,
        y:       this.y,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed,
        life:    Math2D.rand(...this.life),
        size:    Math2D.rand(...this.size),
        color:   this.colors[Math2D.randInt(0, this.colors.length - 1)],
        gravity: this.gravity,
        shrink:  this.shrink,
        fade:    this.fade,
      });
    }

    _doBurst() {
      for (let i = 0; i < this.burst; i++) this._particles.push(this._spawn());
    }

    update(dt) {
      if (this.active && this.burst === 0) {
        this._timer += dt;
        const interval = 1 / this.rate;
        while (this._timer >= interval) {
          this._timer -= interval;
          this._particles.push(this._spawn());
        }
      }
      this._particles.forEach(p => p.update(dt));
      this._particles = this._particles.filter(p => !p.dead);
    }

    draw(ctx) {
      this._particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    get count() { return this._particles.length; }
    get done()  { return this.burst > 0 && this._particles.length === 0; }
  }

  /* ──────────────────────────────────────────────────────────
     §9  TILEMAP
  ────────────────────────────────────────────────────────── */
  class Tilemap {
    constructor(opts = {}) {
      this.cols      = opts.cols     || 20;
      this.rows      = opts.rows     || 15;
      this.tileSize  = opts.tileSize || 32;
      this.tileset   = opts.tileset  || null;  // HTMLImageElement
      this.tilesetCols = opts.tilesetCols || 8;
      this._data     = new Uint16Array(this.cols * this.rows);
      this._solid    = new Set(opts.solidTiles || [1]);
      this.offsetX   = opts.offsetX || 0;
      this.offsetY   = opts.offsetY || 0;
    }

    /** Get tile ID at grid position. */
    get(col, row) {
      if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return 0;
      return this._data[row * this.cols + col];
    }

    /** Set tile ID at grid position. */
    set(col, row, id) {
      if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
      this._data[row * this.cols + col] = id;
    }

    /** Flood-fill from (col, row) with newId. */
    fill(col, row, newId) {
      const oldId = this.get(col, row);
      if (oldId === newId) return;
      const stack = [[col, row]];
      while (stack.length) {
        const [c, r] = stack.pop();
        if (this.get(c, r) !== oldId) continue;
        this.set(c, r, newId);
        stack.push([c-1,r],[c+1,r],[c,r-1],[c,r+1]);
      }
    }

    /** Convert world position to grid cell. */
    worldToCell(wx, wy) {
      return {
        col: Math.floor((wx - this.offsetX) / this.tileSize),
        row: Math.floor((wy - this.offsetY) / this.tileSize),
      };
    }

    /** Check if a world-space rect overlaps any solid tile. */
    isSolid(wx, wy) {
      const { col, row } = this.worldToCell(wx, wy);
      return this._solid.has(this.get(col, row));
    }

    /** Resolve AABB collision against solid tiles. Returns correction vector. */
    resolveCollision(entity) {
      const b   = entity.bounds;
      const ts  = this.tileSize;
      const c0  = Math.floor((b.x - this.offsetX) / ts);
      const c1  = Math.floor((b.right - this.offsetX) / ts);
      const r0  = Math.floor((b.y - this.offsetY) / ts);
      const r1  = Math.floor((b.bottom - this.offsetY) / ts);
      let dx = 0, dy = 0;

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (!this._solid.has(this.get(c, r))) continue;
          const tx = this.offsetX + c * ts;
          const ty = this.offsetY + r * ts;
          const tileRect = new Rect(tx, ty, ts, ts);
          if (!b.intersects(tileRect)) continue;

          const overlapX = Math.min(b.right - tileRect.x, tileRect.right - b.x);
          const overlapY = Math.min(b.bottom - tileRect.y, tileRect.bottom - b.y);

          if (overlapX < overlapY) {
            dx = b.cx < tileRect.cx ? -overlapX : overlapX;
          } else {
            dy = b.cy < tileRect.cy ? -overlapY : overlapY;
            const phys = entity.getComponent(PhysicsComponent);
            if (phys) {
              if (dy < 0) phys.grounded = true;
              phys.vy = 0;
            }
          }
        }
      }
      entity.x += dx;
      entity.y += dy;
    }

    draw(ctx, camX = 0, camY = 0, camW = 800, camH = 600) {
      const ts  = this.tileSize;
      const c0  = Math.max(0, Math.floor((camX - this.offsetX) / ts));
      const c1  = Math.min(this.cols - 1, Math.ceil((camX + camW - this.offsetX) / ts));
      const r0  = Math.max(0, Math.floor((camY - this.offsetY) / ts));
      const r1  = Math.min(this.rows - 1, Math.ceil((camY + camH - this.offsetY) / ts));

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const id = this.get(c, r);
          if (id === 0) continue;
          const dx = this.offsetX + c * ts;
          const dy = this.offsetY + r * ts;

          if (this.tileset) {
            const sx = ((id - 1) % this.tilesetCols) * ts;
            const sy = Math.floor((id - 1) / this.tilesetCols) * ts;
            ctx.drawImage(this.tileset, sx, sy, ts, ts, dx, dy, ts, ts);
          } else {
            // Fallback: colour-coded tiles
            const COLORS = ['','#4ade80','#60a5fa','#f87171','#fbbf24','#a78bfa','#34d399','#fb923c'];
            ctx.fillStyle = COLORS[id % COLORS.length] || '#888';
            ctx.fillRect(dx, dy, ts - 1, ts - 1);
          }

          if (window._BFGameDebug) {
            ctx.strokeStyle = 'rgba(255,255,255,.1)';
            ctx.strokeRect(dx, dy, ts, ts);
          }
        }
      }
    }

    /** Serialise to a plain object for saving. */
    toJSON() {
      return { cols: this.cols, rows: this.rows, tileSize: this.tileSize, data: [...this._data] };
    }

    /** Restore from serialised data. */
    fromJSON(obj) {
      this.cols = obj.cols; this.rows = obj.rows; this.tileSize = obj.tileSize;
      this._data = new Uint16Array(obj.data);
    }
  }

  /* ──────────────────────────────────────────────────────────
     §10  TWEEN / TIMELINE
  ────────────────────────────────────────────────────────── */
  const Easing = {
    linear:    t => t,
    easeIn:    t => t * t,
    easeOut:   t => t * (2 - t),
    easeInOut: t => t < .5 ? 2*t*t : -1+(4-2*t)*t,
    bounce:    t => {
      if (t < 1/2.75) return 7.5625*t*t;
      if (t < 2/2.75) return 7.5625*(t-=1.5/2.75)*t+.75;
      if (t < 2.5/2.75) return 7.5625*(t-=2.25/2.75)*t+.9375;
      return 7.5625*(t-=2.625/2.75)*t+.984375;
    },
    elastic: t => t === 0 ? 0 : t === 1 ? 1 :
      -Math.pow(2, 10*(t-1)) * Math.sin((t-1.1)*5*Math.PI),
    spring: t => 1 - Math.cos(t * Math.PI * 4.5) * Math.pow(1 - t, 3),
  };

  class Tween {
    constructor(target, props, duration, opts = {}) {
      this._target   = target;
      this._props    = props;
      this._duration = duration;
      this._ease     = opts.ease   || Easing.easeOut;
      this._delay    = opts.delay  || 0;
      this._onDone   = opts.onDone || null;
      this._loop     = opts.loop   || false;
      this._yoyo     = opts.yoyo   || false;
      this._timer    = -this._delay;
      this._from     = {};
      this._done     = false;
      this._forward  = true;

      // Capture start values
      Object.keys(props).forEach(k => { this._from[k] = target[k]; });
    }

    update(dt) {
      if (this._done) return;
      this._timer += dt;
      if (this._timer < 0) return;

      const t = Math2D.clamp(this._timer / this._duration, 0, 1);
      const e = this._forward ? this._ease(t) : this._ease(1 - t);

      Object.keys(this._props).forEach(k => {
        this._target[k] = Math2D.lerp(this._from[k], this._props[k], e);
      });

      if (t >= 1) {
        if (this._loop) {
          this._timer = 0;
          if (this._yoyo) this._forward = !this._forward;
        } else {
          this._done = true;
          if (this._onDone) this._onDone();
        }
      }
    }

    get done() { return this._done; }
  }

  class Timeline {
    constructor() { this._tweens = []; }

    add(target, props, duration, opts = {}) {
      this._tweens.push(new Tween(target, props, duration, opts));
      return this;
    }

    update(dt) {
      this._tweens.forEach(t => t.update(dt));
      this._tweens = this._tweens.filter(t => !t.done);
    }

    clear() { this._tweens = []; }
    get count() { return this._tweens.length; }
  }

  /* ──────────────────────────────────────────────────────────
     §11  SCENE
  ────────────────────────────────────────────────────────── */
  class Scene {
    constructor(name) {
      this.name      = name;
      this._entities = new Map();
      this._layers   = new Map();  // layer → Entity[]
      this._tilemaps = [];
      this._emitters = [];
      this.timeline  = new Timeline();
      this._engine   = null;
    }

    addEntity(entity) {
      entity.scene = this;
      this._entities.set(entity.id, entity);
      const layer = entity.layer;
      if (!this._layers.has(layer)) this._layers.set(layer, []);
      this._layers.get(layer).push(entity);
      return entity;
    }

    removeEntity(id) {
      const e = this._entities.get(id);
      if (!e) return;
      e.destroy();
      this._entities.delete(id);
      this._layers.forEach(arr => {
        const i = arr.indexOf(e);
        if (i !== -1) arr.splice(i, 1);
      });
    }

    getEntity(id)       { return this._entities.get(id) || null; }
    getByTag(tag)       { return [...this._entities.values()].filter(e => e.hasTag(tag)); }
    getByName(name)     { return [...this._entities.values()].find(e => e.name === name) || null; }

    addTilemap(tm)      { this._tilemaps.push(tm); return tm; }
    addEmitter(em)      { this._emitters.push(em); return em; }

    /** Run collision detection between all entities with ColliderComponents. */
    _runCollisions() {
      const colliders = [...this._entities.values()]
        .map(e => ({ entity: e, col: e.getComponent(ColliderComponent) }))
        .filter(x => x.col);

      for (let i = 0; i < colliders.length; i++) {
        for (let j = i + 1; j < colliders.length; j++) {
          const a = colliders[i], b = colliders[j];
          if (a.col.test(b.col)) {
            if (a.col.onCollide) a.col.onCollide(b.entity, a.entity);
            if (b.col.onCollide) b.col.onCollide(a.entity, b.entity);
          }
        }
      }
    }

    update(dt) {
      this._entities.forEach(e => e.update(dt));
      this._tilemaps.forEach(tm => {
        this._entities.forEach(e => {
          if (e.getComponent(PhysicsComponent)) {
            const phys = e.getComponent(PhysicsComponent);
            phys.grounded = false;
            tm.resolveCollision(e);
          }
        });
      });
      this._runCollisions();
      this._emitters.forEach(em => em.update(dt));
      this._emitters = this._emitters.filter(em => !em.done);
      this.timeline.update(dt);
    }

    draw(ctx, camera) {
      // Draw tilemaps first (background)
      this._tilemaps.forEach(tm => tm.draw(ctx, camera.x, camera.y, camera.width, camera.height));

      // Draw entities sorted by layer
      const sortedLayers = [...this._layers.keys()].sort((a, b) => a - b);
      sortedLayers.forEach(layer => {
        this._layers.get(layer).forEach(e => e.draw(ctx));
      });

      // Draw particles (always on top of entities)
      this._emitters.forEach(em => em.draw(ctx));
    }

    init()    {}
    onEnter() {}
    onExit()  {}
  }

  /* ──────────────────────────────────────────────────────────
     §12  PERFORMANCE PROFILER
  ────────────────────────────────────────────────────────── */
  class Profiler {
    constructor() {
      this._fps     = 0;
      this._frames  = 0;
      this._elapsed = 0;
      this._samples = [];
      this._maxSamples = 60;
    }

    update(dt) {
      this._frames++;
      this._elapsed += dt;
      this._samples.push(dt);
      if (this._samples.length > this._maxSamples) this._samples.shift();
      if (this._elapsed >= 0.5) {
        this._fps     = Math.round(this._frames / this._elapsed);
        this._frames  = 0;
        this._elapsed = 0;
      }
    }

    draw(ctx, x = 8, y = 8) {
      const avgDt = this._samples.reduce((a,b) => a+b, 0) / (this._samples.length || 1);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(x, y, 140, 56);
      ctx.fillStyle = '#0f0';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText(`FPS: ${this._fps}`, x+6, y+16);
      ctx.fillText(`dt:  ${(avgDt*1000).toFixed(2)}ms`, x+6, y+30);
      ctx.fillText(`ent: ${this._entityCount || 0}`, x+6, y+44);

      // Mini FPS graph
      ctx.strokeStyle = '#0f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      this._samples.forEach((s, i) => {
        const gx = x + 80 + i * (60 / this._maxSamples);
        const gy = y + 50 - Math.min(s * 3000, 48);
        i === 0 ? ctx.moveTo(gx, gy) : ctx.lineTo(gx, gy);
      });
      ctx.stroke();
      ctx.restore();
    }

    set entityCount(n) { this._entityCount = n; }
  }

  /* ──────────────────────────────────────────────────────────
     §13  MAIN ENGINE
  ────────────────────────────────────────────────────────── */
  class Engine {
    constructor(canvas, opts = {}) {
      this.canvas   = canvas;
      this.ctx      = canvas.getContext('2d');
      this.width    = canvas.width;
      this.height   = canvas.height;

      this.assets   = new AssetManager();
      this.input    = new InputManager(canvas);
      this.audio    = new AudioManager();
      this.camera   = new Camera(this.width, this.height);
      this.profiler = new Profiler();
      this.timeline = new Timeline();

      this._scenes  = new Map();
      this._scene   = null;
      this._running = false;
      this._lastTime = 0;
      this._raf     = null;
      this._debug   = opts.debug || false;
      this._bgColor = opts.bgColor || '#1a1a2e';
      this._showProfiler = opts.showProfiler ?? true;

      window._BFGameDebug = this._debug;

      // Resize handling
      if (opts.autoResize) this._setupResize();
    }

    _setupResize() {
      const resize = () => {
        const parent = this.canvas.parentElement;
        if (!parent) return;
        this.canvas.width  = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
        this.width  = this.canvas.width;
        this.height = this.canvas.height;
        this.camera.width  = this.width;
        this.camera.height = this.height;
      };
      window.addEventListener('resize', resize);
      resize();
    }

    addScene(scene) {
      scene._engine = this;
      this._scenes.set(scene.name, scene);
      return this;
    }

    switchScene(name) {
      if (this._scene) this._scene.onExit();
      const next = this._scenes.get(name);
      if (!next) { console.error('[BFGame] Scene not found:', name); return; }
      this._scene = next;
      this._scene.init();
      this._scene.onEnter();
    }

    start(sceneName) {
      if (sceneName) this.switchScene(sceneName);
      this._running  = true;
      this._lastTime = performance.now();
      this._loop(this._lastTime);
    }

    stop()   { this._running = false; cancelAnimationFrame(this._raf); }
    pause()  { this._running = false; }
    resume() { this._running = true; this._lastTime = performance.now(); this._loop(this._lastTime); }

    _loop(now) {
      if (!this._running) return;
      this._raf = requestAnimationFrame(t => this._loop(t));

      const dt = Math.min((now - this._lastTime) / 1000, 0.05); // cap at 50ms
      this._lastTime = now;

      this.input.update();
      this.audio.resume();
      this.camera.update(dt);
      this.timeline.update(dt);
      this.profiler.update(dt);

      if (this._scene) {
        this._scene.update(dt);
        this.profiler.entityCount = this._scene._entities.size;
      }

      // Render
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.fillStyle = this._bgColor;
      ctx.fillRect(0, 0, this.width, this.height);

      this.camera.apply(ctx);
      if (this._scene) this._scene.draw(ctx, this.camera);
      this.camera.restore(ctx);

      if (this._showProfiler) this.profiler.draw(ctx);
    }

    /** Tween a property on any object. */
    tween(target, props, duration, opts = {}) {
      const tw = new Tween(target, props, duration, opts);
      this.timeline.add(target, props, duration, opts);
      return tw;
    }

    /** Spawn a burst particle effect at world position. */
    burst(x, y, opts = {}) {
      if (!this._scene) return;
      const em = new ParticleEmitter({ x, y, burst: opts.count || 20, ...opts });
      this._scene.addEmitter(em);
      return em;
    }

    set debug(v) { this._debug = v; window._BFGameDebug = v; }
    get debug()  { return this._debug; }
    get scene()  { return this._scene; }
  }

  /* ──────────────────────────────────────────────────────────
     §14  PUBLIC API
  ────────────────────────────────────────────────────────── */
  return {
    VERSION,
    // Core
    Engine, Scene, Entity, Component,
    // Components
    PhysicsComponent, SpriteComponent, AnimatorComponent,
    ColliderComponent, TextComponent,
    // Systems
    Tilemap, ParticleEmitter, Particle,
    // Animation
    Tween, Timeline, Easing,
    // Utilities
    Camera, AssetManager, InputManager, AudioManager, Profiler,
    Vec2, Rect, Math2D,
    // Factory helpers
    createEngine: (canvas, opts) => new Engine(canvas, opts),
    createScene:  (name)         => new Scene(name),
    createEntity: (opts)         => new Entity(opts),
  };
})();

/* ============================================================
   §15  BLOCKFORGE GAME STUDIO UI
   Integrates the game engine into the BlockForge editor as
   a dedicated "Game Studio" panel with:
   - Canvas preview with live game loop
   - Entity inspector
   - Tilemap editor
   - Code editor with hot-reload
   - Asset browser
   - Scene manager
============================================================ */

const GameStudio = (() => {
  'use strict';

  let _engine   = null;
  let _scene    = null;
  let _canvas   = null;
  let _overlay  = null;
  let _activeTab = 'scene';
  let _selectedEntity = null;
  let _tilemapTool    = 'draw';
  let _tilemapTileId  = 1;
  let _tilemap        = null;
  let _codeEditor     = null;
  let _userCode       = getDefaultCode();
  let _codeError      = null;

  /* ── Default starter code ── */
  function getDefaultCode() {
    return `// BlockForge Game Studio — Starter Script
// This code runs every time you click "Run"
// The engine, scene, Vec2, Easing, and all BFGame classes are available.

// ── Create a player entity ──
const player = scene.addEntity(
  new BFGame.Entity({ name:'Player', x:200, y:200, width:32, height:32, layer:1 })
);
player.addComponent(new BFGame.SpriteComponent({ color:'#6366f1', radius:16 }));
player.addComponent(new BFGame.PhysicsComponent({ gravity:600, friction:0.9 }));
player.addComponent(new BFGame.ColliderComponent({ type:'circle', radius:16 }));

// ── Player label ──
const label = new BFGame.TextComponent({
  text:'Player', color:'#fff', font:'bold 11px Inter, sans-serif',
  shadow:{ color:'rgba(0,0,0,.8)', blur:4 }
});
player.addComponent(label);

// ── Platform ──
const platform = scene.addEntity(
  new BFGame.Entity({ name:'Platform', x:200, y:340, width:200, height:20, layer:0 })
);
platform.addComponent(new BFGame.SpriteComponent({ color:'#10b981' }));
platform.addComponent(new BFGame.ColliderComponent({
  type:'aabb',
  onCollide:(other) => {
    if(other.name === 'Player') {
      const phys = other.getComponent(BFGame.PhysicsComponent);
      if(phys) phys.vy = -400;
    }
  }
}));

// ── Particles ──
const emitter = scene.addEmitter(new BFGame.ParticleEmitter({
  x:200, y:200, rate:8,
  speed:[20,60], life:[0.5,1.2],
  colors:['#6366f1','#a5b4fc','#ec4899'],
  gravity:50, shrink:3, fade:true
}));

// ── Camera follows player ──
engine.camera.follow(player, 0.08);
engine.camera.zoom = 1.2;

// ── Custom update hook ──
scene._userUpdate = (dt) => {
  const phys = player.getComponent(BFGame.PhysicsComponent);
  if(!phys) return;

  // Horizontal movement
  const speed = 220;
  phys.vx = engine.input.axis('ArrowLeft','ArrowRight') * speed;

  // Jump
  if(engine.input.isPressed('Space') || engine.input.isPressed('ArrowUp')) {
    if(phys.grounded) phys.vy = -480;
  }

  // Update emitter position
  emitter.x = player.x;
  emitter.y = player.y + 16;

  // Wrap horizontally
  if(player.x < 0)   player.x = 400;
  if(player.x > 400) player.x = 0;
};
`;
  }

  /* ── Build the studio HTML ── */
  function buildHTML() {
    return `
<div id="gameStudio" style="
  position:fixed;inset:0;z-index:3000;
  background:#0a0a12;display:flex;flex-direction:column;
  font-family:'Inter',sans-serif;color:#eeeef8;
  animation:gsIn .25s cubic-bezier(.4,0,.2,1);
">
<style>
@keyframes gsIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
#gameStudio *{box-sizing:border-box}
#gameStudio ::-webkit-scrollbar{width:4px;height:4px}
#gameStudio ::-webkit-scrollbar-thumb{background:#2a2a3e;border-radius:99px}
.gs-toolbar{height:48px;background:#0f0f18;border-bottom:1px solid rgba(255,255,255,.07);
  display:flex;align-items:center;padding:0 14px;gap:8px;flex-shrink:0}
.gs-brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;margin-right:8px}
.gs-logo{width:26px;height:26px;border-radius:6px;background:linear-gradient(135deg,#6366f1,#10b981);
  display:flex;align-items:center;justify-content:center;font-size:13px}
.gs-badge{font-size:8px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  background:linear-gradient(135deg,#6366f1,#10b981);color:#fff;padding:2px 5px;border-radius:99px}
.gs-sep{width:1px;height:20px;background:rgba(255,255,255,.1);margin:0 2px}
.gs-btn{height:28px;padding:0 10px;border-radius:5px;font-size:11.5px;font-weight:600;
  color:#9090b0;display:flex;align-items:center;gap:5px;cursor:pointer;border:none;
  background:none;transition:all .15s ease;white-space:nowrap}
.gs-btn:hover{background:#1b1b28;color:#eeeef8}
.gs-btn.run{background:#10b981;color:#fff}
.gs-btn.run:hover{background:#059669}
.gs-btn.stop{background:#ef4444;color:#fff}
.gs-btn.stop:hover{background:#c53030}
.gs-btn.active{background:#6366f1;color:#fff}
.gs-spacer{flex:1}
.gs-body{flex:1;display:flex;overflow:hidden}
.gs-sidebar{width:240px;background:#0f0f18;border-right:1px solid rgba(255,255,255,.07);
  display:flex;flex-direction:column;flex-shrink:0;overflow:hidden}
.gs-tabs{display:flex;padding:6px 8px 0;gap:2px;flex-shrink:0}
.gs-tab{flex:1;height:24px;border-radius:4px;font-size:10px;font-weight:700;
  color:#55556a;cursor:pointer;border:none;background:none;transition:all .15s ease}
.gs-tab.active{background:#1b1b28;color:#eeeef8}
.gs-tab:hover:not(.active){color:#9090b0}
.gs-panel{flex:1;overflow-y:auto;padding:8px}
.gs-section{margin-bottom:12px}
.gs-section-title{font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;
  color:#38384a;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.05)}
.gs-entity-item{display:flex;align-items:center;gap:6px;padding:5px 7px;border-radius:5px;
  cursor:pointer;font-size:11px;color:#9090b0;transition:all .15s ease}
.gs-entity-item:hover{background:#1b1b28;color:#eeeef8}
.gs-entity-item.active{background:rgba(99,102,241,.15);color:#818cf8}
.gs-entity-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.gs-prop-row{display:flex;align-items:center;gap:6px;margin-bottom:5px}
.gs-prop-label{font-size:10px;color:#9090b0;min-width:60px;flex-shrink:0}
.gs-prop-input{flex:1;height:24px;padding:0 6px;background:#1b1b28;border:1px solid rgba(255,255,255,.07);
  border-radius:4px;color:#eeeef8;font-size:11px;outline:none}
.gs-prop-input:focus{border-color:#6366f1}
.gs-canvas-area{flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative}
.gs-canvas-toolbar{height:36px;background:#0f0f18;border-bottom:1px solid rgba(255,255,255,.07);
  display:flex;align-items:center;padding:0 12px;gap:8px;flex-shrink:0}
.gs-canvas-wrap{flex:1;overflow:hidden;display:flex;align-items:center;justify-content:center;
  background:repeating-conic-gradient(#111 0% 25%,#0d0d12 0% 50%) 0 0/20px 20px}
#gsCanvas{border-radius:4px;box-shadow:0 8px 40px rgba(0,0,0,.8);cursor:crosshair}
.gs-code-area{width:340px;background:#0f0f18;border-left:1px solid rgba(255,255,255,.07);
  display:flex;flex-direction:column;flex-shrink:0}
.gs-code-header{height:36px;background:#0f0f18;border-bottom:1px solid rgba(255,255,255,.07);
  display:flex;align-items:center;padding:0 12px;gap:8px;flex-shrink:0}
.gs-code-title{font-size:10.5px;font-weight:700;color:#9090b0}
#gsCodeEditor{flex:1;width:100%;border:none;outline:none;resize:none;
  background:#080810;color:#a5b4fc;font-family:'JetBrains Mono',monospace;
  font-size:11.5px;line-height:1.7;padding:12px;tab-size:2}
.gs-code-error{padding:8px 12px;background:rgba(239,68,68,.1);border-top:1px solid rgba(239,68,68,.2);
  font-size:10.5px;color:#fca5a5;font-family:'JetBrains Mono',monospace;flex-shrink:0;max-height:80px;overflow-y:auto}
.gs-tilemap-tools{display:flex;gap:4px;align-items:center}
.gs-tool-btn{width:26px;height:26px;border-radius:4px;border:1px solid rgba(255,255,255,.1);
  background:#1b1b28;color:#9090b0;font-size:12px;cursor:pointer;display:flex;
  align-items:center;justify-content:center;transition:all .15s ease}
.gs-tool-btn.active{background:#6366f1;color:#fff;border-color:#6366f1}
.gs-tool-btn:hover:not(.active){background:#222232;color:#eeeef8}
.gs-tile-palette{display:grid;grid-template-columns:repeat(6,1fr);gap:3px;margin-top:6px}
.gs-tile-swatch{width:100%;aspect-ratio:1;border-radius:3px;cursor:pointer;border:2px solid transparent;transition:all .15s ease}
.gs-tile-swatch.active{border-color:#fff;transform:scale(1.1)}
.gs-status{height:24px;background:#080810;border-top:1px solid rgba(255,255,255,.05);
  display:flex;align-items:center;padding:0 12px;gap:12px;flex-shrink:0}
.gs-status-item{font-size:9.5px;color:#38384a;font-family:'JetBrains Mono',monospace}
.gs-status-item span{color:#55556a}
</style>

<!-- TOOLBAR -->
<div class="gs-toolbar">
  <div class="gs-brand">
    <div class="gs-logo">🎮</div>
    Game Studio
    <span class="gs-badge">Beta</span>
  </div>
  <div class="gs-sep"></div>
  <button class="gs-btn run" id="gsRunBtn" onclick="GameStudio.run()">▶ Run</button>
  <button class="gs-btn stop" id="gsStopBtn" onclick="GameStudio.stop()" style="display:none">■ Stop</button>
  <button class="gs-btn" onclick="GameStudio.resetScene()">↺ Reset</button>
  <div class="gs-sep"></div>
  <button class="gs-btn ${_activeTab==='scene'?'active':''}" onclick="GameStudio.setTab('scene',this)">🗂 Scene</button>
  <button class="gs-btn ${_activeTab==='tilemap'?'active':''}" onclick="GameStudio.setTab('tilemap',this)">🗺 Tilemap</button>
  <button class="gs-btn ${_activeTab==='assets'?'active':''}" onclick="GameStudio.setTab('assets',this)">📦 Assets</button>
  <div class="gs-sep"></div>
  <button class="gs-btn" onclick="GameStudio.toggleDebug()" id="gsDebugBtn">🐛 Debug</button>
  <button class="gs-btn" onclick="GameStudio.exportGame()">📤 Export</button>
  <div class="gs-spacer"></div>
  <button class="gs-btn" onclick="GameStudio.close()" style="color:#ef4444">✕ Close</button>
</div>

<!-- BODY -->
<div class="gs-body">

  <!-- LEFT SIDEBAR -->
  <div class="gs-sidebar">
    <div class="gs-tabs">
      <button class="gs-tab active" onclick="GameStudio.sideTab('entities',this)">Entities</button>
      <button class="gs-tab" onclick="GameStudio.sideTab('inspector',this)">Inspector</button>
      <button class="gs-tab" onclick="GameStudio.sideTab('settings',this)">Settings</button>
    </div>
    <div class="gs-panel" id="gsSidePanel">
      <div class="gs-section">
        <div class="gs-section-title">Scene Entities</div>
        <div id="gsEntityList"><p style="font-size:10px;color:#38384a;padding:4px">Run the game to see entities</p></div>
      </div>
    </div>
  </div>

  <!-- CANVAS -->
  <div class="gs-canvas-area">
    <div class="gs-canvas-toolbar">
      <span style="font-size:10px;font-weight:700;color:#55556a;letter-spacing:.07em;text-transform:uppercase" id="gsCanvasMode">Design Mode</span>
      <div class="gs-sep"></div>
      <div class="gs-tilemap-tools" id="gsTilemapTools" style="display:none">
        <button class="gs-tool-btn active" onclick="GameStudio.setTool('draw',this)" title="Draw">✏️</button>
        <button class="gs-tool-btn" onclick="GameStudio.setTool('erase',this)" title="Erase">🧹</button>
        <button class="gs-tool-btn" onclick="GameStudio.setTool('fill',this)" title="Fill">🪣</button>
        <button class="gs-tool-btn" onclick="GameStudio.setTool('pick',this)" title="Pick">💉</button>
        <div class="gs-sep"></div>
        <span style="font-size:10px;color:#55556a">Tile:</span>
        <div id="gsTilePalette" class="gs-tile-palette" style="display:flex;gap:4px;flex-wrap:nowrap"></div>
      </div>
      <div style="flex:1"></div>
      <span style="font-size:10px;color:#38384a;font-family:'JetBrains Mono',monospace" id="gsMousePos">0, 0</span>
    </div>
    <div class="gs-canvas-wrap" id="gsCanvasWrap">
      <canvas id="gsCanvas" width="600" height="400"></canvas>
    </div>
    <div class="gs-status">
      <span class="gs-status-item">FPS: <span id="gsStatFPS">—</span></span>
      <span class="gs-status-item">Entities: <span id="gsStatEnt">—</span></span>
      <span class="gs-status-item">Particles: <span id="gsStatPart">—</span></span>
      <span class="gs-status-item">Camera: <span id="gsStatCam">0, 0</span></span>
    </div>
  </div>

  <!-- CODE EDITOR -->
  <div class="gs-code-area">
    <div class="gs-code-header">
      <span class="gs-code-title">⌨ Game Script</span>
      <div style="flex:1"></div>
      <button class="gs-btn" onclick="GameStudio.formatCode()" style="height:24px;padding:0 8px;font-size:10px">Format</button>
      <button class="gs-btn run" onclick="GameStudio.run()" style="height:24px;padding:0 8px;font-size:10px">▶ Run</button>
    </div>
    <textarea id="gsCodeEditor" spellcheck="false" placeholder="// Write your game code here...">${_userCode}</textarea>
    <div class="gs-code-error" id="gsCodeError" style="display:none"></div>
  </div>

</div>
`;
  }

  /* ── Tile palette colours ── */
  const TILE_COLORS = ['','#4ade80','#60a5fa','#f87171','#fbbf24','#a78bfa','#34d399','#fb923c','#f472b6','#94a3b8','#e2e8f0','#1e293b'];

  /* ── Public API ── */
  return {

    open() {
      if (document.getElementById('gameStudio')) return;
      const div = document.createElement('div');
      div.innerHTML = buildHTML();
      document.body.appendChild(div.firstElementChild);
      _overlay = document.getElementById('gameStudio');
      _canvas  = document.getElementById('gsCanvas');

      this._setupCanvas();
      this._buildTilePalette();
      this._setupMouseTracking();
      this._drawDesignCanvas();
    },

    close() {
      if (_engine) { _engine.stop(); _engine = null; }
      document.getElementById('gameStudio')?.remove();
      _overlay = null; _canvas = null; _scene = null;
    },

    _setupCanvas() {
      const wrap = document.getElementById('gsCanvasWrap');
      if (!wrap) return;
      const resize = () => {
        const w = Math.min(wrap.clientWidth - 32, 800);
        const h = Math.min(wrap.clientHeight - 32, 500);
        if (_canvas) { _canvas.width = w; _canvas.height = h; }
        if (_engine) { _engine.width = w; _engine.height = h; _engine.camera.width = w; _engine.camera.height = h; }
      };
      new ResizeObserver(resize).observe(wrap);
      resize();
    },

    _buildTilePalette() {
      const pal = document.getElementById('gsTilePalette');
      if (!pal) return;
      pal.innerHTML = TILE_COLORS.slice(1).map((c, i) => `
        <div class="gs-tile-swatch ${i+1===_tilemapTileId?'active':''}"
          style="background:${c};width:20px;height:20px"
          onclick="GameStudio.selectTile(${i+1},this)" title="Tile ${i+1}"></div>`).join('');
    },

    _setupMouseTracking() {
      if (!_canvas) return;
      _canvas.addEventListener('mousemove', e => {
        const r = _canvas.getBoundingClientRect();
        const mx = Math.round(e.clientX - r.left);
        const my = Math.round(e.clientY - r.top);
        const el = document.getElementById('gsMousePos');
        if (el) el.textContent = `${mx}, ${my}`;

        // Tilemap drawing
        if (_tilemap && e.buttons === 1) this._tilemapPaint(mx, my);
      });
      _canvas.addEventListener('mousedown', e => {
        if (_tilemap) {
          const r = _canvas.getBoundingClientRect();
          this._tilemapPaint(e.clientX - r.left, e.clientY - r.top);
        }
      });
    },

    _tilemapPaint(mx, my) {
      if (!_tilemap) return;
      const cam = _engine?.camera;
      const wx  = cam ? cam.screenToWorld(mx, my).x : mx;
      const wy  = cam ? cam.screenToWorld(mx, my).y : my;
      const { col, row } = _tilemap.worldToCell(wx, wy);

      if (_tilemapTool === 'draw')  _tilemap.set(col, row, _tilemapTileId);
      if (_tilemapTool === 'erase') _tilemap.set(col, row, 0);
      if (_tilemapTool === 'fill')  _tilemap.fill(col, row, _tilemapTileId);
      if (_tilemapTool === 'pick') {
        const id = _tilemap.get(col, row);
        if (id > 0) { _tilemapTileId = id; this._buildTilePalette(); }
      }
    },

    _drawDesignCanvas() {
      if (!_canvas) return;
      const ctx = _canvas.getContext('2d');
      const w = _canvas.width, h = _canvas.height;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
      for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

      // Centre text
      ctx.fillStyle = 'rgba(255,255,255,.15)';
      ctx.font = 'bold 16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Click ▶ Run to start the game', w/2, h/2 - 16);
      ctx.font = '12px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillText('Edit the script on the right, then click Run', w/2, h/2 + 12);
    },

    run() {
      const codeEl = document.getElementById('gsCodeEditor');
      if (codeEl) _userCode = codeEl.value;

      // Stop existing engine
      if (_engine) { _engine.stop(); _engine = null; }

      // Create fresh engine
      _engine = BFGame.createEngine(_canvas, {
        bgColor: '#1a1a2e',
        showProfiler: true,
        debug: window._BFGameDebug || false,
      });

      // Create scene
      _scene = BFGame.createScene('main');

      // Create default tilemap
      _tilemap = new BFGame.Tilemap({ cols:20, rows:15, tileSize:32, offsetX:0, offsetY:200 });
      // Default ground
      for (let c = 0; c < 20; c++) { _tilemap.set(c, 0, 1); _tilemap.set(c, 1, 2); }
      _scene.addTilemap(_tilemap);

      // Patch scene update to call user hook
      const origUpdate = _scene.update.bind(_scene);
      _scene.update = (dt) => {
        origUpdate(dt);
        if (_scene._userUpdate) _scene._userUpdate(dt);
      };

      _engine.addScene(_scene);

      // Run user code
      const errorEl = document.getElementById('gsCodeError');
      try {
        const fn = new Function('engine','scene','BFGame','Vec2','Easing', _userCode);
        fn(_engine, _scene, BFGame, BFGame.Vec2, BFGame.Easing);
        _codeError = null;
        if (errorEl) errorEl.style.display = 'none';
      } catch(err) {
        _codeError = err.message;
        if (errorEl) { errorEl.textContent = '⚠ ' + err.message; errorEl.style.display = 'block'; }
        console.error('[GameStudio] Script error:', err);
      }

      _engine.start('main');

      // Update UI
      document.getElementById('gsRunBtn').style.display  = 'none';
      document.getElementById('gsStopBtn').style.display = '';
      document.getElementById('gsCanvasMode').textContent = 'Running';

      // Status updater
      this._statusInterval = setInterval(() => this._updateStatus(), 200);
    },

    stop() {
      if (_engine) { _engine.stop(); }
      clearInterval(this._statusInterval);
      document.getElementById('gsRunBtn').style.display  = '';
      document.getElementById('gsStopBtn').style.display = 'none';
      document.getElementById('gsCanvasMode').textContent = 'Stopped';
      this._drawDesignCanvas();
    },

    resetScene() {
      this.stop();
      setTimeout(() => this.run(), 100);
    },

    _updateStatus() {
      if (!_engine || !_scene) return;
      const fps  = document.getElementById('gsStatFPS');
      const ent  = document.getElementById('gsStatEnt');
      const part = document.getElementById('gsStatPart');
      const cam  = document.getElementById('gsStatCam');
      if (fps)  fps.textContent  = _engine.profiler._fps || '—';
      if (ent)  ent.textContent  = _scene._entities.size;
      if (part) part.textContent = _scene._emitters.reduce((a,e) => a + e.count, 0);
      if (cam)  cam.textContent  = `${Math.round(_engine.camera.x)}, ${Math.round(_engine.camera.y)}`;

      // Entity list
      const list = document.getElementById('gsEntityList');
      if (list) {
        list.innerHTML = [..._scene._entities.values()].map(e => `
          <div class="gs-entity-item ${_selectedEntity===e.id?'active':''}"
               onclick="GameStudio.selectEntity('${e.id}')">
            <div class="gs-entity-dot" style="background:${e.getComponent(BFGame.SpriteComponent)?.color||'#6366f1'}"></div>
            <span>${e.name}</span>
            <span style="margin-left:auto;font-size:9px;color:#38384a">#${e.id.slice(-4)}</span>
          </div>`).join('') || '<p style="font-size:10px;color:#38384a;padding:4px">No entities</p>';
      }
    },

    selectEntity(id) {
      _selectedEntity = id;
      const e = _scene?._entities.get(id);
      if (!e) return;
      const panel = document.getElementById('gsSidePanel');
      if (!panel) return;
      panel.innerHTML = `
        <div class="gs-section">
          <div class="gs-section-title">Entity: ${e.name}</div>
          ${['x','y','width','height','rotation','alpha','layer'].map(k => `
            <div class="gs-prop-row">
              <label class="gs-prop-label">${k}</label>
              <input class="gs-prop-input" type="number" value="${Math.round(e[k]*100)/100}"
                oninput="GameStudio.setProp('${id}','${k}',+this.value)">
            </div>`).join('')}
          <div class="gs-prop-row">
            <label class="gs-prop-label">visible</label>
            <input type="checkbox" ${e.visible?'checked':''} onchange="GameStudio.setProp('${id}','visible',this.checked)">
          </div>
          <div class="gs-prop-row">
            <label class="gs-prop-label">active</label>
            <input type="checkbox" ${e.active?'checked':''} onchange="GameStudio.setProp('${id}','active',this.checked)">
          </div>
        </div>
        <div class="gs-section">
          <div class="gs-section-title">Components</div>
          ${[...e._components.keys()].map(k => `
            <div class="gs-entity-item"><span>${k}</span></div>`).join('') || '<p style="font-size:10px;color:#38384a">None</p>'}
        </div>`;
    },

    setProp(id, key, value) {
      const e = _scene?._entities.get(id);
      if (e) e[key] = value;
    },

    setTab(tab, btn) {
      _activeTab = tab;
      document.querySelectorAll('#gameStudio .gs-btn').forEach(b => {
        if (['scene','tilemap','assets'].includes(b.textContent.trim().replace(/^[^\s]+\s/,''))) b.classList.remove('active');
      });
      if (btn) btn.classList.add('active');
      const tools = document.getElementById('gsTilemapTools');
      if (tools) tools.style.display = tab === 'tilemap' ? 'flex' : 'none';
    },

    sideTab(tab, btn) {
      document.querySelectorAll('#gameStudio .gs-tab').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
    },

    setTool(tool, btn) {
      _tilemapTool = tool;
      document.querySelectorAll('.gs-tool-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
    },

    selectTile(id, el) {
      _tilemapTileId = id;
      document.querySelectorAll('.gs-tile-swatch').forEach(s => s.classList.remove('active'));
      if (el) el.classList.add('active');
    },

    toggleDebug() {
      window._BFGameDebug = !window._BFGameDebug;
      if (_engine) _engine.debug = window._BFGameDebug;
      const btn = document.getElementById('gsDebugBtn');
      if (btn) btn.style.background = window._BFGameDebug ? '#6366f1' : '';
    },

    formatCode() {
      const el = document.getElementById('gsCodeEditor');
      if (!el) return;
      // Basic indentation normalisation
      const lines = el.value.split('\n');
      let indent = 0;
      el.value = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('}') || trimmed.startsWith(')')) indent = Math.max(0, indent - 1);
        const result = '  '.repeat(indent) + trimmed;
        if (trimmed.endsWith('{') || trimmed.endsWith('(')) indent++;
        return result;
      }).join('\n');
    },

    exportGame() {
      if (!_userCode) return;
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BlockForge Game Export</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#1a1a2e;display:flex;align-items:center;justify-content:center;height:100vh}
    canvas{border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.8)}
  </style>
</head>
<body>
  <canvas id="c" width="800" height="500"></canvas>
  <script>
${document.getElementById('gsCodeEditor')?.value || ''}
  <\/script>
  <script>
    // Auto-boot
    const canvas = document.getElementById('c');
    const engine = BFGame.createEngine(canvas, { bgColor:'#1a1a2e', showProfiler:false });
    const scene  = BFGame.createScene('main');
    engine.addScene(scene);
    try {
      (function(engine,scene,BFGame,Vec2,Easing){
        ${_userCode}
      })(engine,scene,BFGame,BFGame.Vec2,BFGame.Easing);
    } catch(e) { console.error(e); }
    engine.start('main');
  <\/script>
</body>
</html>`;
      const blob = new Blob([html], { type:'text/html' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download:'game-export.html' });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      if (typeof toast === 'function') toast('Game exported!', 'success');
    },
  };
})();

// Make globally accessible
window.BFGame      = BFGame;
window.GameStudio  = GameStudio;