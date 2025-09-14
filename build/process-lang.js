'use strict';

const fs = require('fs');
const path = require('path');

// Create language index file
const createLanguageIndex = () => {
  const langDir = path.join(__dirname, '../lang');
  const outputDir = path.join(__dirname, '../dist/lang');
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Read all language files
  const langFiles = fs.readdirSync(langDir).filter(file => file.endsWith('.json'));
  
  // Create index file with language metadata
  const langIndex = langFiles.map(file => {
    const langCode = path.basename(file, '.json');
    const langData = JSON.parse(fs.readFileSync(path.join(langDir, file), 'utf8'));
    
    return {
      code: langCode,
      name: langData.language_name || langCode,
      direction: langData.direction || 'ltr'
    };
  });
  
  // Write index file
  fs.writeFileSync(
    path.join(outputDir, 'index.json'),
    JSON.stringify(langIndex, null, 2)
  );
  
  console.log(`Created language index with ${langIndex.length} languages`);
  
  // Copy all language files to dist
  langFiles.forEach(file => {
    fs.copyFileSync(
      path.join(langDir, file),
      path.join(outputDir, file)
    );
  });
  
  console.log('Copied all language files to dist/lang');
};

// Main function
const main = () => {
  try {
    console.log('Processing language files...');
    createLanguageIndex();
    console.log('Language processing completed successfully!');
  } catch (error) {
    console.error('Language processing failed:', error);
    process.exit(1);
  }
};

main();