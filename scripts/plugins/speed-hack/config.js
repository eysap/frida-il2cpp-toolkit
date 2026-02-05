"use strict";

/**
 * Speed Hack Plugin - Default Configuration
 *
 * Accelerates game execution with configurable thresholds.
 *
 * @module plugins/speed-hack/config
 */

(function(global) {
  const CONFIG = {
    // Speed configuration
    speed: {
      factor: 2.0,          // Speed multiplier (1.0 = normal, 2.0 = 2x, 3.0 = 3x)
      maxFactor: 3.0,       // Maximum allowed speed factor (safety limit)
      minDurationMs: 16,    // Minimum duration to prevent glitches (16ms ≈ 60fps)
      applyToWaits: true,   // Apply to wait/delay steps
      applyToFrames: true,  // Apply to frame-based waits
      applyToAnimations: true, // Apply to entity animations
      applyToRenderer: false,  // Modify renderer frame rate (experimental)
    },

    // Target selection
    targets: {
      // Waits and delays (direct speed impact)
      waits: {
        enabled: true,
        targets: [
          { class: "fqx", method: "bgmb" },  // Delay step (dumper/dump.cs:356435)
        ],
      },

      // Global wait utility (frame-based)
      waitForFrames: {
        enabled: true,
        class: "qn",
        method: "oeh",  // WaitForFrames(int frameCount, float frameRate, CancellationToken)
        location: "dumper/dump.cs:40029",
      },

      // Entity animations
      entityAnimator: {
        enabled: true,
        class: "EntityAnimator",
        methods: ["pue", "puf", "puj", "puk", "pul"],  // Play methods (dumper/dump.cs:51703)
        modifyPlaybackMode: true,  // Scale EntityAnimationPlaybackModeValue
      },

      // 2D Renderer frame rate
      animator2D: {
        enabled: false,  // Experimental - may cause visual issues
        class: "Animator2D",
        field: "overriddenFrameRate",  // dumper/dump.cs:1701206
        forceFPS: null,  // null = auto-scale, number = force specific FPS
      },
    },

    // Safety limits
    limits: {
      minWaitMs: 1,       // Minimum wait duration (prevent instant execution)
      maxFrameRate: 240,  // Maximum frame rate for animations
      minFrameCount: 1,   // Minimum frame count
    },

    // Logging
    logging: {
      enabled: false,
      logModifications: false,  // Log when durations are modified
      logOriginalValues: false, // Log original vs modified values
    },

    // Performance
    performance: {
      hookDelayMs: 10,
      maxHooks: 50,
    },

    // UI
    ui: {
      showBanner: true,
      verbosity: "normal",
    },
  };

  // Export
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.plugins = global.IL2CPPHooker.plugins || {};
  global.IL2CPPHooker.plugins.speedHack = global.IL2CPPHooker.plugins.speedHack || {};
  global.IL2CPPHooker.plugins.speedHack.CONFIG = CONFIG;
})(globalThis);
