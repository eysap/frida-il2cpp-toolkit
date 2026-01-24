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
   * Checks if a field name suggests it's a buffer/binary data field
   * @param {string} fieldName - Field name to check
   * @returns {boolean} True if likely a buffer field
   */
  function isBufferFieldName(fieldName) {
    if (!fieldName) return false;
    const lower = fieldName.toLowerCase();
    return lower === "buffer" ||
           lower === "_buffer" ||
           lower === "data" ||
           lower === "_data" ||
           lower.endsWith("buffer") ||
           lower.endsWith("bytes");
  }

  /**
   * Checks if type name represents a byte array (various possible formats)
   * @param {string} typeName - Type name to check
   * @returns {boolean} True if byte array type
   */
  function isByteArrayType(typeName) {
    if (!typeName) return false;
    // Handle: "Byte[]", "System.Byte[]", "byte[]", "Byte[]&", etc.
    const lower = typeName.toLowerCase();
    return lower.includes("byte") && lower.includes("[");
  }

  /**
   * Checks if type name represents any array type
   * @param {string} typeName - Type name to check
   * @returns {boolean} True if array type
   */
  function isArrayType(typeName) {
    if (!typeName) return false;
    return typeName.includes("[") && typeName.includes("]");
  }

  /**
   * Safely converts a value to a display string, handling Il2Cpp.Array and other special types
   * @param {*} value - Value from field access (could be NativePointer, Il2Cpp.Array, etc.)
   * @param {string} typeName - Type name for context
   * @param {number} maxLen - Maximum output length
   * @returns {string} Safe string representation
   */
  function safeValueToString(value, typeName, maxLen) {
    if (value === null || value === undefined) return "null";

    // Check if it's a NativePointer with isNull method
    if (typeof value.isNull === "function") {
      if (value.isNull()) return "null";
      return value.toString();
    }

    // If it's an array (JavaScript array from Il2Cpp.Array.elements or similar)
    if (Array.isArray(value)) {
      const len = value.length;
      if (len === 0) return "[]";
      const preview = value.slice(0, Math.min(20, len)).join(",");
      if (len > 20) {
        return `[${preview}...+${utils.formatSize(len - 20)}]`;
      }
      return `[${preview}]`;
    }

    // If it has a handle property (Il2Cpp wrapper object)
    if (value && typeof value.handle !== "undefined") {
      return value.handle.toString();
    }

    // Fallback: convert to string and truncate
    const str = String(value);
    if (str.length > maxLen) {
      return str.slice(0, maxLen) + "...";
    }
    return str;
  }

  /**
   * Summarizes field value with type-appropriate formatting
   * @param {*} value - Field value (NativePointer, Il2Cpp.Array, or other)
   * @param {string} typeName - Type name
   * @param {Object} opts - Preview options
   * @param {string} [fieldName] - Optional field name for context-aware formatting
   * @returns {string} Formatted value summary
   */
  function summarizeFieldValue(value, typeName, opts, fieldName) {
    // Early null check - handle both null and NativePointer.isNull()
    if (value === null || value === undefined) return "null";
    if (typeof value.isNull === "function" && value.isNull()) return "null";

    // CRITICAL: Handle byte arrays FIRST to avoid huge output
    if (isByteArrayType(typeName)) {
      // If it's a NativePointer, use our smart summary
      if (typeof value.add === "function") {
        return utils.readByteArraySummary(value, opts.maxBufferPreviewBytes || 20) || "Byte[]";
      }
      // If it's already a JavaScript array (from Il2Cpp.Array), truncate it
      if (Array.isArray(value)) {
        const len = value.length;
        if (len === 0) return "Byte[0]";
        // Check if all zeros
        const sample = value.slice(0, Math.min(100, len));
        const allZeros = sample.every(b => b === 0);
        if (allZeros && len > 100) {
          return `Byte[${utils.formatSize(len)}] [empty]`;
        }
        const preview = value.slice(0, 20).join(",");
        if (len > 20) {
          return `Byte[${utils.formatSize(len)}] [${preview}...+${utils.formatSize(len - 20)}]`;
        }
        return `Byte[${len}] [${preview}]`;
      }
      // Fallback for other representations
      return `Byte[?]`;
    }

    // Handle any other array type with truncation
    if (isArrayType(typeName)) {
      if (Array.isArray(value)) {
        const len = value.length;
        return `${typeName.replace("[]", "")}[${len}]`;
      }
      if (typeof value.add === "function") {
        // It's a pointer, try to read length
        try {
          const len = value.add(0x18).readPointer().toInt32();
          if (len >= 0 && len < 1000000) {
            return `${typeName.replace("[]", "")}[${len}]`;
          }
        } catch (_) {}
      }
      return typeName;
    }

    // From here, we expect value to be a NativePointer for object types
    const valuePtr = value;

    if (utils.isStringType(typeName)) {
      return utils.safeString(valuePtr, opts.maxStringLength);
    }
    if (typeName === "Boolean") {
      try {
        return valuePtr.toInt32() !== 0 ? "true" : "false";
      } catch (_) {
        return safeValueToString(value, typeName, 50);
      }
    }
    if (typeName === "Int32" || typeName === "UInt32") {
      try {
        return valuePtr.toInt32().toString();
      } catch (_) {
        return safeValueToString(value, typeName, 50);
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

    // Safe fallback
    return safeValueToString(value, typeName, 100);
  }

  /**
   * Safely extracts class info from IL2CPP object
   * @param {Il2Cpp.Object} obj - IL2CPP object
   * @returns {{namespace: string, name: string, fullName: string}|null} Class info or null
   */
  function safeObjectClassInfo(obj) {
    if (!obj || !obj.class) return null;
    try {
      const ns = obj.class.namespace;
      const name = obj.class.name;
      if (typeof ns !== "string" || typeof name !== "string") return null;
      return {
        namespace: ns,
        name: name,
        fullName: ns ? `${ns}.${name}` : name,
      };
    } catch (_) {
      return null;
    }
  }

  /**
   * Checks if class is a protobuf stream type that contains large buffers
   * @param {string} className - Class name
   * @param {string} namespace - Class namespace
   * @returns {boolean} True if protobuf stream type
   */
  function isProtobufStreamClass(className, namespace) {
    if (!className) return false;
    // Google.Protobuf.CodedInputStream, Google.Protobuf.CodedOutputStream
    if (namespace === "Google.Protobuf") {
      return className === "CodedInputStream" ||
             className === "CodedOutputStream" ||
             className === "ByteString";
    }
    return false;
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

    // Get class info safely - bail early if metadata is corrupted
    const classInfo = safeObjectClassInfo(obj);
    if (!classInfo) {
      return `<inaccessible>@${ptr}`;
    }

    // Handle special collection types
    if (opts.expandDictionaries && utils.isDictionaryClass(obj.class)) {
      return (
        utils.readDictionarySummary(ptr, opts.maxDictEntries) ||
        `${classInfo.name}@${ptr}`
      );
    }
    if (opts.expandMultimap && utils.isMultimapClass(obj.class)) {
      return utils.readMultimapSummary(ptr, opts) || `${classInfo.name}@${ptr}`;
    }
    if (opts.expandLists && utils.isListClass(obj.class)) {
      const count = utils.readListCount(ptr);
      return count !== null ? `List[${count}]` : `${classInfo.name}@${ptr}`;
    }

    // Try ToString() if enabled
    let toStringValue = null;
    if (opts.tryToString) {
      toStringValue = utils.tryObjectToString(ptr, opts.maxStringLength);
    }

    // If preview disabled, return basic info
    if (!opts.previewObjects) {
      return toStringValue
        ? `${classInfo.fullName}@${ptr} "${toStringValue}"`
        : `${classInfo.fullName}@${ptr}`;
    }

    // Build field preview (protected against memory access violations)
    const fields = [];
    try {
      for (const field of obj.class.fields) {
        if (field.isStatic) continue;
        if (fields.length >= opts.maxObjectFields) break;

        const typeName = field.type.name || "";

        // Skip buffer-named byte array fields entirely - just show placeholder
        if (isByteArrayType(typeName) && isBufferFieldName(field.name)) {
          fields.push(`${field.name}=[buffer]`);
          continue;
        }

        // For any array type, show size only without reading content
        if (isArrayType(typeName)) {
          try {
            const arrayPtr = obj.field(field.name).value;
            if (arrayPtr && typeof arrayPtr.add === "function" && !arrayPtr.isNull()) {
              // Try to read array length without reading elements
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
          const summary = summarizeFieldValue(value, typeName, opts, field.name);
          fields.push(`${field.name}=${summary}`);
        } catch (_) {}
      }
    } catch (_) {
      // Fields iteration failed (corrupted metadata or invalid pointer)
    }

    const preview = fields.length > 0 ? ` {${fields.join(", ")}}` : "";
    if (toStringValue) {
      return `${classInfo.fullName}@${ptr} "${toStringValue}"${preview}`;
    }
    return `${classInfo.fullName}@${ptr}${preview}`;
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

    // CRITICAL: Handle byte arrays first to avoid huge output
    if (isByteArrayType(typeName)) {
      return utils.readByteArraySummary(argPtr, 20) || "Byte[]";
    }

    // Handle other array types with size only
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

    // CRITICAL: Handle byte arrays first to avoid huge output
    if (isByteArrayType(typeName)) {
      return utils.readByteArraySummary(retval, 20) || "Byte[]";
    }

    // Handle other array types with size only
    if (isArrayType(typeName)) {
      try {
        const len = retval.add(0x18).readPointer().toInt32();
        if (len >= 0 && len < 10000000) {
          return `${typeName.replace("[]", "")}[${len}]`;
        }
      } catch (_) {}
      return typeName;
    }

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

        // Skip large buffer fields in dump
        if (isByteArrayType(fieldTypeName) && isBufferFieldName(field.name)) {
          fields.push({ name: field.name, value: "[buffer]" });
          printed++;
          continue;
        }

        // Handle arrays with size only
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
          const summary = summarizeFieldValue(value, fieldTypeName, opts, field.name);
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
