"use strict";

/**
 * Constants for IL2CPP memory structure offsets and limits
 *
 * Memory Layout Offsets:
 * - Array structures (IL2CPP runtime array representation)
 * - List<T> generic collection structures
 * - Dictionary<TKey,TValue> hash table structures
 * - Nullable<T> value type wrappers
 *
 * These offsets are specific to IL2CPP's internal memory layout and may vary
 * between Unity versions. Current offsets are for Unity 2019.x - 2022.x range.
 *
 * Safety Limits:
 * - Maximum safe array read size (prevents OOM)
 * - Stack trace depth for performance balance
 *
 * @module constants
 */

(function(global) {
  const OFFSETS = {
    // Array offsets
    ARRAY_MAX_LENGTH: 0x18,

    // List<T> offsets
    LIST_SIZE: 0x18,

    // Dictionary<K,V> offsets
    DICT_ENTRIES_PTR: 0x18,
    DICT_COUNT: 0x20,
    DICT_ENTRY_SIZE: 24,
    DICT_ENTRY_HASHCODE: 0,
    DICT_ENTRY_KEY: 8,
    DICT_ENTRY_VALUE: 16,

    // Nullable<T> offsets
    NULLABLE_HAS_VALUE: 0,
    NULLABLE_VALUE: 8,
  };

  const LIMITS = {
    MAX_ARRAY_LENGTH: 1024 * 1024, // 1MB max array size
    MAX_BACKTRACE_DEPTH: 6,
  };

  // Export to global scope
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.OFFSETS = OFFSETS;
  global.IL2CPPHooker.LIMITS = LIMITS;
})(globalThis);
