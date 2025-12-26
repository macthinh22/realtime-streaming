# Deployment Guide - StreamHQ

This guide covers deploying your streaming application for internet access with 1-2 viewers.

---

## Quick Reference

| Platform | Difficulty | Cost | HTTPS | Best For |
|----------|------------|------|-------|----------|
| **Railway** | Easy | Free tier | Auto | Quick deployment |
| **Render** | Easy | Free tier | Auto | Quick deployment |
| **Fly.io** | Medium | Free tier | Auto | Global edge |
| **VPS + Caddy** | Medium | ~$5/mo | Auto | Full control |
| **Cloudflare Tunnel** | Medium | Free | Auto | Home server |

---

## Option 1: Railway (Recommended - Easiest)

Railway provides automatic HTTPS and simple deployment.

### Steps

1. **Push your code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   # Create a repo on github.com, then:
   git remote add origin https://github.com/YOUR_USERNAME/streamhq.git
   git push -u origin main
   ```

2. **Deploy on Railway**
   - Go to [railway.app](https://railway.app) and sign in with GitHub
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Railway auto-detects Node.js and deploys

3. **Configure environment**
   - Go to your project → Settings → Networking
   - Click "Generate Domain" (gives you a `*.railway.app` URL)
   - Your app is now live with HTTPS!

4. **Access your app**
   ```
   https://your-app.railway.app/          → Home page
   https://your-app.railway.app/broadcast → Broadcaster
   https://your-app.railway.app/viewer    → Viewer
   ```

---

## Option 4: Cloudflare Tunnel (Run from Home)

Access your home computer from anywhere without port forwarding.

### Steps

1. **Create Cloudflare account** and add a domain (free plan works)

2. **Install cloudflared**
   ```bash
   # macOS
   brew install cloudflare/cloudflare/cloudflared
   
   # Linux
   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
   chmod +x cloudflared
   sudo mv cloudflared /usr/local/bin/
   ```

3. **Authenticate**
   ```bash
   cloudflared tunnel login
   ```

4. **Create tunnel**
   ```bash
   cloudflared tunnel create streamhq
   ```

5. **Configure tunnel** (`~/.cloudflared/config.yml`)
   ```yaml
   tunnel: YOUR_TUNNEL_ID
   credentials-file: ~/.cloudflared/YOUR_TUNNEL_ID.json
   
   ingress:
     - hostname: stream.yourdomain.com
       service: http://localhost:3000
     - service: http_status:404
   ```

6. **Add DNS record**
   ```bash
   cloudflared tunnel route dns streamhq stream.yourdomain.com
   ```

7. **Run tunnel (keep open)**
   ```bash
   # Terminal 1: Run your app
   npm start
   
   # Terminal 2: Run tunnel
   cloudflared tunnel run streamhq
   ```

---

## TURN Server Setup (Optional)

If connections fail through strict firewalls, add a TURN server.

### Using Metered.ca (Free Tier)

1. Sign up at [metered.ca/stun-turn](https://www.metered.ca/stun-turn)
2. Get your credentials from the dashboard
3. Update `public/js/broadcaster.js` and `public/js/viewer.js`:

```javascript
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
            urls: 'turn:YOUR_SERVER.metered.ca:80',
            username: 'YOUR_USERNAME',
            credential: 'YOUR_CREDENTIAL'
        },
        {
            urls: 'turn:YOUR_SERVER.metered.ca:443',
            username: 'YOUR_USERNAME',
            credential: 'YOUR_CREDENTIAL'
        }
    ]
};
```

---

## Troubleshooting

### Screen sharing doesn't work
- **Cause**: Not using HTTPS
- **Fix**: Deploy with one of the options above (all provide HTTPS)

### Audio doesn't play automatically
- **Cause**: Browser autoplay policy
- **Fix**: Users need to click anywhere on the page first, or allow autoplay for your domain in browser settings

### Connection fails / times out
- **Cause**: NAT/firewall blocking WebRTC
- **Fix**: Add a TURN server (see above)

### "No broadcaster" message
- **Cause**: Broadcaster hasn't started sharing yet
- **Fix**: Open broadcaster page and click "Start Broadcasting" first

---

## Security Considerations

1. **No authentication**: Anyone with the URL can watch or broadcast
   - For private use, keep the URL secret
   - For production, add basic auth or login

2. **WebSocket**: No message validation beyond JSON parsing
   - Fine for personal use with 2-3 trusted users

3. **HTTPS**: Required for WebRTC security
   - All recommended deployment options provide this automatically

---

## Resource Usage

For your use case (1 broadcaster, 1-2 viewers):

| Resource | Usage |
|----------|-------|
| **Server CPU** | <1% (signaling only) |
| **Server RAM** | ~50MB |
| **Server Bandwidth** | ~10KB/min (signaling) |
| **Peer Bandwidth** | 5-15 Mbps per viewer (video goes peer-to-peer) |

The video stream goes directly between broadcaster and viewers, so your server just handles the initial connection setup.
