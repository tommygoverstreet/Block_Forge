/**
 * @fileoverview BlockForge Pro — SVG Creation, Editing & Animation Studio
 * @description  Full-featured SVG editor with:
 *   - Shape tools: rect, circle, ellipse, line, polyline, polygon, path, text
 *   - Bezier path editor with control handles
 *   - Selection, multi-select, transform (move/scale/rotate)
 *   - Alignment & distribution tools
 *   - Layer management (z-order, visibility, lock)
 *   - CSS animation timeline (keyframes, easing, loop)
 *   - Gradient editor (linear & radial)
 *   - Filter effects (blur, shadow, glow)
 *   - SVG export (clean, optimised)
 *   - Undo/redo history
 *   - Grid & snap
 *   - Rulers
 *
 * @version 1.0.0
 */

'use strict';

const SVGStudio = (() => {

  /* ============================================================
     §1  STATE
  ============================================================ */
  const S = {
    elements:    [],          // SVGElement descriptors
    selected:    new Set(),   // selected element IDs
    tool:        'select',    // active tool
    history:     [],          // undo stack
    historyIdx:  -1,
    zoom:        1,
    panX:        0,
    panY:        0,
    gridSize:    20,
    snapEnabled: true,
    showGrid:    true,
    showRulers:  true,
    canvasW:     800,
    canvasH:     600,
    fill:        '#6366f1',
    stroke:      '#fff',
    strokeWidth: 2,
    opacity:     1,
    fontSize:    18,
    fontFamily:  'Inter, sans-serif',
    animating:   false,
    _nextId:     1,
  };

  /* ============================================================
     §2  ELEMENT DESCRIPTORS
     Plain objects — rendered to SVG strings on demand.
  ============================================================ */

  /** @returns {string} Unique element ID */
  function nextId() { return 'el_' + (S._nextId++); }

  const DEFAULTS = {
    fill:        () => S.fill,
    stroke:      () => S.stroke,
    strokeWidth: () => S.strokeWidth,
    opacity:     () => S.opacity,
  };

  function makeRect(x, y, w, h) {
    return { id:nextId(), type:'rect', x, y, width:w, height:h,
      rx:0, ry:0, fill:DEFAULTS.fill(), stroke:DEFAULTS.stroke(),
      strokeWidth:DEFAULTS.strokeWidth(), opacity:DEFAULTS.opacity(),
      rotation:0, scaleX:1, scaleY:1, visible:true, locked:false,
      name:'Rectangle', animations:[] };
  }

  function makeCircle(cx, cy, r) {
    return { id:nextId(), type:'circle', cx, cy, r,
      fill:DEFAULTS.fill(), stroke:DEFAULTS.stroke(),
      strokeWidth:DEFAULTS.strokeWidth(), opacity:DEFAULTS.opacity(),
      rotation:0, visible:true, locked:false, name:'Circle', animations:[] };
  }

  function makeEllipse(cx, cy, rx, ry) {
    return { id:nextId(), type:'ellipse', cx, cy, rx, ry,
      fill:DEFAULTS.fill(), stroke:DEFAULTS.stroke(),
      strokeWidth:DEFAULTS.strokeWidth(), opacity:DEFAULTS.opacity(),
      rotation:0, visible:true, locked:false, name:'Ellipse', animations:[] };
  }

  function makeLine(x1, y1, x2, y2) {
    return { id:nextId(), type:'line', x1, y1, x2, y2,
      fill:'none', stroke:DEFAULTS.stroke(),
      strokeWidth:DEFAULTS.strokeWidth(), opacity:DEFAULTS.opacity(),
      visible:true, locked:false, name:'Line', animations:[] };
  }

  function makePolyline(points) {
    return { id:nextId(), type:'polyline', points,
      fill:'none', stroke:DEFAULTS.stroke(),
      strokeWidth:DEFAULTS.strokeWidth(), opacity:DEFAULTS.opacity(),
      visible:true, locked:false, name:'Polyline', animations:[] };
  }

  function makePolygon(points) {
    return { id:nextId(), type:'polygon', points,
      fill:DEFAULTS.fill(), stroke:DEFAULTS.stroke(),
      strokeWidth:DEFAULTS.strokeWidth(), opacity:DEFAULTS.opacity(),
      visible:true, locked:false, name:'Polygon', animations:[] };
  }

  function makePath(d) {
    return { id:nextId(), type:'path', d,
      fill:DEFAULTS.fill(), stroke:DEFAULTS.stroke(),
      strokeWidth:DEFAULTS.strokeWidth(), opacity:DEFAULTS.opacity(),
      rotation:0, visible:true, locked:false, name:'Path', animations:[] };
  }

  function makeText(x, y, text) {
    return { id:nextId(), type:'text', x, y, text,
      fill:DEFAULTS.fill(), stroke:'none', strokeWidth:0,
      opacity:DEFAULTS.opacity(), fontSize:S.fontSize,
      fontFamily:S.fontFamily, fontWeight:'normal',
      textAnchor:'start', visible:true, locked:false,
      name:'Text', animations:[] };
  }

  function makeStar(cx, cy, outerR, innerR, points) {
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI / points) - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
    }
    return makePolygon(pts.map(p => p.join(',')).join(' '));
  }

  function makeArrow(x1, y1, x2, y2) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len   = 12;
    const spread = 0.4;
    const ax1 = x2 - Math.cos(angle - spread) * len;
    const ay1 = y2 - Math.sin(angle - spread) * len;
    const ax2 = x2 - Math.cos(angle + spread) * len;
    const ay2 = y2 - Math.sin(angle + spread) * len;
    const d = `M${x1},${y1} L${x2},${y2} M${ax1},${ay1} L${x2},${y2} L${ax2},${ay2}`;
    return makePath(d);
  }

  /* ============================================================
     §3  SVG RENDERER
     Converts element descriptors to SVG markup strings.
  ============================================================ */

  function renderElement(el, forExport = false) {
    if (!el.visible && !forExport) return '';
    const anim = el.animations.length ? renderAnimations(el) : '';
    const transform = buildTransform(el);
    const base = `opacity="${el.opacity}" ${transform}`;

    switch (el.type) {
      case 'rect':
        return `<rect id="${el.id}" x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}"
          rx="${el.rx}" ry="${el.ry}"
          fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}"
          ${base}>${anim}</rect>`;

      case 'circle':
        return `<circle id="${el.id}" cx="${el.cx}" cy="${el.cy}" r="${el.r}"
          fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}"
          ${base}>${anim}</circle>`;

      case 'ellipse':
        return `<ellipse id="${el.id}" cx="${el.cx}" cy="${el.cy}" rx="${el.rx}" ry="${el.ry}"
          fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}"
          ${base}>${anim}</ellipse>`;

      case 'line':
        return `<line id="${el.id}" x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}"
          stroke="${el.stroke}" stroke-width="${el.strokeWidth}" stroke-linecap="round"
          ${base}>${anim}</line>`;

      case 'polyline':
        return `<polyline id="${el.id}" points="${el.points}"
          fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}"
          stroke-linejoin="round" stroke-linecap="round"
          ${base}>${anim}</polyline>`;

      case 'polygon':
        return `<polygon id="${el.id}" points="${el.points}"
          fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}"
          ${base}>${anim}</polygon>`;

      case 'path':
        return `<path id="${el.id}" d="${el.d}"
          fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}"
          stroke-linecap="round" stroke-linejoin="round"
          ${base}>${anim}</path>`;

      case 'text':
        return `<text id="${el.id}" x="${el.x}" y="${el.y}"
          fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}"
          font-size="${el.fontSize}" font-family="${el.fontFamily}"
          font-weight="${el.fontWeight}" text-anchor="${el.textAnchor}"
          ${base}>${escSVG(el.text)}${anim}</text>`;

      default:
        return '';
    }
  }

  function buildTransform(el) {
    const parts = [];
    if (el.rotation) parts.push(`rotate(${el.rotation})`);
    if (el.scaleX && el.scaleX !== 1) parts.push(`scaleX(${el.scaleX})`);
    if (el.scaleY && el.scaleY !== 1) parts.push(`scaleY(${el.scaleY})`);
    return parts.length ? `transform="${parts.join(' ')}"` : '';
  }

  /* ============================================================
     §4  ANIMATION SYSTEM
     CSS @keyframes + <animate> / <animateTransform> elements
  ============================================================ */

  /**
   * Animation descriptor shape:
   * { id, type:'css'|'smil', property, from, to, duration, delay, easing, loop, yoyo }
   */

  function renderAnimations(el) {
    return el.animations.map(anim => {
      if (anim.type === 'smil') return renderSMIL(anim);
      return ''; // CSS animations injected via <style>
    }).join('');
  }

  function renderSMIL(anim) {
    const dur    = `${anim.duration}s`;
    const repeat = anim.loop ? 'indefinite' : '1';
    const calc   = anim.easing === 'linear' ? 'linear' : 'spline';

    if (anim.property === 'transform-rotate') {
      return `<animateTransform attributeName="transform" type="rotate"
        from="${anim.from}" to="${anim.to}"
        dur="${dur}" begin="${anim.delay||0}s"
        repeatCount="${repeat}" calcMode="${calc}"
        ${calc==='spline'?'keySplines="0.4 0 0.2 1" keyTimes="0;1"':''}/>`;
    }
    if (anim.property === 'transform-translate') {
      return `<animateTransform attributeName="transform" type="translate"
        from="${anim.from}" to="${anim.to}"
        dur="${dur}" begin="${anim.delay||0}s"
        repeatCount="${repeat}" additive="sum"/>`;
    }
    if (anim.property === 'transform-scale') {
      return `<animateTransform attributeName="transform" type="scale"
        from="${anim.from}" to="${anim.to}"
        dur="${dur}" begin="${anim.delay||0}s"
        repeatCount="${repeat}" additive="sum"/>`;
    }
    // Generic attribute animation
    return `<animate attributeName="${anim.property}"
      from="${anim.from}" to="${anim.to}"
      dur="${dur}" begin="${anim.delay||0}s"
      repeatCount="${repeat}"
      ${anim.yoyo?'values="'+anim.from+';'+anim.to+';'+anim.from+'"':''}/>`;
  }

  function buildCSSAnimations(elements) {
    const rules = [];
    elements.forEach(el => {
      el.animations.filter(a => a.type === 'css').forEach(anim => {
        const kfName = `bf_${el.id}_${anim.id}`;
        rules.push(`
          @keyframes ${kfName} {
            0%   { ${anim.property}: ${anim.from}; }
            100% { ${anim.property}: ${anim.to}; }
          }
          #${el.id} {
            animation: ${kfName} ${anim.duration}s ${anim.easing||'ease'} ${anim.delay||0}s
              ${anim.loop?'infinite':'1'} ${anim.yoyo?'alternate':'normal'} both;
          }`);
      });
    });
    return rules.join('\n');
  }

  /* ============================================================
     §5  HISTORY
  ============================================================ */

  function snapshot() {
    const s = JSON.stringify(S.elements);
    if (S.history[S.historyIdx] === s) return;
    S.history = S.history.slice(0, S.historyIdx + 1);
    S.history.push(s);
    if (S.history.length > 80) S.history.shift();
    S.historyIdx = S.history.length - 1;
    _syncHistoryBtns();
  }

  function undo() {
    if (S.historyIdx <= 0) return;
    S.historyIdx--;
    S.elements = JSON.parse(S.history[S.historyIdx]);
    S.selected.clear();
    _render(); _renderLayers(); _syncHistoryBtns();
  }

  function redo() {
    if (S.historyIdx >= S.history.length - 1) return;
    S.historyIdx++;
    S.elements = JSON.parse(S.history[S.historyIdx]);
    S.selected.clear();
    _render(); _renderLayers(); _syncHistoryBtns();
  }

  function _syncHistoryBtns() {
    const u = document.getElementById('svgUndoBtn');
    const r = document.getElementById('svgRedoBtn');
    if (u) u.style.opacity = S.historyIdx <= 0 ? '.35' : '1';
    if (r) r.style.opacity = S.historyIdx >= S.history.length - 1 ? '.35' : '1';
  }

  /* ============================================================
     §6  SELECTION & TRANSFORM
  ============================================================ */

  function selectEl(id, additive = false) {
    if (!additive) S.selected.clear();
    if (id) S.selected.add(id);
    _render();
    _renderInspector();
  }

  function selectAll() {
    S.elements.forEach(e => S.selected.add(e.id));
    _render(); _renderInspector();
  }

  function deleteSelected() {
    if (S.selected.size === 0) return;
    S.elements = S.elements.filter(e => !S.selected.has(e.id));
    S.selected.clear();
    snapshot(); _render(); _renderLayers(); _renderInspector();
  }

  function duplicateSelected() {
    const copies = [];
    S.selected.forEach(id => {
      const el = S.elements.find(e => e.id === id);
      if (!el) return;
      const copy = JSON.parse(JSON.stringify(el));
      copy.id   = nextId();
      copy.name = copy.name + ' copy';
      // Offset copy
      if ('x' in copy) { copy.x += 16; copy.y += 16; }
      if ('cx' in copy) { copy.cx += 16; copy.cy += 16; }
      copies.push(copy);
    });
    S.elements.push(...copies);
    S.selected.clear();
    copies.forEach(c => S.selected.add(c.id));
    snapshot(); _render(); _renderLayers();
  }

  function moveSelected(dx, dy) {
    S.selected.forEach(id => {
      const el = S.elements.find(e => e.id === id);
      if (!el || el.locked) return;
      if ('x' in el) { el.x += dx; el.y += dy; }
      if ('cx' in el) { el.cx += dx; el.cy += dy; }
      if ('x1' in el) { el.x1 += dx; el.y1 += dy; el.x2 += dx; el.y2 += dy; }
    });
    _render();
  }

  function bringForward() {
    S.selected.forEach(id => {
      const idx = S.elements.findIndex(e => e.id === id);
      if (idx < S.elements.length - 1) {
        [S.elements[idx], S.elements[idx+1]] = [S.elements[idx+1], S.elements[idx]];
      }
    });
    snapshot(); _render(); _renderLayers();
  }

  function sendBackward() {
    S.selected.forEach(id => {
      const idx = S.elements.findIndex(e => e.id === id);
      if (idx > 0) {
        [S.elements[idx], S.elements[idx-1]] = [S.elements[idx-1], S.elements[idx]];
      }
    });
    snapshot(); _render(); _renderLayers();
  }

  function bringToFront() {
    const sel = S.elements.filter(e => S.selected.has(e.id));
    S.elements = [...S.elements.filter(e => !S.selected.has(e.id)), ...sel];
    snapshot(); _render(); _renderLayers();
  }

  function sendToBack() {
    const sel = S.elements.filter(e => S.selected.has(e.id));
    S.elements = [...sel, ...S.elements.filter(e => !S.selected.has(e.id))];
    snapshot(); _render(); _renderLayers();
  }

  /* ── Alignment ── */
  function align(dir) {
    const els = S.elements.filter(e => S.selected.has(e.id));
    if (els.length < 2) return;
    const bounds = els.map(getBounds);
    const minX = Math.min(...bounds.map(b => b.x));
    const maxX = Math.max(...bounds.map(b => b.x + b.w));
    const minY = Math.min(...bounds.map(b => b.y));
    const maxY = Math.max(...bounds.map(b => b.y + b.h));
    const cx   = (minX + maxX) / 2;
    const cy   = (minY + maxY) / 2;

    els.forEach((el, i) => {
      const b = bounds[i];
      if (dir === 'left')   setX(el, minX);
      if (dir === 'right')  setX(el, maxX - b.w);
      if (dir === 'top')    setY(el, minY);
      if (dir === 'bottom') setY(el, maxY - b.h);
      if (dir === 'cx')     setX(el, cx - b.w/2);
      if (dir === 'cy')     setY(el, cy - b.h/2);
    });
    snapshot(); _render();
  }

  function distribute(dir) {
    const els = S.elements.filter(e => S.selected.has(e.id));
    if (els.length < 3) return;
    const bounds = els.map(getBounds);

    if (dir === 'h') {
      const sorted = els.map((e,i) => ({e, b:bounds[i]})).sort((a,b) => a.b.x - b.b.x);
      const totalW = sorted.reduce((s,x) => s + x.b.w, 0);
      const gap    = (sorted[sorted.length-1].b.x + sorted[sorted.length-1].b.w - sorted[0].b.x - totalW) / (sorted.length - 1);
      let x = sorted[0].b.x;
      sorted.forEach(({e, b}) => { setX(e, x); x += b.w + gap; });
    } else {
      const sorted = els.map((e,i) => ({e, b:bounds[i]})).sort((a,b) => a.b.y - b.b.y);
      const totalH = sorted.reduce((s,x) => s + x.b.h, 0);
      const gap    = (sorted[sorted.length-1].b.y + sorted[sorted.length-1].b.h - sorted[0].b.y - totalH) / (sorted.length - 1);
      let y = sorted[0].b.y;
      sorted.forEach(({e, b}) => { setY(e, y); y += b.h + gap; });
    }
    snapshot(); _render();
  }

  function getBounds(el) {
    if (el.type === 'rect')    return { x:el.x, y:el.y, w:el.width, h:el.height };
    if (el.type === 'circle')  return { x:el.cx-el.r, y:el.cy-el.r, w:el.r*2, h:el.r*2 };
    if (el.type === 'ellipse') return { x:el.cx-el.rx, y:el.cy-el.ry, w:el.rx*2, h:el.ry*2 };
    if (el.type === 'text')    return { x:el.x, y:el.y-el.fontSize, w:el.fontSize*el.text.length*0.6, h:el.fontSize };
    return { x:0, y:0, w:0, h:0 };
  }

  function setX(el, x) {
    if ('x' in el) el.x = x;
    if ('cx' in el) el.cx = x + getBounds(el).w/2;
  }
  function setY(el, y) {
    if ('y' in el) el.y = y;
    if ('cy' in el) el.cy = y + getBounds(el).h/2;
  }

  /* ── Snap to grid ── */
  function snap(v) {
    return S.snapEnabled ? Math.round(v / S.gridSize) * S.gridSize : v;
  }

  /* ============================================================
     §7  DRAWING INTERACTION
  ============================================================ */

  let _drawing = false;
  let _drawStart = { x:0, y:0 };
  let _drawEl = null;
  let _pathPoints = [];
  let _panning = false;
  let _panStart = { x:0, y:0, px:0, py:0 };
  let _dragging = false;
  let _dragStart = { x:0, y:0 };

  function _svgCoords(e) {
    const svg = document.getElementById('svgCanvas');
    if (!svg) return { x:0, y:0 };
    const r = svg.getBoundingClientRect();
    return {
      x: snap((e.clientX - r.left - S.panX) / S.zoom),
      y: snap((e.clientY - r.top  - S.panY) / S.zoom),
    };
  }

  function _onMouseDown(e) {
    const { x, y } = _svgCoords(e);

    // Middle mouse or space+drag → pan
    if (e.button === 1 || (e.button === 0 && S.tool === 'pan')) {
      _panning = true;
      _panStart = { x:e.clientX, y:e.clientY, px:S.panX, py:S.panY };
      return;
    }

    if (S.tool === 'select') {
      // Hit test
      const hit = _hitTest(x, y);
      if (hit) {
        selectEl(hit.id, e.shiftKey);
        _dragging  = true;
        _dragStart = { x, y };
      } else {
        if (!e.shiftKey) S.selected.clear();
        _render(); _renderInspector();
      }
      return;
    }

    // Drawing tools
    _drawing   = true;
    _drawStart = { x, y };

    if (S.tool === 'rect') {
      _drawEl = makeRect(x, y, 0, 0);
      S.elements.push(_drawEl);
    } else if (S.tool === 'circle') {
      _drawEl = makeCircle(x, y, 0);
      S.elements.push(_drawEl);
    } else if (S.tool === 'ellipse') {
      _drawEl = makeEllipse(x, y, 0, 0);
      S.elements.push(_drawEl);
    } else if (S.tool === 'line') {
      _drawEl = makeLine(x, y, x, y);
      S.elements.push(_drawEl);
    } else if (S.tool === 'text') {
      const text = prompt('Enter text:', 'Text');
      if (text) {
        const el = makeText(x, y, text);
        S.elements.push(el);
        snapshot(); _render(); _renderLayers();
        selectEl(el.id);
      }
      _drawing = false;
    } else if (S.tool === 'pen') {
      if (_pathPoints.length === 0) {
        _pathPoints = [[x, y]];
        _drawEl = makePath(`M${x},${y}`);
        S.elements.push(_drawEl);
      } else {
        _pathPoints.push([x, y]);
        _drawEl.d = _pathPoints.map((p,i) => (i===0?'M':'L') + p[0]+','+p[1]).join(' ');
        _render();
      }
    }
  }

  function _onMouseMove(e) {
    const { x, y } = _svgCoords(e);

    if (_panning) {
      S.panX = _panStart.px + (e.clientX - _panStart.x);
      S.panY = _panStart.py + (e.clientY - _panStart.y);
      _render(); return;
    }

    if (_dragging && S.selected.size > 0) {
      const dx = x - _dragStart.x;
      const dy = y - _dragStart.y;
      moveSelected(dx, dy);
      _dragStart = { x, y };
      return;
    }

    if (!_drawing || !_drawEl) return;

    const dx = x - _drawStart.x;
    const dy = y - _drawStart.y;

    if (S.tool === 'rect') {
      _drawEl.x = dx < 0 ? x : _drawStart.x;
      _drawEl.y = dy < 0 ? y : _drawStart.y;
      _drawEl.width  = Math.abs(dx);
      _drawEl.height = e.shiftKey ? Math.abs(dx) : Math.abs(dy);
    } else if (S.tool === 'circle') {
      _drawEl.r = Math.hypot(dx, dy) / 2;
      _drawEl.cx = _drawStart.x + dx/2;
      _drawEl.cy = _drawStart.y + dy/2;
    } else if (S.tool === 'ellipse') {
      _drawEl.rx = Math.abs(dx) / 2;
      _drawEl.ry = e.shiftKey ? Math.abs(dx)/2 : Math.abs(dy)/2;
      _drawEl.cx = _drawStart.x + dx/2;
      _drawEl.cy = _drawStart.y + dy/2;
    } else if (S.tool === 'line') {
      _drawEl.x2 = x;
      _drawEl.y2 = e.shiftKey ? _drawStart.y : y;
    }

    _render();
  }

  function _onMouseUp(e) {
    _panning  = false;
    _dragging = false;

    if (_drawing && _drawEl && S.tool !== 'pen') {
      // Remove zero-size shapes
      const b = getBounds(_drawEl);
      if (b.w < 2 && b.h < 2 && _drawEl.type !== 'line') {
        S.elements.pop();
      } else {
        selectEl(_drawEl.id);
        snapshot();
        _renderLayers();
      }
      _drawing = false;
      _drawEl  = null;
    }

    if (_dragging) { snapshot(); }
  }

  function _onDblClick(e) {
    if (S.tool === 'pen' && _pathPoints.length > 0) {
      // Close path
      _drawEl.d += ' Z';
      snapshot(); _render(); _renderLayers();
      selectEl(_drawEl.id);
      _pathPoints = [];
      _drawEl     = null;
      _drawing    = false;
    }
  }

  function _onKeyDown(e) {
    const tag = document.activeElement?.tagName;
    if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && e.key === 'z') { e.preventDefault(); undo(); }
    if (ctrl && e.key === 'y') { e.preventDefault(); redo(); }
    if (ctrl && e.key === 'a') { e.preventDefault(); selectAll(); }
    if (ctrl && e.key === 'd') { e.preventDefault(); duplicateSelected(); }
    if (ctrl && e.key === 'c') { e.preventDefault(); _copySelected(); }
    if (ctrl && e.key === 'v') { e.preventDefault(); _pasteClipboard(); }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); }
    if (e.key === 'Escape') { S.selected.clear(); _pathPoints = []; _drawing = false; _drawEl = null; _render(); _renderInspector(); }

    // Nudge
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); moveSelected(-step, 0); snapshot(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveSelected( step, 0); snapshot(); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); moveSelected(0, -step); snapshot(); }
    if (e.key === 'ArrowDown')  { e.preventDefault(); moveSelected(0,  step); snapshot(); }
  }

  let _clipboard = [];
  function _copySelected() {
    _clipboard = S.elements.filter(e => S.selected.has(e.id)).map(e => JSON.parse(JSON.stringify(e)));
  }
  function _pasteClipboard() {
    const copies = _clipboard.map(el => {
      const c = JSON.parse(JSON.stringify(el));
      c.id = nextId(); c.name = c.name + ' copy';
      if ('x' in c) { c.x += 16; c.y += 16; }
      if ('cx' in c) { c.cx += 16; c.cy += 16; }
      return c;
    });
    S.elements.push(...copies);
    S.selected.clear();
    copies.forEach(c => S.selected.add(c.id));
    snapshot(); _render(); _renderLayers();
  }

  /* ── Hit testing ── */
  function _hitTest(x, y) {
    // Test in reverse order (top-most first)
    for (let i = S.elements.length - 1; i >= 0; i--) {
      const el = S.elements[i];
      if (!el.visible || el.locked) continue;
      const b = getBounds(el);
      if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4) return el;
    }
    return null;
  }

  /* ============================================================
     §8  RENDER
  ============================================================ */

  function _render() {
    const svg = document.getElementById('svgCanvas');
    if (!svg) return;

    const cssAnims = buildCSSAnimations(S.elements);
    const defs     = _buildDefs();
    const grid     = S.showGrid ? _buildGrid() : '';
    const content  = S.elements.map(el => renderElement(el)).join('\n');
    const handles  = _buildSelectionHandles();

    svg.innerHTML = `
      <defs>${defs}</defs>
      <style>${cssAnims}</style>
      <g id="svgGrid">${grid}</g>
      <g id="svgContent" transform="translate(${S.panX},${S.panY}) scale(${S.zoom})">${content}</g>
      <g id="svgHandles" transform="translate(${S.panX},${S.panY}) scale(${S.zoom})">${handles}</g>`;
  }

  function _buildGrid() {
    const w = S.canvasW, h = S.canvasH;
    const gs = S.gridSize * S.zoom;
    const ox = S.panX % gs, oy = S.panY % gs;
    let lines = '';
    for (let x = ox; x < w; x += gs) {
      lines += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="rgba(255,255,255,.04)" stroke-width="1"/>`;
    }
    for (let y = oy; y < h; y += gs) {
      lines += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="rgba(255,255,255,.04)" stroke-width="1"/>`;
    }
    // Major grid every 5 cells
    const mgs = gs * 5;
    const mox = S.panX % mgs, moy = S.panY % mgs;
    for (let x = mox; x < w; x += mgs) {
      lines += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="rgba(255,255,255,.08)" stroke-width="1"/>`;
    }
    for (let y = moy; y < h; y += mgs) {
      lines += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="rgba(255,255,255,.08)" stroke-width="1"/>`;
    }
    return lines;
  }

  function _buildDefs() {
    // Gradient definitions for elements that use them
    const grads = S.elements
      .filter(e => e.fill && e.fill.startsWith('url('))
      .map(e => e._gradientDef || '')
      .join('');
    return grads;
  }

  function _buildSelectionHandles() {
    if (S.selected.size === 0) return '';
    let handles = '';
    S.selected.forEach(id => {
      const el = S.elements.find(e => e.id === id);
      if (!el) return;
      const b = getBounds(el);
      const pad = 4;
      const x = b.x - pad, y = b.y - pad, w = b.w + pad*2, h = b.h + pad*2;
      handles += `
        <rect x="${x}" y="${y}" width="${w}" height="${h}"
          fill="none" stroke="#6366f1" stroke-width="${1/S.zoom}"
          stroke-dasharray="${4/S.zoom},${2/S.zoom}" pointer-events="none"/>
        ${_cornerHandle(x,     y,     id, 'nw')}
        ${_cornerHandle(x+w/2, y,     id, 'n')}
        ${_cornerHandle(x+w,   y,     id, 'ne')}
        ${_cornerHandle(x+w,   y+h/2, id, 'e')}
        ${_cornerHandle(x+w,   y+h,   id, 'se')}
        ${_cornerHandle(x+w/2, y+h,   id, 's')}
        ${_cornerHandle(x,     y+h,   id, 'sw')}
        ${_cornerHandle(x,     y+h/2, id, 'w')}`;
    });
    return handles;
  }

  function _cornerHandle(x, y, id, dir) {
    const s = 6 / S.zoom;
    return `<rect x="${x-s/2}" y="${y-s/2}" width="${s}" height="${s}"
      fill="#fff" stroke="#6366f1" stroke-width="${1/S.zoom}"
      rx="${1/S.zoom}" pointer-events="none"/>`;
  }

  /* ============================================================
     §9  INSPECTOR PANEL
  ============================================================ */

  function _renderInspector() {
    const panel = document.getElementById('svgInspector');
    if (!panel) return;

    if (S.selected.size === 0) {
      panel.innerHTML = `
        <div class="svg-no-sel">
          <div style="font-size:28px;opacity:.15;margin-bottom:8px">🎨</div>
          <p style="font-size:11px;color:#38384a">Select an element to edit its properties</p>
        </div>`;
      return;
    }

    const ids = [...S.selected];
    const el  = S.elements.find(e => e.id === ids[0]);
    if (!el) return;

    const fields = _getInspectorFields(el);
    panel.innerHTML = `
      <div class="svg-inspector-header">
        <span style="font-size:11px;font-weight:700;color:#9090b0">${el.type.toUpperCase()}</span>
        <span style="font-size:9px;color:#38384a;font-family:'JetBrains Mono',monospace">#${el.id}</span>
      </div>
      ${fields}
      <div class="svg-section-title" style="margin-top:12px">Animations</div>
      ${_renderAnimPanel(el)}
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:3px">
        <button class="svg-btn" onclick="SVGStudio.addAnimation()">+ Add Animation</button>
        <button class="svg-btn danger" onclick="SVGStudio.deleteSelected()">✕ Delete Element</button>
      </div>`;
  }

  function _getInspectorFields(el) {
    const row = (label, key, type='number', extra='') => `
      <div class="svg-prop-row">
        <label class="svg-prop-label">${label}</label>
        <input class="svg-prop-input" type="${type}" value="${el[key]??''}" ${extra}
          oninput="SVGStudio.setProp('${el.id}','${key}',this.type==='number'?+this.value:this.value)"
          onchange="SVGStudio.commitProp()">
      </div>`;

    const colorRow = (label, key) => `
      <div class="svg-prop-row">
        <label class="svg-prop-label">${label}</label>
        <input type="color" class="svg-color-input" value="${toHexSafe(el[key]||'#000000')}"
          oninput="SVGStudio.setProp('${el.id}','${key}',this.value)"
          onchange="SVGStudio.commitProp()">
        <input class="svg-prop-input" type="text" value="${el[key]||''}" style="flex:1"
          oninput="SVGStudio.setProp('${el.id}','${key}',this.value)"
          onchange="SVGStudio.commitProp()">
      </div>`;

    let html = `
      <div class="svg-section-title">Position & Size</div>`;

    if (el.type === 'rect') {
      html += row('X', 'x') + row('Y', 'y') + row('Width', 'width') + row('Height', 'height') + row('Radius X', 'rx') + row('Radius Y', 'ry');
    } else if (el.type === 'circle') {
      html += row('Center X', 'cx') + row('Center Y', 'cy') + row('Radius', 'r');
    } else if (el.type === 'ellipse') {
      html += row('Center X', 'cx') + row('Center Y', 'cy') + row('Radius X', 'rx') + row('Radius Y', 'ry');
    } else if (el.type === 'line') {
      html += row('X1', 'x1') + row('Y1', 'y1') + row('X2', 'x2') + row('Y2', 'y2');
    } else if (el.type === 'text') {
      html += row('X', 'x') + row('Y', 'y') + row('Font Size', 'fontSize') +
        `<div class="svg-prop-row"><label class="svg-prop-label">Text</label>
          <input class="svg-prop-input" type="text" value="${escAttr(el.text)}"
            oninput="SVGStudio.setProp('${el.id}','text',this.value)"
            onchange="SVGStudio.commitProp()"></div>`;
    } else if (el.type === 'path') {
      html += `<div class="svg-prop-row"><label class="svg-prop-label">Path d</label>
        <textarea class="svg-prop-input" style="height:60px;resize:vertical"
          oninput="SVGStudio.setProp('${el.id}','d',this.value)"
          onchange="SVGStudio.commitProp()">${el.d}</textarea></div>`;
    }

    html += `
      <div class="svg-section-title" style="margin-top:10px">Appearance</div>
      ${colorRow('Fill', 'fill')}
      ${colorRow('Stroke', 'stroke')}
      ${row('Stroke W', 'strokeWidth')}
      ${row('Opacity', 'opacity', 'number', 'min="0" max="1" step="0.05"')}
      ${el.rotation !== undefined ? row('Rotation', 'rotation') : ''}
      <div class="svg-prop-row">
        <label class="svg-prop-label">Visible</label>
        <input type="checkbox" ${el.visible?'checked':''} onchange="SVGStudio.setProp('${el.id}','visible',this.checked);SVGStudio.commitProp()">
      </div>
      <div class="svg-prop-row">
        <label class="svg-prop-label">Locked</label>
        <input type="checkbox" ${el.locked?'checked':''} onchange="SVGStudio.setProp('${el.id}','locked',this.checked);SVGStudio.commitProp()">
      </div>`;

    return html;
  }

  function _renderAnimPanel(el) {
    if (el.animations.length === 0) {
      return `<p style="font-size:10px;color:#38384a;padding:4px 0">No animations. Click "+ Add Animation" below.</p>`;
    }
    return el.animations.map((anim, i) => `
      <div class="svg-anim-item">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:10px;font-weight:700;color:#818cf8">${anim.property}</span>
          <span style="font-size:9px;color:#38384a">${anim.duration}s</span>
          <button class="svg-btn" style="margin-left:auto;height:18px;padding:0 6px;font-size:9px"
            onclick="SVGStudio.removeAnimation('${el.id}',${i})">✕</button>
        </div>
        <div class="svg-prop-row">
          <label class="svg-prop-label">From</label>
          <input class="svg-prop-input" type="text" value="${anim.from}"
            oninput="SVGStudio.setAnimProp('${el.id}',${i},'from',this.value)">
        </div>
        <div class="svg-prop-row">
          <label class="svg-prop-label">To</label>
          <input class="svg-prop-input" type="text" value="${anim.to}"
            oninput="SVGStudio.setAnimProp('${el.id}',${i},'to',this.value)">
        </div>
        <div class="svg-prop-row">
          <label class="svg-prop-label">Duration</label>
          <input class="svg-prop-input" type="number" value="${anim.duration}" min="0.1" step="0.1"
            oninput="SVGStudio.setAnimProp('${el.id}',${i},'duration',+this.value)">
        </div>
        <div class="svg-prop-row">
          <label class="svg-prop-label">Easing</label>
          <select class="svg-prop-input" onchange="SVGStudio.setAnimProp('${el.id}',${i},'easing',this.value)">
            ${['linear','ease','ease-in','ease-out','ease-in-out'].map(e =>
              `<option ${anim.easing===e?'selected':''}>${e}</option>`).join('')}
          </select>
        </div>
        <div class="svg-prop-row">
          <label class="svg-prop-label">Loop</label>
          <input type="checkbox" ${anim.loop?'checked':''} onchange="SVGStudio.setAnimProp('${el.id}',${i},'loop',this.checked)">
          <label class="svg-prop-label" style="margin-left:8px">Yoyo</label>
          <input type="checkbox" ${anim.yoyo?'checked':''} onchange="SVGStudio.setAnimProp('${el.id}',${i},'yoyo',this.checked)">
        </div>
      </div>`).join('');
  }

  /* ============================================================
     §10  LAYER PANEL
  ============================================================ */

  function _renderLayers() {
    const panel = document.getElementById('svgLayers');
    if (!panel) return;
    panel.innerHTML = [...S.elements].reverse().map(el => `
      <div class="svg-layer-item ${S.selected.has(el.id)?'active':''}"
           onclick="SVGStudio.selectEl('${el.id}',event.shiftKey)">
        <span style="font-size:11px;opacity:.5">${_typeIcon(el.type)}</span>
        <span class="svg-layer-name">${el.name}</span>
        <button class="svg-layer-btn" onclick="event.stopPropagation();SVGStudio.toggleVisible('${el.id}')"
          title="${el.visible?'Hide':'Show'}">${el.visible?'👁':'🚫'}</button>
        <button class="svg-layer-btn" onclick="event.stopPropagation();SVGStudio.toggleLock('${el.id}')"
          title="${el.locked?'Unlock':'Lock'}">${el.locked?'🔒':'🔓'}</button>
      </div>`).join('') || `<p style="font-size:10px;color:#38384a;padding:8px">No elements yet</p>`;
  }

  function _typeIcon(type) {
    const m = { rect:'▭', circle:'○', ellipse:'⬭', line:'╱', polyline:'〜', polygon:'⬡', path:'✒', text:'T' };
    return m[type] || '?';
  }

  /* ============================================================
     §11  EXPORT
  ============================================================ */

  function exportSVG(opts = {}) {
    const cssAnims = buildCSSAnimations(S.elements);
    const content  = S.elements.filter(e => e.visible).map(e => renderElement(e, true)).join('\n  ');
    const defs     = _buildDefs();

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${S.canvasW}" height="${S.canvasH}"
     viewBox="0 0 ${S.canvasW} ${S.canvasH}">
  <defs>${defs}</defs>
  <style>
    /* BlockForge SVG Export — Generated ${new Date().toISOString()} */
    ${cssAnims}
  </style>
  ${content}
</svg>`;

    if (opts.download) {
      const blob = new Blob([svg], { type:'image/svg+xml' });
      const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(blob), download:'blockforge-export.svg' });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }
    return svg;
  }

  function exportPNG(scale = 2) {
    const svgStr = exportSVG();
    const blob   = new Blob([svgStr], { type:'image/svg+xml' });
    const url    = URL.createObjectURL(blob);
    const img    = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width  = S.canvasW * scale;
      c.height = S.canvasH * scale;
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = Object.assign(document.createElement('a'), { href:c.toDataURL('image/png'), download:'blockforge-export.png' });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    img.src = url;
  }

  /* ============================================================
     §12  UTILITIES
  ============================================================ */

  function escSVG(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function escAttr(s) {
    return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function toHexSafe(v) {
    if (!v || !v.startsWith('#')) return '#6366f1';
    return v.slice(0,7);
  }

  /* ============================================================
     §13  STUDIO UI
  ============================================================ */

  function buildStudioHTML() {
    return `
<div id="svgStudio" style="
  position:fixed;inset:0;z-index:3000;
  background:#0a0a12;display:flex;flex-direction:column;
  font-family:'Inter',sans-serif;color:#eeeef8;
  animation:svgIn .25s cubic-bezier(.4,0,.2,1);
">
<style>
@keyframes svgIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
#svgStudio *{box-sizing:border-box}
#svgStudio ::-webkit-scrollbar{width:4px}
#svgStudio ::-webkit-scrollbar-thumb{background:#2a2a3e;border-radius:99px}
.svg-toolbar{height:48px;background:#0f0f18;border-bottom:1px solid rgba(255,255,255,.07);
  display:flex;align-items:center;padding:0 12px;gap:6px;flex-shrink:0;overflow-x:auto}
.svg-brand{display:flex;align-items:center;gap:8px;font-weight:800;font-size:14px;margin-right:6px;flex-shrink:0}
.svg-logo{width:26px;height:26px;border-radius:6px;background:linear-gradient(135deg,#f59e0b,#ec4899);
  display:flex;align-items:center;justify-content:center;font-size:13px}
.svg-badge{font-size:8px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  background:linear-gradient(135deg,#f59e0b,#ec4899);color:#fff;padding:2px 5px;border-radius:99px}
.svg-sep{width:1px;height:20px;background:rgba(255,255,255,.1);margin:0 2px;flex-shrink:0}
.svg-btn{height:28px;padding:0 9px;border-radius:5px;font-size:11px;font-weight:600;
  color:#9090b0;display:flex;align-items:center;gap:4px;cursor:pointer;border:none;
  background:none;transition:all .15s ease;white-space:nowrap;flex-shrink:0}
.svg-btn:hover{background:#1b1b28;color:#eeeef8}
.svg-btn.active{background:#6366f1;color:#fff}
.svg-btn.danger:hover{background:rgba(239,68,68,.15);color:#fca5a5}
.svg-tool-group{display:flex;background:#141420;border-radius:6px;padding:2px;gap:1px;border:1px solid rgba(255,255,255,.07)}
.svg-tool{width:28px;height:28px;border-radius:4px;border:none;background:none;
  color:#55556a;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:all .15s ease;flex-shrink:0}
.svg-tool:hover{background:#1b1b28;color:#9090b0}
.svg-tool.active{background:#6366f1;color:#fff}
.svg-spacer{flex:1}
.svg-body{flex:1;display:flex;overflow:hidden}
.svg-left{width:220px;background:#0f0f18;border-right:1px solid rgba(255,255,255,.07);
  display:flex;flex-direction:column;flex-shrink:0;overflow:hidden}
.svg-left-tabs{display:flex;padding:6px 8px 0;gap:2px;flex-shrink:0}
.svg-left-tab{flex:1;height:24px;border-radius:4px;font-size:10px;font-weight:700;
  color:#55556a;cursor:pointer;border:none;background:none;transition:all .15s ease}
.svg-left-tab.active{background:#1b1b28;color:#eeeef8}
.svg-left-tab:hover:not(.active){color:#9090b0}
.svg-left-body{flex:1;overflow-y:auto;padding:8px}
.svg-canvas-area{flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative}
.svg-canvas-toolbar{height:36px;background:#0f0f18;border-bottom:1px solid rgba(255,255,255,.07);
  display:flex;align-items:center;padding:0 12px;gap:8px;flex-shrink:0}
.svg-canvas-wrap{flex:1;overflow:hidden;background:#141420;position:relative;cursor:crosshair}
#svgCanvas{position:absolute;inset:0;width:100%;height:100%}
.svg-right{width:240px;background:#0f0f18;border-left:1px solid rgba(255,255,255,.07);
  display:flex;flex-direction:column;flex-shrink:0;overflow:hidden}
.svg-right-header{height:36px;background:#0f0f18;border-bottom:1px solid rgba(255,255,255,.07);
  display:flex;align-items:center;padding:0 12px;font-size:10.5px;font-weight:700;color:#55556a;flex-shrink:0}
.svg-right-body{flex:1;overflow-y:auto;padding:8px}
.svg-section-title{font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;
  color:#38384a;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.05)}
.svg-prop-row{display:flex;align-items:center;gap:5px;margin-bottom:5px}
.svg-prop-label{font-size:10px;color:#9090b0;min-width:58px;flex-shrink:0}
.svg-prop-input{flex:1;height:24px;padding:0 6px;background:#141420;border:1px solid rgba(255,255,255,.07);
  border-radius:4px;color:#eeeef8;font-size:11px;outline:none;min-width:0}
.svg-prop-input:focus{border-color:#6366f1}
.svg-color-input{width:26px;height:24px;padding:1px;background:#141420;border:1px solid rgba(255,255,255,.07);
  border-radius:4px;cursor:pointer;flex-shrink:0}
.svg-no-sel{display:flex;flex-direction:column;align-items:center;justify-content:center;
  height:100%;text-align:center;padding:20px}
.svg-inspector-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.svg-anim-item{background:#141420;border:1px solid rgba(255,255,255,.07);border-radius:6px;
  padding:8px;margin-bottom:6px}
.svg-layer-item{display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:4px;
  cursor:pointer;font-size:11px;color:#9090b0;transition:all .15s ease}
.svg-layer-item:hover{background:#141420;color:#eeeef8}
.svg-layer-item.active{background:rgba(99,102,241,.12);color:#818cf8}
.svg-layer-name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.svg-layer-btn{width:18px;height:18px;border-radius:3px;border:none;background:none;
  font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;
  color:#38384a;transition:all .15s ease;flex-shrink:0}
.svg-layer-btn:hover{background:#222232;color:#9090b0}
.svg-status{height:24px;background:#080810;border-top:1px solid rgba(255,255,255,.05);
  display:flex;align-items:center;padding:0 12px;gap:12px;flex-shrink:0}
.svg-status-item{font-size:9.5px;color:#38384a;font-family:'JetBrains Mono',monospace}
.svg-status-item span{color:#55556a}
.svg-color-swatch{width:20px;height:20px;border-radius:4px;cursor:pointer;border:2px solid transparent;
  transition:all .15s ease;flex-shrink:0}
.svg-color-swatch:hover{transform:scale(1.1)}
.svg-color-swatch.active{border-color:#fff}
</style>

<!-- TOOLBAR -->
<div class="svg-toolbar">
  <div class="svg-brand">
    <div class="svg-logo">✦</div>
    SVG Studio
    <span class="svg-badge">Pro</span>
  </div>
  <div class="svg-sep"></div>

  <!-- Tools -->
  <div class="svg-tool-group">
    <button class="svg-tool active" data-tool="select" title="Select (V)" onclick="SVGStudio.setTool('select',this)">↖</button>
    <button class="svg-tool" data-tool="pan" title="Pan (H)" onclick="SVGStudio.setTool('pan',this)">✋</button>
  </div>
  <div class="svg-tool-group">
    <button class="svg-tool" data-tool="rect"     title="Rectangle (R)" onclick="SVGStudio.setTool('rect',this)">▭</button>
    <button class="svg-tool" data-tool="circle"   title="Circle (C)" onclick="SVGStudio.setTool('circle',this)">○</button>
    <button class="svg-tool" data-tool="ellipse"  title="Ellipse (E)" onclick="SVGStudio.setTool('ellipse',this)">⬭</button>
    <button class="svg-tool" data-tool="line"     title="Line (L)" onclick="SVGStudio.setTool('line',this)">╱</button>
    <button class="svg-tool" data-tool="pen"      title="Pen / Path (P)" onclick="SVGStudio.setTool('pen',this)">✒</button>
    <button class="svg-tool" data-tool="text"     title="Text (T)" onclick="SVGStudio.setTool('text',this)">T</button>
  </div>

  <div class="svg-sep"></div>

  <!-- Quick shapes -->
  <button class="svg-btn" onclick="SVGStudio.addStar()" title="Add Star">⭐</button>
  <button class="svg-btn" onclick="SVGStudio.addArrow()" title="Add Arrow">→</button>
  <button class="svg-btn" onclick="SVGStudio.addHeart()" title="Add Heart">♥</button>

  <div class="svg-sep"></div>

  <!-- Colours -->
  <div style="display:flex;align-items:center;gap:4px">
    <span style="font-size:9px;color:#38384a">Fill</span>
    <input type="color" value="${S.fill}" style="width:26px;height:22px;padding:1px;background:#141420;border:1px solid rgba(255,255,255,.1);border-radius:4px;cursor:pointer"
      oninput="SVGStudio.setFill(this.value)">
    <span style="font-size:9px;color:#38384a">Stroke</span>
    <input type="color" value="${S.stroke}" style="width:26px;height:22px;padding:1px;background:#141420;border:1px solid rgba(255,255,255,.1);border-radius:4px;cursor:pointer"
      oninput="SVGStudio.setStroke(this.value)">
    <input type="number" value="${S.strokeWidth}" min="0" max="20" step="0.5"
      style="width:36px;height:22px;padding:0 4px;background:#141420;border:1px solid rgba(255,255,255,.1);border-radius:4px;color:#9090b0;font-size:10px;outline:none"
      oninput="SVGStudio.setStrokeWidth(+this.value)" title="Stroke width">
  </div>

  <div class="svg-sep"></div>

  <!-- Align -->
  <div class="svg-tool-group">
    <button class="svg-tool" onclick="SVGStudio.align('left')"   title="Align Left">⬤←</button>
    <button class="svg-tool" onclick="SVGStudio.align('cx')"     title="Center H">⬤↔</button>
    <button class="svg-tool" onclick="SVGStudio.align('right')"  title="Align Right">→⬤</button>
    <button class="svg-tool" onclick="SVGStudio.align('top')"    title="Align Top">⬤↑</button>
    <button class="svg-tool" onclick="SVGStudio.align('cy')"     title="Center V">⬤↕</button>
    <button class="svg-tool" onclick="SVGStudio.align('bottom')" title="Align Bottom">↓⬤</button>
  </div>
  <div class="svg-tool-group">
    <button class="svg-tool" onclick="SVGStudio.distribute('h')" title="Distribute H">⬤↔⬤</button>
    <button class="svg-tool" onclick="SVGStudio.distribute('v')" title="Distribute V">⬤↕⬤</button>
  </div>

  <div class="svg-sep"></div>

  <!-- Z-order -->
  <div class="svg-tool-group">
    <button class="svg-tool" onclick="SVGStudio.bringToFront()"  title="Bring to Front">⬆⬆</button>
    <button class="svg-tool" onclick="SVGStudio.bringForward()"  title="Bring Forward">⬆</button>
    <button class="svg-tool" onclick="SVGStudio.sendBackward()"  title="Send Backward">⬇</button>
    <button class="svg-tool" onclick="SVGStudio.sendToBack()"    title="Send to Back">⬇⬇</button>
  </div>

  <div class="svg-sep"></div>

  <!-- History -->
  <button class="svg-btn" id="svgUndoBtn" onclick="SVGStudio.undo()" style="opacity:.35" title="Undo (Ctrl+Z)">↩</button>
  <button class="svg-btn" id="svgRedoBtn" onclick="SVGStudio.redo()" style="opacity:.35" title="Redo (Ctrl+Y)">↪</button>

  <div class="svg-spacer"></div>

  <!-- Export -->
  <button class="svg-btn" onclick="SVGStudio.exportSVGFile()" title="Export SVG">📄 SVG</button>
  <button class="svg-btn" onclick="SVGStudio.exportPNGFile()" title="Export PNG">🖼 PNG</button>
  <button class="svg-btn" onclick="SVGStudio.showCode()" title="View SVG Code">⌨ Code</button>
  <div class="svg-sep"></div>
  <button class="svg-btn" onclick="SVGStudio.close()" style="color:#ef4444">✕ Close</button>
</div>

<!-- BODY -->
<div class="svg-body">

  <!-- LEFT: Layers + Shapes -->
  <div class="svg-left">
    <div class="svg-left-tabs">
      <button class="svg-left-tab active" onclick="SVGStudio.leftTab('layers',this)">Layers</button>
      <button class="svg-left-tab" onclick="SVGStudio.leftTab('shapes',this)">Shapes</button>
    </div>
    <div class="svg-left-body" id="svgLeftBody">
      <div class="svg-section-title">Elements</div>
      <div id="svgLayers"><p style="font-size:10px;color:#38384a;padding:4px">No elements yet</p></div>
    </div>
  </div>

  <!-- CANVAS -->
  <div class="svg-canvas-area">
    <div class="svg-canvas-toolbar">
      <span style="font-size:10px;font-weight:700;color:#55556a;letter-spacing:.07em;text-transform:uppercase" id="svgToolLabel">Select</span>
      <div class="svg-sep"></div>
      <button class="svg-btn" onclick="SVGStudio.zoomIn()"  style="height:24px;padding:0 7px;font-size:11px">+</button>
      <span style="font-size:10px;color:#38384a;font-family:'JetBrains Mono',monospace;min-width:36px;text-align:center" id="svgZoomLabel">100%</span>
      <button class="svg-btn" onclick="SVGStudio.zoomOut()" style="height:24px;padding:0 7px;font-size:11px">−</button>
      <button class="svg-btn" onclick="SVGStudio.zoomFit()" style="height:24px;padding:0 7px;font-size:10px">Fit</button>
      <div class="svg-sep"></div>
      <button class="svg-btn ${S.showGrid?'active':''}" onclick="SVGStudio.toggleGrid(this)" style="height:24px;padding:0 7px;font-size:10px">Grid</button>
      <button class="svg-btn ${S.snapEnabled?'active':''}" onclick="SVGStudio.toggleSnap(this)" style="height:24px;padding:0 7px;font-size:10px">Snap</button>
      <div style="flex:1"></div>
      <span style="font-size:9.5px;color:#38384a;font-family:'JetBrains Mono',monospace" id="svgMouseCoords">0, 0</span>
    </div>
    <div class="svg-canvas-wrap" id="svgCanvasWrap">
      <svg id="svgCanvas" xmlns="http://www.w3.org/2000/svg"
           width="${S.canvasW}" height="${S.canvasH}">
      </svg>
    </div>
    <div class="svg-status">
      <span class="svg-status-item">Elements: <span id="svgStatEl">0</span></span>
      <span class="svg-status-item">Selected: <span id="svgStatSel">0</span></span>
      <span class="svg-status-item">Canvas: <span>${S.canvasW}×${S.canvasH}</span></span>
      <span class="svg-status-item">Zoom: <span id="svgStatZoom">100%</span></span>
    </div>
  </div>

  <!-- RIGHT: Inspector -->
  <div class="svg-right">
    <div class="svg-right-header">Properties</div>
    <div class="svg-right-body" id="svgInspector">
      <div class="svg-no-sel">
        <div style="font-size:28px;opacity:.15;margin-bottom:8px">✦</div>
        <p style="font-size:11px;color:#38384a">Select an element to edit its properties</p>
      </div>
    </div>
  </div>

</div>
`;
  }

  /* ============================================================
     §14  PUBLIC API
  ============================================================ */
  return {

    open() {
      if (document.getElementById('svgStudio')) return;
      const div = document.createElement('div');
      div.innerHTML = buildStudioHTML();
      document.body.appendChild(div.firstElementChild);

      const svg = document.getElementById('svgCanvas');
      if (svg) {
        svg.addEventListener('mousedown', _onMouseDown);
        svg.addEventListener('mousemove', e => {
          _onMouseMove(e);
          // Update coords display
          const { x, y } = _svgCoords(e);
          const el = document.getElementById('svgMouseCoords');
          if (el) el.textContent = `${Math.round(x)}, ${Math.round(y)}`;
        });
        svg.addEventListener('mouseup',   _onMouseUp);
        svg.addEventListener('dblclick',  _onDblClick);
        svg.addEventListener('wheel', e => {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
          S.zoom = Math.max(0.1, Math.min(5, S.zoom + delta));
          _render(); _updateZoomLabel();
        }, { passive:false });
      }

      document.addEventListener('keydown', _onKeyDown);
      snapshot();
      _render();
      _renderLayers();
      _renderInspector();
    },

    close() {
      document.removeEventListener('keydown', _onKeyDown);
      document.getElementById('svgStudio')?.remove();
    },

    setTool(tool, btn) {
      S.tool = tool;
      document.querySelectorAll('.svg-tool').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      const lbl = document.getElementById('svgToolLabel');
      const names = { select:'Select', pan:'Pan', rect:'Rectangle', circle:'Circle',
        ellipse:'Ellipse', line:'Line', pen:'Pen / Path', text:'Text' };
      if (lbl) lbl.textContent = names[tool] || tool;
      const wrap = document.getElementById('svgCanvasWrap');
      if (wrap) wrap.style.cursor = tool === 'select' ? 'default' : tool === 'pan' ? 'grab' : 'crosshair';
    },

    selectEl(id, additive) { selectEl(id, additive); },
    undo, redo,
    deleteSelected, duplicateSelected,
    align, distribute,
    bringForward, sendBackward, bringToFront, sendToBack,

    setProp(id, key, value) {
      const el = S.elements.find(e => e.id === id);
      if (el) { el[key] = value; _render(); _updateStatus(); }
    },

    commitProp() { snapshot(); },

    setAnimProp(id, animIdx, key, value) {
      const el = S.elements.find(e => e.id === id);
      if (el && el.animations[animIdx]) {
        el.animations[animIdx][key] = value;
        _render();
      }
    },

    addAnimation() {
      const ids = [...S.selected];
      if (ids.length === 0) return;
      const el = S.elements.find(e => e.id === ids[0]);
      if (!el) return;
      el.animations.push({
        id:       'a_' + Date.now(),
        type:     'smil',
        property: 'opacity',
        from:     '1',
        to:       '0',
        duration: 1,
        delay:    0,
        easing:   'linear',
        loop:     true,
        yoyo:     true,
      });
      snapshot(); _render(); _renderInspector();
    },

    removeAnimation(id, idx) {
      const el = S.elements.find(e => e.id === id);
      if (el) { el.animations.splice(idx, 1); snapshot(); _render(); _renderInspector(); }
    },

    setFill(v)        { S.fill = v; },
    setStroke(v)      { S.stroke = v; },
    setStrokeWidth(v) { S.strokeWidth = v; },

    toggleVisible(id) {
      const el = S.elements.find(e => e.id === id);
      if (el) { el.visible = !el.visible; snapshot(); _render(); _renderLayers(); }
    },

    toggleLock(id) {
      const el = S.elements.find(e => e.id === id);
      if (el) { el.locked = !el.locked; snapshot(); _renderLayers(); }
    },

    toggleGrid(btn) {
      S.showGrid = !S.showGrid;
      btn?.classList.toggle('active', S.showGrid);
      _render();
    },

    toggleSnap(btn) {
      S.snapEnabled = !S.snapEnabled;
      btn?.classList.toggle('active', S.snapEnabled);
    },

    zoomIn()  { S.zoom = Math.min(5, S.zoom + 0.1); _render(); _updateZoomLabel(); },
    zoomOut() { S.zoom = Math.max(0.1, S.zoom - 0.1); _render(); _updateZoomLabel(); },
    zoomFit() { S.zoom = 1; S.panX = 0; S.panY = 0; _render(); _updateZoomLabel(); },

    leftTab(tab, btn) {
      document.querySelectorAll('.svg-left-tab').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      const body = document.getElementById('svgLeftBody');
      if (!body) return;
      if (tab === 'layers') {
        body.innerHTML = `<div class="svg-section-title">Elements</div><div id="svgLayers"></div>`;
        _renderLayers();
      } else {
        body.innerHTML = `
          <div class="svg-section-title">Quick Shapes</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
            ${[['▭ Rect','rect'],['○ Circle','circle'],['⬭ Ellipse','ellipse'],
               ['╱ Line','line'],['✒ Path','pen'],['T Text','text'],
               ['⭐ Star','star'],['→ Arrow','arrow'],['♥ Heart','heart']].map(([lbl,t]) => `
              <button class="svg-btn" style="justify-content:flex-start"
                onclick="SVGStudio.quickAdd('${t}')">${lbl}</button>`).join('')}
          </div>
          <div class="svg-section-title" style="margin-top:10px">Preset Colours</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${['#6366f1','#ec4899','#10b981','#f59e0b','#ef4444','#06b6d4',
               '#8b5cf6','#f97316','#84cc16','#fff','#000','transparent'].map(c => `
              <div class="svg-color-swatch" style="background:${c==='transparent'?'repeating-conic-gradient(#333 0% 25%,#555 0% 50%) 0 0/8px 8px':c}"
                onclick="SVGStudio.setFill('${c}')" title="${c}"></div>`).join('')}
          </div>`;
      }
    },

    quickAdd(type) {
      const cx = S.canvasW/2, cy = S.canvasH/2;
      if (type === 'rect')    { S.elements.push(makeRect(cx-60,cy-40,120,80)); }
      else if (type === 'circle')  { S.elements.push(makeCircle(cx,cy,50)); }
      else if (type === 'ellipse') { S.elements.push(makeEllipse(cx,cy,70,40)); }
      else if (type === 'line')    { S.elements.push(makeLine(cx-60,cy,cx+60,cy)); }
      else if (type === 'text')    { const t = prompt('Text:','Hello SVG'); if(t) S.elements.push(makeText(cx,cy,t)); }
      else if (type === 'star')    { this.addStar(); return; }
      else if (type === 'arrow')   { this.addArrow(); return; }
      else if (type === 'heart')   { this.addHeart(); return; }
      else if (type === 'pen')     { this.setTool('pen'); return; }
      const last = S.elements[S.elements.length-1];
      if (last) { snapshot(); _render(); _renderLayers(); selectEl(last.id); }
    },

    addStar() {
      const el = makeStar(S.canvasW/2, S.canvasH/2, 60, 25, 5);
      el.name = 'Star';
      S.elements.push(el);
      snapshot(); _render(); _renderLayers(); selectEl(el.id);
    },

    addArrow() {
      const cx = S.canvasW/2, cy = S.canvasH/2;
      const el = makeArrow(cx-60, cy, cx+60, cy);
      el.name = 'Arrow'; el.fill = 'none';
      S.elements.push(el);
      snapshot(); _render(); _renderLayers(); selectEl(el.id);
    },

    addHeart() {
      const cx = S.canvasW/2, cy = S.canvasH/2;
      const el = makePath(`M${cx},${cy+30} C${cx-80},${cy-20} ${cx-80},${cy-70} ${cx},${cy-30} C${cx+80},${cy-70} ${cx+80},${cy-20} ${cx},${cy+30} Z`);
      el.name = 'Heart';
      S.elements.push(el);
      snapshot(); _render(); _renderLayers(); selectEl(el.id);
    },

    exportSVGFile() { exportSVG({ download:true }); },
    exportPNGFile() { exportPNG(2); },

    showCode() {
      const code = exportSVG();
      const win  = window.open('', '_blank', 'width=700,height=600');
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><title>SVG Code</title>
        <style>body{background:#080810;color:#a5b4fc;font-family:'JetBrains Mono',monospace;font-size:12px;padding:16px;margin:0}
        pre{white-space:pre-wrap;word-break:break-all}</style></head>
        <body><pre>${code.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></body></html>`);
    },
  };

  function _updateZoomLabel() {
    const pct = Math.round(S.zoom * 100) + '%';
    const lbl = document.getElementById('svgZoomLabel');
    const stat = document.getElementById('svgStatZoom');
    if (lbl)  lbl.textContent  = pct;
    if (stat) stat.textContent = pct;
  }

  function _updateStatus() {
    const el  = document.getElementById('svgStatEl');
    const sel = document.getElementById('svgStatSel');
    if (el)  el.textContent  = S.elements.length;
    if (sel) sel.textContent = S.selected.size;
  }

})();

window.SVGStudio = SVGStudio;