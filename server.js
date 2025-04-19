/**
 * Simple HTTP server for the Prisoner's Dilemma Tournament application
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

// Try multiple ports in case the default is in use
const PORTS = [3000, 3001, 3002, 3003, 3004, 3005];

// MIME types for different file extensions
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

// Create the HTTP server
const server = http.createServer((req, res) => {
    console.log(`Request: ${req.method} ${req.url}`);
    
    // Handle the root URL
    let filePath = req.url === '/' ? './index.html' : '.' + req.url;
    
    // Get the file extension
    const extname = path.extname(filePath);
    
    // Set the content type based on the file extension
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';
    
    // Read the file
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // File not found
                fs.readFile('./404.html', (err, content) => {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end(content, 'utf-8');
                });
            } else {
                // Server error
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            // Success
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Try to start the server on different ports
function tryPort(portIndex) {
    if (portIndex >= PORTS.length) {
        console.error('Could not start server on any of the configured ports.');
        return;
    }
    
    const port = PORTS[portIndex];
    
    server.listen(port, () => {
        console.log(`Server running at http://localhost:${port}/`);
        console.log('Press Ctrl+C to stop the server');
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${port} is already in use, trying next port...`);
            tryPort(portIndex + 1);
        } else {
            console.error('Server error:', err);
        }
    });
}

// Start trying ports
tryPort(0); 