"use strict";

/**
 * Combat Anim Plugin
 * - Skip mode: short-circuit visual steps
 * - Trace mode: discovery hooks
 */

(function (global) {
  const hookManager = global.IL2CPPHooker?.hookManager;
  const utils = global.IL2CPPHooker?.utils;

  if (!hookManager || !utils) {
    console.log("[FATAL] combat-anim requires hook-manager and utils");
    return;
  }

  function getUI() {
    return global.IL2CPPHooker?.ui;
  }

  const state = {
    config: null,
    modes: new Set(),
    finishedSteps: new Set(),
    finishPending: new Set(),
    hooks: [],
    replaced: new Set(),
    traceTracked: new Set(),
  };

  function normalizeModes(mode) {
    if (!mode) return new Set(["skip"]);
    if (Array.isArray(mode)) {
      return new Set(mode.map((m) => String(m).trim()).filter(Boolean));
    }
    const raw = String(mode).trim();
    if (!raw) return new Set(["skip"]);
    if (raw.includes(",") || raw.includes("+") || raw.includes("|")) {
      return new Set(raw.split(/[,+|]/).map((m) => m.trim()).filter(Boolean));
    }
    return new Set([raw]);
  }

  function modeEnabled(name) {
    return state.modes.has(name);
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
      if (normalized.method && !normalized.methods) normalized.methods = normalized.method;
      if (typeof normalized.methods === "string") normalized.methods = [normalized.methods];
      return normalized;
    }
    return null;
  }

  function buildMethodTargets(list) {
    if (!Array.isArray(list)) return [];
    const targets = [];
    list.forEach((entry) => {
      const def = normalizeTargetDef(entry);
      if (!def) return;
      const normalized = hookManager.normalizeTarget(Object.assign({}, def));
      const methods = Array.isArray(def.methods) ? def.methods : [];
      if (!normalized.className && !normalized.fullName) return;
      if (methods.length === 0) return;
      methods.forEach((methodName) => {
        if (!methodName) return;
        targets.push({
          target: normalized,
          methodName,
          paramCount: def.paramCount,
          inspectArgIndex: entry?.inspectArgIndex ?? entry?.inspectArg,
          inspectToString: entry?.inspectToString === true,
          ignoreTrack: entry?.ignoreTrack === true,
        });
      });
    });
    return targets;
  }

  function resolveMethodTarget(entry, silent) {
    const ui = getUI();
    const chosen = hookManager.findClass(entry.target, silent);
    if (!chosen) return null;

    const klass = chosen.klass;
    const method = hookManager.findMethod(klass, entry.methodName, entry.paramCount ?? null);
    if (!method) {
      if (!silent && ui) {
        ui.warn(`Method not found: ${entry.methodName} on ${klass.namespace}.${klass.name}`);
      }
      return null;
    }

    const addr = method.__hookAddress || method.virtualAddress;
    if (!addr || addr.isNull()) {
      if (!silent && ui) ui.warn(`Method has no address: ${entry.methodName}`);
      return null;
    }

    return {
      method,
      addr,
      klass,
      classFullName: klass.namespace ? `${klass.namespace}.${klass.name}` : klass.name,
      assembly: chosen.assembly,
    };
  }

  function finishStep(thisPtr) {
    const ui = getUI();
    const cfg = state.config?.skip || {};
    if (!thisPtr) return false;
    if (typeof thisPtr.isNull === "function" && thisPtr.isNull()) return false;

    const key = thisPtr.toString();
    state.finishPending.delete(key);
    if (cfg.dedupe && state.finishedSteps.has(key)) return true;

    let obj;
    try {
      obj = new Il2Cpp.Object(thisPtr);
    } catch (_) {
      return false;
    }

    const methods = Array.isArray(cfg.finishMethods) ? cfg.finishMethods : [];
    for (const name of methods) {
      try {
        const method = obj.method(name);
        if (!method) continue;
        method.invoke();
        if (cfg.dedupe) state.finishedSteps.add(key);
        if (cfg.log && ui) ui.info(`finishStep via ${name} @${key}`);
        return true;
      } catch (_) {}
    }

    if (cfg.log && ui) ui.warn(`finishStep failed @${key}`);
    return false;
  }

  function scheduleFinish(thisPtr) {
    const cfg = state.config?.skip || {};
    if (!thisPtr) return false;
    if (typeof thisPtr.isNull === "function" && thisPtr.isNull()) return false;
    const delay = Math.max(0, Number(cfg.finishDelayMs || 0));
    const key = thisPtr.toString();

    if (cfg.dedupe && state.finishPending.has(key)) return true;
    if (cfg.dedupe) state.finishPending.add(key);

    if (delay <= 0) return finishStep(thisPtr);

    setTimeout(() => {
      finishStep(thisPtr);
    }, delay);
    return true;
  }

  function hookSkipTargets(targets) {
    const ui = getUI();
    targets.forEach((entry) => {
      const resolved = resolveMethodTarget(entry, false);
      if (!resolved) return;

      const finishOn = state.config?.skip?.finishTiming === "enter" ? "enter" : "leave";

      const detach = Interceptor.attach(resolved.addr, {
        onEnter: function (args) {
          if (!modeEnabled("skip") || !state.config?.skip?.enabled) return;
          this.__thisPtr = args[0];
          if (finishOn === "enter") scheduleFinish(args[0]);
        },
        onLeave: function () {
          if (!modeEnabled("skip") || !state.config?.skip?.enabled) return;
          if (finishOn === "leave") scheduleFinish(this.__thisPtr);
        },
      });

      state.hooks.push(detach);
      if (ui) ui.success(`combat-anim: hooked skip ${resolved.classFullName}.${entry.methodName}`);
    });
  }

  function shouldDropStep(stepPtr, cfg) {
    if (!stepPtr || (typeof stepPtr.isNull === "function" && stepPtr.isNull())) return false;
    let className = null;
    let fullName = null;
    let toStringValue = null;

    try {
      const obj = new Il2Cpp.Object(stepPtr);
      const klass = obj.class;
      className = klass?.name || null;
      fullName = klass?.namespace ? `${klass.namespace}.${klass.name}` : className;

      const list = Array.isArray(cfg.dropOnAdd) ? cfg.dropOnAdd : [];
      if (list.length > 0) {
        const match = list.some((val) => val === className || val === fullName);
        if (match) return { className, fullName, toStringValue };
      }

      const filters = Array.isArray(cfg.dropOnAddToStringContains)
        ? cfg.dropOnAddToStringContains
        : [];
      if (filters.length > 0) {
        try {
          const res = obj.method("ToString").invoke();
          if (res && !(typeof res.isNull === "function" && res.isNull())) {
            toStringValue = new Il2Cpp.String(res).content;
          }
        } catch (_) {}
        if (toStringValue) {
          const hit = filters.some((f) => toStringValue.includes(f));
          if (hit) return { className, fullName, toStringValue };
        }
      }
    } catch (_) {}

    return false;
  }

  function hookSkipAddFilter() {
    const ui = getUI();
    const cfg = state.config?.skip || {};
    const list = Array.isArray(cfg.dropOnAdd) ? cfg.dropOnAdd : [];
    const filters = Array.isArray(cfg.dropOnAddToStringContains) ? cfg.dropOnAddToStringContains : [];
    if (list.length === 0 && filters.length === 0) return;

    const target = hookManager.normalizeTarget({
      fullName: "Core.Engine.Sequencing.SerialSequencer",
      className: "SerialSequencer",
    });
    const chosen = hookManager.findClass(target, true);
    if (!chosen) {
      if (ui) ui.warn("combat-anim: SerialSequencer not found (skip add filter disabled)");
      return;
    }
    const klass = chosen.klass;
    const method = hookManager.findMethod(klass, "bgne", 1);
    if (!method || !method.virtualAddress || method.virtualAddress.isNull()) {
      if (ui) ui.warn("combat-anim: SerialSequencer.bgne not found");
      return;
    }

    const addr = method.virtualAddress;
    if (state.replaced.has(addr.toString())) return;

    const original = new NativeFunction(addr, "void", ["pointer", "pointer"]);

    const replacement = new NativeCallback(function (thisPtr, stepPtr) {
      if (!modeEnabled("skip") || !state.config?.skip?.enabled) {
        return original(thisPtr, stepPtr);
      }
      const dropInfo = shouldDropStep(stepPtr, cfg);
      if (dropInfo) {
        if (cfg.log && ui) {
          const label = dropInfo.fullName || dropInfo.className || "step";
          const detail = dropInfo.toStringValue ? ` \"${dropInfo.toStringValue}\"` : "";
          ui.info(`combat-anim: dropOnAdd ${label}${detail}`);
        }
        return;
      }
      return original(thisPtr, stepPtr);
    }, "void", ["pointer", "pointer"]);

    Interceptor.replace(addr, replacement);
    state.replaced.add(addr.toString());
    if (ui) ui.success("combat-anim: hook dropOnAdd SerialSequencer.bgne");
  }

  function hookTraceTargets(targets) {
    const ui = getUI();
    const cfg = state.config?.trace || {};
    targets.forEach((entry) => {
      const resolved = resolveMethodTarget(entry, false);
      if (!resolved) return;

      const detach = Interceptor.attach(resolved.addr, {
        onEnter: function (args) {
          if (!modeEnabled("trace") || !state.config?.trace?.enabled) return;
          const isStatic = resolved.method.isStatic;
          const thisPtr = isStatic ? null : args[0];

          if (entry.trackOnly) {
            if (thisPtr) {
              if (cfg.trackedMax && state.traceTracked.size >= cfg.trackedMax) {
                state.traceTracked.clear();
              }
              state.traceTracked.add(thisPtr.toString());
              if (cfg.logTrackOn && ui) {
                ui.info(`trace(track) ${resolved.classFullName}.${entry.methodName} this=@${thisPtr}`);
              }
            }
            return;
          }

          if (cfg.onlyWhenTracked && !entry.ignoreTrack && !isStatic) {
            const key = thisPtr ? thisPtr.toString() : null;
            if (!key || !state.traceTracked.has(key)) return;
          }

          let thisStr = "";
          if (!isStatic && thisPtr) thisStr = ` this=@${thisPtr}`;
          let extra = "";
          if (entry.inspectArgIndex !== undefined && entry.inspectArgIndex !== null) {
            const idx = entry.inspectArgIndex;
            const argPtr = args[idx];
            if (argPtr && !(typeof argPtr.isNull === "function" && argPtr.isNull())) {
              try {
                const obj = new Il2Cpp.Object(argPtr);
                const klass = obj.class;
                const className = klass.namespace ? `${klass.namespace}.${klass.name}` : klass.name;
                let ts = "";
                if (entry.inspectToString) {
                  try {
                    const res = obj.method("ToString").invoke();
                    if (res && !(typeof res.isNull === "function" && res.isNull())) {
                      const s = new Il2Cpp.String(res).content;
                      ts = s ? ` \"${s}\"` : "";
                    }
                  } catch (_) {}
                }
                extra = ` arg${idx}=${className}@${argPtr}${ts}`;
              } catch (_) {
                extra = ` arg${idx}=<native>@${argPtr}`;
              }
            } else {
              extra = ` arg${idx}=null`;
            }
          }
          if (ui) ui.info(`trace ${resolved.classFullName}.${entry.methodName}${thisStr}${extra}`);
          if (state.config?.trace?.showStack) {
            const stack = Thread.backtrace(this.context, Backtracer.ACCURATE)
              .slice(0, global.IL2CPPHooker?.LIMITS?.MAX_BACKTRACE_DEPTH || 8)
              .map(DebugSymbol.fromAddress)
              .join("\n");
            if (ui) ui.stackTrace(stack);
          }
        },
      });

      state.hooks.push(detach);
      if (ui) ui.success(`combat-anim: hooked trace ${resolved.classFullName}.${entry.methodName}`);
    });
  }

  function installHooks() {
    const cfg = state.config;
    if (!cfg) return;

    if (cfg.trace?.enabled) {
      const traceTargets = buildMethodTargets(cfg.trace.targets || []);
      const trackTargets = buildMethodTargets(cfg.trace.trackOn || []).map((t) => {
        t.trackOnly = true;
        return t;
      });
      hookTraceTargets(trackTargets.concat(traceTargets));
    }
    if (cfg.skip?.enabled) {
      hookSkipAddFilter();
      hookSkipTargets(buildMethodTargets(cfg.skip.targets || []));
    }
  }

  function updateRuntimeConfig(partial) {
    if (!partial || typeof partial !== "object") return;
    if (partial.mode !== undefined) state.modes = normalizeModes(partial.mode);
  }

  const CombatAnimPlugin = {
    name: "combat-anim",
    version: "0.1.0",

    init(config) {
      const ui = getUI();
      const defaultConfig = global.IL2CPPHooker?.plugins?.combatAnim?.CONFIG || {};
      const normalizeConfig = global.IL2CPPHooker?.plugins?.combatAnim?.normalizeConfig;
      const merged = JSON.parse(JSON.stringify(defaultConfig));
      const userCfg = config || {};

      function deepMerge(target, source) {
        for (const key in source) {
          if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
            target[key] = target[key] || {};
            deepMerge(target[key], source[key]);
          } else if (source[key] !== undefined) {
            target[key] = source[key];
          }
        }
        return target;
      }

      this.config = normalizeConfig ? normalizeConfig(deepMerge(merged, userCfg)) : deepMerge(merged, userCfg);

      state.config = this.config;
      state.modes = normalizeModes(this.config.mode);

      if (ui) ui.info(`CombatAnim initialized: mode=${Array.from(state.modes).join(",")}`);
      return true;
    },

    start() {
      installHooks();
      const ui = getUI();
      if (ui) ui.info("CombatAnim hooks installed");

      if (typeof rpc !== "undefined" && rpc.exports) {
        rpc.exports.combatanim = {
          setmode: (mode) => {
            updateRuntimeConfig({ mode });
            return true;
          },
          setconfig: (cfg) => {
            updateRuntimeConfig(cfg || {});
            return true;
          },
          status: () => ({
            mode: Array.from(state.modes),
          }),
        };
      }
    },

    stop() {
      const ui = getUI();
      state.hooks.forEach((h) => {
        try { h.detach(); } catch (_) {}
      });
      state.replaced.forEach((addr) => {
        try { Interceptor.revert(ptr(addr)); } catch (_) {}
      });
      state.replaced.clear();
      state.hooks = [];
      if (ui) ui.info("CombatAnim stopped");
    },
  };

  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.plugins = global.IL2CPPHooker.plugins || {};
  global.IL2CPPHooker.plugins.combatAnim = { plugin: CombatAnimPlugin };
})(globalThis);
