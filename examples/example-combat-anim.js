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

      // "skip" | "trace"
      mode: "skip",

      trace: {
        enabled: false,
        showStack: false,
        targets: ["SerialSequencer.bgne", "fpq.Start"],
      },

      skip: {
        enabled: true,
        finishTiming: "leave", // "enter" or "leave"
        finishDelayMs: 0,
        dedupe: true,
        log: false,

        targets: [],

        finishMethods: ["bgml"],
        dropOnAdd: ["gee"],
        dropOnAddToStringContains: [],
      },
    },
  },

  ui: {
    verbosity: "normal",
    colors: { enabled: true },
    timestamp: { enabled: true },
  },
};
