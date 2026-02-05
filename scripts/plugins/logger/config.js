"use strict";

/**
 * Configuration for Frida IL2CPP Class Hooker - Refactored
 *
 * Hierarchical organization with logical grouping:
 *
 * target     → Single class selection criteria
 * targets    → Multi-class selection (array of targets or class/method strings)
 * filters    → Method filtering rules
 * performance → Rate limiting and resource management
 * logging    → What information to log
 * formatting → How to display logged values
 * dump       → Deep object inspection settings
 * analysis   → Special analysis handlers
 *
 * @module config
 */

(function (global) {
  const CONFIG = {
    // Optional: use "targets" for multi-class hooking. If provided, "target" is ignored.
    // Strings can be "ClassName" or "ClassName.MethodName".
    // For namespaced classes without methods, prefer object form with fullName.
    targets: null,

    target: {
      assembly: null, // Optional: "Core", "Assembly-CSharp"
      namespace: null, // Optional: "Com.Example.Network"
      className: null, // Required: "ApiClient"
      fullName: null, // Alternative: "Com.Example.Network.ApiClient"
      pickIndex: 0, // If multiple matches, select this index
      allowPartial: false, // Enable substring matching
    },

    filters: {
      methodNameContains: null, // Substring filter: "Request"
      methodRegex: null, // Regex filter: "^get_|^set_"
      exclude: [], // Method names to exclude
    },

    performance: {
      enabled: true, // Master on/off switch
      hookDelayMs: 25, // Delay between hook installations (stability)
      maxHooks: 300, // Maximum hooks per session (safety limit)
    },

    logging: {
      args: true, // Log method arguments
      return: false, // Log return values
      showThis: true, // Display 'this' pointer
      showStack: false, // Capture stack traces (expensive!)
      maxArgs: 8, // Maximum arguments to display
      rawArgs: true, // Show raw pointers in CALL log (prevents crashes on complex objects)
    },

    formatting: {
      // String handling
      strings: {
        maxLength: 200, // Default string truncation
        httpMaxLength: 2048, // For HTTP ToString() (includes headers)
      },

      numbers: {
        int64Format: "hex+dec", // "hex" | "dec" | "hex+dec"
      },

      // Object representation
      objects: {
        tryToString: true, // Invoke managed ToString() method
        showFields: true, // Display shallow field preview
        maxFields: 6, // Maximum fields in preview
        omitFields: [], // Field names to hide in previews
        omitFieldPatterns: ["^<.*>k__BackingField$"], // Regex patterns to hide noise
        fieldAllowlistByType: {
          "Google.Protobuf.CodedOutputStream": ["leaveOpen", "buffer"],
        },
        fieldDenylistByType: {},
      },

      // Collection expansion
      collections: {
        dictionaries: {
          enabled: true, // Show Dictionary<K,V> contents
          maxEntries: 6, // Maximum entries to display
        },
        lists: {
          enabled: true, // Show List<T> size
        },
        multimaps: {
          enabled: true, // Show Multimap`2 summary
        },
      },
    },

    dump: {
      enabled: false, // Master dump switch
      types: [], // Type names to dump: ["UserProfile", "GameState"]
      deduplication: true, // Skip already-dumped pointers
      maxPerType: 20, // Maximum dumps per type
      maxFields: 30, // Maximum fields per dump
      includeStatic: false, // Include static fields in dump
    },

    analysis: {
      // HTTP request/response detection
      http: {
        enabled: true, // Detect NewRequest, CallApi, SendAsync
      },

      // Custom method analysis
      custom: {
        methods: [], // Method names for detailed analysis
        // Example: ["ProcessTransaction", "UpdateBalance"]
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

  // Export to global scope
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.CONFIG = CONFIG;
  global.IL2CPPHooker.normalizeConfig = normalizeConfig;

  // Also export for plugin system
  global.IL2CPPHooker.plugins = global.IL2CPPHooker.plugins || {};
  global.IL2CPPHooker.plugins.logger = global.IL2CPPHooker.plugins.logger || {};
  global.IL2CPPHooker.plugins.logger.CONFIG = CONFIG;
})(globalThis);
