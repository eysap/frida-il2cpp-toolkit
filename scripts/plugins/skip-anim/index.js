"use strict";

/**
 * Skip Animation Plugin - Implementation
 *
 * Stops visual animations while preserving game logic.
 * Hooks into FightSequence → SerialSequencer → Steps → EntityAnimator pipeline.
 *
 * @module plugins/skip-anim
 */

(function(global) {
  const hookManager = global.IL2CPPHooker?.hookManager;
  const targets = global.IL2CPPHooker?.plugins?.skipAnim?.targets;

  if (!hookManager) {
    console.log("[FATAL] skip-anim plugin requires hook-manager");
    return;
  }

  function getUI() {
    return global.IL2CPPHooker?.ui;
  }

  /**
   * Skip Animation Plugin
   */
  const SkipAnimPlugin = {
    name: "skip-anim",
    version: "1.0.0",
    hooksInstalled: 0,

    /**
     * Initialize plugin
     */
    init(config) {
      const ui = getUI();
      this.config = config;

      if (ui) {
        ui.info(`Skip-Anim plugin initialized`);
        ui.info(`  Mode: ${config.mode.skipVisuals ? "Skip Visuals" : "Normal"}`);
        ui.info(`  Keep Logic: ${config.mode.keepLogic ? "Yes" : "No"}`);
      }

      return true;
    },

    /**
     * Start plugin - install hooks
     */
    start() {
      const ui = getUI();
      const config = this.config;

      if (ui && config.ui.showBanner) {
        ui.banner({
          target: "Animation Skipping",
          plugin: "skip-anim",
          mode: config.mode.skipVisuals ? "Active" : "Passive",
        });
      }

      // Install hooks based on configuration
      if (config.targets.gfxGeneration?.enabled) {
        this.hookGfxGeneration();
      }

      if (config.targets.sequencer?.enabled) {
        this.hookSerialSequencer();
      }

      if (config.targets.steps?.enabled) {
        this.hookSteps();
      }

      if (config.targets.entityAnimator?.enabled) {
        this.hookEntityAnimator();
      }

      if (ui) {
        ui.success(`Skip-Anim: ${this.hooksInstalled} hooks installed`);
      }
    },

    /**
     * Hook GFX generation methods (Level 1 - highest, cleanest)
     */
    hookGfxGeneration() {
      const ui = getUI();
      const config = this.config;

      if (!targets) {
        if (ui) ui.warn("Skip-Anim: targets.js not loaded");
        return;
      }

      const gfxTarget = targets.TARGETS.gfxGenerator;
      const target = gfxTarget.class;

      // Update with config overrides
      target.className = config.targets.gfxGeneration.classes?.[0] || target.className;

      const result = hookManager.findClass(target, true);
      if (!result) {
        if (ui && config.logging.enabled) {
          ui.warn(`Skip-Anim: GFX generator class not found: ${target.className}`);
        }
        return;
      }

      const klass = result.klass;
      const methodNames = config.targets.gfxGeneration.methods || [];

      methodNames.forEach(methodName => {
        const method = hookManager.findMethod(klass, methodName);
        if (!method) return;

        const success = hookManager.installHook(method, (args, method, ctx, self) => {
          // Return empty SerialSequencer to skip GFX generation
          if (config.logging.logSkipped && ui) {
            ui.info(`[SkipAnim] Skipped GFX generation: ${method.name}`);
          }

          // Prevent original execution by not calling original
          // Return value handling depends on IL2CPP method signature
          // For void methods, this just skips execution
          // For methods returning objects, may need to construct empty return value
        }, {});

        if (success) this.hooksInstalled++;
      });

      if (ui && config.logging.enabled) {
        ui.success(`Skip-Anim: GFX generation hooks installed`);
      }
    },

    /**
     * Hook SerialSequencer methods (Level 2)
     */
    hookSerialSequencer() {
      const ui = getUI();
      const config = this.config;

      if (!targets) return;

      const seqTarget = targets.TARGETS.serialSequencer;
      const target = seqTarget.class;

      const result = hookManager.findClass(target, true);
      if (!result) {
        if (ui && config.logging.enabled) {
          ui.warn(`Skip-Anim: SerialSequencer class not found`);
        }
        return;
      }

      const klass = result.klass;

      // Hook bgne (Add step) - filter steps
      const bgneMethod = hookManager.findMethod(klass, "bgne");
      if (bgneMethod) {
        hookManager.installHook(bgneMethod, (args, method, ctx, self) => {
          // Filter steps based on type
          // args[0] = this pointer
          // args[1] = fpu step object

          if (config.mode.skipProjectiles || config.mode.skipAnimations) {
            // Analyze step type and skip if it's visual-only
            // This requires inspecting the step object's class

            if (config.logging.logSkipped && ui) {
              ui.info(`[SkipAnim] Filtered step in SerialSequencer.bgne`);
            }

            // Skip this step addition by returning early
            return;
          }
        }, {});

        this.hooksInstalled++;
      }

      if (ui && config.logging.enabled) {
        ui.success(`Skip-Anim: SerialSequencer hooks installed`);
      }
    },

    /**
     * Hook individual step execution methods (Level 3)
     */
    hookSteps() {
      const ui = getUI();
      const config = this.config;

      if (!targets) return;

      const stepTargets = targets.TARGETS.steps.targets;

      stepTargets.forEach(stepDef => {
        const result = hookManager.findClass(stepDef.class, true);
        if (!result) return;

        const method = hookManager.findMethod(result.klass, stepDef.method);
        if (!method) return;

        hookManager.installHook(method, (args, method, ctx, self) => {
          // Skip step execution
          if (config.logging.logSkipped && ui) {
            ui.info(`[SkipAnim] Skipped step: ${stepDef.class.className}.${stepDef.method}`);
          }

          // Return early to skip execution
          return;
        }, {});

        this.hooksInstalled++;
      });

      if (ui && config.logging.enabled) {
        ui.success(`Skip-Anim: Step execution hooks installed (${stepTargets.length} targets)`);
      }
    },

    /**
     * Hook EntityAnimator play methods (Level 4 - most intrusive)
     */
    hookEntityAnimator() {
      const ui = getUI();
      const config = this.config;

      if (!targets) return;

      const animTarget = targets.TARGETS.entityAnimator;
      const target = animTarget.class;

      const result = hookManager.findClass(target, true);
      if (!result) {
        if (ui && config.logging.enabled) {
          ui.warn(`Skip-Anim: EntityAnimator class not found`);
        }
        return;
      }

      const klass = result.klass;
      const methodNames = config.targets.entityAnimator.methods || ["pue", "puf", "puj", "puk", "pul"];

      methodNames.forEach(methodName => {
        const method = hookManager.findMethod(klass, methodName);
        if (!method) return;

        hookManager.installHook(method, (args, method, ctx, self) => {
          // Block animation playback by returning false
          if (config.logging.logSkipped && ui) {
            ui.info(`[SkipAnim] Blocked animation: EntityAnimator.${method.name}`);
          }

          // Modify return value to false (refuse playback)
          // This requires manipulating the return register
          // Implementation depends on architecture (ARM/x86)
        }, {});

        this.hooksInstalled++;
      });

      if (ui && config.logging.enabled) {
        ui.success(`Skip-Anim: EntityAnimator hooks installed`);
      }
    },

    /**
     * Stop plugin
     */
    stop() {
      const ui = getUI();
      if (ui) ui.info("Skip-Anim plugin stopped");
    }
  };

  // Export
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.plugins = global.IL2CPPHooker.plugins || {};
  global.IL2CPPHooker.plugins.skipAnim = global.IL2CPPHooker.plugins.skipAnim || {};
  global.IL2CPPHooker.plugins.skipAnim.plugin = SkipAnimPlugin;
})(globalThis);
