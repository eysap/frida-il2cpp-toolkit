#!/usr/bin/env bash

###############################################################################
# Frida IL2CPP ToolKit - Launch Script
#
# Simplifies the complex command-line invocation by handling all module
# loading in the correct order.
#
# Usage:
#   ./launch.sh                          # Auto-attach to bin.x64
#   ./launch.sh -p 12345                 # Attach to specific PID
#   ./launch.sh -n "AppName"             # Attach to process by name
#   ./launch.sh -f com.example.app       # Spawn and attach
#   ./launch.sh --help                   # Show help
#
###############################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR" 
CLASS_HOOKER_DIR="$PROJECT_ROOT/scripts/class_hooker"

# ============================================================================
# CONFIGURATION: frida-il2cpp-bridge path
#
# Set this to the absolute path of your frida-il2cpp-bridge installation.
# Can be overridden with --bridge flag for one-time usage.
#
# Example:
#   BRIDGE_PATH="/home/user/tools/frida-il2cpp-bridge/dist/index.js"
#
# If not set (and no --bridge flag), script will exit with setup instructions.
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
    echo "║   Frida IL2CPP ToolKit - Launch Script                ║"
    echo "╚═══════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_usage() {
    echo -e "${YELLOW}Usage:${NC} ${CYAN}$0${NC} ${GREEN}[OPTIONS]${NC}"
    echo ""

    echo -e "${YELLOW}Options:${NC}"
    echo -e "  ${GREEN}-p, --pid${NC} ${CYAN}PID${NC}           Attach to process by PID"
    echo -e "  ${GREEN}-n, --name${NC} ${CYAN}NAME${NC}         Attach to process by name"
    echo -e "  ${GREEN}-f, --spawn${NC} ${CYAN}PACKAGE${NC}     Spawn and attach to package/binary"
    echo -e "  ${GREEN}-d, --device${NC} ${CYAN}DEVICE${NC}     Use specific device (default: local)"
    echo -e "  ${GREEN}-H, --host${NC} ${CYAN}HOST${NC}         Connect to remote frida-server"
    echo -e "  ${GREEN}--bridge${NC} ${CYAN}PATH${NC}           Override frida-il2cpp-bridge path"
    echo -e "  ${GREEN}--list${NC}                  List running processes"
    echo -e "  ${GREEN}--help${NC}                  Show this help message"
    echo ""

    echo -e "${YELLOW}Examples:${NC}"
    echo -e "  ${CYAN}$0${NC} ${GREEN}-p${NC} ${CYAN}12345${NC}              ${GRAY}# Attach to PID${NC}"
    echo -e "  ${CYAN}$0${NC} ${GREEN}-n${NC} ${CYAN}\"bin.x64\"${NC}          ${GRAY}# Attach by name${NC}"
    echo -e "  ${CYAN}$0${NC} ${GREEN}-f${NC} ${CYAN}com.example.app${NC}    ${GRAY}# Spawn and attach${NC}"
    echo -e "  ${CYAN}$0${NC} ${GREEN}--bridge${NC} ${CYAN}/path/to/bridge.js${NC} ${GRAY}# Override bridge path${NC}"
    echo -e "  ${CYAN}$0${NC} ${GREEN}--list${NC}                   ${GRAY}# List processes${NC}"
    echo ""

    echo -e "${YELLOW}Configuration:${NC}"
    echo -e "  Set ${GREEN}BRIDGE_PATH${NC} in this script for persistent configuration,"
    echo -e "  or use ${GREEN}--bridge${NC} for a one-time override."
    echo ""
}


check_dependencies() {
    if ! command -v frida frida-ps &> /dev/null; then
        echo -e "${RED}Error: frida command not found${NC}"
        echo "Install with: pip install frida-tools"
        exit 1
    fi
}

validate_bridge_path() {
    if [[ -z "$BRIDGE_PATH" ]] || [[ "$BRIDGE_PATH" == "path/frida-il2cpp-bridge/dist/index.js" ]]; then
        echo -e "${RED}╔═══════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║            CONFIGURATION REQUIRED                     ║${NC}"
        echo -e "${RED}╚═══════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${YELLOW}frida-il2cpp-bridge path is not configured.${NC}"
        echo ""
        echo "Please follow these steps:"
        echo ""
        echo -e "${BLUE}1. Clone frida-il2cpp-bridge:${NC}"
        echo "   git clone https://github.com/vfsfitvnm/frida-il2cpp-bridge.git"
        echo ""
        echo -e "${BLUE}2. Build the library:${NC}"
        echo "   cd frida-il2cpp-bridge"
        echo "   npm install"
        echo "   npm run build"
        echo ""
        echo -e "${BLUE}3. Configure the path (choose one):${NC}"
        echo ""
        echo -e "${GREEN}   Option A: Persistent configuration (recommended)${NC}"
        echo "   Edit this script: $0"
        echo "   Find: BRIDGE_PATH=\"\""
        echo "   Set to: BRIDGE_PATH=\"/absolute/path/to/frida-il2cpp-bridge/dist/index.js\""
        echo ""
        echo -e "${GREEN}   Option B: One-time override${NC}"
        echo "   Use: $0 --bridge /absolute/path/to/frida-il2cpp-bridge/dist/index.js"
        echo ""
        echo -e "${BLUE}Example:${NC}"
        echo "   BRIDGE_PATH=\"/home/user/tools/frida-il2cpp-bridge/dist/index.js\""
        echo ""
        exit 1
    fi

    if [[ ! -f "$BRIDGE_PATH" ]]; then
        echo -e "${RED}Error: frida-il2cpp-bridge not found:${NC}"
        echo "  $BRIDGE_PATH"
        echo ""
        echo "Please verify:"
        echo "  - The path is correct and absolute"
        echo "  - The library has been built (npm run build)"
        echo "  - The file dist/index.js exists"
        echo ""
        echo "Or use --bridge flag to specify a different path."
        exit 1
    fi

    echo -e "${GREEN}✓ frida-il2cpp-bridge found:${NC}"
    echo "  $BRIDGE_PATH"
    echo ""
}

validate_modules() {
    # Module loading order
    local MODULES=(
        "$BRIDGE_PATH"
        "$CLASS_HOOKER_DIR/constants.js"
        "$CLASS_HOOKER_DIR/config.js"
        "$CLASS_HOOKER_DIR/utils.js"
        "$CLASS_HOOKER_DIR/formatters.js"
        "$CLASS_HOOKER_DIR/http-analysis.js"
        "$CLASS_HOOKER_DIR/ui/colors.js"
        "$CLASS_HOOKER_DIR/ui/box.js"
        "$CLASS_HOOKER_DIR/ui/index.js"
        "$CLASS_HOOKER_DIR/core.js"
        "$CLASS_HOOKER_DIR/index.js"
    )

    local missing=()
    for module in "${MODULES[@]}"; do
        if [[ ! -f "$module" ]]; then
            missing+=("$module")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo -e "${RED}Error: Missing required modules:${NC}"
        for mod in "${missing[@]}"; do
            echo "  - $mod"
        done
        exit 1
    fi

    MODULE_LIST=("${MODULES[@]}")
}

list_processes() {
    echo -e "${BLUE}Listing running processes...${NC}"
    frida-ps
    exit 0
}

build_frida_command() {
    FRIDA_ARGS=()

    # Add all module paths with -l flag
    for module in "${MODULE_LIST[@]}"; do
        FRIDA_ARGS+=("-l" "$module")
    done

    # Add target specification
    if [[ -n "${TARGET_PID:-}" ]]; then
        FRIDA_ARGS+=("-p" "$TARGET_PID")
    elif [[ -n "${TARGET_NAME:-}" ]]; then
        FRIDA_ARGS+=("-n" "$TARGET_NAME")
    elif [[ -n "${TARGET_SPAWN:-}" ]]; then
        FRIDA_ARGS+=("-f" "$TARGET_SPAWN")
    fi

    # Add device/host if specified
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
                echo ""
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
                echo ""
                print_usage
                exit 1
                ;;
        esac
    done

    # Validate environment
    check_dependencies
    validate_bridge_path
    validate_modules

    # Build and execute frida command
    echo -e "${BLUE}Loading modules in dependency order...${NC}"
    echo ""

    # Build frida arguments
    build_frida_command

    # Construct final command array
    local frida_cmd=(frida "${FRIDA_ARGS[@]}")

    echo -e "${GREEN}Executing:${NC}"
    echo "  ${frida_cmd[*]}"
    echo ""
    echo -e "${BLUE}─────────────────────────────────────────────────────────${NC}"
    echo ""

    # Execute frida with all modules loaded
    exec "${frida_cmd[@]}"
}

main "$@"
