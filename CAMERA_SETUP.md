# Camera Continuity Setup

## Overview

This document explains how to resolve the macOS warning:
```
WARNING: Add NSCameraUseContinuityCameraDeviceType to your Info.plist to use AVCaptureDeviceTypeContinuityCamera.
```

## Solution

This repository now includes proper configuration for Continuity Camera support in both development and production environments.

### For Development (macOS only)

When you run `npm install`, a postinstall script automatically patches the Electron framework's Info.plist to include the required camera permissions:

- `NSCameraUseContinuityCameraDeviceType`: Enables Continuity Camera support
- `NSCameraUsageDescription`: Describes why camera access is needed

To manually run the patch script:
```bash
npm run patch-electron
```

**Note**: This patch will be lost if you update or reinstall Electron. The postinstall script ensures it's automatically reapplied after any `npm install`.

### For Production Builds

The application uses `electron-builder` with proper macOS configuration that includes camera permissions in the packaged app's Info.plist.

Build the application for macOS:
```bash
# Build for macOS (creates DMG and ZIP)
npm run package:mac

# Build for all platforms
npm run package

# Build for specific platforms
npm run package:win    # Windows
npm run package:linux  # Linux
```

## What Changed

1. **package.json**: Added electron-builder configuration with `extendInfo` for macOS builds
2. **scripts/patch-electron-plist.sh**: Script to patch Electron framework's Info.plist in development
3. **npm scripts**: Added `patch-electron`, `postinstall`, and packaging scripts

## Permissions Added

- **NSCameraUseContinuityCameraDeviceType** (Boolean): Enables Continuity Camera device type
- **NSCameraUsageDescription** (String): "This app requires camera access for capturing screenshots and continuity camera features."
- **NSMicrophoneUsageDescription** (String): "This app may require microphone access for certain features."

## How It Works

### Development Mode
- The postinstall script runs after `npm install`
- It uses macOS's `PlistBuddy` utility to modify the Electron Helper (Plugin) app's Info.plist
- Changes are only applied on macOS systems
- The script is idempotent (safe to run multiple times)

### Production Mode
- `electron-builder` uses the `build.mac.extendInfo` configuration from package.json
- The Info.plist is properly configured in the final packaged application
- No manual patching required for distribution builds

## Verification

After running the patch script or installing dependencies, the warning should no longer appear when running the Electron app in development mode.

To verify the patch was applied:
```bash
# Check if the key exists in the plist (macOS only)
/usr/libexec/PlistBuddy -c "Print :NSCameraUseContinuityCameraDeviceType" \
  node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron\ Helper\ \(Plugin\).app/Contents/Info.plist
```

This should output `true` if the patch was successful.
