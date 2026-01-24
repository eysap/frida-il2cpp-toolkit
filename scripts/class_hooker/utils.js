"use strict";

/**
 * Utility functions for IL2CPP type checking, string handling, and field reading
 * @module utils
 */

(function(global) {
  const { OFFSETS, LIMITS } = global.IL2CPPHooker;

  // String Utilities

  function truncate(s, maxLen) {
    return s.length <= maxLen ? s : s.slice(0, maxLen) + "...";
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

  function tryReadString(ptr) {
    if (!ptr || ptr.isNull()) return null;
    try {
      return new Il2Cpp.String(ptr).content;
    } catch (_) {
      return null;
    }
  }

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

  // Type Checking

  const classTypeCache = new Map();

  function isStringType(typeName) {
    return /(^|\.)String(&|$)/.test(typeName);
  }

  function safeClassInfo(klass) {
    if (!klass) return null;
    try {
      const ns = klass.namespace;
      const name = klass.name;
      if (typeof ns !== "string" || typeof name !== "string") return null;
      return { namespace: ns, name: name };
    } catch (_) {
      return null;
    }
  }

  function isDictionaryClass(klass) {
    const info = safeClassInfo(klass);
    if (!info) return false;
    const cacheKey = `${info.namespace}.${info.name}`;
    if (classTypeCache.has(cacheKey)) {
      return classTypeCache.get(cacheKey) === "dictionary";
    }
    const result = info.namespace === "System.Collections.Generic" &&
                   info.name.startsWith("Dictionary`2");
    classTypeCache.set(cacheKey, result ? "dictionary" : "other");
    return result;
  }

  function isListClass(klass) {
    const info = safeClassInfo(klass);
    if (!info) return false;
    const cacheKey = `${info.namespace}.${info.name}`;
    if (classTypeCache.has(cacheKey)) {
      return classTypeCache.get(cacheKey) === "list";
    }
    const result = info.namespace === "System.Collections.Generic" &&
                   info.name.startsWith("List`1");
    classTypeCache.set(cacheKey, result ? "list" : "other");
    return result;
  }

  function isMultimapClass(klass) {
    const info = safeClassInfo(klass);
    if (!info) return false;
    return info.name.includes("Multimap`2");
  }

  // Field Reading

  function formatSize(bytes) {
    if (bytes < 1024) return bytes.toString();
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function readByteArraySummary(arrayPtr, maxPreviewBytes) {
    if (!arrayPtr || arrayPtr.isNull()) return null;
    maxPreviewBytes = maxPreviewBytes || 20;

    try {
      const length = arrayPtr.add(OFFSETS.ARRAY_MAX_LENGTH).readPointer().toInt32();
      if (length < 0 || length > LIMITS.MAX_ARRAY_LENGTH) return null;
      if (length === 0) return "Byte[0]";

      // Large arrays: size only
      if (length > 1024 * 1024) {
        return `Byte[${formatSize(length)}]`;
      }

      const dataStart = arrayPtr.add(0x20);
      const previewLen = Math.min(length, maxPreviewBytes);
      const bytes = [];
      let allZeros = true;

      for (let i = 0; i < previewLen; i++) {
        const b = dataStart.add(i).readU8();
        bytes.push(b);
        if (b !== 0) allZeros = false;
      }

      // Sample check for empty buffers
      if (allZeros && length > previewLen) {
        const samplePositions = [
          Math.floor(length / 4),
          Math.floor(length / 2),
          Math.floor(3 * length / 4),
          length - 1
        ];
        for (const pos of samplePositions) {
          if (pos < length && dataStart.add(pos).readU8() !== 0) {
            allZeros = false;
            break;
          }
        }
      }

      if (allZeros) {
        return `Byte[${formatSize(length)}] [empty]`;
      }

      const preview = bytes.join(",");
      const suffix = length > previewLen ? `...+${formatSize(length - previewLen)}` : "";
      return `Byte[${formatSize(length)}] [${preview}${suffix}]`;
    } catch (_) {
      return null;
    }
  }

  function readListCount(listPtr) {
    if (!listPtr || listPtr.isNull()) return null;
    try {
      return listPtr.add(OFFSETS.LIST_SIZE).readInt();
    } catch (_) {
      return null;
    }
  }

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

      return pairs.length > 0 ? `Dict[${count}] {${pairs.join(", ")}}` : `Dict[${count}]`;
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

  function findFieldValue(objPtr, nameMatch) {
    if (!objPtr || objPtr.isNull()) return null;
    try {
      const obj = new Il2Cpp.Object(objPtr);
      for (const field of obj.class.fields) {
        if (field.isStatic) continue;
        if (!nameMatch(field.name || "")) continue;
        const value = obj.field(field.name).value;
        return { name: field.name, typeName: field.type.name, value };
      }
    } catch (_) {}
    return null;
  }

  function findStringField(objPtr, nameMatch) {
    if (!objPtr || objPtr.isNull()) return null;
    try {
      const obj = new Il2Cpp.Object(objPtr);
      for (const field of obj.class.fields) {
        if (field.isStatic) continue;
        if (!nameMatch(field.name || "")) continue;
        const str = tryReadString(obj.field(field.name).value);
        if (str !== null) return str;
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
      const hasValue = argPtr.add(OFFSETS.NULLABLE_HAS_VALUE).readU8();
      if (!hasValue) return "null";
      return argPtr.add(OFFSETS.NULLABLE_VALUE).readS64().toString();
    } catch (_) {
      return argPtr.toString();
    }
  }

  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.utils = {
    truncate,
    safeString,
    safeObjectType,
    tryReadString,
    tryObjectToString,
    isStringType,
    isDictionaryClass,
    isListClass,
    isMultimapClass,
    formatSize,
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
