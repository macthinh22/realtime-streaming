/**
 * Broadcaster - Handles screen capture and WebRTC streaming to viewers
 */
(function () {
    // DOM elements
    const preview = document.getElementById('preview');
    const placeholder = document.getElementById('placeholder');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const statusEl = document.getElementById('connection-status');
    const statusText = document.getElementById('status-text');
    const viewerCountEl = document.getElementById('viewer-count');
    const viewerCountText = document.getElementById('viewer-count-text');
    const fullscreenBtn = document.getElementById('fullscreen-btn');

    // State
    let localStream = null;
    const peerConnections = new Map(); // viewerId -> RTCPeerConnection

    // WebRTC configuration
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    /**
     * Initialize the broadcaster
     */
    async function init() {
        // Connect to signaling server
        try {
            await signaling.connect();
            updateStatus('connected', 'Ready to broadcast');
        } catch (e) {
            updateStatus('disconnected', 'Connection failed');
            console.error('Failed to connect:', e);
        }

        // Set up signaling handlers
        signaling.on('connected', () => {
            updateStatus('connected', 'Ready to broadcast');
        });

        signaling.on('disconnected', () => {
            updateStatus('disconnected', 'Disconnected');
        });

        signaling.on('viewer-joined', async (message) => {
            console.log('Viewer joined:', message.viewerId);
            if (localStream) {
                await createPeerConnection(message.viewerId);
            }
        });

        signaling.on('answer', async (message) => {
            const pc = peerConnections.get(message.viewerId);
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
                console.log('Set remote description for:', message.viewerId);
            }
        });

        signaling.on('ice-candidate', async (message) => {
            const pc = peerConnections.get(message.viewerId);
            if (pc && message.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
            }
        });

        // Button handlers
        startBtn.addEventListener('click', startSharing);
        stopBtn.addEventListener('click', stopSharing);
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }

    /**
     * Start screen sharing
     */
    async function startSharing() {
        try {
            // Request screen capture with high quality and system audio
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

            // Show preview
            preview.srcObject = localStream;
            placeholder.style.display = 'none';

            // Update UI
            startBtn.style.display = 'none';
            stopBtn.style.display = 'inline-flex';
            viewerCountEl.style.display = 'flex';
            updateStatus('connected', 'Broadcasting');

            // Handle stream end (user clicks "Stop sharing" in browser)
            localStream.getVideoTracks()[0].onended = () => {
                stopSharing();
            };

            // Announce as broadcaster
            signaling.send({ type: 'broadcaster-ready' });

            console.log('Started broadcasting');

        } catch (e) {
            console.error('Failed to start screen sharing:', e);
            if (e.name === 'NotAllowedError') {
                alert('Screen sharing was cancelled or denied.');
            }
        }
    }

    /**
     * Stop screen sharing
     */
    function stopSharing() {
        // Stop all tracks
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }

        // Close all peer connections
        peerConnections.forEach((pc, viewerId) => {
            pc.close();
        });
        peerConnections.clear();

        // Update UI
        preview.srcObject = null;
        placeholder.style.display = 'flex';
        startBtn.style.display = 'inline-flex';
        stopBtn.style.display = 'none';
        viewerCountEl.style.display = 'none';
        updateStatus('connected', 'Ready to broadcast');

        console.log('Stopped broadcasting');
    }

    /**
     * Create a peer connection for a viewer
     */
    async function createPeerConnection(viewerId) {
        const pc = new RTCPeerConnection(rtcConfig);
        peerConnections.set(viewerId, pc);

        // Add local tracks
        localStream.getTracks().forEach(track => {
            const sender = pc.addTrack(track, localStream);

            // Configure high quality for video
            if (track.kind === 'video') {
                const params = sender.getParameters();
                if (!params.encodings) {
                    params.encodings = [{}];
                }
                params.encodings[0] = {
                    ...params.encodings[0],
                    maxBitrate: 50_000_000,  // 50 Mbps for 4K
                    maxFramerate: 60,
                    priority: 'high',
                    networkPriority: 'high'
                };
                sender.setParameters(params).catch(e => {
                    console.warn('Could not set encoding parameters:', e);
                });
            }

            // Configure high quality for audio
            if (track.kind === 'audio') {
                const params = sender.getParameters();
                if (!params.encodings) {
                    params.encodings = [{}];
                }
                params.encodings[0] = {
                    ...params.encodings[0],
                    maxBitrate: 510_000,  // 510 kbps for high quality audio
                    priority: 'high',
                    networkPriority: 'high'
                };
                sender.setParameters(params).catch(e => {
                    console.warn('Could not set audio encoding parameters:', e);
                });
            }
        });

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                signaling.send({
                    type: 'ice-candidate',
                    viewerId: viewerId,
                    candidate: event.candidate
                });
            }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            console.log(`Connection state (${viewerId}):`, pc.connectionState);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                pc.close();
                peerConnections.delete(viewerId);
            }
            updateViewerCount();
        };

        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        signaling.send({
            type: 'offer',
            viewerId: viewerId,
            offer: pc.localDescription
        });

        updateViewerCount();
        console.log('Created peer connection for:', viewerId);
    }

    /**
     * Update connection status UI
     */
    function updateStatus(state, text) {
        statusEl.className = `status status-${state}`;
        statusText.textContent = text;
    }

    /**
     * Update viewer count UI
     */
    function updateViewerCount() {
        const count = peerConnections.size;
        viewerCountText.textContent = `${count} viewer${count !== 1 ? 's' : ''}`;
    }

    /**
     * Toggle fullscreen mode
     */
    function toggleFullscreen() {
        const container = preview.parentElement;
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            container.requestFullscreen();
        }
    }

    // Initialize when page loads
    init();
})();
