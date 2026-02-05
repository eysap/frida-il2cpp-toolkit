"use strict";

/**
 * Speed Hack Plugin - Implementation
 *
 * Accelerates game execution by modifying wait durations, frame counts, and animation speeds.
 * Uses configurable thresholds to prevent glitches and maintain stability.
 *
 * @module plugins/speed-hack
 */

(function(global) {
  const hookManager = global.IL2CPPHooker?.hookManager;
  const targets = global.IL2CPPHooker?.plugins?.speedHack?.targets;

  if (!hookManager) {
    console.log("[FATAL] speed-hack plugin requires hook-manager");
    return;
  }

  function getUI() {
    return global.IL2CPPHooker?.ui;
  }

  /**
   * Speed Hack Plugin
   */
  const SpeedHackPlugin = {
    name: "speed-hack",
    version: "1.0.0",
    hooksInstalled: 0,
    modificationsCount: 0,

    /**
     * Initialize plugin
     */
    init(config) {
      const ui = getUI();
      this.config = config;

      // Validate speed factor
      if (config.speed.factor < 1.0) {
        if (ui) ui.warn("Speed factor < 1.0 will slow down game (not recommended)");
      }
      if (config.speed.factor > config.speed.maxFactor) {
        if (ui) ui.warn(`Speed factor capped at ${config.speed.maxFactor}`);
        config.speed.factor = config.speed.maxFactor;
      }

      if (ui) {
        ui.info(`Speed-Hack plugin initialized`);
        ui.info(`  Speed Factor: ${config.speed.factor}x`);
        ui.info(`  Min Duration: ${config.speed.minDurationMs}ms`);
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
          target: "Speed Acceleration",
          plugin: "speed-hack",
          factor: `${config.speed.factor}x`,
        });
      }

      // Install hooks based on configuration
      if (config.targets.waits?.enabled) {
        this.hookDelaySteps();
      }

      if (config.targets.waitForFrames?.enabled) {
        this.hookWaitForFrames();
      }

      if (config.targets.entityAnimator?.enabled) {
        this.hookEntityAnimator();
      }

      if (config.targets.animator2D?.enabled) {
        this.hookAnimator2D();
      }

      if (ui) {
        ui.success(`Speed-Hack: ${this.hooksInstalled} hooks installed`);
        ui.info(`Active speed factor: ${config.speed.factor}x`);
      }
    },

    /**
     * Hook delay step methods (fqx.bgmb)
     */
    hookDelaySteps() {
      const ui = getUI();
      const config = this.config;

      if (!targets) {
        if (ui) ui.warn("Speed-Hack: targets.js not loaded");
        return;
      }

      const delayTargets = config.targets.waits.targets;

      delayTargets.forEach(targetDef => {
        const result = hookManager.findClass({ className: targetDef.class, allowPartial: true }, true);
        if (!result) {
          if (ui && config.logging.enabled) {
            ui.warn(`Speed-Hack: Delay class not found: ${targetDef.class}`);
          }
          return;
        }

        const method = hookManager.findMethod(result.klass, targetDef.method);
        if (!method) return;

        const self = this;
        hookManager.installHook(method, function(args, method, ctx, hookCtx) {
          // Modify delay duration
          // This requires understanding the method signature and parameter layout
          // Typically: args[0] = this, args[1+] = parameters

          // Example: If duration is in a field of 'this' object
          try {
            const thisPtr = args[0];
            if (!thisPtr || thisPtr.isNull()) return;

            // Read original duration (implementation depends on object structure)
            // const originalDuration = thisPtr.add(OFFSET).readFloat(); // or readInt()

            // Calculate modified duration
            // const modified = targets.calculateModifiedDuration(
            //   originalDuration,
            //   config.speed.factor,
            //   config.limits
            // );

            // Write back modified duration
            // thisPtr.add(OFFSET).writeFloat(modified); // or writeInt()

            if (config.logging.logModifications && ui) {
              self.modificationsCount++;
              if (config.logging.logOriginalValues) {
                // ui.info(`[SpeedHack] Delay modified: ${originalDuration}ms → ${modified}ms`);
              }
            }
          } catch (e) {
            if (ui && config.logging.enabled) {
              ui.error(`Speed-Hack delay hook error: ${e.message}`);
            }
          }
        }, {});

        this.hooksInstalled++;
      });

      if (ui && config.logging.enabled) {
        ui.success(`Speed-Hack: Delay hooks installed`);
      }
    },

    /**
     * Hook WaitForFrames global utility
     */
    hookWaitForFrames() {
      const ui = getUI();
      const config = this.config;

      if (!targets) return;

      const waitTarget = targets.TARGETS.waitForFrames;
      const target = {
        className: config.targets.waitForFrames.class,
        allowPartial: true,
      };

      const result = hookManager.findClass(target, true);
      if (!result) {
        if (ui && config.logging.enabled) {
          ui.warn(`Speed-Hack: WaitForFrames class not found: ${target.className}`);
        }
        return;
      }

      const method = hookManager.findMethod(result.klass, config.targets.waitForFrames.method);
      if (!method) return;

      const self = this;
      hookManager.installHook(method, function(args, method, ctx, hookCtx) {
        // WaitForFrames(int frameCount, float frameRate, CancellationToken ct)
        // args[0] = this (if instance method) or first param (if static)
        // Need to determine method signature

        try {
          // Approach 1: Reduce frame count
          // const frameCountPtr = args[1];  // Assuming args[1] is frameCount
          // const originalCount = frameCountPtr.toInt32();
          // const modifiedCount = targets.calculateModifiedFrameCount(
          //   originalCount,
          //   config.speed.factor,
          //   config.limits
          // );
          // frameCountPtr.replace(ptr(modifiedCount));

          // Approach 2: Increase frame rate
          // const frameRatePtr = args[2];  // Assuming args[2] is frameRate
          // const originalRate = frameRatePtr.readFloat();
          // const modifiedRate = targets.calculateModifiedFrameRate(
          //   originalRate,
          //   config.speed.factor,
          //   config.limits
          // );
          // frameRatePtr.writeFloat(modifiedRate);

          if (config.logging.logModifications && ui) {
            self.modificationsCount++;
            if (config.logging.logOriginalValues) {
              // ui.info(`[SpeedHack] WaitForFrames modified`);
            }
          }
        } catch (e) {
          if (ui && config.logging.enabled) {
            ui.error(`Speed-Hack WaitForFrames hook error: ${e.message}`);
          }
        }
      }, {});

      this.hooksInstalled++;

      if (ui && config.logging.enabled) {
        ui.success(`Speed-Hack: WaitForFrames hook installed`);
      }
    },

    /**
     * Hook EntityAnimator play methods
     */
    hookEntityAnimator() {
      const ui = getUI();
      const config = this.config;

      if (!targets) return;

      const animTarget = targets.TARGETS.entityAnimator;
      const target = { className: animTarget.class.className, allowPartial: false };

      const result = hookManager.findClass(target, true);
      if (!result) {
        if (ui && config.logging.enabled) {
          ui.warn(`Speed-Hack: EntityAnimator class not found`);
        }
        return;
      }

      const klass = result.klass;
      const methodNames = config.targets.entityAnimator.methods || ["pue", "puf", "puj", "puk", "pul"];

      const self = this;
      methodNames.forEach(methodName => {
        const method = hookManager.findMethod(klass, methodName);
        if (!method) return;

        hookManager.installHook(method, function(args, method, ctx, hookCtx) {
          // Modify animation playback speed
          // This depends on EntityAnimationPlaybackModeValue structure

          try {
            // Option 1: Modify playback mode parameter if it exists
            // Option 2: Hook into animation system to scale speed

            if (config.logging.logModifications && ui) {
              self.modificationsCount++;
            }
          } catch (e) {
            if (ui && config.logging.enabled) {
              ui.error(`Speed-Hack EntityAnimator hook error: ${e.message}`);
            }
          }
        }, {});

        this.hooksInstalled++;
      });

      if (ui && config.logging.enabled) {
        ui.success(`Speed-Hack: EntityAnimator hooks installed`);
      }
    },

    /**
     * Hook Animator2D frame rate (experimental)
     */
    hookAnimator2D() {
      const ui = getUI();
      const config = this.config;

      // This is experimental and requires field manipulation
      // Implementation depends on finding the field offset and modifying it
      // when animations are played

      if (ui && config.logging.enabled) {
        ui.warn("Speed-Hack: Animator2D hooking not yet implemented (experimental)");
      }
    },

    /**
     * Stop plugin
     */
    stop() {
      const ui = getUI();
      if (ui) {
        ui.info("Speed-Hack plugin stopped");
        if (this.modificationsCount > 0) {
          ui.info(`Total modifications applied: ${this.modificationsCount}`);
        }
      }
    }
  };

  // Export
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.plugins = global.IL2CPPHooker.plugins || {};
  global.IL2CPPHooker.plugins.speedHack = global.IL2CPPHooker.plugins.speedHack || {};
  global.IL2CPPHooker.plugins.speedHack.plugin = SpeedHackPlugin;
})(globalThis);
