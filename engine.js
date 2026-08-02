/**
 * @fileoverview BlockForge Pro — Core Engine v5.1
 * @description  State management, rendering, history, export, and preview.
 *
 * Preview fix log (v5.1):
 *  - Uses iframe.srcdoc instead of doc.write() — works in all browsers
 *  - Fonts loaded via @import in <style> — <link> blocked by sandbox
 *  - iframe height set explicitly after load — prevents 0px collapse
 *  - Preview button calls openPreview() directly — no switchEditorMode conflict
 *  - closePreview() resets srcdoc — ensures clean re-open every time
 *  - sandbox="allow-scripts" only (no allow-same-origin) in HTML
 */

'use strict';

/* ============================================================
   §1  STATE
============================================================ */
const state = {
  blocks:       [],
  selected:     null,
  mode:         'web',
  editorMode:   'design',
  zoom:         100,
  history:      [],
  historyIndex: -1,
  dragType:     null,
  sidebarTab:   'blocks',
  previewOpen:  false,
  searchQuery:  '',
  darkCanvas:   false,
};

const MODE_META = {
  web:   { label:'Web Page',      px:1160, icon:'🖥️' },
  email: { label:'Email',         px:600,  icon:'📧' },
  flyer: { label:'Flyer / Print', px:794,  icon:'📄' },
  ad:    { label:'Ad / Banner',   px:400,  icon:'📢' },
};

const STORAGE_KEYS = {
  project:  'blockforge_v5',
  autosave: 'blockforge_autosave',
  legacy:   ['blockforge_v4','blockforge_v3','blockforge_v2','blockforge_project'],
};

/* ============================================================
   §2  HISTORY
============================================================ */
function snapshot() {
  const s = JSON.stringify(state.blocks);
  if (state.history[state.historyIndex] === s) return;
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(s);
  if (state.history.length > 100) state.history.shift();
  state.historyIndex = state.history.length - 1;
  _syncHistoryButtons();
}

function _syncHistoryButtons() {
  const u = document.getElementById('undoBtn');
  const r = document.getElementById('redoBtn');
  if (u) u.style.opacity = state.historyIndex <= 0 ? '.35' : '1';
  if (r) r.style.opacity = state.historyIndex >= state.history.length - 1 ? '.35' : '1';
}

function undo() {
  if (state.historyIndex <= 0) { toast('Nothing to undo', 'info'); return; }
  state.historyIndex--;
  state.blocks = JSON.parse(state.history[state.historyIndex]);
  state.selected = null;
  renderCanvas(); renderProps(); renderSidebar(); _syncHistoryButtons();
  toast('Undone', 'info');
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) { toast('Nothing to redo', 'info'); return; }
  state.historyIndex++;
  state.blocks = JSON.parse(state.history[state.historyIndex]);
  state.selected = null;
  renderCanvas(); renderProps(); renderSidebar(); _syncHistoryButtons();
  toast('Redone', 'info');
}

/* ============================================================
   §3  BLOCK CRUD
============================================================ */
function uid() {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
}

function addBlock(type, data = {}, insertIdx = null) {
  const block = { id: uid(), type, data: { ...data } };
  if (insertIdx !== null && insertIdx >= 0) {
    state.blocks.splice(insertIdx, 0, block);
  } else if (state.selected) {
    const idx = state.blocks.findIndex(b => b.id === state.selected);
    state.blocks.splice(idx !== -1 ? idx + 1 : state.blocks.length, 0, block);
  } else {
    state.blocks.push(block);
  }
  snapshot();
  renderCanvas();
  selectBlock(block.id);
  toast(capitalize(type) + ' added', 'success');
  return block.id;
}

function deleteBlock(id) {
  const idx = state.blocks.findIndex(b => b.id === id);
  if (idx === -1) return;
  state.blocks.splice(idx, 1);
  if (state.selected === id) {
    const adjacent = state.blocks[idx] || state.blocks[idx - 1] || null;
    state.selected = adjacent ? adjacent.id : null;
    renderProps();
  }
  snapshot();
  renderCanvas();
  if (state.sidebarTab === 'layers') renderSidebar();
  toast('Block deleted', 'info');
}

function duplicateBlock(id) {
  const idx = state.blocks.findIndex(b => b.id === id);
  if (idx === -1) return;
  const copy = { id: uid(), type: state.blocks[idx].type, data: JSON.parse(JSON.stringify(state.blocks[idx].data)) };
  state.blocks.splice(idx + 1, 0, copy);
  snapshot();
  renderCanvas();
  selectBlock(copy.id);
  toast('Duplicated', 'success');
}

function moveBlock(id, dir) {
  const idx = state.blocks.findIndex(b => b.id === id);
  const ni  = idx + dir;
  if (idx === -1 || ni < 0 || ni >= state.blocks.length) return;
  [state.blocks[idx], state.blocks[ni]] = [state.blocks[ni], state.blocks[idx]];
  snapshot();
  renderCanvas();
  if (state.sidebarTab === 'layers') renderSidebar();
}

function clearCanvas() {
  if (state.blocks.length === 0) return;
  if (!confirm('Clear all blocks? This cannot be undone.')) return;
  state.blocks = []; state.selected = null;
  snapshot(); renderCanvas(); renderProps(); renderSidebar();
  toast('Canvas cleared', 'info');
}

function selectBlock(id) {
  state.selected = id;
  document.querySelectorAll('.block-wrapper').forEach(el => {
    el.classList.toggle('selected', el.id === 'bw-' + id);
  });
  renderProps();
  if (state.sidebarTab === 'layers') renderSidebar();
  const el = document.getElementById('bw-' + id);
  if (el) el.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function updateBlockData(id, key, value) {
  const block = state.blocks.find(b => b.id === id);
  if (!block) return;
  block.data[key] = value;
  const inner = document.querySelector(`#bw-${id} .block-inner`);
  if (inner) inner.innerHTML = renderBlockHTML(block);
}

function applyBlockData(id) {
  snapshot();
  const block = state.blocks.find(b => b.id === id);
  if (!block) return;
  const inner = document.querySelector(`#bw-${id} .block-inner`);
  if (inner) inner.innerHTML = renderBlockHTML(block);
}

/* ============================================================
   §4  CANVAS RENDERING
============================================================ */
function renderCanvas() {
  const container = document.getElementById('canvasBlocks');
  const emptyEl   = document.getElementById('emptyState');
  if (!container) return;

  if (state.blocks.length === 0) {
    container.innerHTML = '';
    if (emptyEl) { container.appendChild(emptyEl); emptyEl.style.display = 'flex'; }
    _updateBlockCount();
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const existing = {};
  container.querySelectorAll('.block-wrapper').forEach(el => { existing[el.id] = el; });
  const needed = new Set(state.blocks.map(b => 'bw-' + b.id));
  Object.keys(existing).forEach(id => { if (!needed.has(id)) existing[id].remove(); });

  state.blocks.forEach((block, idx) => {
    let wrapper = document.getElementById('bw-' + block.id);
    if (!wrapper) {
      wrapper = _createBlockWrapper(block);
      container.appendChild(wrapper);
    } else {
      wrapper.classList.toggle('selected', state.selected === block.id);
      const lbl = wrapper.querySelector('.bw-type-label');
      if (lbl) lbl.textContent = capitalize(block.type);
    }
    const siblings = [...container.children].filter(c => c.classList.contains('block-wrapper'));
    if (siblings[idx] !== wrapper) container.insertBefore(wrapper, siblings[idx] || null);
  });

  _updateBlockCount();
}

function _createBlockWrapper(block) {
  const wrapper = document.createElement('div');
  wrapper.className = 'block-wrapper' + (state.selected === block.id ? ' selected' : '');
  wrapper.id        = 'bw-' + block.id;
  wrapper.dataset.type = block.type;

  const label = document.createElement('div');
  label.className = 'bw-label';
  label.innerHTML = `<span class="bw-type-label">${capitalize(block.type)}</span>
                     <span class="bw-id-label">#${block.id.slice(-4)}</span>`;

  const controls = document.createElement('div');
  controls.className = 'block-controls';
  controls.innerHTML = `
    <button class="block-ctrl-btn move-up" data-action="up"  title="Move Up (↑)">↑</button>
    <button class="block-ctrl-btn move-dn" data-action="dn"  title="Move Down (↓)">↓</button>
    <button class="block-ctrl-btn dup"     data-action="dup" title="Duplicate (Ctrl+D)">⧉</button>
    <button class="block-ctrl-btn del"     data-action="del" title="Delete (Del)">✕</button>`;

  controls.addEventListener('click', e => {
    e.stopPropagation();
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'up')  moveBlock(block.id, -1);
    if (action === 'dn')  moveBlock(block.id,  1);
    if (action === 'dup') duplicateBlock(block.id);
    if (action === 'del') deleteBlock(block.id);
  });

  const inner = document.createElement('div');
  inner.className = 'block-inner';
  inner.innerHTML = renderBlockHTML(block);

  wrapper.appendChild(label);
  wrapper.appendChild(controls);
  wrapper.appendChild(inner);
  wrapper.addEventListener('click', e => {
    if (!e.target.closest('.block-controls')) selectBlock(block.id);
  });
  return wrapper;
}

function renderBlockHTML(block) {
  const renderer = BLOCK_RENDERERS[block.type];
  if (!renderer) return `<div style="padding:20px 40px;color:#aaa;font-size:12px;background:#fff">Unknown block: <strong>${escHtml(block.type)}</strong></div>`;
  try { return renderer(block.data || {}); }
  catch(e) {
    console.error(`[BlockForge] Renderer error in "${block.type}":`, e);
    return `<div style="padding:20px 40px;color:#e55;font-size:11px;background:#fff">⚠ Error in <strong>${escHtml(block.type)}</strong>: ${escHtml(e.message)}</div>`;
  }
}

function _updateBlockCount() {
  const el = document.getElementById('blockCount');
  if (el) el.textContent = state.blocks.length + ' block' + (state.blocks.length !== 1 ? 's' : '');
}

/* ============================================================
   §5  PROPERTIES PANEL
============================================================ */
function renderProps() {
  const scroll = document.getElementById('propsScroll');
  const title  = document.getElementById('propsTitle');
  const sub    = document.getElementById('propsSubtitle');
  if (!scroll) return;

  if (!state.selected) {
    if (title) title.textContent = 'Properties';
    if (sub)   sub.textContent   = 'Select a block to edit';
    scroll.innerHTML = `
      <div class="no-selection">
        <div class="ns-icon">🎨</div>
        <p class="ns-text">Click any block on the canvas to edit its content, styles, and layout.</p>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:6px">
          <button class="btn-apply" style="background:var(--bg-4);color:var(--text-2);border:1px solid var(--border)" onclick="openTemplates()">🗂️ Load Template</button>
          <button class="btn-apply" onclick="addBlock('hero')">+ Add Hero Block</button>
        </div>
      </div>`;
    return;
  }

  const block  = state.blocks.find(b => b.id === state.selected);
  if (!block) { state.selected = null; renderProps(); return; }
  const schema = PROP_SCHEMAS[block.type] || [];
  const idx    = state.blocks.findIndex(b => b.id === state.selected);

  if (title) title.textContent = capitalize(block.type) + ' Block';
  if (sub)   sub.textContent   = `Block ${idx + 1} of ${state.blocks.length}`;

  const parts = [];
  parts.push(`
    <div style="display:flex;gap:4px;margin-bottom:12px">
      <button class="btn-secondary" style="flex:1;height:26px;font-size:10.5px"
        onclick="navigateBlock(-1)" ${idx === 0 ? 'disabled style="opacity:.35"' : ''}>← Prev</button>
      <button class="btn-secondary" style="flex:1;height:26px;font-size:10.5px"
        onclick="navigateBlock(1)"  ${idx === state.blocks.length-1 ? 'disabled style="opacity:.35"' : ''}>Next →</button>
    </div>`);

  schema.forEach(field => {
    if (field.section) { parts.push(`<div class="prop-section-title">${escHtml(field.section)}</div>`); return; }
    const val = block.data[field.key] !== undefined ? block.data[field.key] : '';
    const eid = 'pf_' + field.key;
    const bid = block.id;

    if (field.type === 'textarea') {
      parts.push(`
        <div class="prop-row" style="align-items:flex-start">
          <label class="prop-label" for="${eid}" style="padding-top:5px">${escHtml(field.label)}</label>
          <div style="flex:1;min-width:0">
            <textarea class="prop-textarea" id="${eid}"
              oninput="liveUpdate('${bid}','${field.key}',this.value)"
              onchange="applyBlockData('${bid}')">${escHtml(String(val))}</textarea>
          </div>
        </div>`);
      return;
    }

    parts.push(`<div class="prop-row"><label class="prop-label" for="${eid}" title="${escHtml(field.key)}">${escHtml(field.label)}</label>`);

    switch (field.type) {
      case 'text':
      case 'gradient':
        parts.push(`<input class="prop-input" id="${eid}" type="text" value="${escHtml(String(val))}"
          placeholder="${field.type==='gradient'?'gradient or #hex':''}"
          oninput="liveUpdate('${bid}','${field.key}',this.value)"
          onchange="applyBlockData('${bid}')">`);
        break;
      case 'color': {
        const hex = toHex(val||'#6366f1');
        parts.push(`
          <input class="prop-color-input" type="color" value="${escHtml(hex)}"
            oninput="syncColorText('${bid}','${field.key}',this,'${eid}_t')"
            onchange="applyBlockData('${bid}')">
          <input class="prop-input" id="${eid}_t" type="text" value="${escHtml(String(val))}"
            oninput="syncColorPicker('${bid}','${field.key}',this,'${eid}')"
            onchange="applyBlockData('${bid}')">`);
        break;
      }
      case 'select':
        parts.push(`<select class="prop-select" id="${eid}"
          onchange="liveUpdate('${bid}','${field.key}',this.value);applyBlockData('${bid}')">
          ${(field.options||[]).map(o=>`<option value="${escHtml(o)}" ${String(val)===o?'selected':''}>${escHtml(o)}</option>`).join('')}
        </select>`);
        break;
      case 'toggle':
        parts.push(`
          <div class="toggle ${val?'on':''}" id="${eid}"
            onclick="toggleProp('${bid}','${field.key}',this,'${eid}_l')"
            role="switch" aria-checked="${val?'true':'false'}"></div>
          <span class="toggle-label" id="${eid}_l">${val?'On':'Off'}</span>`);
        break;
      case 'range': {
        const min=field.min??0, max=field.max??100, step=field.step??1, unit=field.unit??'';
        const cur=val!==''?val:min;
        parts.push(`
          <div style="flex:1;display:flex;align-items:center;gap:6px">
            <input type="range" id="${eid}" min="${min}" max="${max}" step="${step}"
              value="${escHtml(String(cur))}" style="flex:1;accent-color:var(--primary)"
              oninput="liveUpdate('${bid}','${field.key}',this.value);document.getElementById('${eid}_v').textContent=this.value+'${unit}'"
              onchange="applyBlockData('${bid}')">
            <span id="${eid}_v" style="font-size:10.5px;color:var(--text-2);min-width:32px;text-align:right">${escHtml(String(cur))}${unit}</span>
          </div>`);
        break;
      }
      default:
        parts.push(`<span style="font-size:10px;color:var(--text-3)">Unknown: ${escHtml(field.type)}</span>`);
    }
    parts.push('</div>');
  });

  parts.push(`
    <div style="margin-top:14px;display:flex;flex-direction:column;gap:3px">
      <button class="btn-apply"     onclick="applyBlockData('${block.id}')">✓ Apply Changes</button>
      <button class="btn-secondary" onclick="duplicateBlock('${block.id}')">⧉ Duplicate Block</button>
      <button class="btn-secondary" style="color:var(--danger);border-color:rgba(239,68,68,.25)"
              onclick="deleteBlock('${block.id}')">✕ Delete Block</button>
    </div>`);

  scroll.innerHTML = parts.join('');
}

function navigateBlock(dir) {
  const idx  = state.blocks.findIndex(b => b.id === state.selected);
  const next = state.blocks[idx + dir];
  if (next) selectBlock(next.id);
}

function liveUpdate(id, key, value) { updateBlockData(id, key, value); }

function syncColorText(id, key, colorEl, textId) {
  const t = document.getElementById(textId);
  if (t) t.value = colorEl.value;
  liveUpdate(id, key, colorEl.value);
}

function syncColorPicker(id, key, textEl, colorId) {
  const c = document.getElementById(colorId);
  const h = toHex(textEl.value);
  if (c && h) c.value = h;
  liveUpdate(id, key, textEl.value);
}

function toggleProp(id, key, el, lblId) {
  const block = state.blocks.find(b => b.id === id);
  if (!block) return;
  block.data[key] = !block.data[key];
  el.classList.toggle('on', block.data[key]);
  el.setAttribute('aria-checked', String(block.data[key]));
  const lbl = document.getElementById(lblId);
  if (lbl) lbl.textContent = block.data[key] ? 'On' : 'Off';
  updateBlockData(id, key, block.data[key]);
  applyBlockData(id);
}

/* ============================================================
   §6  SIDEBAR
============================================================ */
function renderSidebar() {
  const content = document.getElementById('sidebarContent');
  if (!content) return;
  switch (state.sidebarTab) {
    case 'blocks':  _renderBlocksTab(content);  break;
    case 'layers':  _renderLayersTab(content);  break;
    case 'assets':  _renderAssetsTab(content);  break;
  }
}

function _renderBlocksTab(container) {
  const q = state.searchQuery.toLowerCase().trim();
  const parts = [];
  Object.entries(BLOCK_LIBRARY).forEach(([cat, blocks]) => {
    const filtered = q ? blocks.filter(b => b.label.toLowerCase().includes(q) || cat.toLowerCase().includes(q)) : blocks;
    if (filtered.length === 0) return;
    parts.push(`
      <div class="blk-cat" data-cat="${escHtml(cat)}">
        <div class="blk-cat-label">${escHtml(cat)} <span style="color:var(--text-3);font-weight:400">(${filtered.length})</span></div>
        <div class="blk-grid">
          ${filtered.map(b => `
            <div class="blk-item" draggable="true" data-type="${escHtml(b.id)}"
                 ondragstart="onBlockDragStart(event,'${escHtml(b.id)}')"
                 onclick="addBlock('${escHtml(b.id)}')"
                 title="${escHtml(b.label)} — click or drag to add">
              <div class="bi-icon" aria-hidden="true">${b.icon}</div>
              <div class="bi-label">${escHtml(b.label)}</div>
            </div>`).join('')}
        </div>
      </div>`);
  });
  container.innerHTML = parts.length ? parts.join('') :
    `<p style="font-size:11px;color:var(--text-3);padding:16px 4px;text-align:center">No blocks match "<strong>${escHtml(state.searchQuery)}</strong>"</p>`;
}

function _renderLayersTab(container) {
  if (state.blocks.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:24px 8px"><div style="font-size:28px;opacity:.2;margin-bottom:8px">📋</div><p style="font-size:11px;color:var(--text-3)">No blocks yet.</p></div>`;
    return;
  }
  container.innerHTML = state.blocks.map((b, i) => `
    <div class="layer-item ${state.selected === b.id ? 'active' : ''}" onclick="selectBlock('${b.id}')"
         role="button" tabindex="0" aria-label="${escHtml(capitalize(b.type))} block, position ${i+1}">
      <span class="layer-icon" aria-hidden="true">${getBlockIcon(b.type)}</span>
      <span class="layer-name">${escHtml(capitalize(b.type))}</span>
      <span class="layer-num">${i+1}</span>
      <div class="layer-actions">
        <button class="layer-act-btn" onclick="event.stopPropagation();moveBlock('${b.id}',-1)" title="Up">↑</button>
        <button class="layer-act-btn" onclick="event.stopPropagation();moveBlock('${b.id}',1)"  title="Down">↓</button>
        <button class="layer-act-btn" onclick="event.stopPropagation();duplicateBlock('${b.id}')" title="Duplicate">⧉</button>
        <button class="layer-act-btn" onclick="event.stopPropagation();deleteBlock('${b.id}')" title="Delete" style="color:var(--danger)">✕</button>
      </div>
    </div>`).join('');
}

function _renderAssetsTab(container) {
  const quickAddTypes = ['navbar','hero','section','feature','testimonial','pricing','cta','footer'];
  container.innerHTML = `
    <div class="blk-cat">
      <div class="blk-cat-label">Color Themes</div>
      <div class="theme-grid">
        ${THEMES.map(t => `
          <div class="theme-card" onclick="applyTheme('${t.id}')" title="Apply ${escHtml(t.name)} theme" role="button" tabindex="0">
            <div class="theme-preview" style="background:${t.preview}"></div>
            <div class="theme-name">${escHtml(t.name)}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="blk-cat">
      <div class="blk-cat-label">Canvas Settings</div>
      <div class="prop-row">
        <label class="prop-label" for="darkCanvasToggle">Background</label>
        <div class="toggle ${state.darkCanvas?'on':''}" id="darkCanvasToggle"
          onclick="toggleDarkCanvas(this)" role="switch" aria-checked="${state.darkCanvas}"></div>
        <span class="toggle-label">${state.darkCanvas?'Dark':'Light'}</span>
      </div>
    </div>
    <div class="blk-cat">
      <div class="blk-cat-label">Quick Add</div>
      <div style="display:flex;flex-direction:column;gap:3px">
        ${quickAddTypes.map(t => `
          <button onclick="addBlock('${t}')"
            style="height:28px;padding:0 10px;border-radius:var(--r-sm);background:var(--bg-3);border:1px solid var(--border);color:var(--text-2);font-size:11px;font-weight:600;text-align:left;display:flex;align-items:center;gap:7px;cursor:pointer;transition:all .15s ease;width:100%"
            onmouseover="this.style.background='var(--bg-4)';this.style.color='var(--text)'"
            onmouseout="this.style.background='var(--bg-3)';this.style.color='var(--text-2)'"
            aria-label="Add ${capitalize(t)} block">
            <span aria-hidden="true">${getBlockIcon(t)}</span> Add ${capitalize(t)}
          </button>`).join('')}
      </div>
    </div>`;
}

function switchSidebarTab(tab, btn) {
  state.sidebarTab = tab;
  document.querySelectorAll('.sb-tab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
  btn.classList.add('active'); btn.setAttribute('aria-selected','true');
  renderSidebar();
}

function filterBlocks(query) { state.searchQuery = query; renderSidebar(); }

function toggleDarkCanvas(el) {
  state.darkCanvas = !state.darkCanvas;
  el.classList.toggle('on', state.darkCanvas);
  el.setAttribute('aria-checked', String(state.darkCanvas));
  el.nextElementSibling.textContent = state.darkCanvas ? 'Dark' : 'Light';
  const frame = document.getElementById('canvasFrame');
  if (frame) frame.style.background = state.darkCanvas ? '#111' : '#fff';
}

/* ============================================================
   §7  DRAG & DROP
============================================================ */
function onBlockDragStart(e, type) {
  state.dragType = type;
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('text/plain', type);
  e.currentTarget.classList.add('dragging');
  requestAnimationFrame(() => e.currentTarget.classList.remove('dragging'));
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  document.querySelectorAll('.drop-zone').forEach(z => z.classList.add('drag-over'));
}

function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over'));
  }
}

function onDrop(e) {
  e.preventDefault();
  document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over'));
  const type = state.dragType || e.dataTransfer.getData('text/plain');
  if (type) { addBlock(type); state.dragType = null; }
}

/* ============================================================
   §8  CANVAS MODE & ZOOM
============================================================ */
function setMode(mode, btn) {
  state.mode = mode;
  document.querySelectorAll('.prev-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const frame = document.getElementById('canvasFrame');
  if (frame) {
    frame.className = `canvas-frame mode-${mode}`;
    if (state.darkCanvas) frame.style.background = '#111';
  }
  const lbl = document.getElementById('canvasLabel');
  if (lbl) lbl.textContent = MODE_META[mode]?.label || mode;
  zoom(0);
}

/**
 * Switches the editor mode.
 * - 'design': normal editing mode
 * - 'code':   opens export modal (modal, not persistent)
 * - 'preview': handled by openPreview() called directly from the button
 */
function switchEditorMode(mode, btn) {
  if (mode === 'code') {
    // Code is modal — open export, do NOT change persistent editorMode
    openExport();
    exportAs('html');
    return;
  }
  state.editorMode = mode;
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function zoom(delta) {
  state.zoom = delta === 0 ? 100 : Math.max(25, Math.min(200, state.zoom + delta));
  const frame = document.getElementById('canvasFrame');
  if (frame) {
    frame.style.transform       = state.zoom === 100 ? '' : `scale(${state.zoom/100})`;
    frame.style.transformOrigin = 'top center';
  }
  const zv = document.getElementById('zoomVal');
  if (zv) zv.textContent = state.zoom + '%';
}

/* ============================================================
   §9  PREVIEW MODE
   ─────────────────────────────────────────────────────────
   Root causes of the broken preview (all fixed here):

   BUG 1 — doc.write() fails silently on sandboxed iframes
     Firefox and Safari refuse doc.write() on a sandboxed iframe
     that has no src. The call succeeds but the document stays blank.
     FIX: Use iframe.srcdoc — the W3C-correct method. srcdoc does
     not require allow-same-origin and works in all modern browsers.

   BUG 2 — <link rel="stylesheet"> blocked by sandbox
     Sandboxed iframes block external <link> tags in Firefox/Safari.
     FIX: Load fonts via @import inside <style> — permitted because
     it is treated as part of the document's own stylesheet.

   BUG 3 — iframe height collapses to 0px
     The iframe has no explicit height; flex:1 on the wrapper can
     collapse it before content loads.
     FIX: Set minHeight:400px immediately, then auto-resize on load.

   BUG 4 — Re-opening shows stale content
     doc.write() on an already-loaded iframe can fail silently.
     FIX: srcdoc assignment always triggers a fresh navigation.

   BUG 5 — sandbox="allow-same-origin" security risk
     Combining allow-scripts + allow-same-origin lets the iframe
     access the parent document. Removed allow-same-origin in HTML.

   BUG 6 — switchEditorMode('preview') caused button state conflict
     The Preview seg-btn called switchEditorMode which set editorMode
     to 'preview' and then tried to call openPreview() — but the
     button state was wrong on close.
     FIX: Preview button calls openPreview() directly, bypassing
     switchEditorMode entirely.
============================================================ */

/**
 * Opens the full-screen preview overlay and renders the current canvas.
 */
function openPreview() {
  if (state.blocks.length === 0) {
    toast('Add some blocks first!', 'info');
    return;
  }

  state.previewOpen = true;

  const overlay = document.getElementById('previewOverlay');
  const iframe  = document.getElementById('previewFrame');
  if (!overlay || !iframe) {
    console.error('[BlockForge] previewOverlay or previewFrame not found in DOM');
    return;
  }

  // Build the complete HTML string from current canvas blocks
  const blocksHtml = state.blocks
    .map(b => { const r = BLOCK_RENDERERS[b.type]; return r ? r(b.data || {}) : ''; })
    .join('\n');

  const html = _buildPreviewDocument(blocksHtml);

  // ── srcdoc: the correct W3C method for sandboxed iframes ──────────────
  // Does NOT require allow-same-origin. Works in Chrome 20+, Firefox 25+,
  // Safari 6+, Edge 12+. Each assignment triggers a fresh navigation.
  iframe.removeAttribute('src');   // clear any previous src
  iframe.srcdoc = html;            // triggers a clean, fresh navigation

  // ── Ensure iframe is visible before content loads ─────────────────────
  iframe.style.minHeight = '400px';
  iframe.style.height    = '100%';

  // After load: expand to full content height for correct scrolling
  iframe.onload = () => {
    try {
      const body = iframe.contentDocument?.body;
      if (body) iframe.style.height = Math.max(400, body.scrollHeight) + 'px';
    } catch (_) { /* sandboxed — safe to ignore */ }
    iframe.onload = null;
  };

  // Update the fake URL bar label
  const modeLabel = document.getElementById('previewModeLabel');
  if (modeLabel) modeLabel.textContent = MODE_META[state.mode]?.label || 'Page';

  // Show the overlay
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/**
 * Closes the preview overlay and resets the iframe to a blank state
 * so the next openPreview() always gets a clean document.
 */
function closePreview() {
  state.previewOpen = false;
  document.getElementById('previewOverlay')?.classList.remove('open');
  document.body.style.overflow = '';

  const iframe = document.getElementById('previewFrame');
  if (iframe) {
    // Reset to blank — ensures next openPreview() starts fresh
    iframe.srcdoc          = '';
    iframe.style.height    = '';
    iframe.style.minHeight = '';
  }
}

/**
 * Switches the preview device viewport.
 * @param {'desktop'|'tablet'|'mobile'} device
 * @param {HTMLElement} btn
 */
function setPreviewDevice(device, btn) {
  document.querySelectorAll('.pv-device-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const wrap  = document.getElementById('previewFrameWrap');
  const frame = document.getElementById('previewFrame');
  if (!wrap || !frame) return;

  wrap.className        = 'preview-frame-wrap' + (device !== 'desktop' ? ' ' + device : '');
  frame.style.height    = '100%';
  frame.style.minHeight = '400px';
}

/**
 * Builds the complete HTML document string for the preview iframe.
 *
 * Fonts: @import inside <style> — NOT <link rel="stylesheet">.
 * Sandboxed iframes block external <link> tags in Firefox and Safari,
 * but @import inside a <style> block is permitted as part of the
 * document's own stylesheet.
 *
 * @private
 * @param {string} blocksHtml  Concatenated block HTML
 * @returns {string}
 */
function _buildPreviewDocument(blocksHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview — ${escHtml(MODE_META[state.mode]?.label || 'Page')}</title>
  <style>
    /* @import works in sandboxed iframes; <link rel="stylesheet"> does not */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@400;700;900&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #fff; }
    a { transition: opacity .2s; }
    a:hover { opacity: .85; }
    img { max-width: 100%; height: auto; }
    @media (max-width: 768px) {
      [style*="grid-template-columns: repeat(4"] { grid-template-columns: repeat(2,1fr) !important; }
      [style*="grid-template-columns: 1fr 1fr 1fr"] { grid-template-columns: 1fr 1fr !important; }
      [style*="grid-template-columns: 2fr 1fr 1fr 1fr"] { grid-template-columns: 1fr 1fr !important; }
      [style*="font-size:52px"],[style*="font-size: 52px"] { font-size: 32px !important; }
      [style*="font-size:44px"],[style*="font-size: 44px"] { font-size: 28px !important; }
      [style*="font-size:40px"],[style*="font-size: 40px"] { font-size: 26px !important; }
      nav { flex-wrap: wrap !important; height: auto !important; padding: 12px 20px !important; }
      footer > div { grid-template-columns: 1fr 1fr !important; }
    }
    @media (max-width: 480px) {
      [style*="padding:80px"],[style*="padding: 80px"] { padding: 40px 20px !important; }
      [style*="padding:60px"],[style*="padding: 60px"] { padding: 32px 20px !important; }
      [style*="padding:48px"],[style*="padding: 48px"] { padding: 28px 20px !important; }
    }
  </style>
</head>
<body>${blocksHtml}</body>
</html>`;
}

/* ============================================================
   §10  THEME
============================================================ */
function applyTheme(themeId) {
  const theme = THEMES.find(t => t.id === themeId);
  if (!theme) return;
  state.blocks.forEach(block => {
    if (['hero','cta','newsletter'].includes(block.type)) {
      if (!block.data.bg || block.data.bg.includes('gradient')) block.data.bg = theme.preview;
    }
    if (block.type === 'navbar')  block.data.ctaBg    = theme.primary;
    if (block.type === 'button')  block.data.color     = theme.primary;
    if (block.type === 'stats')   block.data.valColor  = theme.primary;
    if (block.type === 'pricing' && block.data.featured) block.data.bg = theme.preview;
  });
  snapshot(); renderCanvas();
  toast(`Theme "${theme.name}" applied`, 'success');
}

/* ============================================================
   §11  TEMPLATES
============================================================ */
function renderTemplateGrid() {
  const grid = document.getElementById('templateGrid');
  if (!grid) return;
  grid.innerHTML = TEMPLATES.map(t => `
    <div class="tpl-card" onclick="loadTemplate('${t.id}')" role="button" tabindex="0"
         aria-label="Load ${escHtml(t.name)} template">
      <div class="tpl-thumb" style="background:${t.color}" aria-hidden="true">${t.icon}</div>
      <div class="tpl-info">
        <div class="tpl-name">${escHtml(t.name)}</div>
        <div class="tpl-desc">${escHtml(t.desc)}</div>
        <div class="tpl-blocks">${t.blocks.length} blocks</div>
      </div>
    </div>`).join('');
}

function loadTemplate(id) {
  const tpl = TEMPLATES.find(t => t.id === id);
  if (!tpl) return;
  if (state.blocks.length > 0 && !confirm('Replace current canvas with this template?')) return;
  state.blocks = tpl.blocks.map(b => ({ id:uid(), type:b.type, data:JSON.parse(JSON.stringify(b.data||{})) }));
  state.selected = null;
  snapshot(); renderCanvas(); renderProps(); renderSidebar();
  closeModal('templatesModal');
  toast(`"${tpl.name}" loaded — ${tpl.blocks.length} blocks`, 'success');
}

function openTemplates() { openModal('templatesModal'); }

/* ============================================================
   §12  EXPORT
============================================================ */
function openExport() {
  const el = document.getElementById('exportCode');
  if (el) el.textContent = '// Click HTML or JSON to generate export code';
  openModal('exportModal');
}

function exportAs(format) {
  let output = '';
  if (format === 'html') {
    const blocksHtml = state.blocks.map(b => { const r=BLOCK_RENDERERS[b.type]; return r?r(b.data||{}):''; }).join('\n');
    output = _buildExportDocument(blocksHtml);
  } else {
    output = JSON.stringify({ version:'5.1', mode:state.mode, blocks:state.blocks }, null, 2);
  }
  const el = document.getElementById('exportCode');
  if (el) el.textContent = output;
  toast(`${format.toUpperCase()} export ready`, 'success');
}

function _buildExportDocument(blocksHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exported Page</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: 'Inter', system-ui, sans-serif; }
    a { transition: opacity .2s; }
    a:hover { opacity: .85; }
    img { max-width: 100%; height: auto; }
    @media (max-width: 768px) {
      [style*="grid-template-columns: repeat(4"] { grid-template-columns: repeat(2,1fr) !important; }
      [style*="grid-template-columns: 1fr 1fr 1fr"] { grid-template-columns: 1fr 1fr !important; }
      [style*="grid-template-columns: 2fr 1fr 1fr 1fr"] { grid-template-columns: 1fr 1fr !important; }
      [style*="font-size:52px"],[style*="font-size: 52px"] { font-size: 32px !important; }
      nav { flex-wrap: wrap !important; height: auto !important; padding: 12px 20px !important; }
    }
  </style>
</head>
<body>
${blocksHtml}
</body>
</html>`;
}

function copyExport() {
  const code = document.getElementById('exportCode')?.textContent;
  if (!code || code.startsWith('//')) { toast('Generate export first', 'info'); return; }
  navigator.clipboard.writeText(code)
    .then(() => toast('Copied!', 'success'))
    .catch(() => toast('Copy failed — select and copy manually', 'error'));
}

function downloadExport() {
  const code = document.getElementById('exportCode')?.textContent;
  if (!code || code.startsWith('//')) { toast('Generate export first', 'info'); return; }
  const isJson = code.trim().startsWith('{');
  const blob   = new Blob([code], { type: isJson ? 'application/json' : 'text/html' });
  const url    = URL.createObjectURL(blob);
  const a      = Object.assign(document.createElement('a'), { href:url, download: isJson?'blockforge.json':'blockforge.html' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Downloaded!', 'success');
}

/* ============================================================
   §13  PERSISTENCE
============================================================ */
function saveProject() {
  try {
    localStorage.setItem(STORAGE_KEYS.project, JSON.stringify({ version:'5.1', mode:state.mode, blocks:state.blocks, savedAt:new Date().toISOString() }));
    _setAutosaveStatus('saved');
    toast('Project saved', 'success');
  } catch(e) {
    console.error('[BlockForge] Save failed:', e);
    toast('Save failed — storage may be full', 'error');
  }
}

function loadProject() {
  const raw = _readStorage();
  if (!raw) { toast('No saved project found', 'info'); return; }
  try {
    const data = JSON.parse(raw);
    state.blocks = (data.blocks||[]).map(b => ({ ...b, id:b.id||uid() }));
    state.selected = null;
    snapshot(); renderCanvas(); renderProps(); renderSidebar();
    toast('Project loaded', 'success');
  } catch(e) {
    console.error('[BlockForge] Load failed:', e);
    toast('Failed to load project', 'error');
  }
}

function _loadFromStorage() {
  const raw = _readStorage();
  if (raw) {
    try {
      const data = JSON.parse(raw);
      state.blocks = (data.blocks||[]).map(b => ({ ...b, id:b.id||uid() }));
    } catch(e) { console.warn('[BlockForge] Could not restore session:', e); }
  }
  snapshot(); renderCanvas(); renderSidebar(); _syncHistoryButtons();
}

function _readStorage() {
  const primary = localStorage.getItem(STORAGE_KEYS.project);
  if (primary) return primary;
  for (const key of STORAGE_KEYS.legacy) {
    const val = localStorage.getItem(key);
    if (val) return val;
  }
  return null;
}

function startAutoSave() {
  setInterval(() => {
    if (state.blocks.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEYS.autosave, JSON.stringify({ blocks:state.blocks, savedAt:new Date().toISOString() }));
      _setAutosaveStatus('saved');
    } catch(e) { console.warn('[BlockForge] Auto-save failed:', e); }
  }, 30_000);
}

function _setAutosaveStatus(status) {
  const dot = document.getElementById('autosaveDot');
  const lbl = document.getElementById('autosaveLabel');
  if (!dot || !lbl) return;
  const states = { saved:{cls:'autosave-dot saved',text:'Saved'}, saving:{cls:'autosave-dot saving',text:'Saving…'}, unsaved:{cls:'autosave-dot',text:'Unsaved'} };
  const s = states[status] || states.unsaved;
  dot.className = s.cls; lbl.textContent = s.text;
  if (status === 'saved') setTimeout(() => { dot.className='autosave-dot'; lbl.textContent='Auto-save on'; }, 3000);
}

/* ============================================================
   §14  MODALS & TOASTS
============================================================ */
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function toast(msg, type = 'info') {
  const ICONS = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role','status');
  el.innerHTML = `<span class="toast-icon" aria-hidden="true">${ICONS[type]||'ℹ️'}</span><span class="toast-msg">${escHtml(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(12px)'; setTimeout(()=>el.remove(),320); }, 2700);
}

/* ============================================================
   §15  KEYBOARD SHORTCUTS
============================================================ */
function _setupKeyboard() {
  document.addEventListener('keydown', e => {
    const tag  = document.activeElement?.tagName;
    const ctrl = e.ctrlKey || e.metaKey;
    if (['INPUT','TEXTAREA','SELECT'].includes(tag)) return;

    if (ctrl && e.key==='z')                          { e.preventDefault(); undo(); }
    if (ctrl && (e.key==='y'||(e.shiftKey&&e.key==='Z'))) { e.preventDefault(); redo(); }
    if (ctrl && e.key==='s')                          { e.preventDefault(); saveProject(); }
    if (ctrl && e.key==='d' && state.selected)        { e.preventDefault(); duplicateBlock(state.selected); }
    if ((e.key==='Delete'||e.key==='Backspace') && state.selected) { deleteBlock(state.selected); }
    if (e.key==='ArrowUp'   && state.selected)        { e.preventDefault(); moveBlock(state.selected,-1); }
    if (e.key==='ArrowDown' && state.selected)        { e.preventDefault(); moveBlock(state.selected, 1); }
    if (e.key==='Tab' && state.selected)              { e.preventDefault(); navigateBlock(e.shiftKey?-1:1); }
    if (ctrl && (e.key==='+'||e.key==='='))           { e.preventDefault(); zoom(10); }
    if (ctrl && e.key==='-')                          { e.preventDefault(); zoom(-10); }
    if (ctrl && e.key==='0')                          { e.preventDefault(); zoom(0); }
    if (ctrl && e.key==='p')                          { e.preventDefault(); openPreview(); }
    if (ctrl && e.key==='t')                          { e.preventDefault(); openTemplates(); }
    if (e.key==='Escape') {
      if (state.previewOpen) { closePreview(); return; }
      const openModalEl = document.querySelector('.modal-overlay.open');
      if (openModalEl) { openModalEl.classList.remove('open'); return; }
      if (state.selected) {
        state.selected = null;
        document.querySelectorAll('.block-wrapper').forEach(el => el.classList.remove('selected'));
        renderProps();
      }
    }
  });
}

/* ============================================================
   §16  UTILITIES
============================================================ */
function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g,' ');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function toHex(val) {
  if (!val) return '#6366f1';
  const v = String(val).trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v.length===4?'#'+v[1]+v[1]+v[2]+v[2]+v[3]+v[3]:v.slice(0,7);
  return '#6366f1';
}

function getBlockIcon(type) {
  const m = {
    hero:'🦸',section:'📦',heading:'H',paragraph:'¶',button:'🔘',card:'🃏',image:'🖼️',video:'🎬',
    navbar:'🧭',footer:'🦶',form:'📋',newsletter:'📧',stats:'📈',testimonial:'💬',pricing:'💰',
    feature:'✨',cta:'📣',banner:'🎯',divider:'➖',spacer:'↕️',quote:'❝',list:'📋',badge:'🏷️',
    code:'</>',table:'📊',avatar:'👤',gallery:'🖼️',logo:'🔷','icon-block':'⭐',
    'two-col':'⬛','three-col':'▦','four-col':'⊞',container:'🗃️',accordion:'🪗',tabs:'📑',
    alert:'⚠️','badge-group':'🏷️',timeline:'⏱️',breadcrumb:'🍞',pagination:'📄',
    search:'🔍','input-field':'✏️',countdown:'⏰',social:'🌐',progress:'📊',
  };
  return m[type] || '🧱';
}

/* ============================================================
   §17  INIT
============================================================ */
function init() {
  _loadFromStorage();
  renderSidebar();
  renderTemplateGrid();
  _setupKeyboard();
  startAutoSave();
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target===overlay) overlay.classList.remove('open'); });
  });
}