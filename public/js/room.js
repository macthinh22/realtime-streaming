/**
 * Room - Unified broadcaster/viewer page with role-based UI
 */
(function () {
    // Get room info from session storage
    const roomId = sessionStorage.getItem('roomId');
    const roomName = sessionStorage.getItem('roomName');
    const roomRole = sessionStorage.getItem('roomRole');
    const roomKey = sessionStorage.getItem('roomKey');

    // Redirect to lobby if no room info
    if (!roomId || !roomRole || !roomKey) {
        window.location.href = '/';
        return;
    }

    // DOM Elements
    const roomNameEl = document.getElementById('room-name');
    const roomIdEl = document.getElementById('room-id');
    const copyIdBtn = document.getElementById('copy-id-btn');
    const leaveBtn = document.getElementById('leave-btn');
    const video = document.getElementById('video');
    const placeholder = document.getElementById('placeholder');
    const placeholderIcon = document.getElementById('placeholder-icon');
    const placeholderText = document.getElementById('placeholder-text');
    const statusEl = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const broadcasterControls = document.getElementById('broadcaster-controls');
    const viewerControls = document.getElementById('viewer-controls');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const roleBadge = document.getElementById('role-badge');
    const participantCount = document.getElementById('participant-count');
    const viewerStatusText = document.getElementById('viewer-status-text');
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toast-icon');
    const toastMessage = document.getElementById('toast-message');
    const copyToast = document.getElementById('copy-toast');

    // Chat Notification DOM Elements
    const chatNotification = document.getElementById('chat-notification');
    const chatNotificationSender = document.getElementById('chat-notification-sender');
    const chatNotificationText = document.getElementById('chat-notification-text');
    const chatNotificationClose = document.getElementById('chat-notification-close');

    // Chat DOM Elements
    const chatToggleBtn = document.getElementById('chat-toggle-btn');
    const chatPanel = document.getElementById('chat-panel');
    const chatCloseBtn = document.getElementById('chat-close-btn');
    const chatMessages = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');

    // State
    let localStream = null;
    let peerConnection = null;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    let isInitialConnection = true; // Track if this is the first connection
    let currentViewerId = null; // Track current viewer to prevent duplicate connections
    let isNegotiating = false; // Track if we're in the middle of WebRTC negotiation
    let participantCountValue = 1;
    let isChatOpen = localStorage.getItem('chatOpen') === 'true';
    let notificationTimeout = null;

    // WebRTC configuration
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    /**
     * Initialize the room
     */
    async function init() {
        // Set room info in UI
        roomNameEl.textContent = roomName || 'Room';
        roomIdEl.textContent = roomId;
        roleBadge.textContent = roomRole === 'broadcaster' ? '📡 Broadcaster' : '👁️ Viewer';
        roleBadge.className = `role-badge role-${roomRole}`;

        // Show appropriate controls and ensure placeholder is visible
        if (roomRole === 'broadcaster') {
            broadcasterControls.classList.remove('hidden');
            placeholderIcon.textContent = '📡';
            placeholderText.textContent = 'Click "Start Broadcasting" to share your screen';
            placeholder.style.display = 'flex';
        } else {
            viewerControls.classList.remove('hidden');
            placeholderIcon.textContent = '👁️';
            placeholderText.textContent = 'Waiting for broadcaster...';
            placeholder.style.display = 'flex';
            video.style.display = 'none'; // Hide video until stream arrives
        }

        // Set up signaling handlers BEFORE connecting
        // This ensures we don't miss any messages
        setupSignalingHandlers();

        // Connect to signaling server and join room
        try {
            await signaling.connect();
            updateStatus('waiting', 'Joining room...');

            // Join the room with the new WebSocket connection
            signaling.send({
                type: 'join-room',
                roomId: roomId,
                key: roomKey
            });

            // Mark initial connection as complete
            isInitialConnection = false;
        } catch (e) {
            updateStatus('disconnected', 'Connection failed');
            console.error('Failed to connect:', e);
        }

        // Button handlers
        copyIdBtn.addEventListener('click', copyRoomId);
        leaveBtn.addEventListener('click', leaveRoom);

        // Fullscreen button - both click and touch for mobile compatibility
        fullscreenBtn.addEventListener('click', toggleFullscreen);
        fullscreenBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            toggleFullscreen();
        });

        if (roomRole === 'broadcaster') {
            startBtn.addEventListener('click', startBroadcasting);
            stopBtn.addEventListener('click', stopBroadcasting);
        }

        // Chat toggle handlers
        chatToggleBtn.addEventListener('click', toggleChat);
        chatCloseBtn.addEventListener('click', closeChat);
        chatForm.addEventListener('submit', sendChatMessage);

        // Restore chat panel state
        if (isChatOpen) {
            chatPanel.classList.remove('hidden');
        }

        // Chat notification close handler
        chatNotificationClose.addEventListener('click', dismissChatNotification);

        // Handle page unload
        window.addEventListener('beforeunload', () => {
            signaling.send({ type: 'leave-room' });
        });
    }

    /**
     * Set up signaling message handlers
     */
    function setupSignalingHandlers() {
        signaling.on('connected', () => {
            // Only rejoin on RECONNECT, not initial connection
            // Initial connection is handled in init()
            if (!isInitialConnection) {
                console.log('Reconnecting to room...');
                updateStatus('waiting', 'Reconnecting...');
                signaling.send({
                    type: 'join-room',
                    roomId: roomId,
                    key: roomKey
                });
            }
        });

        signaling.on('disconnected', () => {
            updateStatus('disconnected', 'Disconnected');
        });

        // Handle successful room join
        signaling.on('room-joined', (message) => {
            console.log('Rejoined room as', message.role);
            updateStatus('connected', 'Connected');

            // Clear the key from storage for security (we're now joined)
            // sessionStorage.removeItem('roomKey'); // Keep for reconnect

            // For viewers, send viewer-join to trigger WebRTC negotiation
            if (roomRole === 'viewer') {
                signaling.send({ type: 'viewer-join' });
            }
        });

        signaling.on('room-error', (message) => {
            console.error('Room error:', message.error);
            updateStatus('disconnected', message.error);
            showToast('⚠️', message.error);
            // Redirect to lobby after error
            setTimeout(() => {
                sessionStorage.clear();
                window.location.href = '/';
            }, 2000);
        });

        signaling.on('room-left', () => {
            window.location.href = '/';
        });

        // Chat message handler (for both roles)
        signaling.on('chat-broadcast', (message) => {
            displayChatMessage(message);

            // Show notification if chat is closed and message is from someone else
            if (!isChatOpen && message.sender !== roomRole) {
                showChatNotification(message.sender, message.message);
            }
        });

        // Broadcaster-specific handlers
        if (roomRole === 'broadcaster') {
            signaling.on('viewer-joined', async (message) => {
                console.log('Viewer joined:', message.viewerId);

                // Prevent duplicate peer connections for the same viewer
                if (currentViewerId === message.viewerId && peerConnection &&
                    peerConnection.connectionState !== 'failed' &&
                    peerConnection.connectionState !== 'closed') {
                    console.log('Already connected to this viewer, ignoring duplicate');
                    return;
                }

                // Prevent creating new connection while negotiating
                if (isNegotiating) {
                    console.log('Already negotiating, ignoring viewer-joined');
                    return;
                }

                participantCountValue = 2;
                updateParticipantCount();
                showToast('👁️', 'Viewer joined the room');

                if (localStream) {
                    currentViewerId = message.viewerId;
                    await createPeerConnectionAsBroadcaster(message.viewerId);
                }
            });

            signaling.on('viewer-left', (message) => {
                console.log('Viewer left:', message.viewerId);
                participantCountValue = 1;
                updateParticipantCount();
                showToast('👋', 'Viewer left the room');

                // Reset state
                currentViewerId = null;
                isNegotiating = false;

                if (peerConnection) {
                    peerConnection.close();
                    peerConnection = null;
                }
            });

            signaling.on('answer', async (message) => {
                try {
                    if (peerConnection && peerConnection.signalingState === 'have-local-offer') {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
                        console.log('Set remote description successfully');
                        isNegotiating = false;
                    } else {
                        console.warn('Ignoring answer - wrong signaling state:',
                            peerConnection ? peerConnection.signalingState : 'no peer connection');
                    }
                } catch (e) {
                    console.error('Error setting remote description:', e);
                    isNegotiating = false;
                }
            });

            signaling.on('ice-candidate', async (message) => {
                try {
                    if (peerConnection && peerConnection.remoteDescription && message.candidate) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
                    }
                } catch (e) {
                    console.warn('Error adding ICE candidate:', e);
                }
            });
        }

        // Viewer-specific handlers
        if (roomRole === 'viewer') {
            signaling.on('no-broadcaster', () => {
                showPlaceholder('👁️', 'Waiting for broadcaster...');
                viewerStatusText.textContent = 'Waiting for broadcaster';
            });

            signaling.on('broadcaster-available', () => {
                signaling.send({ type: 'viewer-join' });
            });

            signaling.on('broadcaster-left', () => {
                cleanupPeerConnection();
                showPlaceholder('👋', 'Broadcaster disconnected. Waiting...');
                viewerStatusText.textContent = 'Broadcaster disconnected';
                updateStatus('waiting', 'Waiting for stream...');
                participantCountValue = 1;
                updateParticipantCount();
            });

            signaling.on('offer', async (message) => {
                console.log('Received offer');
                await handleOfferAsViewer(message.offer);
            });

            signaling.on('ice-candidate', async (message) => {
                try {
                    if (peerConnection && peerConnection.remoteDescription && message.candidate) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
                    }
                } catch (e) {
                    console.warn('Error adding ICE candidate:', e);
                }
            });
        }
    }

    // ============================================
    // Broadcaster Functions
    // ============================================

    /**
     * Start broadcasting
     */
    async function startBroadcasting() {
        try {
            localStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1920, max: 3840 },
                    height: { ideal: 1080, max: 2160 },
                    frameRate: { ideal: 60, max: 60 },
                    cursor: 'always'
                },
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 48000,
                    channelCount: 2
                },
                preferCurrentTab: false,
                selfBrowserSurface: 'exclude',
                systemAudio: 'include'
            });

            // Show preview (muted to prevent audio echo on broadcaster side)
            video.srcObject = localStream;
            video.muted = true;
            placeholder.style.display = 'none';

            // Update UI
            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');
            updateStatus('connected', 'Broadcasting');

            // Handle stream end
            localStream.getVideoTracks()[0].onended = () => {
                stopBroadcasting();
            };

            // Announce as broadcaster
            signaling.send({ type: 'broadcaster-ready' });

            console.log('Started broadcasting');
        } catch (e) {
            console.error('Failed to start screen sharing:', e);
            if (e.name === 'NotAllowedError') {
                showToast('⚠️', 'Screen sharing was cancelled or denied');
            }
        }
    }

    /**
     * Stop broadcasting
     */
    function stopBroadcasting() {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }

        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }

        video.srcObject = null;
        placeholder.style.display = 'flex';
        startBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
        updateStatus('connected', 'Ready to broadcast');

        console.log('Stopped broadcasting');
    }

    /**
     * Create peer connection as broadcaster
     */
    async function createPeerConnectionAsBroadcaster(viewerId) {
        // Mark that we're starting negotiation
        isNegotiating = true;

        // Close existing connection
        if (peerConnection) {
            peerConnection.close();
        }

        peerConnection = new RTCPeerConnection(rtcConfig);

        // Add local tracks with high quality settings
        localStream.getTracks().forEach(track => {
            const sender = peerConnection.addTrack(track, localStream);

            if (track.kind === 'video') {
                const params = sender.getParameters();
                if (!params.encodings) params.encodings = [{}];
                params.encodings[0] = {
                    ...params.encodings[0],
                    maxBitrate: 50_000_000,
                    maxFramerate: 60,
                    priority: 'high',
                    networkPriority: 'high'
                };
                sender.setParameters(params).catch(e => console.warn('Video params:', e));
            }

            if (track.kind === 'audio') {
                const params = sender.getParameters();
                if (!params.encodings) params.encodings = [{}];
                params.encodings[0] = {
                    ...params.encodings[0],
                    maxBitrate: 510_000,
                    priority: 'high',
                    networkPriority: 'high'
                };
                sender.setParameters(params).catch(e => console.warn('Audio params:', e));
            }
        });

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                signaling.send({
                    type: 'ice-candidate',
                    viewerId: viewerId,
                    candidate: event.candidate
                });
            }
        };

        // Handle connection state
        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);

            if (peerConnection.connectionState === 'connected') {
                updateStatus('connected', 'Streaming');
                isNegotiating = false;
            } else if (peerConnection.connectionState === 'disconnected') {
                updateStatus('waiting', 'Reconnecting...');
            } else if (peerConnection.connectionState === 'failed') {
                updateStatus('disconnected', 'Connection failed');
                isNegotiating = false;
                currentViewerId = null; // Allow retry
            }
        };

        // Create and send offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        signaling.send({
            type: 'offer',
            viewerId: viewerId,
            offer: peerConnection.localDescription
        });

        console.log('Created peer connection for viewer');
    }

    // ============================================
    // Viewer Functions
    // ============================================

    /**
     * Handle offer as viewer
     */
    async function handleOfferAsViewer(offer) {
        cleanupPeerConnection();

        peerConnection = new RTCPeerConnection(rtcConfig);

        // Track if we've shown the video (to prevent flickering)
        let videoShown = false;

        /**
         * Show video when ready - called when we're confident the stream is playing
         */
        function showVideoWhenReady() {
            if (videoShown) return;
            if (!video.srcObject) return;

            videoShown = true;
            video.style.display = 'block';
            placeholder.style.display = 'none';
            updateStatus('connected', 'Streaming');
            viewerStatusText.textContent = 'Watching stream';
            participantCountValue = 2;
            updateParticipantCount();
            console.log('Video is now visible');
        }

        // Handle incoming tracks
        peerConnection.ontrack = (event) => {
            console.log('Received track:', event.track.kind);

            // Use the stream from the event if available
            if (event.streams && event.streams[0]) {
                video.srcObject = event.streams[0];
            } else {
                // Fallback: manually add track to a new MediaStream
                if (!video.srcObject) {
                    video.srcObject = new MediaStream();
                }
                video.srcObject.addTrack(event.track);
            }

            if (event.track.kind === 'video') {
                // Listen for video metadata to know when frames are ready
                video.onloadedmetadata = () => {
                    console.log('Video metadata loaded');
                    video.play().then(() => {
                        showVideoWhenReady();
                    }).catch(e => {
                        console.log('Autoplay blocked:', e);
                        // Still show video even if autoplay blocked
                        showVideoWhenReady();
                    });
                };

                // Fallback: if video is already ready
                if (video.readyState >= 2) {
                    video.play().then(() => {
                        showVideoWhenReady();
                    }).catch(e => {
                        console.log('Autoplay blocked:', e);
                        showVideoWhenReady();
                    });
                }
            }
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                signaling.send({
                    type: 'ice-candidate',
                    candidate: event.candidate
                });
            }
        };

        // Monitor ICE connection state for faster feedback
        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', peerConnection.iceConnectionState);

            switch (peerConnection.iceConnectionState) {
                case 'checking':
                    updateStatus('waiting', 'Connecting...');
                    break;
                case 'connected':
                case 'completed':
                    // ICE is connected - stream should be flowing soon
                    // Don't show video yet, wait for loadedmetadata
                    retryCount = 0;
                    break;
                case 'disconnected':
                    updateStatus('waiting', 'Reconnecting...');
                    break;
                case 'failed':
                    updateStatus('disconnected', 'Connection failed');
                    attemptRecovery();
                    break;
            }
        };

        // Handle connection state (backup for ICE state)
        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);

            switch (peerConnection.connectionState) {
                case 'connected':
                    // Connection is fully established
                    retryCount = 0;
                    break;
                case 'disconnected':
                    updateStatus('waiting', 'Reconnecting...');
                    break;
                case 'failed':
                    updateStatus('disconnected', 'Connection failed');
                    attemptRecovery();
                    break;
            }
        };

        // Set remote description and create answer
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        signaling.send({
            type: 'answer',
            answer: peerConnection.localDescription
        });

        console.log('Sent answer');
    }

    /**
     * Attempt recovery for viewer
     */
    function attemptRecovery() {
        if (retryCount >= MAX_RETRIES) {
            console.log('Max retries reached');
            cleanupPeerConnection();
            showPlaceholder('❌', 'Connection failed. Please refresh the page.');
            return;
        }

        retryCount++;
        console.log(`Recovery attempt ${retryCount}/${MAX_RETRIES}`);

        cleanupPeerConnection();
        showPlaceholder('🔄', `Reconnecting... (attempt ${retryCount}/${MAX_RETRIES})`);

        setTimeout(() => {
            if (signaling.isConnected) {
                signaling.send({ type: 'viewer-join' });
            }
        }, 1000);
    }

    /**
     * Clean up peer connection
     */
    function cleanupPeerConnection() {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        video.srcObject = null;
        if (roomRole === 'viewer') {
            video.style.display = 'none';
            placeholder.style.display = 'flex';
        }
    }

    // ============================================
    // UI Helpers
    // ============================================

    /**
     * Update connection status
     */
    function updateStatus(state, text) {
        statusEl.className = `status status-${state}`;
        statusText.textContent = text;
    }

    /**
     * Show placeholder
     */
    function showPlaceholder(icon, text) {
        placeholder.style.display = 'flex';
        placeholderIcon.textContent = icon;
        placeholderText.textContent = text;
    }

    /**
     * Update participant count
     */
    function updateParticipantCount() {
        participantCount.textContent = `${participantCountValue}/2`;
    }

    /**
     * Copy room ID to clipboard
     */
    async function copyRoomId() {
        try {
            await navigator.clipboard.writeText(roomId);
            copyToast.classList.remove('hidden');
            setTimeout(() => copyToast.classList.add('hidden'), 2000);
        } catch (e) {
            console.error('Failed to copy:', e);
        }
    }

    /**
     * Leave room
     */
    function leaveRoom() {
        signaling.send({ type: 'leave-room' });
        sessionStorage.clear();
        window.location.href = '/';
    }

    /**
     * Toggle fullscreen mode
     * Supports both standard API and iOS Safari webkit API
     */
    function toggleFullscreen() {
        console.log('Fullscreen button clicked');

        // Check if already in fullscreen
        const isFullscreen = document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement;

        if (isFullscreen) {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        } else {
            // Enter fullscreen - try video element first for iOS Safari
            const target = video.webkitEnterFullscreen ? video : video.parentElement;

            if (target.requestFullscreen) {
                target.requestFullscreen();
            } else if (target.webkitRequestFullscreen) {
                target.webkitRequestFullscreen();
            } else if (target.webkitEnterFullscreen) {
                // iOS Safari specific for video
                target.webkitEnterFullscreen();
            } else if (target.mozRequestFullScreen) {
                target.mozRequestFullScreen();
            } else if (target.msRequestFullscreen) {
                target.msRequestFullscreen();
            }
        }
    }

    /**
     * Show toast notification
     */
    function showToast(icon, message) {
        toastIcon.textContent = icon;
        toastMessage.textContent = message;
        toast.classList.remove('hidden');

        setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    // ============================================
    // Chat Functions
    // ============================================

    /**
     * Toggle chat panel visibility
     */
    function toggleChat() {
        isChatOpen = !isChatOpen;
        chatPanel.classList.toggle('hidden', !isChatOpen);
        localStorage.setItem('chatOpen', isChatOpen);
        if (isChatOpen) {
            chatInput.focus();
            scrollChatToBottom();
            dismissChatNotification(); // Dismiss notification when chat opens
        }
    }

    /**
     * Close chat panel
     */
    function closeChat() {
        isChatOpen = false;
        chatPanel.classList.add('hidden');
        localStorage.setItem('chatOpen', 'false');
    }

    /**
     * Send chat message
     */
    function sendChatMessage(e) {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (!message) return;

        signaling.send({
            type: 'chat-message',
            message: message
        });

        chatInput.value = '';
        chatInput.focus();
    }

    /**
     * Display chat message
     */
    function displayChatMessage(data) {
        // Remove empty state if present
        const emptyState = chatMessages.querySelector('.chat-empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const isSelf = data.sender === roomRole;
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${isSelf ? 'message-self' : 'message-other'}`;

        const senderLabel = isSelf ? 'You' : (data.sender === 'broadcaster' ? '📡 Broadcaster' : '👁️ Viewer');
        const timeStr = formatTime(data.timestamp);

        messageEl.innerHTML = `
            <div class="chat-message-sender">${senderLabel}</div>
            <div class="chat-message-text">${escapeHtml(data.message)}</div>
            <div class="chat-message-time">${timeStr}</div>
        `;

        chatMessages.appendChild(messageEl);
        scrollChatToBottom();
    }

    /**
     * Scroll chat to bottom
     */
    function scrollChatToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * Show chat notification popup for new message
     */
    function showChatNotification(sender, message) {
        if (notificationTimeout) {
            clearTimeout(notificationTimeout);
        }

        const senderLabel = sender === 'broadcaster' ? '📡 Broadcaster' : '👁️ Viewer';
        chatNotificationSender.textContent = senderLabel;

        const truncatedMessage = message.length > 100
            ? message.substring(0, 100) + '...'
            : message;
        chatNotificationText.textContent = truncatedMessage;

        chatNotification.classList.remove('hidden');
        chatNotification.classList.add('visible');

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

    /**
     * Format timestamp to time string
     */
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize
    init();
})();
