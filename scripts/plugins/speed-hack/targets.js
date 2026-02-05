"use strict";

/**
 * Speed Hack Plugin - Target Definitions
 *
 * Defines IL2CPP classes and methods to hook for speed modification.
 * Targets duration calculation points: waits, frames, animations.
 *
 * @module plugins/speed-hack/targets
 */

(function(global) {
  /**
   * Target definitions for speed manipulation
   */
  const TARGETS = {
    // Delay steps (direct wait duration control)
    delayStep: {
      level: 1,
      description: "Delay/wait step - reduce duration directly",
      class: {
        namespace: null,
        className: "fqx",  // Delay step class
        allowPartial: true,
      },
      method: {
        name: "bgmb",
        description: "Execute delay step",
        location: "dumper/dump.cs:356435",
        parameters: [
          // Analyze method signature from dump to find duration parameter
        ],
      },
      speedApplication: {
        type: "durationDivision",  // duration = duration / speedFactor
        parameterIndex: null,      // To be determined from signature
        fieldName: null,            // Or field name if duration is in object
      },
    },

    // WaitForFrames global utility
    waitForFrames: {
      level: 1,
      description: "Frame-based wait - reduce frameCount or increase frameRate",
      class: {
        namespace: null,
        className: "qn",
        allowPartial: true,
      },
      method: {
        name: "oeh",  // WaitForFrames(int frameCount, float frameRate, CancellationToken ct)
        description: "Wait for specified number of frames",
        location: "dumper/dump.cs:40029",
        parameters: [
          { index: 1, name: "frameCount", type: "int" },
          { index: 2, name: "frameRate", type: "float" },
          { index: 3, name: "ct", type: "CancellationToken" },
        ],
      },
      speedApplication: {
        type: "frameCountDivision",  // frameCount = frameCount / speedFactor
        // OR
        // type: "frameRateMultiplication",  // frameRate = frameRate * speedFactor
        parameterIndex: 1,  // frameCount
        alternativeIndex: 2,  // frameRate
      },
    },

    // Entity animations (playback speed control)
    entityAnimator: {
      level: 2,
      description: "Entity animation playback - modify speed mode",
      class: {
        namespace: null,
        className: "EntityAnimator",
        allowPartial: false,
      },
      methods: [
        {
          name: "pue",
          description: "Play animation 1",
          location: "dumper/dump.cs:51703",
        },
        {
          name: "puf",
          description: "Play animation 2",
        },
        {
          name: "puj",
          description: "Play animation 3",
        },
        {
          name: "puk",
          description: "Play animation 4",
        },
        {
          name: "pul",
          description: "Play animation 5",
        },
      ],
      speedApplication: {
        type: "playbackModeModification",
        // Modify EntityAnimationPlaybackModeValue if exists
        // Or hook into animation system to scale playback speed
      },
    },

    // Animator2D renderer (frame rate override)
    animator2D: {
      level: 3,
      description: "2D animation renderer - override frame rate",
      class: {
        namespace: null,
        className: "Animator2D",
        allowPartial: false,
      },
      field: {
        name: "overriddenFrameRate",
        description: "Override FPS for 2D animations",
        location: "dumper/dump.cs:1701206",
        type: "float",
      },
      speedApplication: {
        type: "frameRateOverride",
        // Set higher FPS when animations play
      },
    },
  };

  /**
   * Calculate modified duration based on speed factor
   *
   * @param {number} originalDuration - Original duration in milliseconds
   * @param {number} speedFactor - Speed multiplier
   * @param {Object} limits - Safety limits
   * @returns {number} Modified duration
   */
  function calculateModifiedDuration(originalDuration, speedFactor, limits) {
    if (speedFactor <= 0) return originalDuration;
    if (speedFactor === 1.0) return originalDuration;

    const modified = originalDuration / speedFactor;
    const minDuration = limits.minDurationMs || 16;

    return Math.max(modified, minDuration);
  }

  /**
   * Calculate modified frame count
   *
   * @param {number} originalFrameCount - Original frame count
   * @param {number} speedFactor - Speed multiplier
   * @param {Object} limits - Safety limits
   * @returns {number} Modified frame count
   */
  function calculateModifiedFrameCount(originalFrameCount, speedFactor, limits) {
    if (speedFactor <= 0) return originalFrameCount;
    if (speedFactor === 1.0) return originalFrameCount;

    const modified = Math.floor(originalFrameCount / speedFactor);
    const minFrames = limits.minFrameCount || 1;

    return Math.max(modified, minFrames);
  }

  /**
   * Calculate modified frame rate
   *
   * @param {number} originalFrameRate - Original FPS
   * @param {number} speedFactor - Speed multiplier
   * @param {Object} limits - Safety limits
   * @returns {number} Modified frame rate
   */
  function calculateModifiedFrameRate(originalFrameRate, speedFactor, limits) {
    if (speedFactor <= 0) return originalFrameRate;
    if (speedFactor === 1.0) return originalFrameRate;

    const modified = originalFrameRate * speedFactor;
    const maxFPS = limits.maxFrameRate || 240;

    return Math.min(modified, maxFPS);
  }

  // Export
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.plugins = global.IL2CPPHooker.plugins || {};
  global.IL2CPPHooker.plugins.speedHack = global.IL2CPPHooker.plugins.speedHack || {};
  global.IL2CPPHooker.plugins.speedHack.targets = {
    TARGETS,
    calculateModifiedDuration,
    calculateModifiedFrameCount,
    calculateModifiedFrameRate,
  };
})(globalThis);
