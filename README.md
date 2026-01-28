# Frida IL2CPP Toolkit

[![License: MIT](https://img.shields.io/badge/License-MIT-410099.svg)](https://opensource.org/licenses/MIT)
[![Frida](https://img.shields.io/badge/Frida-16.x+-00bcd4)](https://frida.re)
[![IL2CPP](https://img.shields.io/badge/Runtime-IL2CPP-9c27b0?logo=unity&logoColor=white)](https://docs.unity3d.com/Manual/IL2CPP.html)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20Android%20%7C%20iOS-lightgrey)](https://frida.re)


Modular, stability-first Frida toolkit for **Unity IL2CPP reverse engineering**.

Designed for **selective, high-signal analysis** of large IL2CPP codebases — not blind mass-hooking.

---

## TL;DR

* Modular Frida toolkit for Unity IL2CPP
* Selective class & method hooking with intelligent type analysis
* Focus on **stability, performance, and signal quality**

---

## Why This Toolkit Exists

Designed to solve a different problem :

* Safely explore **large IL2CPP applications**
* Hook **only what matters**, with predictable performance
* Inspect complex managed objects **without crashing the process**

The goal is not coverage.
The goal is **signal**.

---

## Design Principles

* **Stability over coverage**
* **Explicit targeting** over implicit heuristics
* **Shallow inspection by default**, deep only when requested
* **No hidden global state**, no side effects outside hooks

These principles drive every architectural and configuration choice.

---

## Core Features

### Core Capabilities

* **Modular architecture** with strict separation of concerns
* **Flexible targeting** by assembly, namespace, class name, or regex
* **Intelligent type handling** for String, Dictionary<K,V>, List<T>, Multimap
* **Object introspection** with safe previews and controlled depth
* **HTTP-aware analysis** for request / response flows

### Analysis Features

* Rate-limited **method hooking** to preserve IL2CPP stability
  *(default: 300 hooks, 25 ms delay)*
* Type-aware **argument and return value logging**
* Optional **stack traces** for debugging
* Validated pointer operations with graceful failure handling

### Performance & Safety

* Class type caching to avoid repeated reflection
* Dump deduplication to prevent redundant memory walks
* Hard safety limits for arrays, stacks, and dumps
* IIFE-based module isolation (no global pollution)

---

## Architecture Overview

```
scripts/class_hooker/
├── constants.js       # Memory offsets and safety limits
├── config.js         # User configuration
├── utils.js          # Pure helpers (no Il2Cpp side effects)
├── formatters.js     # Rendering only (no memory reads)
├── http-analysis.js  # HTTP request/response logic
├── core.js           # Il2Cpp interaction & hook lifecycle
└── index.js          # Entry point & orchestration
```

**Module loading order is explicit and intentional:**

`constants → config → utils → formatters → http-analysis → core → index`

---

## Requirements

* [Frida](https://frida.re/) **16.x+**
* [frida-il2cpp-bridge](https://github.com/vfsfitvnm/frida-il2cpp-bridge) by vfsfitvnm
* Target Unity application built with **IL2CPP**

---

## Quick Start

### Launch Script Helper

```bash
./launch.sh --help
```

```
Usage: ./launch.sh [OPTIONS]

Options:
  -p, --pid PID           Attach to process by PID
  -n, --name NAME         Attach to process by name
  -f, --spawn PACKAGE     Spawn and attach to package/binary
  -d, --device DEVICE     Use specific device (default: local)
  -H, --host HOST         Connect to remote frida-server
  --bridge PATH           Override frida-il2cpp-bridge path
  --list                  List running processes
  --help                  Show this help message

Examples:
  ./launch.sh -p 12345              # Attach to PID
  ./launch.sh -n "bin.x64"          # Attach by name
  ./launch.sh -f com.example.app    # Spawn and attach
  ./launch.sh --bridge /path/to/bridge.js # Override bridge path
  ./launch.sh --list                   # List processes

Configuration:
  Set BRIDGE_PATH in this script for persistent configuration,
  or use --bridge for a one-time override.
```

> **Tip**: Set `BRIDGE_PATH` in `launch.sh` once, then use simple commands like `./launch.sh -n "bin.x64"`

---

### 1. Configure Your Target

`scripts/class_hooker/config.js`:

```js
const CONFIG = {
  target: {
    namespace: "Com.Example.Network",
    className: "ApiClient",
  },
  filters: {
    methodRegex: "^Send|^Receive",
  },
  logging: {
    args: true,
  },
};
```

> You only need `target`, `filters`, and `logging` to get started.
> Everything else defaults to safe, conservative behavior, but remains fully tunable for when you need to go surgical.

---

## Usage Examples

### Hook All Methods in a Class

```js
target: {
  namespace: "App.Network",
  className: "ApiManager",
}
```

### Hook Only Getters / Setters

```js
filters: {
  methodRegex: "^get_|^set_",
}
```

### HTTP Request Analysis

```js
target: {
  fullName: "RestSharp.RestClient",
}
analysis: {
  http: { enabled: true },
}
```

### Deep Object Dumping (Explicit)

```js
dump: {
  enabled: true,
  types: ["UserProfile", "GameState"],
}
```

---

## Output Examples

### Method Call

```
[CALL] ApiClient.SendRequest(method="POST", url="https://api.example.com/v1/login")
```

### Return Value

```
[RET] SendRequest -> HttpResponse@0x7f123456 "status=200"
```

### Object Dump

```
==== DUMP UserProfile @ 0x7f123456 ====
  userId: "12345"
  level: 42
  inventory: List[15]
==== END DUMP ====
```

---

## Troubleshooting

### `Il2Cpp is not defined`

[frida-il2cpp-bridge](https://github.com/vfsfitvnm/frida-il2cpp-bridge) **must** be loaded first.


### No Matching Class

* Check namespace / className
* Try `allowPartial: true`
* Remove `assembly` restriction

### Hooks Failing

* Reduce `maxHooks`
* Increase `hookDelayMs`
* Abstract / native methods cannot be hooked

---

## Contributing

This repository is a **technical portfolio project**.

Issues and suggestions are welcome, but the codebase is intentionally opinionated and not designed as a general-purpose community tool.

---

## License

MIT License — see `LICENSE`.

---

## Disclaimer

This toolkit is intended for **authorized security research and reverse engineering only**.
Users are responsible for complying with applicable laws and terms of service.

---
