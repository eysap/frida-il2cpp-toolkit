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
 * - Modern UI output with colors, box-drawing, and structured formatting
 *
 * @module index
 */

(function(global) {
  const hooker = global.IL2CPPHooker;

  // Validate all required modules are loaded
  const required = ['CONFIG', 'core', 'utils', 'formatters', 'ui'];
  const missing = required.filter(m => !hooker || !hooker[m]);

  if (missing.length > 0) {
    console.log(`[FATAL] Missing modules: ${missing.join(', ')}`);
    console.log('');
    console.log('Load order:');
    console.log('  1. constants.js');
    console.log('  2. config.js');
    console.log('  3. utils.js');
    console.log('  4. formatters.js');
    console.log('  5. http-analysis.js');
    console.log('  6. ui/colors.js');
    console.log('  7. ui/box.js');
    console.log('  8. ui/index.js');
    console.log('  9. core.js');
    console.log(' 10. index.js');
    return;
  }

  const CONFIG = hooker.normalizeConfig
    ? hooker.normalizeConfig(hooker.CONFIG)
    : hooker.CONFIG;
  const core = hooker.core;
  const ui = hooker.ui;

  /**
   * Main execution function
   */
  function main() {
    // Prevent duplicate initialization
    if (global.__frida_il2cpp_hooker_initialized) {
      ui.warn("Already initialized, skipping duplicate run.");
      return;
    }
    global.__frida_il2cpp_hooker_initialized = true;

    // Initialize UI module
    ui.init(CONFIG.ui);

    // Normalize and validate target configuration
    const target = core.normalizeTarget(CONFIG.target);
    if (!target.className) {
      ui.error("Please set target.className or target.fullName in config.js");
      return;
    }

    // Select target class
    const chosen = core.selectClass(target);
    if (!chosen) {
      ui.error("Class selection failed. Check configuration and try again.");
      return;
    }

    const klass = chosen.klass;
    const classFullName = klass.namespace
      ? `${klass.namespace}.${klass.name}`
      : klass.name;

    // Build hook list based on filters
    const methodsToHook = core.buildHookList(klass, CONFIG.filters);

    // Display banner
    ui.banner({
      target: classFullName,
      assembly: chosen.assembly.name,
      methodCount: methodsToHook.length,
    });

    // List all methods
    core.listMethods(klass);

    ui.info(`Selected ${methodsToHook.length} methods to hook`);

    // Install hooks
    core.hookMethods(klass, classFullName, methodsToHook, CONFIG);
  }

  // Execute when IL2CPP is ready
  Il2Cpp.perform(() => {
    try {
      main();
    } catch (e) {
      ui.error(`Execution error: ${e.message}`);
      console.log(e.stack);
    }
  });
})(globalThis);
