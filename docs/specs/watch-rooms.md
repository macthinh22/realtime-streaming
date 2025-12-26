# Watch Rooms Feature Specification

## Overview

Transform StreamHQ from a single-broadcaster model to a **multi-room** architecture where users can create or join private streaming rooms. Each room has its own broadcaster and viewer with key-based authentication.

## Requirements Summary

| Requirement | Value |
|-------------|-------|
| Maximum rooms | 5 |
| Max users per room | 2 (1 broadcaster + 1 viewer) |
| Authentication | Room key (password) |

---

## User Flow

### Landing Page Flow

```
┌─────────────────────────────────────────────────────┐
│                     StreamHQ                         │
│                                                      │
│  ┌─────────────────┐      ┌─────────────────┐       │
│  │  Create Room    │      │   Join Room     │       │
│  │                 │      │                 │       │
│  │  [Room Name]    │      │  [Room ID]      │       │
│  │  [Room Key]     │      │  [Room Key]     │       │
│  │                 │      │                 │       │
│  │  [Create →]     │      │  [Join →]       │       │
│  └─────────────────┘      └─────────────────┘       │
│                                                      │
│  ─────────────────────────────────────────────────  │
│                   Active Rooms (3/5)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Room A   │  │ Room B   │  │ Room C   │          │
│  │ 🔒 1/2   │  │ 🔒 2/2   │  │ 🔒 1/2   │          │
│  │ [Join]   │  │ [Full]   │  │ [Join]   │          │
│  └──────────┘  └──────────┘  └──────────┘          │
└─────────────────────────────────────────────────────┘
```

### Create Room Flow

1. User enters **Room Name** (display name) and **Room Key** (password)
2. System generates unique **Room ID** (e.g., `room-a1b2c3`)
3. User becomes the **Broadcaster** for that room
4. User can share the Room ID + Key with a friend to join

### Join Room Flow

1. User enters **Room ID** and **Room Key**
2. System validates:
   - Room exists
   - Key matches
   - Room is not full (< 2 users)
3. User joins as **Viewer**

---

## Architecture

### Room Data Model

```javascript
// Server-side room state
const rooms = new Map();

// Room structure
{
  id: 'room-a1b2c3',          // Unique room ID
  name: 'My Watch Party',      // Display name
  keyHash: 'sha256...',        // Hashed room key (never store plaintext)
  broadcaster: WebSocket,      // Broadcaster connection (or null)
  viewer: WebSocket,           // Viewer connection (or null)
  createdAt: Date,             // For cleanup of stale rooms
}
```

### Message Protocol Extensions

New WebSocket message types:

| Message Type | Direction | Payload | Description |
|--------------|-----------|---------|-------------|
| `create-room` | Client → Server | `{ name, key }` | Create a new room |
| `room-created` | Server → Client | `{ roomId, name }` | Room created successfully |
| `join-room` | Client → Server | `{ roomId, key }` | Join existing room |
| `room-joined` | Server → Client | `{ roomId, name, role }` | Joined as broadcaster/viewer |
| `room-error` | Server → Client | `{ error, code }` | Error message |
| `room-list` | Server → Client | `{ rooms: [...] }` | List of active rooms |
| `room-updated` | Server → Client | `{ roomId, ... }` | Room state changed |
| `leave-room` | Client → Server | `{}` | Leave current room |

### Error Codes

| Code | Message |
|------|---------|
| `ROOM_NOT_FOUND` | Room does not exist |
| `INVALID_KEY` | Incorrect room key |
| `ROOM_FULL` | Room already has 2 participants |
| `MAX_ROOMS` | Maximum 5 rooms reached |
| `ALREADY_IN_ROOM` | User already in a room |

---

## Security Considerations

### Room Key Handling

1. **Client-side**: Key is sent only during create/join, never stored in URL
2. **Server-side**: 
   - Hash the key using SHA-256 before storing
   - Compare hashed values, never plaintext
   - Rate limit join attempts (max 5 per minute per IP)

```javascript
// Example key hashing (server-side)
const crypto = require('crypto');

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function validateKey(inputKey, storedHash) {
  return hashKey(inputKey) === storedHash;
}
```

### Room ID Generation

- Use cryptographically random IDs: `room-${crypto.randomBytes(4).toString('hex')}`
- Short enough to share easily, long enough to prevent guessing

---

## UI/UX Design

### New Pages Required

1. **`/index.html`** (Modified) - Room lobby with create/join forms
2. **`/room.html`** (New) - Room view page (replaces broadcaster.html & viewer.html for room context)

### Room Lobby UI Elements

```
┌─────────────────────────────────────────────────────┐
│ HEADER                                              │
│   StreamHQ Logo                                     │
│   "Private streaming rooms"                         │
├─────────────────────────────────────────────────────┤
│ CREATE ROOM CARD                                    │
│   📡 Create a Room                                  │
│   [Room Name input]                                 │
│   [Room Key input] (password field)                 │
│   [Create Room] button                              │
├─────────────────────────────────────────────────────┤
│ JOIN ROOM CARD                                      │
│   👁️ Join a Room                                   │
│   [Room ID input]                                   │
│   [Room Key input] (password field)                 │
│   [Join Room] button                                │
├─────────────────────────────────────────────────────┤
│ ACTIVE ROOMS SECTION                                │
│   "Active Rooms (3/5)"                              │
│   [Room card] [Room card] [Room card]               │
│   Each shows: name, status (🔒), capacity (1/2)    │
└─────────────────────────────────────────────────────┘
```

### Room Page UI

```
┌─────────────────────────────────────────────────────┐
│ HEADER                                              │
│   Room: "My Watch Party"   Room ID: room-a1b2c3     │
│   [Copy ID] [Leave Room]                            │
├─────────────────────────────────────────────────────┤
│ VIDEO AREA                                          │
│   (Same as current broadcaster/viewer page)         │
│   Shows preview if broadcaster                      │
│   Shows stream if viewer                            │
├─────────────────────────────────────────────────────┤
│ CONTROLS                                            │
│   Broadcaster: [Start/Stop] [Fullscreen]            │
│   Viewer: [Fullscreen]                              │
├─────────────────────────────────────────────────────┤
│ STATUS BAR                                          │
│   Connection status                                 │
│   Participants: 2/2                                 │
└─────────────────────────────────────────────────────┘
```

---

## File Changes Required

### Server (`server/server.js`)

| Change | Description |
|--------|-------------|
| Add `rooms` Map | Store room state |
| Add room management functions | `createRoom()`, `joinRoom()`, `leaveRoom()`, `listRooms()` |
| Modify `handleMessage()` | Handle new message types |
| Add key validation | Hash comparison for authentication |
| Add cleanup logic | Remove empty rooms after timeout |

### New Files

| File | Description |
|------|-------------|
| `public/room.html` | Room page (unified broadcaster/viewer) |
| `public/js/room.js` | Room-specific logic |
| `public/js/lobby.js` | Lobby page logic (create/join) |

### Modified Files

| File | Changes |
|------|---------|
| `public/index.html` | Replace with room lobby UI |
| `public/js/signaling.js` | Add room-related message handlers |
| `public/css/style.css` | Add lobby and room-specific styles |

### Keep Original (for backwards compatibility)

| File | Note |
|------|------|
| `public/broadcaster.html` | Keep as standalone option |
| `public/viewer.html` | Keep as standalone option |

---

## Implementation Phases

### Phase 1: Server-Side Room Management
- [ ] Add room data structure and storage
- [ ] Implement room creation with key hashing
- [ ] Implement room joining with key validation
- [ ] Add room listing endpoint
- [ ] Handle room cleanup on disconnect

### Phase 2: Room Lobby UI
- [ ] Redesign index.html as room lobby
- [ ] Create room form UI
- [ ] Join room form UI
- [ ] Active rooms display
- [ ] Lobby JavaScript logic

### Phase 3: Room Page
- [ ] Create room.html (unified broadcaster/viewer)
- [ ] Implement room.js with role-based UI
- [ ] Integrate with existing WebRTC logic
- [ ] Add room info display and leave button

### Phase 4: Polish & Testing
- [ ] Error handling and user feedback
- [ ] Rate limiting for security
- [ ] Mobile responsiveness
- [ ] Cross-browser testing

---

## Edge Cases & Handling

| Scenario | Handling |
|----------|----------|
| Broadcaster disconnects | Notify viewer, keep room for 60s for reconnect |
| Viewer disconnects | Broadcaster continues, room stays open |
| Both disconnect | Remove room after 60s timeout |
| Room key forgotten | No recovery (must create new room) |
| Max rooms reached | Show error, suggest joining existing room |
| Invalid room ID format | Validate format before server request |

---

## API Summary

### Create Room
```javascript
// Client sends:
{ type: 'create-room', name: 'My Room', key: 'secretkey123' }

// Server responds:
{ type: 'room-created', roomId: 'room-a1b2c3', name: 'My Room' }
// or
{ type: 'room-error', code: 'MAX_ROOMS', error: 'Maximum 5 rooms reached' }
```

### Join Room
```javascript
// Client sends:
{ type: 'join-room', roomId: 'room-a1b2c3', key: 'secretkey123' }

// Server responds:
{ type: 'room-joined', roomId: 'room-a1b2c3', name: 'My Room', role: 'viewer' }
// or
{ type: 'room-error', code: 'INVALID_KEY', error: 'Incorrect room key' }
```

### List Rooms
```javascript
// Server broadcasts to all connected clients periodically or on change:
{ 
  type: 'room-list', 
  rooms: [
    { id: 'room-a1b2c3', name: 'My Room', participants: 1, isFull: false },
    { id: 'room-d4e5f6', name: 'Other Room', participants: 2, isFull: true }
  ]
}
```

---

## Future Enhancements (Out of Scope)

- Room expiration (auto-delete after X hours)
- Room owner can kick viewer
- Chat feature within room
- Multiple viewers per room (upgrade capacity)
- Room persistence (database storage)
