"use strict";

/**
 * Combat Anim Plugin
 * - Skip mode: short-circuit visual steps
 * - Speed mode: accelerate delays/frames
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
    speedFactor: 1.0,
    minDelayMs: 16,
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

          if (cfg.onlyWhenTracked && !isStatic) {
            const key = thisPtr ? thisPtr.toString() : null;
            if (!key || !state.traceTracked.has(key)) return;
          }

          let thisStr = "";
          if (!isStatic && thisPtr) thisStr = ` this=@${thisPtr}`;
          if (ui) ui.info(`trace ${resolved.classFullName}.${entry.methodName}${thisStr}`);
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

  function parseMethodTarget(def) {
    const raw = def && def.target ? def.target : def;
    const normalized = normalizeTargetDef(raw);
    if (!normalized) return null;
    if (!normalized.methods || normalized.methods.length === 0) return null;
    const methodName = normalized.methods[0];
    const target = hookManager.normalizeTarget(Object.assign({}, normalized));
    if (!target.className && !target.fullName) return null;
    return { target, methodName, paramCount: def?.paramCount, frameCountArg: def?.frameCountArg };
  }

  function hookWaitForFrames(def) {
    const ui = getUI();
    const entry = parseMethodTarget(def);
    if (!entry) {
      if (ui) ui.warn("combat-anim: waitForFrames target invalid");
      return;
    }

    const resolved = resolveMethodTarget(entry, false);
    if (!resolved) return;

    const argIndex = Number.isInteger(def?.frameCountArg) ? def.frameCountArg : 0;
    const minFrames = state.config?.speed?.minFrames ?? 1;

    const detach = Interceptor.attach(resolved.addr, {
      onEnter: function (args) {
        if (!modeEnabled("speed") || !state.config?.speed?.enabled) return;
        const factor = Math.max(0.1, Number(state.speedFactor || 1.0));
        if (factor <= 1.0) return;

        try {
          const current = args[argIndex].toInt32();
          const scaled = Math.max(minFrames, Math.floor(current / factor));
          if (scaled !== current) {
            args[argIndex] = ptr(scaled);
            if (state.config?.speed?.log && ui) {
              ui.info(`waitForFrames: ${current} -> ${scaled} (x${factor})`);
            }
          }
        } catch (_) {}
      },
    });

    state.hooks.push(detach);
    if (ui) ui.success(`combat-anim: hooked speed ${resolved.classFullName}.${entry.methodName}`);
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
      hookSkipTargets(buildMethodTargets(cfg.skip.targets || []));
    }
    if (cfg.speed?.enabled && cfg.speed?.waitForFrames) {
      hookWaitForFrames(cfg.speed.waitForFrames);
    }
  }

  function updateRuntimeConfig(partial) {
    if (!partial || typeof partial !== "object") return;
    if (partial.mode !== undefined) state.modes = normalizeModes(partial.mode);
    if (partial.speedFactor !== undefined) state.speedFactor = Number(partial.speedFactor) || 1.0;
    if (partial.minDelayMs !== undefined) state.minDelayMs = Number(partial.minDelayMs) || state.minDelayMs;
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
      state.speedFactor = Number(this.config.speedFactor) || 1.0;
      state.minDelayMs = Number(this.config.minDelayMs) || 16;

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
          setspeed: (speedFactor) => {
            updateRuntimeConfig({ speedFactor });
            return true;
          },
          setconfig: (cfg) => {
            updateRuntimeConfig(cfg || {});
            return true;
          },
          status: () => ({
            mode: Array.from(state.modes),
            speedFactor: state.speedFactor,
            minDelayMs: state.minDelayMs,
          }),
        };
      }
    },

    stop() {
      const ui = getUI();
      state.hooks.forEach((h) => {
        try { h.detach(); } catch (_) {}
      });
      state.hooks = [];
      if (ui) ui.info("CombatAnim stopped");
    },
  };

  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.plugins = global.IL2CPPHooker.plugins || {};
  global.IL2CPPHooker.plugins.combatAnim = { plugin: CombatAnimPlugin };
})(globalThis);
