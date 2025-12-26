# Deployment Guide - StreamHQ

✅ **Currently deployed on Railway**

---

## Your Deployment

Your app is live at Railway with automatic HTTPS. Access it at:
- **Home**: `https://your-app.railway.app/`
- **Broadcaster**: `https://your-app.railway.app/broadcaster.html`
- **Viewer**: `https://your-app.railway.app/viewer.html`

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
- **Fix**: Railway provides HTTPS automatically ✅

### Audio doesn't play automatically
- **Cause**: Browser autoplay policy
- **Fix**: Users need to click anywhere on the page first

### Connection fails / times out
- **Cause**: NAT/firewall blocking WebRTC
- **Fix**: Add a TURN server (see above)

### "No broadcaster" message
- **Cause**: Broadcaster hasn't started sharing yet
- **Fix**: Open broadcaster page and click "Start Broadcasting" first

---

## Updating Your Deployment

To push updates to Railway:

```bash
git add .
git commit -m "Your update message"
git push origin main
```

Railway will automatically redeploy.

---

## Resource Usage

For your use case (1 broadcaster, 1-2 viewers):

| Resource | Usage |
|----------|-------|
| **Server CPU** | <1% (signaling only) |
| **Server RAM** | ~50MB |
| **Server Bandwidth** | ~10KB/min (signaling) |
| **Peer Bandwidth** | 5-15 Mbps per viewer (peer-to-peer) |

The video stream goes directly between broadcaster and viewers.
