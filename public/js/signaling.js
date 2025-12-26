/**
 * Signaling module for WebSocket communication with the server
 */
class SignalingClient {
    constructor() {
        this.ws = null;
        this.messageHandlers = new Map();
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
    }

    /**
     * Connect to the signaling server
     */
    connect() {
        return new Promise((resolve, reject) => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}`;

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('Connected to signaling server');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.emit('connected');
                resolve();
            };

            this.ws.onclose = () => {
                console.log('Disconnected from signaling server');
                this.isConnected = false;
                this.emit('disconnected');
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            };
        });
    }

    /**
     * Handle incoming messages
     */
    handleMessage(message) {
        const handler = this.messageHandlers.get(message.type);
        if (handler) {
            handler(message);
        } else {
            console.log('Unhandled message type:', message.type);
        }
    }

    /**
     * Register a handler for a specific message type
     */
    on(type, handler) {
        this.messageHandlers.set(type, handler);
    }

    /**
     * Emit a local event
     */
    emit(type, data = {}) {
        const handler = this.messageHandlers.get(type);
        if (handler) {
            handler(data);
        }
    }

    /**
     * Send a message to the server
     */
    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.error('WebSocket not connected');
        }
    }

    /**
     * Attempt to reconnect after disconnect
     */
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnect attempts reached');
            this.emit('reconnect-failed');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);

        console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            this.connect().catch(() => {
                // Will trigger another reconnect attempt via onclose
            });
        }, delay);
    }

    /**
     * Close the connection
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

// Create global instance
window.signaling = new SignalingClient();
