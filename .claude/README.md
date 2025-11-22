# Claude Code Configuration

This directory contains configuration for Claude Code sessions.

## Hooks

### SessionStart.sh

Automatically runs when a Claude Code session starts. This hook:

- Checks if `node_modules` exists
- Runs `npm install --ignore-scripts` if dependencies are missing
- Uses `--ignore-scripts` flag to bypass Electron binary download (which fails with 403 Forbidden in restricted network environments)

This ensures Claude Code can build and test the project without manual dependency installation steps.

## Why `--ignore-scripts`?

The Electron postinstall script downloads a large binary from GitHub releases, which is blocked in some CI/CD environments. Since we only need to build the code (not run Electron), skipping postinstall scripts is safe and allows the build to complete successfully.
