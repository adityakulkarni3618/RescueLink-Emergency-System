#!/bin/bash
# RescueLink — Quick Start Script
# Run this from the emergency-care-system/ directory

echo ""
echo "🚑  RescueLink Emergency Care System — Setup"
echo "============================================"
echo ""

# Install server deps
echo "📦 Installing server dependencies..."
cd server && npm install
cd ..

# Install client deps  
echo "📦 Installing client dependencies..."
cd client && npm install
cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "────────────────────────────────────────────"
echo "  To start the system:"
echo ""
echo "  Terminal 1:  cd server && node server.js"
echo "  Terminal 2:  cd client && npm start"
echo ""
echo "  Then open http://localhost:3000 in TWO"
echo "  browser windows for the full demo!"
echo "────────────────────────────────────────────"
echo ""
