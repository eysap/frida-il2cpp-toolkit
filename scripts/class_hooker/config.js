"use strict";

/**
 * Configuration for Frida IL2CPP Class Hooker - Refactored
 *
 * Hierarchical organization with logical grouping:
 *
 * target     → Class selection criteria
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
    target: {
      assembly: null, // Optional: "Core", "Assembly-CSharp"
      namespace: null, // Optional: "Com.Example.Network"
      className: "FightState", // Required: "ApiClient"
      fullName: null, // Alternative: "Com.Example.Network.ApiClient"
      pickIndex: 0, // If multiple matches, select this index
      allowPartial: false, // Enable substring matching
    },

    filters: {
      methodNameContains: null, // Substring filter: "Request"
      methodRegex: null, // Regex filter: "^get_|^set_"
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

    ui: {
      verbosity: "verbose", // "minimal" | "normal" | "verbose"
      // minimal: single line per call
      // normal: structured output with tree formatting
      // verbose: full details + pointers + stack traces
      instanceIds: {
        enabled: true, // Tag instances as Class#N for quick visual grouping
      },

      colors: {
        enabled: true, // ANSI color support
        palette: {
          // Override default colors (optional)
          // error:   "red",
          // warn:    "yellow",
          // success: "green",
          // url:     "cyan",
          // type:    "magenta",
          // key:     "blue",
          // value:   "white",
          // muted:   "gray",
        },
      },

      timestamp: {
        enabled: true, // Show relative timestamps
      },

      truncation: {
        maxStringLength: 80, // Default string truncation
        maxBodyLength: 200, // HTTP body truncation
        ellipsis: "...",
      },

      banner: {
        enabled: true, // Show startup banner
      },
    },
  };

  // Export to global scope
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.CONFIG = CONFIG;
})(globalThis);
