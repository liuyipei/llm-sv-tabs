#!/bin/bash
# Session Start Hook - runs automatically when Claude Code session starts

echo "🔧 Setting up dependencies..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (skipping postinstall scripts due to network restrictions)..."
    npm install --ignore-scripts
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi
