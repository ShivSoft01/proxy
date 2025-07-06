#!/bin/bash

echo "🔧 Installing dependencies..."
npm ci --only=production

echo "🔧 Installing dev dependencies for build..."
npm install --include=dev

echo "🏗️ Building project..."
npm run build

echo "✅ Build complete!" 