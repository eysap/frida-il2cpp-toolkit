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
    cat << EOF
Usage: $0 [OPTIONS]

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
    $0 -p 12345                         # Attach to PID 12345
    $0 -n "bin.x64"                     # Attach to process by name
    $0 -f com.example.app               # Spawn app and attach
    $0 --bridge /path/to/bridge.js      # Use alternative bridge path
    $0 --list                           # List all processes

Configuration:
    You can set BRIDGE_PATH in this script for persistent configuration,
    or use --bridge flag for one-time override.
EOF
}

check_dependencies() {
    if ! command -v frida &> /dev/null; then
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
    local frida_args=()

    # Add all module paths with -l flag
    for module in "${MODULE_LIST[@]}"; do
        frida_args+=("-l" "$module")
    done

    # Add target specification
    if [[ -n "${TARGET_PID:-}" ]]; then
        frida_args+=("-p" "$TARGET_PID")
    elif [[ -n "${TARGET_NAME:-}" ]]; then
        frida_args+=("-n" "$TARGET_NAME")
    elif [[ -n "${TARGET_SPAWN:-}" ]]; then
        frida_args+=("-f" "$TARGET_SPAWN")
    fi

    # Add device/host if specified
    if [[ -n "${DEVICE:-}" ]]; then
        frida_args+=("-D" "$DEVICE")
    fi
    if [[ -n "${HOST:-}" ]]; then
        frida_args+=("-H" "$HOST")
    fi

    echo "${frida_args[@]}"
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

    local frida_cmd
    frida_cmd=(frida $(build_frida_command))

    echo -e "${GREEN}Executing:${NC}"
    echo "  ${frida_cmd[*]}"
    echo ""
    echo -e "${BLUE}─────────────────────────────────────────────────────────${NC}"
    echo ""

    # Execute frida with all modules loaded
    exec "${frida_cmd[@]}"
}

main "$@"
