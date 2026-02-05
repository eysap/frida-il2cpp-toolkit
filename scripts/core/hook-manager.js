"use strict";

/**
 * Hook Manager - Generic IL2CPP Hook Installation System
 *
 * Provides a centralized, plugin-friendly API for:
 * - Class and method discovery
 * - Rate-limited hook installation
 * - Hook lifecycle management
 * - Error handling and validation
 *
 * Designed to be used by all plugins (logger, combat-anim, etc.)
 *
 * @module hook-manager
 */

(function(global) {
  const utils = global.IL2CPPHooker?.utils;
  const { LIMITS } = global.IL2CPPHooker || {};

  if (!utils) {
    console.log("[FATAL] hook-manager.js requires utils.js to be loaded first");
    return;
  }

  /**
   * Get UI module reference (lazy)
   */
  function getUI() {
    return global.IL2CPPHooker?.ui;
  }

  /**
   * Safe virtual address extraction
   */
  function safeVirtualAddress(method) {
    try {
      const addr = method.virtualAddress;
      if (!addr || addr.isNull()) return null;
      return addr;
    } catch (_) {
      return null;
    }
  }

  /**
   * Normalize target configuration
   * Extracts namespace/className from fullName
   * Removes .dll extension from assembly name
   */
  function normalizeTarget(cfg) {
    if (cfg.fullName && (!cfg.className || !cfg.namespace)) {
      const lastDot = cfg.fullName.lastIndexOf(".");
      if (lastDot !== -1) {
        cfg.namespace = cfg.fullName.slice(0, lastDot);
        cfg.className = cfg.fullName.slice(lastDot + 1);
      } else {
        cfg.className = cfg.fullName;
      }
    }
    if (cfg.assembly && cfg.assembly.toLowerCase().endsWith(".dll")) {
      cfg.assembly = cfg.assembly.slice(0, -4);
    }
    return cfg;
  }

  /**
   * Check if class matches target criteria
   */
  function classMatches(klass, target) {
    const nameMatch = target.allowPartial
      ? klass.name.includes(target.className || "")
      : klass.name === target.className;
    if (!nameMatch) return false;

    if (target.namespace) {
      const nsMatch = target.allowPartial
        ? klass.namespace.includes(target.namespace)
        : klass.namespace === target.namespace;
      return nsMatch;
    }
    return true;
  }

  /**
   * Find IL2CPP class by target configuration
   *
   * @param {Object} target - Target configuration
   * @param {string} target.assembly - Optional assembly name
   * @param {string} target.namespace - Optional namespace
   * @param {string} target.className - Required class name
   * @param {string} target.fullName - Alternative to namespace.className
   * @param {boolean} target.allowPartial - Enable substring matching
   * @param {number} target.pickIndex - Select this index if multiple matches
   * @param {boolean} silent - Suppress UI output
   * @returns {Object|null} { assembly, klass } or null if not found
   */
  function findClass(target, silent = false) {
    const ui = getUI();
    const assemblies = [];

    if (target.assembly) {
      try {
        assemblies.push(Il2Cpp.domain.assembly(target.assembly));
      } catch (_) {
        if (!silent && ui) ui.error(`Assembly not found: ${target.assembly}`);
        return null;
      }
    } else {
      Il2Cpp.domain.assemblies.forEach((a) => assemblies.push(a));
    }

    const matches = [];
    assemblies.forEach((assembly) => {
      try {
        assembly.image.classes.forEach((klass) => {
          if (classMatches(klass, target)) {
            matches.push({ assembly, klass });
          }
        });
      } catch (_) {}
    });

    if (matches.length === 0) {
      if (!silent && ui) {
        ui.warn("No matching class found.");
        if (target.className) {
          ui.info("Suggestions (class name contains):");
          assemblies.forEach((assembly) => {
            try {
              assembly.image.classes.forEach((klass) => {
                if (klass.name.includes(target.className)) {
                  ui.suggestion(`${assembly.name}`, `${klass.namespace}.${klass.name}`);
                }
              });
            } catch (_) {}
          });
        }
      }
      return null;
    }

    const pick = Math.min(Math.max(target.pickIndex || 0, 0), matches.length - 1);
    const chosen = matches[pick];

    if (!silent && ui) {
      ui.info(`Found ${matches.length} matching class(es)`);
      ui.success(`Using [${pick}] ${chosen.assembly.name} -> ${chosen.klass.namespace}.${chosen.klass.name}`);
    }

    return chosen;
  }

  /**
   * Find method by name in a class
   *
   * @param {Object} klass - IL2CPP class object
   * @param {string} methodName - Method name to find
   * @param {number} paramCount - Optional parameter count filter
   * @returns {Object|null} IL2CPP method object or null
   */
  function findMethod(klass, methodName, paramCount = null) {
    try {
      for (const method of klass.methods) {
        if (method.name === methodName) {
          if (paramCount === null || method.parameterCount === paramCount) {
            return method;
          }
        }
      }
    } catch (_) {}
    return null;
  }

  /**
   * Build list of methods matching filters
   *
   * @param {Object} klass - IL2CPP class object
   * @param {Object} filters - Filter configuration
   * @param {string} filters.methodNameContains - Substring filter
   * @param {string} filters.methodRegex - Regex pattern filter
   * @param {Array<string>} filters.exclude - Methods to exclude
   * @returns {Array} Filtered method list
   */
  function buildMethodList(klass, filters = {}) {
    const exclude = Array.isArray(filters.exclude) ? filters.exclude : [];
    const excludeSet = new Set(
      exclude
        .filter((val) => typeof val === "string")
        .map((val) => {
          let name = val.trim();
          if (!name) return null;
          if (name.startsWith(".")) name = name.slice(1);
          const paren = name.indexOf("(");
          if (paren !== -1) name = name.slice(0, paren);
          if (name.includes(".")) name = name.split(".").pop();
          return name.trim();
        })
        .filter(Boolean)
    );

    return klass.methods.filter((m) => {
      if (excludeSet.size > 0 && excludeSet.has(m.name)) {
        return false;
      }
      if (filters.methodNameContains && !m.name.includes(filters.methodNameContains)) {
        return false;
      }
      if (filters.methodRegex) {
        try {
          const re = new RegExp(filters.methodRegex);
          if (!re.test(m.name)) return false;
        } catch (_) {}
      }
      const addr = safeVirtualAddress(m);
      if (!addr) return false;
      m.__hookAddress = addr;
      return true;
    });
  }

  /**
   * Install a single hook with custom implementation
   *
   * @param {Object} method - IL2CPP method object
   * @param {Function} implementation - Hook implementation function(args, method, context)
   * @param {Object} context - Optional context object passed to implementation
   * @returns {boolean} True if hook installed successfully
   */
  function installHook(method, implementation, context = {}) {
    const ui = getUI();
    try {
      const addr = method.__hookAddress || safeVirtualAddress(method);
      if (!addr) {
        if (ui) ui.warn(`Skipping ${method.name}: no virtual address`);
        return false;
      }

      Interceptor.attach(addr, {
        onEnter(args) {
          try {
            implementation(args, method, context, this);
          } catch (e) {
            if (ui) ui.error(`Hook error in ${method.name}: ${e.message}`);
          }
        }
      });

      return true;
    } catch (e) {
      if (ui) ui.error(`Failed to install hook for ${method.name}: ${e.message}`);
      return false;
    }
  }

  /**
   * Install hooks on multiple methods with rate limiting
   *
   * @param {Array} methods - Array of IL2CPP method objects
   * @param {Function} implementation - Hook implementation function
   * @param {Object} options - Installation options
   * @param {number} options.delayMs - Delay between hook installations
   * @param {number} options.maxHooks - Maximum number of hooks to install
   * @param {Object} options.context - Context object for hooks
   * @param {Function} options.onProgress - Progress callback(current, total)
   * @param {Function} options.onComplete - Completion callback(installed, failed)
   */
  function installHooks(methods, implementation, options = {}) {
    const ui = getUI();
    const delayMs = options.delayMs || 25;
    const maxHooks = options.maxHooks || (LIMITS?.MAX_HOOKS || 300);
    const context = options.context || {};
    const onProgress = options.onProgress || (() => {});
    const onComplete = options.onComplete || (() => {});

    const toInstall = methods.slice(0, maxHooks);
    let installed = 0;
    let failed = 0;

    if (ui) ui.info(`Installing ${toInstall.length} hooks (delay: ${delayMs}ms)...`);

    function installNext(index) {
      if (index >= toInstall.length) {
        if (ui) ui.success(`Hooks installed: ${installed} success, ${failed} failed`);
        onComplete(installed, failed);
        return;
      }

      const method = toInstall[index];
      const success = installHook(method, implementation, context);

      if (success) installed++;
      else failed++;

      onProgress(index + 1, toInstall.length);

      if (delayMs > 0) {
        setTimeout(() => installNext(index + 1), delayMs);
      } else {
        installNext(index + 1);
      }
    }

    installNext(0);
  }

  /**
   * List all methods in a class
   *
   * @param {Object} klass - IL2CPP class object
   * @param {boolean} silent - Suppress UI output
   * @returns {Array} Array of method objects with metadata
   */
  function listMethods(klass, silent = false) {
    const ui = getUI();
    const methods = [];
    klass.methods.forEach((m) => {
      const params = m.parameters
        .map((p) => `${p.type.name} ${p.name}`)
        .join(", ");
      const sig = `${m.isStatic ? "static " : ""}${m.returnType.name} ${m.name}(${params})`;
      const addr = safeVirtualAddress(m);
      methods.push({
        method: m,
        signature: sig,
        address: addr ? addr.toString() : null
      });
    });

    if (!silent && ui) {
      const classFullName = klass.namespace
        ? `${klass.namespace}.${klass.name}`
        : klass.name;
      ui.methodListStart(classFullName, methods.length);
      methods.forEach((m, i) => {
        ui.methodListItem(i, m.signature, m.address);
      });
      ui.methodListEnd();
    }

    return methods;
  }

  // Export to global scope
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.hookManager = {
    normalizeTarget,
    findClass,
    findMethod,
    buildMethodList,
    installHook,
    installHooks,
    listMethods,
  };
})(globalThis);
