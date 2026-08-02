/* ============================================================
   BLOCKFORGE TOUCH ENGINE v1
   Pinch-to-zoom · Two-finger pan · Long-press select · Swipe-delete
   Works alongside the existing engine.js — no conflicts
============================================================ */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────
     CONSTANTS
  ────────────────────────────────────────────────────────── */
  const LONG_PRESS_MS   = 520;   // ms before long-press fires
  const SWIPE_THRESHOLD = 72;    // px horizontal swipe to trigger delete
  const SWIPE_VELOCITY  = 0.35;  // px/ms minimum velocity
  const ZOOM_MIN        = 0.35;
  const ZOOM_MAX        = 3.0;
  const ZOOM_SNAP       = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]; // snap points
  const SNAP_TOLERANCE  = 0.06;  // snap if within 6% of a snap point
  const DOUBLE_TAP_MS   = 280;   // ms window for double-tap
  const PAN_FRICTION    = 0.88;  // momentum decay per frame

  /* ──────────────────────────────────────────────────────────
     STATE
  ────────────────────────────────────────────────────────── */
  const T = {
    // Pinch / zoom
    pinching:      false,
    pinchStartDist:0,
    pinchStartZoom:1,
    currentZoom:   1,
    originX:       0,   // zoom origin in canvas coords
    originY:       0,

    // Pan
    panning:       false,
    panStartX:     0,
    panStartY:     0,
    panScrollX:    0,
    panScrollY:    0,
    velX:          0,
    velY:          0,
    lastPanTime:   0,
    lastPanX:      0,
    lastPanY:      0,
    momentumRAF:   null,

    // Long press
    longPressTimer:null,
    longPressEl:   null,
    longPressMoved:false,

    // Swipe
    swipeEl:       null,
    swipeStartX:   0,
    swipeStartY:   0,
    swipeStartTime:0,
    swipeDeltaX:   0,
    swipeActive:   false,

    // Double tap
    lastTapTime:   0,
    lastTapEl:     null,

    // Misc
    activeTouches: 0,
  };

  /* ──────────────────────────────────────────────────────────
     HELPERS
  ────────────────────────────────────────────────────────── */
  function dist(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function midpoint(t1, t2) {
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function snapZoom(z) {
    for (const s of ZOOM_SNAP) {
      if (Math.abs(z - s) / s < SNAP_TOLERANCE) return s;
    }
    return z;
  }

  function getFrame()  { return document.getElementById('canvasFrame'); }
  function getScroll() { return document.getElementById('canvasScroll'); }

  /* ──────────────────────────────────────────────────────────
     ZOOM APPLICATION
  ────────────────────────────────────────────────────────── */
  function applyZoom(newZoom, pivotClientX, pivotClientY) {
    const scroll = getScroll();
    const frame  = getFrame();
    if (!scroll || !frame) return;

    newZoom = clamp(newZoom, ZOOM_MIN, ZOOM_MAX);
    newZoom = snapZoom(newZoom);

    const rect      = scroll.getBoundingClientRect();
    const oldZoom   = T.currentZoom;

    // Pivot point relative to scroll container
    const pivotX = pivotClientX - rect.left + scroll.scrollLeft;
    const pivotY = pivotClientY - rect.top  + scroll.scrollTop;

    // Adjust scroll so pivot stays fixed
    const scale = newZoom / oldZoom;
    scroll.scrollLeft = pivotX * scale - (pivotClientX - rect.left);
    scroll.scrollTop  = pivotY * scale - (pivotClientY - rect.top);

    T.currentZoom = newZoom;
    frame.style.transform       = `scale(${newZoom})`;
    frame.style.transformOrigin = 'top left';

    // Sync with engine state if available
    if (typeof state !== 'undefined') state.zoom = Math.round(newZoom * 100);
    const zv = document.getElementById('zoomVal');
    if (zv) zv.textContent = Math.round(newZoom * 100) + '%';

    showZoomHUD(Math.round(newZoom * 100));
  }

  /* ──────────────────────────────────────────────────────────
     ZOOM HUD
  ────────────────────────────────────────────────────────── */
  let hudTimeout = null;
  function showZoomHUD(pct) {
    let hud = document.getElementById('bf-zoom-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'bf-zoom-hud';
      hud.style.cssText = `
        position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
        background:rgba(0,0,0,.75); color:#fff; font-size:13px; font-weight:700;
        padding:6px 16px; border-radius:99px; z-index:9998;
        font-family:'JetBrains Mono',monospace; pointer-events:none;
        backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.15);
        transition:opacity .25s; letter-spacing:.03em;
      `;
      document.body.appendChild(hud);
    }
    hud.textContent = pct + '%';
    hud.style.opacity = '1';
    clearTimeout(hudTimeout);
    hudTimeout = setTimeout(() => { hud.style.opacity = '0'; }, 1200);
  }

  /* ──────────────────────────────────────────────────────────
     LONG PRESS FEEDBACK
  ────────────────────────────────────────────────────────── */
  function showLongPressRing(x, y) {
    let ring = document.getElementById('bf-lp-ring');
    if (!ring) {
      ring = document.createElement('div');
      ring.id = 'bf-lp-ring';
      ring.style.cssText = `
        position:fixed; width:48px; height:48px; border-radius:50%;
        border:3px solid #6366f1; pointer-events:none; z-index:9997;
        transform:translate(-50%,-50%) scale(0);
        transition:transform .5s cubic-bezier(.34,1.56,.64,1), opacity .3s;
        opacity:0;
      `;
      document.body.appendChild(ring);
    }
    ring.style.left    = x + 'px';
    ring.style.top     = y + 'px';
    ring.style.opacity = '1';
    ring.style.transform = 'translate(-50%,-50%) scale(1)';
    setTimeout(() => {
      ring.style.opacity   = '0';
      ring.style.transform = 'translate(-50%,-50%) scale(0)';
    }, 600);
  }

  /* ──────────────────────────────────────────────────────────
     SWIPE DELETE INDICATOR
  ────────────────────────────────────────────────────────── */
  function updateSwipeIndicator(el, deltaX) {
    if (!el) return;
    const pct = Math.min(Math.abs(deltaX) / SWIPE_THRESHOLD, 1);
    el.style.transform  = `translateX(${deltaX}px)`;
    el.style.opacity    = String(1 - pct * 0.4);
    el.style.transition = 'none';

    // Show delete badge
    let badge = el.querySelector('.bf-swipe-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'bf-swipe-badge';
      badge.style.cssText = `
        position:absolute; right:12px; top:50%; transform:translateY(-50%);
        background:#ef4444; color:#fff; font-size:11px; font-weight:700;
        padding:4px 10px; border-radius:99px; pointer-events:none;
        opacity:0; transition:opacity .15s; z-index:5;
        font-family:'Inter',sans-serif;
      `;
      badge.textContent = '✕ Delete';
      el.style.position = 'relative';
      el.appendChild(badge);
    }
    badge.style.opacity = String(pct > 0.4 ? pct : 0);
  }

  function resetSwipeEl(el) {
    if (!el) return;
    el.style.transition = 'transform .3s cubic-bezier(.4,0,.2,1), opacity .3s';
    el.style.transform  = 'translateX(0)';
    el.style.opacity    = '1';
    const badge = el.querySelector('.bf-swipe-badge');
    if (badge) badge.remove();
  }

  function commitSwipeDelete(el) {
    if (!el) return;
    const id = el.id?.replace('bw-', '');
    if (!id) { resetSwipeEl(el); return; }

    // Animate out
    el.style.transition = 'transform .25s ease, opacity .25s ease, max-height .3s ease';
    el.style.transform  = 'translateX(-110%)';
    el.style.opacity    = '0';
    el.style.maxHeight  = el.offsetHeight + 'px';

    setTimeout(() => {
      el.style.maxHeight  = '0';
      el.style.overflow   = 'hidden';
      el.style.marginTop  = '0';
      el.style.marginBottom = '0';
      el.style.padding    = '0';
    }, 200);

    setTimeout(() => {
      if (typeof deleteBlock === 'function') deleteBlock(id);
    }, 420);

    if (typeof toast === 'function') toast('Block deleted', 'info');
  }

  /* ──────────────────────────────────────────────────────────
     MOMENTUM PAN
  ────────────────────────────────────────────────────────── */
  function startMomentum() {
    cancelAnimationFrame(T.momentumRAF);
    const scroll = getScroll();
    if (!scroll) return;

    function step() {
      if (Math.abs(T.velX) < 0.5 && Math.abs(T.velY) < 0.5) return;
      scroll.scrollLeft += T.velX;
      scroll.scrollTop  += T.velY;
      T.velX *= PAN_FRICTION;
      T.velY *= PAN_FRICTION;
      T.momentumRAF = requestAnimationFrame(step);
    }
    T.momentumRAF = requestAnimationFrame(step);
  }

  /* ──────────────────────────────────────────────────────────
     FIND BLOCK WRAPPER FROM TOUCH TARGET
  ────────────────────────────────────────────────────────── */
  function findBlockWrapper(el) {
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains('block-wrapper')) return el;
      el = el.parentElement;
    }
    return null;
  }

  function isInsideCanvas(el) {
    const frame = getFrame();
    return frame && frame.contains(el);
  }

  function isInsideScrollArea(el) {
    const scroll = getScroll();
    return scroll && scroll.contains(el);
  }

  /* ──────────────────────────────────────────────────────────
     TOUCH START
  ────────────────────────────────────────────────────────── */
  function onTouchStart(e) {
    T.activeTouches = e.touches.length;
    cancelAnimationFrame(T.momentumRAF);

    /* ── TWO-FINGER GESTURES ── */
    if (e.touches.length === 2) {
      clearLongPress();
      T.swipeActive = false;
      resetSwipeEl(T.swipeEl);
      T.swipeEl = null;

      const t1 = e.touches[0], t2 = e.touches[1];
      T.pinching      = true;
      T.panning       = true;
      T.pinchStartDist = dist(t1, t2);
      T.pinchStartZoom = T.currentZoom;

      const mid = midpoint(t1, t2);
      T.originX = mid.x;
      T.originY = mid.y;

      const scroll = getScroll();
      if (scroll) {
        T.panStartX  = mid.x;
        T.panStartY  = mid.y;
        T.panScrollX = scroll.scrollLeft;
        T.panScrollY = scroll.scrollTop;
      }
      e.preventDefault();
      return;
    }

    /* ── SINGLE FINGER ── */
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);

      /* Double-tap to reset zoom */
      const now = Date.now();
      if (now - T.lastTapTime < DOUBLE_TAP_MS && isInsideScrollArea(target)) {
        e.preventDefault();
        applyZoom(1.0, touch.clientX, touch.clientY);
        T.lastTapTime = 0;
        return;
      }
      T.lastTapTime = now;

      /* Long press on block */
      const blockEl = findBlockWrapper(target);
      if (blockEl && isInsideCanvas(blockEl)) {
        T.longPressEl    = blockEl;
        T.longPressMoved = false;
        T.longPressTimer = setTimeout(() => {
          if (!T.longPressMoved) {
            showLongPressRing(touch.clientX, touch.clientY);
            const id = blockEl.id?.replace('bw-', '');
            if (id && typeof selectBlock === 'function') {
              selectBlock(id);
              // Haptic feedback if available
              if (navigator.vibrate) navigator.vibrate(40);
            }
          }
        }, LONG_PRESS_MS);

        /* Swipe setup */
        T.swipeEl        = blockEl;
        T.swipeStartX    = touch.clientX;
        T.swipeStartY    = touch.clientY;
        T.swipeStartTime = now;
        T.swipeDeltaX    = 0;
        T.swipeActive    = false;
      }

      /* Two-finger pan init (single touch pan in scroll area) */
      if (isInsideScrollArea(target) && !blockEl) {
        const scroll = getScroll();
        if (scroll) {
          T.panning    = true;
          T.panStartX  = touch.clientX;
          T.panStartY  = touch.clientY;
          T.panScrollX = scroll.scrollLeft;
          T.panScrollY = scroll.scrollTop;
          T.lastPanX   = touch.clientX;
          T.lastPanY   = touch.clientY;
          T.lastPanTime = now;
          T.velX = 0; T.velY = 0;
        }
      }
    }
  }

  /* ──────────────────────────────────────────────────────────
     TOUCH MOVE
  ────────────────────────────────────────────────────────── */
  function onTouchMove(e) {
    T.activeTouches = e.touches.length;

    /* ── TWO-FINGER: PINCH + PAN ── */
    if (e.touches.length === 2 && T.pinching) {
      e.preventDefault();
      const t1 = e.touches[0], t2 = e.touches[1];
      const d   = dist(t1, t2);
      const mid = midpoint(t1, t2);

      // Zoom
      const newZoom = clamp(
        T.pinchStartZoom * (d / T.pinchStartDist),
        ZOOM_MIN, ZOOM_MAX
      );
      applyZoom(newZoom, mid.x, mid.y);

      // Pan (two-finger scroll)
      const scroll = getScroll();
      if (scroll && T.panning) {
        const dx = T.panStartX - mid.x;
        const dy = T.panStartY - mid.y;
        scroll.scrollLeft = T.panScrollX + dx;
        scroll.scrollTop  = T.panScrollY + dy;
      }
      return;
    }

    /* ── SINGLE FINGER ── */
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - (T.swipeStartX || touch.clientX);
      const dy = touch.clientY - (T.swipeStartY || touch.clientY);
      const moved = Math.sqrt(dx * dx + dy * dy);

      // Cancel long press if moved
      if (moved > 8) {
        T.longPressMoved = true;
        clearLongPress();
      }

      /* Swipe-to-delete (horizontal swipe on block, left direction) */
      if (T.swipeEl && !T.panning) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // Determine if this is a horizontal swipe
        if (!T.swipeActive && absDx > 10 && absDx > absDy * 1.5) {
          T.swipeActive = true;
        }

        if (T.swipeActive && dx < 0) {
          e.preventDefault();
          T.swipeDeltaX = dx;
          updateSwipeIndicator(T.swipeEl, dx);
          return;
        }
      }

      /* Single-finger pan in scroll area */
      if (T.panning) {
        const scroll = getScroll();
        if (scroll) {
          const now = Date.now();
          const dt  = now - T.lastPanTime;
          if (dt > 0) {
            T.velX = (T.lastPanX - touch.clientX) / dt * 16;
            T.velY = (T.lastPanY - touch.clientY) / dt * 16;
          }
          scroll.scrollLeft = T.panScrollX + (T.panStartX - touch.clientX);
          scroll.scrollTop  = T.panScrollY + (T.panStartY - touch.clientY);
          T.lastPanX   = touch.clientX;
          T.lastPanY   = touch.clientY;
          T.lastPanTime = now;
        }
      }
    }
  }

  /* ──────────────────────────────────────────────────────────
     TOUCH END
  ────────────────────────────────────────────────────────── */
  function onTouchEnd(e) {
    T.activeTouches = e.touches.length;
    clearLongPress();

    /* ── PINCH END ── */
    if (T.pinching && e.touches.length < 2) {
      T.pinching = false;
      T.panning  = false;
      // Snap zoom to nearest snap point
      const snapped = snapZoom(T.currentZoom);
      if (snapped !== T.currentZoom) {
        applyZoom(snapped, T.originX, T.originY);
      }
    }

    /* ── SWIPE END ── */
    if (T.swipeActive && T.swipeEl) {
      const elapsed  = Date.now() - T.swipeStartTime;
      const velocity = Math.abs(T.swipeDeltaX) / elapsed;
      const triggered = Math.abs(T.swipeDeltaX) >= SWIPE_THRESHOLD
                     || velocity >= SWIPE_VELOCITY;

      if (triggered && T.swipeDeltaX < 0) {
        commitSwipeDelete(T.swipeEl);
      } else {
        resetSwipeEl(T.swipeEl);
      }
      T.swipeEl     = null;
      T.swipeActive = false;
      T.swipeDeltaX = 0;
    } else if (T.swipeEl) {
      resetSwipeEl(T.swipeEl);
      T.swipeEl = null;
    }

    /* ── MOMENTUM PAN ── */
    if (T.panning && e.touches.length === 0) {
      T.panning = false;
      startMomentum();
    }
  }

  /* ──────────────────────────────────────────────────────────
     TOUCH CANCEL
  ────────────────────────────────────────────────────────── */
  function onTouchCancel() {
    clearLongPress();
    T.pinching    = false;
    T.panning     = false;
    T.swipeActive = false;
    resetSwipeEl(T.swipeEl);
    T.swipeEl = null;
    cancelAnimationFrame(T.momentumRAF);
  }

  /* ──────────────────────────────────────────────────────────
     LONG PRESS CLEANUP
  ────────────────────────────────────────────────────────── */
  function clearLongPress() {
    clearTimeout(T.longPressTimer);
    T.longPressTimer = null;
    T.longPressEl    = null;
  }

  /* ──────────────────────────────────────────────────────────
     GESTURE HINT OVERLAY (first-time users)
  ────────────────────────────────────────────────────────── */
  function showGestureHint() {
    if (localStorage.getItem('bf_gesture_hint_seen')) return;
    localStorage.setItem('bf_gesture_hint_seen', '1');

    const hint = document.createElement('div');
    hint.id = 'bf-gesture-hint';
    hint.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,.82);
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; z-index:9990; gap:20px;
      backdrop-filter:blur(6px); padding:24px;
      animation:fadeIn .3s ease;
    `;
    hint.innerHTML = `
      <style>
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .gh-card {
          background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12);
          border-radius:14px; padding:16px 20px; width:100%; max-width:320px;
          display:flex; align-items:center; gap:14px;
        }
        .gh-icon { font-size:28px; flex-shrink:0; }
        .gh-text h4 { font-size:13px; font-weight:700; color:#fff; margin-bottom:3px; }
        .gh-text p  { font-size:11.5px; color:rgba(255,255,255,.6); line-height:1.5; }
      </style>
      <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-.4px">Touch Gestures</div>
      <div class="gh-card"><div class="gh-icon">🤏</div><div class="gh-text"><h4>Pinch to Zoom</h4><p>Use two fingers to zoom in and out of the canvas</p></div></div>
      <div class="gh-card"><div class="gh-icon">✌️</div><div class="gh-text"><h4>Two-Finger Pan</h4><p>Drag with two fingers to scroll the canvas freely</p></div></div>
      <div class="gh-card"><div class="gh-icon">👆</div><div class="gh-text"><h4>Long Press to Select</h4><p>Hold a block for half a second to select and edit it</p></div></div>
      <div class="gh-card"><div class="gh-icon">👈</div><div class="gh-text"><h4>Swipe Left to Delete</h4><p>Swipe a block to the left to reveal the delete action</p></div></div>
      <button onclick="document.getElementById('bf-gesture-hint').remove()" style="
        margin-top:8px; height:44px; padding:0 32px; border-radius:99px;
        background:#6366f1; color:#fff; border:none; font-size:14px;
        font-weight:700; cursor:pointer; font-family:'Inter',sans-serif;
        box-shadow:0 4px 20px rgba(99,102,241,.5);
      ">Got it!</button>
    `;
    document.body.appendChild(hint);
  }

  /* ──────────────────────────────────────────────────────────
     CANVAS TOUCH STYLES
  ────────────────────────────────────────────────────────── */
  function injectTouchStyles() {
    const style = document.createElement('style');
    style.id = 'bf-touch-styles';
    style.textContent = `
      /* Prevent default touch behaviors on canvas */
      #canvasScroll {
        touch-action: pan-x pan-y;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }
      /* When pinching, disable scroll */
      #canvasScroll.pinching {
        touch-action: none;
        overflow: hidden;
      }
      /* Block items: touch-friendly tap targets */
      .blk-item {
        -webkit-tap-highlight-color: transparent;
        touch-action: none;
      }
      /* Block wrappers: swipe-ready */
      .block-wrapper {
        -webkit-tap-highlight-color: transparent;
        will-change: transform;
        overflow: hidden;
      }
      /* Selected block pulse on mobile */
      @media (pointer: coarse) {
        .block-wrapper.selected {
          outline: 2px solid #6366f1;
          box-shadow: 0 0 0 4px rgba(99,102,241,.15);
        }
        /* Larger touch targets for block controls */
        .block-ctrl-btn {
          min-height: 32px;
          min-width: 32px;
          padding: 0 10px;
        }
        /* Larger layer items */
        .layer-item { min-height: 36px; }
        /* Larger sidebar block items */
        .blk-item { padding: 10px 6px; }
        /* Larger toggle */
        .toggle { width: 40px; height: 22px; }
        .toggle::after { width: 16px; height: 16px; }
        .toggle.on::after { left: 20px; }
        /* Larger prop inputs */
        .prop-input, .prop-select { height: 34px; font-size: 13px; }
        .prop-color-input { width: 34px; height: 34px; }
        /* Larger modal close */
        .modal-close { width: 36px; height: 36px; font-size: 16px; }
      }
      /* Zoom HUD */
      #bf-zoom-hud { user-select: none; -webkit-user-select: none; }
      /* Swipe badge */
      .bf-swipe-badge { user-select: none; -webkit-user-select: none; }
      /* Gesture hint */
      #bf-gesture-hint { user-select: none; -webkit-user-select: none; }
    `;
    document.head.appendChild(style);
  }

  /* ──────────────────────────────────────────────────────────
     ATTACH LISTENERS
  ────────────────────────────────────────────────────────── */
  function attach() {
    const scroll = getScroll();
    if (!scroll) {
      // Retry until DOM is ready
      setTimeout(attach, 100);
      return;
    }

    const opts = { passive: false };
    const passiveOpts = { passive: true };

    scroll.addEventListener('touchstart',  onTouchStart,  opts);
    scroll.addEventListener('touchmove',   onTouchMove,   opts);
    scroll.addEventListener('touchend',    onTouchEnd,    passiveOpts);
    scroll.addEventListener('touchcancel', onTouchCancel, passiveOpts);

    // Also attach to sidebar for block-item touch-to-add
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.addEventListener('touchstart', onSidebarTouchStart, passiveOpts);
      sidebar.addEventListener('touchend',   onSidebarTouchEnd,   passiveOpts);
    }

    // Sync pinching class for CSS touch-action override
    scroll.addEventListener('touchstart', e => {
      if (e.touches.length >= 2) scroll.classList.add('pinching');
    }, passiveOpts);
    scroll.addEventListener('touchend', e => {
      if (e.touches.length < 2) scroll.classList.remove('pinching');
    }, passiveOpts);

    // Show gesture hint on first touch
    scroll.addEventListener('touchstart', () => {
      if (window.innerWidth <= 768) showGestureHint();
    }, { once: true, passive: true });

    console.log('[BlockForge Touch] Gesture engine attached ✓');
  }

  /* ──────────────────────────────────────────────────────────
     SIDEBAR TOUCH — tap block item to add
  ────────────────────────────────────────────────────────── */
  let _sbTouchStartX = 0, _sbTouchStartY = 0;

  function onSidebarTouchStart(e) {
    if (e.touches.length !== 1) return;
    _sbTouchStartX = e.touches[0].clientX;
    _sbTouchStartY = e.touches[0].clientY;
  }

  function onSidebarTouchEnd(e) {
    if (e.changedTouches.length !== 1) return;
    const t  = e.changedTouches[0];
    const dx = Math.abs(t.clientX - _sbTouchStartX);
    const dy = Math.abs(t.clientY - _sbTouchStartY);
    if (dx > 10 || dy > 10) return; // was a scroll, not a tap

    const item = t.target.closest('.blk-item');
    if (item) {
      const type = item.dataset.type;
      if (type && typeof addBlock === 'function') {
        addBlock(type);
        // Close sidebar on mobile after adding
        if (window.innerWidth <= 768 && typeof closeSidebar === 'function') {
          setTimeout(closeSidebar, 200);
        }
      }
    }
  }

  /* ──────────────────────────────────────────────────────────
     PUBLIC API
  ────────────────────────────────────────────────────────── */
  window.BFTouch = {
    getZoom:   () => T.currentZoom,
    setZoom:   (z) => applyZoom(z, window.innerWidth / 2, window.innerHeight / 2),
    resetZoom: () => applyZoom(1.0, window.innerWidth / 2, window.innerHeight / 2),
    showHint:  showGestureHint,
  };

  /* ──────────────────────────────────────────────────────────
     INIT
  ────────────────────────────────────────────────────────── */
  injectTouchStyles();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }

})();