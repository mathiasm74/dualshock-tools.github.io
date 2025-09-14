#!/bin/bash

# Simple build script for DualShock Calibration GUI

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Run the build
echo "Building the project..."
npm run build

# Test the build
echo "Testing the build..."
npm run test-build

# Start the server if requested
if [ "$1" == "serve" ]; then
    echo "Starting the server..."
    npm run start
fi

echo "Build completed successfully!"
echo "To start the server, run: npm run start"