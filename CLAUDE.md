# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StreamHQ is a peer-to-peer screen streaming application built with WebRTC and WebSockets. It enables high-quality (up to 4K @ 60fps) screen sharing with system audio capture from a single broadcaster to multiple viewers (2-3 viewers supported).

## Commands

### Development
- `npm install` - Install dependencies (only `ws` package required)
- `npm start` or `npm run dev` - Start the server on port 3000 (or PORT environment variable)

### Testing the Application
1. Start server: `npm start`
2. Open broadcaster page: http://localhost:3000/broadcaster.html
3. Open viewer page(s): http://localhost:3000/viewer.html (on same or different devices)

## Architecture

### Three-Part System

1. **Server** (`server/server.js`)
   - HTTP/HTTPS server for serving static files
   - WebSocket server for signaling (connection coordination)
   - Auto-detects local IP address for LAN access
   - Supports optional HTTPS with self-signed certs in `certs/` directory
   - Tracks one broadcaster and multiple viewers using WeakMap for client IDs

2. **Broadcaster** (`public/js/broadcaster.js`)
   - Captures screen using `getDisplayMedia` API with high-quality settings
   - Creates separate RTCPeerConnection for each viewer
   - Sends video/audio tracks to all connected viewers
   - Preview shows local capture before streaming

3. **Viewer** (`public/js/viewer.js`)
   - Receives single RTCPeerConnection from broadcaster
   - Displays incoming stream in video element
   - Auto-reconnects on connection loss with retry logic

### Shared Module

**Signaling Client** (`public/js/signaling.js`)
- Reusable WebSocket wrapper used by both broadcaster and viewer
- Handles connection, reconnection (max 10 attempts with exponential backoff)
- Heartbeat mechanism (ping/pong every 30s) to detect dead connections
- Event-based message handling system

### WebRTC Signaling Flow

1. Broadcaster connects → sends `broadcaster-ready`
2. Viewer connects → sends `viewer-join`
3. Server notifies broadcaster → `viewer-joined` with viewerId
4. Broadcaster creates offer → sends to server for specific viewer
5. Viewer receives offer → creates answer → sends back
6. ICE candidates exchanged bidirectionally through server
7. Direct P2P connection established between broadcaster and each viewer

### Key Technical Details

- **WebRTC Configuration**: Uses Google STUN servers for NAT traversal (local network optimized; TURN server needed for internet deployment across NAT)
- **Stream Quality**: Configured for maximum quality in broadcaster.js (1920x1080 ideal, up to 4K, 60fps, system audio at 48kHz stereo)
- **Multi-viewer Support**: Broadcaster maintains Map of RTCPeerConnections keyed by viewerId
- **Connection Management**: Server uses `broadcaster` singleton and `viewers` Set to track connections
- **HTTPS Requirement**: Screen sharing APIs require HTTPS in production (localhost works with HTTP)

## File Structure

```
server/server.js          - Node.js server (HTTP/HTTPS + WebSocket signaling)
public/
  index.html              - Landing page with broadcaster/viewer links
  broadcaster.html        - Screen sharing interface
  viewer.html             - Stream viewing interface
  js/
    signaling.js          - Shared WebSocket client with reconnection
    broadcaster.js        - Screen capture and WebRTC streaming
    viewer.js             - Stream reception and playback
  css/style.css           - Shared styles
certs/                    - Optional SSL certificates (key.pem, cert.pem)
```

## Browser Compatibility

- Chrome/Edge recommended (best system audio support)
- Firefox has limited audio support
- Safari requires additional permissions
- All require HTTPS for screen capture (except localhost)

## Deployment Considerations

- For internet deployment, see DEPLOYMENT.md for platform-specific guides (Railway, Render, Fly.io, VPS, Cloudflare Tunnel)
- TURN server required for NAT traversal when broadcaster and viewers are on different networks
- SSL certificates needed for production (Let's Encrypt via Caddy/nginx, or platform auto-SSL)
