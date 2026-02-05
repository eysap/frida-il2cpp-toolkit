#!/usr/bin/env bash

###############################################################################
# Frida IL2CPP ToolKit - Plugin Launch Script
#
# Loads the new plugin architecture with specified plugins.
#
# Usage:
#   ./launch-plugin.sh -n "AppName" --plugin skip-anim
#   ./launch-plugin.sh -p 12345 --plugin logger
#   ./launch-plugin.sh -f com.app --config examples/example-skip-anim.js
#
###############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
CORE_DIR="$PROJECT_ROOT/scripts/core"
PLUGINS_DIR="$PROJECT_ROOT/scripts/plugins"
EXAMPLES_DIR="$PROJECT_ROOT/examples"

# ============================================================================
# CONFIGURATION: frida-il2cpp-bridge path
# Same as launch.sh - set your bridge path here
# ============================================================================
BRIDGE_PATH=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

###############################################################################
# Helper Functions
###############################################################################

print_banner() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║   Frida IL2CPP ToolKit - Plugin Architecture         ║"
    echo "╚═══════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_usage() {
    echo -e "${YELLOW}Usage:${NC} ${CYAN}$0${NC} ${GREEN}[OPTIONS]${NC}"
    echo ""

    echo -e "${YELLOW}Target Options:${NC}"
    echo -e "  ${GREEN}-p, --pid${NC} ${CYAN}PID${NC}           Attach to process by PID"
    echo -e "  ${GREEN}-n, --name${NC} ${CYAN}NAME${NC}         Attach to process by name"
    echo -e "  ${GREEN}-f, --spawn${NC} ${CYAN}PACKAGE${NC}     Spawn and attach to package/binary"
    echo -e "  ${GREEN}-d, --device${NC} ${CYAN}DEVICE${NC}     Use specific device (default: local)"
    echo -e "  ${GREEN}-H, --host${NC} ${CYAN}HOST${NC}         Connect to remote frida-server"
    echo ""

    echo -e "${YELLOW}Plugin Options:${NC}"
    echo -e "  ${GREEN}--plugin${NC} ${CYAN}NAME${NC}           Load specific plugin (logger|skip-anim|speed-hack)"
    echo -e "  ${GREEN}--config${NC} ${CYAN}FILE${NC}           Use custom config file"
    echo -e "  ${GREEN}--example${NC} ${CYAN}NAME${NC}          Use example config (logger|skip-anim|custom-plugin)"
    echo ""

    echo -e "${YELLOW}Other Options:${NC}"
    echo -e "  ${GREEN}--bridge${NC} ${CYAN}PATH${NC}           Override frida-il2cpp-bridge path"
    echo -e "  ${GREEN}--list${NC}                  List running processes"
    echo -e "  ${GREEN}--help${NC}                  Show this help message"
    echo ""

    echo -e "${YELLOW}Examples:${NC}"
    echo -e "  ${CYAN}$0${NC} ${GREEN}-n${NC} ${CYAN}\"bin.x64\"${NC} ${GREEN}--example${NC} ${CYAN}logger${NC}"
    echo -e "  ${CYAN}$0${NC} ${GREEN}-p${NC} ${CYAN}12345${NC} ${GREEN}--example${NC} ${CYAN}skip-anim${NC}"
    echo -e "  ${CYAN}$0${NC} ${GREEN}-f${NC} ${CYAN}com.app${NC} ${GREEN}--config${NC} ${CYAN}my-config.js${NC}"
    echo -e "  ${CYAN}$0${NC} ${GREEN}-n${NC} ${CYAN}\"game\"${NC} ${GREEN}--plugin${NC} ${CYAN}logger${NC} ${GREEN}--plugin${NC} ${CYAN}skip-anim${NC}"
    echo ""
}

check_dependencies() {
    if ! command -v frida &> /dev/null; then
        echo -e "${RED}Error: frida command not found${NC}"
        echo "Install with: pip install frida-tools"
        exit 1
    fi
}

validate_bridge_path() {
    if [[ -z "$BRIDGE_PATH" ]]; then
        echo -e "${RED}Error: BRIDGE_PATH not configured${NC}"
        echo "Edit $0 and set BRIDGE_PATH variable"
        echo "Example: BRIDGE_PATH=\"/path/to/frida-il2cpp-bridge/dist/index.js\""
        exit 1
    fi

    if [[ ! -f "$BRIDGE_PATH" ]]; then
        echo -e "${RED}Error: frida-il2cpp-bridge not found:${NC}"
        echo "  $BRIDGE_PATH"
        exit 1
    fi

    echo -e "${GREEN}✓ frida-il2cpp-bridge found${NC}"
}

validate_core_modules() {
    local CORE_MODULES=(
        "$CORE_DIR/constants.js"
        "$CORE_DIR/utils.js"
        "$CORE_DIR/formatters.js"
        "$CORE_DIR/ui/colors.js"
        "$CORE_DIR/ui/box.js"
        "$CORE_DIR/ui/index.js"
        "$CORE_DIR/hook-manager.js"
    )

    local missing=()
    for module in "${CORE_MODULES[@]}"; do
        if [[ ! -f "$module" ]]; then
            missing+=("$module")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo -e "${RED}Error: Missing core modules:${NC}"
        for mod in "${missing[@]}"; do
            echo "  - $mod"
        done
        exit 1
    fi

    echo -e "${GREEN}✓ Core modules found${NC}"
}

list_processes() {
    frida-ps
    exit 0
}

build_module_list() {
    MODULE_LIST=()

    # 1. Bridge
    MODULE_LIST+=("$BRIDGE_PATH")

    # 2. Core framework
    MODULE_LIST+=(
        "$CORE_DIR/constants.js"
        "$CORE_DIR/utils.js"
        "$CORE_DIR/formatters.js"
        "$CORE_DIR/ui/colors.js"
        "$CORE_DIR/ui/box.js"
        "$CORE_DIR/ui/index.js"
        "$CORE_DIR/hook-manager.js"
    )

    # 3. Load plugins based on --plugin flags or config file
    if [[ ${#PLUGIN_NAMES[@]} -gt 0 ]]; then
        for plugin in "${PLUGIN_NAMES[@]}"; do
            case "$plugin" in
                logger)
                    MODULE_LIST+=(
                        "$PLUGINS_DIR/logger/config.js"
                        "$PLUGINS_DIR/logger/http-analysis.js"
                        "$PLUGINS_DIR/logger/core.js"
                        "$PLUGINS_DIR/logger/index.js"
                    )
                    ;;
                skip-anim)
                    MODULE_LIST+=(
                        "$PLUGINS_DIR/skip-anim/config.js"
                        "$PLUGINS_DIR/skip-anim/targets.js"
                        "$PLUGINS_DIR/skip-anim/index.js"
                    )
                    ;;
                speed-hack)
                    MODULE_LIST+=(
                        "$PLUGINS_DIR/speed-hack/config.js"
                        "$PLUGINS_DIR/speed-hack/targets.js"
                        "$PLUGINS_DIR/speed-hack/index.js"
                    )
                    ;;
                *)
                    echo -e "${YELLOW}Warning: Unknown plugin: $plugin${NC}"
                    ;;
            esac
        done
    fi

    # 4. Config file (if specified)
    if [[ -n "${CONFIG_FILE:-}" ]]; then
        if [[ ! -f "$CONFIG_FILE" ]]; then
            echo -e "${RED}Error: Config file not found: $CONFIG_FILE${NC}"
            exit 1
        fi
        MODULE_LIST+=("$CONFIG_FILE")
    fi

    # 5. Main entry point
    MODULE_LIST+=("$PROJECT_ROOT/scripts/main.js")
}

build_frida_command() {
    FRIDA_ARGS=()

    # Add all modules
    for module in "${MODULE_LIST[@]}"; do
        FRIDA_ARGS+=("-l" "$module")
    done

    # Add target
    if [[ -n "${TARGET_PID:-}" ]]; then
        FRIDA_ARGS+=("-p" "$TARGET_PID")
    elif [[ -n "${TARGET_NAME:-}" ]]; then
        FRIDA_ARGS+=("-n" "$TARGET_NAME")
    elif [[ -n "${TARGET_SPAWN:-}" ]]; then
        FRIDA_ARGS+=("-f" "$TARGET_SPAWN" "--no-pause")
    fi

    # Add device/host
    if [[ -n "${DEVICE:-}" ]]; then
        FRIDA_ARGS+=("-D" "$DEVICE")
    fi
    if [[ -n "${HOST:-}" ]]; then
        FRIDA_ARGS+=("-H" "$HOST")
    fi
}

###############################################################################
# Main Execution
###############################################################################

main() {
    print_banner

    PLUGIN_NAMES=()
    CONFIG_FILE=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            -p|--pid)
                TARGET_PID="$2"
                shift 2
                ;;
            -n|--name)
                TARGET_NAME="$2"
                shift 2
                ;;
            -f|--spawn)
                TARGET_SPAWN="$2"
                shift 2
                ;;
            -d|--device)
                DEVICE="$2"
                shift 2
                ;;
            -H|--host)
                HOST="$2"
                shift 2
                ;;
            --bridge)
                BRIDGE_PATH="$2"
                echo -e "${YELLOW}Using bridge override: $BRIDGE_PATH${NC}"
                shift 2
                ;;
            --plugin)
                PLUGIN_NAMES+=("$2")
                shift 2
                ;;
            --config)
                CONFIG_FILE="$2"
                shift 2
                ;;
            --example)
                CONFIG_FILE="$EXAMPLES_DIR/example-$2.js"
                PLUGIN_NAMES+=("$2")  # Auto-load corresponding plugin
                shift 2
                ;;
            --list)
                list_processes
                ;;
            --help)
                print_usage
                exit 0
                ;;
            *)
                echo -e "${RED}Error: Unknown option: $1${NC}"
                print_usage
                exit 1
                ;;
        esac
    done

    # Validate
    check_dependencies
    validate_bridge_path
    validate_core_modules

    # Build module list
    build_module_list

    # Show loading info
    echo -e "${BLUE}Loading plugin architecture...${NC}"
    echo -e "${GRAY}Plugins: ${PLUGIN_NAMES[*]:-auto-detect from config}${NC}"
    echo ""

    # Build and execute
    build_frida_command

    echo -e "${GREEN}Executing frida...${NC}"
    echo -e "${BLUE}─────────────────────────────────────────────────────────${NC}"
    echo ""

    exec frida "${FRIDA_ARGS[@]}"
}

main "$@"
