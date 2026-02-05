/**
 * Example: Combat Anim Plugin Usage
 *
 * Usage:
 *   frida -U -f com.example.app -l example-combat-anim.js -l load-all.js --no-pause
 */

// Define configuration BEFORE loading load-all.js
globalThis.IL2CPPToolkitConfig = {
  plugins: {
    "combat-anim": {
      enabled: true,

      // "skip" | "speed" | "trace" | ["skip","speed"]
      mode: ["skip", "speed"],

      speedFactor: 2.0,
      minDelayMs: 16,

      trace: {
        enabled: false,
        showStack: false,
        targets: [
          "SerialSequencer.bgne",
          "fpq.Start",
        ],
      },

      skip: {
        enabled: true,
        finishTiming: "leave", // "enter" or "leave"
        finishDelayMs: 0, // e.g. 50-150 to preserve animation-before-damage ordering
        dedupe: true,
        log: false,

        targets: [
          "Core.Engine.Sequencing.Steps.ProjectileStep.bgmb",
          "Core.Engine.Sequencing.Steps.ProjectileInLineStep.bgmb",
          "fqt.bgmb",
          "fqr.bgmb",
          "fqx.bgmb",
        ],

        finishMethods: [
          "bgml",
        ],
      },

      speed: {
        enabled: true,
        log: false,
        minFrames: 1,
        waitForFrames: {
          target: "qn.oeh",
          frameCountArg: 0,
          paramCount: 3,
        },
      },
    },
  },

  ui: {
    verbosity: "normal",
    colors: { enabled: true },
    timestamp: { enabled: true },
  },
};
