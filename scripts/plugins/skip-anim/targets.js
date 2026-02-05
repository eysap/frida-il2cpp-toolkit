"use strict";

/**
 * Skip Animation Plugin - Target Definitions
 *
 * Defines IL2CPP classes and methods to hook for animation skipping.
 * Based on user-provided analysis of FightSequence → SerialSequencer → Steps → EntityAnimator
 *
 * @module plugins/skip-anim/targets
 */

(function(global) {
  /**
   * Target definitions with interception levels
   */
  const TARGETS = {
    // Level 1: GFX Sequence Generation (Highest level, cleanest)
    // Location: dumper/dump.cs:375877
    gfxGenerator: {
      level: 1,
      description: "Generate GFX spell sequences - return empty SerialSequencer",
      class: {
        namespace: null,  // Update with actual namespace from dump
        className: "ghg",
        allowPartial: true,
      },
      methods: [
        {
          name: "bidr",  // GenerateStep
          description: "Main GFX generation method",
          action: "returnEmpty",  // Return empty SerialSequencer
        },
        {
          name: "bidu",
          description: "GFX step variant",
          action: "returnEmpty",
        },
        {
          name: "bidx",
          description: "GFX step variant",
          action: "returnEmpty",
        },
        {
          name: "bids",
          description: "GFX step variant",
          action: "returnEmpty",
        },
        {
          name: "bidt",
          description: "GFX step variant",
          action: "returnEmpty",
        },
        {
          name: "bidz",
          description: "GFX step variant",
          action: "returnEmpty",
        },
      ],
    },

    // Level 2: Step Addition to Sequencer
    // Location: dumper/dump.cs:354615
    serialSequencer: {
      level: 2,
      description: "Add steps to sequencer - filter FX steps",
      class: {
        namespace: null,
        className: "SerialSequencer",
        allowPartial: false,
      },
      methods: [
        {
          name: "bgne",  // Add step (fpu step)
          description: "Add step to sequencer - filter by type",
          action: "filterSteps",  // Ignore projectile/animation steps
        },
        {
          name: "Start",
          description: "Start sequencer execution",
          action: "monitor",  // Just monitor for debugging
        },
      ],
    },

    // Level 3: Direct Step Execution (Low-level)
    steps: {
      level: 3,
      description: "Skip individual step execution",
      targets: [
        {
          class: { className: "ProjectileStep", allowPartial: false },
          method: "bgmb",
          description: "Projectile step execution",
          location: "dumper/dump.cs:356219",
          action: "skip",  // Skip execution
        },
        {
          class: { className: "ProjectileInLineStep", allowPartial: false },
          method: "bgmb",
          description: "Projectile in-line step",
          location: "dumper/dump.cs:356102",
          action: "skip",
        },
        {
          class: { className: "fqt", allowPartial: true },
          method: "bgmb",
          description: "Play entity animation",
          location: "dumper/dump.cs:356333",
          action: "skip",
        },
        {
          class: { className: "fqr", allowPartial: true },
          method: "bgmb",
          description: "Animation + events",
          location: "dumper/dump.cs:355914",
          action: "skip",
        },
        {
          class: { className: "fqx", allowPartial: true },
          method: "bgmb",
          description: "Wait/delay step",
          location: "dumper/dump.cs:356435",
          action: "skip",  // Or reduce delay in speed-hack mode
        },
      ],
    },

    // Level 4: Entity Animator (Most intrusive)
    // Location: dumper/dump.cs:51703
    entityAnimator: {
      level: 4,
      description: "Block entity animations directly",
      class: {
        namespace: null,
        className: "EntityAnimator",
        allowPartial: false,
      },
      methods: [
        {
          name: "pue",
          description: "Play animation method 1",
          action: "returnFalse",  // Return false to refuse playback
        },
        {
          name: "puf",
          description: "Play animation method 2",
          action: "returnFalse",
        },
        {
          name: "puj",
          description: "Play animation method 3",
          action: "returnFalse",
        },
        {
          name: "puk",
          description: "Play animation method 4",
          action: "returnFalse",
        },
        {
          name: "pul",
          description: "Play animation method 5",
          action: "returnFalse",
        },
      ],
    },

    // Animator2D (Visual renderer)
    // Location: dumper/dump.cs:1701206 / dumper/dump.cs:356979
    animator2D: {
      level: 4,
      description: "2D animation renderer control",
      class: {
        namespace: null,
        className: "Animator2D",
        allowPartial: false,
      },
      methods: [
        // Methods to investigate from dump
      ],
      fields: [
        {
          name: "overriddenFrameRate",
          description: "Override frame rate for speed control",
          action: "modify",  // Used by speed-hack plugin
        },
      ],
    },
  };

  /**
   * Get all target configurations
   */
  function getAllTargets() {
    return TARGETS;
  }

  /**
   * Get targets by level
   */
  function getTargetsByLevel(level) {
    return Object.values(TARGETS).filter(t => t.level === level);
  }

  /**
   * Get enabled targets from config
   */
  function getEnabledTargets(config) {
    const enabled = [];

    if (config.targets.gfxGeneration?.enabled) {
      enabled.push(TARGETS.gfxGenerator);
    }
    if (config.targets.sequencer?.enabled) {
      enabled.push(TARGETS.serialSequencer);
    }
    if (config.targets.steps?.enabled) {
      enabled.push(TARGETS.steps);
    }
    if (config.targets.entityAnimator?.enabled) {
      enabled.push(TARGETS.entityAnimator);
    }

    return enabled;
  }

  // Export
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.plugins = global.IL2CPPHooker.plugins || {};
  global.IL2CPPHooker.plugins.skipAnim = global.IL2CPPHooker.plugins.skipAnim || {};
  global.IL2CPPHooker.plugins.skipAnim.targets = {
    TARGETS,
    getAllTargets,
    getTargetsByLevel,
    getEnabledTargets,
  };
})(globalThis);
