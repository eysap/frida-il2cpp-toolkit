"use strict";

/**
 * Formatters for method arguments, return values, and object previews
 * @module formatters
 */

(function(global) {
  const utils = global.IL2CPPHooker.utils;

  let cachedPreviewConfig = null;
  let cachedPreviewOptions = null;

  function buildRegexList(patterns) {
    if (!Array.isArray(patterns)) return [];
    return patterns
      .map((p) => {
        try {
          return new RegExp(p);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
  }

  function getPreviewOptions(config) {
    if (config === cachedPreviewConfig && cachedPreviewOptions) {
      return cachedPreviewOptions;
    }
    cachedPreviewConfig = config;
    cachedPreviewOptions = {
      tryToString: config.formatting.objects.tryToString,
      previewObjects: config.formatting.objects.showFields,
      maxObjectFields: config.formatting.objects.maxFields,
      maxStringLength: config.formatting.strings.maxLength,
      expandDictionaries: config.formatting.collections.dictionaries.enabled,
      maxDictEntries: config.formatting.collections.dictionaries.maxEntries,
      expandLists: config.formatting.collections.lists.enabled,
      expandMultimap: config.formatting.collections.multimaps.enabled,
      omitFields: config.formatting.objects.omitFields || [],
      omitFieldRegex: buildRegexList(config.formatting.objects.omitFieldPatterns),
      fieldAllowlistByType: config.formatting.objects.fieldAllowlistByType || {},
      fieldDenylistByType: config.formatting.objects.fieldDenylistByType || {},
    };
    return cachedPreviewOptions;
  }

  function isBufferFieldName(fieldName) {
    if (!fieldName) return false;
    const lower = fieldName.toLowerCase();
    return lower === "buffer" || lower === "_buffer" ||
           lower === "data" || lower === "_data" ||
           lower.endsWith("buffer") || lower.endsWith("bytes");
  }

  function isByteArrayType(typeName) {
    if (!typeName) return false;
    const lower = typeName.toLowerCase();
    return lower.includes("byte") && lower.includes("[");
  }

  function isArrayType(typeName) {
    return typeName && typeName.includes("[") && typeName.includes("]");
  }

  function isByRefType(typeName) {
    return typeof typeName === "string" && typeName.endsWith("&");
  }

  function formatStringValue(ptr, maxLen) {
    if (!ptr || ptr.isNull()) return "null";
    const raw = utils.tryReadString(ptr);
    if (raw === null) return ptr.toString();
    const truncated = raw.length > maxLen ? raw.slice(0, maxLen) + "..." : raw;
    return `"${truncated}" len=${raw.length}`;
  }

  function formatByRefValue(ptr, typeName) {
    if (!ptr || ptr.isNull()) return "null";
    return `${typeName}@${ptr} (ref)`;
  }

  function shouldIncludeField(classInfo, fieldName, opts) {
    if (!fieldName) return false;
    const fullName = classInfo?.fullName || "";
    const allowlist = opts.fieldAllowlistByType?.[fullName];
    if (Array.isArray(allowlist) && allowlist.length > 0) {
      return allowlist.includes(fieldName);
    }
    const denylist = opts.fieldDenylistByType?.[fullName];
    if (Array.isArray(denylist) && denylist.includes(fieldName)) return false;
    if (opts.omitFields && opts.omitFields.includes(fieldName)) return false;
    if (opts.omitFieldRegex && opts.omitFieldRegex.some((re) => re.test(fieldName))) return false;
    return true;
  }

  function safeValueToString(value, maxLen) {
    if (value === null || value === undefined) return "null";

    if (typeof value.isNull === "function") {
      return value.isNull() ? "null" : value.toString();
    }

    if (Array.isArray(value)) {
      const len = value.length;
      if (len === 0) return "[]";
      const preview = value.slice(0, Math.min(20, len)).join(",");
      return len > 20 ? `[${preview}...+${utils.formatSize(len - 20)}]` : `[${preview}]`;
    }

    if (value && typeof value.handle !== "undefined") {
      return value.handle.toString();
    }

    const str = String(value);
    return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
  }

  function summarizeFieldValue(value, typeName, opts) {
    if (value === null || value === undefined) return "null";
    if (typeof value.isNull === "function" && value.isNull()) return "null";

    // Handle byte arrays first to avoid huge output
    if (isByteArrayType(typeName)) {
      if (typeof value.add === "function") {
        return utils.readByteArraySummary(value, opts.maxBufferPreviewBytes || 20) || "Byte[]";
      }
      if (Array.isArray(value)) {
        const len = value.length;
        if (len === 0) return "Byte[0]";
        const sample = value.slice(0, Math.min(100, len));
        if (sample.every(b => b === 0) && len > 100) {
          return `Byte[${utils.formatSize(len)}] [empty]`;
        }
        const preview = value.slice(0, 20).join(",");
        return len > 20
          ? `Byte[${utils.formatSize(len)}] [${preview}...+${utils.formatSize(len - 20)}]`
          : `Byte[${len}] [${preview}]`;
      }
      return `Byte[?]`;
    }

    // Handle other array types
    if (isArrayType(typeName)) {
      if (Array.isArray(value)) {
        return `${typeName.replace("[]", "")}[${value.length}]`;
      }
      if (typeof value.add === "function") {
        try {
          const len = value.add(0x18).readPointer().toInt32();
          if (len >= 0 && len < 1000000) {
            return `${typeName.replace("[]", "")}[${len}]`;
          }
        } catch (_) {}
      }
      return typeName;
    }

    const valuePtr = value;

    if (utils.isStringType(typeName)) {
      return formatStringValue(valuePtr, opts.maxStringLength);
    }
    if (typeName === "Boolean") {
      try {
        return valuePtr.toInt32() !== 0 ? "true" : "false";
      } catch (_) {
        return safeValueToString(value, 50);
      }
    }
    if (typeName === "Int32" || typeName === "UInt32") {
      try {
        return valuePtr.toInt32().toString();
      } catch (_) {
        return safeValueToString(value, 50);
      }
    }

    try {
      const obj = new Il2Cpp.Object(valuePtr);
      if (opts.expandDictionaries && utils.isDictionaryClass(obj.class)) {
        return utils.readDictionarySummary(valuePtr, opts.maxDictEntries) || "Dict";
      }
      if (opts.expandMultimap && utils.isMultimapClass(obj.class)) {
        return utils.readMultimapSummary(valuePtr, opts) || "Multimap";
      }
      if (opts.expandLists && utils.isListClass(obj.class)) {
        const count = utils.readListCount(valuePtr);
        return count !== null ? `List[${count}]` : "List";
      }
    } catch (_) {}

    return safeValueToString(value, 100);
  }

  function safeObjectClassInfo(obj) {
    if (!obj) return null;
    try {
      const klass = obj.class;
      if (!klass) return null;
      const ns = klass.namespace;
      const name = klass.name;
      if (typeof ns !== "string" || typeof name !== "string") return null;
      return { namespace: ns, name: name, fullName: ns ? `${ns}.${name}` : name, klass };
    } catch (_) {
      return null;
    }
  }

  function previewObject(ptr, opts) {
    if (!ptr || ptr.isNull()) return "null";

    let obj;
    try {
      obj = new Il2Cpp.Object(ptr);
    } catch (_) {
      return ptr.toString();
    }

    const classInfo = safeObjectClassInfo(obj);
    if (!classInfo) {
      return `<inaccessible>@${ptr}`;
    }

    if (utils.isStringType(classInfo.fullName)) {
      const strVal = formatStringValue(ptr, opts.maxStringLength);
      return `${classInfo.fullName}@${ptr} ${strVal}`;
    }

    // Handle collection types
    const klass = classInfo.klass;
    if (opts.expandDictionaries && utils.isDictionaryClass(klass)) {
      return utils.readDictionarySummary(ptr, opts.maxDictEntries) || `${classInfo.name}@${ptr}`;
    }
    if (opts.expandMultimap && utils.isMultimapClass(klass)) {
      return utils.readMultimapSummary(ptr, opts) || `${classInfo.name}@${ptr}`;
    }
    if (opts.expandLists && utils.isListClass(klass)) {
      const count = utils.readListCount(ptr);
      return count !== null ? `List[${count}]` : `${classInfo.name}@${ptr}`;
    }

    let toStringValue = null;
    if (opts.tryToString) {
      toStringValue = utils.tryObjectToString(ptr, opts.maxStringLength);
    }

    if (!opts.previewObjects) {
      return toStringValue
        ? `${classInfo.fullName}@${ptr} "${toStringValue}"`
        : `${classInfo.fullName}@${ptr}`;
    }

    // Build field preview
    const fields = [];
    try {
      for (const field of obj.class.fields) {
        if (field.isStatic) continue;
        if (fields.length >= opts.maxObjectFields) break;
        if (!shouldIncludeField(classInfo, field.name, opts)) continue;

        const typeName = field.type.name || "";

        // Buffer fields: show placeholder
        if (isByteArrayType(typeName) && isBufferFieldName(field.name)) {
          fields.push(`${field.name}=[buffer]`);
          continue;
        }

        // Array fields: show size only
        if (isArrayType(typeName)) {
          try {
            const arrayPtr = obj.field(field.name).value;
            if (arrayPtr && typeof arrayPtr.add === "function" && !arrayPtr.isNull()) {
              const len = arrayPtr.add(0x18).readPointer().toInt32();
              if (len >= 0 && len < 10000000) {
                fields.push(`${field.name}=${typeName.replace("[]", "")}[${len}]`);
              } else {
                fields.push(`${field.name}=${typeName}`);
              }
            } else {
              fields.push(`${field.name}=null`);
            }
          } catch (_) {
            fields.push(`${field.name}=${typeName}`);
          }
          continue;
        }

        try {
          const value = obj.field(field.name).value;
          const summary = summarizeFieldValue(value, typeName, opts);
          fields.push(`${field.name}=${summary}`);
        } catch (_) {}
      }
    } catch (_) {}

    const preview = fields.length > 0 ? ` {${fields.join(", ")}}` : "";
    return toStringValue
      ? `${classInfo.fullName}@${ptr} "${toStringValue}"${preview}`
      : `${classInfo.fullName}@${ptr}${preview}`;
  }

  function formatArg(argPtr, typeName, maxStrLen, config) {
    if (!argPtr || argPtr.isNull()) return "null";

    if (isByRefType(typeName)) {
      return formatByRefValue(argPtr, typeName);
    }

    if (isByteArrayType(typeName)) {
      return utils.readByteArraySummary(argPtr, 20) || "Byte[]";
    }

    if (isArrayType(typeName)) {
      try {
        const len = argPtr.add(0x18).readPointer().toInt32();
        if (len >= 0 && len < 10000000) {
          return `${typeName.replace("[]", "")}[${len}]`;
        }
      } catch (_) {}
      return typeName;
    }

    if (utils.isStringType(typeName)) {
      return formatStringValue(argPtr, maxStrLen);
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
        return argPtr.toString();
      default:
        return previewObject(argPtr, getPreviewOptions(config));
    }
  }

  function formatArgRaw(argPtr, typeName) {
    if (!argPtr || argPtr.isNull()) return "null";
    return `${typeName}@${argPtr}`;
  }

  function formatReturn(retval, typeName, maxStrLen, config) {
    if (typeName === "Void") return "void";
    if (!retval || retval.isNull()) return "null";

    if (isByteArrayType(typeName)) {
      return utils.readByteArraySummary(retval, 20) || "Byte[]";
    }

    if (isArrayType(typeName)) {
      try {
        const len = retval.add(0x18).readPointer().toInt32();
        if (len >= 0 && len < 10000000) {
          return `${typeName.replace("[]", "")}[${len}]`;
        }
      } catch (_) {}
      return typeName;
    }

    if (utils.isStringType(typeName)) return formatStringValue(retval, maxStrLen);
    if (typeName === "Boolean") return retval.toInt32() !== 0 ? "true" : "false";
    if (typeName === "Int32") return retval.toInt32().toString();
    if (typeName === "UInt32") return retval.toUInt32().toString();

    return previewObject(retval, getPreviewOptions(config));
  }

  // Object Dumping
  const dumpState = { seen: new Set(), countByType: new Map() };

  function clearDumpState() {
    dumpState.seen.clear();
    dumpState.countByType.clear();
  }

  function shouldDumpType(typeName, opts) {
    if (!opts.types || opts.types.length === 0) return false;
    const lower = typeName.toLowerCase();
    return opts.types.some((t) => t.toLowerCase() === lower);
  }

  function canDumpPtr(ptr, typeName, opts) {
    const key = `${typeName}@${ptr}`;
    if (opts.deduplication && dumpState.seen.has(key)) return false;

    const count = dumpState.countByType.get(typeName) || 0;
    if (opts.maxPerType && count >= opts.maxPerType) return false;

    dumpState.countByType.set(typeName, count + 1);
    if (opts.deduplication) dumpState.seen.add(key);
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

    const ui = global.IL2CPPHooker.ui;
    const fields = [];
    let truncated = false;
    let printed = 0;

    try {
      for (const field of obj.class.fields) {
        if (!opts.includeStatic && field.isStatic) continue;
        if (printed >= opts.maxFields) {
          truncated = true;
          break;
        }

        const fieldTypeName = field.type.name || "";

        if (isByteArrayType(fieldTypeName) && isBufferFieldName(field.name)) {
          fields.push({ name: field.name, value: "[buffer]" });
          printed++;
          continue;
        }

        if (isArrayType(fieldTypeName)) {
          try {
            const arrayPtr = obj.field(field.name).value;
            if (arrayPtr && typeof arrayPtr.add === "function" && !arrayPtr.isNull()) {
              const len = arrayPtr.add(0x18).readPointer().toInt32();
              if (len >= 0 && len < 10000000) {
                fields.push({ name: field.name, value: `${fieldTypeName.replace("[]", "")}[${len}]` });
              } else {
                fields.push({ name: field.name, value: fieldTypeName });
              }
            } else {
              fields.push({ name: field.name, value: "null" });
            }
          } catch (_) {
            fields.push({ name: field.name, value: fieldTypeName });
          }
          printed++;
          continue;
        }

        try {
          const value = obj.field(field.name).value;
          const summary = summarizeFieldValue(value, fieldTypeName, opts);
          fields.push({ name: field.name, value: summary });
          printed++;
        } catch (_) {}
      }
    } catch (e) {
      fields.push({ name: 'ERROR', value: `Cannot read fields: ${e.message}` });
    }

    ui.dumpBlock({
      typeName,
      ptr: ptr.toString(),
      className: className !== typeName ? className : null,
      fields,
      truncated,
    });
  }

  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.formatters = {
    summarizeFieldValue,
    previewObject,
    formatArg,
    formatArgRaw,
    formatReturn,
    shouldDumpType,
    canDumpPtr,
    dumpObjectFields,
    clearDumpState,
    getPreviewOptions,
  };
})(globalThis);
