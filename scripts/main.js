"use strict";

/**
 * Frida IL2CPP Toolkit - Main Entry Point
 *
 * Plugin-based architecture for Unity IL2CPP reverse engineering.
 * Load order: core → plugins → main
 *
 * @module main
 */

(function(global) {
  const hookManager = global.IL2CPPHooker?.hookManager;
  const ui = global.IL2CPPHooker?.ui;

  /**
   * Validate required modules are loaded
   */
  function validateDependencies() {
    const required = ['hookManager', 'utils', 'formatters', 'ui'];
    const missing = required.filter(m => !global.IL2CPPHooker?.[m]);

    if (missing.length > 0) {
      console.log(`[FATAL] Missing core modules: ${missing.join(', ')}`);
      console.log('');
      console.log('Expected load order:');
      console.log('  1. core/constants.js');
      console.log('  2. core/utils.js');
      console.log('  3. core/formatters.js');
      console.log('  4. core/ui/colors.js');
      console.log('  5. core/ui/box.js');
      console.log('  6. core/ui/index.js');
      console.log('  7. core/hook-manager.js');
      console.log('  8. [plugin files]');
      console.log('  9. main.js');
      return false;
    }

    return true;
  }

  /**
   * Plugin Manager
   */
  const PluginManager = {
    plugins: {},
    activePlugins: [],

    /**
     * Register a plugin
     */
    register(name, plugin) {
      if (!plugin || typeof plugin.init !== 'function') {
        if (ui) ui.error(`Invalid plugin: ${name} (missing init method)`);
        return false;
      }

      this.plugins[name] = plugin;
      if (ui) ui.info(`Plugin registered: ${name} v${plugin.version || '1.0.0'}`);
      return true;
    },

    /**
     * Load and initialize plugin
     */
    load(name, config) {
      const plugin = this.plugins[name];
      if (!plugin) {
        if (ui) ui.error(`Plugin not found: ${name}`);
        return false;
      }

      try {
        const success = plugin.init(config);
        if (success) {
          this.activePlugins.push({ name, plugin, config });
          if (ui) ui.success(`Plugin loaded: ${name}`);
        }
        return success;
      } catch (e) {
        if (ui) ui.error(`Plugin init failed: ${name} - ${e.message}`);
        return false;
      }
    },

    /**
     * Start all active plugins
     */
    startAll() {
      if (ui) ui.info(`Starting ${this.activePlugins.length} plugin(s)...`);

      this.activePlugins.forEach(({ name, plugin }) => {
        try {
          if (typeof plugin.start === 'function') {
            plugin.start();
          }
        } catch (e) {
          if (ui) ui.error(`Plugin start failed: ${name} - ${e.message}`);
        }
      });
    },

    /**
     * Stop all active plugins
     */
    stopAll() {
      this.activePlugins.forEach(({ name, plugin }) => {
        try {
          if (typeof plugin.stop === 'function') {
            plugin.stop();
          }
        } catch (e) {
          if (ui) ui.error(`Plugin stop failed: ${name} - ${e.message}`);
        }
      });

      this.activePlugins = [];
      if (ui) ui.info("All plugins stopped");
    }
  };

  /**
   * Main execution
   */
  function main(userConfig) {
    // Prevent duplicate initialization
    if (global.__frida_il2cpp_toolkit_initialized) {
      if (ui) ui.warn("Already initialized, skipping duplicate run.");
      return;
    }
    global.__frida_il2cpp_toolkit_initialized = true;

    // Validate dependencies
    if (!validateDependencies()) {
      return;
    }

    // Initialize UI
    const uiConfig = userConfig?.ui || {};
    ui.init(uiConfig);

    // Auto-register available plugins
    const plugins = global.IL2CPPHooker?.plugins || {};

    if (plugins.logger?.plugin) {
      PluginManager.register('logger', plugins.logger.plugin);
    }
    if (plugins.combatAnim?.plugin) {
      PluginManager.register('combat-anim', plugins.combatAnim.plugin);
    }

    // Load plugins based on config
    const enabledPlugins = userConfig?.plugins || {};

    Object.keys(enabledPlugins).forEach(pluginName => {
      const pluginConfig = enabledPlugins[pluginName];

      if (pluginConfig.enabled !== false) {
        PluginManager.load(pluginName, pluginConfig);
      }
    });

    // Start all loaded plugins
    PluginManager.startAll();

    if (ui) {
      ui.success("Frida IL2CPP Toolkit ready");
      ui.info(`Active plugins: ${PluginManager.activePlugins.map(p => p.name).join(', ')}`);
    }
  }

  // Export to global scope
  global.IL2CPPHooker = global.IL2CPPHooker || {};
  global.IL2CPPHooker.PluginManager = PluginManager;
  global.IL2CPPHooker.main = main;

  // Auto-execute if config is already defined
  if (global.IL2CPPToolkitConfig) {
    Il2Cpp.perform(() => {
      try {
        main(global.IL2CPPToolkitConfig);
      } catch (e) {
        if (ui) ui.error(`Execution error: ${e.message}`);
        console.log(e.stack);
      }
    });
  }
})(globalThis);
