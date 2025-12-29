# Broadcaster Audio Echo Fix Specification

## Overview

Fix the **audio echo/duplication issue** when the broadcaster is screen sharing content with system audio. Currently, the broadcaster hears audio twice: once from the original source (e.g., a music tab) and again from the local preview playing back the captured stream.

## Problem Description

### Current Behavior

When a broadcaster shares their screen with system audio enabled:

```
┌─────────────────────────────────────────────────────────────────┐
│                      BROADCASTER'S COMPUTER                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────┐        ┌─────────────────────────────┐    │
│   │   Music Tab     │───────▶│   System Audio Output       │    │
│   │   (YouTube)     │        │   (Speakers/Headphones)     │◀───┼── Sound 1 (Original)
│   └─────────────────┘        └─────────────────────────────┘    │
│           │                              ▲                       │
│           │                              │                       │
│           ▼                              │                       │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │          Screen Capture API                              │   │
│   │          (getDisplayMedia with systemAudio: 'include')   │   │
│   └─────────────────────────────┬───────────────────────────┘   │
│                                  │                               │
│                                  ▼                               │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │          Local Preview Video Element                     │   │
│   │          video.srcObject = localStream                   │───┼── Sound 2 (Echo!)
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### User Experience Issue

| Source | What Broadcaster Hears |
|--------|------------------------|
| Music tab (original) | ✓ Music playing |
| Local preview video element | ✓ Same music (captured and played back) |
| **Result** | ❌ **Double audio / Echo effect** |

### Why This Happens

1. The broadcaster starts screen sharing with `systemAudio: 'include'`
2. The captured stream (`localStream`) includes both video and system audio
3. In `startBroadcasting()`, the local video element displays the stream: `video.srcObject = localStream`
4. The video element **plays the audio track** by default, creating a duplicate

---

## Requirements Summary

| Requirement | Value |
|-------------|-------|
| Fix Location | Broadcaster's local preview video element |
| Solution | Mute local preview (video.muted = true) |
| Viewer Impact | None (viewers should still hear audio normally) |
| Backwards Compatible | Yes |

---

## Solution

### Root Cause

The `<video>` element is not muted when displaying the local stream preview on the broadcaster side.

### Fix

Mute the local preview video element when setting `srcObject` in `startBroadcasting()`:

```javascript
// Show preview (muted to prevent audio echo)
video.srcObject = localStream;
video.muted = true;  // <-- ADD THIS LINE
placeholder.style.display = 'none';
```

### Why This Works

```
┌─────────────────────────────────────────────────────────────────┐
│                      BROADCASTER'S COMPUTER                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────┐        ┌─────────────────────────────┐    │
│   │   Music Tab     │───────▶│   System Audio Output       │    │
│   │   (YouTube)     │        │   (Speakers/Headphones)     │◀───┼── Sound 1 (Original) ✓
│   └─────────────────┘        └─────────────────────────────┘    │
│           │                                                      │
│           ▼                                                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │          Screen Capture (systemAudio: 'include')         │   │
│   └─────────────────────────────┬───────────────────────────┘   │
│                                  │                               │
│                                  ▼                               │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │          Local Preview Video Element                     │   │
│   │          video.srcObject = localStream                   │   │
│   │          video.muted = true  ◀── MUTED                   │───┼── 🔇 Silent
│   └─────────────────────────────┬───────────────────────────┘   │
│                                  │                               │
│                                  ▼                               │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │          WebRTC PeerConnection                           │   │
│   │          (Streams audio to viewer)                       │───┼──▶ TO VIEWER
│   └─────────────────────────────────────────────────────────┘   │    (Audio ✓)
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

| Component | Audio Status |
|-----------|--------------|
| Original music tab | ✓ Plays normally |
| Local preview | 🔇 Muted (no echo) |
| Stream to viewers | ✓ Audio included |

---

## File Changes Required

### Modified Files

| File | Changes |
|------|---------|
| `public/js/room.js` | Add `video.muted = true` after setting `srcObject` |

---

## Implementation Details

### Code Change (`room.js`)

Locate the `startBroadcasting()` function and modify the preview section:

**Before:**
```javascript
// Show preview
video.srcObject = localStream;
placeholder.style.display = 'none';
```

**After:**
```javascript
// Show preview (muted to prevent audio echo on broadcaster side)
video.srcObject = localStream;
video.muted = true;
placeholder.style.display = 'none';
```

### Location in File

The change should be made around **line 355-357** in `public/js/room.js`, inside the `startBroadcasting()` function.

---

## Edge Cases & Considerations

| Scenario | Handling |
|----------|----------|
| Broadcaster wants to verify audio is working | They can temporarily unmute the preview, or rely on viewer feedback |
| No system audio being shared | Muting has no effect (video-only stream) |
| Viewer audio | Unaffected - viewer's video element should NOT be muted |
| Browser autoplay policy | Muting actually helps with autoplay since muted videos can autoplay |

---

## Verification Plan

### Manual Testing

1. **Setup**: Open the app with one broadcaster and one viewer
2. **Test 1 - Broadcaster audio**:
   - As broadcaster, start screen sharing with system audio
   - Play music in another tab
   - **Expected**: Hear music ONCE (from original tab only, not doubled)
3. **Test 2 - Viewer audio**:
   - As viewer, watch the stream
   - **Expected**: Hear the music clearly (stream includes audio)
4. **Test 3 - Video preview works**:
   - As broadcaster, verify video preview still displays correctly
   - **Expected**: Video preview shows shared content
5. **Test 4 - Start/Stop cycle**:
   - Stop and restart broadcasting multiple times
   - **Expected**: Each time, no audio echo occurs

### Browser Testing Matrix

| Browser | Test Status |
|---------|-------------|
| Chrome (Mac) | [ ] |
| Safari (Mac) | [ ] |
| Firefox (Mac) | [ ] |

---

## Implementation Checklist

- [x] Modify `public/js/room.js` - add `video.muted = true` in `startBroadcasting()`
- [ ] Manual testing - verify no audio echo on broadcaster
- [ ] Manual testing - verify viewer still receives audio
- [ ] Manual testing - verify video preview still works

---

## Future Considerations (Out of Scope)

- Audio level indicator to show broadcaster that audio is being captured
- Toggle to unmute local preview for audio verification
- Visual feedback when system audio is included in the stream
