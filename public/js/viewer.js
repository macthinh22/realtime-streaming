/**
 * Viewer - Receives and displays WebRTC stream from broadcaster
 */
(function () {
    // DOM elements
    const video = document.getElementById('stream-video');
    const placeholder = document.getElementById('placeholder');
    const placeholderText = document.getElementById('placeholder-text');
    const statusEl = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');
    const fullscreenBtn = document.getElementById('fullscreen-btn');

    // State
    let peerConnection = null;

    // WebRTC configuration
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    /**
     * Initialize the viewer
     */
    async function init() {
        // Connect to signaling server
        try {
            await signaling.connect();
            updateStatus('waiting', 'Connected, waiting for stream...');

            // Join as viewer
            signaling.send({ type: 'viewer-join' });
        } catch (e) {
            updateStatus('disconnected', 'Connection failed');
            console.error('Failed to connect:', e);
        }

        // Set up signaling handlers
        signaling.on('connected', () => {
            updateStatus('waiting', 'Connected, waiting for stream...');
            signaling.send({ type: 'viewer-join' });
        });

        signaling.on('disconnected', () => {
            updateStatus('disconnected', 'Disconnected');
            cleanupPeerConnection();
            showPlaceholder('Connection lost. Reconnecting...');
        });

        signaling.on('no-broadcaster', () => {
            showPlaceholder('Waiting for broadcaster...');
        });

        signaling.on('broadcaster-available', () => {
            // Broadcaster just became available, request to join
            signaling.send({ type: 'viewer-join' });
        });

        signaling.on('broadcaster-left', () => {
            cleanupPeerConnection();
            showPlaceholder('Broadcaster disconnected. Waiting...');
            updateStatus('waiting', 'Waiting for stream...');
        });

        signaling.on('offer', async (message) => {
            console.log('Received offer');
            await handleOffer(message.offer);
        });

        signaling.on('ice-candidate', async (message) => {
            if (peerConnection && message.candidate) {
                await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
            }
        });

        // Fullscreen button - both click and touch for mobile compatibility
        fullscreenBtn.addEventListener('click', toggleFullscreen);
        fullscreenBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            toggleFullscreen();
        });



        // Double-click video for fullscreen
        video.addEventListener('dblclick', toggleFullscreen);
    }

    /**
     * Handle incoming offer from broadcaster
     */
    async function handleOffer(offer) {
        // Clean up existing connection if any
        cleanupPeerConnection();

        // Create new peer connection
        peerConnection = new RTCPeerConnection(rtcConfig);

        // Handle incoming tracks
        peerConnection.ontrack = (event) => {
            console.log('Received track:', event.track.kind);

            if (!video.srcObject) {
                video.srcObject = new MediaStream();
            }
            video.srcObject.addTrack(event.track);

            // Hide placeholder when we have video
            if (event.track.kind === 'video') {
                placeholder.style.display = 'none';
                updateStatus('connected', 'Streaming');
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

        // Handle connection state
        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);

            switch (peerConnection.connectionState) {
                case 'connected':
                    updateStatus('connected', 'Streaming');
                    break;
                case 'disconnected':
                    updateStatus('waiting', 'Reconnecting...');
                    break;
                case 'failed':
                    updateStatus('disconnected', 'Connection failed');
                    cleanupPeerConnection();
                    showPlaceholder('Connection failed. Waiting for new stream...');
                    break;
            }
        };

        // Set remote description and create answer
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Send answer back
        signaling.send({
            type: 'answer',
            answer: peerConnection.localDescription
        });

        console.log('Sent answer');
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
    }

    /**
     * Show placeholder with message
     */
    function showPlaceholder(message) {
        placeholder.style.display = 'flex';
        placeholderText.textContent = message;
    }

    /**
     * Update connection status UI
     */
    function updateStatus(state, text) {
        statusEl.className = `status status-${state}`;
        statusText.textContent = text;
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

    // Initialize when page loads
    init();
})();
