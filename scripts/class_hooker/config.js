"use strict";

/**
 * Configuration for Frida IL2CPP Class Hooker
 *
 * Target Configuration:
 * - Specify target class by: assembly + className, or namespace + className, or fullName
 * - Assembly is optional (searches all assemblies if omitted)
 * - Use allowPartial for substring matching on namespace/class names
 *
 * Filter Options:
 * - methodNameContains: Filter by method name substring
 * - methodRegex: Filter by regex pattern (e.g., "^get_|^set_" for properties)
 *
 * Hook Configuration:
 * - Rate limiting: delayMs between hooks, maxHooks safety limit
 * - Logging: args, return values, stack traces, object previews
 * - Special handlers: HTTP request/response analysis, custom type dumping
 *
 * @module config
 */

(function(global) {
  const CONFIG = {
    target: {
      assembly: null, // Example: "Core", "Assembly-CSharp"
      namespace: null, // Example: "Com.Example.Network", "App.Core.Services"
      className: null, // Example: "ApiClient", "NetworkManager", "MessageHandler"
      fullName: null, // Example: "Com.Example.Network.ApiClient"
      pickIndex: 0, // If multiple matches, pick this index
      allowPartial: false, // Allow substring match on namespace/class
    },
    filters: {
      methodNameContains: null, // Example: "Encode"
      methodRegex: null, // Example: "^get_|^set_"
    },
    hook: {
      enabled: true,
      delayMs: 25, // Hook one method every N ms to keep it smooth
      maxHooks: 300, // Safety limit
      logArgs: true,
      logReturn: false,
      showThis: true,
      showStack: false,
      maxStringLength: 200,
      maxArgs: 8,
      rawCallArgs: true, // Keep CALL args raw (no string decoding)
      reqToStringMaxLen: 2048, // Larger cap to include headers when possible
      tryToString: true, // Try managed ToString() on objects
      previewObjects: true, // Show shallow field summary for objects
      maxObjectFields: 6,
      expandDictionaries: true, // Decode Dictionary<string,string> when possible
      maxDictEntries: 6,
      expandLists: true, // Show List<T> size when possible
      expandMultimap: true, // Try to summarize Multimap`2 containers
      logSpecials: true, // Extra logs for known method names
      dumpOnCall: false,
      dumpTypes: [],
      dumpOncePerPtr: true,
      dumpMaxPerType: 20,
      dumpMaxFields: 30,
      dumpIncludeStatic: false,
      analyzeMethods: [],
      analyzeSeparator: true,
    },
  };

  // Export to global scope
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.CONFIG = CONFIG;
})(globalThis);
