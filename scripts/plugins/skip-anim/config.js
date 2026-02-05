"use strict";

/**
 * Skip Animation Plugin - Default Configuration
 *
 * @module plugins/skip-anim/config
 */

(function(global) {
  const CONFIG = {
    // Skip mode configuration
    mode: {
      skipVisuals: true,       // Stop visual effects
      keepLogic: true,         // Preserve game logic execution
      skipProjectiles: true,   // Skip projectile animations
      skipAnimations: true,    // Skip entity animations
      skipEffects: true,       // Skip visual effects (GFX)
    },

    // Target selection
    targets: {
      // High-level: Generation of GFX sequences (cleanest approach)
      gfxGeneration: {
        enabled: true,
        classes: ["ghg"],        // GFX generator class
        methods: [
          "bidr",  // GenerateStep
          "bidu",  // GFX step variations
          "bidx",
          "bids",
          "bidt",
          "bidz",
        ],
      },

      // Mid-level: Step addition to sequencer
      sequencer: {
        enabled: true,
        classes: ["SerialSequencer"],
        methods: [
          "bgne",  // Add step
          "Start", // Start sequencer
        ],
      },

      // Low-level: Direct step execution
      steps: {
        enabled: true,
        targets: [
          { class: "ProjectileStep", method: "bgmb" },
          { class: "ProjectileInLineStep", method: "bgmb" },
          { class: "fqt", method: "bgmb" },  // Play entity animation
          { class: "fqr", method: "bgmb" },  // Animation + events
          { class: "fqx", method: "bgmb" },  // Wait/delay
        ],
      },

      // Entity-level: Direct animation control
      entityAnimator: {
        enabled: false,  // More intrusive, use only if needed
        classes: ["EntityAnimator"],
        methods: ["pue", "puf", "puj", "puk", "pul"],  // Play methods
      },
    },

    // Logging (debugging)
    logging: {
      enabled: false,
      logSkipped: false,      // Log when animations are skipped
      logMethodCalls: false,  // Log all hooked method calls
    },

    // Performance
    performance: {
      hookDelayMs: 10,   // Fast installation for skip hooks
      maxHooks: 100,     // Limit for safety
    },

    // UI output
    ui: {
      showBanner: true,
      verbosity: "normal",  // "minimal" | "normal" | "verbose"
    },
  };

  // Export
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.plugins = global.IL2CPPHooker.plugins || {};
  global.IL2CPPHooker.plugins.skipAnim = global.IL2CPPHooker.plugins.skipAnim || {};
  global.IL2CPPHooker.plugins.skipAnim.CONFIG = CONFIG;
})(globalThis);
