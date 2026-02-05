"use strict";

/**
 * Box-Drawing Characters and Utilities
 *
 * Provides ASCII box-drawing for structured console output:
 * - Heavy boxes (double lines) for HTTP blocks
 * - Light boxes (single lines) for dumps
 * - Tree structure for arguments/fields
 * - Separators and dividers
 *
 * @module ui/box
 */

(function(global) {

  // Box-drawing character sets
  const BOX = {
    // Heavy (double line) - for HTTP blocks
    heavy: {
      tl: '╔',  // top-left
      tr: '╗',  // top-right
      bl: '╚',  // bottom-left
      br: '╝',  // bottom-right
      h:  '═',  // horizontal
      v:  '║',  // vertical
      ml: '╠',  // middle-left (junction)
      mr: '╣',  // middle-right
      cross: '╬',
    },

    // Light (single line) - for dumps
    light: {
      tl: '┌',
      tr: '┐',
      bl: '└',
      br: '┘',
      h:  '─',
      v:  '│',
      ml: '├',
      mr: '┤',
      cross: '┼',
    },

    // Tree structure - for args/fields
    tree: {
      branch: '├──',
      last:   '└──',
      pipe:   '│',
      space:  '   ',
      nested: '│   ',
    },

    // Arrows and markers
    arrow: {
      right:    '→',
      left:     '←',
      up:       '↑',
      down:     '↓',
      returns:  '←',
      calls:    '→',
    },

    // Status symbols
    status: {
      success: '✓',
      error:   '✗',
      warn:    '⚠',
      info:    '•',
      bullet:  '•',
    },
  };

  /**
   * Create a horizontal line
   * @param {number} width - Line width
   * @param {string} char - Character to use (default: light horizontal)
   * @returns {string} Horizontal line
   */
  function hline(width, char) {
    return (char || BOX.light.h).repeat(width);
  }

  /**
   * Create a box top border
   * @param {number} width - Inner width
   * @param {string} style - 'heavy' or 'light'
   * @param {string} title - Optional title to embed
   * @returns {string} Top border line
   */
  function boxTop(width, style, title) {
    const b = style === 'heavy' ? BOX.heavy : BOX.light;
    if (title) {
      const titlePart = ` ${title} `;
      const remaining = width - titlePart.length;
      const left = Math.max(3, Math.floor(remaining / 2));
      const right = Math.max(0, remaining - left);
      return `${b.tl}${b.h.repeat(left)}${titlePart}${b.h.repeat(right)}${b.tr}`;
    }
    return `${b.tl}${b.h.repeat(width)}${b.tr}`;
  }

  /**
   * Create a box bottom border
   * @param {number} width - Inner width
   * @param {string} style - 'heavy' or 'light'
   * @returns {string} Bottom border line
   */
  function boxBottom(width, style) {
    const b = style === 'heavy' ? BOX.heavy : BOX.light;
    return `${b.bl}${b.h.repeat(width)}${b.br}`;
  }

  /**
   * Create a box middle separator
   * @param {number} width - Inner width
   * @param {string} style - 'heavy' or 'light'
   * @returns {string} Middle separator line
   */
  function boxMiddle(width, style) {
    const b = style === 'heavy' ? BOX.heavy : BOX.light;
    return `${b.ml}${b.h.repeat(width)}${b.mr}`;
  }

  /**
   * Wrap content in box vertical border
   * @param {string} content - Content to wrap
   * @param {number} width - Total width including borders
   * @param {string} style - 'heavy' or 'light'
   * @returns {string} Bordered content line
   */
  function boxLine(content, width, style) {
    const b = style === 'heavy' ? BOX.heavy : BOX.light;
    const padding = Math.max(0, width - 2 - content.length);
    return `${b.v} ${content}${' '.repeat(padding)} ${b.v}`;
  }

  /**
   * Create left-bordered line (no right border)
   * @param {string} content - Content
   * @param {string} style - 'heavy' or 'light'
   * @returns {string} Left-bordered line
   */
  function leftBorder(content, style) {
    const b = style === 'heavy' ? BOX.heavy : BOX.light;
    return `${b.v} ${content}`;
  }

  /**
   * Format tree branch
   * @param {string} content - Content
   * @param {boolean} isLast - Is this the last item
   * @param {number} depth - Nesting depth (0 = root)
   * @returns {string} Tree-formatted line
   */
  function treeLine(content, isLast, depth) {
    const indent = BOX.tree.nested.repeat(depth);
    const branch = isLast ? BOX.tree.last : BOX.tree.branch;
    return `${indent}${branch} ${content}`;
  }

  /**
   * Create simple separator line
   * @param {number} width - Line width
   * @returns {string} Separator
   */
  function separator(width) {
    return BOX.light.h.repeat(width);
  }

  /**
   * Pad string to fixed width
   * @param {string} str - String to pad
   * @param {number} width - Target width
   * @param {string} align - 'left', 'right', 'center'
   * @returns {string} Padded string
   */
  function pad(str, width, align) {
    const len = str.length;
    if (len >= width) return str;
    const diff = width - len;

    switch (align) {
      case 'right':
        return ' '.repeat(diff) + str;
      case 'center':
        const left = Math.floor(diff / 2);
        return ' '.repeat(left) + str + ' '.repeat(diff - left);
      default: // left
        return str + ' '.repeat(diff);
    }
  }

  /**
   * Calculate visible length (excluding ANSI codes)
   * @param {string} str - String possibly containing ANSI codes
   * @returns {number} Visible character count
   */
  function visibleLength(str) {
    // Remove ANSI escape sequences for length calculation
    return str.replace(/\x1b\[[0-9;]*m/g, '').length;
  }

  // Export
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.ui = global.IL2CPPHooker.ui || {};
  global.IL2CPPHooker.ui.box = {
    BOX,
    hline,
    boxTop,
    boxBottom,
    boxMiddle,
    boxLine,
    leftBorder,
    treeLine,
    separator,
    pad,
    visibleLength,
  };

})(globalThis);
