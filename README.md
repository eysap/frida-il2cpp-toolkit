# Frida IL2CPP Toolkit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Frida](https://img.shields.io/badge/Frida-16.x+-blue)](https://frida.re)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20Android%20%7C%20iOS-lightgrey)](https://frida.re)

Modular Frida toolkit for dynamic analysis of Unity IL2CPP applications. Designed for reverse engineers and security researchers.

## Features

### Core Capabilities
- **Modular Architecture**: Clean separation of concerns with 7 focused modules
- **Flexible Targeting**: Select classes by assembly, namespace, or full name with regex filtering
- **Intelligent Type Handling**: Automatic decoding of String, Dictionary<K,V>, List<T>, and Multimap containers
- **Object Introspection**: Field preview, ToString() invocation, and configurable deep object dumps
- **HTTP Analysis**: Specialized handlers for API methods with request/response logging

### Analysis Features
- **Method Hooking**: Rate-limited installation (up to 300 hooks, 25ms delay)
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
├── config.js         # User configuration (edit this!)
├── utils.js          # Type checking, string handling, field reading
├── formatters.js     # Argument/object formatting, dumping logic
├── http-analysis.js  # HTTP request/response analysis
├── core.js          # Class selection and hook installation
└── index.js         # Main entry point and orchestration
```

**Module Loading Order**: constants → config → utils → formatters → http-analysis → core → index

## Requirements

- [Frida](https://frida.re/) 16.x or higher
- [frida-il2cpp-bridge](https://github.com/vfsfitvnm/frida-il2cpp-bridge) by vfsfitvnm
- Target Unity IL2CPP application

## Quick Start

### 1. Configure Target

Edit `scripts/class_hooker/config.js`:

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
  hook: {
    logArgs: true,
    logReturn: false,
    showThis: true,
    maxStringLength: 200,
    expandDictionaries: true,
    expandLists: true,
    // ... see config.js for all options
  }
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

### Hook Configuration

```javascript
hook: {
  enabled: true,                      // Master switch
  delayMs: 25,                        // Delay between hook installations
  maxHooks: 300,                      // Safety limit

  // Logging
  logArgs: true,                      // Log method arguments
  logReturn: false,                   // Log return values
  showThis: true,                     // Show 'this' pointer
  showStack: false,                   // Capture stack traces

  // String handling
  maxStringLength: 200,               // Truncate strings
  rawCallArgs: true,                  // Show raw pointers in CALL log

  // Object handling
  tryToString: true,                  // Invoke ToString() on objects
  previewObjects: true,               // Show field previews
  maxObjectFields: 6,                 // Fields to show in preview

  // Collections
  expandDictionaries: true,           // Show Dictionary contents
  maxDictEntries: 6,                  // Dictionary entries to display
  expandLists: true,                  // Show List sizes
  expandMultimap: true,               // Show Multimap contents

  // HTTP analysis
  logSpecials: true,                  // Enable HTTP method handlers
  reqToStringMaxLen: 2048,            // Max length for request ToString()

  // Object dumping
  dumpOnCall: false,                  // Enable object dumps
  dumpTypes: [],                      // Types to dump: ["RequestData", "Config"]
  dumpOncePerPtr: true,               // Deduplicate by pointer
  dumpMaxPerType: 20,                 // Max dumps per type
  dumpMaxFields: 30,                  // Max fields per dump
  dumpIncludeStatic: false,           // Include static fields

  // Custom analysis
  analyzeMethods: [],                 // Methods for custom analysis
  analyzeSeparator: true,             // Visual separators for analysis
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
hook: {
  logSpecials: true,         // Enable HTTP handlers
  logArgs: true,
  expandDictionaries: true,  // Show headers
}
```

### Example 4: Deep Object Analysis

```javascript
hook: {
  dumpOnCall: true,
  dumpTypes: ["UserProfile", "GameState"],  // Types to dump
  previewObjects: true,
  maxObjectFields: 10,
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

### "Dependencies not loaded" Error

Ensure modules are loaded in correct order:
1. constants.js
2. config.js
3. utils.js
4. formatters.js
5. http-analysis.js
6. core.js
7. index.js

### No Matching Class Found

- Check namespace and className spelling
- Try `allowPartial: true` for substring matching
- Omit `assembly` to search all assemblies

### Hooks Failing

- Reduce `maxHooks` if installing many hooks
- Increase `delayMs` for slower hook installation
- Check that methods have valid virtual addresses
- Some methods (abstract, native) cannot be hooked

### Performance Issues

- Disable `showStack` (expensive operation)
- Reduce `maxObjectFields` for object previews
- Set `rawCallArgs: true` to skip string decoding
- Disable `expandDictionaries` for large collections

## Contributing

This is a portfolio project demonstrating reverse engineering capabilities. Issues and suggestions are welcome, but the codebase is maintained as a technical showcase rather than a community-driven tool.

## License

MIT License - See [LICENSE](LICENSE) file for details.

## Disclaimer

This toolkit is for authorized security research, reverse engineering education, and legitimate analysis purposes only. Users are responsible for ensuring their use complies with applicable laws and terms of service.

---