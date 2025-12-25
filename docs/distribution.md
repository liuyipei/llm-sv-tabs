# Distribution and Code Signing Guide

This guide covers how to build, sign, and distribute LLM Browser for macOS and Windows.

## Overview

The app is configured to build signed, notarized installers for:
- **macOS**: DMG and ZIP (both x64 and arm64/Apple Silicon)
- **Windows**: NSIS installer (x64)
- **Linux**: AppImage and deb (optional)

## Prerequisites

### Required Tools

1. **Node.js 22+** (matches Electron 39 runtime)
2. **npm** (comes with Node.js)
3. **Code Signing Certificates** (see below)

### Code Signing Certificates

#### macOS - Apple Developer Program ($99/year)

You need:
1. **Developer ID Application certificate**
   - Enroll in [Apple Developer Program](https://developer.apple.com/programs/)
   - Create certificate in [Apple Developer Account](https://developer.apple.com/account)
   - Download as `.p12` file with password

2. **App-Specific Password for Notarization**
   - Generate at [appleid.apple.com](https://appleid.apple.com/account/manage)
   - Under "Sign-In and Security" → "App-Specific Passwords"

3. **Team ID**
   - Find in [Apple Developer Account](https://developer.apple.com/account)
   - Under "Membership Details"

#### Windows - Code Signing Certificate (~$75/year)

Recommended providers:
- [Sectigo](https://sectigo.com/ssl-certificates-tls/code-signing) (~$75/year)
- [DigiCert](https://www.digicert.com/signing/code-signing-certificates)
- [SSL.com](https://www.ssl.com/certificates/code-signing/)

You'll receive a `.pfx` or `.p12` file with a password.

## Local Development Builds

### Installing Dependencies

```bash
# Standard installation (full Electron binary)
npm install

# Restricted environments (Claude Code, sandboxed CI/CD)
npm install --ignore-scripts
```

**Note:** The `--ignore-scripts` flag skips Electron binary download. This is fine for building the app code (`npm run build`, `npm test`), but you'll need the full Electron binary to create installers with `npm run dist:*`.

### Building without Code Signing

For testing locally without certificates:

```bash
# Build all code (works with or without Electron binary)
npm run build

# Build unsigned installers (requires full Electron installation)
npm run dist:mac    # macOS
npm run dist:win    # Windows
npm run dist        # Current platform
```

Built files will be in the `release/` directory.

### Building with Code Signing (Local)

Set environment variables before building:

#### macOS

```bash
# Export certificate to base64
export CSC_LINK=$(base64 -i /path/to/certificate.p12)
export CSC_KEY_PASSWORD="your-certificate-password"

# Notarization (optional for local builds)
export APPLE_ID="your@apple-id.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"

# Build
npm run dist:mac
```

#### Windows

```bash
# Export certificate to base64
export WIN_CSC_LINK=$(base64 -i /path/to/certificate.pfx)
export WIN_CSC_KEY_PASSWORD="your-certificate-password"

# Build
npm run dist:win
```

## GitHub Actions (CI/CD)

### Setting Up GitHub Secrets

The repository is configured for automatic builds on version tags using GitHub Actions.

#### Required Secrets

Go to your repository → Settings → Secrets and variables → Actions → New repository secret

**For macOS:**
1. `MACOS_CERTIFICATE` - Base64-encoded .p12 certificate
   ```bash
   base64 -i certificate.p12 | pbcopy  # macOS
   base64 -w 0 certificate.p12         # Linux
   ```
2. `MACOS_CERTIFICATE_PASSWORD` - Certificate password
3. `APPLE_ID` - Your Apple ID email
4. `APPLE_APP_SPECIFIC_PASSWORD` - App-specific password
5. `APPLE_TEAM_ID` - Your team ID (10 character string)

**For Windows:**
1. `WINDOWS_CERTIFICATE` - Base64-encoded .pfx certificate
   ```bash
   base64 -i certificate.pfx | pbcopy  # macOS
   base64 -w 0 certificate.pfx         # Linux
   ```
2. `WINDOWS_CERTIFICATE_PASSWORD` - Certificate password

**Note:** `GITHUB_TOKEN` is automatically provided by GitHub Actions.

### Triggering a Build

#### Automatic (on version tag):

```bash
# Create and push a version tag
git tag v1.0.0
git push origin v1.0.0
```

This will:
1. Run tests
2. Build the app
3. Sign and notarize (macOS) or sign (Windows)
4. Create a draft GitHub Release
5. Upload installers as release assets

#### Manual:

Go to Actions → Build and Release (macOS/Windows) → Run workflow

### Workflow Files

- `.github/workflows/build-macos.yml` - macOS build and release
- `.github/workflows/build-windows.yml` - Windows build and release

## Publishing a Release

After GitHub Actions completes:

1. Go to your repository's [Releases](https://github.com/liuyipei/llm-sv-tabs/releases)
2. Find the draft release
3. Edit the release notes if needed
4. Click "Publish release"

Users can then download the signed installers.

## Auto-Updates

The app is configured for auto-updates via GitHub Releases in `electron-builder.yml`:

```yaml
publish:
  provider: github
  owner: liuyipei
  repo: llm-sv-tabs
```

To enable auto-updates in the app:
1. Add update checking logic to `src/main/main.ts`
2. Use `electron-updater` package
3. All updates must be signed with the same certificate

See [electron-updater documentation](https://www.electron.build/auto-update) for implementation details.

## Troubleshooting

### macOS Notarization Fails

- Ensure app-specific password is correct
- Check that hardened runtime is enabled (it is in `electron-builder.yml`)
- Verify entitlements are properly configured (`build/entitlements.mac.plist`)
- Check Apple's notarization log for specific errors

### Windows Signing Fails

- Verify certificate is valid and not expired
- Ensure timestamp server is accessible
- Check that certificate password is correct

### "Developer Cannot Be Verified" on macOS

This means notarization failed or wasn't performed:
- Users can bypass: Right-click → Open (first time only)
- Fix: Ensure notarization completes successfully in CI

### Build Fails in GitHub Actions

- Check that all secrets are properly set
- Verify base64 encoding is correct (no newlines)
- Check workflow logs for specific errors
- Ensure Node.js version matches (should be 22)

## Security Best Practices

1. **Never commit certificates** - Use .gitignore
2. **Rotate app-specific passwords** periodically
3. **Use separate certificates** for development vs production if possible
4. **Monitor certificate expiration** - Set calendar reminders
5. **Keep certificates secure** - Store in password manager

## Cost Summary

- **Apple Developer Program**: $99/year (required for macOS)
- **Windows Code Signing**: ~$75/year (Sectigo standard)
- **Total**: ~$175/year

Both certificates must be renewed annually to continue signing new releases.

## Additional Resources

- [Electron Builder Documentation](https://www.electron.build/)
- [Code Signing (Electron Builder)](https://www.electron.build/code-signing)
- [Apple Notarization](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Windows Code Signing](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)

## Questions?

For issues specific to this project, open an issue on GitHub.
For general Electron signing questions, check the Electron and electron-builder documentation.
