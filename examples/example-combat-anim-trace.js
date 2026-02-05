/**
 * Example: Combat Anim Plugin (Trace)
 *
 * Usage:
 *   frida -U -f com.example.app -l example-combat-anim-trace.js -l load-all.js --no-pause
 */

// Define configuration BEFORE loading load-all.js
globalThis.IL2CPPToolkitConfig = {
  plugins: {
    "combat-anim": {
      enabled: true,
      mode: "trace",

      trace: {
        enabled: true,
        showStack: false,
        onlyWhenTracked: true,
        logTrackOn: false,
        trackOn: [
          // Track only these step starts (reduce noise)
          "Core.Engine.Sequencing.Steps.ProjectileStep.bgmb",
          "Core.Engine.Sequencing.Steps.ProjectileInLineStep.bgmb",
          "fqt.bgmb",
          "fqr.bgmb",
          "fqx.bgmb",
        ],
        targets: [
          // Base step lifecycle (only logs when tracked)
          { className: "fpq", methods: ["Start", "bgmm", "bgml", "bgmn"] },
          // WaitForFrames helper (static)
          "qn.oeh",
        ],
      },

      skip: { enabled: false },
      speed: { enabled: false },
    },
  },

  ui: {
    verbosity: "normal",
    colors: { enabled: true },
    timestamp: { enabled: true },
  },
};
