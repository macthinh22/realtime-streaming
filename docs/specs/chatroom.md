# Chatroom Feature Specification

## Overview

Add a **toggleable chatroom panel** on the right side of the room page. Messages are ephemeral (no database storage) and only visible to participants currently in the room.

## Requirements Summary

| Requirement | Value |
|-------------|-------|
| Storage | None (in-memory only) |
| Message persistence | Session only (lost on page refresh) |
| Max participants | 2 (same as room limit) |
| Toggle state | Remembered in localStorage |

---

## User Flow

### Chat Toggle Behavior

```
┌─────────────────────────────────────────────────────────────────┐
│ Room View (Chat Collapsed)                                       │
│ ┌──────────────────────────────────────────────────────┐ ┌────┐ │
│ │                                                      │ │ 💬 │ │
│ │              VIDEO AREA                              │ │    │ │
│ │              (full width)                            │ │    │ │
│ │                                                      │ │    │ │
│ └──────────────────────────────────────────────────────┘ └────┘ │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Room View (Chat Expanded)                                        │
│ ┌────────────────────────────────────┐ ┌──────────────────────┐ │
│ │                                    │ │ Chat            [✕]  │ │
│ │          VIDEO AREA                │ ├──────────────────────┤ │
│ │          (shrinks)                 │ │ User1: Hello!        │ │
│ │                                    │ │ User2: Hi there      │ │
│ │                                    │ │                      │ │
│ │                                    │ ├──────────────────────┤ │
│ │                                    │ │ [Type message...][➤] │ │
│ └────────────────────────────────────┘ └──────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Message Flow

1. User types message in input field
2. Presses Enter or clicks Send button
3. Message sent via WebSocket to server
4. Server broadcasts to all room participants
5. Message appears in all clients' chat panels

---

## Architecture

### Message Data Model

```javascript
// Chat message structure
{
  type: 'chat-message',
  roomId: 'room-a1b2c3',
  sender: 'broadcaster',  // or 'viewer'
  message: 'Hello!',
  timestamp: 1703686800000
}
```

### Message Protocol Extensions

| Message Type | Direction | Payload | Description |
|--------------|-----------|---------|-------------|
| `chat-message` | Client → Server | `{ message }` | Send a chat message |
| `chat-broadcast` | Server → Client | `{ sender, message, timestamp }` | Broadcast message to room |

---

## UI/UX Design

### Chat Panel Components

```
┌──────────────────────────┐
│ 💬 Chat            [✕]   │  ← Header with close button
├──────────────────────────┤
│                          │
│  ┌────────────────────┐  │
│  │ 📡 Broadcaster     │  │  ← Message bubble (them)
│  │ Hey, can you see?  │  │
│  │            10:30 AM│  │
│  └────────────────────┘  │
│                          │
│     ┌────────────────┐   │
│     │ You            │   │  ← Message bubble (you)
│     │ Yes, looks good│   │
│     │ 10:31 AM       │   │
│     └────────────────┘   │
│                          │
├──────────────────────────┤
│ ┌──────────────────┐ [➤] │  ← Input area
│ │ Type a message...│     │
│ └──────────────────┘     │
└──────────────────────────┘
```

### Toggle Button

- Position: Fixed on right edge of video container
- Icon: 💬 (chat bubble)
- Badge: Unread count when collapsed (optional enhancement)
- Animation: Slide in/out

### Responsive Behavior

| Screen Size | Behavior |
|-------------|----------|
| Desktop (>768px) | Side panel, video shrinks |
| Mobile (<768px) | Overlay panel, full width |

---

## File Changes Required

### Server (`server/server.js`)

| Change | Description |
|--------|-------------|
| Add `chat-message` handler | Receive and broadcast messages |
| Validate sender is in room | Security check before broadcast |

### Modified Files

| File | Changes |
|------|---------|
| `public/room.html` | Add chat panel HTML structure |
| `public/js/room.js` | Add chat toggle logic and message handling |
| `public/css/style.css` | Add chat panel styles |

---

## Implementation Phases

### Phase 1: Server-Side Chat Relay
- [ ] Add `chat-message` handler in `handleMessage()`
- [ ] Broadcast `chat-broadcast` to room participants
- [ ] Validate sender is in the room

### Phase 2: Chat Panel UI
- [ ] Add chat panel HTML to `room.html`
- [ ] Add toggle button on video container
- [ ] Style chat panel in `style.css`
- [ ] Responsive design for mobile

### Phase 3: Client-Side Logic
- [ ] Toggle show/hide with localStorage persistence
- [ ] Send messages via WebSocket
- [ ] Receive and display messages
- [ ] Auto-scroll to latest message

### Phase 4: Polish
- [ ] Message timestamps
- [ ] Visual distinction for own vs. other messages
- [ ] Empty state when no messages
- [ ] Enter key to send

---

## Edge Cases & Handling

| Scenario | Handling |
|----------|----------|
| User refreshes page | Chat history lost (by design) |
| Other participant leaves | Show system message "User left" |
| Long messages | Word wrap, max length 500 chars |
| Rapid messages | No rate limiting (trusted 2-user environment) |
| Empty message | Don't send, no error shown |

---

## API Summary

### Send Message
```javascript
// Client sends:
{ type: 'chat-message', message: 'Hello!' }

// Server broadcasts to room:
{ type: 'chat-broadcast', sender: 'broadcaster', message: 'Hello!', timestamp: 1703686800000 }
```

---

## Future Enhancements (Out of Scope)

- Message persistence with database
- Typing indicators
- Emoji picker
- File/image sharing
- Unread message badge
