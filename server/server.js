const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// Auto-detect local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '0.0.0.0'; // Fallback: listen on all interfaces
}

const HOST = getLocalIP();

// Check if SSL certificates exist
const certsPath = path.join(__dirname, '../certs');
const useHttps = fs.existsSync(path.join(certsPath, 'key.pem')) &&
  fs.existsSync(path.join(certsPath, 'cert.pem'));

// MIME types for static file serving
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Request handler for static files
function requestHandler(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, '../public', filePath);

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

// Create HTTP or HTTPS server
let server;
if (useHttps) {
  const sslOptions = {
    key: fs.readFileSync(path.join(certsPath, 'key.pem')),
    cert: fs.readFileSync(path.join(certsPath, 'cert.pem'))
  };
  server = https.createServer(sslOptions, requestHandler);
  console.log('🔒 HTTPS mode enabled');
} else {
  server = http.createServer(requestHandler);
  console.log('⚠️  HTTP mode (screen sharing requires HTTPS)');
}

// Create WebSocket server for signaling
const wss = new WebSocketServer({ server });

// Track connected clients
let broadcaster = null;
const viewers = new Set();

wss.on('connection', (ws) => {
  console.log('New connection');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleMessage(ws, message);
    } catch (e) {
      console.error('Invalid message:', e);
    }
  });

  ws.on('close', () => {
    if (ws === broadcaster) {
      console.log('Broadcaster disconnected');
      broadcaster = null;
      // Notify all viewers
      viewers.forEach(viewer => {
        viewer.send(JSON.stringify({ type: 'broadcaster-left' }));
      });
    } else {
      viewers.delete(ws);
      console.log('Viewer disconnected, remaining:', viewers.size);
    }
  });
});

function handleMessage(ws, message) {
  switch (message.type) {
    case 'broadcaster-ready':
      // Broadcaster announces it's ready
      broadcaster = ws;
      console.log('Broadcaster connected');
      // Notify existing viewers that broadcaster is available
      viewers.forEach(viewer => {
        viewer.send(JSON.stringify({ type: 'broadcaster-available' }));
      });
      break;

    case 'viewer-join':
      // Viewer wants to watch
      viewers.add(ws);
      console.log('Viewer joined, total:', viewers.size);
      if (broadcaster) {
        // Tell broadcaster to create an offer for this viewer
        broadcaster.send(JSON.stringify({
          type: 'viewer-joined',
          viewerId: getClientId(ws)
        }));
      } else {
        ws.send(JSON.stringify({ type: 'no-broadcaster' }));
      }
      break;

    case 'offer':
      // Broadcaster sends offer to a viewer
      const targetViewer = findViewerById(message.viewerId);
      if (targetViewer) {
        targetViewer.send(JSON.stringify({
          type: 'offer',
          offer: message.offer
        }));
      }
      break;

    case 'answer':
      // Viewer sends answer back to broadcaster
      if (broadcaster) {
        broadcaster.send(JSON.stringify({
          type: 'answer',
          viewerId: getClientId(ws),
          answer: message.answer
        }));
      }
      break;

    case 'ice-candidate':
      // Forward ICE candidates
      if (ws === broadcaster) {
        // From broadcaster to viewer
        const viewer = findViewerById(message.viewerId);
        if (viewer) {
          viewer.send(JSON.stringify({
            type: 'ice-candidate',
            candidate: message.candidate
          }));
        }
      } else {
        // From viewer to broadcaster
        if (broadcaster) {
          broadcaster.send(JSON.stringify({
            type: 'ice-candidate',
            viewerId: getClientId(ws),
            candidate: message.candidate
          }));
        }
      }
      break;
  }
}

// Generate a simple ID for each client
const clientIds = new WeakMap();
let nextId = 1;

function getClientId(ws) {
  if (!clientIds.has(ws)) {
    clientIds.set(ws, `viewer-${nextId++}`);
  }
  return clientIds.get(ws);
}

function findViewerById(id) {
  for (const viewer of viewers) {
    if (getClientId(viewer) === id) {
      return viewer;
    }
  }
  return null;
}

server.listen(PORT, HOST, () => {
  const protocol = useHttps ? 'https' : 'http';
  console.log(`\n🚀 Server running at ${protocol}://${HOST}:${PORT}\n`);
  if (useHttps) {
    console.log('⚠️  Your browser will show a security warning for the self-signed certificate.');
    console.log('   Click "Advanced" → "Proceed" to continue.\n');
  }
});
