# Chat Notification Feature Specification

## Overview

Add a **pop-up notification** in the top-right corner when a new chat message arrives, but **only when the chat panel is closed**. If the chat panel is open, no notification is shown.

## Requirements Summary

| Requirement | Value |
|-------------|-------|
| Notification Position | Top right corner |
| Trigger | Incoming `chat-broadcast` message |
| Condition | Only when chat panel is **closed** (`isChatOpen === false`) |
| Exclude Own Messages | Yes (only notify for messages from others) |
| Auto-dismiss | After 4 seconds |
| Click to Dismiss | Yes |
| Click to Open Chat | Optional enhancement |

---

## User Flow

### Notification Behavior

```
Scenario: Chat Panel Closed
┌─────────────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────┐                                │
│  │ 💬 New Message               │  ← Notification appears        │
│  │ 📡 Broadcaster: Hello!       │    (auto-dismiss after 4s)     │
│  └──────────────────────────────┘                                │
│                                                                   │
│ ┌───────────────────────────────────────────────────────┐ ┌────┐ │
│ │                                                       │ │ 💬 │ │
│ │              VIDEO AREA                               │ │    │ │
│ │                                                       │ │    │ │
│ └───────────────────────────────────────────────────────┘ └────┘ │
└─────────────────────────────────────────────────────────────────┘

Scenario: Chat Panel Open → No notification (user already sees messages)
```

### Message Decision Flow

```
┌─────────────────────────────┐
│ Receive chat-broadcast      │
│ from WebSocket              │
└──────────────┬──────────────┘
               │
               ▼
       ┌───────────────┐
       │ Is it my own  │──── Yes ──→ No notification
       │ message?      │             (just add to chat)
       └───────┬───────┘
               │ No
               ▼
       ┌───────────────┐
       │ Is chat panel │──── Yes ──→ No notification
       │ open?         │             (user sees it live)
       └───────┬───────┘
               │ No
               ▼
       ┌───────────────┐
       │ Show popup    │
       │ notification  │
       └───────────────┘
```

---

## UI/UX Design

### Notification Component

```
┌────────────────────────────────────┐
│ 💬 New Message               [✕]  │  ← Header
├────────────────────────────────────┤
│ 📡 Broadcaster                     │  ← Sender
│ Hey, can you see the stream?       │  ← Message preview (truncated)
└────────────────────────────────────┘
```

### Notification Styling

| Property | Value |
|----------|-------|
| Position | Fixed, top: 1.5rem, right: 1.5rem |
| Width | 320px (300px on mobile) |
| Background | Glassmorphism (same as other UI elements) |
| Border | Accent gradient border |
| Animation | Slide in from right + fade in |
| Z-index | 1000 (above other elements) |
| Max message length | 100 chars (truncated with ...) |

### Animation

```css
/* Enter animation */
@keyframes notification-slide-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Exit animation */
@keyframes notification-slide-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
```

---

## Architecture

### State Management

No new state variables needed. Uses existing `isChatOpen` variable to determine notification visibility.

### Event Flow

1. Server sends `chat-broadcast` to client
2. Client receives message in `setupSignalingHandlers()`
3. Existing code calls `addChatMessage()` to update chat panel
4. **New code**: Check if notification should be shown:
   - If sender !== roomRole (not own message) AND
   - If `!isChatOpen` (chat is closed)
   - Then call `showChatNotification(sender, message)`
5. Notification auto-dismisses after 4 seconds

---

## File Changes Required

### Modified Files

| File | Changes |
|------|---------|
| `public/room.html` | Add notification container HTML |
| `public/js/room.js` | Add `showChatNotification()` function, modify `chat-broadcast` handler |
| `public/css/style.css` | Add notification styles and animations |

---

## Implementation Details

### 1. HTML Structure (`room.html`)

Add notification container after the toast element:

```html
<!-- Chat notification popup -->
<div id="chat-notification" class="chat-notification hidden">
    <div class="chat-notification-header">
        <span class="chat-notification-title">💬 New Message</span>
        <button id="chat-notification-close" class="chat-notification-close">✕</button>
    </div>
    <div class="chat-notification-body">
        <span id="chat-notification-sender" class="chat-notification-sender"></span>
        <p id="chat-notification-text" class="chat-notification-text"></p>
    </div>
</div>
```

### 2. JavaScript Logic (`room.js`)

Add `showChatNotification()` function:

```javascript
// DOM elements to add
const chatNotification = document.getElementById('chat-notification');
const chatNotificationSender = document.getElementById('chat-notification-sender');
const chatNotificationText = document.getElementById('chat-notification-text');
const chatNotificationClose = document.getElementById('chat-notification-close');

let notificationTimeout = null;

/**
 * Show chat notification popup for new message
 */
function showChatNotification(sender, message) {
    // Clear any existing timeout
    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
    }

    // Set content
    const senderLabel = sender === 'broadcaster' ? '📡 Broadcaster' : '👁️ Viewer';
    chatNotificationSender.textContent = senderLabel;
    
    // Truncate message if too long
    const truncatedMessage = message.length > 100 
        ? message.substring(0, 100) + '...' 
        : message;
    chatNotificationText.textContent = truncatedMessage;

    // Show notification
    chatNotification.classList.remove('hidden');
    chatNotification.classList.add('visible');

    // Auto-dismiss after 4 seconds
    notificationTimeout = setTimeout(() => {
        dismissChatNotification();
    }, 4000);
}

/**
 * Dismiss chat notification
 */
function dismissChatNotification() {
    chatNotification.classList.remove('visible');
    chatNotification.classList.add('hidden');
    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
        notificationTimeout = null;
    }
}
```

Modify the `chat-broadcast` handler in `setupSignalingHandlers()`:

```javascript
signaling.on('chat-broadcast', (message) => {
    addChatMessage(message.sender, message.message, message.timestamp);
    
    // Show notification if chat is closed and message is from someone else
    if (!isChatOpen && message.sender !== roomRole) {
        showChatNotification(message.sender, message.message);
    }
});
```

### 3. CSS Styles (`style.css`)

Add notification styles:

```css
/* ========================================== 
   Chat Notification Popup
   ========================================== */
.chat-notification {
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  width: 320px;
  background: var(--bg-glass);
  border: 1px solid var(--border-glass);
  border-radius: 1rem;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  overflow: hidden;
  animation: notification-slide-in 0.3s ease-out;
}

.chat-notification.hidden {
  display: none;
}

.chat-notification.visible {
  display: block;
  animation: notification-slide-in 0.3s ease-out;
}

.chat-notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, 
    rgba(139, 92, 246, 0.2), 
    rgba(59, 130, 246, 0.2));
  border-bottom: 1px solid var(--border-glass);
}

.chat-notification-title {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.chat-notification-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 1rem;
  padding: 0.25rem;
  transition: color 0.2s ease;
}

.chat-notification-close:hover {
  color: var(--text-primary);
}

.chat-notification-body {
  padding: 1rem;
}

.chat-notification-sender {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent-primary);
  margin-bottom: 0.5rem;
}

.chat-notification-text {
  font-size: 0.875rem;
  color: var(--text-primary);
  line-height: 1.4;
  margin: 0;
  word-wrap: break-word;
}

@keyframes notification-slide-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Mobile responsive */
@media (max-width: 768px) {
  .chat-notification {
    width: calc(100% - 2rem);
    right: 1rem;
    top: 1rem;
  }
}
```

---

## Edge Cases & Handling

| Scenario | Handling |
|----------|----------|
| Multiple rapid messages | Each new message replaces the previous notification, resets timer |
| User opens chat while notification shown | Notification should dismiss when chat opens |
| Very long message | Truncate to 100 characters with ellipsis |
| User is broadcaster, receives viewer's message | Show notification if chat closed |
| User is viewer, receives broadcaster's message | Show notification if chat closed |
| Own message received via broadcast | No notification (already sent by user) |

---

## Verification Plan

### Manual Testing

1. **Setup**: Open the app in two browser windows (one as broadcaster, one as viewer)
2. **Test 1 - Basic notification**:
   - Close chat panel on viewer side
   - Send message from broadcaster
   - Verify notification appears in top-right on viewer side
   - Verify notification auto-dismisses after 4 seconds
3. **Test 2 - No notification when chat open**:
   - Open chat panel on viewer side
   - Send message from broadcaster
   - Verify NO notification popup (message appears in chat panel instead)
4. **Test 3 - No notification for own messages**:
   - Close chat panel on broadcaster side
   - Send message from broadcaster
   - Verify NO notification on broadcaster side
5. **Test 4 - Dismiss on click**:
   - Close chat panel
   - Trigger notification
   - Click the X button
   - Verify notification dismisses immediately
6. **Test 5 - Mobile responsive**:
   - Resize window to mobile width
   - Verify notification adapts to full width

---

## Implementation Phases

### Phase 1: HTML Structure
- [ ] Add notification container to `room.html`

### Phase 2: CSS Styles
- [ ] Add notification styles to `style.css`
- [ ] Add slide-in animation
- [ ] Add mobile responsive styles

### Phase 3: JavaScript Logic
- [ ] Add DOM element references
- [ ] Add `showChatNotification()` function
- [ ] Add `dismissChatNotification()` function
- [ ] Modify `chat-broadcast` handler with notification logic
- [ ] Add close button event listener
- [ ] Dismiss notification when opening chat

---

## Future Enhancements (Out of Scope)

- Sound notification option
- Stacking multiple notifications
- Notification settings/preferences
- "Click to open chat" functionality
- Notification badge on chat toggle button
