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
        // Only log ToString() of steps being added
        onlyWhenTracked: false,
        logTrackOn: false,
        trackOn: [],
        targets: [
          {
            fullName: "Core.Engine.Sequencing.SerialSequencer",
            methods: ["bgne"],
            inspectArgIndex: 1,
            inspectToString: true,
            ignoreTrack: true,
          },
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
