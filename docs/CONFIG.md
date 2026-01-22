# Configuration Reference

Complete reference for `CONFIG` object in `scripts/class_hooker.js`.

## Target Selection

Specify which IL2CPP class to analyze. Provide **either** `className` with optional `namespace`/`assembly`, **or** `fullName`.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `assembly` | string\|null | Assembly name (optional, ".dll" suffix is ok) | `"Assembly-CSharp"`, `"Core"` |
| `namespace` | string\|null | Class namespace | `"Com.Example.Network"` |
| `className` | string\|null | Class name (required if not using fullName) | `"ApiClient"`, `"MessageHandler"` |
| `fullName` | string\|null | Fully qualified class name | `"Com.Example.Network.ApiClient"` |
| `pickIndex` | number | If multiple matches, choose this index (0-based) | `0` (first match), `1` (second match) |
| `allowPartial` | boolean | Allow substring matching on namespace/className | `false` (exact), `true` (substring) |

**Examples:**

```javascript
// Exact match on namespace + className
target: {
  namespace: "Com.Example.Network",
  className: "ApiClient"
}

// Use fullName shorthand
target: {
  fullName: "Com.Example.Network.ApiClient"
}

// Assembly-specific (when multiple assemblies define same class)
target: {
  assembly: "Assembly-CSharp",
  namespace: "Game.Core",
  className: "NetworkManager"
}

// Partial matching (useful for obfuscated names)
target: {
  className: "ApiClient",
  allowPartial: true  // Matches "ApiClientV2", "SecureApiClient", etc.
}
```

## Method Filtering

Narrow down which methods to hook. If both filters are null, **all methods** are hooked.

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `methodNameContains` | string\|null | Only hook methods containing this substring | `"Request"`, `"Encode"` |
| `methodRegex` | string\|null | Only hook methods matching this regex | `"^Send\|^Receive"`, `"^get_\|^set_"` |

**Examples:**

```javascript
// Hook only HTTP request methods
filters: {
  methodNameContains: "Request"
}

// Hook getters and setters
filters: {
  methodRegex: "^get_|^set_"
}

// Hook serialization methods
filters: {
  methodRegex: "Serialize|Deserialize|Encode|Decode"
}
```

## Hook Configuration

Control hooking behavior, logging detail, and performance characteristics.

### Basic Hooking

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Master switch for hooking (false = dry run) |
| `delayMs` | number | `25` | Milliseconds between installing hooks (stability) |
| `maxHooks` | number | `300` | Maximum hooks to install (safety limit) |

### Logging Control

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `logArgs` | boolean | `true` | Log method arguments |
| `logReturn` | boolean | `false` | Log return values |
| `showThis` | boolean | `true` | Log instance pointer for non-static methods |
| `showStack` | boolean | `false` | Log call stack (expensive, use sparingly) |
| `maxArgs` | number | `8` | Maximum arguments to log per method |
| `maxStringLength` | number | `200` | Truncate strings longer than this |

### Type Expansion

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `expandDictionaries` | boolean | `true` | Show Dictionary<K,V> contents |
| `maxDictEntries` | number | `6` | Maximum dictionary entries to display |
| `expandLists` | boolean | `true` | Show List<T> size |
| `expandMultimap` | boolean | `true` | Summarize Multimap containers |
| `previewObjects` | boolean | `true` | Show object field preview |
| `maxObjectFields` | number | `6` | Maximum fields to preview per object |
| `tryToString` | boolean | `true` | Call ToString() on objects |

### Advanced Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `rawCallArgs` | boolean | `true` | Show raw pointers for call args (skip decoding) |
| `reqToStringMaxLen` | number | `2048` | Larger cap for HTTP request ToString() |
| `logSpecials` | boolean | `true` | Enhanced logging for "NewRequest", "CallApi" methods |
| `dumpOnCall` | boolean | `false` | Dump complete object state on method entry |
| `dumpTypes` | string[] | `[]` | Type names to dump (requires dumpOnCall: true) |
| `dumpMaxPerType` | number | `20` | Max objects to dump per type |
| `dumpMaxFields` | number | `30` | Max fields to include in dump |
| `dumpOncePerPtr` | boolean | `true` | Only dump each object instance once |

**Example - Maximum Verbosity:**

```javascript
hook: {
  logArgs: true,
  logReturn: true,
  showThis: true,
  showStack: true,
  expandDictionaries: true,
  expandLists: true,
  previewObjects: true,
  tryToString: true
}
```

**Example - Performance Optimized:**

```javascript
hook: {
  delayMs: 10,              // Faster hook installation
  maxHooks: 100,            // Limit to most important methods
  logArgs: true,
  logReturn: false,         // Skip returns for speed
  showStack: false,         // Expensive operation
  expandDictionaries: false,
  previewObjects: false,
  maxStringLength: 50       // Less data per call
}
```

**Example - Deep Object Analysis:**

```javascript
hook: {
  dumpOnCall: true,
  dumpTypes: ["Transaction", "UserProfile", "GameState"],
  dumpMaxPerType: 5,
  dumpMaxFields: 50,
  dumpOncePerPtr: true
}
```

## Special Method Handling

### HTTP Request/Response Analysis

Methods named `NewRequest`, `CallApi`, or `SendAsync` receive special treatment when `logSpecials: true`:

- Extracts HTTP method (GET, POST, etc.)
- Builds full URL from basePath + path
- Shows headers, query parameters, form data, request body
- Logs response status codes and reason phrases

This is useful for API client reverse engineering.

### Custom Method Analysis

Add method names to `analyzeMethods` array for your own custom analysis logic:

```javascript
hook: {
  analyzeMethods: ["ProcessPayment", "UpdateBalance"]
}
```

Then implement analysis in the commented template around line 831 of `class_hooker.js`.

## Common Patterns

### Pattern 1: API Endpoint Discovery

```javascript
const CONFIG = {
  target: { namespace: "Com.Example.Api", className: "RestClient" },
  filters: { methodNameContains: "Request" },
  hook: {
    logArgs: true,
    logSpecials: true,      // Enables HTTP analysis
    expandDictionaries: true // Show headers/params
  }
};
```

### Pattern 2: Serialization Debugging

```javascript
const CONFIG = {
  target: { fullName: "Network.Protocol.MessageCodec" },
  filters: { methodRegex: "^Encode|^Decode" },
  hook: {
    logArgs: true,
    logReturn: true,
    dumpOnCall: true,
    dumpTypes: ["Message", "Packet"]
  }
};
```

### Pattern 3: State Change Tracking

```javascript
const CONFIG = {
  target: { namespace: "Game.State", className: "PlayerState" },
  filters: { methodRegex: "^set_|^Update" },
  hook: {
    logArgs: true,
    showStack: true,        // See what triggered the change
    previewObjects: true
  }
};
```

## Performance Considerations

### Hook Installation Speed

- `delayMs: 25` (default) provides stability on most systems
- Reduce to `10-15ms` for faster startup if you have a small method set
- Increase to `50ms+` if you see crashes during hook installation

### Memory and CPU Impact

**High impact options:**
- `showStack: true` - Backtrace on every call
- `dumpOnCall: true` - Full object state dump
- `maxHooks: 500+` - Large hook counts

**Recommended for production analysis:**
- `maxHooks: 100-300`
- `showStack: false` (enable only for specific investigations)
- `dumpOnCall: false` (use selectively with `dumpTypes`)

### String and Object Previews

Adjust these based on your logging medium:

- Console output: `maxStringLength: 100-200`
- Log files: `maxStringLength: 500-1000`
- Dictionaries with many entries: `maxDictEntries: 3-6`
- Objects with many fields: `maxObjectFields: 6-12`

## Troubleshooting

### "No matching class found"

- Verify class name: use `Il2CppInspector` or similar to extract actual names
- Try `allowPartial: true` if class name is obfuscated
- Check namespace: IL2CPP preserves namespaces exactly
- Specify `assembly` if multiple assemblies define similar classes

### Too many matches

- Use `pickIndex` to select the right match (indices shown in output)
- Add `namespace` to narrow down matches
- Use exact matching (`allowPartial: false`)

### Hook installation crashes

- Increase `delayMs` (try 50-100ms)
- Reduce `maxHooks` (try 50-100)
- Use method filters to hook fewer methods
- Some Unity versions have protected methods - failures are logged but don't stop execution

### Excessive log output

- Disable `logReturn` if you only need input analysis
- Reduce `maxStringLength` and `maxObjectFields`
- Use method filters to target specific operations
- Set `expandDictionaries: false` if dictionaries are very large

## See Also

- [frida-il2cpp-bridge documentation](https://github.com/vfsfitvnm/frida-il2cpp-bridge)
- [Frida JavaScript API](https://frida.re/docs/javascript-api/)
- [README.md](../README.md) - Quick start and usage examples
