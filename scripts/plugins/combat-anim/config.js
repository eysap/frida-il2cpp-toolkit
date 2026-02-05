"use strict";

/**
 * Combat Anim Plugin Configuration
 *
 * mode  -> "skip" | "trace"
 * skip  -> step short-circuiting
 * trace -> low-noise tracing for discovery
 */

(function (global) {
  const CONFIG = {
    mode: "skip",

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

      // Optional: steps to short-circuit after start (bgmb). Leave empty if using dropOnAdd only.
      targets: [],

      // Drop steps at add-time (before they run). Use class names or full names.
      dropOnAdd: [],
      // Optional: drop if step.ToString() contains any of these substrings
      dropOnAddToStringContains: [],

      // Candidate methods to mark a step as completed
      // From trace: bgml consistently appears as the final step-complete signal.
      finishMethods: [
        "bgml",
      ],
    },

    // speed: { ... } // removed (not used for current use-case)
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
