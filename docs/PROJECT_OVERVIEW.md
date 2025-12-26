# StreamHQ - Project Overview

A peer-to-peer screen streaming application for 1 broadcaster and 1-2 viewers.

## Tech Stack

- **Backend**: Node.js (vanilla, no framework)
- **Frontend**: Vanilla HTML/CSS/JS
- **Real-time**: WebRTC (peer-to-peer video/audio) + WebSocket (signaling)
- **Deployment**: Railway (auto-HTTPS)

## Architecture

```
┌─────────────────┐         WebSocket          ┌─────────────────┐
│   Broadcaster   │◄─────────signaling────────►│     Server      │
│   (browser)     │                            │   (Node.js)     │
└────────┬────────┘                            └────────▲────────┘
         │                                              │
         │ WebRTC (peer-to-peer)              WebSocket │
         │ Video + Audio                      signaling │
         ▼                                              │
┌─────────────────┐                            ┌────────┴────────┐
│     Viewer      │◄───────────────────────────│     Viewer      │
│   (browser)     │                            │   (browser)     │
└─────────────────┘                            └─────────────────┘
```

**Key insight**: Video/audio streams go directly between browsers (WebRTC). The server only handles connection setup (signaling).

## Project Structure

```
/
├── server/
│   └── server.js          # HTTP + WebSocket server, signaling logic
├── public/
│   ├── index.html         # Landing page (choose broadcaster/viewer)
│   ├── broadcaster.html   # Broadcaster UI
│   ├── viewer.html        # Viewer UI
│   ├── css/
│   │   └── style.css      # All styles (glassmorphism design)
│   └── js/
│       ├── signaling.js   # WebSocket client with heartbeat
│       ├── broadcaster.js # Screen capture + WebRTC sender
│       └── viewer.js      # WebRTC receiver + display
├── docs/
│   └── PROJECT_OVERVIEW.md
├── package.json
├── README.md
└── .gitignore
```

## Key Files

### `server/server.js`
- Creates HTTP server for static files
- Creates WebSocket server for signaling
- Routes messages between broadcaster and viewers
- Handles ping/pong for keep-alive

### `public/js/signaling.js`
- WebSocket client wrapper
- Heartbeat mechanism (30s ping, 10s timeout)
- Auto-reconnect on disconnect (up to 10 attempts)

### `public/js/broadcaster.js`
- Captures screen + system audio via `getDisplayMedia()`
- Creates RTCPeerConnection for each viewer
- Sends WebRTC offers through signaling server
- ICE restart on network disruption

### `public/js/viewer.js`
- Receives WebRTC offer, sends answer
- Displays incoming video/audio stream
- Auto-recovery on connection failure (3 retries)

## WebRTC Flow

1. Broadcaster calls `getDisplayMedia()` to capture screen
2. Viewer joins → server notifies broadcaster
3. Broadcaster creates RTCPeerConnection, adds tracks
4. Broadcaster creates offer → sends via signaling → viewer receives
5. Viewer creates answer → sends via signaling → broadcaster receives
6. ICE candidates exchanged → direct connection established
7. Video/audio flows peer-to-peer (no server relay)

## Reliability Features

| Feature | Implementation |
|---------|----------------|
| WebSocket keep-alive | Ping every 30s, reconnect on timeout |
| ICE restart | Triggered on network disruption |
| Auto-recovery | Viewer retries 3x on connection failure |
| Reconnect backoff | Exponential delay up to 5s |

## Configuration

### Video Quality (broadcaster.js)
```javascript
video: {
    width: { ideal: 1920, max: 3840 },
    height: { ideal: 1080, max: 2160 },
    frameRate: { ideal: 60, max: 60 }
}
```

### Audio (broadcaster.js)
```javascript
audio: {
    echoCancellation: false,
    noiseSuppression: false,
    sampleRate: 48000,
    channelCount: 2
}
```

### ICE Servers (broadcaster.js, viewer.js)
```javascript
iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
]
```

## Environment

- `PORT`: Server port (default: 3000)
- Development: `npm start`
- Production: Deployed on Railway (auto-detects Node.js)

## Browser Requirements

- **Chrome/Edge**: Best support for system audio capture
- **Firefox**: Limited audio support
- **Safari**: Requires webkit prefixes for fullscreen
- **Mobile**: Touch event handlers for fullscreen button
