/**
 * Example: Logger Plugin Usage
 *
 * Classic method call logging - migrated from original class_hooker
 * Usage: frida -U -f com.example.app -l example-logger.js --no-pause
 */

// Define configuration BEFORE loading main.js
globalThis.IL2CPPToolkitConfig = {
  // Plugin activation
  plugins: {
    logger: {
      enabled: true,

      // Target class selection
      // target: {
      //   assembly: null, // Optional: "Assembly-CSharp"
      //   namespace: null, // Your namespace
      //   className: "fqt", // Your class
      //   fullName: null, // Alternative: "Com.Example.ApiClient"
      //   allowPartial: false,
      // },

      targets: [
        "Core.Engine.Sequencing.SerialSequencer.bgne",
        // { className: "ProjectileStep", methods: ["bgmb"] },
        // { className: "ProjectileInLineStep", methods: ["bgmb"] },
        // { className: "fqt", methods: ["bgmb"] },
        // { className: "fqr", methods: ["bgmb"] },
        // { className: "fqx", methods: ["bgmb"] },
      ],

      // Method filters
      filters: {
        methodNameContains: null, // e.g., "Request"
        methodRegex: null, // e.g., "^get_|^set_"
        exclude: [], // e.g., ["ToString", "GetHashCode"]
      },

      // Logging options
      logging: {
        args: true,
        return: false,
        showThis: true,
        showStack: true,
        maxArgs: 8,
        rawArgs: true,
      },

      // Formatting
      formatting: {
        strings: {
          maxLength: -1, // -1 disables string truncation in previews/ToString()
          httpMaxLength: 2048,
        },
        objects: {
          tryToString: true,
          showFields: false,
          maxFields: 6,
        },
      },

      // Performance
      // Analysis options
      analysis: {
        http: {
          enabled: false, // HTTP request/response analysis
        },
      },

      performance: {
        enabled: true,
        hookDelayMs: 25,
        maxHooks: 300,
      },

      // UI
    },
  },

  // Global UI config
  ui: {
    verbosity: "verbose",
    colors: { enabled: true },
    timestamp: { enabled: true },
    truncation: {
      maxStringLength: -1, // -1 disables UI-level truncation
      maxBodyLength: 400,
    },
  },
};

// Load order: bridge → core → plugins → main
// (Assumes frida-il2cpp-bridge is already loaded)
