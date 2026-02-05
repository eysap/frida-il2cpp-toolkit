"use strict";

/**
 * Logger Plugin - Method Call Logging with Type-Aware Formatting
 *
 * Migrated from original class_hooker to plugin architecture.
 * Provides comprehensive method call logging with:
 * - Argument and return value logging
 * - HTTP request/response analysis
 * - Object field previews
 * - Custom type dumping
 *
 * @module plugins/logger
 */

(function(global) {
  const hookManager = global.IL2CPPHooker?.hookManager;
  const formatters = global.IL2CPPHooker?.formatters;
  const httpAnalysis = global.IL2CPPHooker?.httpAnalysis;
  const utils = global.IL2CPPHooker?.utils;
  const { LIMITS } = global.IL2CPPHooker || {};

  if (!hookManager || !formatters || !utils) {
    console.log("[FATAL] Logger plugin requires hook-manager, formatters, and utils");
    return;
  }

  function getUI() {
    return global.IL2CPPHooker?.ui;
  }

  function normalizeMethodList(methods) {
    if (!methods) return null;
    if (typeof methods === "string") {
      const name = methods.trim();
      return name ? [name] : null;
    }
    if (!Array.isArray(methods)) return null;
    const list = methods
      .filter((m) => typeof m === "string")
      .map((m) => m.trim())
      .filter(Boolean);
    return list.length > 0 ? list : null;
  }

  function mergeFilters(base, extra) {
    const out = Object.assign({}, base || {});
    if (!extra || typeof extra !== "object") return out;

    if (extra.methodNameContains !== undefined && extra.methodNameContains !== null) {
      out.methodNameContains = extra.methodNameContains;
    }
    if (extra.methodRegex !== undefined && extra.methodRegex !== null) {
      out.methodRegex = extra.methodRegex;
    }

    if (Array.isArray(extra.exclude)) {
      const current = Array.isArray(out.exclude) ? out.exclude : [];
      out.exclude = Array.from(new Set(current.concat(extra.exclude)));
    }
    return out;
  }

  function normalizeTargetDef(def) {
    if (!def) return null;
    if (typeof def === "string") {
      const name = def.trim();
      if (!name) return null;
      const dot = name.lastIndexOf(".");
      if (dot > 0 && dot < name.length - 1) {
        const classPart = name.slice(0, dot);
        const methodPart = name.slice(dot + 1);
        return { fullName: classPart, methods: [methodPart] };
      }
      return { className: name };
    }
    if (typeof def === "object") {
      const normalized = Object.assign({}, def);
      if (normalized.method && !normalized.methods) {
        normalized.methods = normalized.method;
      }
      normalized.methods = normalizeMethodList(normalized.methods);
      return normalized;
    }
    return null;
  }

  function buildTargets(config) {
    const rawTargets = Array.isArray(config?.targets) && config.targets.length > 0
      ? config.targets
      : (config?.target ? [config.target] : []);

    const results = [];
    const byKey = new Map();
    const seen = new Set();

    rawTargets.forEach((entry) => {
      const def = normalizeTargetDef(entry);
      if (!def) return;
      const normalized = hookManager.normalizeTarget(Object.assign({}, def));
      if (!normalized.className && !normalized.fullName) return;

      const key = [
        normalized.assembly || "",
        normalized.namespace || "",
        normalized.className || normalized.fullName || "",
        normalized.allowPartial ? "partial" : "exact",
        normalized.pickIndex ?? 0,
      ].join("|");
      if (seen.has(key)) {
        const existing = byKey.get(key);
        const mergedMethods = normalizeMethodList(
          (existing?.methods || []).concat(normalized.methods || [])
        );
        if (mergedMethods) existing.methods = mergedMethods;
        if (normalized.filters) {
          existing.filters = mergeFilters(existing.filters, normalized.filters);
        }
        return;
      }
      seen.add(key);
      byKey.set(key, normalized);
      results.push(normalized);
    });

    return results;
  }

  // Import core.js functionality (will be refactored)
  const core = global.IL2CPPHooker?.core || {};

  /**
   * Logger Plugin Implementation
   */
  const LoggerPlugin = {
    name: "logger",
    version: "1.0.0",

    /**
     * Initialize the logger plugin
     *
     * @param {Object} config - Plugin configuration
     * @returns {boolean} True if initialization successful
     */
    init(config) {
      const ui = getUI();

      // Merge with default config to ensure all properties exist
      const defaultConfig = global.IL2CPPHooker?.plugins?.logger?.CONFIG || {};
      this.config = this.mergeConfig(config, defaultConfig);

      const targets = buildTargets(this.config);
      if (targets.length === 0) {
        if (ui) ui.error("Logger plugin requires target or targets[] in configuration");
        return false;
      }

      if (ui) {
        const label = targets.length === 1
          ? (targets[0].methods && targets[0].methods.length === 1
            ? `${targets[0].className || targets[0].fullName}.${targets[0].methods[0]}`
            : (targets[0].className || targets[0].fullName))
          : `${targets.length} target(s)`;
        ui.info(`Logger plugin initialized for: ${label}`);
      }

      return true;
    },

    /**
     * Start the logger plugin
     */
    start() {
      const ui = getUI();
      const config = this.config;  // Use merged config from init()

      const targets = buildTargets(config);
      if (targets.length === 0) {
        if (ui) ui.error("Logger: Class selection failed");
        return;
      }

      let hookedClasses = 0;

      targets.forEach((target) => {
        const chosen = hookManager.findClass(target);
        if (!chosen) {
          if (ui) ui.warn(`Logger: Class not found for target ${target.className || target.fullName}`);
          return;
        }

        const klass = chosen.klass;
        const classFullName = klass.namespace
          ? `${klass.namespace}.${klass.name}`
          : klass.name;

        // Build method list based on filters
        const filters = mergeFilters(config.filters, target.filters);
        let methodsToHook = hookManager.buildMethodList(klass, filters);
        const allowMethods = normalizeMethodList(target.methods);
        if (allowMethods) {
          const allowSet = new Set(allowMethods);
          methodsToHook = methodsToHook.filter((m) => allowSet.has(m.name));
        }

        // Display banner
        if (ui) {
          ui.banner({
            target: classFullName,
            assembly: chosen.assembly.name,
            methodCount: methodsToHook.length,
          });
        }

        // List all methods
        hookManager.listMethods(klass);

        if (ui) ui.info(`Selected ${methodsToHook.length} methods to hook`);

        // Install hooks using legacy core.js for now
        // TODO: Refactor to use hookManager.installHooks with custom logger implementation
        if (core.hookMethods) {
          core.hookMethods(klass, classFullName, methodsToHook, config);
          hookedClasses += 1;
        } else if (ui) {
          ui.error("Logger: core.hookMethods not available");
        }
      });

      if (hookedClasses === 0 && ui) {
        ui.error("Logger: Class selection failed");
      }
    },

    /**
     * Merge user config with defaults (deep merge)
     */
    mergeConfig(userConfig, defaults) {
      const merged = JSON.parse(JSON.stringify(defaults)); // Deep clone

      function deepMerge(target, source) {
        for (const key in source) {
          if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            target[key] = target[key] || {};
            deepMerge(target[key], source[key]);
          } else if (source[key] !== undefined) {
            target[key] = source[key];
          }
        }
        return target;
      }

      return deepMerge(merged, userConfig);
    },

    /**
     * Stop the logger plugin
     */
    stop() {
      const ui = getUI();
      if (ui) ui.info("Logger plugin stopped");
    }
  };

  // Export plugin
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.plugins = global.IL2CPPHooker.plugins || {};
  global.IL2CPPHooker.plugins.logger = { plugin: LoggerPlugin };
})(globalThis);
