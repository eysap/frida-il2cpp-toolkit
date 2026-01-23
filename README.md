# Frida IL2CPP Toolkit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Frida](https://img.shields.io/badge/Frida-16.x+-blue)](https://frida.re)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20Android%20%7C%20iOS-lightgrey)](https://frida.re)

## TL;DR
- Modular Frida toolkit for Unity IL2CPP
- Selective hooking of classes/methods with intelligent type analysis
- Focus on stability, performance, and deep introspection
- Designed for focused analysis, not blind mass-hooking

## Features

### Core Capabilities
- **Modular Architecture**: Clean separation of concerns with 7 focused modules
- **Flexible Targeting**: Select classes by assembly, namespace, or full name with regex filtering
- **Intelligent Type Handling**: Automatic decoding of String, Dictionary<K,V>, List<T>, and Multimap containers
- **Object Introspection**: Field preview, ToString() invocation, and configurable deep object dumps
- **HTTP Analysis**: Specialized handlers for API methods with request/response logging

### Analysis Features
- **Method Hooking**: Rate-limited installation to preserve IL2CPP stability (default: up to 300 hooks with 25ms delay)
- **Argument Logging**: Type-aware formatting with configurable string truncation
- **Return Value Tracking**: Full return value inspection with object previews
- **Stack Traces**: Optional backtrace capture for debugging
- **Memory Safety**: Validated pointer operations with graceful error handling

### Performance Optimizations
- **Class Type Caching**: Avoids repeated reflection for Dictionary/List detection
- **Dump State Management**: Deduplication prevents redundant object dumps
- **Configurable Limits**: Safety thresholds for arrays, backtraces, and hook counts
- **IIFE Pattern**: No pollution of global scope, clean module boundaries

## Architecture

```
scripts/class_hooker/
├── constants.js       # Memory offsets and safety limits
├── config.js         # User configuration
├── utils.js          # Type checking, string handling, field reading - Pure helpers (no Il2Cpp side effects)
├── formatters.js     # Argument/object formatting, dumping logic - Rendering only (no memory reads)
├── http-analysis.js  # HTTP request/response analysis
├── core.js          # Class selection and hook installation - Il2Cpp interaction + hook lifecycle
└── index.js         # Main entry point and orchestration
```

**Module Loading Order**: constants → config → utils → formatters → http-analysis → core → index

## Requirements

- [Frida](https://frida.re/) 16.x or higher
- [frida-il2cpp-bridge](https://github.com/vfsfitvnm/frida-il2cpp-bridge) by vfsfitvnm
- Target Unity IL2CPP application

## Quick Start

### 1. Configure Target

`scripts/class_hooker/config.js`:

```javascript
const CONFIG = {
  target: {
    namespace: "Com.Example.Network",  // Class namespace
    className: "ApiClient",             // Class name
    // OR: fullName: "Com.Example.Network.ApiClient"
    // Optional: assembly: "Assembly-CSharp"
  },
  filters: {
    methodNameContains: null,           // Filter by substring
    methodRegex: null,                  // OR filter by regex: "^Send|^Receive"
  },
  performance: {
    enabled: true,                      // Master on/off switch
    hookDelayMs: 25,                    // Delay between hook installations
    maxHooks: 300,                      // Safety limit
  },
  logging: {
    args: true,                         // Log method arguments
    return: false,                      // Log return values
    showThis: true,                     // Display 'this' pointer
    showStack: false,                   // Capture stack traces
    maxArgs: 8,                         // Maximum arguments to display
    rawArgs: true,                      // Show raw pointers (prevents crashes on complex objects)

  },
  formatting: {
    strings: {
      maxLength: 200,                   // Default string truncation
      httpMaxLength: 2048,              // For HTTP ToString()
    },
    objects: {
      tryToString: true,                // Invoke ToString() method
      showFields: true,                 // Display field preview
      maxFields: 6,                     // Maximum fields in preview
    },
    collections: {
      dictionaries: {
        enabled: true,                  // Show Dictionary<K,V> contents
        maxEntries: 6,                  // Maximum entries to display
      },
      lists: {
        enabled: true,                  // Show List<T> size
      },
      multimaps: {
        enabled: true,                  // Show Multimap summary
      },
    },
  },
  dump: {
    enabled: false,                     // Master dump switch
    types: [],                          // Types to dump: ["UserProfile", "GameState"]
    deduplication: true,                // Skip already-dumped pointers
    maxPerType: 20,                     // Maximum dumps per type
    maxFields: 30,                      // Maximum fields per dump
    includeStatic: false,               // Include static fields
  },
  analysis: {
    http: {
      enabled: true,                    // Detect HTTP methods
    },
    custom: {
      methods: [],                      // Methods for detailed analysis
    },
  },
};
```

### 2. Run (Desktop)

```bash
frida \
  -l /path/to/frida-il2cpp-bridge/dist/index.js \ 
  -l scripts/class_hooker/constants.js \
  -l scripts/class_hooker/config.js \
  -l scripts/class_hooker/utils.js \
  -l scripts/class_hooker/formatters.js \
  -l scripts/class_hooker/http-analysis.js \
  -l scripts/class_hooker/core.js \
  -l scripts/class_hooker/index.js \
  -p $(pidof application.x64)
```

### 3. Run (Mobile)

```bash
frida -U \
  -l /path/to/frida-il2cpp-bridge/dist/index.js \
  -l scripts/class_hooker/constants.js \
  -l scripts/class_hooker/config.js \
  -l scripts/class_hooker/utils.js \
  -l scripts/class_hooker/formatters.js \
  -l scripts/class_hooker/http-analysis.js \
  -l scripts/class_hooker/core.js \
  -l scripts/class_hooker/index.js \
  -f com.example.app
```

## Configuration Reference

### Target Selection

```javascript
target: {
  assembly: "Core",                   // Optional: search only this assembly
  namespace: "Com.Example.Network",   // Class namespace (exact or partial)
  className: "ApiClient",             // Class name (exact or partial)
  fullName: "Com.Example.Network.ApiClient",  // OR: fully qualified name
  pickIndex: 0,                       // If multiple matches, select this index
  allowPartial: false,                // Enable substring matching
}
```

### Method Filtering

```javascript
filters: {
  methodNameContains: "Request",      // Only hook methods containing this
  methodRegex: "^Send|^Receive",      // OR: regex pattern for method names
}
```

### Performance Configuration

```javascript
performance: {
  enabled: true,                      // Master on/off switch
  hookDelayMs: 25,                    // Delay between hook installations (stability)
  maxHooks: 300,                      // safety limit
}
```

### Logging Configuration

```javascript
logging: {
  args: true,                         // Log method arguments
  return: false,                      // Log return values
  showThis: true,                     // Display 'this' pointer
  showStack: false,                   // Capture stack traces (expensive!)
  maxArgs: 8,                         // Maximum arguments to display
}
```

### Formatting Configuration

```javascript
formatting: {
  strings: {
    maxLength: 200,                   // Default string truncation
    httpMaxLength: 2048,              // For HTTP ToString() (includes headers)
  },
  objects: {
    tryToString: true,                // Invoke managed ToString() method
    showFields: true,                 // Display shallow field preview
    maxFields: 6,                     // Maximum fields in preview
  },
  collections: {
    dictionaries: {
      enabled: true,                  // Show Dictionary<K,V> contents
      maxEntries: 6,                  // Maximum entries to display
    },
    lists: {
      enabled: true,                  // Show List<T> size
    },
    multimaps: {
      enabled: true,                  // Show Multimap`2 summary
    },
  },
}
```

### Dump Configuration

```javascript
dump: {
  enabled: false,                     // Master dump switch
  types: [],                          // Type names to dump: ["UserProfile", "GameState"]
  deduplication: true,                // Skip already-dumped pointers
  maxPerType: 20,                     // Maximum dumps per type
  maxFields: 30,                      // Maximum fields per dump
  includeStatic: false,               // Include static fields in dump
}
```

### Analysis Configuration

```javascript
analysis: {
  http: {
    enabled: true,                    // Detect NewRequest, CallApi, SendAsync
  },
  custom: {
    methods: [],                      // Method names for detailed analysis
                                      // Example: ["ProcessTransaction", "UpdateBalance"]
  },
}
```

## Usage Examples

### Example 1: Hook All Methods in a Class

```javascript
// config.js
target: {
  namespace: "App.Network",
  className: "ApiManager",
}
filters: {
  methodNameContains: null,  // No filtering
}
```

### Example 2: Hook Only Getters/Setters

```javascript
filters: {
  methodRegex: "^get_|^set_",  // Properties only
}
```

### Example 3: HTTP Request Logging

```javascript
target: {
  fullName: "RestSharp.RestClient",  // RestSharp HTTP client
}
logging: {
  args: true,                // Log arguments
}
formatting: {
  collections: {
    dictionaries: {
      enabled: true,         // Show headers
    },
  },
}
analysis: {
  http: {
    enabled: true,           // Enable HTTP handlers
  },
}
```

### Example 4: Deep Object Analysis

```javascript
dump: {
  enabled: true,
  types: ["UserProfile", "GameState"],  // Types to dump
  maxFields: 10,
}
formatting: {
  objects: {
    showFields: true,        // Preview objects
    maxFields: 10,
  },
}
```

## Output Examples

### Method Call

```
[CALL] Com.Example.Network.ApiClient.SendRequest(method="POST", url="https://api.example.com/v1/login", body="{\"user\":\"test\"}")
[INFO] method="POST"
[INFO] path="/v1/login"
[INFO] basePath="https://api.example.com"
[DATA] body="{\"user\":\"test\",\"pass\":\"***\"}"
[URL] https://api.example.com/v1/login
```

### Return Value

```
[RET] Com.Example.Network.ApiClient.SendRequest -> HttpResponse@0x7f1234567890 "status=200" {statusCode=200, body="{\"success\":true}"}
```

### Object Dump

```
==== DUMP UserProfile @ 0x7f1234567890 (App.Models.UserProfile) ====
  userId: "12345"
  username: "testuser"
  email: "test@example.com"
  level: 42
  inventory: List[15]
  stats: Dict[8] {"hp":"100", "mp":"50", "atk":"75"}
==== END DUMP ====
```

## Troubleshooting

### "Il2Cpp is not defined" Error

**Critical**: You must load `frida-il2cpp-bridge` **before** any class_hooker modules.

Without frida-il2cpp-bridge, the `Il2Cpp` global object is not available and all hooks will fail.

### "Dependencies not loaded" Error

Ensure modules are loaded in correct order:
1. **frida-il2cpp-bridge/dist/index.js** (REQUIRED FIRST)
2. constants.js
3. config.js
4. utils.js
5. formatters.js
6. http-analysis.js
7. core.js
8. index.js

### No Matching Class Found

- Check namespace and className spelling
- Try `allowPartial: true` for substring matching
- Omit `assembly` to search all assemblies

### Hooks Failing

- Reduce `performance.maxHooks` if installing many hooks
- Increase `performance.hookDelayMs` for slower hook installation
- Check that methods have valid virtual addresses
- Some methods (abstract, native) cannot be hooked

### Performance Issues

- Disable `logging.showStack` (expensive operation)
- Reduce `formatting.objects.maxFields` for object previews
- Reduce `formatting.strings.maxLength` to skip long string processing
- Disable `formatting.collections.dictionaries.enabled` for large collections

## Contributing

This is a portfolio project demonstrating reverse engineering capabilities. Issues and suggestions are welcome, but the codebase is maintained as a technical showcase rather than a community-driven tool.

## License

MIT License - See [LICENSE](LICENSE) file for details.

## Disclaimer

This toolkit is for authorized security research, reverse engineering education, and legitimate analysis purposes only. Users are responsible for ensuring their use complies with applicable laws and terms of service.

---