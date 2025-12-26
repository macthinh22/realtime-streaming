# StreamHQ - High-Quality Screen Streaming

A simple peer-to-peer screen streaming application with maximum quality and system audio support.

## Features

- 🎬 **High-quality streaming** - Up to 4K resolution at 60fps
- 🔊 **System audio capture** - Share audio from your computer
- ⚡ **Low latency** - Direct peer-to-peer WebRTC connection
- 🌐 **Browser-based** - No installation required
- 👥 **Multi-viewer** - Support for 2-3 viewers

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Then open http://localhost:3000 in your browser.

## Usage

1. **Broadcaster**: Click "Start Broadcasting" → Select screen → Check "Share audio"
2. **Viewer**: Open http://localhost:3000 on another device → Click "Watch Stream"

## Browser Requirements

- **Chrome/Edge** (recommended) - Best support for system audio
- Firefox - Limited audio support
- Safari - May require additional permissions

## Network

This works best on the same local network. For internet use across NAT, you would need to add a TURN server.

## Deployment

For deploying to the internet, see **[DEPLOYMENT.md](./DEPLOYMENT.md)** for a comprehensive guide covering:
- Railway, Render, Fly.io (free tiers, auto-HTTPS)
- VPS with Caddy (custom domain)
- Cloudflare Tunnel (run from home)
- TURN server setup

## Tech Stack

- WebRTC for peer-to-peer streaming
- WebSocket for signaling
- Node.js server
