/**
 * Load All - Universal Loader for Plugin Architecture
 *
 * Loads core framework + all plugins in correct order.
 * Define IL2CPPToolkitConfig BEFORE loading this script.
 *
 * Usage:
 *   1. Create your config file with IL2CPPToolkitConfig
 *   2. frida -U -f com.app -l your-config.js -l load-all.js --no-pause
 */

// Load core framework
const coreScripts = [
  'core/constants.js',
  'core/utils.js',
  'core/formatters.js',
  'core/ui/colors.js',
  'core/ui/box.js',
  'core/ui/index.js',
  'core/hook-manager.js',
];

// Load plugins (only if enabled in config)
const pluginScripts = {
  logger: [
    'plugins/logger/config.js',
    'plugins/logger/http-analysis.js',
    'plugins/logger/core.js',
    'plugins/logger/index.js',
  ],
  'skip-anim': [
    'plugins/skip-anim/config.js',
    'plugins/skip-anim/targets.js',
    'plugins/skip-anim/index.js',
  ],
  'speed-hack': [
    'plugins/speed-hack/config.js',
    'plugins/speed-hack/targets.js',
    'plugins/speed-hack/index.js',
  ],
};

// Main entry point
const mainScript = 'main.js';

// Determine script directory
const scriptDir = '/data/local/tmp/frida-il2cpp-toolkit/scripts/';  // Android
// const scriptDir = './scripts/';  // Local testing

// Load function
function loadScript(path) {
  const fullPath = scriptDir + path;
  try {
    const source = File.readAllText(fullPath);
    (1, eval)(source);
    console.log(`[Loaded] ${path}`);
  } catch (e) {
    console.log(`[FAILED] ${path}: ${e.message}`);
  }
}

// Execution
console.log('[IL2CPP Toolkit] Loading framework...');

// 1. Load core
coreScripts.forEach(loadScript);

// 2. Load enabled plugins
const config = globalThis.IL2CPPToolkitConfig || {};
const enabledPlugins = config.plugins || {};

Object.keys(enabledPlugins).forEach(pluginName => {
  if (enabledPlugins[pluginName].enabled !== false && pluginScripts[pluginName]) {
    console.log(`[IL2CPP Toolkit] Loading plugin: ${pluginName}`);
    pluginScripts[pluginName].forEach(loadScript);
  }
});

// 3. Load main (will auto-execute)
loadScript(mainScript);

console.log('[IL2CPP Toolkit] Framework loaded');
