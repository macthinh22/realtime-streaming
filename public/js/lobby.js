/**
 * Lobby - Handles room creation and joining
 */
(function () {
    // DOM Elements
    const createForm = document.getElementById('create-room-form');
    const joinForm = document.getElementById('join-room-form');
    const roomsContainer = document.getElementById('rooms-container');
    const roomCountEl = document.getElementById('room-count');
    const connectionBanner = document.getElementById('connection-banner');
    const connectionMessage = document.getElementById('connection-message');
    const errorToast = document.getElementById('error-toast');
    const errorMessage = document.getElementById('error-message');

    // State
    let rooms = [];
    let isConnected = false;

    /**
     * Initialize the lobby
     */
    async function init() {
        // Connect to signaling server
        try {
            await signaling.connect();
            setConnected(true);
        } catch (e) {
            setConnected(false);
            console.error('Failed to connect:', e);
        }

        // Set up signaling handlers
        signaling.on('connected', () => {
            setConnected(true);
        });

        signaling.on('disconnected', () => {
            setConnected(false);
        });

        signaling.on('room-list', (message) => {
            rooms = message.rooms;
            renderRooms();
        });

        signaling.on('room-created', (message) => {
            // Store room info and redirect to room page
            sessionStorage.setItem('roomId', message.roomId);
            sessionStorage.setItem('roomName', message.name);
            sessionStorage.setItem('roomRole', message.role);
            // Store key temporarily for room.html to rejoin
            sessionStorage.setItem('roomKey', document.getElementById('create-room-key').value);
            window.location.href = '/room.html';
        });

        signaling.on('room-joined', (message) => {
            // Store room info and redirect to room page
            sessionStorage.setItem('roomId', message.roomId);
            sessionStorage.setItem('roomName', message.name);
            sessionStorage.setItem('roomRole', message.role);
            // Store key temporarily for room.html to rejoin
            sessionStorage.setItem('roomKey', document.getElementById('join-room-key').value);
            window.location.href = '/room.html';
        });

        signaling.on('room-error', (message) => {
            showError(message.error);
        });

        // Form handlers
        createForm.addEventListener('submit', handleCreateRoom);
        joinForm.addEventListener('submit', handleJoinRoom);
    }

    /**
     * Handle create room form submission
     */
    function handleCreateRoom(e) {
        e.preventDefault();

        const name = document.getElementById('create-room-name').value.trim();
        const key = document.getElementById('create-room-key').value;

        if (!name || !key) {
            showError('Please fill in all fields');
            return;
        }

        if (key.length < 4) {
            showError('Room key must be at least 4 characters');
            return;
        }

        signaling.send({
            type: 'create-room',
            name: name,
            key: key
        });
    }

    /**
     * Handle join room form submission
     */
    function handleJoinRoom(e) {
        e.preventDefault();

        const roomId = document.getElementById('join-room-id').value.trim().toLowerCase();
        const key = document.getElementById('join-room-key').value;

        if (!roomId || !key) {
            showError('Please fill in all fields');
            return;
        }

        // Validate room ID format
        if (!/^room-[a-f0-9]{8}$/.test(roomId)) {
            showError('Invalid room ID format. Should be like: room-a1b2c3d4');
            return;
        }

        signaling.send({
            type: 'join-room',
            roomId: roomId,
            key: key
        });
    }

    /**
     * Handle clicking on a room card to join
     */
    function handleRoomCardClick(roomId) {
        // Pre-fill the join form with room ID
        document.getElementById('join-room-id').value = roomId;
        document.getElementById('join-room-key').focus();

        // Scroll to join form
        joinForm.scrollIntoView({ behavior: 'smooth' });
    }

    /**
     * Render the rooms list
     */
    function renderRooms() {
        roomCountEl.textContent = `${rooms.length}/5`;

        if (rooms.length === 0) {
            roomsContainer.innerHTML = `
        <div class="no-rooms">
          <span class="no-rooms-icon">🏠</span>
          <p>No active rooms yet. Create one to get started!</p>
        </div>
      `;
            return;
        }

        roomsContainer.innerHTML = rooms.map(room => `
      <div class="room-item ${room.isFull ? 'room-full' : ''}" 
           data-room-id="${room.id}"
           ${!room.isFull ? `onclick="window.lobbyHandleRoomClick('${room.id}')"` : ''}>
        <div class="room-item-header">
          <span class="room-item-name">${escapeHtml(room.name)}</span>
          <span class="room-item-lock">🔒</span>
        </div>
        <div class="room-item-footer">
          <span class="room-item-id">${room.id}</span>
          <span class="room-item-capacity ${room.isFull ? 'capacity-full' : ''}">
            ${room.participants}/2
          </span>
        </div>
        ${room.isFull
                ? '<div class="room-item-status">Full</div>'
                : '<div class="room-item-status room-item-join">Click to join</div>'
            }
      </div>
    `).join('');
    }

    /**
     * Set connection status
     */
    function setConnected(connected) {
        isConnected = connected;

        if (connected) {
            connectionBanner.classList.add('hidden');
        } else {
            connectionBanner.classList.remove('hidden');
            connectionMessage.textContent = 'Disconnected. Reconnecting...';
        }
    }

    /**
     * Show error toast
     */
    function showError(message) {
        errorMessage.textContent = message;
        errorToast.classList.remove('hidden');

        setTimeout(() => {
            errorToast.classList.add('hidden');
        }, 4000);
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Expose room click handler globally for onclick
    window.lobbyHandleRoomClick = handleRoomCardClick;

    // Initialize when page loads
    init();
})();
