"use strict";

/**
 * ANSI Color System for Console UI
 *
 * Features:
 * - Configurable color palette
 * - Enable/disable toggle for non-ANSI terminals
 * - Semantic color functions (error, success, warn, etc.)
 * - Composable styling (bold, dim)
 *
 * @module ui/colors
 */

(function(global) {

  // ANSI escape codes
  const ANSI = {
    reset:   "\x1b[0m",
    bold:    "\x1b[1m",
    dim:     "\x1b[2m",

    // Foreground colors
    black:   "\x1b[30m",
    red:     "\x1b[31m",
    green:   "\x1b[32m",
    yellow:  "\x1b[33m",
    blue:    "\x1b[34m",
    magenta: "\x1b[35m",
    cyan:    "\x1b[36m",
    white:   "\x1b[37m",
    gray:    "\x1b[90m",

    // Bright variants
    brightRed:     "\x1b[91m",
    brightGreen:   "\x1b[92m",
    brightYellow:  "\x1b[93m",
    brightBlue:    "\x1b[94m",
    brightMagenta: "\x1b[95m",
    brightCyan:    "\x1b[96m",
    brightWhite:   "\x1b[97m",
  };

  // Default semantic color mapping
  const DEFAULT_PALETTE = {
    error:   "red",
    warn:    "yellow",
    success: "green",
    info:    "blue",
    url:     "cyan",
    type:    "magenta",
    key:     "blue",
    value:   "white",
    string:  "green",
    number:  "yellow",
    ptr:     "gray",
    muted:   "gray",
    header:  "brightCyan",
    method:  "brightYellow",
  };

  let colorsEnabled = true;
  let palette = { ...DEFAULT_PALETTE };

  /**
   * Initialize color system with config
   * @param {Object} config - Color configuration
   * @param {boolean} config.enabled - Enable ANSI colors
   * @param {Object} config.palette - Custom color mappings
   */
  function init(config) {
    if (config) {
      colorsEnabled = config.enabled !== false;
      if (config.palette) {
        palette = { ...DEFAULT_PALETTE, ...config.palette };
      }
    }
  }

  /**
   * Apply ANSI color to text
   * @param {string} text - Text to colorize
   * @param {string} color - Color name from ANSI codes
   * @returns {string} Colorized text or plain text if disabled
   */
  function apply(text, color) {
    if (!colorsEnabled || !color || !ANSI[color]) {
      return text;
    }
    return `${ANSI[color]}${text}${ANSI.reset}`;
  }

  /**
   * Apply semantic color from palette
   * @param {string} text - Text to colorize
   * @param {string} semantic - Semantic color name (error, success, etc.)
   * @returns {string} Colorized text
   */
  function semantic(text, semantic) {
    const color = palette[semantic];
    return apply(text, color);
  }

  /**
   * Apply bold styling
   * @param {string} text - Text to style
   * @returns {string} Bold text
   */
  function bold(text) {
    if (!colorsEnabled) return text;
    return `${ANSI.bold}${text}${ANSI.reset}`;
  }

  /**
   * Apply dim styling
   * @param {string} text - Text to style
   * @returns {string} Dimmed text
   */
  function dim(text) {
    if (!colorsEnabled) return text;
    return `${ANSI.dim}${text}${ANSI.reset}`;
  }

  /**
   * Combine color with bold
   * @param {string} text - Text to style
   * @param {string} color - Color name
   * @returns {string} Bold colored text
   */
  function boldColor(text, color) {
    if (!colorsEnabled || !ANSI[color]) return text;
    return `${ANSI.bold}${ANSI[color]}${text}${ANSI.reset}`;
  }

  // Semantic color shortcuts
  const c = {
    error:   (t) => semantic(t, "error"),
    warn:    (t) => semantic(t, "warn"),
    success: (t) => semantic(t, "success"),
    info:    (t) => semantic(t, "info"),
    url:     (t) => semantic(t, "url"),
    type:    (t) => semantic(t, "type"),
    key:     (t) => semantic(t, "key"),
    value:   (t) => semantic(t, "value"),
    string:  (t) => semantic(t, "string"),
    number:  (t) => semantic(t, "number"),
    ptr:     (t) => semantic(t, "ptr"),
    muted:   (t) => semantic(t, "muted"),
    header:  (t) => semantic(t, "header"),
    method:  (t) => semantic(t, "method"),
    bold:    bold,
    dim:     dim,
  };

  // Export
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.ui = global.IL2CPPHooker.ui || {};
  global.IL2CPPHooker.ui.colors = {
    ANSI,
    DEFAULT_PALETTE,
    init,
    apply,
    semantic,
    bold,
    dim,
    boldColor,
    c,
    isEnabled: () => colorsEnabled,
  };

})(globalThis);
