"use strict";

/**
 * Utility functions for IL2CPP type checking, string handling, and field reading
 *
 * String Utilities:
 * - Safe string conversion with truncation support
 * - IL2CPP String pointer → JavaScript string conversion
 * - Managed ToString() invocation with error handling
 *
 * Type Checking:
 * - Class type detection (Dictionary, List, Multimap) with caching
 * - String type identification from type names
 * - Memory-efficient class type cache to avoid repeated reflection
 *
 * Field Reading:
 * - Collection introspection (arrays, lists, dictionaries)
 * - Field value extraction by name matching predicates
 * - Numeric type conversions (Int32, Int64, Nullable<T>)
 * - Memory-safe reads with IL2CPP offset-based access
 *
 * @module utils
 */

(function(global) {
  const { OFFSETS, LIMITS } = global.IL2CPPHooker;

  // ============================================================================
  // String Utilities
  // ============================================================================

  /**
   * Truncates a string to maximum length with ellipsis
   * @param {string} s - String to truncate
   * @param {number} maxLen - Maximum length
   * @returns {string} Truncated string
   */
  function truncate(s, maxLen) {
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + "...";
  }

  /**
   * Safely converts IL2CPP String pointer to JavaScript string
   * @param {NativePointer} ptr - IL2CPP String pointer
   * @param {number} maxLen - Maximum string length
   * @returns {string} Quoted string or pointer representation
   */
  function safeString(ptr, maxLen) {
    if (!ptr || ptr.isNull()) return "null";
    try {
      const s = new Il2Cpp.String(ptr).content;
      return `"${truncate(s, maxLen)}"`;
    } catch (_) {
      return ptr.toString();
    }
  }

  /**
   * Safely gets object type from pointer
   * @param {NativePointer} ptr - IL2CPP Object pointer
   * @returns {string} Type@pointer representation
   */
  function safeObjectType(ptr) {
    if (!ptr || ptr.isNull()) return "null";
    try {
      const obj = new Il2Cpp.Object(ptr);
      return `${obj.class.name}@${ptr}`;
    } catch (_) {
      return ptr.toString();
    }
  }

  /**
   * Tries to read IL2CPP String from pointer
   * @param {NativePointer} ptr - IL2CPP String pointer
   * @returns {string|null} String content or null
   */
  function tryReadString(ptr) {
    if (!ptr || ptr.isNull()) return null;
    try {
      return new Il2Cpp.String(ptr).content;
    } catch (_) {
      return null;
    }
  }

  /**
   * Tries to invoke ToString() on managed object
   * @param {NativePointer} objPtr - IL2CPP Object pointer
   * @param {number} maxLen - Maximum result length
   * @returns {string|null} ToString result or null
   */
  function tryObjectToString(objPtr, maxLen) {
    if (!objPtr || objPtr.isNull()) return null;
    try {
      const obj = new Il2Cpp.Object(objPtr);
      const toStringMethod = obj.class.methods.find(
        (m) => m.name === "ToString" && m.parameterCount === 0
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

  // ============================================================================
  // Type Checking
  // ============================================================================

  // Cache for class type checks to avoid repeated reflection
  const classTypeCache = new Map();

  /**
   * Checks if type name represents a String type
   * @param {string} typeName - Type name to check
   * @returns {boolean} True if String type
   */
  function isStringType(typeName) {
    return /(^|\\.)String(&|$)/.test(typeName);
  }

  /**
   * Checks if class is Dictionary<TKey,TValue>
   * @param {Il2Cpp.Class} klass - IL2CPP class object
   * @returns {boolean} True if Dictionary class
   */
  function isDictionaryClass(klass) {
    if (!klass) return false;
    const cacheKey = `${klass.namespace}.${klass.name}`;
    if (classTypeCache.has(cacheKey)) {
      return classTypeCache.get(cacheKey) === "dictionary";
    }
    const result =
      klass.namespace === "System.Collections.Generic" &&
      klass.name.startsWith("Dictionary`2");
    classTypeCache.set(cacheKey, result ? "dictionary" : "other");
    return result;
  }

  /**
   * Checks if class is List<T>
   * @param {Il2Cpp.Class} klass - IL2CPP class object
   * @returns {boolean} True if List class
   */
  function isListClass(klass) {
    if (!klass) return false;
    const cacheKey = `${klass.namespace}.${klass.name}`;
    if (classTypeCache.has(cacheKey)) {
      return classTypeCache.get(cacheKey) === "list";
    }
    const result =
      klass.namespace === "System.Collections.Generic" &&
      klass.name.startsWith("List`1");
    classTypeCache.set(cacheKey, result ? "list" : "other");
    return result;
  }

  /**
   * Checks if class is Multimap<TKey,TValue>
   * @param {Il2Cpp.Class} klass - IL2CPP class object
   * @returns {boolean} True if Multimap class
   */
  function isMultimapClass(klass) {
    if (!klass) return false;
    return klass.name && klass.name.includes("Multimap`2");
  }

  // ============================================================================
  // Field Reading
  // ============================================================================

  /**
   * Reads byte array summary (length only)
   * @param {NativePointer} arrayPtr - Byte array pointer
   * @returns {string|null} Array size description or null
   */
  function readByteArraySummary(arrayPtr) {
    if (!arrayPtr || arrayPtr.isNull()) return null;
    try {
      const maxLength = arrayPtr.add(OFFSETS.ARRAY_MAX_LENGTH).readPointer().toInt32();
      if (maxLength < 0 || maxLength > LIMITS.MAX_ARRAY_LENGTH) return null;
      return `Byte[${maxLength}]`;
    } catch (_) {
      return null;
    }
  }

  /**
   * Reads List<T> element count
   * @param {NativePointer} listPtr - List pointer
   * @returns {number|null} List size or null
   */
  function readListCount(listPtr) {
    if (!listPtr || listPtr.isNull()) return null;
    try {
      return listPtr.add(OFFSETS.LIST_SIZE).readInt();
    } catch (_) {
      return null;
    }
  }

  /**
   * Reads Dictionary<string,string> entries summary
   * @param {NativePointer} dictPtr - Dictionary pointer
   * @param {number} maxEntries - Maximum entries to read
   * @returns {string|null} Dictionary summary or null
   */
  function readDictionarySummary(dictPtr, maxEntries) {
    if (!dictPtr || dictPtr.isNull()) return null;
    try {
      const entriesPtr = dictPtr.add(OFFSETS.DICT_ENTRIES_PTR).readPointer();
      const count = dictPtr.add(OFFSETS.DICT_COUNT).readInt();
      if (count <= 0 || entriesPtr.isNull()) return `Dict[${count}]`;

      const itemsStart = entriesPtr.add(0x20);
      const shown = Math.min(count, maxEntries);
      const pairs = [];

      for (let i = 0; i < shown; i++) {
        const entryPtr = itemsStart.add(i * OFFSETS.DICT_ENTRY_SIZE);
        const hashCode = entryPtr.add(OFFSETS.DICT_ENTRY_HASHCODE).readInt();
        if (hashCode < 0) continue;
        const keyPtr = entryPtr.add(OFFSETS.DICT_ENTRY_KEY).readPointer();
        const valPtr = entryPtr.add(OFFSETS.DICT_ENTRY_VALUE).readPointer();

        const keyStr = keyPtr.isNull() ? "null" : safeString(keyPtr, 50);
        const valStr = valPtr.isNull() ? "null" : safeString(valPtr, 50);
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

  /**
   * Reads Multimap summary by inspecting internal collection
   * @param {NativePointer} mapPtr - Multimap pointer
   * @param {Object} opts - Options for expansion
   * @returns {string|null} Multimap summary or null
   */
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

  /**
   * Finds field value by name matching predicate
   * @param {NativePointer} objPtr - Object pointer
   * @param {Function} nameMatch - Name matching predicate
   * @returns {Object|null} Field info {name, typeName, value} or null
   */
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

  /**
   * Finds string field by name matching predicate
   * @param {NativePointer} objPtr - Object pointer
   * @param {Function} nameMatch - Name matching predicate
   * @returns {string|null} String value or null
   */
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

  /**
   * Finds integer field by name matching predicate
   * @param {NativePointer} objPtr - Object pointer
   * @param {Function} nameMatch - Name matching predicate
   * @returns {number|null} Integer value or null
   */
  function findIntField(objPtr, nameMatch) {
    const hit = findFieldValue(objPtr, nameMatch);
    if (!hit || !hit.value || hit.value.isNull()) return null;
    try {
      return hit.value.toInt32();
    } catch (_) {
      return null;
    }
  }

  /**
   * Converts Int64 argument to string representation
   * @param {NativePointer} argPtr - Int64 pointer
   * @returns {string} String representation
   */
  function readInt64Arg(argPtr) {
    if (!argPtr) return "null";
    try {
      return argPtr.toInt64().toString();
    } catch (_) {
      return argPtr.toString();
    }
  }

  /**
   * Reads Nullable<Int64> value
   * @param {NativePointer} argPtr - Nullable<Int64> pointer
   * @returns {string} Value or "null"
   */
  function readNullableInt64Arg(argPtr) {
    if (!argPtr || argPtr.isNull()) return "null";
    try {
      const hasValue = argPtr.add(OFFSETS.NULLABLE_HAS_VALUE).readU8();
      if (!hasValue) return "null";
      const value = argPtr.add(OFFSETS.NULLABLE_VALUE).readS64();
      return value.toString();
    } catch (_) {
      return argPtr.toString();
    }
  }

  // Export to global scope
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.utils = {
    // String utilities
    truncate,
    safeString,
    safeObjectType,
    tryReadString,
    tryObjectToString,

    // Type checking
    isStringType,
    isDictionaryClass,
    isListClass,
    isMultimapClass,

    // Field reading
    readByteArraySummary,
    readListCount,
    readDictionarySummary,
    readMultimapSummary,
    findFieldValue,
    findStringField,
    findIntField,
    readInt64Arg,
    readNullableInt64Arg,
  };
})(globalThis);
