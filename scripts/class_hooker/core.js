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
   * Get UI module reference
   * @returns {Object} UI module
   */
  function getUI() {
    return global.IL2CPPHooker.ui;
  }

  function hasInlineType(val) {
    return typeof val === "string" && /[A-Za-z0-9_.`&]+@0x[0-9a-fA-F]+/.test(val);
  }

  function stripPointer(val, ptrStr) {
    if (typeof val !== "string" || !ptrStr) return val;
    let cleaned = val.replace(`@${ptrStr}`, "");
    cleaned = cleaned.replace(ptrStr, "");
    return cleaned.trim();
  }

  function mergeVerboseRaw(raw, val, ptrStr) {
    if (val === "null") return val;
    if (!raw || !val || !ptrStr) return val || raw;
    if (hasInlineType(val)) return val;
    const cleaned = stripPointer(val, ptrStr);
    return cleaned ? `${raw} ${cleaned}` : raw;
  }

  /**
   * Normalizes target configuration by extracting namespace/className from fullName
   * and removing .dll extension from assembly name if present
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
   */
  function selectClass(target) {
    const ui = getUI();
    const assemblies = [];

    if (target.assembly) {
      try {
        assemblies.push(Il2Cpp.domain.assembly(target.assembly));
      } catch (_) {
        ui.error(`Assembly not found: ${target.assembly}`);
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
      return null;
    }

    ui.info(`Found ${matches.length} matching class(es):`);
    matches.forEach((m, i) => {
      ui.classMatch(i, m.assembly.name, `${m.klass.namespace}.${m.klass.name}`);
    });

    const pick = Math.min(Math.max(target.pickIndex || 0, 0), matches.length - 1);
    const chosen = matches[pick];

    ui.success(`Using [${pick}] ${chosen.assembly.name} -> ${chosen.klass.namespace}.${chosen.klass.name}`);
    return chosen;
  }

  /**
   * Lists all methods of a class with signatures
   */
  function listMethods(klass) {
    const ui = getUI();
    const methods = [];
    klass.methods.forEach((m) => methods.push(m));

    const classFullName = klass.namespace
      ? `${klass.namespace}.${klass.name}`
      : klass.name;

    ui.methodListStart(classFullName, methods.length);

    methods.forEach((m, i) => {
      const params = m.parameters
        .map((p) => `${p.type.name} ${p.name}`)
        .join(", ");
      const sig = `${m.isStatic ? "static " : ""}${m.returnType.name} ${m.name}(${params})`;
      const addr = m.virtualAddress && !m.virtualAddress.isNull()
        ? m.virtualAddress.toString()
        : null;
      ui.methodListItem(i, sig, addr);
    });

    ui.methodListEnd();
  }

  /**
   * Builds list of methods to hook based on filters
   */
  function buildHookList(klass, filters) {
    return klass.methods.filter((m) => {
      if (filters.methodNameContains && !m.name.includes(filters.methodNameContains)) {
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
   */
  function isAnalyzeMethod(methodName, list) {
    if (!list || list.length === 0) return false;
    return list.includes(methodName);
  }

  /**
   * Analyzes NewRequest method call for HTTP details
   */
  function analyzeNewRequest(method, args, argStart, config, httpContext) {
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
      ? httpAnalysis.extractOptionsDetails(
          paramMap.options.ptr,
          formatters.getPreviewOptions(config)
        )
      : null;

    const methodUpper = httpMethod ? httpMethod.toUpperCase() : null;
    const wantsBody =
      methodUpper &&
      (methodUpper === "POST" || methodUpper === "PUT" || methodUpper === "PATCH");

    httpContext.method = httpMethod;
    httpContext.path = path;
    httpContext.basePath = basePath;
    httpContext.url = basePath && path ? httpAnalysis.buildUrl(basePath, path) : null;

    if (wantsBody && optionsInfo) {
      httpContext.body = optionsInfo.body || optionsInfo.form || null;
    }
  }

  /**
   * Installs Frida interceptors on specified methods with rate limiting
   */
  function hookMethods(klass, classFullName, methods, config) {
    const ui = getUI();

    if (!config.performance.enabled) {
      ui.warn("Hooking disabled.");
      return;
    }

    let idx = 0;
    let hooked = 0;
    let failed = 0;

    ui.info(`Hooking ${methods.length} methods...`);

    const timer = setInterval(() => {
      if (idx >= methods.length || hooked >= config.performance.maxHooks) {
        clearInterval(timer);
        ui.hookSummary(hooked, failed, methods.length);
        return;
      }

      const method = methods[idx++];
      const sigParams = method.parameters
        .map((p) => `${p.type.name} ${p.name}`)
        .join(", ");
      const sig = `${method.isStatic ? "static " : ""}${method.returnType.name} ${method.name}(${sigParams})`;

      try {
        Interceptor.attach(method.virtualAddress, {
          onEnter: function(args) {
            const argStart = method.isStatic ? 0 : 1;
            const isNewRequest = config.analysis.http.enabled && method.name === "NewRequest";
            const httpContext = {};

            // Prepare args for UI
            const argsData = [];
            const isVerbose = config.ui?.verbosity === 'verbose';

            if (config.logging.args) {
              for (let i = 0; i < method.parameters.length; i++) {
                if (i >= config.logging.maxArgs) break;
                const p = method.parameters[i];
                const argPtr = args[i + argStart];

                let val;
                if (config.logging.rawArgs && !isVerbose) {
                  // Raw mode (safe): just TypeName@pointer
                  val = formatters.formatArgRaw(argPtr, p.type.name);
                } else {
                  // Full preview with object fields
                  val = formatters.formatArg(
                    argPtr,
                    p.type.name,
                    config.formatting.strings.maxLength,
                    config
                  );
                  // In verbose mode with rawArgs, merge raw pointer/type once
                  if (isVerbose && config.logging.rawArgs) {
                    const raw = formatters.formatArgRaw(argPtr, p.type.name);
                    const ptrStr = argPtr ? argPtr.toString() : null;
                    val = mergeVerboseRaw(raw, val, ptrStr);
                  }
                }
                argsData.push({ name: p.name || `arg${i}`, value: val });
              }
            }

            const needsThisPtr = !method.isStatic && (config.logging.showThis || config.ui?.instanceIds?.enabled);
            const thisPtr = needsThisPtr ? args[0].toString() : null;

            // Store context for onLeave
            this.__ctx = {
              isNewRequest,
              httpContext,
            };

            if (isNewRequest) {
              // HTTP block - collect data now, output in onLeave
              analyzeNewRequest(method, args, argStart, config, httpContext);
            } else {
              // Regular hook call
              ui.hookCall({
                className: classFullName,
                methodName: method.name,
                args: argsData,
                thisPtr,
                showThis: config.logging.showThis,
              });
            }

            // Custom method analysis
            if (isAnalyzeMethod(method.name, config.analysis.custom.methods)) {
              ui.analyzeStart(method.name);
              ui.analyzeEnd();
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

            // Stack trace if enabled
            if (config.logging.showStack) {
              const stack = Thread.backtrace(this.context, Backtracer.ACCURATE)
                .slice(0, LIMITS.MAX_BACKTRACE_DEPTH)
                .map(DebugSymbol.fromAddress)
                .join("\n");
              ui.stackTrace(stack);
            }
          },

          onLeave: function(retval) {
            // Guard against missing context (onEnter may have crashed)
            if (!this.__ctx) return;
            const { isNewRequest, httpContext } = this.__ctx;

            if (isNewRequest) {
              // Complete HTTP block
              const info = httpAnalysis.extractRequestSummary(retval, {
                maxStringLength: config.formatting.strings.maxLength,
                reqToStringMaxLen: config.formatting.strings.httpMaxLength,
              });

              ui.httpBlock({
                method: httpContext.method,
                path: httpContext.path,
                url: httpContext.url,
                body: httpContext.body,
                headers: info?.headersBlock,
              });
            } else if (config.logging.return) {
              const ret = formatters.formatReturn(
                retval,
                method.returnType.name,
                config.formatting.strings.maxLength,
                config
              );
              ui.hookReturn({
                className: classFullName,
                methodName: method.name,
                value: ret,
              });
            }

            // API response methods
            if (
              config.analysis.http.enabled &&
              (method.name.includes("CallApi") || method.name.includes("SendAsync"))
            ) {
              const summary = httpAnalysis.extractResponseSummary(retval, {
                maxStringLength: config.formatting.strings.maxLength,
              });
              if (summary) {
                ui.httpResponse(summary);
              }
            }
          },
        });

        hooked++;
        ui.hookInstalled(sig);
      } catch (e) {
        failed++;
        ui.hookFailed(sig, e.message);
      }
    }, config.performance.hookDelayMs);
  }

  // Export
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
