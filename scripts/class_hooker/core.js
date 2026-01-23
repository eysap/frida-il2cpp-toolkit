"use strict";

/**
 * Core class selection and method hooking orchestration
 *
 * Class Discovery:
 * - Multi-assembly search with optional assembly filtering
 * - Namespace and class name matching (exact or partial)
 * - Intelligent suggestions when no matches found
 * - Multiple match handling with configurable selection
 *
 * Method Filtering:
 * - Name substring filtering
 * - Regex pattern matching
 * - Virtual address validation (hooks only executable methods)
 *
 * Hook Installation:
 * - Rate-limited installation (configurable delay between hooks)
 * - Safety limits (max hooks per session)
 * - Argument and return value logging with type-aware formatting
 * - Stack trace capture for debugging
 * - Special HTTP method handlers (NewRequest, CallApi, SendAsync)
 * - Custom method analysis support (extensible)
 * - Object dumping for configured types
 *
 * @module core
 */

(function(global) {
  const utils = global.IL2CPPHooker.utils;
  const formatters = global.IL2CPPHooker.formatters;
  const httpAnalysis = global.IL2CPPHooker.httpAnalysis;
  const { LIMITS } = global.IL2CPPHooker;

  /**
   * Normalizes target configuration by extracting namespace/className from fullName
   * and removing .dll extension from assembly name if present
   * @param {Object} cfg - Target configuration object
   * @returns {Object} Normalized configuration
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
   * Checks if class matches target criteria
   * @param {Il2Cpp.Class} klass - IL2CPP class object
   * @param {Object} target - Target configuration
   * @returns {boolean} True if class matches
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
   * Searches for IL2CPP classes matching the target configuration
   * @param {Object} target - Target configuration with optional assembly, namespace, className
   * @returns {Object|null} Chosen class match with {assembly, klass} or null if none found
   */
  function selectClass(target) {
    const assemblies = [];
    if (target.assembly) {
      try {
        assemblies.push(Il2Cpp.domain.assembly(target.assembly));
      } catch (_) {
        console.log(`[!] Assembly not found: ${target.assembly}`);
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
      console.log("[!] No matching class found.");
      if (target.className) {
        console.log("[*] Suggestions (class name contains):");
        assemblies.forEach((assembly) => {
          try {
            assembly.image.classes.forEach((klass) => {
              if (klass.name.includes(target.className)) {
                console.log(
                  `  ${assembly.name} -> ${klass.namespace}.${klass.name}`
                );
              }
            });
          } catch (_) {}
        });
      }
      return null;
    }

    console.log(`[+] Found ${matches.length} matching class(es):`);
    matches.forEach((m, i) => {
      console.log(
        `  [${i}] ${m.assembly.name} -> ${m.klass.namespace}.${m.klass.name}`
      );
    });

    const pick = Math.min(Math.max(target.pickIndex || 0, 0), matches.length - 1);
    const chosen = matches[pick];
    console.log(
      `[+] Using [${pick}] ${chosen.assembly.name} -> ${chosen.klass.namespace}.${chosen.klass.name}`
    );
    return chosen;
  }

  /**
   * Lists all methods of a class with signatures
   * @param {Il2Cpp.Class} klass - IL2CPP class object
   */
  function listMethods(klass) {
    console.log("\n=== METHODS ===");
    klass.methods.forEach((m, i) => {
      const params = m.parameters
        .map((p) => `${p.type.name} ${p.name}`)
        .join(", ");
      const sig = `${m.isStatic ? "static " : ""}${m.returnType.name} ${
        m.name
      }(${params})`;
      const addr =
        m.virtualAddress && !m.virtualAddress.isNull()
          ? m.virtualAddress
          : "null";
      console.log(`  [${i}] ${sig} @ ${addr}`);
    });
    console.log("=== END METHODS ===\n");
  }

  /**
   * Builds list of methods to hook based on filters
   * @param {Il2Cpp.Class} klass - IL2CPP class object
   * @param {Object} filters - Filter configuration
   * @returns {Array} Array of methods to hook
   */
  function buildHookList(klass, filters) {
    return klass.methods.filter((m) => {
      if (
        filters.methodNameContains &&
        !m.name.includes(filters.methodNameContains)
      ) {
        return false;
      }
      if (filters.methodRegex) {
        try {
          const re = new RegExp(filters.methodRegex);
          if (!re.test(m.name)) return false;
        } catch (_) {}
      }
      if (!m.virtualAddress || m.virtualAddress.isNull()) return false;
      return true;
    });
  }

  /**
   * Checks if method should be analyzed with detailed logging
   * @param {string} methodName - Method name
   * @param {Array} list - List of method names to analyze
   * @returns {boolean} True if should analyze
   */
  function isAnalyzeMethod(methodName, list) {
    if (!list || list.length === 0) return false;
    return list.includes(methodName);
  }

  /**
   * Analyzes NewRequest method call for HTTP details
   * @param {Object} method - Method object
   * @param {Array} args - Method arguments
   * @param {number} argStart - Argument start index
   * @param {Object} config - Full configuration object
   */
  function analyzeNewRequest(method, args, argStart, config) {
    const paramMap = {};
    method.parameters.forEach((p, i) => {
      const key = (p.name || "").toLowerCase();
      paramMap[key] = { ptr: args[i + argStart], type: p.type.name };
    });

    const httpMethod = paramMap.method
      ? httpAnalysis.readHttpMethod(paramMap.method.ptr)
      : null;
    const path = paramMap.path
      ? utils.tryReadString(paramMap.path.ptr)
      : null;
    let basePath = paramMap.basepath
      ? utils.tryReadString(paramMap.basepath.ptr)
      : null;
    if (!basePath && paramMap.configuration) {
      basePath = httpAnalysis.extractBasePathFromConfig(paramMap.configuration.ptr);
    }
    const optionsInfo = paramMap.options
      ? httpAnalysis.extractOptionsDetails(paramMap.options.ptr,
          formatters.getPreviewOptions(config))
      : null;

    const methodUpper = httpMethod ? httpMethod.toUpperCase() : null;
    const wantsBody =
      methodUpper &&
      (methodUpper === "POST" ||
        methodUpper === "PUT" ||
        methodUpper === "PATCH");

    if (httpMethod) {
      console.log(`[INFO] method="${httpMethod}"`);
    }
    if (path) {
      console.log(`[INFO] path="${path}"`);
    }
    if (basePath) {
      console.log(`[INFO] basePath="${basePath}"`);
    }
    if (wantsBody) {
      if (optionsInfo && optionsInfo.body) {
        console.log(`[DATA] body=${optionsInfo.body}`);
      } else if (optionsInfo && optionsInfo.form) {
        console.log(`[DATA] form=${optionsInfo.form}`);
      }
    }
    if (basePath && path) {
      const url = httpAnalysis.buildUrl(basePath, path);
      console.log(`[URL] ${url}`);
    }
  }

  /**
   * Installs Frida interceptors on specified methods with rate limiting
   * @param {Il2Cpp.Class} klass - IL2CPP class object
   * @param {string} classFullName - Fully qualified class name for logging
   * @param {Array} methods - Array of method objects to hook
   * @param {Object} config - Full configuration object
   */
  function hookMethods(klass, classFullName, methods, config) {
    if (!config.performance.enabled) {
      console.log("[*] Hooking disabled.");
      return;
    }

    let idx = 0;
    let hooked = 0;
    let failed = 0;

    console.log(`[+] Hooking ${methods.length} methods (slow mode)...`);

    const timer = setInterval(() => {
      if (idx >= methods.length || hooked >= config.performance.maxHooks) {
        clearInterval(timer);
        console.log(
          `[✓] Hooked ${hooked} methods (${failed} failed, ${methods.length} total)\n`
        );
        return;
      }

      const method = methods[idx++];
      const sigParams = method.parameters
        .map((p) => `${p.type.name} ${p.name}`)
        .join(", ");
      const sig = `${method.isStatic ? "static " : ""}${method.returnType.name} ${
        method.name
      }(${sigParams})`;

      try {
        Interceptor.attach(method.virtualAddress, {
          onEnter: function (args) {
            const argStart = method.isStatic ? 0 : 1;
            const argParts = [];
            const isNewRequest =
              config.analysis.http.enabled && method.name === "NewRequest";
            const sep = "----------------------------------------";

            if (isNewRequest) {
              this.__req_block = true;
              this.__req_sep = sep;
              console.log(sep);
            }

            // Log arguments
            if (config.logging.args) {
              for (let i = 0; i < method.parameters.length; i++) {
                if (i >= config.logging.maxArgs) {
                  argParts.push("...");
                  break;
                }
                const p = method.parameters[i];
                const argPtr = args[i + argStart];
                const val = formatters.formatArg(
                  argPtr,
                  p.type.name,
                  config.formatting.strings.maxLength,
                  config
                );
                argParts.push(`${p.name || "arg" + i}=${val}`);
              }
            }

            const thisInfo =
              !method.isStatic && config.logging.showThis ? ` this=${args[0]}` : "";

            const argsStr = config.logging.args ? argParts.join(", ") : "";
            console.log(
              `[CALL] ${classFullName}.${method.name}(${argsStr})${thisInfo}`
            );

            // Custom method analysis (extensible)
            if (isAnalyzeMethod(method.name, config.analysis.custom.methods)) {
              console.log(sep);
              console.log(`[ANALYZE] ${classFullName}.${method.name}`);
              // Add custom analysis logic here
              console.log(sep);
            }

            // Dump objects if configured
            if (config.dump.enabled) {
              for (let i = 0; i < method.parameters.length; i++) {
                const p = method.parameters[i];
                if (!p || !p.type) continue;
                if (!formatters.shouldDumpType(p.type.name, config.dump)) continue;
                const argPtr = args[i + argStart];
                formatters.dumpObjectFields(argPtr, p.type.name, config.dump);
              }
            }

            // Special handling for NewRequest (HTTP analysis)
            if (isNewRequest) {
              analyzeNewRequest(method, args, argStart, config);
            }

            // Stack trace if enabled
            if (config.logging.showStack) {
              const stack = Thread.backtrace(this.context, Backtracer.ACCURATE)
                .slice(0, LIMITS.MAX_BACKTRACE_DEPTH)
                .map(DebugSymbol.fromAddress)
                .join("\n");
              console.log(stack);
            }
          },
          onLeave: function (retval) {
            // Log return value
            if (config.logging.return) {
              const ret = formatters.formatReturn(
                retval,
                method.returnType.name,
                config.formatting.strings.maxLength,
                config
              );
              console.log(`[RET] ${classFullName}.${method.name} -> ${ret}`);
            }

            // Special handling for NewRequest response
            if (config.analysis.http.enabled && method.name === "NewRequest") {
              const sep = this.__req_sep || "----------------------------------------";
              const info = httpAnalysis.extractRequestSummary(retval, {
                maxStringLength: config.formatting.strings.maxLength,
                reqToStringMaxLen: config.formatting.strings.httpMaxLength,
              });
              if (info) {
                if (info.method || info.uri) {
                  console.log(
                    `[REQ] method="${info.method || ""}" uri="${info.uri || ""}"`
                  );
                }
                if (info.headersBlock) {
                  console.log("[REQ] headers:");
                  console.log(info.headersBlock);
                }
              }
              if (this.__req_block) {
                console.log(sep);
                this.__req_block = false;
              }
            }

            // Special handling for API response methods
            if (
              config.analysis.http.enabled &&
              (method.name.includes("CallApi") ||
                method.name.includes("SendAsync"))
            ) {
              const summary = httpAnalysis.extractResponseSummary(retval, {
                maxStringLength: config.formatting.strings.maxLength,
              });
              if (summary) {
                console.log(`[RESP] ${summary}`);
              }
            }
          },
        });

        hooked++;
        console.log(`[+] Hooked: ${sig}`);
      } catch (e) {
        failed++;
        console.log(`[!] Failed: ${sig} (${e.message})`);
      }
    }, config.performance.hookDelayMs);
  }

  // Export to global scope
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.core = {
    normalizeTarget,
    classMatches,
    selectClass,
    listMethods,
    buildHookList,
    hookMethods,
    isAnalyzeMethod,
  };
})(globalThis);
