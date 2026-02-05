"use strict";

/**
 * Combat Anim Plugin Configuration
 *
 * mode  -> "skip" | "speed" | ["skip","speed"] | "trace"
 * skip  -> step short-circuiting
 * speed -> delay/frame acceleration
 * trace -> low-noise tracing for discovery
 */

(function (global) {
  const CONFIG = {
    mode: "skip",

    // Runtime tuning (can be overridden via RPC)
    speedFactor: 2.0,
    minDelayMs: 16,

    trace: {
      enabled: false,
      showStack: false,
      onlyWhenTracked: false,
      trackOn: [],
      logTrackOn: false,
      trackedMax: 256,
      targets: [
        "SerialSequencer.bgne",
        "fpq.Start",
      ],
    },

    skip: {
      enabled: true,
      finishTiming: "leave", // "enter" | "leave"
      finishDelayMs: 0, // Optional: delay before forcing completion
      dedupe: true,
      log: false,

      targets: [
        "Core.Engine.Sequencing.Steps.ProjectileStep.bgmb",
        "Core.Engine.Sequencing.Steps.ProjectileInLineStep.bgmb",
        "fqt.bgmb",
        "fqr.bgmb",
        "fqx.bgmb",
      ],

      // Candidate methods to mark a step as completed
      // From trace: bgml consistently appears as the final step-complete signal.
      finishMethods: [
        "bgml",
      ],
    },

    speed: {
      enabled: true,
      log: false,
      minFrames: 1,

      // WaitForFrames: static method qn.oeh(int frameCount, float frameRate, CancellationToken ct)
      waitForFrames: {
        target: "qn.oeh",
        frameCountArg: 0,
        paramCount: 3,
      },
    },
  };

  function mergeDefaults(target, defaults) {
    if (!target || typeof target !== "object") return;
    Object.keys(defaults).forEach((key) => {
      const defVal = defaults[key];
      const curVal = target[key];
      if (curVal === undefined) {
        target[key] = Array.isArray(defVal) ? defVal.slice() : defVal;
        return;
      }
      if (defVal && typeof defVal === "object" && !Array.isArray(defVal)) {
        mergeDefaults(curVal, defVal);
      }
    });
  }

  function normalizeConfig(cfg) {
    if (!cfg || typeof cfg !== "object") return CONFIG;
    if (cfg.__normalized) return cfg;
    if (cfg === CONFIG) {
      cfg.__normalized = true;
      return cfg;
    }
    mergeDefaults(cfg, CONFIG);
    cfg.__normalized = true;
    return cfg;
  }

  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.plugins = global.IL2CPPHooker.plugins || {};
  global.IL2CPPHooker.plugins.combatAnim = global.IL2CPPHooker.plugins.combatAnim || {};
  global.IL2CPPHooker.plugins.combatAnim.CONFIG = CONFIG;
  global.IL2CPPHooker.plugins.combatAnim.normalizeConfig = normalizeConfig;
})(globalThis);
