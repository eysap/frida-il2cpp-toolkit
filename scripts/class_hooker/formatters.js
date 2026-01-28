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

  function normalizeTypeName(typeName) {
    if (!typeName || typeof typeName !== "string") return "";
    return typeName.replace(/^.*\./, "");
  }

  function isPrimitiveName(baseName) {
    switch (baseName) {
      case "Boolean":
      case "Int32":
      case "UInt32":
      case "Int64":
      case "UInt64":
      case "Int16":
      case "UInt16":
      case "SByte":
      case "Byte":
      case "Char":
        return true;
      default:
        return false;
    }
  }

  function formatInt64Value(ptr, numbers, unsigned) {
    const format = numbers?.int64Format || "hex+dec";
    try {
      const hex = ptr.toString();
      let dec;
      if (typeof BigInt !== "undefined") {
        const u = BigInt(hex);
        const max = BigInt("0x7fffffffffffffff");
        const mod = BigInt("0x10000000000000000");
        const s = u > max ? u - mod : u;
        dec = (unsigned ? u : s).toString();
      } else if (unsigned) {
        const u64 = ptr.toUInt64 ? ptr.toUInt64() : uint64(ptr.toString());
        dec = u64.toString(10);
      } else {
        const i64 = ptr.toInt64 ? ptr.toInt64() : int64(ptr.toString());
        dec = i64.toString(10);
      }
      if (format === "hex") return hex;
      if (format === "dec") return dec;
      // Avoid redundancy if hex and dec look the same
      if (hex === dec) return hex;
      return `${hex}/${dec}`;
    } catch (_) {
      return ptr.toString();
    }
  }

  function formatPrimitivePtr(ptr, baseName, numbers) {
    if (!ptr) return "null";
    try {
      switch (baseName) {
        case "Boolean":
          return ptr.toInt32() !== 0 ? "true" : "false";
        case "Int64":
          return formatInt64Value(ptr, numbers, false);
        case "UInt64":
          return formatInt64Value(ptr, numbers, true);
        case "Int32":
        case "Int16":
        case "SByte":
          return ptr.toInt32().toString();
        case "UInt32":
        case "UInt16":
        case "Byte":
        case "Char":
          return ptr.toUInt32().toString();
        default:
          return ptr.toString();
      }
    } catch (_) {
      return ptr.toString();
    }
  }

  function formatPrimitiveValue(value, baseName, numbers) {
    if (value === null || value === undefined) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return value.toString();
    if (typeof value === "string") return value;
    if ((baseName === "Int64" || baseName === "UInt64") && value && typeof value.toString === "function") {
      try {
        return formatInt64Value(value, numbers, baseName === "UInt64");
      } catch (_) {}
    }
    if (value && typeof value.toInt32 === "function") {
      return formatPrimitivePtr(value, baseName, numbers);
    }
    if (value && typeof value.toString === "function") {
      try {
        return value.toString();
      } catch (_) {}
    }
    return safeValueToString(value, 50);
  }

  const enumCache = new Map();

  function getEnumNameMap(enumClass) {
    if (!enumClass) return null;
    const key = enumClass.type?.name || enumClass.name;
    if (enumCache.has(key)) return enumCache.get(key);
    const map = new Map();
    try {
      enumClass.fields.forEach((field) => {
        if (!field.isStatic || !field.isLiteral) return;
        try {
          const val = field.value;
          // Store both numeric string and raw value as keys for lookup flexibility
          if (val !== null && val !== undefined) {
            const strVal = String(val);
            map.set(strVal, field.name);
            // Also store numeric conversion if different
            if (typeof val === "number" || typeof val === "bigint") {
              map.set(String(Number(val)), field.name);
            }
            // Handle Int64/UInt64 objects
            if (val && typeof val.toInt32 === "function") {
              try {
                map.set(String(val.toInt32()), field.name);
              } catch (_) {}
            }
          }
        } catch (_) {}
      });
    } catch (_) {}
    enumCache.set(key, map);
    return map;
  }

  function formatEnumValue(type, ptr, numbers) {
    if (!type || !type.class || !type.class.isEnum) return null;
    const enumClass = type.class;
    const baseType = enumClass.baseType;
    const baseName = normalizeTypeName(baseType ? baseType.name : "");
    const raw = formatPrimitivePtr(ptr, baseName || "Int32", numbers);
    const fullName = enumClass.namespace ? `${enumClass.namespace}.${enumClass.name}` : enumClass.name;
    const map = getEnumNameMap(enumClass);

    if (!map || map.size === 0) {
      return `${fullName}(${raw})`;
    }

    // Try multiple lookup keys for robustness
    let name = null;
    try {
      // Try decimal value first (most common)
      const decVal = baseName === "Int64" || baseName === "UInt64"
        ? formatPrimitivePtr(ptr, baseName, { int64Format: "dec" })
        : (ptr.toInt32 ? String(ptr.toInt32()) : raw);
      name = map.get(decVal);

      // Try raw hex if decimal failed
      if (!name && ptr.toInt32) {
        name = map.get(String(ptr.toInt32()));
      }

      // Try unsigned conversion
      if (!name && ptr.toUInt32) {
        name = map.get(String(ptr.toUInt32()));
      }
    } catch (_) {}

    return name ? `${fullName}.${name}(${raw})` : `${fullName}(${raw})`;
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
      numbers: config.formatting.numbers || {},
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

  function isPtrLike(value) {
    if (!value) return false;
    return typeof value.add === "function" ||
      typeof value.toInt32 === "function" ||
      typeof value.isNull === "function";
  }

  function readManagedArrayLength(ptr, maxLen) {
    if (!ptr || typeof ptr.add !== "function") return null;
    try {
      const len = ptr.add(0x18).readPointer().toInt32();
      const limit = maxLen || 10000000;
      if (len >= 0 && len < limit) return len;
    } catch (_) {}
    return null;
  }

  function formatArraySummary(value, typeName, maxLen) {
    const base = typeName.replace("[]", "");
    if (Array.isArray(value)) {
      return `${base}[${value.length}]`;
    }
    const len = readManagedArrayLength(value, maxLen);
    if (len !== null) {
      return `${base}[${len}]`;
    }
    return typeName;
  }

  function getCollectionSummary(obj, ptr, opts) {
    if (!obj || !obj.class || !opts) return null;
    const klass = obj.class;
    if (opts.expandDictionaries && utils.isDictionaryClass(klass)) {
      return utils.readDictionarySummary(ptr, opts.maxDictEntries) || `${klass.name}@${ptr}`;
    }
    if (opts.expandMultimap && utils.isMultimapClass(klass)) {
      return utils.readMultimapSummary(ptr, opts) || `${klass.name}@${ptr}`;
    }
    if (opts.expandLists && utils.isListClass(klass)) {
      const count = utils.readListCount(ptr);
      return count !== null ? `List[${count}]` : `${klass.name}@${ptr}`;
    }
    return null;
  }

  function tryGetCollectionSummary(ptr, opts) {
    if (!ptr || !opts) return null;
    try {
      const obj = new Il2Cpp.Object(ptr);
      return getCollectionSummary(obj, ptr, opts);
    } catch (_) {
      return null;
    }
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

  function formatByteArrayValue(value, opts) {
    const bufferMax = opts?.maxBufferPreviewBytes || 20;
    if (value && typeof value.add === "function") {
      return utils.readByteArraySummary(value, bufferMax) || "Byte[]";
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
    return "Byte[?]";
  }

  function formatValue(params) {
    const {
      value,
      typeName,
      type,
      config,
      opts,
      maxStrLen,
      context,
    } = params || {};

    if (value === null || value === undefined) return "null";
    const ctx = context || "arg";
    const numbers = config?.formatting?.numbers || opts?.numbers || {};
    const maxStringLength = maxStrLen !== undefined ? maxStrLen : opts?.maxStringLength;
    const ptrLike = isPtrLike(value);

    if (ctx === "arg" && isByRefType(typeName)) {
      return formatByRefValue(value, typeName);
    }

    if (ptrLike && value.isNull && value.isNull()) return "null";

    if (ptrLike) {
      const enumVal = formatEnumValue(type, value, numbers);
      if (enumVal) return enumVal;
    }

    if (isByteArrayType(typeName)) {
      return formatByteArrayValue(value, opts);
    }

    if (isArrayType(typeName)) {
      const arrayLimit = ctx === "field" ? 1000000 : 10000000;
      return formatArraySummary(value, typeName, arrayLimit);
    }

    if (utils.isStringType(typeName)) {
      if (ptrLike) return formatStringValue(value, maxStringLength);
      if (typeof value === "string") return value;
    }

    const baseName = normalizeTypeName(typeName);
    if (isPrimitiveName(baseName)) {
      if (ptrLike && typeof value.toInt32 === "function") {
        return formatPrimitivePtr(value, baseName, numbers);
      }
      return formatPrimitiveValue(value, baseName, numbers);
    }

    if (!ptrLike) {
      return safeValueToString(value, 100);
    }

    if (ctx === "field") {
      const summary = tryGetCollectionSummary(value, opts);
      if (summary) return summary;
      return safeValueToString(value, 100);
    }

    return previewObject(value, getPreviewOptions(config));
  }

  function summarizeFieldValue(value, typeName, opts) {
    const options = opts || {};
    return formatValue({
      value,
      typeName,
      opts: options,
      context: "field",
    });
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

  function collectObjectFields(obj, classInfo, opts, options) {
    const fields = [];
    let truncated = false;
    let printed = 0;
    const maxFields = options?.maxFields ?? 0;
    const includeStatic = options?.includeStatic ?? false;
    const applyFilters = options?.applyFilters ?? false;

    for (const field of obj.class.fields) {
      if (!includeStatic && field.isStatic) continue;
      if (printed >= maxFields) {
        truncated = true;
        break;
      }
      if (applyFilters && !shouldIncludeField(classInfo, field.name, opts)) continue;

      const typeName = field.type.name || "";

      if (isByteArrayType(typeName) && isBufferFieldName(field.name)) {
        fields.push({ name: field.name, value: "[buffer]" });
        printed++;
        continue;
      }

      if (isArrayType(typeName)) {
        try {
          const arrayPtr = obj.field(field.name).value;
          if (arrayPtr && !(arrayPtr.isNull && arrayPtr.isNull())) {
            fields.push({ name: field.name, value: formatArraySummary(arrayPtr, typeName, 10000000) });
          } else {
            fields.push({ name: field.name, value: "null" });
          }
        } catch (_) {
          fields.push({ name: field.name, value: typeName });
        }
        printed++;
        continue;
      }

      try {
        const value = obj.field(field.name).value;
        const summary = summarizeFieldValue(value, typeName, opts);
        fields.push({ name: field.name, value: summary });
        printed++;
      } catch (_) {}
    }

    return { fields, truncated };
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
      return `<native>@${ptr}`;
    }

    if (utils.isStringType(classInfo.fullName)) {
      const strVal = formatStringValue(ptr, opts.maxStringLength);
      return `${classInfo.fullName}@${ptr} ${strVal}`;
    }

    // Handle collection types
    const collectionSummary = getCollectionSummary(obj, ptr, opts);
    if (collectionSummary) return collectionSummary;

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
    let fields = [];
    try {
      const result = collectObjectFields(obj, classInfo, opts, {
        maxFields: opts.maxObjectFields,
        includeStatic: false,
        applyFilters: true,
      });
      fields = result.fields;
    } catch (_) {}

    const preview = fields.length > 0
      ? ` {${fields.map((f) => `${f.name}=${f.value}`).join(", ")}}`
      : "";
    return toStringValue
      ? `${classInfo.fullName}@${ptr} "${toStringValue}"${preview}`
      : `${classInfo.fullName}@${ptr}${preview}`;
  }

  function formatArg(argPtr, typeName, maxStrLen, config, type) {
    if (!argPtr) return "null";
    return formatValue({
      value: argPtr,
      typeName,
      type,
      maxStrLen,
      config,
      context: "arg",
    });
  }

  function formatArgRaw(argPtr, typeName, type, numbers) {
    if (!argPtr) return "null";
    const enumVal = formatEnumValue(type, argPtr, numbers);
    if (enumVal) return enumVal;
    const baseName = normalizeTypeName(typeName);
    if (isPrimitiveName(baseName)) {
      const val = formatPrimitivePtr(argPtr, baseName, numbers);
      return `System.${baseName}(${val})`;
    }
    if (argPtr.isNull && argPtr.isNull()) return "null";
    return `${typeName}@${argPtr}`;
  }

  function formatReturn(retval, typeName, maxStrLen, config, type) {
    if (typeName === "Void") return "void";
    if (!retval) return "null";
    return formatValue({
      value: retval,
      typeName,
      type,
      maxStrLen,
      config,
      context: "return",
    });
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
    let fields = [];
    let truncated = false;

    try {
      const result = collectObjectFields(obj, null, opts, {
        maxFields: opts.maxFields,
        includeStatic: opts.includeStatic,
        applyFilters: false,
      });
      fields = result.fields;
      truncated = result.truncated;
    } catch (e) {
      fields.push({ name: "ERROR", value: `Cannot read fields: ${e.message}` });
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
