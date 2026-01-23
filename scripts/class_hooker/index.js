"use strict";

/**
 * Frida IL2CPP Class Hooker - Main Entry Point
 *
 * Dynamic analysis tool for Unity IL2CPP applications.
 * Requires: frida-il2cpp-bridge (https://github.com/vfsfitvnm/frida-il2cpp-bridge)
 *
 * Features:
 * - Flexible class/method targeting (assembly, namespace, class name, regex filters)
 * - Intelligent type handling (String, Dictionary, List, Multimap, custom objects)
 * - Rate-limited hook installation for stability (300 max hooks, 25ms delay)
 * - Configurable logging (args, return values, stack traces, object field preview)
 * - HTTP request/response analysis support
 *
 * Usage:
 *   1. Configure target in config.js (className or fullName required)
 *   2. Optional: Set filters for method selection
 *   3. Load all module files in order:
 *      frida -l constants.js -l config.js -l utils.js -l formatters.js \
 *            -l http-analysis.js -l core.js -l index.js -p <pid>
 *
 * @module index
 */

(function(global) {
  // Ensure all dependencies are loaded
  if (!global.IL2CPPHooker ||
      !global.IL2CPPHooker.CONFIG ||
      !global.IL2CPPHooker.core ||
      !global.IL2CPPHooker.utils ||
      !global.IL2CPPHooker.formatters) {
    console.log("[!] ERROR: Dependencies not loaded. Load modules in this order:");
    console.log("    1. constants.js");
    console.log("    2. config.js");
    console.log("    3. utils.js");
    console.log("    4. formatters.js");
    console.log("    5. http-analysis.js");
    console.log("    6. core.js");
    console.log("    7. index.js (this file)");
    return;
  }

  const CONFIG = global.IL2CPPHooker.CONFIG;
  const core = global.IL2CPPHooker.core;

  /**
   * Main execution function
   */
  function main() {
    console.log("[+] Frida IL2CPP Class Hooker - Modular Edition");

    // Prevent duplicate initialization
    if (global.__frida_il2cpp_hooker_initialized) {
      console.log("[!] Already initialized, skipping duplicate run.");
      return;
    }
    global.__frida_il2cpp_hooker_initialized = true;

    // Normalize and validate target configuration
    const target = core.normalizeTarget(CONFIG.target);
    if (!target.className) {
      console.log("[!] Please set target.className or target.fullName in config.js");
      return;
    }

    // Select target class
    const chosen = core.selectClass(target);
    if (!chosen) {
      console.log("[!] Class selection failed. Check configuration and try again.");
      return;
    }

    const klass = chosen.klass;
    const classFullName = klass.namespace
      ? `${klass.namespace}.${klass.name}`
      : klass.name;

    // List all methods
    core.listMethods(klass);

    // Build hook list based on filters
    const methodsToHook = core.buildHookList(klass, CONFIG.filters);
    console.log(`[+] Selected ${methodsToHook.length} methods to hook`);

    // Install hooks
    core.hookMethods(klass, classFullName, methodsToHook, CONFIG);
  }

  // Execute when IL2CPP is ready
  Il2Cpp.perform(() => {
    try {
      main();
    } catch (e) {
      console.log(`[!] Error during execution: ${e.message}`);
      console.log(e.stack);
    }
  });
})(globalThis);
