'use strict';

const fs = require('fs');
const path = require('path');

// Check if dist directory exists
if (!fs.existsSync(path.join(__dirname, '../dist'))) {
  console.error('Error: dist directory does not exist. Run npm run build first.');
  process.exit(1);
}

// Check if key files exist
const requiredFiles = [
  'index.html',
  'js',
  'css',
  'lang'
];

let missingFiles = [];
for (const file of requiredFiles) {
  const filePath = path.join(__dirname, '../dist', file);
  if (!fs.existsSync(filePath)) {
    missingFiles.push(file);
  }
}

if (missingFiles.length > 0) {
  console.error(`Error: The following required files/directories are missing: ${missingFiles.join(', ')}`);
  process.exit(1);
}

// Check if JS files are minified and have cache-busting hashes
const jsDir = path.join(__dirname, '../dist/js');
const jsFiles = fs.readdirSync(jsDir);

// Check if there are any JS files
if (jsFiles.length === 0) {
  console.error('Error: No JavaScript files found in dist/js directory.');
  process.exit(1);
}

// Check if JS files have hash in filename
const hashedFiles = jsFiles.filter(file => /\.[a-f0-9]{8}\.js$/.test(file));
if (hashedFiles.length === 0) {
  console.error('Error: No cache-busting hashes found in JavaScript filenames.');
  process.exit(1);
}

// Check if language files are present but not bundled
const langDir = path.join(__dirname, '../dist/lang');
const langFiles = fs.readdirSync(langDir);

if (langFiles.length === 0) {
  console.error('Error: No language files found in dist/lang directory.');
  process.exit(1);
}

// Check if language index file exists
if (!langFiles.includes('index.json')) {
  console.error('Error: Language index file (index.json) not found in dist/lang directory.');
  process.exit(1);
}

console.log('Build validation successful!');
console.log(`- Found ${jsFiles.length} JavaScript files (${hashedFiles.length} with cache-busting hashes)`);
console.log(`- Found ${langFiles.length} language files`);
console.log('The build appears to be correctly configured.');