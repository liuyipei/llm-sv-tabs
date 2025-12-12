# Build Assets

This directory contains assets needed for building and distributing the application.

## Required Files

### Icons

You'll need to add the following icon files to this directory:

- **icon.icns** - macOS icon (1024x1024 .icns format)
- **icon.ico** - Windows icon (256x256 .ico format)
- **icons/** - Linux icons directory with various sizes (16x16, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512)

You can generate these from a single high-resolution PNG (1024x1024) using:
- [electron-icon-builder](https://www.npmjs.com/package/electron-icon-builder)
- Or online tools like [CloudConvert](https://cloudconvert.com/)

### Code Signing Certificates

**DO NOT** commit certificate files to this repository!

Certificates are managed via environment variables in CI/CD:
- macOS: `CSC_LINK`, `CSC_KEY_PASSWORD`
- Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`

See [DISTRIBUTION.md](../DISTRIBUTION.md) for details on obtaining and configuring certificates.

## Files in This Directory

- **entitlements.mac.plist** - macOS app entitlements for hardened runtime
- **README.md** - This file
