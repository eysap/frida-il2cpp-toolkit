# Frida IL2CPP Toolkit

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Frida](https://img.shields.io/badge/Frida-16.x+-blue)](https://frida.re)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20Android%20%7C%20iOS-lightgrey)](https://frida.re)

A collection of Frida scripts for dynamic analysis of Unity IL2CPP applications. Designed for reverse engineers and security researchers working with IL2CPP-compiled binaries.

## Features

- **Flexible Targeting**: Select classes by assembly, namespace, or full name with regex filtering
- **Intelligent Type Handling**: Automatic decoding of String, Dictionary<K,V>, List<T>, and Multimap containers
- **Object Introspection**: Field preview, ToString() invocation, and deep object analysis
- **HTTP Analysis**: Special handling for API client methods with request/response logging
- **Rate-Limited Hooks**: Install up to 300 method hooks with configurable delays for stability
- **Production-Ready**: Error handling, configurable logging levels, and memory-safe operations

## Requirements

- [Frida](https://frida.re/) 16.x or higher
- [frida-il2cpp-bridge](https://github.com/vfsfitvnm/frida-il2cpp-bridge) by vfsfitvnm
- Target Unity IL2CPP application (desktop or mobile)

## Quick Start

### Desktop (Linux/Windows)

```bash
# Start your Unity IL2CPP application
./application.x64

# In another terminal, attach Frida with both required scripts
frida -l /path/to/frida-il2cpp-bridge/dist/index.js \
      -l scripts/class_hooker.js \
      -p $(pidof application.x64)
```

### Mobile (Android)

```bash
# USB-connected Android device with Frida server running
frida -U -l /path/to/frida-il2cpp-bridge/dist/index.js \
         -l scripts/class_hooker.js \
         -f com.example.app \
         --no-pause
```

### iOS

```bash
# USB-connected iOS device with Frida server installed
frida -U -l /path/to/frida-il2cpp-bridge/dist/index.js \
         -l scripts/class_hooker.js \
         -f com.example.app \
         --no-pause
```

## Configuration

Edit `CONFIG` object in `scripts/class_hooker.js` before running:

```javascript
const CONFIG = {
  target: {
    namespace: "Com.Example.Network",  // Class namespace
    className: "ApiClient",             // Class name
    // OR use fullName: "Com.Example.Network.ApiClient"
  },
  filters: {
    methodNameContains: "Request",      // Only hook methods with "Request" in name
    // OR use methodRegex: "^Send|^Receive"
  },
  hook: {
    logArgs: true,                      // Log method arguments
    logReturn: true,                    // Log return values
    maxStringLength: 200,               // Truncate long strings
    expandDictionaries: true,           // Show Dictionary contents
    expandLists: true,                  // Show List sizes
  }
};
```

See [docs/CONFIG.md](docs/CONFIG.md) for complete configuration reference.

## Use Cases

### API Client Analysis

Hook network request methods to analyze API endpoints, parameters, and authentication:

```javascript
target: {
  namespace: "Com.Example.Network",
  className: "ApiClient"
}
```

### Protocol Reverse Engineering

Monitor serialization/deserialization methods to understand custom protocols:

```javascript
filters: {
  methodRegex: "^Serialize|^Deserialize|^Encode|^Decode"
}
```

### State Management Investigation

Track state changes by hooking setter methods and field updates:

```javascript
filters: {
  methodRegex: "^set_|^Update"
},
hook: {
  showStack: true  // See call chains leading to state changes
}
```

## Documentation

- [Configuration Reference](docs/CONFIG.md) - Complete CONFIG option documentation
- [frida-il2cpp-bridge](https://github.com/vfsfitvnm/frida-il2cpp-bridge) - Required dependency documentation

## Technical Details

The toolkit demonstrates:

- **Complex IL2CPP introspection**: Safe memory operations with pointer validation and error recovery
- **Type system understanding**: Handles .NET generic types, value types, and reference types
- **Production patterns**: Rate limiting, resource management, configurable behavior
- **Advanced Frida usage**: Method interception, stack tracing, dynamic type analysis

The main script (`class_hooker.js`) is ~800 lines of working code showcasing systematic approach to dynamic analysis challenges.

## Contributing

This is a portfolio project demonstrating reverse engineering capabilities. Issues and suggestions are welcome, but the codebase is maintained as a technical showcase rather than a community-driven tool.

## License

MIT License - See [LICENSE](LICENSE) file for details.

## Disclaimer

This toolkit is for authorized security research, reverse engineering education, and legitimate analysis purposes only. Users are responsible for ensuring their use complies with applicable laws and terms of service.

---

**Built with:** JavaScript, Frida, frida-il2cpp-bridge
**Purpose:** Portfolio demonstration of dynamic analysis and reverse engineering skills
