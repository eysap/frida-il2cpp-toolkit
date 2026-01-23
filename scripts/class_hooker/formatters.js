"use strict";

/**
 * Formatters for method arguments, return values, and object previews
 *
 * Argument Formatting:
 * - Type-aware formatting (primitives, strings, objects)
 * - Raw pointer mode for unprocessed argument display
 * - Configurable string truncation and object field limits
 *
 * Object Preview:
 * - Shallow field inspection with configurable depth
 * - Special handling for collections (Dictionary, List, Multimap)
 * - Optional ToString() invocation for better readability
 * - Field value summarization with type-specific formatting
 *
 * Object Dumping:
 * - Full object field dump with configured limits
 * - Deduplication to prevent repeated dumps of same pointer
 * - Type-based filtering for selective dumping
 * - Memory-safe state management with cleanup support
 *
 * @module formatters
 */

(function(global) {
  const utils = global.IL2CPPHooker.utils;

  /**
   * Gets common object preview options from config
   * @param {Object} config - Full CONFIG object
   * @returns {Object} Preview options
   */
  function getPreviewOptions(config) {
    return {
      tryToString: config.formatting.objects.tryToString,
      previewObjects: config.formatting.objects.showFields,
      maxObjectFields: config.formatting.objects.maxFields,
      maxStringLength: config.formatting.strings.maxLength,
      expandDictionaries: config.formatting.collections.dictionaries.enabled,
      maxDictEntries: config.formatting.collections.dictionaries.maxEntries,
      expandLists: config.formatting.collections.lists.enabled,
      expandMultimap: config.formatting.collections.multimaps.enabled,
    };
  }

  /**
   * Summarizes field value with type-appropriate formatting
   * @param {NativePointer} valuePtr - Field value pointer
   * @param {string} typeName - Type name
   * @param {Object} opts - Preview options
   * @returns {string} Formatted value summary
   */
  function summarizeFieldValue(valuePtr, typeName, opts) {
    if (!valuePtr || valuePtr.isNull()) return "null";

    if (utils.isStringType(typeName)) {
      return utils.safeString(valuePtr, opts.maxStringLength);
    }
    if (typeName === "Boolean") {
      return valuePtr.toInt32() !== 0 ? "true" : "false";
    }
    if (typeName === "Int32" || typeName === "UInt32") {
      return valuePtr.toInt32().toString();
    }
    if (typeName === "Byte[]") {
      return utils.readByteArraySummary(valuePtr) || "Byte[]";
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

    return valuePtr.toString();
  }

  /**
   * Generates preview of managed object with field inspection
   * @param {NativePointer} ptr - Object pointer
   * @param {Object} opts - Preview options
   * @returns {string} Object preview string
   */
  function previewObject(ptr, opts) {
    if (!ptr || ptr.isNull()) return "null";

    let obj;
    try {
      obj = new Il2Cpp.Object(ptr);
    } catch (_) {
      return ptr.toString();
    }

    // Handle special collection types
    if (opts.expandDictionaries && utils.isDictionaryClass(obj.class)) {
      return (
        utils.readDictionarySummary(ptr, opts.maxDictEntries) ||
        `${obj.class.name}@${ptr}`
      );
    }
    if (opts.expandMultimap && utils.isMultimapClass(obj.class)) {
      return utils.readMultimapSummary(ptr, opts) || `${obj.class.name}@${ptr}`;
    }
    if (opts.expandLists && utils.isListClass(obj.class)) {
      const count = utils.readListCount(ptr);
      return count !== null ? `List[${count}]` : `${obj.class.name}@${ptr}`;
    }

    const className = obj.class.namespace
      ? `${obj.class.namespace}.${obj.class.name}`
      : obj.class.name;

    // Try ToString() if enabled
    let toStringValue = null;
    if (opts.tryToString) {
      toStringValue = utils.tryObjectToString(ptr, opts.maxStringLength);
    }

    // If preview disabled, return basic info
    if (!opts.previewObjects) {
      return toStringValue
        ? `${className}@${ptr} "${toStringValue}"`
        : `${className}@${ptr}`;
    }

    // Build field preview (protected against memory access violations)
    const fields = [];
    try {
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
    } catch (_) {
      // Fields iteration failed (corrupted metadata or invalid pointer)
    }

    const preview = fields.length > 0 ? ` {${fields.join(", ")}}` : "";
    if (toStringValue) {
      return `${className}@${ptr} "${toStringValue}"${preview}`;
    }
    return `${className}@${ptr}${preview}`;
  }

  /**
   * Formats method argument with type-appropriate representation
   * @param {NativePointer} argPtr - Argument pointer
   * @param {string} typeName - Type name
   * @param {number} maxStrLen - Maximum string length
   * @param {Object} config - Hook configuration
   * @returns {string} Formatted argument
   */
  function formatArg(argPtr, typeName, maxStrLen, config) {
    if (!argPtr || argPtr.isNull()) return "null";

    if (utils.isStringType(typeName)) {
      return utils.safeString(argPtr, maxStrLen);
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
        // Avoid memory reads; show raw value
        return argPtr.toString();
      default:
        return previewObject(argPtr, getPreviewOptions(config));
    }
  }

  /**
   * Formats argument in raw pointer form
   * @param {NativePointer} argPtr - Argument pointer
   * @param {string} typeName - Type name
   * @returns {string} Raw format: TypeName@pointer
   */
  function formatArgRaw(argPtr, typeName) {
    if (!argPtr || argPtr.isNull()) return "null";
    return `${typeName}@${argPtr}`;
  }

  /**
   * Formats method return value
   * @param {NativePointer} retval - Return value pointer
   * @param {string} typeName - Type name
   * @param {number} maxStrLen - Maximum string length
   * @param {Object} config - Hook configuration
   * @returns {string} Formatted return value
   */
  function formatReturn(retval, typeName, maxStrLen, config) {
    if (typeName === "Void") return "void";
    if (!retval || retval.isNull()) return "null";

    if (utils.isStringType(typeName)) return utils.safeString(retval, maxStrLen);
    if (typeName === "Boolean") return retval.toInt32() !== 0 ? "true" : "false";
    if (typeName === "Int32") return retval.toInt32().toString();
    if (typeName === "UInt32") return retval.toUInt32().toString();

    return previewObject(retval, getPreviewOptions(config));
  }

  // ============================================================================
  // Object Dumping
  // ============================================================================

  const dumpState = {
    seen: new Set(),
    countByType: new Map(),
  };

  /**
   * Clears dump state to prevent memory leaks
   */
  function clearDumpState() {
    dumpState.seen.clear();
    dumpState.countByType.clear();
  }

  /**
   * Checks if type should be dumped based on configuration
   * @param {string} typeName - Type name to check
   * @param {Object} opts - Dump options
   * @returns {boolean} True if should dump
   */
  function shouldDumpType(typeName, opts) {
    if (!opts.types || opts.types.length === 0) return false;
    const lower = typeName.toLowerCase();
    return opts.types.some((t) => t.toLowerCase() === lower);
  }

  /**
   * Checks if pointer can be dumped based on limits
   * @param {NativePointer} ptr - Object pointer
   * @param {string} typeName - Type name
   * @param {Object} opts - Dump options
   * @returns {boolean} True if can dump
   */
  function canDumpPtr(ptr, typeName, opts) {
    const key = `${typeName}@${ptr}`;
    if (opts.deduplication && dumpState.seen.has(key)) return false;

    const count = dumpState.countByType.get(typeName) || 0;
    if (opts.maxPerType && count >= opts.maxPerType) return false;

    dumpState.countByType.set(typeName, count + 1);
    if (opts.deduplication) dumpState.seen.add(key);
    return true;
  }

  /**
   * Dumps all fields of an object to console
   * @param {NativePointer} ptr - Object pointer
   * @param {string} typeName - Type name for logging
   * @param {Object} opts - Dump options
   */
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
    try {
      for (const field of obj.class.fields) {
        if (!opts.includeStatic && field.isStatic) continue;
        if (printed >= opts.maxFields) {
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
    } catch (e) {
      console.log(`  [ERROR] Cannot read fields: ${e.message}`);
    }

    console.log("==== END DUMP ====");
  }

  // Export to global scope
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
