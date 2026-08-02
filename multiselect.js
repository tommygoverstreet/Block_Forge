/* ============================================================
   BLOCKFORGE MULTI-SELECT ENGINE v1
   Two-finger tap toggle · Lasso rubber-band · Floating action bar
   Depends on: engine.js, touch.js
============================================================ */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────────────────
     CONSTANTS
  ────────────────────────────────────────────────────────── */
  const TWO_TAP_WINDOW_MS  = 180;   // ms between two fingers for "two-finger tap"
  const TWO_TAP_MOVE_PX    = 14;    // max movement to still count as tap
  const LASSO_START_PX     = 10;    // px drag before lasso activates
  const LASSO_COLOR        = 'rgba(99,102,241,.18)';
  const LASSO_BORDER       = '#6366f1';
  const FAB_ANIM_MS        = 220;

  /* ──────────────────────────────────────────────────────────
     STATE
  ────────────────────────────────────────────────────────── */
  const MS = {
    selected:      new Set(),   // Set of block IDs
    mode:          'idle',      // 'idle' | 'lasso' | 'group'

    // Lasso
    lassoActive:   false,
    lassoStartX:   0,
    lassoStartY:   0,
    lassoEl:       null,
    lassoRect:     null,        // { x, y, w, h } in canvas coords

    // Two-finger tap detection
    tfTap:         { t1: null, t2: null, time: 0 },

    // Clipboard for group duplicate
    clipboard:     [],

    // FAB position
    fabDragging:   false,
    fabDragOffX:   0,
    fabDragOffY:   0,
  };

  /* ──────────────────────────────────────────────────────────
     HELPERS
  ────────────────────────────────────────────────────────── */
  function getFrame()  { return document.getElementById('canvasFrame'); }
  function getScroll() { return document.getElementById('canvasScroll'); }

  function getBlockEl(id) { return document.getElementById('bw-' + id); }

  function getAllBlockWrappers() {
    return [...document.querySelectorAll('#canvasBlocks .block-wrapper')];
  }

  function blockIdFromEl(el) {
    while (el) {
      if (el.classList && el.classList.contains('block-wrapper')) {
        return el.id.replace('bw-', '');
      }
      el = el.parentElement;
    }
    return null;
  }

  // Convert client coords → canvas-frame coords (accounting for scroll + zoom)
  function clientToCanvas(clientX, clientY) {
    const scroll = getScroll();
    const frame  = getFrame();
    if (!scroll || !frame) return { x: 0, y: 0 };
    const frameRect  = frame.getBoundingClientRect();
    const zoom       = (typeof BFTouch !== 'undefined') ? BFTouch.getZoom() : 1;
    return {
      x: (clientX - frameRect.left) / zoom,
      y: (clientY - frameRect.top)  / zoom,
    };
  }

  // Get block bounding rect in canvas-frame coords
  function getBlockCanvasRect(id) {
    const el    = getBlockEl(id);
    const frame = getFrame();
    if (!el || !frame) return null;
    const elRect    = el.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const zoom      = (typeof BFTouch !== 'undefined') ? BFTouch.getZoom() : 1;
    return {
      x: (elRect.left   - frameRect.left) / zoom,
      y: (elRect.top    - frameRect.top)  / zoom,
      w: elRect.width  / zoom,
      h: elRect.height / zoom,
    };
  }

  // Check if two rects intersect
  function rectsIntersect(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x ||
             a.y + a.h < b.y || b.y + b.h < a.y);
  }

  /* ──────────────────────────────────────────────────────────
     SELECTION MANAGEMENT
  ────────────────────────────────────────────────────────── */
  function toggleSelect(id) {
    if (MS.selected.has(id)) {
      MS.selected.delete(id);
    } else {
      MS.selected.add(id);
      // Deselect single-select from engine
      if (typeof state !== 'undefined' && state.selected === id) {
        state.selected = null;
      }
    }
    refreshSelectionStyles();
    updateFAB();
  }

  function addToSelection(id) {
    MS.selected.add(id);
    refreshSelectionStyles();
    updateFAB();
  }

  function clearSelection() {
    MS.selected.clear();
    refreshSelectionStyles();
    hideFAB();
  }

  function selectAll() {
    if (typeof state === 'undefined') return;
    state.blocks.forEach(b => MS.selected.add(b.id));
    refreshSelectionStyles();
    updateFAB();
    if (typeof toast === 'function') toast(`${MS.selected.size} blocks selected`, 'info');
  }

  function refreshSelectionStyles() {
    getAllBlockWrappers().forEach(el => {
      const id = el.id.replace('bw-', '');
      const inMS = MS.selected.has(id);
      el.classList.toggle('ms-selected', inMS);
      // Dim unselected blocks when multi-select is active
      el.classList.toggle('ms-dimmed', MS.selected.size > 0 && !inMS);
    });
  }

  /* ──────────────────────────────────────────────────────────
     LASSO ELEMENT
  ────────────────────────────────────────────────────────── */
  function createLassoEl() {
    let el = document.getElementById('bf-lasso');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bf-lasso';
      el.style.cssText = `
        position:absolute; pointer-events:none; z-index:50;
        background:${LASSO_COLOR};
        border:2px solid ${LASSO_BORDER};
        border-radius:4px;
        display:none;
        box-shadow:0 0 0 1px rgba(99,102,241,.1);
      `;
      const frame = getFrame();
      if (frame) frame.appendChild(el);
    }
    return el;
  }

  function updateLassoEl(x, y, w, h) {
    const el = MS.lassoEl;
    if (!el) return;
    // Handle negative dimensions (drag in any direction)
    const rx = w < 0 ? x + w : x;
    const ry = h < 0 ? y + h : y;
    const rw = Math.abs(w);
    const rh = Math.abs(h);
    el.style.left    = rx + 'px';
    el.style.top     = ry + 'px';
    el.style.width   = rw + 'px';
    el.style.height  = rh + 'px';
    el.style.display = 'block';
    MS.lassoRect = { x: rx, y: ry, w: rw, h: rh };
  }

  function hideLasso() {
    if (MS.lassoEl) MS.lassoEl.style.display = 'none';
    MS.lassoActive = false;
    MS.lassoRect   = null;
  }

  function commitLassoSelection() {
    if (!MS.lassoRect) return;
    let count = 0;
    if (typeof state !== 'undefined') {
      state.blocks.forEach(b => {
        const br = getBlockCanvasRect(b.id);
        if (br && rectsIntersect(MS.lassoRect, br)) {
          MS.selected.add(b.id);
          count++;
        }
      });
    }
    if (count > 0) {
      refreshSelectionStyles();
      updateFAB();
      if (typeof toast === 'function') toast(`${count} block${count !== 1 ? 's' : ''} selected`, 'info');
    }
  }

  /* ──────────────────────────────────────────────────────────
     FLOATING ACTION BAR (FAB)
  ────────────────────────────────────────────────────────── */
  function createFAB() {
    let fab = document.getElementById('bf-fab');
    if (fab) return fab;

    fab = document.createElement('div');
    fab.id = 'bf-fab';
    fab.style.cssText = `
      position:fixed;
      bottom:72px; left:50%; transform:translateX(-50%);
      background:rgba(18,18,28,.96);
      border:1px solid rgba(255,255,255,.14);
      border-radius:16px;
      padding:8px 10px;
      display:none;
      align-items:center;
      gap:4px;
      z-index:9995;
      box-shadow:0 8px 40px rgba(0,0,0,.7), 0 0 0 1px rgba(99,102,241,.2);
      backdrop-filter:blur(16px) saturate(1.4);
      user-select:none;
      -webkit-user-select:none;
      touch-action:none;
      min-width:320px;
      max-width:calc(100vw - 32px);
      flex-wrap:wrap;
      justify-content:center;
    `;

    fab.innerHTML = `
      <!-- Selection count badge -->
      <div id="bf-fab-count" style="
        background:linear-gradient(135deg,#6366f1,#ec4899);
        color:#fff; font-size:10px; font-weight:800;
        padding:3px 9px; border-radius:99px;
        font-family:'Inter',sans-serif; letter-spacing:.03em;
        flex-shrink:0; white-space:nowrap;
      ">0 selected</div>

      <div style="width:1px;height:20px;background:rgba(255,255,255,.1);flex-shrink:0"></div>

      <!-- Action buttons -->
      <button class="bf-fab-btn" id="fab-dup"    onclick="MSEngine.groupDuplicate()" title="Duplicate selected">
        <span class="fab-ico">⧉</span><span class="fab-lbl">Duplicate</span>
      </button>
      <button class="bf-fab-btn" id="fab-up"     onclick="MSEngine.groupMoveUp()"    title="Move group up">
        <span class="fab-ico">↑</span><span class="fab-lbl">Up</span>
      </button>
      <button class="bf-fab-btn" id="fab-dn"     onclick="MSEngine.groupMoveDown()"  title="Move group down">
        <span class="fab-ico">↓</span><span class="fab-lbl">Down</span>
      </button>
      <button class="bf-fab-btn" id="fab-copy"   onclick="MSEngine.groupCopy()"      title="Copy to clipboard">
        <span class="fab-ico">📋</span><span class="fab-lbl">Copy</span>
      </button>
      <button class="bf-fab-btn" id="fab-paste"  onclick="MSEngine.groupPaste()"     title="Paste clipboard">
        <span class="fab-ico">📌</span><span class="fab-lbl">Paste</span>
      </button>

      <div style="width:1px;height:20px;background:rgba(255,255,255,.1);flex-shrink:0"></div>

      <button class="bf-fab-btn danger" id="fab-del" onclick="MSEngine.groupDelete()" title="Delete selected">
        <span class="fab-ico">🗑️</span><span class="fab-lbl">Delete</span>
      </button>

      <div style="width:1px;height:20px;background:rgba(255,255,255,.1);flex-shrink:0"></div>

      <!-- Close / deselect all -->
      <button class="bf-fab-btn close" onclick="MSEngine.clearSelection()" title="Deselect all">
        <span class="fab-ico">✕</span>
      </button>
    `;

    document.body.appendChild(fab);
    attachFABDrag(fab);
    return fab;
  }

  function updateFAB() {
    const fab = createFAB();
    const count = MS.selected.size;

    if (count === 0) { hideFAB(); return; }

    const badge = document.getElementById('bf-fab-count');
    if (badge) badge.textContent = count + ' selected';

    // Show paste button only if clipboard has content
    const pasteBtn = document.getElementById('fab-paste');
    if (pasteBtn) pasteBtn.style.opacity = MS.clipboard.length > 0 ? '1' : '0.35';

    if (fab.style.display === 'flex') return; // already visible

    fab.style.display = 'flex';
    fab.style.opacity = '0';
    fab.style.transform = 'translateX(-50%) translateY(12px) scale(.94)';
    requestAnimationFrame(() => {
      fab.style.transition = `opacity ${FAB_ANIM_MS}ms cubic-bezier(.34,1.56,.64,1), transform ${FAB_ANIM_MS}ms cubic-bezier(.34,1.56,.64,1)`;
      fab.style.opacity    = '1';
      fab.style.transform  = 'translateX(-50%) translateY(0) scale(1)';
    });
  }

  function hideFAB() {
    const fab = document.getElementById('bf-fab');
    if (!fab || fab.style.display === 'none') return;
    fab.style.transition = `opacity ${FAB_ANIM_MS}ms ease, transform ${FAB_ANIM_MS}ms ease`;
    fab.style.opacity    = '0';
    fab.style.transform  = 'translateX(-50%) translateY(10px) scale(.95)';
    setTimeout(() => {
      if (fab) fab.style.display = 'none';
    }, FAB_ANIM_MS);
  }

  /* ── FAB Drag (reposition) ── */
  function attachFABDrag(fab) {
    let startX, startY, startLeft, startBottom;

    function onStart(e) {
      // Only drag on the badge / empty area, not buttons
      if (e.target.closest('.bf-fab-btn')) return;
      MS.fabDragging = true;
      const rect = fab.getBoundingClientRect();
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      startX      = cx;
      startY      = cy;
      startLeft   = rect.left + rect.width / 2;
      startBottom = window.innerHeight - rect.bottom;
      fab.style.transition = 'none';
      fab.style.cursor     = 'grabbing';
      e.preventDefault();
    }

    function onMove(e) {
      if (!MS.fabDragging) return;
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = cx - startX;
      const dy = cy - startY;
      const newLeft   = Math.max(fab.offsetWidth / 2 + 8, Math.min(window.innerWidth - fab.offsetWidth / 2 - 8, startLeft + dx));
      const newBottom = Math.max(8, Math.min(window.innerHeight - fab.offsetHeight - 8, startBottom - dy));
      fab.style.left      = newLeft + 'px';
      fab.style.bottom    = newBottom + 'px';
      fab.style.transform = 'none';
      e.preventDefault();
    }

    function onEnd() {
      MS.fabDragging = false;
      fab.style.cursor = '';
    }

    fab.addEventListener('mousedown',  onStart, { passive: false });
    fab.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove',  onMove, { passive: false });
    document.addEventListener('touchmove',  onMove, { passive: false });
    document.addEventListener('mouseup',    onEnd);
    document.addEventListener('touchend',   onEnd);
  }

  /* ──────────────────────────────────────────────────────────
     GROUP ACTIONS
  ────────────────────────────────────────────────────────── */
  function groupDelete() {
    if (MS.selected.size === 0) return;
    const count = MS.selected.size;
    if (!confirm(`Delete ${count} selected block${count !== 1 ? 's' : ''}?`)) return;

    // Animate each out
    MS.selected.forEach(id => {
      const el = getBlockEl(id);
      if (el) {
        el.style.transition = 'opacity .2s, transform .2s';
        el.style.opacity    = '0';
        el.style.transform  = 'scale(.95)';
      }
    });

    setTimeout(() => {
      if (typeof state !== 'undefined') {
        state.blocks = state.blocks.filter(b => !MS.selected.has(b.id));
        if (typeof snapshot === 'function') snapshot();
        if (typeof renderCanvas === 'function') renderCanvas();
      }
      clearSelection();
      if (typeof toast === 'function') toast(`${count} block${count !== 1 ? 's' : ''} deleted`, 'info');
    }, 220);
  }

  function groupDuplicate() {
    if (MS.selected.size === 0 || typeof state === 'undefined') return;
    const count = MS.selected.size;
    const newIds = [];

    // Find ordered indices
    const indices = state.blocks
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => MS.selected.has(b.id))
      .sort((a, b) => a.i - b.i);

    // Insert copies after the last selected block
    let insertAt = indices[indices.length - 1].i + 1;
    indices.forEach(({ b }) => {
      const copy = {
        id:   'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        type: b.type,
        data: JSON.parse(JSON.stringify(b.data)),
      };
      state.blocks.splice(insertAt++, 0, copy);
      newIds.push(copy.id);
    });

    if (typeof snapshot === 'function') snapshot();
    if (typeof renderCanvas === 'function') renderCanvas();

    // Select the new copies
    MS.selected.clear();
    newIds.forEach(id => MS.selected.add(id));
    refreshSelectionStyles();
    updateFAB();
    if (typeof toast === 'function') toast(`${count} block${count !== 1 ? 's' : ''} duplicated`, 'success');
  }

  function groupMoveUp() {
    if (MS.selected.size === 0 || typeof state === 'undefined') return;
    const indices = state.blocks
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => MS.selected.has(b.id))
      .sort((a, b) => a.i - b.i);

    if (indices[0].i === 0) return; // already at top

    indices.forEach(({ b, i }) => {
      if (i > 0 && !MS.selected.has(state.blocks[i - 1].id)) {
        [state.blocks[i - 1], state.blocks[i]] = [state.blocks[i], state.blocks[i - 1]];
      }
    });

    if (typeof snapshot === 'function') snapshot();
    if (typeof renderCanvas === 'function') renderCanvas();
    refreshSelectionStyles();
    if (typeof toast === 'function') toast('Moved up', 'info');
  }

  function groupMoveDown() {
    if (MS.selected.size === 0 || typeof state === 'undefined') return;
    const indices = state.blocks
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => MS.selected.has(b.id))
      .sort((a, b) => b.i - a.i); // reverse order

    if (indices[0].i === state.blocks.length - 1) return; // already at bottom

    indices.forEach(({ b, i }) => {
      if (i < state.blocks.length - 1 && !MS.selected.has(state.blocks[i + 1].id)) {
        [state.blocks[i], state.blocks[i + 1]] = [state.blocks[i + 1], state.blocks[i]];
      }
    });

    if (typeof snapshot === 'function') snapshot();
    if (typeof renderCanvas === 'function') renderCanvas();
    refreshSelectionStyles();
    if (typeof toast === 'function') toast('Moved down', 'info');
  }

  function groupCopy() {
    if (MS.selected.size === 0 || typeof state === 'undefined') return;
    MS.clipboard = state.blocks
      .filter(b => MS.selected.has(b.id))
      .map(b => ({ type: b.type, data: JSON.parse(JSON.stringify(b.data)) }));
    updateFAB();
    if (typeof toast === 'function') toast(`${MS.clipboard.length} block${MS.clipboard.length !== 1 ? 's' : ''} copied`, 'success');
  }

  function groupPaste() {
    if (MS.clipboard.length === 0 || typeof state === 'undefined') return;
    const newIds = [];
    MS.clipboard.forEach(item => {
      const copy = {
        id:   'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        type: item.type,
        data: JSON.parse(JSON.stringify(item.data)),
      };
      state.blocks.push(copy);
      newIds.push(copy.id);
    });

    if (typeof snapshot === 'function') snapshot();
    if (typeof renderCanvas === 'function') renderCanvas();

    MS.selected.clear();
    newIds.forEach(id => MS.selected.add(id));
    refreshSelectionStyles();
    updateFAB();
    if (typeof toast === 'function') toast(`${newIds.length} block${newIds.length !== 1 ? 's' : ''} pasted`, 'success');
  }

  /* ──────────────────────────────────────────────────────────
     TWO-FINGER TAP DETECTION
     Strategy: track first touch, if second touch arrives within
     TWO_TAP_WINDOW_MS and both lift quickly → two-finger tap
  ────────────────────────────────────────────────────────── */
  function handleTwoFingerTap(e) {
    if (e.touches.length !== 2) return false;

    const t1 = e.touches[0];
    const t2 = e.touches[1];

    // Find which block (if any) both fingers are over
    const el1 = document.elementFromPoint(t1.clientX, t1.clientY);
    const el2 = document.elementFromPoint(t2.clientX, t2.clientY);
    const id1 = blockIdFromEl(el1);
    const id2 = blockIdFromEl(el2);

    // Both fingers on same block → toggle that block
    if (id1 && id1 === id2) {
      toggleSelect(id1);
      if (navigator.vibrate) navigator.vibrate(30);
      showTwoFingerTapFeedback(
        (t1.clientX + t2.clientX) / 2,
        (t1.clientY + t2.clientY) / 2,
        id1
      );
      return true;
    }

    // Fingers on different blocks → toggle both
    if (id1 && id2 && id1 !== id2) {
      toggleSelect(id1);
      toggleSelect(id2);
      if (navigator.vibrate) navigator.vibrate(30);
      return true;
    }

    return false;
  }

  function showTwoFingerTapFeedback(cx, cy, id) {
    const el = getBlockEl(id);
    if (!el) return;
    const isNowSelected = MS.selected.has(id);

    // Ripple
    const ripple = document.createElement('div');
    ripple.style.cssText = `
      position:fixed; left:${cx}px; top:${cy}px;
      width:60px; height:60px; border-radius:50%;
      background:${isNowSelected ? 'rgba(99,102,241,.35)' : 'rgba(239,68,68,.25)'};
      transform:translate(-50%,-50%) scale(0);
      pointer-events:none; z-index:9996;
      transition:transform .4s cubic-bezier(.34,1.56,.64,1), opacity .4s ease;
    `;
    document.body.appendChild(ripple);
    requestAnimationFrame(() => {
      ripple.style.transform = 'translate(-50%,-50%) scale(1)';
      ripple.style.opacity   = '0';
    });
    setTimeout(() => ripple.remove(), 450);
  }

  /* ──────────────────────────────────────────────────────────
     LASSO TOUCH HANDLERS
     Lasso activates on single-finger drag in the canvas
     background (not on a block)
  ────────────────────────────────────────────────────────── */
  let _lassoTouchId   = null;
  let _lassoStartClient = { x: 0, y: 0 };

  function onLassoTouchStart(e) {
    if (e.touches.length !== 1) return;
    const touch  = e.touches[0];
    const target = document.elementFromPoint(touch.clientX, touch.clientY);

    // Only start lasso on canvas background (not on a block or control)
    const onBlock   = !!blockIdFromEl(target);
    const onControl = target && (target.closest('.block-controls') || target.closest('.bf-fab-btn'));
    if (onBlock || onControl) return;

    const frame = getFrame();
    if (!frame || !frame.contains(target)) return;

    _lassoTouchId     = touch.identifier;
    _lassoStartClient = { x: touch.clientX, y: touch.clientY };
    MS.lassoActive    = false;
    MS.lassoEl        = createLassoEl();
  }

  function onLassoTouchMove(e) {
    if (_lassoTouchId === null) return;
    const touch = [...e.changedTouches].find(t => t.identifier === _lassoTouchId);
    if (!touch) return;

    const dx = touch.clientX - _lassoStartClient.x;
    const dy = touch.clientY - _lassoStartClient.y;

    if (!MS.lassoActive && Math.sqrt(dx * dx + dy * dy) > LASSO_START_PX) {
      MS.lassoActive = true;
      // Clear existing selection when starting new lasso
      clearSelection();
    }

    if (!MS.lassoActive) return;
    e.preventDefault();

    const origin = clientToCanvas(_lassoStartClient.x, _lassoStartClient.y);
    const current = clientToCanvas(touch.clientX, touch.clientY);
    updateLassoEl(origin.x, origin.y, current.x - origin.x, current.y - origin.y);

    // Live highlight blocks as lasso passes over them
    if (typeof state !== 'undefined' && MS.lassoRect) {
      state.blocks.forEach(b => {
        const br = getBlockCanvasRect(b.id);
        if (br && rectsIntersect(MS.lassoRect, br)) {
          MS.selected.add(b.id);
        } else {
          MS.selected.delete(b.id);
        }
      });
      refreshSelectionStyles();
      const badge = document.getElementById('bf-fab-count');
      if (badge) badge.textContent = MS.selected.size + ' selected';
    }
  }

  function onLassoTouchEnd(e) {
    const touch = [...e.changedTouches].find(t => t.identifier === _lassoTouchId);
    if (!touch) return;
    _lassoTouchId = null;

    if (MS.lassoActive) {
      commitLassoSelection();
      hideLasso();
    }
  }

  /* ──────────────────────────────────────────────────────────
     MOUSE LASSO (desktop)
  ────────────────────────────────────────────────────────── */
  let _mouseDown = false;
  let _mouseStart = { x: 0, y: 0 };

  function onMouseDown(e) {
    // Only left-click on canvas background
    if (e.button !== 0) return;
    const target = e.target;
    const onBlock   = !!blockIdFromEl(target);
    const onControl = target.closest('.block-controls') || target.closest('.bf-fab-btn');
    const frame     = getFrame();
    if (onBlock || onControl || !frame || !frame.contains(target)) return;

    _mouseDown  = true;
    _mouseStart = { x: e.clientX, y: e.clientY };
    MS.lassoEl  = createLassoEl();
    MS.lassoActive = false;
  }

  function onMouseMove(e) {
    if (!_mouseDown) return;
    const dx = e.clientX - _mouseStart.x;
    const dy = e.clientY - _mouseStart.y;

    if (!MS.lassoActive && Math.sqrt(dx * dx + dy * dy) > LASSO_START_PX) {
      MS.lassoActive = true;
      clearSelection();
    }
    if (!MS.lassoActive) return;

    const origin  = clientToCanvas(_mouseStart.x, _mouseStart.y);
    const current = clientToCanvas(e.clientX, e.clientY);
    updateLassoEl(origin.x, origin.y, current.x - origin.x, current.y - origin.y);

    // Live highlight
    if (typeof state !== 'undefined' && MS.lassoRect) {
      state.blocks.forEach(b => {
        const br = getBlockCanvasRect(b.id);
        if (br && rectsIntersect(MS.lassoRect, br)) {
          MS.selected.add(b.id);
        } else {
          MS.selected.delete(b.id);
        }
      });
      refreshSelectionStyles();
      updateFAB();
    }
  }

  function onMouseUp(e) {
    if (!_mouseDown) return;
    _mouseDown = false;
    if (MS.lassoActive) {
      commitLassoSelection();
      hideLasso();
    }
  }

  /* ──────────────────────────────────────────────────────────
     KEYBOARD SHORTCUTS
  ────────────────────────────────────────────────────────── */
  function setupKeyboard() {
    document.addEventListener('keydown', e => {
      const tag = document.activeElement?.tagName;
      if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+A — select all
      if (ctrl && e.key === 'a') {
        e.preventDefault();
        selectAll();
      }
      // Escape — clear multi-selection
      if (e.key === 'Escape' && MS.selected.size > 0) {
        clearSelection();
      }
      // Delete / Backspace — delete selected group
      if ((e.key === 'Delete' || e.key === 'Backspace') && MS.selected.size > 0) {
        e.preventDefault();
        groupDelete();
      }
      // Ctrl+D — duplicate group
      if (ctrl && e.key === 'd' && MS.selected.size > 0) {
        e.preventDefault();
        groupDuplicate();
      }
      // Ctrl+C — copy group
      if (ctrl && e.key === 'c' && MS.selected.size > 0) {
        e.preventDefault();
        groupCopy();
      }
      // Ctrl+V — paste group
      if (ctrl && e.key === 'v' && MS.clipboard.length > 0) {
        e.preventDefault();
        groupPaste();
      }
      // Arrow keys — move group
      if (e.key === 'ArrowUp'   && MS.selected.size > 0) { e.preventDefault(); groupMoveUp(); }
      if (e.key === 'ArrowDown' && MS.selected.size > 0) { e.preventDefault(); groupMoveDown(); }
    });
  }

  /* ──────────────────────────────────────────────────────────
     INJECT STYLES
  ────────────────────────────────────────────────────────── */
  function injectStyles() {
    const style = document.createElement('style');
    style.id = 'bf-ms-styles';
    style.textContent = `
      /* Multi-selected block */
      .block-wrapper.ms-selected {
        outline: 2px solid #6366f1 !important;
        box-shadow: 0 0 0 4px rgba(99,102,241,.18), inset 0 0 0 1px rgba(99,102,241,.1);
        z-index: 2;
      }
      .block-wrapper.ms-selected::before {
        content: '';
        position: absolute; inset: 0;
        background: rgba(99,102,241,.06);
        pointer-events: none; z-index: 1;
      }
      /* Selection count badge on block */
      .block-wrapper.ms-selected::after {
        content: '✓';
        position: absolute; top: 6px; left: 6px;
        width: 20px; height: 20px; border-radius: 50%;
        background: #6366f1; color: #fff;
        font-size: 11px; font-weight: 800;
        display: flex; align-items: center; justify-content: center;
        z-index: 10; pointer-events: none;
        box-shadow: 0 2px 8px rgba(99,102,241,.5);
        line-height: 20px; text-align: center;
      }
      /* Dimmed unselected blocks */
      .block-wrapper.ms-dimmed {
        opacity: 0.45;
        transition: opacity .2s ease;
      }
      .block-wrapper.ms-dimmed:hover {
        opacity: 0.7;
      }

      /* FAB buttons */
      .bf-fab-btn {
        display: flex; align-items: center; gap: 5px;
        height: 34px; padding: 0 10px; border-radius: 9px;
        background: rgba(255,255,255,.07);
        border: 1px solid rgba(255,255,255,.1);
        color: rgba(255,255,255,.85);
        font-size: 11.5px; font-weight: 600;
        cursor: pointer; transition: all .15s ease;
        font-family: 'Inter', sans-serif;
        white-space: nowrap; flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
      }
      .bf-fab-btn:hover, .bf-fab-btn:active {
        background: rgba(255,255,255,.14);
        color: #fff;
        transform: translateY(-1px);
      }
      .bf-fab-btn.danger {
        background: rgba(239,68,68,.15);
        border-color: rgba(239,68,68,.3);
        color: #fca5a5;
      }
      .bf-fab-btn.danger:hover {
        background: rgba(239,68,68,.28);
        color: #fff;
      }
      .bf-fab-btn.close {
        background: rgba(255,255,255,.05);
        border-color: rgba(255,255,255,.08);
        color: rgba(255,255,255,.4);
        width: 34px; padding: 0;
        justify-content: center;
      }
      .bf-fab-btn.close:hover {
        background: rgba(239,68,68,.2);
        color: #fca5a5;
      }
      .fab-ico { font-size: 13px; line-height: 1; }
      .fab-lbl { font-size: 11px; }

      /* Touch: hide text labels on very small screens */
      @media (max-width: 400px) {
        .fab-lbl { display: none; }
        .bf-fab-btn { padding: 0 8px; }
        #bf-fab { min-width: unset; gap: 3px; }
      }

      /* Lasso cursor on canvas */
      #canvasFrame.lasso-mode { cursor: crosshair !important; }
      #canvasFrame.lasso-mode .block-wrapper { cursor: default !important; }

      /* Selection mode indicator in canvas toolbar */
      #ms-mode-badge {
        display: none;
        align-items: center; gap: 5px;
        padding: 2px 8px; border-radius: 99px;
        background: rgba(99,102,241,.18);
        border: 1px solid rgba(99,102,241,.3);
        font-size: 10px; font-weight: 700;
        color: #a5b4fc; white-space: nowrap;
        animation: pulse 2s ease-in-out infinite;
      }
      #ms-mode-badge.show { display: flex; }
      @keyframes pulse {
        0%,100% { box-shadow: 0 0 0 0 rgba(99,102,241,.3); }
        50%      { box-shadow: 0 0 0 4px rgba(99,102,241,.0); }
      }

      /* Drag handle on FAB */
      #bf-fab { cursor: grab; }
      #bf-fab:active { cursor: grabbing; }
      .bf-fab-btn { cursor: pointer; }
    `;
    document.head.appendChild(style);
  }

  /* ──────────────────────────────────────────────────────────
     MODE BADGE in subtoolbar
  ────────────────────────────────────────────────────────── */
  function injectModeBadge() {
    const subtoolbar = document.querySelector('.subtoolbar');
    if (!subtoolbar) return;
    const badge = document.createElement('div');
    badge.id = 'ms-mode-badge';
    badge.innerHTML = `<span>⬚</span><span id="ms-badge-text">0 selected</span>`;
    // Insert before block count
    const bc = document.getElementById('blockCount');
    if (bc) subtoolbar.insertBefore(badge, bc);
    else subtoolbar.appendChild(badge);
  }

  // Update mode badge
  function updateModeBadge() {
    const badge = document.getElementById('ms-mode-badge');
    const text  = document.getElementById('ms-badge-text');
    if (!badge) return;
    if (MS.selected.size > 0) {
      badge.classList.add('show');
      if (text) text.textContent = MS.selected.size + ' selected';
    } else {
      badge.classList.remove('show');
    }
  }

  /* ──────────────────────────────────────────────────────────
     PATCH renderCanvas to re-apply selection styles after re-render
  ────────────────────────────────────────────────────────── */
  function patchRenderCanvas() {
    if (typeof window.renderCanvas !== 'function') return;
    const orig = window.renderCanvas;
    window.renderCanvas = function () {
      orig.apply(this, arguments);
      // Re-apply multi-select styles after DOM update
      setTimeout(() => {
        refreshSelectionStyles();
        updateModeBadge();
      }, 0);
    };
  }

  /* ──────────────────────────────────────────────────────────
     ATTACH ALL LISTENERS
  ────────────────────────────────────────────────────────── */
  function attach() {
    const scroll = document.getElementById('canvasScroll');
    const frame  = getFrame();
    if (!scroll || !frame) { setTimeout(attach, 120); return; }

    const passiveOpts = { passive: true };
    const activeOpts  = { passive: false };

    /* Two-finger tap on scroll area */
    scroll.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        handleTwoFingerTap(e);
      }
    }, passiveOpts);

    /* Lasso — touch */
    frame.addEventListener('touchstart', onLassoTouchStart, passiveOpts);
    frame.addEventListener('touchmove',  onLassoTouchMove,  activeOpts);
    frame.addEventListener('touchend',   onLassoTouchEnd,   passiveOpts);

    /* Lasso — mouse (desktop) */
    frame.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);

    /* Click on canvas background clears selection */
    frame.addEventListener('click', e => {
      const onBlock   = !!blockIdFromEl(e.target);
      const onControl = e.target.closest('.block-controls');
      if (!onBlock && !onControl && MS.selected.size > 0) {
        clearSelection();
      }
    });

    /* Lasso cursor mode */
    frame.addEventListener('mousedown', () => {
      if (!blockIdFromEl(document.elementFromPoint(event.clientX, event.clientY))) {
        frame.classList.add('lasso-mode');
      }
    });
    document.addEventListener('mouseup', () => frame.classList.remove('lasso-mode'));

    injectModeBadge();
    patchRenderCanvas();
    setupKeyboard();

    console.log('[BlockForge MultiSelect] Engine attached ✓');
  }

  /* ──────────────────────────────────────────────────────────
     PUBLIC API
  ────────────────────────────────────────────────────────── */
  window.MSEngine = {
    getSelected:    () => new Set(MS.selected),
    clearSelection,
    selectAll,
    toggleSelect,
    groupDelete,
    groupDuplicate,
    groupMoveUp,
    groupMoveDown,
    groupCopy,
    groupPaste,
    hasSelection:   () => MS.selected.size > 0,
    count:          () => MS.selected.size,
  };

  /* ──────────────────────────────────────────────────────────
     INIT
  ────────────────────────────────────────────────────────── */
  injectStyles();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }

})();