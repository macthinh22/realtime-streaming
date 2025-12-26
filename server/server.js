const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_ROOMS = 5;
const ROOM_CLEANUP_TIMEOUT = 60000; // 60 seconds

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

// ============================================
// Room Management
// ============================================

// Room storage: Map<roomId, Room>
const rooms = new Map();

// Client to room mapping: WeakMap<WebSocket, roomId>
const clientRooms = new WeakMap();

// Client IDs
const clientIds = new WeakMap();
let nextClientId = 1;

/**
 * Generate a unique room ID
 */
function generateRoomId() {
  return 'room-' + crypto.randomBytes(4).toString('hex');
}

/**
 * Hash a room key using SHA-256
 */
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Validate a key against a stored hash
 */
function validateKey(inputKey, storedHash) {
  return hashKey(inputKey) === storedHash;
}

/**
 * Get or create a client ID
 */
function getClientId(ws) {
  if (!clientIds.has(ws)) {
    clientIds.set(ws, `client-${nextClientId++}`);
  }
  return clientIds.get(ws);
}

/**
 * Create a new room
 */
function createRoom(ws, name, key) {
  // Check max rooms limit
  if (rooms.size >= MAX_ROOMS) {
    return { error: 'MAX_ROOMS', message: 'Maximum 5 rooms reached. Please join an existing room.' };
  }

  // Check if client is already in a room
  if (clientRooms.has(ws)) {
    return { error: 'ALREADY_IN_ROOM', message: 'You are already in a room. Leave first.' };
  }

  const roomId = generateRoomId();
  const room = {
    id: roomId,
    name: name || 'Unnamed Room',
    keyHash: hashKey(key),
    broadcaster: ws,
    viewer: null,
    createdAt: Date.now(),
    cleanupTimer: null
  };

  rooms.set(roomId, room);
  clientRooms.set(ws, roomId);

  console.log(`Room created: ${roomId} (${room.name}) - Total rooms: ${rooms.size}`);
  broadcastRoomList();

  return { success: true, roomId, name: room.name, role: 'broadcaster' };
}

/**
 * Join an existing room
 */
function joinRoom(ws, roomId, key) {
  // Check if client is already in a room
  if (clientRooms.has(ws)) {
    return { error: 'ALREADY_IN_ROOM', message: 'You are already in a room. Leave first.' };
  }

  const room = rooms.get(roomId);

  if (!room) {
    return { error: 'ROOM_NOT_FOUND', message: 'Room does not exist.' };
  }

  if (!validateKey(key, room.keyHash)) {
    return { error: 'INVALID_KEY', message: 'Incorrect room key.' };
  }

  // Determine role
  let role;
  if (!room.broadcaster) {
    room.broadcaster = ws;
    role = 'broadcaster';
  } else if (!room.viewer) {
    room.viewer = ws;
    role = 'viewer';
  } else {
    return { error: 'ROOM_FULL', message: 'Room already has 2 participants.' };
  }

  // Clear cleanup timer if exists
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }

  clientRooms.set(ws, roomId);
  console.log(`Client joined room ${roomId} as ${role}`);
  broadcastRoomList();

  // Notify the other participant
  if (role === 'viewer' && room.broadcaster) {
    room.broadcaster.send(JSON.stringify({
      type: 'viewer-joined',
      viewerId: getClientId(ws)
    }));
  } else if (role === 'broadcaster' && room.viewer) {
    // Broadcaster reconnected, notify viewer
    room.viewer.send(JSON.stringify({ type: 'broadcaster-available' }));
  }

  return { success: true, roomId, name: room.name, role };
}

/**
 * Leave current room
 */
function leaveRoom(ws) {
  const roomId = clientRooms.get(ws);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) {
    clientRooms.delete(ws);
    return;
  }

  let wasBroadcaster = false;

  if (room.broadcaster === ws) {
    room.broadcaster = null;
    wasBroadcaster = true;
    console.log(`Broadcaster left room ${roomId}`);

    // Notify viewer
    if (room.viewer) {
      room.viewer.send(JSON.stringify({ type: 'broadcaster-left' }));
    }
  } else if (room.viewer === ws) {
    room.viewer = null;
    console.log(`Viewer left room ${roomId}`);

    // Notify broadcaster
    if (room.broadcaster) {
      room.broadcaster.send(JSON.stringify({
        type: 'viewer-left',
        viewerId: getClientId(ws)
      }));
    }
  }

  clientRooms.delete(ws);

  // Schedule cleanup if room is empty
  if (!room.broadcaster && !room.viewer) {
    room.cleanupTimer = setTimeout(() => {
      if (!room.broadcaster && !room.viewer) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} cleaned up - Total rooms: ${rooms.size}`);
        broadcastRoomList();
      }
    }, ROOM_CLEANUP_TIMEOUT);
  }

  broadcastRoomList();
}

/**
 * Get list of active rooms (without sensitive data)
 */
function getRoomList() {
  const list = [];
  for (const [id, room] of rooms) {
    const participants = (room.broadcaster ? 1 : 0) + (room.viewer ? 1 : 0);
    list.push({
      id,
      name: room.name,
      participants,
      isFull: participants >= 2
    });
  }
  return list;
}

/**
 * Broadcast room list to all connected clients
 */
function broadcastRoomList() {
  const roomList = getRoomList();
  const message = JSON.stringify({ type: 'room-list', rooms: roomList });

  wss.clients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

// ============================================
// HTTP Server
// ============================================

function requestHandler(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;

  // Remove query strings
  filePath = filePath.split('?')[0];

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

// ============================================
// WebSocket Server
// ============================================

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('New connection:', getClientId(ws));

  // Send current room list to new client
  ws.send(JSON.stringify({ type: 'room-list', rooms: getRoomList() }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleMessage(ws, message);
    } catch (e) {
      console.error('Invalid message:', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected:', getClientId(ws));
    leaveRoom(ws);
  });
});

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(ws, message) {
  switch (message.type) {
    // ============================================
    // Heartbeat
    // ============================================
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;

    // ============================================
    // Room Management
    // ============================================
    case 'create-room': {
      const result = createRoom(ws, message.name, message.key);
      if (result.error) {
        ws.send(JSON.stringify({ type: 'room-error', code: result.error, error: result.message }));
      } else {
        ws.send(JSON.stringify({
          type: 'room-created',
          roomId: result.roomId,
          name: result.name,
          role: result.role
        }));
      }
      break;
    }

    case 'join-room': {
      const result = joinRoom(ws, message.roomId, message.key);
      if (result.error) {
        ws.send(JSON.stringify({ type: 'room-error', code: result.error, error: result.message }));
      } else {
        ws.send(JSON.stringify({
          type: 'room-joined',
          roomId: result.roomId,
          name: result.name,
          role: result.role
        }));
      }
      break;
    }

    case 'leave-room':
      leaveRoom(ws);
      ws.send(JSON.stringify({ type: 'room-left' }));
      break;

    case 'get-room-list':
      ws.send(JSON.stringify({ type: 'room-list', rooms: getRoomList() }));
      break;

    // ============================================
    // WebRTC Signaling (within rooms)
    // ============================================
    case 'broadcaster-ready': {
      const roomId = clientRooms.get(ws);
      if (!roomId) break;

      const room = rooms.get(roomId);
      if (!room) break;

      // If there's a viewer waiting, notify broadcaster
      if (room.viewer) {
        ws.send(JSON.stringify({
          type: 'viewer-joined',
          viewerId: getClientId(room.viewer)
        }));
      }
      break;
    }

    case 'viewer-join': {
      const roomId = clientRooms.get(ws);
      if (!roomId) break;

      const room = rooms.get(roomId);
      if (!room) break;

      if (room.broadcaster) {
        room.broadcaster.send(JSON.stringify({
          type: 'viewer-joined',
          viewerId: getClientId(ws)
        }));
      } else {
        ws.send(JSON.stringify({ type: 'no-broadcaster' }));
      }
      break;
    }

    case 'offer': {
      const roomId = clientRooms.get(ws);
      if (!roomId) break;

      const room = rooms.get(roomId);
      if (!room || !room.viewer) break;

      room.viewer.send(JSON.stringify({
        type: 'offer',
        offer: message.offer
      }));
      break;
    }

    case 'answer': {
      const roomId = clientRooms.get(ws);
      if (!roomId) break;

      const room = rooms.get(roomId);
      if (!room || !room.broadcaster) break;

      room.broadcaster.send(JSON.stringify({
        type: 'answer',
        viewerId: getClientId(ws),
        answer: message.answer
      }));
      break;
    }

    case 'ice-candidate': {
      const roomId = clientRooms.get(ws);
      if (!roomId) break;

      const room = rooms.get(roomId);
      if (!room) break;

      if (ws === room.broadcaster && room.viewer) {
        // From broadcaster to viewer
        room.viewer.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: message.candidate
        }));
      } else if (ws === room.viewer && room.broadcaster) {
        // From viewer to broadcaster
        room.broadcaster.send(JSON.stringify({
          type: 'ice-candidate',
          viewerId: getClientId(ws),
          candidate: message.candidate
        }));
      }
      break;
    }

    default:
      console.log('Unknown message type:', message.type);
  }
}

// ============================================
// Start Server
// ============================================

server.listen(PORT, HOST, () => {
  const protocol = useHttps ? 'https' : 'http';
  console.log(`\n🚀 Server running at ${protocol}://${HOST}:${PORT}\n`);
  if (useHttps) {
    console.log('⚠️  Your browser will show a security warning for the self-signed certificate.');
    console.log('   Click "Advanced" → "Proceed" to continue.\n');
  }
});
