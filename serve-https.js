#!/usr/bin/env node
/**
 * Simple HTTPS server for local network development
 * Generates self-signed certificate and serves the current directory
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

function generateCertificate() {
    const certFile = 'server.crt';
    const keyFile = 'server.key';
    
    if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
        console.log(`Using existing certificate: ${certFile}`);
        return { cert: certFile, key: keyFile };
    }
    
    console.log('Generating self-signed certificate...');
    
    try {
        execSync(`openssl req -x509 -newkey rsa:4096 -keyout ${keyFile} -out ${certFile} -days 365 -nodes -subj "/C=US/ST=Local/L=Local/O=Dev/CN=localhost"`, 
                 { stdio: 'inherit' });
        console.log(`Generated certificate: ${certFile}`);
        return { cert: certFile, key: keyFile };
    } catch (error) {
        console.error('Error generating certificate:', error.message);
        console.error('Make sure OpenSSL is installed');
        process.exit(1);
    }
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

function serveFile(req, res) {
    // Check if dist directory exists, otherwise serve from root
    const distDir = path.join(__dirname, 'dist');
    const rootDir = fs.existsSync(distDir) ? distDir : __dirname;
    
    let filePath = path.join(rootDir, req.url === '/' ? 'index.html' : req.url);
    
    // Security: prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    
    // Check if file exists
    fs.stat(filePath, (err, stats) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // If file not found in dist, try in root directory
                if (rootDir === distDir) {
                    const rootFilePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
                    fs.stat(rootFilePath, (rootErr, rootStats) => {
                        if (!rootErr) {
                            // File exists in root, serve it
                            serveFileContent(rootFilePath, res);
                        } else {
                            res.writeHead(404);
                            res.end('File not found');
                        }
                    });
                } else {
                    res.writeHead(404);
                    res.end('File not found');
                }
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
            return;
        }
        
        // If it's a directory, try to serve index.html
        if (stats.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }
        
        serveFileContent(filePath, res);
    });
}

function serveFileContent(filePath, res) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
            return;
        }
        
        // Set content type based on file extension
        const ext = path.extname(filePath).toLowerCase();
        const contentTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.ico': 'image/x-icon'
        };
        
        const contentType = contentTypes[ext] || 'application/octet-stream';
        
        // Set cache control headers based on file type
        const headers = { 'Content-Type': contentType };
        
        // Add cache headers for static assets
        if (['.js', '.css', '.png', '.jpg', '.svg', '.ico'].includes(ext)) {
            // Cache for 1 week
            headers['Cache-Control'] = 'public, max-age=604800';
        } else if (ext === '.json' && filePath.includes('/lang/')) {
            // Cache language files for 1 day
            headers['Cache-Control'] = 'public, max-age=86400';
        } else {
            // No cache for HTML and other files
            headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
            headers['Pragma'] = 'no-cache';
            headers['Expires'] = '0';
        }
        
        res.writeHead(200, headers);
        res.end(data);
    });
}
}

function main() {
    const port = process.argv[2] ? parseInt(process.argv[2]) : 8443;
    
    // Generate certificate
    const { cert, key } = generateCertificate();
    
    // Create HTTPS server
    const options = {
        key: fs.readFileSync(key),
        cert: fs.readFileSync(cert)
    };
    
    const server = https.createServer(options, serveFile);
    
    server.listen(port, () => {
        const localIP = getLocalIP();
        
        console.log(`Serving HTTPS on port ${port}`);
        console.log(`Local access: https://localhost:${port}`);
        console.log(`Network access: https://${localIP}:${port}`);
        console.log('\nIMPORTANT: You\'ll need to accept the self-signed certificate warning in your browser');
        console.log('This is safe for local development.');
        console.log('\nPress Ctrl+C to stop the server');
    });
}

if (require.main === module) {
    main();
}