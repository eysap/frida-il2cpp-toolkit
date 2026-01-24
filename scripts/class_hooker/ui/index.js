"use strict";

/**
 * Main UI Module - Console Output Formatting
 *
 * Provides consistent, readable console output for IL2CPP hooking:
 * - Banner display
 * - Hook call/return formatting with verbosity levels
 * - HTTP request blocks (grouped, numbered)
 * - Object dump blocks
 * - Status messages (success, error, warn, info)
 * - Timestamp and counter management
 *
 * @module ui/index
 */

(function(global) {

  const colors = global.IL2CPPHooker.ui.colors;
  const box = global.IL2CPPHooker.ui.box;
  const { c } = colors;
  const { BOX } = box;

  // Internal state
  let config = null;
  let startTime = null;
  let blockCounter = 0;
  let instanceIds = null;
  let nextInstanceId = 0;

  // Verbosity levels
  const VERBOSITY = {
    minimal: 0,
    normal: 1,
    verbose: 2,
  };

  /**
   * Initialize UI module with configuration
   * @param {Object} cfg - UI configuration from CONFIG.ui
   */
  function init(cfg) {
    config = cfg || {};
    colors.init(config.colors);
    startTime = Date.now();
    blockCounter = 0;
    instanceIds = new Map();
    nextInstanceId = 0;
  }

  /**
   * Get current verbosity level
   * @returns {number} Verbosity level (0-2)
   */
  function getVerbosity() {
    return VERBOSITY[config.verbosity] ?? VERBOSITY.normal;
  }

  /**
   * Format relative timestamp
   * @returns {string} Formatted timestamp [+0.000s]
   */
  function timestamp() {
    if (!config.timestamp?.enabled) return '';
    const elapsed = (Date.now() - startTime) / 1000;
    return c.muted(`[+${elapsed.toFixed(3)}s]`);
  }

  /**
   * Get next block counter and format it
   * @returns {string} Formatted counter [1]
   */
  function nextCounter() {
    blockCounter++;
    return c.muted(`[${blockCounter}]`);
  }

  /**
   * Truncate string with ellipsis
   * Verbose mode uses longer limits
   * @param {string} str - String to truncate
   * @param {number} max - Maximum length (uses config default if not specified)
   * @returns {string} Truncated string
   */
  function truncate(str, max) {
    const isVerbose = getVerbosity() === VERBOSITY.verbose;
    // In verbose mode, use much higher limits
    const defaultLimit = isVerbose ? 200 : (config.truncation?.maxStringLength || 80);
    const limit = max || defaultLimit;
    const ellipsis = config.truncation?.ellipsis || '...';
    if (!str || str.length <= limit) return str;
    return str.slice(0, limit - ellipsis.length) + ellipsis;
  }

  // ═══════════════════════════════════════════════════════════════════
  // BANNER
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Display startup banner
   * @param {Object} opts - Banner options
   * @param {string} opts.target - Target class name
   * @param {string} opts.assembly - Assembly name
   * @param {number} opts.methodCount - Number of methods to hook
   */
  function banner(opts) {
    if (!config.banner?.enabled) return;

    const width = 45;
    const lines = [
      box.boxTop(width, 'light'),
      box.boxLine(c.header('IL2CPP Hooker'), width, 'light'),
      box.boxLine(`Target: ${c.type(opts.target || 'N/A')}`, width, 'light'),
    ];

    if (opts.assembly) {
      lines.push(box.boxLine(`Assembly: ${c.muted(opts.assembly)}`, width, 'light'));
    }
    if (opts.methodCount !== undefined) {
      lines.push(box.boxLine(`Methods: ${c.number(opts.methodCount)} to hook`, width, 'light'));
    }

    lines.push(box.boxBottom(width, 'light'));
    console.log(lines.join('\n'));
  }

  // ═══════════════════════════════════════════════════════════════════
  // STATUS MESSAGES
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Log success message
   * @param {string} msg - Message
   */
  function success(msg) {
    console.log(`${timestamp()} ${c.success(BOX.status.success)} ${msg}`);
  }

  /**
   * Log error message
   * @param {string} msg - Message
   */
  function error(msg) {
    console.log(`${timestamp()} ${c.error(BOX.status.error)} ${c.error(msg)}`);
  }

  /**
   * Log warning message
   * @param {string} msg - Message
   */
  function warn(msg) {
    console.log(`${timestamp()} ${c.warn(BOX.status.warn)} ${c.warn(msg)}`);
  }

  /**
   * Log info message
   * @param {string} msg - Message
   */
  function info(msg) {
    console.log(`${timestamp()} ${c.info(BOX.status.info)} ${msg}`);
  }

  /**
   * Log class suggestion
   * @param {string} assembly - Assembly name
   * @param {string} className - Full class name
   */
  function suggestion(assembly, className) {
    console.log(`  ${c.muted(assembly)} ${BOX.arrow.right} ${c.type(className)}`);
  }

  /**
   * Log class match in selection list
   * @param {number} index - Match index
   * @param {string} assembly - Assembly name
   * @param {string} className - Full class name
   */
  function classMatch(index, assembly, className) {
    console.log(`  ${c.muted(`[${index}]`)} ${assembly} ${BOX.arrow.right} ${c.type(className)}`);
  }

  /**
   * Log stack trace
   * @param {string} stack - Stack trace string
   */
  function stackTrace(stack) {
    if (getVerbosity() < VERBOSITY.verbose) return;
    console.log(c.muted('  Stack:'));
    stack.split('\n').forEach(line => {
      console.log(c.muted(`    ${line}`));
    });
  }

  /**
   * Log HTTP response summary
   * @param {string} summary - Response summary
   */
  function httpResponse(summary) {
    console.log(`${timestamp()} ${c.info(BOX.arrow.returns)} ${c.success('Response')}: ${summary}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // HOOK CALL/RETURN
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Format a key-value pair for display
   * @param {string} key - Key name
   * @param {string} value - Value
   * @param {number} keyWidth - Width for key alignment
   * @returns {string} Formatted pair
   */
  function formatKV(key, value, keyWidth) {
    const paddedKey = box.pad(key, keyWidth || 8, 'left');
    return `${c.key(paddedKey)} : ${value}`;
  }

  function getInstanceId(ptr) {
    if (!ptr || !config.instanceIds?.enabled) return null;
    if (instanceIds.has(ptr)) return instanceIds.get(ptr);
    nextInstanceId += 1;
    instanceIds.set(ptr, nextInstanceId);
    return nextInstanceId;
  }

  function formatClassName(className, thisPtr) {
    const id = getInstanceId(thisPtr);
    return c.type(id ? `${className}#${id}` : className);
  }

  function formatThisValue(className, thisPtr) {
    if (!thisPtr) return null;
    const id = getInstanceId(thisPtr);
    if (id) {
      return `${c.number(`#${id}`)} ${c.ptr(`@${thisPtr}`)}`;
    }
    return c.ptr(thisPtr);
  }

  /**
   * Log method call (onEnter)
   * @param {Object} opts - Call options
   * @param {string} opts.className - Full class name
   * @param {string} opts.methodName - Method name
   * @param {Array} opts.args - Array of {name, value} pairs
   * @param {string} opts.thisPtr - This pointer (optional)
   * @param {boolean} opts.showThis - Show 'this' line
   */
  function hookCall(opts) {
    const v = getVerbosity();
    const ts = timestamp();
    const method = `${formatClassName(opts.className, opts.thisPtr)}.${c.method(opts.methodName)}`;

    if (v === VERBOSITY.minimal) {
      // Minimal: single line
      const argsInline = opts.args?.map(a => `${a.name}=${truncate(a.value, 30)}`).join(', ') || '';
      console.log(`${ts} ${BOX.arrow.calls} ${method}(${argsInline})`);
      return;
    }

    // Normal/Verbose: structured output
    console.log(`${ts} ${box.separator(40)}`);
    console.log(`${BOX.arrow.calls} ${method}()`);

    if (opts.args && opts.args.length > 0) {
      const maxKeyLen = Math.max(...opts.args.map(a => a.name.length), 4);
      opts.args.forEach((arg, i) => {
        const isLast = i === opts.args.length - 1 && !opts.thisPtr;
        const branch = isLast ? BOX.tree.last : BOX.tree.branch;
        const val = v === VERBOSITY.verbose ? arg.value : truncate(arg.value, 100);
        console.log(`  ${branch} ${formatKV(arg.name, val, maxKeyLen)}`);
      });
    }

    if (opts.showThis && opts.thisPtr) {
      const thisVal = formatThisValue(opts.className, opts.thisPtr);
      console.log(`  ${BOX.tree.last} ${c.key('this')}    : ${thisVal}`);
    }
  }

  /**
   * Log method return (onLeave)
   * @param {Object} opts - Return options
   * @param {string} opts.className - Full class name
   * @param {string} opts.methodName - Method name
   * @param {string} opts.value - Return value
   */
  function hookReturn(opts) {
    const v = getVerbosity();
    const val = v === VERBOSITY.verbose ? opts.value : truncate(opts.value, 120);

    if (v === VERBOSITY.minimal) {
      console.log(`  ${BOX.arrow.returns} ${val}`);
    } else {
      console.log(`${BOX.arrow.returns} ret: ${val}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // HTTP BLOCK
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Log HTTP request/response as grouped block
   * @param {Object} opts - HTTP options
   * @param {string} opts.method - HTTP method (GET, POST, etc.)
   * @param {string} opts.path - Request path
   * @param {string} opts.url - Full URL
   * @param {Object} opts.headers - Headers object or string
   * @param {string} opts.body - Request body
   * @param {number} opts.status - Response status code
   * @param {string} opts.statusText - Response status text
   * @param {string} opts.responseBody - Response body
   */
  function httpBlock(opts) {
    const width = 50;
    const counter = nextCounter();
    const ts = timestamp();

    // Header line
    const httpMethod = opts.method?.toUpperCase() || 'REQUEST';
    const title = `HTTP ${httpMethod}`;

    console.log(`${counter} ${ts} ${box.boxTop(width, 'heavy', title)}`);

    // Request summary line
    const methodColor = httpMethod === 'GET' ? c.info :
                        httpMethod === 'POST' ? c.warn :
                        httpMethod === 'DELETE' ? c.error : c.value;
    console.log(`${BOX.heavy.v} ${methodColor(httpMethod)} ${c.url(opts.path || opts.url || '')}`);
    console.log(box.boxMiddle(width, 'heavy'));

    // Request details
    if (opts.url) {
      console.log(`${BOX.heavy.v} ${BOX.arrow.calls} ${c.key('url')}     : ${c.url(truncate(opts.url, 60))}`);
    }
    if (opts.headers) {
      const headersStr = typeof opts.headers === 'object'
        ? JSON.stringify(opts.headers)
        : opts.headers;
      console.log(`${BOX.heavy.v} ${BOX.arrow.calls} ${c.key('headers')} : ${truncate(headersStr, 50)}`);
    }
    if (opts.body) {
      const bodyMax = config.truncation?.maxBodyLength || 200;
      console.log(`${BOX.heavy.v} ${BOX.arrow.calls} ${c.key('body')}    : ${truncate(opts.body, bodyMax)}`);
    }

    // Response section (if available)
    if (opts.status !== undefined || opts.responseBody) {
      console.log(box.boxMiddle(width, 'heavy'));

      if (opts.status !== undefined) {
        const statusColor = opts.status >= 200 && opts.status < 300 ? c.success :
                           opts.status >= 400 ? c.error : c.warn;
        const statusText = opts.statusText || '';
        console.log(`${BOX.heavy.v} ${BOX.arrow.returns} ${statusColor(opts.status)} ${statusText}`);
      }

      if (opts.responseBody) {
        const bodyMax = config.truncation?.maxBodyLength || 200;
        console.log(`${BOX.heavy.v} ${BOX.arrow.returns} ${c.key('body')}    : ${truncate(opts.responseBody, bodyMax)}`);
      }
    }

    console.log(box.boxBottom(width, 'heavy'));
  }

  /**
   * Start HTTP block (for streaming/partial output)
   * @param {Object} opts - Partial HTTP options
   * @returns {Object} Block context for httpBlockAdd/httpBlockEnd
   */
  function httpBlockStart(opts) {
    const width = 50;
    const counter = nextCounter();
    const ts = timestamp();
    const httpMethod = opts.method?.toUpperCase() || 'REQUEST';
    const title = `HTTP ${httpMethod}`;

    console.log(`${counter} ${ts} ${box.boxTop(width, 'heavy', title)}`);

    const methodColor = httpMethod === 'GET' ? c.info :
                        httpMethod === 'POST' ? c.warn :
                        httpMethod === 'DELETE' ? c.error : c.value;
    console.log(`${BOX.heavy.v} ${methodColor(httpMethod)} ${c.url(opts.path || '')}`);
    console.log(box.boxMiddle(width, 'heavy'));

    return { width, started: true };
  }

  /**
   * Add line to HTTP block
   * @param {string} direction - 'in' or 'out'
   * @param {string} key - Key name
   * @param {string} value - Value
   */
  function httpBlockLine(direction, key, value) {
    const arrow = direction === 'out' ? BOX.arrow.returns : BOX.arrow.calls;
    const bodyMax = config.truncation?.maxBodyLength || 200;
    console.log(`${BOX.heavy.v} ${arrow} ${c.key(box.pad(key, 7, 'left'))} : ${truncate(value, bodyMax)}`);
  }

  /**
   * Add separator to HTTP block
   */
  function httpBlockSeparator() {
    console.log(box.boxMiddle(50, 'heavy'));
  }

  /**
   * End HTTP block
   */
  function httpBlockEnd() {
    console.log(box.boxBottom(50, 'heavy'));
  }

  // ═══════════════════════════════════════════════════════════════════
  // DUMP BLOCK
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Log object dump as formatted block
   * @param {Object} opts - Dump options
   * @param {string} opts.typeName - Type name
   * @param {string} opts.ptr - Pointer address
   * @param {string} opts.className - Full class name (optional)
   * @param {Array} opts.fields - Array of {name, value} pairs
   */
  function dumpBlock(opts) {
    const counter = nextCounter();
    const ts = timestamp();
    const title = `${opts.typeName}@${opts.ptr}`;
    const width = Math.max(40, title.length + 10);

    console.log(`${counter} ${ts} ${box.boxTop(width, 'light', title)}`);

    if (opts.className && opts.className !== opts.typeName) {
      console.log(`${BOX.light.v} ${c.muted('class')}: ${c.type(opts.className)}`);
      console.log(box.boxMiddle(width, 'light'));
    }

    if (opts.fields && opts.fields.length > 0) {
      const maxKeyLen = Math.max(...opts.fields.map(f => f.name.length), 4);
      opts.fields.forEach(field => {
        const key = box.pad(field.name, maxKeyLen, 'left');
        const val = truncate(field.value, 40);
        console.log(`${BOX.light.v} ${c.key(key)} : ${val}`);
      });
    }

    if (opts.truncated) {
      console.log(`${BOX.light.v} ${c.muted('...')}`);
    }

    console.log(box.boxBottom(width, 'light'));
  }

  // ═══════════════════════════════════════════════════════════════════
  // METHOD LISTING
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Display method list header
   * @param {string} className - Class name
   * @param {number} count - Method count
   */
  function methodListStart(className, count) {
    console.log('');
    console.log(`${c.header('=== METHODS ===')} ${c.type(className)} (${c.number(count)})`);
  }

  /**
   * Display single method in list
   * @param {number} index - Method index
   * @param {string} signature - Method signature
   * @param {string} address - Virtual address
   */
  function methodListItem(index, signature, address) {
    const idx = c.muted(`[${index}]`);
    const addr = address && address !== 'null' ? c.ptr(`@ ${address}`) : c.error('@ null');
    console.log(`  ${idx} ${signature} ${addr}`);
  }

  /**
   * Display method list footer
   */
  function methodListEnd() {
    console.log(c.header('=== END METHODS ==='));
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════════
  // HOOKING STATUS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Log hook installation success
   * @param {string} signature - Method signature
   */
  function hookInstalled(signature) {
    if (getVerbosity() >= VERBOSITY.normal) {
      success(`Hooked: ${signature}`);
    }
  }

  /**
   * Log hook installation failure
   * @param {string} signature - Method signature
   * @param {string} reason - Failure reason
   */
  function hookFailed(signature, reason) {
    error(`Failed: ${signature} (${reason})`);
  }

  /**
   * Log hook summary
   * @param {number} hooked - Successfully hooked count
   * @param {number} failed - Failed count
   * @param {number} total - Total attempted
   */
  function hookSummary(hooked, failed, total) {
    console.log('');
    console.log(`${c.success(BOX.status.success)} Hooked ${c.number(hooked)} methods (${c.error(failed)} failed, ${total} total)`);
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════════
  // ANALYSIS BLOCKS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Start custom analysis block
   * @param {string} methodName - Method being analyzed
   */
  function analyzeStart(methodName) {
    console.log(box.separator(40));
    console.log(`${c.header('[ANALYZE]')} ${c.method(methodName)}`);
  }

  /**
   * Log analysis detail
   * @param {string} key - Detail key
   * @param {string} value - Detail value
   */
  function analyzeDetail(key, value) {
    console.log(`  ${c.key(key)}: ${value}`);
  }

  /**
   * End analysis block
   */
  function analyzeEnd() {
    console.log(box.separator(40));
  }

  // Export
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.ui = global.IL2CPPHooker.ui || {};
  Object.assign(global.IL2CPPHooker.ui, {
    // Core
    init,
    timestamp,
    truncate,
    getVerbosity,
    VERBOSITY,

    // Banner
    banner,

    // Status
    success,
    error,
    warn,
    info,
    suggestion,
    classMatch,

    // Hooks
    hookCall,
    hookReturn,
    hookInstalled,
    hookFailed,
    hookSummary,
    stackTrace,

    // HTTP
    httpBlock,
    httpBlockStart,
    httpBlockLine,
    httpBlockSeparator,
    httpBlockEnd,
    httpResponse,

    // Dump
    dumpBlock,

    // Methods
    methodListStart,
    methodListItem,
    methodListEnd,

    // Analysis
    analyzeStart,
    analyzeDetail,
    analyzeEnd,

    // Utils
    formatKV,
  });

})(globalThis);
