const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Vercel build process...');

try {
  // Check if we're in the right directory
  console.log('📁 Current directory:', process.cwd());
  console.log('📦 Checking package.json...');
  
  if (!fs.existsSync('package.json')) {
    throw new Error('package.json not found in current directory');
  }

  // Install dependencies
  console.log('📥 Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });

  // Run build
  console.log('🔨 Running build...');
  execSync('npm run build', { stdio: 'inherit' });

  // Check if dist directory exists
  if (!fs.existsSync('dist')) {
    throw new Error('Build failed: dist directory not created');
  }

  console.log('✅ Build completed successfully!');
  console.log('📁 Build output:', fs.readdirSync('dist'));

} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
} 