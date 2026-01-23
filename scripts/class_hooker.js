"use strict";

/**
 * Frida IL2CPP Class Hooker
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
 * Fill either: target.assembly + target.className, or target.namespace + target.className,
 * or target.fullName ("Namespace.ClassName"). Assembly is optional.
 */

const CONFIG = {
  target: {
    assembly: null, // Example: "Core", "Assembly-CSharp"
    namespace: null, // Example: "Com.Example.Network", "App.Core.Services"
    className: "gso", // Example: "ApiClient", "NetworkManager", "MessageHandler"
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
    // Example: ["ProcessTransaction", "HandlePayment", "UpdateBalance"]
    // Add method names you want to analyze with detailed parameter logging
    analyzeSeparator: true,
  },
};

/**
 * Normalizes target configuration by extracting namespace/className from fullName
 * and removing .dll extension from assembly name if present.
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

function truncate(s, maxLen) {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "...";
}

function safeString(ptr, maxLen) {
  if (!ptr || ptr.isNull()) return "null";
  try {
    const s = new Il2Cpp.String(ptr).content;
    return `"${truncate(s, maxLen)}"`;
  } catch (_) {
    return ptr.toString();
  }
}

function safeObjectType(ptr) {
  if (!ptr || ptr.isNull()) return "null";
  try {
    const obj = new Il2Cpp.Object(ptr);
    return `${obj.class.name}@${ptr}`;
  } catch (_) {
    return ptr.toString();
  }
}

function isStringType(typeName) {
  return /(^|\\.)String(&|$)/.test(typeName);
}

function isDictionaryClass(klass) {
  return (
    klass &&
    klass.namespace === "System.Collections.Generic" &&
    klass.name.startsWith("Dictionary`2")
  );
}

function isListClass(klass) {
  return (
    klass &&
    klass.namespace === "System.Collections.Generic" &&
    klass.name.startsWith("List`1")
  );
}

function isMultimapClass(klass) {
  return klass && klass.name && klass.name.includes("Multimap`2");
}

function readByteArraySummary(arrayPtr) {
  if (!arrayPtr || arrayPtr.isNull()) return null;
  try {
    const maxLength = arrayPtr.add(0x18).readPointer().toInt32();
    if (maxLength < 0 || maxLength > 1024 * 1024) return null;
    return `Byte[${maxLength}]`;
  } catch (_) {
    return null;
  }
}

function readListCount(listPtr) {
  if (!listPtr || listPtr.isNull()) return null;
  try {
    return listPtr.add(0x18).readInt();
  } catch (_) {
    return null;
  }
}

function readDictionarySummary(dictPtr, maxEntries) {
  if (!dictPtr || dictPtr.isNull()) return null;
  try {
    const handle = dictPtr;
    const entriesPtr = handle.add(0x18).readPointer();
    const count = handle.add(0x20).readInt();
    if (count <= 0 || entriesPtr.isNull()) return `Dict[${count}]`;

    const itemsStart = entriesPtr.add(0x20);
    const entrySize = 24;
    const shown = Math.min(count, maxEntries);
    const pairs = [];

    for (let i = 0; i < shown; i++) {
      const entryPtr = itemsStart.add(i * entrySize);
      const hashCode = entryPtr.readInt();
      if (hashCode < 0) continue;
      const keyPtr = entryPtr.add(8).readPointer();
      const valPtr = entryPtr.add(16).readPointer();

      const keyStr = keyPtr.isNull()
        ? "null"
        : safeString(keyPtr, CONFIG.hook.maxStringLength);
      const valStr = valPtr.isNull()
        ? "null"
        : safeString(valPtr, CONFIG.hook.maxStringLength);
      pairs.push(`${keyStr}:${valStr}`);
    }

    if (pairs.length > 0) {
      return `Dict[${count}] {${pairs.join(", ")}}`;
    }
    return `Dict[${count}]`;
  } catch (_) {
    return null;
  }
}

function readMultimapSummary(mapPtr, opts) {
  if (!mapPtr || mapPtr.isNull()) return null;
  try {
    const obj = new Il2Cpp.Object(mapPtr);
    for (const field of obj.class.fields) {
      if (field.isStatic) continue;
      try {
        const value = obj.field(field.name).value;
        const fieldObj = new Il2Cpp.Object(value);
        if (opts.expandDictionaries && isDictionaryClass(fieldObj.class)) {
          const summary = readDictionarySummary(value, opts.maxDictEntries);
          if (summary) return `Multimap ${summary}`;
        }
        if (opts.expandLists && isListClass(fieldObj.class)) {
          const count = readListCount(value);
          if (count !== null) return `Multimap List[${count}]`;
        }
      } catch (_) {}
    }
  } catch (_) {}
  return null;
}

function tryObjectToString(objPtr, maxLen) {
  if (!objPtr || objPtr.isNull()) return null;
  try {
    const obj = new Il2Cpp.Object(objPtr);
    const toStringMethod = obj.class.methods.find(
      (m) => m.name === "ToString" && m.parameterCount === 0,
    );
    if (!toStringMethod) return null;
    const res = obj.method("ToString").invoke();
    if (!res || res.isNull()) return null;
    const str = new Il2Cpp.String(res).content;
    return maxLen ? truncate(str, maxLen) : str;
  } catch (_) {
    return null;
  }
}

function tryReadString(ptr) {
  if (!ptr || ptr.isNull()) return null;
  try {
    return new Il2Cpp.String(ptr).content;
  } catch (_) {
    return null;
  }
}

function summarizeFieldValue(valuePtr, typeName, opts) {
  if (!valuePtr || valuePtr.isNull()) return "null";

  if (isStringType(typeName)) {
    return safeString(valuePtr, opts.maxStringLength);
  }
  if (typeName === "Boolean") {
    return valuePtr.toInt32() !== 0 ? "true" : "false";
  }
  if (typeName === "Int32" || typeName === "UInt32") {
    return valuePtr.toInt32().toString();
  }
  if (typeName === "Byte[]") {
    return readByteArraySummary(valuePtr) || "Byte[]";
  }

  try {
    const obj = new Il2Cpp.Object(valuePtr);
    if (opts.expandDictionaries && isDictionaryClass(obj.class)) {
      return readDictionarySummary(valuePtr, opts.maxDictEntries) || "Dict";
    }
    if (opts.expandMultimap && isMultimapClass(obj.class)) {
      return readMultimapSummary(valuePtr, opts) || "Multimap";
    }
    if (opts.expandLists && isListClass(obj.class)) {
      const count = readListCount(valuePtr);
      return count !== null ? `List[${count}]` : "List";
    }
  } catch (_) {}

  return valuePtr.toString();
}

function findStringField(objPtr, nameMatch) {
  if (!objPtr || objPtr.isNull()) return null;
  try {
    const obj = new Il2Cpp.Object(objPtr);
    for (const field of obj.class.fields) {
      if (field.isStatic) continue;
      const name = field.name || "";
      if (!nameMatch(name)) continue;
      const value = obj.field(field.name).value;
      const str = tryReadString(value);
      if (str !== null) return str;
    }
  } catch (_) {}
  return null;
}

function extractBasePathFromConfig(configPtr) {
  return findStringField(configPtr, (name) =>
    name.toLowerCase().includes("basepath"),
  );
}

function buildUrl(basePath, path) {
  if (!basePath) return path || "";
  if (!path) return basePath;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const p = path.startsWith("/") ? path : `/${path}`;
  return base + p;
}

function readHttpMethod(methodPtr) {
  if (!methodPtr || methodPtr.isNull()) return null;
  const asString = tryObjectToString(methodPtr, CONFIG.hook.maxStringLength);
  if (asString) return asString;
  return findStringField(methodPtr, (name) =>
    name.toLowerCase().includes("method"),
  );
}

function extractOptionsDetails(optionsPtr, opts) {
  const result = {
    details: [],
    body: null,
    form: null,
  };

  if (!optionsPtr || optionsPtr.isNull()) return result;

  try {
    const obj = new Il2Cpp.Object(optionsPtr);
    for (const field of obj.class.fields) {
      if (field.isStatic) continue;
      const name = field.name || "";
      const lower = name.toLowerCase();
      const value = obj.field(field.name).value;
      const summary = summarizeFieldValue(value, field.type.name, opts);

      if (lower.includes("pathparameters")) {
        result.details.push(`pathParams=${summary}`);
      } else if (lower.includes("queryparameters")) {
        result.details.push(`query=${summary}`);
      } else if (lower.includes("headerparameters")) {
        result.details.push(`headers=${summary}`);
      } else if (lower.includes("formparameters")) {
        result.form = summary;
        result.details.push(`form=${summary}`);
      } else if (lower.includes("fileparameters")) {
        result.details.push(`files=${summary}`);
      } else if (lower.includes("cookies")) {
        result.details.push(`cookies=${summary}`);
      } else if (
        lower.includes("body") ||
        lower.includes("postbody") ||
        lower.includes("data")
      ) {
        if (!result.body) {
          result.body = summary;
        }
      }
    }
  } catch (_) {}

  return result;
}

function findFieldValue(objPtr, nameMatch) {
  if (!objPtr || objPtr.isNull()) return null;
  try {
    const obj = new Il2Cpp.Object(objPtr);
    for (const field of obj.class.fields) {
      if (field.isStatic) continue;
      const name = field.name || "";
      if (!nameMatch(name)) continue;
      const value = obj.field(field.name).value;
      return { name: field.name, typeName: field.type.name, value };
    }
  } catch (_) {}
  return null;
}

function findIntField(objPtr, nameMatch) {
  const hit = findFieldValue(objPtr, nameMatch);
  if (!hit || !hit.value || hit.value.isNull()) return null;
  try {
    return hit.value.toInt32();
  } catch (_) {
    return null;
  }
}

function extractResponseSummary(respPtr, opts) {
  if (!respPtr || respPtr.isNull()) return null;

  const parts = [];
  const str = tryObjectToString(respPtr, opts.maxStringLength);
  if (str) parts.push(`"${str}"`);

  const status = findIntField(respPtr, (name) =>
    name.toLowerCase().includes("status"),
  );
  if (status !== null) parts.push(`status=${status}`);

  const reason = findStringField(respPtr, (name) =>
    name.toLowerCase().includes("reason"),
  );
  if (reason) parts.push(`reason="${truncate(reason, opts.maxStringLength)}"`);

  const uri = findStringField(respPtr, (name) =>
    name.toLowerCase().includes("uri"),
  );
  if (uri) parts.push(`uri="${truncate(uri, opts.maxStringLength)}"`);

  return parts.length > 0 ? parts.join(" ") : null;
}

function extractRequestSummary(reqPtr, opts) {
  if (!reqPtr || reqPtr.isNull()) return null;

  const str = tryObjectToString(
    reqPtr,
    opts.reqToStringMaxLen || opts.maxStringLength,
  );
  if (!str) return null;

  const methodMatch = str.match(/Method:\s*([^,]+)/);
  const uriMatch = str.match(/RequestUri:\s*'([^']+)'/);
  const method = methodMatch ? methodMatch[1].trim() : null;
  const uri = uriMatch ? uriMatch[1].trim() : null;

  let headersBlock = null;
  const headersIdx = str.indexOf("Headers:");
  if (headersIdx !== -1) {
    const braceStart = str.indexOf("{", headersIdx);
    if (braceStart !== -1) {
      const braceEnd = str.indexOf("}", braceStart);
      headersBlock =
        braceEnd !== -1
          ? str.slice(braceStart, braceEnd + 1)
          : str.slice(braceStart);
    } else {
      headersBlock = str.slice(headersIdx + "Headers:".length).trim();
    }
  }

  return { method, uri, headersBlock };
}

const dumpState = {
  seen: new Set(),
  countByType: new Map(),
};

function shouldDumpType(typeName, opts) {
  if (!opts.dumpTypes || opts.dumpTypes.length === 0) return false;
  const lower = typeName.toLowerCase();
  return opts.dumpTypes.some((t) => t.toLowerCase() === lower);
}

function canDumpPtr(ptr, typeName, opts) {
  const key = `${typeName}@${ptr}`;
  if (opts.dumpOncePerPtr && dumpState.seen.has(key)) return false;

  const count = dumpState.countByType.get(typeName) || 0;
  if (opts.dumpMaxPerType && count >= opts.dumpMaxPerType) return false;

  dumpState.countByType.set(typeName, count + 1);
  if (opts.dumpOncePerPtr) dumpState.seen.add(key);
  return true;
}

function dumpObjectFields(ptr, typeName, opts) {
  if (!ptr || ptr.isNull()) return;

  if (!canDumpPtr(ptr, typeName, opts)) return;

  let obj;
  try {
    obj = new Il2Cpp.Object(ptr);
  } catch (_) {
    return;
  }

  const className = obj.class.namespace
    ? `${obj.class.namespace}.${obj.class.name}`
    : obj.class.name;

  console.log(`==== DUMP ${typeName} @ ${ptr} (${className}) ====`);

  let printed = 0;
  for (const field of obj.class.fields) {
    if (!opts.dumpIncludeStatic && field.isStatic) continue;
    if (printed >= opts.dumpMaxFields) {
      console.log("  ...");
      break;
    }

    try {
      const value = obj.field(field.name).value;
      const summary = summarizeFieldValue(value, field.type.name, opts);
      console.log(`  ${field.name}: ${summary}`);
      printed++;
    } catch (_) {}
  }

  console.log("==== END DUMP ====");
}

function previewObject(ptr, opts) {
  if (!ptr || ptr.isNull()) return "null";

  let obj;
  try {
    obj = new Il2Cpp.Object(ptr);
  } catch (_) {
    return ptr.toString();
  }

  if (opts.expandDictionaries && isDictionaryClass(obj.class)) {
    return (
      readDictionarySummary(ptr, opts.maxDictEntries) ||
      `${obj.class.name}@${ptr}`
    );
  }
  if (opts.expandMultimap && isMultimapClass(obj.class)) {
    return readMultimapSummary(ptr, opts) || `${obj.class.name}@${ptr}`;
  }
  if (opts.expandLists && isListClass(obj.class)) {
    const count = readListCount(ptr);
    return count !== null ? `List[${count}]` : `${obj.class.name}@${ptr}`;
  }

  const className = obj.class.namespace
    ? `${obj.class.namespace}.${obj.class.name}`
    : obj.class.name;

  let toStringValue = null;
  if (opts.tryToString) {
    try {
      const toStringMethod = obj.class.methods.find(
        (m) => m.name === "ToString" && m.parameterCount === 0,
      );
      if (toStringMethod) {
        const res = obj.method("ToString").invoke();
        if (res && !res.isNull()) {
          toStringValue = new Il2Cpp.String(res).content;
        }
      }
    } catch (_) {}
  }

  if (!opts.previewObjects) {
    return toStringValue
      ? `${className}@${ptr} "${truncate(toStringValue, opts.maxStringLength)}"`
      : `${className}@${ptr}`;
  }

  const fields = [];
  for (const field of obj.class.fields) {
    if (field.isStatic) continue;
    if (fields.length >= opts.maxObjectFields) break;

    try {
      const value = obj.field(field.name).value;
      const typeName = field.type.name;
      const summary = summarizeFieldValue(value, typeName, opts);
      fields.push(`${field.name}=${summary}`);
    } catch (_) {}
  }

  const preview = fields.length > 0 ? ` {${fields.join(", ")}}` : "";
  if (toStringValue) {
    return `${className}@${ptr} "${truncate(
      toStringValue,
      opts.maxStringLength,
    )}"${preview}`;
  }
  return `${className}@${ptr}${preview}`;
}

function formatArg(argPtr, typeName, maxStrLen) {
  if (!argPtr || argPtr.isNull()) return "null";

  if (isStringType(typeName)) {
    return safeString(argPtr, maxStrLen);
  }

  switch (typeName) {
    case "Boolean":
      return argPtr.toInt32() !== 0 ? "true" : "false";
    case "Int32":
      return argPtr.toInt32().toString();
    case "UInt32":
      return argPtr.toUInt32().toString();
    case "Int64":
    case "UInt64":
    case "Single":
    case "Double":
      // Avoid memory reads; show raw value.
      return argPtr.toString();
    default:
      return previewObject(argPtr, {
        tryToString: CONFIG.hook.tryToString,
        previewObjects: CONFIG.hook.previewObjects,
        maxObjectFields: CONFIG.hook.maxObjectFields,
        maxStringLength: maxStrLen,
        expandDictionaries: CONFIG.hook.expandDictionaries,
        maxDictEntries: CONFIG.hook.maxDictEntries,
        expandLists: CONFIG.hook.expandLists,
        expandMultimap: CONFIG.hook.expandMultimap,
      });
  }
}

function formatArgRaw(argPtr, typeName) {
  if (!argPtr || argPtr.isNull()) return "null";
  return `${typeName}@${argPtr}`;
}

function formatReturn(retval, typeName, maxStrLen) {
  if (typeName === "Void") return "void";
  if (!retval || retval.isNull()) return "null";

  if (isStringType(typeName)) return safeString(retval, maxStrLen);
  if (typeName === "Boolean") return retval.toInt32() !== 0 ? "true" : "false";
  if (typeName === "Int32") return retval.toInt32().toString();
  if (typeName === "UInt32") return retval.toUInt32().toString();

  return previewObject(retval, {
    tryToString: CONFIG.hook.tryToString,
    previewObjects: CONFIG.hook.previewObjects,
    maxObjectFields: CONFIG.hook.maxObjectFields,
    maxStringLength: maxStrLen,
    expandDictionaries: CONFIG.hook.expandDictionaries,
    maxDictEntries: CONFIG.hook.maxDictEntries,
    expandLists: CONFIG.hook.expandLists,
    expandMultimap: CONFIG.hook.expandMultimap,
  });
}

function readInt64Arg(argPtr) {
  if (!argPtr) return "null";
  try {
    return argPtr.toInt64().toString();
  } catch (_) {
    return argPtr.toString();
  }
}

function readNullableInt64Arg(argPtr) {
  if (!argPtr || argPtr.isNull()) return "null";
  try {
    const hasValue = argPtr.readU8();
    if (!hasValue) return "null";
    const value = argPtr.add(8).readS64();
    return value.toString();
  } catch (_) {
    return argPtr.toString();
  }
}

function toNativePtrFromInt64(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return ptr(value);
  return ptr(value);
}

function isAnalyzeMethod(methodName, list) {
  if (!list || list.length === 0) return false;
  return list.includes(methodName);
}

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
 * Searches for IL2CPP classes matching the target configuration.
 * Supports exact or partial matching on namespace and className.
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
                `  ${assembly.name} -> ${klass.namespace}.${klass.name}`,
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
      `  [${i}] ${m.assembly.name} -> ${m.klass.namespace}.${m.klass.name}`,
    );
  });

  const pick = Math.min(Math.max(target.pickIndex || 0, 0), matches.length - 1);

  const chosen = matches[pick];
  console.log(
    `[+] Using [${pick}] ${chosen.assembly.name} -> ${chosen.klass.namespace}.${chosen.klass.name}`,
  );
  return chosen;
}

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
 * Installs Frida interceptors on specified methods with rate limiting.
 * Logs method calls with arguments, return values, and optional stack traces.
 * Supports special handling for HTTP request/response methods.
 * @param {Object} klass - IL2CPP class object
 * @param {string} classFullName - Fully qualified class name for logging
 * @param {Array} methods - Array of method objects to hook
 * @param {Object} hookCfg - Hook configuration from CONFIG.hook
 */
function hookMethods(klass, classFullName, methods, hookCfg) {
  if (!hookCfg.enabled) {
    console.log("[*] Hooking disabled.");
    return;
  }

  let idx = 0;
  let hooked = 0;
  let failed = 0;

  console.log(`[+] Hooking ${methods.length} methods (slow mode)...`);

  const timer = setInterval(() => {
    if (idx >= methods.length || hooked >= hookCfg.maxHooks) {
      clearInterval(timer);
      console.log(
        `[✓] Hooked ${hooked} methods (${failed} failed, ${methods.length} total)\n`,
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
            hookCfg.logSpecials && method.name === "NewRequest";
          const sep = "----------------------------------------";

          if (isNewRequest) {
            this.__req_block = true;
            this.__req_sep = sep;
            console.log(sep);
          }

          if (hookCfg.logArgs) {
            for (let i = 0; i < method.parameters.length; i++) {
              if (i >= hookCfg.maxArgs) {
                argParts.push("...");
                break;
              }
              const p = method.parameters[i];
              const argPtr = args[i + argStart];
              const val = hookCfg.rawCallArgs
                ? formatArgRaw(argPtr, p.type.name)
                : formatArg(argPtr, p.type.name, hookCfg.maxStringLength);
              argParts.push(`${p.name || "arg" + i}=${val}`);
            }
          }

          const thisInfo =
            !method.isStatic && hookCfg.showThis ? ` this=${args[0]}` : "";

          const argsStr = hookCfg.logArgs ? argParts.join(", ") : "";
          console.log(
            `[CALL] ${classFullName}.${method.name}(${argsStr})${thisInfo}`,
          );

          // Advanced: Custom analysis for specific methods
          // Add your own method-specific analysis logic here
          // Example:
          // if (isAnalyzeMethod(method.name, hookCfg.analyzeMethods)) {
          //   const sep = "----------------------------------------";
          //   if (hookCfg.analyzeSeparator) console.log(sep);
          //   console.log(`[ANALYZE] ${classFullName}.${method.name}`);
          //
          //   const base = argStart;
          //   if (method.name === "ProcessTransaction" && method.parameters.length >= 2) {
          //     const userId = readInt64Arg(args[base]);
          //     const amount = readInt64Arg(args[base + 1]);
          //     console.log(`  userId=${userId}`);
          //     console.log(`  amount=${amount}`);
          //   }
          //
          //   if (hookCfg.analyzeSeparator) console.log(sep);
          // }

          if (hookCfg.dumpOnCall) {
            for (let i = 0; i < method.parameters.length; i++) {
              const p = method.parameters[i];
              if (!p || !p.type) continue;
              if (!shouldDumpType(p.type.name, hookCfg)) continue;
              const argPtr = args[i + argStart];
              dumpObjectFields(argPtr, p.type.name, hookCfg);
            }
          }

          if (isNewRequest) {
            const paramMap = {};
            method.parameters.forEach((p, i) => {
              const key = (p.name || "").toLowerCase();
              paramMap[key] = { ptr: args[i + argStart], type: p.type.name };
            });

            const httpMethod = paramMap.method
              ? readHttpMethod(paramMap.method.ptr)
              : null;
            const path = paramMap.path
              ? tryReadString(paramMap.path.ptr)
              : null;
            let basePath = paramMap.basepath
              ? tryReadString(paramMap.basepath.ptr)
              : null;
            if (!basePath && paramMap.configuration) {
              basePath = extractBasePathFromConfig(paramMap.configuration.ptr);
            }
            const optionsInfo = paramMap.options
              ? extractOptionsDetails(paramMap.options.ptr, {
                  tryToString: hookCfg.tryToString,
                  previewObjects: hookCfg.previewObjects,
                  maxObjectFields: hookCfg.maxObjectFields,
                  maxStringLength: hookCfg.maxStringLength,
                  expandDictionaries: hookCfg.expandDictionaries,
                  maxDictEntries: hookCfg.maxDictEntries,
                  expandLists: hookCfg.expandLists,
                  expandMultimap: hookCfg.expandMultimap,
                })
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
              const url = buildUrl(basePath, path);
              console.log(`[URL] ${url}`);
            }
          }

          if (hookCfg.showStack) {
            const stack = Thread.backtrace(this.context, Backtracer.ACCURATE)
              .slice(0, 6)
              .map(DebugSymbol.fromAddress)
              .join("\n");
            console.log(stack);
          }
        },
        onLeave: function (retval) {
          if (hookCfg.logReturn) {
            const ret = formatReturn(
              retval,
              method.returnType.name,
              hookCfg.maxStringLength,
            );
            console.log(`[RET] ${classFullName}.${method.name} -> ${ret}`);
          }

          if (hookCfg.logSpecials && method.name === "NewRequest") {
            const sep =
              this.__req_sep || "----------------------------------------";
            const info = extractRequestSummary(retval, {
              maxStringLength: hookCfg.maxStringLength,
              reqToStringMaxLen: hookCfg.reqToStringMaxLen,
            });
            if (info) {
              if (info.method || info.uri) {
                console.log(
                  `[REQ] method="${info.method || ""}" uri="${info.uri || ""}"`,
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

          if (
            hookCfg.logSpecials &&
            (method.name.includes("CallApi") ||
              method.name.includes("SendAsync"))
          ) {
            const summary = extractResponseSummary(retval, {
              maxStringLength: hookCfg.maxStringLength,
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
  }, hookCfg.delayMs);
}

Il2Cpp.perform(() => {
  console.log("[+] Base RE class hooker");
  if (globalThis.__base_re_initialized) {
    console.log("[!] base_re already initialized, skipping duplicate run.");
    return;
  }
  globalThis.__base_re_initialized = true;

  const target = normalizeTarget(CONFIG.target);

  if (!target.className) {
    console.log("[!] Please set target.className or target.fullName.");
    return;
  }

  const chosen = selectClass(target);
  if (!chosen) return;

  const klass = chosen.klass;
  const classFullName = klass.namespace
    ? `${klass.namespace}.${klass.name}`
    : klass.name;

  listMethods(klass);

  const methodsToHook = buildHookList(klass, CONFIG.filters);
  hookMethods(klass, classFullName, methodsToHook, CONFIG.hook);
});
