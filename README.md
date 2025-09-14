# DualShock Calibration GUI

A web-based calibration tool for PlayStation DualShock 4, DualSense, and DualSense Edge controllers.

## Build System

This project now uses TypeScript for type checking and ESLint for code quality. The build process compiles JavaScript files, minifies them, and adds cache-busting hashes to filenames.

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

```bash
# Install dependencies
npm install
```

### Build Commands

```bash
# Build the project (lint, compile, process language files, minify)
npm run build

# Run ESLint only
npm run lint

# Clean the dist directory
npm run clean

# Compile TypeScript
npm run compile

# Process language files
npm run process-lang

# Minify and create production build
npm run minify

# Test the build output
npm run test-build

# Start development server (build + serve)
npm run dev

# Start production server (serve only)
npm run start
```

## Build Process Details

1. **Linting**: ESLint checks all JavaScript files for code quality and potential issues
2. **Cleaning**: Removes the previous build from the dist directory
3. **Compilation**: TypeScript compiles and type-checks JavaScript files
4. **Language Processing**: Processes language JSON files and creates an index
5. **Minification**: Minifies JavaScript files and adds cache-busting hashes to filenames

## Language Files

Language files are not bundled with the JavaScript but loaded on demand. The build process:

1. Creates a language index file with metadata
2. Copies all language JSON files to the dist directory

## Notes

- The application requires a browser with WebHID support (primarily Chrome-based browsers)
- The build system preserves the ES modules structure for better code organization
- Source maps are generated for easier debugging
