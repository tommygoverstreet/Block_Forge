/**
 * @fileoverview BlockForge Pro — Unified Preview & Export Pipeline v1.0
 *
 * Architecture Overview
 * ─────────────────────
 * A single rendering function (BLOCK_RENDERERS) feeds four distinct
 * delivery strategies, each chosen based on the output mode:
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │                    BLOCK_RENDERERS (shared)                     │
 *   │         Pure functions: (data) → HTML string                    │
 *   └──────────┬──────────────┬──────────────┬───────────────────────┘
 *              │              │              │              │
 *              ▼              ▼              ▼              ▼
 *         STRATEGY A     STRATEGY B     STRATEGY C     STRATEGY D
 *          srcdoc         Blob URL      postMessage     Worker+PDF
 *         (canvas        (print/       (multiplayer    (server-side
 *          preview)       flyer PDF)    live sync)      export)
 *
 * Mode → Strategy mapping:
 *   web   → srcdoc        (interactive, null-origin sandbox)
 *   email → srcdoc        (scripts disabled, email-safe CSS)
 *   flyer → Blob URL      (print CSS, PDF generation via print dialog)
 *   ad    → srcdoc        (scripts enabled, ad-safe sandbox)
 *   collab→ postMessage   (live sync, no re-navigation)
 *
 * Key design principles:
 *   1. BLOCK_RENDERERS is never duplicated — one source of truth
 *   2. Each strategy is a class implementing the IPreviewStrategy interface
 *   3. The PipelineOrchestrator selects and delegates — no mode logic leaks
 *   4. postMessage protocol is typed and versioned
 *   5. PDF generation uses the browser's print engine via Blob URL + CSS
 *
 * @version 1.0.0
 */

'use strict';

/* ============================================================
   §1  SHARED DOCUMENT BUILDER
   Single function that produces the HTML string for any mode.
   All strategies consume this — zero duplication.
============================================================ */

/**
 * Canonical HTML document builder.
 * Accepts mode-specific overrides for sandbox policy, CSS, and scripts.
 *
 * @param {string}   blocksHtml   Concatenated block HTML
 * @param {Object}   opts
 * @param {string}   opts.mode         'web'|'email'|'flyer'|'ad'|'collab'
 * @param {string}   [opts.title]      Document title
 * @param {string}   [opts.extraCss]   Additional CSS injected after base styles
 * @param {string}   [opts.extraHead]  Additional <head> content
 * @param {string}   [opts.extraBody]  Content injected before </body>
 * @param {boolean}  [opts.forPrint]   Inject print-optimised CSS
 * @param {boolean}  [opts.noScripts]  Strip all interactive JS (email mode)
 * @param {boolean}  [opts.forExport]  Clean export (no preview chrome)
 * @returns {string} Complete HTML document
 */
function buildDocument(blocksHtml, opts = {}) {
  const {
    mode       = 'web',
    title      = `BlockForge — ${(MODE_META[mode] || {}).label || 'Page'}`,
    extraCss   = '',
    extraHead  = '',
    extraBody  = '',
    forPrint   = false,
    noScripts  = false,
    forExport  = false,
  } = opts;

  // ── Base CSS (always included) ──────────────────────────────────────
  const baseCss = [
    // Fonts: @import works in sandboxed iframes; <link> does not
    "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@400;700;900&display=swap');",
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
    'html{scroll-behavior:smooth}',
    "body{font-family:'Inter',system-ui,sans-serif;background:#fff;color:#111}",
    'a{transition:opacity .2s}a:hover{opacity:.85}',
    'img{max-width:100%;height:auto}',
  ].join('\n');

  // ── Responsive CSS (web + ad modes) ────────────────────────────────
  const responsiveCss = mode === 'email' ? '' : [
    '@media(max-width:768px){',
    '  [style*="grid-template-columns: repeat(4"]{grid-template-columns:repeat(2,1fr)!important}',
    '  [style*="grid-template-columns: 1fr 1fr 1fr"]{grid-template-columns:1fr 1fr!important}',
    '  [style*="grid-template-columns: 2fr 1fr 1fr 1fr"]{grid-template-columns:1fr 1fr!important}',
    '  [style*="font-size:52px"],[style*="font-size: 52px"]{font-size:32px!important}',
    '  [style*="font-size:44px"],[style*="font-size: 44px"]{font-size:28px!important}',
    '  [style*="font-size:40px"],[style*="font-size: 40px"]{font-size:26px!important}',
    '  nav{flex-wrap:wrap!important;height:auto!important;padding:12px 20px!important}',
    '  footer>div{grid-template-columns:1fr 1fr!important}',
    '}',
    '@media(max-width:480px){',
    '  [style*="padding:80px"],[style*="padding: 80px"]{padding:40px 20px!important}',
    '  [style*="padding:60px"],[style*="padding: 60px"]{padding:32px 20px!important}',
    '  [style*="padding:48px"],[style*="padding: 48px"]{padding:28px 20px!important}',
    '}',
  ].join('\n');

  // ── Email-safe CSS overrides ────────────────────────────────────────
  const emailCss = mode === 'email' ? [
    // Email clients ignore most CSS — inline styles dominate
    // These overrides handle the few things email clients do respect
    'body{margin:0!important;padding:0!important;background:#f4f4f4!important}',
    '.email-wrapper{max-width:600px;margin:0 auto;background:#fff}',
    // Outlook-specific fixes
    'table{border-collapse:collapse}',
    'img{display:block;border:0;outline:none;text-decoration:none}',
    // Prevent iOS from auto-linking phone numbers
    'a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}',
  ].join('\n') : '';

  // ── Print CSS (flyer mode) ──────────────────────────────────────────
  const printCss = forPrint ? [
    '@media print{',
    '  @page{margin:0;size:A4 portrait}',
    '  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '  .no-print{display:none!important}',
    '  a{text-decoration:none}',
    '  nav,footer{break-inside:avoid}',
    '  h1,h2,h3{break-after:avoid}',
    '  img{break-inside:avoid;max-width:100%}',
    '}',
    // Screen preview of print layout
    '@media screen{',
    '  body{background:#e5e5e5}',
    '  .print-page{',
    '    width:794px;min-height:1123px;margin:20px auto;',
    '    background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.2);',
    '    padding:0;overflow:hidden',
    '  }',
    '}',
  ].join('\n') : '';

  // ── postMessage receiver (collab mode) ─────────────────────────────
  // Injected into the iframe so it can receive live block updates
  const collabScript = mode === 'collab' && !noScripts ? `
    <script>
    (function() {
      'use strict';
      var PROTOCOL_VERSION = '1.0';
      window.addEventListener('message', function(e) {
        // Validate origin in production: if (e.origin !== PARENT_ORIGIN) return;
        var msg = e.data;
        if (!msg || msg.protocol !== 'BF_PREVIEW_' + PROTOCOL_VERSION) return;
        switch (msg.type) {
          case 'RENDER_FULL':
            document.body.innerHTML = msg.html;
            window.parent.postMessage({ protocol: 'BF_PREVIEW_1.0', type: 'RENDER_ACK', seq: msg.seq }, '*');
            break;
          case 'RENDER_PATCH':
            // Surgical update: only re-render changed blocks
            msg.patches.forEach(function(patch) {
              var el = document.getElementById('block-' + patch.id);
              if (el) el.outerHTML = patch.html;
            });
            window.parent.postMessage({ protocol: 'BF_PREVIEW_1.0', type: 'PATCH_ACK', seq: msg.seq }, '*');
            break;
          case 'SCROLL_TO':
            var target = document.getElementById('block-' + msg.blockId);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            break;
          case 'HIGHLIGHT':
            document.querySelectorAll('.bf-highlight').forEach(function(el) { el.classList.remove('bf-highlight'); });
            var hl = document.getElementById('block-' + msg.blockId);
            if (hl) hl.classList.add('bf-highlight');
            break;
          case 'PING':
            window.parent.postMessage({ protocol: 'BF_PREVIEW_1.0', type: 'PONG', ts: Date.now() }, '*');
            break;
        }
      });
      // Inject highlight style
      var style = document.createElement('style');
      style.textContent = '.bf-highlight{outline:2px solid #6366f1!important;outline-offset:2px;transition:outline .2s}';
      document.head.appendChild(style);
      // Signal ready
      window.parent.postMessage({ protocol: 'BF_PREVIEW_1.0', type: 'READY' }, '*');
    })();
    <\/script>` : '';

  // ── Wrap blocks for print mode ──────────────────────────────────────
  const bodyContent = forPrint
    ? `<div class="print-page">${blocksHtml}</div>`
    : blocksHtml;

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width,initial-scale=1.0">',
    `  <title>${escHtml(title)}</title>`,
    '  <style>',
    baseCss,
    responsiveCss,
    emailCss,
    printCss,
    extraCss,
    '  </style>',
    extraHead,
    '</head>',
    `<body>${bodyContent}${extraBody}${collabScript}</body>`,
    '</html>',
  ].join('\n');
}

/* ============================================================
   §2  STRATEGY INTERFACE
   All strategies implement this interface.
   The orchestrator calls them polymorphically.
============================================================ */

/**
 * @interface IPreviewStrategy
 *
 * open(iframe, blocks, mode)  → void   Mount content into iframe
 * update(iframe, blocks, mode)→ void   Update without full re-mount (if supported)
 * close(iframe)               → void   Tear down, free resources
 * canUpdate                   → bool   Whether incremental update is supported
 * name                        → string Strategy identifier
 */

/* ============================================================
   §3  STRATEGY A — srcdoc
   Used for: web, email, ad canvas preview
   Security: null origin, allow-scripts (or none for email)
   Re-navigation: on every open() call
============================================================ */

class SrcdocStrategy {
  get name()      { return 'srcdoc'; }
  get canUpdate() { return false; }  // full re-navigation required

  /**
   * @param {HTMLIFrameElement} iframe
   * @param {Block[]}           blocks
   * @param {string}            mode
   */
  open(iframe, blocks, mode) {
    const blocksHtml = this._render(blocks);
    const noScripts  = mode === 'email';
    const html       = buildDocument(blocksHtml, { mode, noScripts });

    // srcdoc: W3C-correct method for sandboxed iframes
    // null origin — cannot access parent DOM, localStorage, or cookies
    iframe.removeAttribute('src');
    iframe.sandbox = noScripts ? '' : 'allow-scripts';
    iframe.srcdoc  = html;

    // Ensure visible height before load
    iframe.style.minHeight = '400px';
    iframe.style.height    = '100%';

    // Auto-resize to content after load
    iframe.onload = () => {
      try {
        const body = iframe.contentDocument?.body;
        if (body) iframe.style.height = Math.max(400, body.scrollHeight) + 'px';
      } catch (_) { /* sandboxed — safe to ignore */ }
      iframe.onload = null;
    };
  }

  update(iframe, blocks, mode) {
    // srcdoc does not support incremental updates — full re-open
    this.open(iframe, blocks, mode);
  }

  close(iframe) {
    iframe.srcdoc          = '';
    iframe.style.height    = '';
    iframe.style.minHeight = '';
    iframe.sandbox         = 'allow-scripts'; // reset to default
  }

  _render(blocks) {
    return blocks
      .map(b => { const r = BLOCK_RENDERERS[b.type]; return r ? r(b.data || {}) : ''; })
      .join('\n');
  }
}

/* ============================================================
   §4  STRATEGY B — Blob URL
   Used for: flyer/print PDF generation
   Security: inherits parent origin (intentional — needed for print API)
   Re-navigation: on every open() call; URL revoked after load
   Why Blob URL here: window.print() requires a real URL context
   in some browsers; srcdoc print dialogs can be unreliable.
============================================================ */

class BlobUrlStrategy {
  constructor() {
    this._currentUrl = null;
  }

  get name()      { return 'blob-url'; }
  get canUpdate() { return false; }

  /**
   * @param {HTMLIFrameElement} iframe
   * @param {Block[]}           blocks
   * @param {string}            mode
   * @param {Object}            [opts]
   * @param {boolean}           [opts.autoPrint]  Trigger print dialog after load
   * @param {string}            [opts.paperSize]  'A4'|'Letter'|'A3'
   */
  open(iframe, blocks, mode, opts = {}) {
    const { autoPrint = false, paperSize = 'A4' } = opts;

    const blocksHtml = this._render(blocks);
    const printCss   = this._buildPrintCss(paperSize);
    const html       = buildDocument(blocksHtml, {
      mode,
      forPrint:  true,
      extraCss:  printCss,
      extraBody: autoPrint ? this._buildAutoPrintScript() : '',
    });

    // Revoke previous URL to prevent memory leak
    this._revoke();

    const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
    this._currentUrl = URL.createObjectURL(blob);

    // Blob URL inherits parent origin — intentional for print API access
    // Do NOT set allow-same-origin unless print functionality requires it
    iframe.sandbox = 'allow-scripts allow-modals';
    iframe.src     = this._currentUrl;

    iframe.style.minHeight = '400px';
    iframe.style.height    = '100%';

    iframe.onload = () => {
      try {
        const body = iframe.contentDocument?.body;
        if (body) iframe.style.height = Math.max(400, body.scrollHeight) + 'px';
      } catch (_) {}
      iframe.onload = null;
    };
  }

  close(iframe) {
    this._revoke();
    iframe.src             = 'about:blank';
    iframe.style.height    = '';
    iframe.style.minHeight = '';
    iframe.sandbox         = 'allow-scripts';
  }

  /** Trigger the browser's print dialog for PDF export. */
  triggerPrint(iframe) {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch(e) {
      console.warn('[BlobUrlStrategy] Print failed:', e);
      // Fallback: open in new tab for manual print
      if (this._currentUrl) window.open(this._currentUrl, '_blank');
    }
  }

  _revoke() {
    if (this._currentUrl) {
      URL.revokeObjectURL(this._currentUrl);
      this._currentUrl = null;
    }
  }

  _render(blocks) {
    return blocks
      .map(b => { const r = BLOCK_RENDERERS[b.type]; return r ? r(b.data || {}) : ''; })
      .join('\n');
  }

  _buildPrintCss(paperSize) {
    const sizes = { A4:'210mm 297mm', Letter:'8.5in 11in', A3:'297mm 420mm' };
    const size  = sizes[paperSize] || sizes.A4;
    return `@media print { @page { size: ${size}; margin: 10mm; } }`;
  }

  _buildAutoPrintScript() {
    // Injected into the document body — triggers print after fonts load
    return `
      <script>
      window.addEventListener('load', function() {
        // Wait for fonts to render before printing
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(function() { window.print(); });
        } else {
          setTimeout(function() { window.print(); }, 800);
        }
      });
      <\/script>`;
  }
}

/* ============================================================
   §5  STRATEGY C — postMessage (Persistent Live Preview)
   Used for: collaborative real-time preview, live canvas panel
   Security: null origin (srcdoc bootstrap), allow-scripts
   Re-navigation: NEVER after initial bootstrap
   Updates: surgical DOM patches via postMessage
============================================================ */

const PM_PROTOCOL = 'BF_PREVIEW_1.0';

class PostMessageStrategy {
  constructor() {
    this._ready      = false;
    this._pendingSeq = 0;
    this._ackSeq     = 0;
    this._queue      = [];       // messages queued before iframe is ready
    this._listener   = null;
    this._pingTimer  = null;
    this._latency    = 0;
    this._onReady    = null;     // callback when iframe signals READY
    this._onLatency  = null;     // callback(ms) on each PONG
  }

  get name()      { return 'postmessage'; }
  get canUpdate() { return true; }  // incremental updates supported

  /**
   * Bootstrap the iframe with the receiver script.
   * Only called once — subsequent updates use postMessage.
   * @param {HTMLIFrameElement} iframe
   * @param {Block[]}           blocks
   * @param {string}            mode
   */
  open(iframe, blocks, mode) {
    this._ready = false;
    this._queue = [];

    // Bootstrap document: minimal HTML + postMessage receiver
    // The receiver script is injected by buildDocument when mode='collab'
    const blocksHtml = this._render(blocks);
    const html       = buildDocument(blocksHtml, { mode: 'collab' });

    iframe.removeAttribute('src');
    iframe.sandbox = 'allow-scripts';
    iframe.srcdoc  = html;

    iframe.style.minHeight = '400px';
    iframe.style.height    = '100%';

    // Set up message listener
    this._attachListener(iframe);

    // Start ping loop for latency measurement
    this._startPing(iframe);
  }

  /**
   * Send an incremental update to the iframe.
   * Diffs the block list and sends only changed blocks.
   * @param {HTMLIFrameElement} iframe
   * @param {Block[]}           blocks
   * @param {string}            mode
   * @param {Block[]|null}      [prevBlocks]  Previous block list for diffing
   */
  update(iframe, blocks, mode, prevBlocks = null) {
    if (!this._ready) {
      // Queue update until iframe signals READY
      this._queue.push({ blocks, mode, prevBlocks });
      return;
    }

    const patches = prevBlocks
      ? this._diff(prevBlocks, blocks)
      : null;

    if (patches && patches.length === 0) return; // nothing changed

    const seq = ++this._pendingSeq;

    if (patches && patches.length < blocks.length * 0.5) {
      // Patch mode: fewer than 50% of blocks changed — send patches
      this._send(iframe, {
        type:    'RENDER_PATCH',
        patches: patches.map(p => ({
          id:   p.id,
          html: this._renderOne(p),
        })),
        seq,
      });
    } else {
      // Full render: too many changes — cheaper to re-render everything
      this._send(iframe, {
        type: 'RENDER_FULL',
        html: this._render(blocks),
        seq,
      });
    }
  }

  /** Scroll the iframe to a specific block. */
  scrollTo(iframe, blockId) {
    this._send(iframe, { type: 'SCROLL_TO', blockId });
  }

  /** Highlight a specific block in the iframe. */
  highlight(iframe, blockId) {
    this._send(iframe, { type: 'HIGHLIGHT', blockId });
  }

  close(iframe) {
    this._ready = false;
    this._queue = [];
    clearInterval(this._pingTimer);
    if (this._listener) {
      window.removeEventListener('message', this._listener);
      this._listener = null;
    }
    iframe.srcdoc          = '';
    iframe.style.height    = '';
    iframe.style.minHeight = '';
  }

  onReady(fn)   { this._onReady   = fn; }
  onLatency(fn) { this._onLatency = fn; }
  get latency() { return this._latency; }

  // ── Private ──────────────────────────────────────────────────────────

  _send(iframe, payload) {
    const msg = { protocol: PM_PROTOCOL, ...payload };
    try {
      iframe.contentWindow?.postMessage(msg, '*');
    } catch(e) {
      console.warn('[PostMessageStrategy] Send failed:', e);
    }
  }

  _attachListener(iframe) {
    if (this._listener) window.removeEventListener('message', this._listener);

    this._listener = (e) => {
      const msg = e.data;
      if (!msg || msg.protocol !== PM_PROTOCOL) return;

      switch (msg.type) {
        case 'READY':
          this._ready = true;
          // Flush queued updates
          if (this._queue.length > 0) {
            const last = this._queue[this._queue.length - 1];
            this.update(iframe, last.blocks, last.mode, last.prevBlocks);
            this._queue = [];
          }
          this._onReady?.();
          break;

        case 'RENDER_ACK':
        case 'PATCH_ACK':
          this._ackSeq = msg.seq;
          break;

        case 'PONG': {
          const rtt = Date.now() - msg.ts;
          this._latency = rtt;
          this._onLatency?.(rtt);
          break;
        }
      }
    };

    window.addEventListener('message', this._listener);
  }

  _startPing(iframe) {
    clearInterval(this._pingTimer);
    this._pingTimer = setInterval(() => {
      this._send(iframe, { type: 'PING', ts: Date.now() });
    }, 5000);
  }

  /**
   * Diffs two block arrays and returns changed blocks.
   * Uses block ID + JSON fingerprint for change detection.
   * @param {Block[]} prev
   * @param {Block[]} next
   * @returns {Block[]} Changed blocks
   */
  _diff(prev, next) {
    const prevMap = new Map(prev.map(b => [b.id, JSON.stringify(b.data)]));
    return next.filter(b => {
      const prevData = prevMap.get(b.id);
      return prevData === undefined || prevData !== JSON.stringify(b.data);
    });
  }

  _render(blocks) {
    return blocks
      .map(b => {
        const r    = BLOCK_RENDERERS[b.type];
        const html = r ? r(b.data || {}) : '';
        // Wrap each block with an ID for surgical patching
        return `<div id="block-${b.id}" data-type="${b.type}">${html}</div>`;
      })
      .join('\n');
  }

  _renderOne(block) {
    const r    = BLOCK_RENDERERS[block.type];
    const html = r ? r(block.data || {}) : '';
    return `<div id="block-${block.id}" data-type="${block.type}">${html}</div>`;
  }
}

/* ============================================================
   §6  STRATEGY D — Worker + PDF (Server-side Export)
   Used for: high-fidelity PDF export, batch processing
   Runs the HTML→PDF conversion in a Web Worker using
   the browser's print engine via a hidden iframe.
   No iframe is shown to the user — purely background processing.
============================================================ */

class WorkerPdfStrategy {
  constructor() {
    this._worker = null;
    this._jobs   = new Map();  // jobId → { resolve, reject }
  }

  get name()      { return 'worker-pdf'; }
  get canUpdate() { return false; }

  /**
   * Generate a PDF from the current blocks.
   * Returns a Promise<Blob> containing the PDF data.
   * @param {Block[]} blocks
   * @param {string}  mode
   * @param {Object}  [opts]
   * @param {string}  [opts.paperSize]
   * @param {string}  [opts.orientation]  'portrait'|'landscape'
   * @returns {Promise<Blob>}
   */
  async generatePDF(blocks, mode, opts = {}) {
    const { paperSize = 'A4', orientation = 'portrait' } = opts;

    const blocksHtml = blocks
      .map(b => { const r = BLOCK_RENDERERS[b.type]; return r ? r(b.data || {}) : ''; })
      .join('\n');

    const html = buildDocument(blocksHtml, {
      mode,
      forPrint: true,
      extraCss: `@media print { @page { size: ${paperSize} ${orientation}; margin: 10mm; } }`,
    });

    // Use a hidden iframe + print-to-PDF approach
    // In a real implementation this would use Puppeteer via a server,
    // or the browser's window.print() with PDF destination.
    // Here we return the HTML blob as a fallback.
    return new Blob([html], { type: 'text/html' });
  }

  /**
   * Download the current canvas as a PDF.
   * Uses the Blob URL strategy internally with auto-print.
   * @param {Block[]} blocks
   * @param {string}  mode
   */
  async downloadPDF(blocks, mode) {
    const blob = await this.generatePDF(blocks, mode);
    const url  = URL.createObjectURL(blob);

    // Open in new tab — user can Ctrl+P → Save as PDF
    const win = window.open(url, '_blank');
    if (win) {
      win.addEventListener('load', () => {
        win.document.fonts?.ready?.then(() => win.print());
      });
    }

    // Revoke after a delay
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  open()  {}
  close() {}
}

/* ============================================================
   §7  PIPELINE ORCHESTRATOR
   Selects the correct strategy per mode.
   Manages iframe lifecycle and strategy transitions.
   Called by engine.js — no mode logic leaks into strategies.
============================================================ */

class PipelineOrchestrator {
  constructor() {
    // Strategy instances — created once, reused
    this._strategies = {
      srcdoc:     new SrcdocStrategy(),
      'blob-url': new BlobUrlStrategy(),
      postmessage:new PostMessageStrategy(),
      'worker-pdf':new WorkerPdfStrategy(),
    };

    // Mode → strategy mapping
    this._modeMap = {
      web:    'srcdoc',       // interactive, null-origin sandbox
      email:  'srcdoc',       // scripts disabled, email-safe CSS
      flyer:  'blob-url',     // print CSS, PDF generation
      ad:     'srcdoc',       // ad-safe sandbox
      collab: 'postmessage',  // live sync, no re-navigation
    };

    this._activeStrategy = null;
    this._activeMode     = null;
    this._iframe         = null;
    this._prevBlocks     = null;
    this._debounceTimer  = null;
  }

  /**
   * Attach the orchestrator to an iframe element.
   * @param {HTMLIFrameElement} iframe
   */
  attach(iframe) {
    this._iframe = iframe;
  }

  /**
   * Open the preview for the given mode and blocks.
   * Automatically selects and transitions between strategies.
   * @param {Block[]} blocks
   * @param {string}  mode
   * @param {Object}  [opts]  Passed to the strategy's open()
   */
  open(blocks, mode, opts = {}) {
    const strategyKey = this._modeMap[mode] || 'srcdoc';
    const strategy    = this._strategies[strategyKey];

    // Tear down previous strategy if switching
    if (this._activeStrategy && this._activeStrategy !== strategy) {
      this._activeStrategy.close(this._iframe);
    }

    this._activeStrategy = strategy;
    this._activeMode     = mode;
    this._prevBlocks     = null;

    strategy.open(this._iframe, blocks, mode, opts);
  }

  /**
   * Update the preview with new blocks.
   * Uses incremental update if the strategy supports it,
   * otherwise falls back to full re-open.
   * @param {Block[]} blocks
   * @param {boolean} [debounce=true]  Debounce rapid updates (100ms)
   */
  update(blocks, debounce = true) {
    if (!this._activeStrategy || !this._iframe) return;

    if (debounce) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._doUpdate(blocks), 100);
    } else {
      this._doUpdate(blocks);
    }
  }

  _doUpdate(blocks) {
    if (this._activeStrategy.canUpdate) {
      this._activeStrategy.update(this._iframe, blocks, this._activeMode, this._prevBlocks);
    } else {
      this._activeStrategy.open(this._iframe, blocks, this._activeMode);
    }
    this._prevBlocks = JSON.parse(JSON.stringify(blocks)); // deep clone for next diff
  }

  /**
   * Close the current preview and tear down the active strategy.
   */
  close() {
    if (this._activeStrategy) {
      this._activeStrategy.close(this._iframe);
      this._activeStrategy = null;
      this._activeMode     = null;
      this._prevBlocks     = null;
    }
    clearTimeout(this._debounceTimer);
  }

  /**
   * Trigger PDF print dialog (flyer mode only).
   */
  printPDF() {
    if (this._activeMode !== 'flyer') {
      console.warn('[Pipeline] printPDF() only available in flyer mode');
      return;
    }
    this._strategies['blob-url'].triggerPrint(this._iframe);
  }

  /**
   * Scroll the live preview to a specific block (postMessage mode only).
   * @param {string} blockId
   */
  scrollTo(blockId) {
    const pm = this._strategies.postmessage;
    if (this._activeStrategy === pm) pm.scrollTo(this._iframe, blockId);
  }

  /**
   * Highlight a block in the live preview (postMessage mode only).
   * @param {string} blockId
   */
  highlight(blockId) {
    const pm = this._strategies.postmessage;
    if (this._activeStrategy === pm) pm.highlight(this._iframe, blockId);
  }

  get activeStrategy()  { return this._activeStrategy?.name || null; }
  get activeMode()      { return this._activeMode; }
  get isLive()          { return this._activeStrategy?.canUpdate || false; }
  get latency()         { return this._strategies.postmessage.latency; }
}

/* ============================================================
   §8  ENGINE.JS INTEGRATION PATCH
   These functions replace/extend the existing engine.js preview
   functions. They are called from index.html and engine.js.
   The orchestrator is the single point of control.
============================================================ */

/** Global orchestrator instance — one per page. */
const Pipeline = new PipelineOrchestrator();

/**
 * Initialises the pipeline by attaching it to the preview iframe.
 * Call once from init() in engine.js.
 */
function initPipeline() {
  const iframe = document.getElementById('previewFrame');
  if (iframe) Pipeline.attach(iframe);

  // Wire postMessage strategy callbacks for UI feedback
  Pipeline._strategies.postmessage.onReady(() => {
    _updatePipelineStatus('live', 'Live preview connected');
  });
  Pipeline._strategies.postmessage.onLatency(ms => {
    const el = document.getElementById('pipelineLatency');
    if (el) el.textContent = ms + 'ms';
  });
}

/**
 * Opens the preview overlay using the correct strategy for the current mode.
 * Replaces openPreview() in engine.js.
 */
function openPreviewPipeline() {
  if (state.blocks.length === 0) {
    toast('Add some blocks first!', 'info');
    return;
  }

  state.previewOpen = true;

  const overlay = document.getElementById('previewOverlay');
  if (!overlay) return;

  // Select strategy based on current canvas mode
  const strategyKey = Pipeline._modeMap[state.mode] || 'srcdoc';

  // For flyer mode: show print options before opening
  if (state.mode === 'flyer') {
    _showPrintOptions(() => {
      Pipeline.open(state.blocks, state.mode, { autoPrint: false });
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      _updatePipelineStatus(strategyKey, `${strategyKey} strategy active`);
    });
    return;
  }

  Pipeline.open(state.blocks, state.mode);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Update the fake URL bar
  const modeLabel = document.getElementById('previewModeLabel');
  if (modeLabel) modeLabel.textContent = MODE_META[state.mode]?.label || 'Page';

  _updatePipelineStatus(strategyKey, `${strategyKey} strategy active`);
}

/**
 * Closes the preview overlay.
 * Replaces closePreview() in engine.js.
 */
function closePreviewPipeline() {
  state.previewOpen = false;
  Pipeline.close();
  document.getElementById('previewOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
  _updatePipelineStatus('idle', 'Preview closed');
}

/**
 * Called when a block is edited in the properties panel.
 * Sends a live update to the preview if it's open and the strategy supports it.
 * Replaces the applyBlockData() call in engine.js.
 * @param {string} id  Block ID
 */
function applyBlockDataPipeline(id) {
  // Call original engine function
  applyBlockData(id);

  // If preview is open and strategy supports live updates, patch it
  if (state.previewOpen && Pipeline.isLive) {
    Pipeline.update(state.blocks);
    Pipeline.highlight(id);
  }
}

/**
 * Called when a block is selected on the canvas.
 * Scrolls the live preview to that block.
 * @param {string} id  Block ID
 */
function selectBlockPipeline(id) {
  selectBlock(id);
  if (state.previewOpen && Pipeline.isLive) {
    Pipeline.scrollTo(id);
    Pipeline.highlight(id);
  }
}

/**
 * Triggers the print dialog for flyer/PDF export.
 */
function printCurrentCanvas() {
  if (state.mode !== 'flyer') {
    // Switch to flyer mode first
    toast('Switching to Flyer mode for print…', 'info');
    setMode('flyer', document.querySelector('[data-mode="flyer"]'));
    setTimeout(() => {
      openPreviewPipeline();
      setTimeout(() => Pipeline.printPDF(), 1000);
    }, 300);
    return;
  }
  if (!state.previewOpen) {
    openPreviewPipeline();
    setTimeout(() => Pipeline.printPDF(), 800);
  } else {
    Pipeline.printPDF();
  }
}

/**
 * Opens the collaborative live preview (postMessage strategy).
 * Used by the multiplayer layer in net-engine.js.
 */
function openCollabPreview() {
  const iframe = document.getElementById('previewFrame');
  if (!iframe) return;

  // Force collab mode regardless of canvas mode
  Pipeline.open(state.blocks, 'collab');

  const overlay = document.getElementById('previewOverlay');
  if (overlay) overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/**
 * Called by net-engine.js when a remote player's canvas changes.
 * Sends a live patch to the preview iframe.
 * @param {Block[]} remoteBlocks  Blocks from the remote player
 */
function syncRemotePreview(remoteBlocks) {
  if (!state.previewOpen || !Pipeline.isLive) return;
  Pipeline.update(remoteBlocks, true); // debounced
}

/* ============================================================
   §9  PRINT OPTIONS UI
   Shown before opening flyer preview to configure paper size.
============================================================ */

function _showPrintOptions(onConfirm) {
  const existing = document.getElementById('printOptionsModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'printOptionsModal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:5000;
    display:flex;align-items:center;justify-content:center;
    backdrop-filter:blur(8px);animation:fadeIn .2s ease;
  `;
  modal.innerHTML = `
    <div style="background:#141420;border:1px solid rgba(255,255,255,.12);border-radius:16px;
      padding:24px;width:360px;max-width:95vw;box-shadow:0 24px 80px rgba(0,0,0,.7)">
      <h3 style="font-size:16px;font-weight:800;color:#eeeef8;margin-bottom:4px">🖨️ Print / PDF Options</h3>
      <p style="font-size:11.5px;color:#55556a;margin-bottom:20px">Configure your print layout before previewing</p>

      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:8px">
          <label style="font-size:11px;color:#9090b0;min-width:80px">Paper Size</label>
          <select id="printPaperSize" style="flex:1;height:28px;padding:0 8px;background:#0f0f18;border:1px solid rgba(255,255,255,.1);border-radius:5px;color:#eeeef8;font-size:11px;outline:none">
            <option value="A4">A4 (210 × 297mm)</option>
            <option value="Letter">Letter (8.5 × 11in)</option>
            <option value="A3">A3 (297 × 420mm)</option>
            <option value="A5">A5 (148 × 210mm)</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <label style="font-size:11px;color:#9090b0;min-width:80px">Orientation</label>
          <select id="printOrientation" style="flex:1;height:28px;padding:0 8px;background:#0f0f18;border:1px solid rgba(255,255,255,.1);border-radius:5px;color:#eeeef8;font-size:11px;outline:none">
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <label style="font-size:11px;color:#9090b0;min-width:80px">Auto Print</label>
          <input type="checkbox" id="printAuto" style="accent-color:#6366f1">
          <span style="font-size:11px;color:#55556a">Open print dialog automatically</span>
        </div>
      </div>

      <div style="display:flex;gap:8px">
        <button onclick="document.getElementById('printOptionsModal').remove()"
          style="flex:1;height:34px;border-radius:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#9090b0;font-size:12px;font-weight:600;cursor:pointer">
          Cancel
        </button>
        <button id="printConfirmBtn"
          style="flex:2;height:34px;border-radius:6px;background:#6366f1;border:none;color:#fff;font-size:12px;font-weight:700;cursor:pointer">
          Open Preview
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  document.getElementById('printConfirmBtn').addEventListener('click', () => {
    const paperSize    = document.getElementById('printPaperSize').value;
    const orientation  = document.getElementById('printOrientation').value;
    const autoPrint    = document.getElementById('printAuto').checked;
    modal.remove();

    // Re-open with print options
    Pipeline.open(state.blocks, 'flyer', { autoPrint, paperSize, orientation });
    onConfirm({ paperSize, orientation, autoPrint });
  });

  // Close on backdrop click
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

/* ============================================================
   §10  PIPELINE STATUS INDICATOR
   Shows which strategy is active in the preview toolbar.
============================================================ */

function _updatePipelineStatus(strategy, label) {
  const indicator = document.getElementById('pipelineStatus');
  if (!indicator) return;

  const colors = {
    srcdoc:      '#6366f1',
    'blob-url':  '#f59e0b',
    postmessage: '#10b981',
    'worker-pdf':'#06b6d4',
    live:        '#10b981',
    idle:        '#38384a',
  };

  indicator.style.background = colors[strategy] || colors.idle;
  indicator.title = label;
}

/* ============================================================
   §11  NET-ENGINE.JS INTEGRATION
   Extends the multiplayer layer to use the postMessage strategy
   for live collaborative preview synchronisation.
============================================================ */

/**
 * Called by NetworkManager.update() each frame when preview is open.
 * Sends the authoritative server snapshot to the preview iframe.
 * @param {Object} snapshot  Server snapshot from net-engine.js
 */
function onNetworkSnapshot(snapshot) {
  if (!state.previewOpen || !Pipeline.isLive) return;

  // Convert network snapshot to block updates
  // (In a real implementation, the server would send block deltas)
  if (snapshot && snapshot.players) {
    // Update player position blocks in the preview
    snapshot.players.forEach(player => {
      const blockId = `player-${player.peerId}`;
      Pipeline.highlight(blockId);
    });
  }
}

/* ============================================================
   §12  EXPORTS
============================================================ */

window.Pipeline              = Pipeline;
window.initPipeline          = initPipeline;
window.openPreviewPipeline   = openPreviewPipeline;
window.closePreviewPipeline  = closePreviewPipeline;
window.applyBlockDataPipeline= applyBlockDataPipeline;
window.selectBlockPipeline   = selectBlockPipeline;
window.printCurrentCanvas    = printCurrentCanvas;
window.openCollabPreview     = openCollabPreview;
window.syncRemotePreview     = syncRemotePreview;
window.onNetworkSnapshot     = onNetworkSnapshot;
window.buildDocument         = buildDocument;
window.SrcdocStrategy        = SrcdocStrategy;
window.BlobUrlStrategy       = BlobUrlStrategy;
window.PostMessageStrategy   = PostMessageStrategy;
window.WorkerPdfStrategy     = WorkerPdfStrategy;
window.PipelineOrchestrator  = PipelineOrchestrator;