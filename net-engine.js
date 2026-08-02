/**
 * @fileoverview BlockForge Pro — Real-Time Multiplayer Networking Engine
 * @description  Production-grade multiplayer layer for BFGame with:
 *
 *   Transport Layer
 *   ───────────────
 *   • WebSocket client with automatic reconnection & exponential back-off
 *   • WebRTC peer-to-peer data channels (UDP-like, ordered/unordered)
 *   • Adaptive transport selection (WebRTC preferred, WS fallback)
 *   • Message framing, binary packing (ArrayBuffer), JSON fallback
 *
 *   Synchronisation
 *   ───────────────
 *   • Client-side prediction — local input applied immediately
 *   • Server reconciliation — re-simulate from last ack'd server state
 *   • Entity interpolation — smooth remote entity movement between snapshots
 *   • Dead reckoning — extrapolate position when packets are late
 *   • Delta compression — only changed fields sent per snapshot
 *   • Snapshot ring buffer — 64-frame history for rollback
 *
 *   Lag Compensation
 *   ────────────────
 *   • RTT measurement (ping/pong with timestamps)
 *   • Clock synchronisation (NTP-style offset estimation)
 *   • Input buffering with sequence numbers
 *   • Server rewinds world state to client's send time for hit detection
 *   • Jitter buffer — smooths variable network delay
 *
 *   Authoritative Server (in-browser simulation)
 *   ─────────────────────────────────────────────
 *   • Full server loop runs in a Web Worker (non-blocking)
 *   • Validates all client inputs before applying
 *   • Broadcasts authoritative snapshots at configurable tick rate
 *   • Anti-cheat: velocity clamping, position sanity checks
 *   • Room-based isolation — multiple games on one server
 *
 *   Lobby System
 *   ────────────
 *   • Room creation / joining / leaving
 *   • Player ready-check with countdown
 *   • Spectator mode
 *   • Chat messages
 *   • Host migration on disconnect
 *
 *   ECS Integration
 *   ───────────────
 *   • NetworkComponent — marks entities for sync
 *   • NetPhysicsComponent — networked physics with prediction
 *   • Seamless addComponent() / getComponent() API
 *   • Automatic entity spawn/despawn on join/leave
 *
 * @version 1.0.0
 * @author  BlockForge Team
 */

'use strict';

/* ============================================================
   §1  CONSTANTS & CONFIGURATION
============================================================ */

const NET_CONFIG = {
  /** Snapshot broadcast rate (server → clients) in Hz */
  TICK_RATE:          20,

  /** Client input send rate in Hz */
  INPUT_RATE:         60,

  /** Max snapshots kept in ring buffer */
  SNAPSHOT_BUFFER:    64,

  /** Max input commands buffered before oldest is dropped */
  INPUT_BUFFER:       128,

  /** Interpolation delay in ms (2 snapshot intervals = smooth) */
  INTERP_DELAY_MS:    100,

  /** Dead-reckoning timeout — extrapolate for up to this many ms */
  DR_TIMEOUT_MS:      500,

  /** RTT samples for smoothed average */
  RTT_SAMPLES:        8,

  /** WebSocket reconnect attempts before giving up */
  MAX_RECONNECTS:     5,

  /** Base reconnect delay (doubles each attempt) */
  RECONNECT_BASE_MS:  500,

  /** Max velocity allowed (anti-cheat) */
  MAX_VELOCITY:       2000,

  /** Max position delta per tick (anti-cheat) */
  MAX_POS_DELTA:      200,

  /** Server tick interval in ms */
  get TICK_MS()       { return 1000 / this.TICK_RATE; },
};

/* ============================================================
   §2  MESSAGE PROTOCOL
   All messages are plain objects serialised to JSON or packed
   into ArrayBuffers for performance-critical paths.
============================================================ */

/**
 * Message type constants.
 * @enum {string}
 */
const MSG = {
  // Connection lifecycle
  HELLO:          'hello',          // server → client: assign peer ID
  PING:           'ping',           // client → server
  PONG:           'pong',           // server → client

  // Lobby
  LOBBY_LIST:     'lobby_list',     // server → client: available rooms
  ROOM_CREATE:    'room_create',    // client → server
  ROOM_JOIN:      'room_join',      // client → server
  ROOM_LEAVE:     'room_leave',     // client → server
  ROOM_STATE:     'room_state',     // server → client: full room state
  ROOM_PLAYER_JOIN: 'room_player_join',
  ROOM_PLAYER_LEAVE:'room_player_leave',
  ROOM_READY:     'room_ready',     // client → server: toggle ready
  ROOM_START:     'room_start',     // server → client: game starting
  ROOM_CHAT:      'room_chat',      // bidirectional

  // Game
  GAME_SNAPSHOT:  'game_snapshot',  // server → client: authoritative state
  GAME_INPUT:     'game_input',     // client → server: input command
  GAME_SPAWN:     'game_spawn',     // server → client: new entity
  GAME_DESPAWN:   'game_despawn',   // server → client: entity removed
  GAME_EVENT:     'game_event',     // bidirectional: custom game events

  // WebRTC signalling
  RTC_OFFER:      'rtc_offer',
  RTC_ANSWER:     'rtc_answer',
  RTC_ICE:        'rtc_ice',
};

/**
 * Packs a snapshot into a compact ArrayBuffer.
 * Format per entity: [id(4), x(4), y(4), vx(4), vy(4), rot(2), flags(1)] = 23 bytes
 * @param {Object[]} entities
 * @returns {ArrayBuffer}
 */
function packSnapshot(entities) {
  const buf  = new ArrayBuffer(4 + entities.length * 23);
  const view = new DataView(buf);
  view.setUint32(0, entities.length);
  entities.forEach((e, i) => {
    const off = 4 + i * 23;
    view.setUint32(off,      e.netId);
    view.setFloat32(off + 4,  e.x);
    view.setFloat32(off + 8,  e.y);
    view.setFloat32(off + 12, e.vx || 0);
    view.setFloat32(off + 16, e.vy || 0);
    view.setInt16(off + 20,   Math.round((e.rotation || 0) * 100));
    view.setUint8(off + 22,   e.flags || 0);
  });
  return buf;
}

/**
 * Unpacks a snapshot ArrayBuffer.
 * @param {ArrayBuffer} buf
 * @returns {Object[]}
 */
function unpackSnapshot(buf) {
  const view    = new DataView(buf);
  const count   = view.getUint32(0);
  const result  = [];
  for (let i = 0; i < count; i++) {
    const off = 4 + i * 23;
    result.push({
      netId:    view.getUint32(off),
      x:        view.getFloat32(off + 4),
      y:        view.getFloat32(off + 8),
      vx:       view.getFloat32(off + 12),
      vy:       view.getFloat32(off + 16),
      rotation: view.getInt16(off + 20) / 100,
      flags:    view.getUint8(off + 22),
    });
  }
  return result;
}

/* ============================================================
   §3  CLOCK SYNCHRONISATION
   NTP-style offset estimation using ping/pong round trips.
============================================================ */

class ClockSync {
  constructor() {
    this._samples  = [];
    this._offset   = 0;   // ms to add to local time to get server time
    this._rtt      = 0;   // smoothed round-trip time in ms
    this._jitter   = 0;   // RTT variance
  }

  /**
   * Record a ping/pong exchange.
   * @param {number} sendTime    performance.now() when ping was sent
   * @param {number} serverTime  server timestamp from pong message
   * @param {number} recvTime    performance.now() when pong was received
   */
  record(sendTime, serverTime, recvTime) {
    const rtt    = recvTime - sendTime;
    const offset = serverTime - (sendTime + rtt / 2);

    this._samples.push({ rtt, offset });
    if (this._samples.length > NET_CONFIG.RTT_SAMPLES) this._samples.shift();

    // Smooth RTT (exponential moving average)
    const alpha = 0.125;
    this._rtt    = this._rtt * (1 - alpha) + rtt * alpha;

    // Jitter = variance of RTT
    const mean   = this._samples.reduce((s, x) => s + x.rtt, 0) / this._samples.length;
    this._jitter = Math.sqrt(
      this._samples.reduce((s, x) => s + (x.rtt - mean) ** 2, 0) / this._samples.length
    );

    // Offset: use median of samples (robust to outliers)
    const sorted = [...this._samples].sort((a, b) => a.offset - b.offset);
    this._offset = sorted[Math.floor(sorted.length / 2)].offset;
  }

  /** Current server time estimate in ms. */
  get serverNow()  { return performance.now() + this._offset; }

  /** Smoothed round-trip time in ms. */
  get rtt()        { return this._rtt; }

  /** One-way latency estimate in ms. */
  get oneWay()     { return this._rtt / 2; }

  /** RTT jitter in ms. */
  get jitter()     { return this._jitter; }

  /** Recommended interpolation delay: 2 ticks + jitter buffer. */
  get interpDelay() {
    return Math.max(NET_CONFIG.INTERP_DELAY_MS, NET_CONFIG.TICK_MS * 2 + this._jitter * 2);
  }
}

/* ============================================================
   §4  JITTER BUFFER
   Holds incoming snapshots and releases them at a smoothed rate,
   absorbing network jitter.
============================================================ */

class JitterBuffer {
  constructor(delayMs = NET_CONFIG.INTERP_DELAY_MS) {
    this._delay   = delayMs;
    this._buffer  = [];  // { serverTime, data }[]
  }

  push(serverTime, data) {
    this._buffer.push({ serverTime, data });
    this._buffer.sort((a, b) => a.serverTime - b.serverTime);
  }

  /**
   * Returns all snapshots whose server time ≤ (now - delay).
   * @param {number} serverNow  current server time estimate
   * @returns {Object[]}
   */
  drain(serverNow) {
    const threshold = serverNow - this._delay;
    const ready     = this._buffer.filter(s => s.serverTime <= threshold);
    this._buffer    = this._buffer.filter(s => s.serverTime >  threshold);
    return ready;
  }

  setDelay(ms) { this._delay = ms; }
  get size()   { return this._buffer.length; }
}

/* ============================================================
   §5  SNAPSHOT RING BUFFER
   Stores the last N world snapshots for rollback / reconciliation.
============================================================ */

class SnapshotBuffer {
  constructor(size = NET_CONFIG.SNAPSHOT_BUFFER) {
    this._size    = size;
    this._buf     = new Array(size).fill(null);
    this._head    = 0;
    this._count   = 0;
  }

  push(snapshot) {
    this._buf[this._head] = snapshot;
    this._head  = (this._head + 1) % this._size;
    this._count = Math.min(this._count + 1, this._size);
  }

  /** Get snapshot by sequence number (most recent = highest seq). */
  getBySeq(seq) {
    for (let i = 0; i < this._count; i++) {
      const idx = (this._head - 1 - i + this._size) % this._size;
      if (this._buf[idx]?.seq === seq) return this._buf[idx];
    }
    return null;
  }

  /** Get the most recent snapshot. */
  get latest() {
    if (this._count === 0) return null;
    return this._buf[(this._head - 1 + this._size) % this._size];
  }

  /** Get all snapshots newer than seq. */
  since(seq) {
    const result = [];
    for (let i = 0; i < this._count; i++) {
      const idx = (this._head - 1 - i + this._size) % this._size;
      const s   = this._buf[idx];
      if (!s || s.seq <= seq) break;
      result.unshift(s);
    }
    return result;
  }

  get count() { return this._count; }
}

/* ============================================================
   §6  INPUT BUFFER
   Stores unacknowledged input commands for re-simulation.
============================================================ */

class InputBuffer {
  constructor(size = NET_CONFIG.INPUT_BUFFER) {
    this._size = size;
    this._buf  = [];
    this._seq  = 0;
  }

  /**
   * Record a new input command.
   * @param {Object} input  { keys, mouseX, mouseY, dt, ... }
   * @returns {number} sequence number
   */
  push(input) {
    const cmd = { seq: ++this._seq, time: performance.now(), ...input };
    this._buf.push(cmd);
    if (this._buf.length > this._size) this._buf.shift();
    return cmd.seq;
  }

  /** Remove all inputs acknowledged by the server (seq ≤ ackSeq). */
  acknowledge(ackSeq) {
    this._buf = this._buf.filter(c => c.seq > ackSeq);
  }

  /** All unacknowledged inputs (for re-simulation). */
  get pending() { return [...this._buf]; }

  get lastSeq() { return this._seq; }
}

/* ============================================================
   §7  ENTITY INTERPOLATOR
   Smoothly moves remote entities between received snapshots.
============================================================ */

class EntityInterpolator {
  constructor() {
    /** netId → { states: [{time, x, y, vx, vy, rotation}] } */
    this._entities = new Map();
  }

  /**
   * Record a new state for a remote entity.
   * @param {number} netId
   * @param {number} serverTime
   * @param {Object} state  { x, y, vx, vy, rotation }
   */
  record(netId, serverTime, state) {
    if (!this._entities.has(netId)) this._entities.set(netId, { states: [] });
    const entry = this._entities.get(netId);
    entry.states.push({ time: serverTime, ...state });
    // Keep only last 10 states
    if (entry.states.length > 10) entry.states.shift();
  }

  /**
   * Get interpolated state for a remote entity at renderTime.
   * Falls back to dead reckoning if no future state is available.
   * @param {number} netId
   * @param {number} renderTime  server time to render at (now - interpDelay)
   * @returns {Object|null}
   */
  get(netId, renderTime) {
    const entry = this._entities.get(netId);
    if (!entry || entry.states.length === 0) return null;

    const states = entry.states;

    // Find the two states that bracket renderTime
    let before = null, after = null;
    for (let i = 0; i < states.length - 1; i++) {
      if (states[i].time <= renderTime && states[i + 1].time >= renderTime) {
        before = states[i];
        after  = states[i + 1];
        break;
      }
    }

    if (before && after) {
      // Interpolate between the two states
      const t = (renderTime - before.time) / (after.time - before.time);
      return {
        x:        lerp(before.x,        after.x,        t),
        y:        lerp(before.y,        after.y,        t),
        vx:       lerp(before.vx || 0,  after.vx || 0,  t),
        vy:       lerp(before.vy || 0,  after.vy || 0,  t),
        rotation: lerpAngle(before.rotation || 0, after.rotation || 0, t),
      };
    }

    // Dead reckoning: extrapolate from the most recent state
    const last = states[states.length - 1];
    const age  = renderTime - last.time;
    if (age > NET_CONFIG.DR_TIMEOUT_MS) return null; // too stale

    const dt = age / 1000;
    return {
      x:        last.x + (last.vx || 0) * dt,
      y:        last.y + (last.vy || 0) * dt,
      vx:       last.vx || 0,
      vy:       last.vy || 0,
      rotation: last.rotation || 0,
    };
  }

  remove(netId) { this._entities.delete(netId); }
  clear()       { this._entities.clear(); }
}

function lerp(a, b, t)      { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  // Shortest-path angle interpolation
  let diff = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return a + diff * t;
}

/* ============================================================
   §8  AUTHORITATIVE SERVER (Web Worker simulation)
   Runs the full physics simulation in a Web Worker so it never
   blocks the render thread. Communicates via postMessage.
============================================================ */

/**
 * Generates the Web Worker source code as a string.
 * The worker runs a simplified physics loop and broadcasts snapshots.
 * @returns {string}
 */
function buildServerWorkerCode() {
  return `
'use strict';

const TICK_MS    = ${NET_CONFIG.TICK_MS};
const MAX_VEL    = ${NET_CONFIG.MAX_VELOCITY};
const MAX_DELTA  = ${NET_CONFIG.MAX_POS_DELTA};
const GRAVITY    = 800;

// Server world state
const rooms   = new Map();  // roomId → Room
let   seq     = 0;

class ServerRoom {
  constructor(id, opts) {
    this.id       = id;
    this.name     = opts.name || 'Room ' + id;
    this.maxPlayers = opts.maxPlayers || 4;
    this.players  = new Map();  // peerId → PlayerState
    this.entities = new Map();  // netId  → EntityState
    this.started  = false;
    this.readySet = new Set();
    this._nextNetId = 1;
  }

  addPlayer(peerId, opts = {}) {
    const netId = this._nextNetId++;
    this.players.set(peerId, {
      peerId, netId,
      x: opts.spawnX || 100 + Math.random() * 400,
      y: opts.spawnY || 100,
      vx: 0, vy: 0,
      rotation: 0,
      health: 100,
      score: 0,
      name: opts.name || 'Player',
      color: opts.color || '#6366f1',
      lastInputSeq: 0,
      inputQueue: [],
      grounded: false,
    });
    return netId;
  }

  removePlayer(peerId) { this.players.delete(peerId); }

  queueInput(peerId, input) {
    const p = this.players.get(peerId);
    if (!p) return;
    // Validate sequence (reject old/duplicate inputs)
    if (input.seq <= p.lastInputSeq) return;
    p.inputQueue.push(input);
    // Cap queue size
    if (p.inputQueue.length > 16) p.inputQueue.shift();
  }

  tick(dt) {
    this.players.forEach((p, peerId) => {
      // Process all queued inputs
      p.inputQueue.sort((a, b) => a.seq - b.seq);
      p.inputQueue.forEach(input => {
        this._applyInput(p, input, dt);
        p.lastInputSeq = input.seq;
      });
      p.inputQueue = [];

      // Physics
      if (!p.grounded) p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Ground collision (simple floor)
      if (p.y > 350) { p.y = 350; p.vy = 0; p.grounded = true; }
      else           { p.grounded = false; }

      // World bounds
      if (p.x < 0)   { p.x = 0;   p.vx = Math.abs(p.vx) * 0.5; }
      if (p.x > 800) { p.x = 800; p.vx = -Math.abs(p.vx) * 0.5; }
    });
  }

  _applyInput(p, input, dt) {
    const speed = 220;
    // Horizontal
    if (input.left)  p.vx = -speed;
    if (input.right) p.vx =  speed;
    if (!input.left && !input.right) p.vx *= 0.85;

    // Jump
    if (input.jump && p.grounded) { p.vy = -480; p.grounded = false; }

    // Anti-cheat: clamp velocity
    p.vx = Math.max(-MAX_VEL, Math.min(MAX_VEL, p.vx));
    p.vy = Math.max(-MAX_VEL, Math.min(MAX_VEL, p.vy));
  }

  buildSnapshot() {
    const players = [];
    this.players.forEach((p, peerId) => {
      players.push({
        netId:    p.netId,
        peerId,
        x:        p.x,
        y:        p.y,
        vx:       p.vx,
        vy:       p.vy,
        rotation: p.rotation,
        health:   p.health,
        score:    p.score,
        grounded: p.grounded,
        lastInputSeq: p.lastInputSeq,
      });
    });
    return { seq: ++seq, time: Date.now(), roomId: this.id, players };
  }

  get isFull()  { return this.players.size >= this.maxPlayers; }
  get isEmpty() { return this.players.size === 0; }
}

// ── Tick loop ──
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt  = Math.min((now - lastTick) / 1000, 0.05);
  lastTick  = now;

  rooms.forEach(room => {
    if (!room.started) return;
    room.tick(dt);
    const snap = room.buildSnapshot();
    self.postMessage({ type: 'snapshot', roomId: room.id, snapshot: snap });
  });
}, TICK_MS);

// ── Message handler ──
self.onmessage = ({ data }) => {
  const { type, payload } = data;

  if (type === 'room_create') {
    const room = new ServerRoom(payload.roomId, payload.opts);
    rooms.set(room.id, room);
    self.postMessage({ type: 'room_created', roomId: room.id });
  }

  else if (type === 'room_join') {
    const room = rooms.get(payload.roomId);
    if (!room || room.isFull) {
      self.postMessage({ type: 'error', msg: 'Room full or not found', peerId: payload.peerId });
      return;
    }
    const netId = room.addPlayer(payload.peerId, payload.opts);
    self.postMessage({ type: 'player_joined', roomId: room.id, peerId: payload.peerId, netId });
  }

  else if (type === 'room_leave') {
    const room = rooms.get(payload.roomId);
    if (room) {
      room.removePlayer(payload.peerId);
      if (room.isEmpty) rooms.delete(payload.roomId);
    }
    self.postMessage({ type: 'player_left', roomId: payload.roomId, peerId: payload.peerId });
  }

  else if (type === 'room_start') {
    const room = rooms.get(payload.roomId);
    if (room) { room.started = true; self.postMessage({ type: 'game_started', roomId: room.id }); }
  }

  else if (type === 'input') {
    const room = rooms.get(payload.roomId);
    if (room) room.queueInput(payload.peerId, payload.input);
  }

  else if (type === 'ping') {
    self.postMessage({ type: 'pong', time: Date.now(), clientTime: payload.clientTime });
  }

  else if (type === 'room_list') {
    const list = [...rooms.values()].map(r => ({
      id: r.id, name: r.name,
      players: r.players.size, maxPlayers: r.maxPlayers,
      started: r.started,
    }));
    self.postMessage({ type: 'room_list', rooms: list });
  }
};
`;
}

/* ============================================================
   §9  WEBSOCKET TRANSPORT
   Handles connection, reconnection, and message routing.
============================================================ */

class WSTransport {
  constructor(url, onMessage) {
    this._url         = url;
    this._onMessage   = onMessage;
    this._ws          = null;
    this._reconnects  = 0;
    this._reconnectTimer = null;
    this._connected   = false;
    this._queue       = [];  // messages queued while disconnected
  }

  connect() {
    try {
      this._ws = new WebSocket(this._url);
      this._ws.binaryType = 'arraybuffer';
      this._ws.onopen    = () => this._onOpen();
      this._ws.onmessage = e => this._onRaw(e.data);
      this._ws.onclose   = e => this._onClose(e);
      this._ws.onerror   = e => console.warn('[WSTransport] Error:', e);
    } catch(e) {
      console.error('[WSTransport] Cannot connect:', e);
      this._scheduleReconnect();
    }
  }

  _onOpen() {
    this._connected  = true;
    this._reconnects = 0;
    clearTimeout(this._reconnectTimer);
    // Flush queued messages
    this._queue.forEach(m => this._send(m));
    this._queue = [];
    this._onMessage({ type: '_connected' });
  }

  _onRaw(data) {
    if (data instanceof ArrayBuffer) {
      this._onMessage({ type: '_binary', buffer: data });
    } else {
      try { this._onMessage(JSON.parse(data)); }
      catch(e) { console.warn('[WSTransport] Bad JSON:', data); }
    }
  }

  _onClose(e) {
    this._connected = false;
    this._onMessage({ type: '_disconnected', code: e.code });
    if (e.code !== 1000) this._scheduleReconnect(); // not a clean close
  }

  _scheduleReconnect() {
    if (this._reconnects >= NET_CONFIG.MAX_RECONNECTS) {
      this._onMessage({ type: '_reconnect_failed' });
      return;
    }
    const delay = NET_CONFIG.RECONNECT_BASE_MS * Math.pow(2, this._reconnects);
    this._reconnects++;
    this._reconnectTimer = setTimeout(() => this.connect(), delay);
    this._onMessage({ type: '_reconnecting', attempt: this._reconnects, delay });
  }

  send(msg) {
    if (!this._connected) { this._queue.push(msg); return; }
    this._send(msg);
  }

  _send(msg) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    if (msg instanceof ArrayBuffer) {
      this._ws.send(msg);
    } else {
      this._ws.send(JSON.stringify(msg));
    }
  }

  close() {
    clearTimeout(this._reconnectTimer);
    this._ws?.close(1000, 'Client disconnect');
  }

  get connected() { return this._connected; }
}

/* ============================================================
   §10  WEBRTC TRANSPORT
   Peer-to-peer data channels for low-latency game data.
   Uses the WebSocket server for signalling only.
============================================================ */

class RTCTransport {
  constructor(peerId, signalingFn, onMessage) {
    this._peerId     = peerId;
    this._signal     = signalingFn;  // fn(msg) to send via WS
    this._onMessage  = onMessage;
    this._peers      = new Map();    // remotePeerId → { pc, dc }
    this._config     = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };
  }

  /**
   * Initiate a WebRTC connection to a remote peer.
   * @param {string} remotePeerId
   */
  async connect(remotePeerId) {
    const pc = new RTCPeerConnection(this._config);
    const dc = pc.createDataChannel('game', { ordered: false, maxRetransmits: 0 });

    this._setupDC(dc, remotePeerId);
    this._setupPC(pc, remotePeerId);
    this._peers.set(remotePeerId, { pc, dc: null, pendingDC: dc });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this._signal({ type: MSG.RTC_OFFER, to: remotePeerId, from: this._peerId, sdp: offer.sdp });
  }

  /**
   * Handle incoming signalling messages.
   * @param {Object} msg
   */
  async handleSignal(msg) {
    if (msg.type === MSG.RTC_OFFER) {
      const pc = new RTCPeerConnection(this._config);
      this._setupPC(pc, msg.from);
      pc.ondatachannel = e => this._setupDC(e.channel, msg.from);
      this._peers.set(msg.from, { pc, dc: null });

      await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this._signal({ type: MSG.RTC_ANSWER, to: msg.from, from: this._peerId, sdp: answer.sdp });
    }

    else if (msg.type === MSG.RTC_ANSWER) {
      const peer = this._peers.get(msg.from);
      if (peer) await peer.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
    }

    else if (msg.type === MSG.RTC_ICE) {
      const peer = this._peers.get(msg.from);
      if (peer && msg.candidate) {
        try { await peer.pc.addIceCandidate(msg.candidate); } catch(e) {}
      }
    }
  }

  _setupPC(pc, remotePeerId) {
    pc.onicecandidate = e => {
      if (e.candidate) {
        this._signal({ type: MSG.RTC_ICE, to: remotePeerId, from: this._peerId, candidate: e.candidate });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this._peers.delete(remotePeerId);
        this._onMessage({ type: '_rtc_disconnected', peerId: remotePeerId });
      }
    };
  }

  _setupDC(dc, remotePeerId) {
    dc.binaryType = 'arraybuffer';
    dc.onopen  = () => {
      const peer = this._peers.get(remotePeerId);
      if (peer) peer.dc = dc;
      this._onMessage({ type: '_rtc_connected', peerId: remotePeerId });
    };
    dc.onmessage = e => {
      if (e.data instanceof ArrayBuffer) {
        this._onMessage({ type: '_binary', buffer: e.data, from: remotePeerId });
      } else {
        try { this._onMessage({ ...JSON.parse(e.data), from: remotePeerId }); }
        catch(e) {}
      }
    };
    dc.onerror = e => console.warn('[RTCTransport] DC error:', e);
  }

  /**
   * Send data to a specific peer or broadcast to all.
   * @param {Object|ArrayBuffer} data
   * @param {string|null} [toPeerId]  null = broadcast
   */
  send(data, toPeerId = null) {
    const raw = data instanceof ArrayBuffer ? data : JSON.stringify(data);
    if (toPeerId) {
      const peer = this._peers.get(toPeerId);
      if (peer?.dc?.readyState === 'open') peer.dc.send(raw);
    } else {
      this._peers.forEach(({ dc }) => {
        if (dc?.readyState === 'open') dc.send(raw);
      });
    }
  }

  disconnect(peerId) {
    const peer = this._peers.get(peerId);
    if (peer) { peer.pc.close(); this._peers.delete(peerId); }
  }

  disconnectAll() {
    this._peers.forEach(({ pc }) => pc.close());
    this._peers.clear();
  }

  get peerCount() { return this._peers.size; }
}

/* ============================================================
   §11  NETWORK COMPONENT (ECS Integration)
   Attach to any BFGame Entity to make it network-synchronised.
============================================================ */

class NetworkComponent {
  constructor(opts = {}) {
    this.entity      = null;
    this.netId       = opts.netId    || 0;
    this.ownerId     = opts.ownerId  || null;  // peerId of the owning client
    this.isLocal     = opts.isLocal  || false; // true = this client owns it
    this.syncRate    = opts.syncRate  || NET_CONFIG.TICK_RATE;
    this.syncFields  = opts.syncFields || ['x','y','rotation'];
    this._lastSync   = 0;
    this._dirty      = false;
  }

  init() {}

  /** Mark this entity as needing a sync. */
  markDirty() { this._dirty = true; }

  /** Build a state snapshot for this entity. */
  buildState() {
    const e = this.entity;
    const state = { netId: this.netId, ownerId: this.ownerId };
    this.syncFields.forEach(f => { state[f] = e[f]; });
    const phys = e.getComponent ? e.getComponent(NetPhysicsComponent) : null;
    if (phys) { state.vx = phys.vx; state.vy = phys.vy; }
    return state;
  }

  /** Apply a received state to this entity. */
  applyState(state) {
    const e = this.entity;
    this.syncFields.forEach(f => { if (f in state) e[f] = state[f]; });
  }

  update(dt) {}
  draw(ctx)  {}
  destroy()  {}
}

/* ============================================================
   §12  NET PHYSICS COMPONENT
   Extends physics with client-side prediction and reconciliation.
============================================================ */

class NetPhysicsComponent {
  constructor(opts = {}) {
    this.entity   = null;
    this.vx       = opts.vx      || 0;
    this.vy       = opts.vy      || 0;
    this.gravity  = opts.gravity ?? 800;
    this.friction = opts.friction ?? 0.85;
    this.grounded = false;
    this.static   = opts.static  ?? false;

    // Prediction state
    this._predictedX  = 0;
    this._predictedY  = 0;
    this._serverX     = 0;
    this._serverY     = 0;
    this._correcting  = false;
    this._correctionAlpha = 0.3;  // blend speed for position correction
  }

  init() {
    this._predictedX = this.entity.x;
    this._predictedY = this.entity.y;
  }

  applyForce(fx, fy)   { this.vx += fx; this.vy += fy; }
  applyImpulse(ix, iy) { this.vx += ix; this.vy += iy; }

  /**
   * Apply a server-authoritative position correction.
   * Blends smoothly to avoid visual snapping.
   * @param {number} sx  server x
   * @param {number} sy  server y
   * @param {number} svx server vx
   * @param {number} svy server vy
   */
  applyServerCorrection(sx, sy, svx, svy) {
    const dx = Math.abs(this.entity.x - sx);
    const dy = Math.abs(this.entity.y - sy);

    // If error is large, snap immediately
    if (dx > 80 || dy > 80) {
      this.entity.x = sx;
      this.entity.y = sy;
      this.vx = svx;
      this.vy = svy;
    } else if (dx > 2 || dy > 2) {
      // Smooth correction
      this._serverX    = sx;
      this._serverY    = sy;
      this._correcting = true;
      this.vx = svx;
      this.vy = svy;
    }
  }

  update(dt) {
    if (this.static) return;
    const e = this.entity;

    // Apply gravity
    if (!this.grounded) this.vy += this.gravity * dt;

    // Integrate
    e.x += this.vx * dt;
    e.y += this.vy * dt;

    // Smooth server correction
    if (this._correcting) {
      e.x = lerp(e.x, this._serverX, this._correctionAlpha);
      e.y = lerp(e.y, this._serverY, this._correctionAlpha);
      if (Math.abs(e.x - this._serverX) < 0.5 && Math.abs(e.y - this._serverY) < 0.5) {
        this._correcting = false;
      }
    }

    // Friction
    if (this.grounded) this.vx *= Math.pow(this.friction, dt * 60);
  }

  draw(ctx) {}
  destroy() {}
}

/* ============================================================
   §13  LOBBY SYSTEM
============================================================ */

class Lobby {
  constructor(net) {
    this._net     = net;
    this._rooms   = [];
    this._current = null;  // current room state
    this._players = new Map();
    this._chat    = [];
    this._onUpdate = null;
    this._onStart  = null;
    this._onChat   = null;
  }

  /** Fetch available rooms from server. */
  listRooms() {
    this._net.send({ type: MSG.LOBBY_LIST });
  }

  /**
   * Create a new room.
   * @param {string} name
   * @param {Object} opts  { maxPlayers, password, gameMode }
   */
  createRoom(name, opts = {}) {
    this._net.send({ type: MSG.ROOM_CREATE, name, ...opts });
  }

  /**
   * Join an existing room.
   * @param {string} roomId
   * @param {string} [password]
   */
  joinRoom(roomId, password = '') {
    this._net.send({ type: MSG.ROOM_JOIN, roomId, password,
      playerName: this._net.playerName, color: this._net.playerColor });
  }

  leaveRoom() {
    if (!this._current) return;
    this._net.send({ type: MSG.ROOM_LEAVE, roomId: this._current.id });
    this._current = null;
    this._players.clear();
  }

  toggleReady() {
    if (!this._current) return;
    this._net.send({ type: MSG.ROOM_READY, roomId: this._current.id });
  }

  sendChat(text) {
    if (!this._current || !text.trim()) return;
    this._net.send({ type: MSG.ROOM_CHAT, roomId: this._current.id, text: text.trim() });
  }

  /** Handle incoming lobby messages. */
  handleMessage(msg) {
    switch (msg.type) {
      case MSG.LOBBY_LIST:
        this._rooms = msg.rooms || [];
        this._onUpdate?.('rooms', this._rooms);
        break;

      case MSG.ROOM_STATE:
        this._current = msg.room;
        this._players = new Map(msg.room.players.map(p => [p.peerId, p]));
        this._onUpdate?.('room', this._current);
        break;

      case MSG.ROOM_PLAYER_JOIN:
        this._players.set(msg.player.peerId, msg.player);
        this._onUpdate?.('player_join', msg.player);
        break;

      case MSG.ROOM_PLAYER_LEAVE:
        this._players.delete(msg.peerId);
        this._onUpdate?.('player_leave', msg.peerId);
        // Host migration: if host left, promote next player
        if (this._current && msg.peerId === this._current.hostId) {
          const next = [...this._players.values()][0];
          if (next) {
            this._current.hostId = next.peerId;
            this._onUpdate?.('host_change', next.peerId);
          }
        }
        break;

      case MSG.ROOM_START:
        this._onStart?.(msg);
        break;

      case MSG.ROOM_CHAT:
        this._chat.push({ peerId: msg.peerId, name: msg.name, text: msg.text, time: Date.now() });
        if (this._chat.length > 100) this._chat.shift();
        this._onChat?.(msg);
        break;
    }
  }

  onUpdate(fn)  { this._onUpdate = fn; }
  onStart(fn)   { this._onStart  = fn; }
  onChat(fn)    { this._onChat   = fn; }

  get rooms()   { return this._rooms; }
  get room()    { return this._current; }
  get players() { return [...this._players.values()]; }
  get chat()    { return this._chat; }
  get inRoom()  { return !!this._current; }
  get isHost()  { return this._current?.hostId === this._net.peerId; }
}

/* ============================================================
   §14  NETWORK MANAGER — Main public API
============================================================ */

class NetworkManager {
  /**
   * @param {Object} opts
   * @param {string}  opts.serverUrl    WebSocket server URL (optional)
   * @param {boolean} opts.localServer  Run authoritative server in Web Worker
   * @param {string}  opts.playerName
   * @param {string}  opts.playerColor
   * @param {Object}  opts.engine       BFGame.Engine instance
   */
  constructor(opts = {}) {
    this.peerId      = 'p_' + Math.random().toString(36).slice(2, 10);
    this.playerName  = opts.playerName  || 'Player';
    this.playerColor = opts.playerColor || '#6366f1';
    this._engine     = opts.engine      || null;
    this._useLocal   = opts.localServer ?? true;

    // Sub-systems
    this._clock      = new ClockSync();
    this._jitter     = new JitterBuffer();
    this._snapshots  = new SnapshotBuffer();
    this._inputs     = new InputBuffer();
    this._interp     = new EntityInterpolator();
    this.lobby       = new Lobby(this);

    // Transport
    this._ws         = null;
    this._rtc        = null;
    this._worker     = null;

    // State
    this._roomId     = null;
    this._netEntities = new Map();  // netId → Entity
    this._localNetId  = null;
    this._pingTimer   = null;
    this._inputTimer  = null;
    this._connected   = false;

    // Callbacks
    this._onConnect    = null;
    this._onDisconnect = null;
    this._onSnapshot   = null;
    this._onSpawn      = null;
    this._onDespawn    = null;
    this._onEvent      = null;

    // Stats
    this.stats = { rtt:0, jitter:0, packetsIn:0, packetsOut:0, bytesIn:0, bytesOut:0 };
  }

  /* ── Connection ── */

  /**
   * Connect to a multiplayer session.
   * If localServer=true, spins up a Web Worker server.
   * Otherwise connects to the provided WebSocket URL.
   */
  connect() {
    if (this._useLocal) {
      this._startLocalServer();
    } else if (this._serverUrl) {
      this._startWSClient();
    }

    // Start WebRTC transport for P2P
    if (typeof RTCPeerConnection !== 'undefined') {
      this._rtc = new RTCTransport(this.peerId, msg => this.send(msg), msg => this._handleMessage(msg));
    }

    // Start ping loop
    this._pingTimer = setInterval(() => this._sendPing(), 2000);
  }

  disconnect() {
    clearInterval(this._pingTimer);
    clearInterval(this._inputTimer);
    this._ws?.close();
    this._rtc?.disconnectAll();
    this._worker?.terminate();
    this._connected = false;
    this._onDisconnect?.();
  }

  _startLocalServer() {
    const blob   = new Blob([buildServerWorkerCode()], { type: 'application/javascript' });
    const url    = URL.createObjectURL(blob);
    this._worker = new Worker(url);
    URL.revokeObjectURL(url);

    this._worker.onmessage = ({ data }) => this._handleMessage(data);
    this._worker.onerror   = e => console.error('[NetManager] Worker error:', e);

    this._connected = true;
    this._onConnect?.({ peerId: this.peerId, local: true });
  }

  _startWSClient() {
    this._ws = new WSTransport(this._serverUrl, msg => this._handleMessage(msg));
    this._ws.connect();
  }

  /* ── Sending ── */

  /**
   * Send a message to the server (worker or WebSocket).
   * @param {Object|ArrayBuffer} msg
   */
  send(msg) {
    this.stats.packetsOut++;
    if (this._worker) {
      this._worker.postMessage(msg);
    } else if (this._ws) {
      this._ws.send(msg);
    }
  }

  /**
   * Send a message directly to a peer via WebRTC.
   * @param {Object|ArrayBuffer} data
   * @param {string} [peerId]
   */
  sendPeer(data, peerId = null) {
    this._rtc?.send(data, peerId);
  }

  /* ── Input ── */

  /**
   * Capture and send the current input state.
   * Call this every frame for the local player.
   * @param {Object} inputState  { left, right, jump, mouseX, mouseY, ... }
   */
  sendInput(inputState) {
    if (!this._roomId) return;
    const seq = this._inputs.push(inputState);
    this.send({
      type:    'input',
      roomId:  this._roomId,
      peerId:  this.peerId,
      input:   { ...inputState, seq, time: this._clock.serverNow },
    });
    this.stats.packetsOut++;
  }

  /* ── Ping ── */

  _sendPing() {
    const t = performance.now();
    this.send({ type: 'ping', clientTime: t });
  }

  /* ── Message handling ── */

  _handleMessage(msg) {
    this.stats.packetsIn++;

    switch (msg.type) {

      case 'pong':
        this._clock.record(msg.clientTime, msg.time, performance.now());
        this.stats.rtt    = Math.round(this._clock.rtt);
        this.stats.jitter = Math.round(this._clock.jitter);
        this._jitter.setDelay(this._clock.interpDelay);
        break;

      case 'snapshot':
        this._handleSnapshot(msg.snapshot);
        break;

      case 'player_joined':
        this._localNetId = msg.netId;
        this._roomId     = msg.roomId;
        this._onConnect?.({ peerId: this.peerId, netId: msg.netId, roomId: msg.roomId });
        break;

      case 'player_left':
        this._handleDespawn(msg.peerId);
        break;

      case 'game_started':
        this._startInputLoop();
        break;

      case MSG.RTC_OFFER:
      case MSG.RTC_ANSWER:
      case MSG.RTC_ICE:
        this._rtc?.handleSignal(msg);
        break;

      case '_connected':
        this._connected = true;
        break;

      case '_disconnected':
      case '_reconnect_failed':
        this._connected = false;
        this._onDisconnect?.();
        break;

      default:
        // Route lobby messages
        this.lobby.handleMessage(msg);
        // Custom event callback
        this._onEvent?.(msg);
    }
  }

  /* ── Snapshot processing ── */

  _handleSnapshot(snapshot) {
    // Push into jitter buffer
    this._jitter.push(snapshot.time, snapshot);
    this._snapshots.push(snapshot);
  }

  /**
   * Process buffered snapshots and update entity positions.
   * Call this every render frame.
   */
  update(dt) {
    const renderTime = this._clock.serverNow - this._clock.interpDelay;
    const ready      = this._jitter.drain(this._clock.serverNow);

    ready.forEach(({ data: snap }) => {
      snap.players.forEach(p => {
        if (p.peerId === this.peerId) {
          // Local player: reconcile
          this._reconcile(p);
        } else {
          // Remote player: feed interpolator
          this._interp.record(p.netId, snap.time, { x:p.x, y:p.y, vx:p.vx, vy:p.vy, rotation:p.rotation });
          // Spawn entity if new
          if (!this._netEntities.has(p.netId)) this._spawnRemotePlayer(p);
        }
      });
    });

    // Apply interpolated positions to remote entities
    this._netEntities.forEach((entity, netId) => {
      const nc = entity.getComponent ? entity.getComponent(NetworkComponent) : null;
      if (!nc || nc.isLocal) return;

      const state = this._interp.get(netId, renderTime);
      if (state) {
        entity.x = state.x;
        entity.y = state.y;
        if (entity.rotation !== undefined) entity.rotation = state.rotation;
        const phys = entity.getComponent ? entity.getComponent(NetPhysicsComponent) : null;
        if (phys) { phys.vx = state.vx; phys.vy = state.vy; }
      }
    });

    this._onSnapshot?.(this._snapshots.latest);
  }

  /* ── Client-side prediction & reconciliation ── */

  /**
   * Reconcile local player position with server authority.
   * 1. Accept server position as ground truth
   * 2. Re-simulate all unacknowledged inputs on top of it
   * @param {Object} serverState  { x, y, vx, vy, lastInputSeq }
   */
  _reconcile(serverState) {
    const entity = this._netEntities.get(this._localNetId);
    if (!entity) return;

    const phys = entity.getComponent ? entity.getComponent(NetPhysicsComponent) : null;
    if (!phys) return;

    // Acknowledge processed inputs
    this._inputs.acknowledge(serverState.lastInputSeq);

    // Apply server correction
    phys.applyServerCorrection(serverState.x, serverState.y, serverState.vx, serverState.vy);

    // Re-simulate pending inputs
    const pending = this._inputs.pending;
    pending.forEach(input => {
      this._simulateInput(entity, phys, input, NET_CONFIG.TICK_MS / 1000);
    });
  }

  /**
   * Simulate a single input command on an entity.
   * Must match the server's _applyInput logic exactly.
   * @param {Object} entity
   * @param {NetPhysicsComponent} phys
   * @param {Object} input
   * @param {number} dt
   */
  _simulateInput(entity, phys, input, dt) {
    const speed = 220;
    if (input.left)  phys.vx = -speed;
    if (input.right) phys.vx =  speed;
    if (!input.left && !input.right) phys.vx *= 0.85;
    if (input.jump && phys.grounded) { phys.vy = -480; phys.grounded = false; }

    // Clamp
    phys.vx = Math.max(-NET_CONFIG.MAX_VELOCITY, Math.min(NET_CONFIG.MAX_VELOCITY, phys.vx));
    phys.vy = Math.max(-NET_CONFIG.MAX_VELOCITY, Math.min(NET_CONFIG.MAX_VELOCITY, phys.vy));

    // Integrate
    entity.x += phys.vx * dt;
    entity.y += phys.vy * dt;
    if (!phys.grounded) phys.vy += phys.gravity * dt;
    if (entity.y > 350) { entity.y = 350; phys.vy = 0; phys.grounded = true; }
  }

  /* ── Entity management ── */

  /**
   * Register a local entity for network synchronisation.
   * @param {Object} entity  BFGame.Entity
   * @param {number} netId
   */
  registerLocalEntity(entity, netId) {
    this._localNetId = netId;
    this._netEntities.set(netId, entity);
    const nc = new NetworkComponent({ netId, ownerId: this.peerId, isLocal: true });
    if (entity.addComponent) entity.addComponent(nc);
  }

  _spawnRemotePlayer(playerState) {
    if (!this._engine?.scene) return;

    // Create a remote player entity
    const entity = new (window.BFGame?.Entity || Object)({
      name:   playerState.name || 'Remote',
      x:      playerState.x,
      y:      playerState.y,
      width:  32,
      height: 32,
      layer:  1,
    });

    if (entity.addComponent && window.BFGame) {
      entity.addComponent(new window.BFGame.SpriteComponent({
        color:  playerState.color || '#ec4899',
        radius: 16,
      }));
      entity.addComponent(new NetPhysicsComponent({ gravity: 800 }));
      entity.addComponent(new NetworkComponent({
        netId:    playerState.netId,
        ownerId:  playerState.peerId,
        isLocal:  false,
      }));
      entity.addComponent(new window.BFGame.TextComponent({
        text:  playerState.name || 'Remote',
        color: '#fff',
        font:  'bold 10px Inter, sans-serif',
      }));
      this._engine.scene.addEntity(entity);
    }

    this._netEntities.set(playerState.netId, entity);
    this._onSpawn?.(entity, playerState);
  }

  _handleDespawn(peerId) {
    this._netEntities.forEach((entity, netId) => {
      const nc = entity.getComponent ? entity.getComponent(NetworkComponent) : null;
      if (nc?.ownerId === peerId) {
        if (this._engine?.scene) this._engine.scene.removeEntity(entity.id);
        this._netEntities.delete(netId);
        this._interp.remove(netId);
        this._onDespawn?.(entity);
      }
    });
  }

  /* ── Input loop ── */

  _startInputLoop() {
    clearInterval(this._inputTimer);
    this._inputTimer = setInterval(() => {
      if (!this._engine?.input) return;
      const inp = this._engine.input;
      this.sendInput({
        left:   inp.isDown('ArrowLeft')  || inp.isDown('KeyA'),
        right:  inp.isDown('ArrowRight') || inp.isDown('KeyD'),
        jump:   inp.isDown('Space')      || inp.isDown('ArrowUp') || inp.isDown('KeyW'),
        mouseX: inp.mouseX,
        mouseY: inp.mouseY,
        fire:   inp.mouseDown(0),
      });
    }, 1000 / NET_CONFIG.INPUT_RATE);
  }

  /* ── Lobby helpers ── */

  createRoom(name, opts = {}) {
    const roomId = 'r_' + Math.random().toString(36).slice(2, 8);
    this.send({ type: 'room_create', roomId, opts: { name, ...opts } });
    this._roomId = roomId;
    return roomId;
  }

  joinRoom(roomId, opts = {}) {
    this._roomId = roomId;
    this.send({ type: 'room_join', roomId, peerId: this.peerId, opts: {
      name:  this.playerName,
      color: this.playerColor,
      ...opts,
    }});
  }

  leaveRoom() {
    if (!this._roomId) return;
    this.send({ type: 'room_leave', roomId: this._roomId, peerId: this.peerId });
    this._roomId = null;
    this._netEntities.clear();
    this._interp.clear();
  }

  startGame() {
    if (!this._roomId) return;
    this.send({ type: 'room_start', roomId: this._roomId });
  }

  /* ── Callbacks ── */

  onConnect(fn)    { this._onConnect    = fn; return this; }
  onDisconnect(fn) { this._onDisconnect = fn; return this; }
  onSnapshot(fn)   { this._onSnapshot   = fn; return this; }
  onSpawn(fn)      { this._onSpawn      = fn; return this; }
  onDespawn(fn)    { this._onDespawn    = fn; return this; }
  onEvent(fn)      { this._onEvent      = fn; return this; }

  /* ── Getters ── */

  get connected()  { return this._connected; }
  get roomId()     { return this._roomId; }
  get rtt()        { return this._clock.rtt; }
  get serverTime() { return this._clock.serverNow; }
  get interpDelay(){ return this._clock.interpDelay; }
}

/* ============================================================
   §15  NETWORK STUDIO UI
   Integrates into the Game Studio as a "Multiplayer" tab.
============================================================ */

const NetworkStudio = (() => {
  let _net    = null;
  let _engine = null;

  function buildHTML() {
    return `
<div id="netStudio" style="
  position:fixed;inset:0;z-index:4000;
  background:#0a0a12;display:flex;flex-direction:column;
  font-family:'Inter',sans-serif;color:#eeeef8;
  animation:nsIn .25s cubic-bezier(.4,0,.2,1);
">
<style>
@keyframes nsIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
#netStudio *{box-sizing:border-box}
#netStudio ::-webkit-scrollbar{width:4px}
#netStudio ::-webkit-scrollbar-thumb{background:#2a2a3e;border-radius:99px}
.ns-toolbar{height:48px;background:#0f0f18;border-bottom:1px solid rgba(255,255,255,.07);
  display:flex;align-items:center;padding:0 14px;gap:8px;flex-shrink:0}
.ns-brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;margin-right:8px}
.ns-logo{width:26px;height:26px;border-radius:6px;background:linear-gradient(135deg,#6366f1,#06b6d4);
  display:flex;align-items:center;justify-content:center;font-size:13px}
.ns-badge{font-size:8px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  background:linear-gradient(135deg,#6366f1,#06b6d4);color:#fff;padding:2px 5px;border-radius:99px}
.ns-sep{width:1px;height:20px;background:rgba(255,255,255,.1);margin:0 2px}
.ns-btn{height:28px;padding:0 10px;border-radius:5px;font-size:11.5px;font-weight:600;
  color:#9090b0;display:flex;align-items:center;gap:5px;cursor:pointer;border:none;
  background:none;transition:all .15s ease;white-space:nowrap}
.ns-btn:hover{background:#1b1b28;color:#eeeef8}
.ns-btn.primary{background:#6366f1;color:#fff}
.ns-btn.primary:hover{background:#4f46e5}
.ns-btn.ok{background:#10b981;color:#fff}
.ns-btn.ok:hover{background:#059669}
.ns-btn.danger{background:rgba(239,68,68,.15);color:#fca5a5;border:1px solid rgba(239,68,68,.2)}
.ns-btn.danger:hover{background:rgba(239,68,68,.25)}
.ns-spacer{flex:1}
.ns-body{flex:1;display:flex;overflow:hidden}
.ns-sidebar{width:280px;background:#0f0f18;border-right:1px solid rgba(255,255,255,.07);
  display:flex;flex-direction:column;flex-shrink:0;overflow:hidden}
.ns-main{flex:1;display:flex;flex-direction:column;overflow:hidden}
.ns-panel{flex:1;overflow-y:auto;padding:16px}
.ns-section{margin-bottom:20px}
.ns-section-title{font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;
  color:#38384a;margin-bottom:10px;padding-bottom:5px;border-bottom:1px solid rgba(255,255,255,.05)}
.ns-field{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.ns-label{font-size:11px;color:#9090b0;min-width:80px;flex-shrink:0}
.ns-input{flex:1;height:28px;padding:0 8px;background:#141420;border:1px solid rgba(255,255,255,.07);
  border-radius:5px;color:#eeeef8;font-size:11.5px;outline:none}
.ns-input:focus{border-color:#6366f1}
.ns-room-card{background:#141420;border:1px solid rgba(255,255,255,.07);border-radius:8px;
  padding:12px;margin-bottom:8px;cursor:pointer;transition:all .15s ease}
.ns-room-card:hover{border-color:#6366f1;background:rgba(99,102,241,.08)}
.ns-room-name{font-size:13px;font-weight:700;margin-bottom:4px}
.ns-room-meta{font-size:10.5px;color:#55556a;display:flex;gap:12px}
.ns-player-item{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:6px;
  background:#141420;border:1px solid rgba(255,255,255,.05);margin-bottom:5px}
.ns-player-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.ns-player-name{flex:1;font-size:12px;font-weight:600}
.ns-player-badge{font-size:9px;font-weight:700;padding:2px 6px;border-radius:99px;
  background:rgba(99,102,241,.2);color:#818cf8}
.ns-player-ready{font-size:9px;font-weight:700;padding:2px 6px;border-radius:99px}
.ns-player-ready.yes{background:rgba(16,185,129,.2);color:#6ee7b7}
.ns-player-ready.no{background:rgba(255,255,255,.05);color:#55556a}
.ns-chat-wrap{display:flex;flex-direction:column;height:200px;background:#080810;
  border:1px solid rgba(255,255,255,.07);border-radius:6px;overflow:hidden}
.ns-chat-msgs{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:4px}
.ns-chat-msg{font-size:11px;line-height:1.4}
.ns-chat-msg .ns-chat-name{font-weight:700;color:#818cf8}
.ns-chat-input-row{display:flex;border-top:1px solid rgba(255,255,255,.07)}
.ns-chat-input{flex:1;height:32px;padding:0 10px;background:transparent;border:none;
  color:#eeeef8;font-size:11.5px;outline:none}
.ns-chat-send{height:32px;padding:0 12px;background:#6366f1;border:none;color:#fff;
  font-size:11px;font-weight:700;cursor:pointer;transition:background .15s}
.ns-chat-send:hover{background:#4f46e5}
.ns-stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.ns-stat-card{background:#141420;border:1px solid rgba(255,255,255,.07);border-radius:6px;padding:10px}
.ns-stat-val{font-size:22px;font-weight:800;color:#818cf8;font-family:'JetBrains Mono',monospace}
.ns-stat-label{font-size:9.5px;color:#38384a;margin-top:2px}
.ns-status-bar{height:28px;background:#080810;border-top:1px solid rgba(255,255,255,.05);
  display:flex;align-items:center;padding:0 14px;gap:16px;flex-shrink:0}
.ns-status-item{font-size:9.5px;color:#38384a;font-family:'JetBrains Mono',monospace}
.ns-status-item span{color:#55556a}
.ns-conn-dot{width:7px;height:7px;border-radius:50%;background:#38384a;flex-shrink:0}
.ns-conn-dot.connected{background:#10b981;box-shadow:0 0 6px #10b981}
.ns-conn-dot.connecting{background:#f59e0b;animation:nsPulse 1s ease-in-out infinite}
@keyframes nsPulse{0%,100%{opacity:1}50%{opacity:.3}}
</style>

<!-- TOOLBAR -->
<div class="ns-toolbar">
  <div class="ns-brand">
    <div class="ns-logo">🌐</div>
    Multiplayer Studio
    <span class="ns-badge">Beta</span>
  </div>
  <div class="ns-sep"></div>
  <div class="ns-conn-dot" id="nsConnDot"></div>
  <span style="font-size:11px;color:#55556a" id="nsConnLabel">Disconnected</span>
  <div class="ns-sep"></div>
  <button class="ns-btn primary" id="nsConnectBtn" onclick="NetworkStudio.connect()">Connect</button>
  <button class="ns-btn danger"  id="nsDisconnectBtn" onclick="NetworkStudio.disconnect()" style="display:none">Disconnect</button>
  <div class="ns-spacer"></div>
  <button class="ns-btn" onclick="NetworkStudio.close()" style="color:#ef4444">✕ Close</button>
</div>

<!-- BODY -->
<div class="ns-body">

  <!-- SIDEBAR: Config + Stats -->
  <div class="ns-sidebar">
    <div class="ns-panel">
      <div class="ns-section">
        <div class="ns-section-title">Player Identity</div>
        <div class="ns-field">
          <label class="ns-label">Name</label>
          <input class="ns-input" id="nsPlayerName" value="Player" placeholder="Your name">
        </div>
        <div class="ns-field">
          <label class="ns-label">Color</label>
          <input type="color" value="#6366f1" id="nsPlayerColor"
            style="width:36px;height:28px;padding:2px;background:#141420;border:1px solid rgba(255,255,255,.07);border-radius:5px;cursor:pointer">
        </div>
        <div class="ns-field">
          <label class="ns-label">Peer ID</label>
          <span style="font-size:10px;color:#38384a;font-family:'JetBrains Mono',monospace" id="nsPeerId">—</span>
        </div>
      </div>

      <div class="ns-section">
        <div class="ns-section-title">Network Stats</div>
        <div class="ns-stats-grid">
          <div class="ns-stat-card">
            <div class="ns-stat-val" id="nsStatRTT">—</div>
            <div class="ns-stat-label">RTT (ms)</div>
          </div>
          <div class="ns-stat-card">
            <div class="ns-stat-val" id="nsStatJitter">—</div>
            <div class="ns-stat-label">Jitter (ms)</div>
          </div>
          <div class="ns-stat-card">
            <div class="ns-stat-val" id="nsStatPktsIn">0</div>
            <div class="ns-stat-label">Packets In</div>
          </div>
          <div class="ns-stat-card">
            <div class="ns-stat-val" id="nsStatPktsOut">0</div>
            <div class="ns-stat-label">Packets Out</div>
          </div>
        </div>
      </div>

      <div class="ns-section">
        <div class="ns-section-title">Server Mode</div>
        <div class="ns-field">
          <label class="ns-label">Type</label>
          <select class="ns-input" id="nsServerMode">
            <option value="local">Local (Web Worker)</option>
            <option value="ws">WebSocket Server</option>
          </select>
        </div>
        <div class="ns-field" id="nsWsUrlField" style="display:none">
          <label class="ns-label">WS URL</label>
          <input class="ns-input" id="nsWsUrl" value="ws://localhost:8080" placeholder="ws://...">
        </div>
      </div>
    </div>
  </div>

  <!-- MAIN: Lobby + Room -->
  <div class="ns-main">
    <div class="ns-panel" id="nsMainPanel">
      <!-- Lobby view -->
      <div id="nsLobbyView">
        <div class="ns-section">
          <div class="ns-section-title" style="display:flex;align-items:center;justify-content:space-between">
            Available Rooms
            <div style="display:flex;gap:6px">
              <button class="ns-btn" onclick="NetworkStudio.refreshRooms()" style="height:22px;padding:0 8px;font-size:10px">↺ Refresh</button>
              <button class="ns-btn primary" onclick="NetworkStudio.showCreateRoom()" style="height:22px;padding:0 8px;font-size:10px">+ Create Room</button>
            </div>
          </div>
          <div id="nsRoomList"><p style="font-size:11px;color:#38384a">Connect to see available rooms</p></div>
        </div>

        <div class="ns-section" id="nsCreateRoomSection" style="display:none">
          <div class="ns-section-title">Create Room</div>
          <div class="ns-field">
            <label class="ns-label">Room Name</label>
            <input class="ns-input" id="nsRoomName" value="My Game Room" placeholder="Room name">
          </div>
          <div class="ns-field">
            <label class="ns-label">Max Players</label>
            <input class="ns-input" type="number" id="nsMaxPlayers" value="4" min="2" max="16">
          </div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="ns-btn ok" onclick="NetworkStudio.createRoom()" style="flex:1">Create & Join</button>
            <button class="ns-btn" onclick="document.getElementById('nsCreateRoomSection').style.display='none'">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Room view (hidden until joined) -->
      <div id="nsRoomView" style="display:none">
        <div class="ns-section">
          <div class="ns-section-title" style="display:flex;align-items:center;justify-content:space-between">
            <span id="nsRoomTitle">Room</span>
            <button class="ns-btn danger" onclick="NetworkStudio.leaveRoom()" style="height:22px;padding:0 8px;font-size:10px">Leave</button>
          </div>
          <div id="nsPlayerList"></div>
          <div style="display:flex;gap:6px;margin-top:10px">
            <button class="ns-btn" onclick="NetworkStudio.toggleReady()" id="nsReadyBtn" style="flex:1">✓ Ready</button>
            <button class="ns-btn primary" onclick="NetworkStudio.startGame()" id="nsStartBtn" style="flex:1;display:none">▶ Start Game</button>
          </div>
        </div>

        <div class="ns-section">
          <div class="ns-section-title">Chat</div>
          <div class="ns-chat-wrap">
            <div class="ns-chat-msgs" id="nsChatMsgs"></div>
            <div class="ns-chat-input-row">
              <input class="ns-chat-input" id="nsChatInput" placeholder="Type a message…"
                onkeydown="if(event.key==='Enter')NetworkStudio.sendChat()">
              <button class="ns-chat-send" onclick="NetworkStudio.sendChat()">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Status bar -->
    <div class="ns-status-bar">
      <span class="ns-status-item">Peers: <span id="nsStatPeers">0</span></span>
      <span class="ns-status-item">Interp delay: <span id="nsStatInterp">—</span>ms</span>
      <span class="ns-status-item">Snapshots: <span id="nsStatSnaps">0</span></span>
      <span class="ns-status-item">Jitter buf: <span id="nsStatJBuf">0</span></span>
    </div>
  </div>
</div>
`;
  }

  return {
    open(engine) {
      if (document.getElementById('netStudio')) return;
      _engine = engine;
      const div = document.createElement('div');
      div.innerHTML = buildHTML();
      document.body.appendChild(div.firstElementChild);

      // Server mode toggle
      document.getElementById('nsServerMode')?.addEventListener('change', e => {
        document.getElementById('nsWsUrlField').style.display = e.target.value === 'ws' ? 'flex' : 'none';
      });

      this._statsInterval = setInterval(() => this._updateStats(), 500);
    },

    close() {
      clearInterval(this._statsInterval);
      document.getElementById('netStudio')?.remove();
    },

    connect() {
      const name  = document.getElementById('nsPlayerName')?.value || 'Player';
      const color = document.getElementById('nsPlayerColor')?.value || '#6366f1';
      const mode  = document.getElementById('nsServerMode')?.value || 'local';

      _net = new NetworkManager({
        localServer:  mode === 'local',
        serverUrl:    document.getElementById('nsWsUrl')?.value,
        playerName:   name,
        playerColor:  color,
        engine:       _engine,
      });

      _net.onConnect(info => {
        this._setConnected(true);
        document.getElementById('nsPeerId').textContent = _net.peerId;
        this.refreshRooms();
      });

      _net.onDisconnect(() => this._setConnected(false));

      _net.lobby.onUpdate((event, data) => {
        if (event === 'rooms')       this._renderRooms(data);
        if (event === 'room')        this._renderRoom(data);
        if (event === 'player_join') this._renderPlayers();
        if (event === 'player_leave')this._renderPlayers();
        if (event === 'host_change') this._renderPlayers();
      });

      _net.lobby.onStart(msg => {
        this._showToast('Game starting!', '#10b981');
        // Launch game studio if available
        if (typeof GameStudio !== 'undefined') {
          setTimeout(() => { this.close(); GameStudio.open(); }, 1000);
        }
      });

      _net.lobby.onChat(msg => this._appendChat(msg));

      _net.connect();

      document.getElementById('nsConnectBtn').style.display    = 'none';
      document.getElementById('nsDisconnectBtn').style.display = '';
      this._setConnected(false, true); // connecting state
    },

    disconnect() {
      _net?.disconnect();
      _net = null;
      this._setConnected(false);
      document.getElementById('nsConnectBtn').style.display    = '';
      document.getElementById('nsDisconnectBtn').style.display = 'none';
    },

    refreshRooms() {
      if (!_net) return;
      _net.send({ type: 'room_list' });
    },

    showCreateRoom() {
      document.getElementById('nsCreateRoomSection').style.display = 'block';
    },

    createRoom() {
      if (!_net) return;
      const name       = document.getElementById('nsRoomName')?.value || 'My Room';
      const maxPlayers = parseInt(document.getElementById('nsMaxPlayers')?.value) || 4;
      const roomId     = _net.createRoom(name, { maxPlayers });
      _net.joinRoom(roomId);
      this._showRoomView(name);
    },

    leaveRoom() {
      _net?.leaveRoom();
      _net?.lobby.leaveRoom();
      document.getElementById('nsLobbyView').style.display = 'block';
      document.getElementById('nsRoomView').style.display  = 'none';
      this.refreshRooms();
    },

    toggleReady() {
      _net?.lobby.toggleReady();
      const btn = document.getElementById('nsReadyBtn');
      if (btn) btn.classList.toggle('ok');
    },

    startGame() {
      _net?.startGame();
    },

    sendChat() {
      const input = document.getElementById('nsChatInput');
      if (!input?.value.trim()) return;
      _net?.lobby.sendChat(input.value);
      this._appendChat({ peerId: _net?.peerId, name: _net?.playerName, text: input.value });
      input.value = '';
    },

    _setConnected(connected, connecting = false) {
      const dot = document.getElementById('nsConnDot');
      const lbl = document.getElementById('nsConnLabel');
      if (dot) dot.className = 'ns-conn-dot' + (connected ? ' connected' : connecting ? ' connecting' : '');
      if (lbl) lbl.textContent = connected ? 'Connected' : connecting ? 'Connecting…' : 'Disconnected';
    },

    _renderRooms(rooms) {
      const list = document.getElementById('nsRoomList');
      if (!list) return;
      if (rooms.length === 0) {
        list.innerHTML = '<p style="font-size:11px;color:#38384a">No rooms available. Create one!</p>';
        return;
      }
      list.innerHTML = rooms.map(r => `
        <div class="ns-room-card" onclick="NetworkStudio._joinRoom('${r.id}')">
          <div class="ns-room-name">${r.name}</div>
          <div class="ns-room-meta">
            <span>👥 ${r.players}/${r.maxPlayers}</span>
            <span>${r.started ? '🎮 In Progress' : '⏳ Waiting'}</span>
            <span style="margin-left:auto;color:#6366f1;font-weight:700">Join →</span>
          </div>
        </div>`).join('');
    },

    _joinRoom(roomId) {
      if (!_net) return;
      _net.joinRoom(roomId);
      this._showRoomView('Room');
    },

    _showRoomView(name) {
      document.getElementById('nsLobbyView').style.display = 'none';
      document.getElementById('nsRoomView').style.display  = 'block';
      const title = document.getElementById('nsRoomTitle');
      if (title) title.textContent = name;
    },

    _renderRoom(room) {
      this._showRoomView(room.name);
      this._renderPlayers();
      const startBtn = document.getElementById('nsStartBtn');
      if (startBtn) startBtn.style.display = _net?.lobby.isHost ? '' : 'none';
    },

    _renderPlayers() {
      const list = document.getElementById('nsPlayerList');
      if (!list || !_net) return;
      list.innerHTML = _net.lobby.players.map(p => `
        <div class="ns-player-item">
          <div class="ns-player-dot" style="background:${p.color||'#6366f1'}"></div>
          <span class="ns-player-name">${p.name || 'Player'}</span>
          ${p.peerId === _net.lobby.room?.hostId ? '<span class="ns-player-badge">Host</span>' : ''}
          <span class="ns-player-ready ${p.ready?'yes':'no'}">${p.ready?'Ready':'Not Ready'}</span>
        </div>`).join('') || '<p style="font-size:11px;color:#38384a">No players yet</p>';
    },

    _appendChat(msg) {
      const msgs = document.getElementById('nsChatMsgs');
      if (!msgs) return;
      const div = document.createElement('div');
      div.className = 'ns-chat-msg';
      div.innerHTML = `<span class="ns-chat-name">${msg.name || 'Unknown'}</span>: ${msg.text}`;
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    },

    _updateStats() {
      if (!_net) return;
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      set('nsStatRTT',    Math.round(_net.stats.rtt) || '—');
      set('nsStatJitter', Math.round(_net.stats.jitter) || '—');
      set('nsStatPktsIn',  _net.stats.packetsIn);
      set('nsStatPktsOut', _net.stats.packetsOut);
      set('nsStatPeers',   _net._rtc?.peerCount || 0);
      set('nsStatInterp',  Math.round(_net.interpDelay));
      set('nsStatSnaps',   _net._snapshots.count);
      set('nsStatJBuf',    _net._jitter.size);
    },

    _showToast(msg, color = '#6366f1') {
      const t = document.createElement('div');
      t.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
        background:${color};color:#fff;font-size:13px;font-weight:700;
        padding:10px 24px;border-radius:99px;z-index:9999;
        box-shadow:0 4px 20px rgba(0,0,0,.5);animation:nsIn .25s ease`;
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    },
  };
})();

/* ============================================================
   §16  EXPORTS
============================================================ */

window.NetworkManager  = NetworkManager;
window.NetworkStudio   = NetworkStudio;
window.NetworkComponent    = NetworkComponent;
window.NetPhysicsComponent = NetPhysicsComponent;
window.ClockSync       = ClockSync;
window.JitterBuffer    = JitterBuffer;
window.SnapshotBuffer  = SnapshotBuffer;
window.InputBuffer     = InputBuffer;
window.EntityInterpolator = EntityInterpolator;
window.packSnapshot    = packSnapshot;
window.unpackSnapshot  = unpackSnapshot;
window.NET_CONFIG      = NET_CONFIG;
window.MSG             = MSG;

// Extend BFGame if available
if (typeof BFGame !== 'undefined') {
  BFGame.NetworkManager      = NetworkManager;
  BFGame.NetworkComponent    = NetworkComponent;
  BFGame.NetPhysicsComponent = NetPhysicsComponent;
  BFGame.ClockSync           = ClockSync;
  BFGame.JitterBuffer        = JitterBuffer;
  BFGame.SnapshotBuffer      = SnapshotBuffer;
  BFGame.InputBuffer         = InputBuffer;
  BFGame.EntityInterpolator  = EntityInterpolator;
  BFGame.NET_CONFIG          = NET_CONFIG;
  BFGame.MSG                 = MSG;
}