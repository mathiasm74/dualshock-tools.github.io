'use strict';

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const crypto = require('crypto');

// Create dist directory structure
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Copy non-JS files (HTML, CSS, etc.)
const copyNonJsFiles = () => {
  // Copy HTML files
  fs.copyFileSync(
    path.join(__dirname, '../index.html'),
    path.join(__dirname, '../dist/index.html')
  );

  // Copy CSS files
  ensureDirectoryExists(path.join(__dirname, '../dist/css'));
  const cssFiles = fs.readdirSync(path.join(__dirname, '../css'));
  cssFiles.forEach(file => {
    fs.copyFileSync(
      path.join(__dirname, '../css', file),
      path.join(__dirname, '../dist/css', file)
    );
  });

  // Copy assets
  ensureDirectoryExists(path.join(__dirname, '../dist/assets'));
  const assetFiles = fs.readdirSync(path.join(__dirname, '../assets'));
  assetFiles.forEach(file => {
    fs.copyFileSync(
      path.join(__dirname, '../assets', file),
      path.join(__dirname, '../dist/assets', file)
    );
  });

  // Copy templates
  ensureDirectoryExists(path.join(__dirname, '../dist/templates'));
  const templateFiles = fs.readdirSync(path.join(__dirname, '../templates'));
  templateFiles.forEach(file => {
    fs.copyFileSync(
      path.join(__dirname, '../templates', file),
      path.join(__dirname, '../dist/templates', file)
    );
  });

  // Copy site.webmanifest
  if (fs.existsSync(path.join(__dirname, '../site.webmanifest'))) {
    fs.copyFileSync(
      path.join(__dirname, '../site.webmanifest'),
      path.join(__dirname, '../dist/site.webmanifest')
    );
  }

  // Copy favicon files
  const faviconFiles = [
    'favicon.ico',
    'favicon.svg',
    'favicon-16x16.png',
    'favicon-32x32.png',
    'favicon-96x96.png',
    'apple-touch-icon.png'
  ];
  
  faviconFiles.forEach(file => {
    if (fs.existsSync(path.join(__dirname, '..', file))) {
      fs.copyFileSync(
        path.join(__dirname, '..', file),
        path.join(__dirname, '../dist', file)
      );
    }
  });
};

// Generate a hash for cache busting
const generateHash = (content) => {
  return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
};

// Process JS files
const processJsFiles = async () => {
  const jsDir = path.join(__dirname, '../dist/js');
  ensureDirectoryExists(jsDir);
  
  // Create a map to store original to hashed filename mappings
  const fileMap = {};
  
  // Process all JS files in the dist directory
  const processDir = async (dir) => {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        // Create the same directory structure in dist
        const relativePath = path.relative(path.join(__dirname, '../dist'), dir);
        const targetDir = path.join(__dirname, '../dist', relativePath, file);
        ensureDirectoryExists(targetDir);
        
        // Process files in subdirectory
        await processDir(filePath);
      } else if (file.endsWith('.js')) {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Minify the file
        const result = await minify(content, {
          compress: true,
          mangle: true,
          sourceMap: {
            filename: file,
            url: `${file}.map`
          }
        });
        
        // Generate hash for cache busting
        const hash = generateHash(result.code);
        const fileExt = path.extname(file);
        const fileName = path.basename(file, fileExt);
        const hashedFileName = `${fileName}.${hash}${fileExt}`;
        
        // Get relative path from dist/js
        const relativePath = path.relative(path.join(__dirname, '../dist'), dir);
        const outputDir = path.join(__dirname, '../dist', relativePath);
        ensureDirectoryExists(outputDir);
        
        // Write minified file with hash
        fs.writeFileSync(path.join(outputDir, hashedFileName), result.code);
        
        // Write source map if available
        if (result.map) {
          fs.writeFileSync(path.join(outputDir, `${hashedFileName}.map`), result.map);
        }
        
        // Store mapping
        const relativeFilePath = path.join(relativePath, file).replace(/\\/g, '/');
        fileMap[relativeFilePath] = path.join(relativePath, hashedFileName).replace(/\\/g, '/');
      }
    }
  };
  
  // Start processing from the js directory
  await processDir(path.join(__dirname, '../dist/js'));
  
  // Update import paths in all JS files
  for (const outputFile of Object.values(fileMap)) {
    const fullPath = path.join(__dirname, '../dist', outputFile);
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Replace all import paths
    for (const [originalPath, hashedPath] of Object.entries(fileMap)) {
      // Handle relative imports
      const importPattern = new RegExp(`from\\s+['"]\\.\\/(.+?)${originalPath.replace(/^js\//, '')}['"]`, 'g');
      content = content.replace(importPattern, `from './${hashedPath.replace(/^js\//, '')}'`);
      
      // Handle imports from js/
      const rootImportPattern = new RegExp(`from\\s+['"]\\.\\.\\/${originalPath}['"]`, 'g');
      content = content.replace(rootImportPattern, `from '../${hashedPath}'`);
    }
    
    fs.writeFileSync(fullPath, content);
  }
  
  // Update index.html to reference the hashed main JS file
  if (fileMap['js/core.js']) {
    const indexPath = path.join(__dirname, '../dist/index.html');
    let indexContent = fs.readFileSync(indexPath, 'utf8');
    
    // Replace the script tag for core.js
    indexContent = indexContent.replace(
      /<script type="module" src="js\/core\.js"><\/script>/,
      `<script type="module" src="${fileMap['js/core.js']}"></script>`
    );
    
    fs.writeFileSync(indexPath, indexContent);
  }
};

// Main function
const main = async () => {
  try {
    console.log('Copying non-JS files...');
    copyNonJsFiles();
    
    console.log('Processing JS files...');
    await processJsFiles();
    
    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
};

main();