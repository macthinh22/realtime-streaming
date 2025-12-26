# Troubleshooting: Mobile Button Not Clickable

## The Issue
The fullscreen button was visible on mobile but could not be clicked/tapped.

## Why It Took 3 Attempts

### Attempt 1: CSS Visibility
**Assumption**: Button hidden because `opacity: 0` only shows on hover (no hover on mobile)

**Fix applied**: 
- Set `opacity: 1` by default
- Added `z-index: 10`

**Result**: ❌ Still not clickable

**Lesson**: Visibility ≠ clickability. Element can be visible but still blocked.

---

### Attempt 2: Overlay Blocking
**Assumption**: `.video-placeholder` div was covering the button

**Fix applied**:
- Added `pointer-events: none` to `.video-placeholder`

**Result**: ❌ Still not clickable

**Lesson**: The video element itself can also block touch events.

---

### Attempt 3: Full Mobile Support
**Assumption**: Multiple issues compounding:
1. Video element above button in stacking context
2. No touch event listeners (mobile uses `touchend`, not just `click`)
3. iOS Safari needs webkit-prefixed fullscreen API

**Fixes applied**:
- Video element: `position: relative; z-index: 1`
- Button: `z-index: 100; pointer-events: auto !important`
- Added `touchend` event listener alongside `click`
- Added webkit fullscreen API for iOS Safari

**Result**: ✅ Works on mobile

---

## Complete Checklist for Mobile Buttons

When debugging mobile touch issues, check ALL of these:

### CSS
- [ ] Button has high `z-index` (100+)
- [ ] Button has `pointer-events: auto`
- [ ] Any overlay divs have `pointer-events: none`
- [ ] Button is `opacity: 1` (not hidden)
- [ ] Video/canvas elements have lower z-index
- [ ] Touch-friendly size (min 44x44px)
- [ ] `touch-action: manipulation` for faster taps

### JavaScript
- [ ] `touchend` listener (not just `click`)
- [ ] `e.preventDefault()` in touch handler (prevents double-fire)
- [ ] Browser-specific APIs (webkit prefixes for iOS)

### Example Fix
```css
.mobile-button {
  z-index: 100;
  pointer-events: auto !important;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  min-width: 48px;
  min-height: 48px;
}
```

```javascript
button.addEventListener('click', handleClick);
button.addEventListener('touchend', (e) => {
  e.preventDefault();
  handleClick();
});
```

---

## Key Takeaway

Mobile touch issues are usually a **combination** of problems, not just one. Always check:
1. **Z-index stacking** (is something above the button?)
2. **Touch events** (does it listen for touch, not just click?)
3. **Browser APIs** (does iOS Safari need webkit prefix?)

Fix all three at once instead of one at a time.
