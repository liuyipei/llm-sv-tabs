#!/bin/bash

# Script to patch Electron framework's Info.plist with required camera permissions
# This fixes the NSCameraUseContinuityCameraDeviceType warning during development

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Patching Electron framework Info.plist for development...${NC}"

# Find the Electron app bundle
if [ "$(uname)" == "Darwin" ]; then
    # macOS
    ELECTRON_PATH="node_modules/electron/dist/Electron.app"
    PLIST_PATH="$ELECTRON_PATH/Contents/Frameworks/Electron Helper (Plugin).app/Contents/Info.plist"

    if [ ! -f "$PLIST_PATH" ]; then
        echo -e "${RED}Error: Could not find Electron Helper Info.plist at $PLIST_PATH${NC}"
        exit 1
    fi

    # Check if the key already exists
    if /usr/libexec/PlistBuddy -c "Print :NSCameraUseContinuityCameraDeviceType" "$PLIST_PATH" 2>/dev/null; then
        echo -e "${GREEN}NSCameraUseContinuityCameraDeviceType already exists in Info.plist${NC}"
    else
        # Add the key
        /usr/libexec/PlistBuddy -c "Add :NSCameraUseContinuityCameraDeviceType bool true" "$PLIST_PATH" 2>/dev/null || true
        echo -e "${GREEN}Added NSCameraUseContinuityCameraDeviceType to Info.plist${NC}"
    fi

    # Also add camera usage description if not present
    if ! /usr/libexec/PlistBuddy -c "Print :NSCameraUsageDescription" "$PLIST_PATH" 2>/dev/null; then
        /usr/libexec/PlistBuddy -c "Add :NSCameraUsageDescription string 'This app requires camera access for capturing screenshots and continuity camera features.'" "$PLIST_PATH" 2>/dev/null || true
        echo -e "${GREEN}Added NSCameraUsageDescription to Info.plist${NC}"
    fi

    echo -e "${GREEN}✓ Electron framework Info.plist patched successfully!${NC}"
    echo -e "${YELLOW}Note: This patch will be lost if you update/reinstall Electron.${NC}"
    echo -e "${YELLOW}For production builds, use 'npm run package:mac' which includes the proper configuration.${NC}"
else
    echo -e "${YELLOW}This script is only needed on macOS. Skipping...${NC}"
fi
