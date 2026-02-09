// Display state manager
class DisplayState {
    constructor() {
        this.status = 'Idle';
        this.emotion = '😊';
        this.theme = 'dark';
        this.battery = { level: -1, charging: false };
        this.network = 'unknown';
        this.volume = -1;
        this.messages = [];
        this.maxMessages = 40;
    }

    updateFromFullState(data) {
        if (data.status) this.status = data.status;
        if (data.emotion) this.emotion = data.emotion;
        if (data.theme) this.theme = data.theme;
        if (data.battery) this.battery = data.battery;
        if (data.network) this.network = data.network;
        if (data.volume !== undefined) this.volume = data.volume;
        if (data.messages) this.messages = data.messages;
    }

    addMessage(role, content) {
        this.messages.push({ role, content });
        if (this.messages.length > this.maxMessages) {
            this.messages.shift();
        }
    }

    clearMessages() {
        this.messages = [];
    }
}

// WebSocket connection manager
class WebSocketManager {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 2000;
        this.isConnected = false;
        this.onMessage = null;
        this.onConnectionChange = null;
    }

    connect() {
        console.log('Connecting to WebSocket:', this.url);

        try {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                if (this.onConnectionChange) {
                    this.onConnectionChange(true);
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    if (this.onMessage) {
                        this.onMessage(message);
                    }
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            };

            this.ws.onclose = () => {
                console.log('WebSocket closed');
                this.isConnected = false;
                if (this.onConnectionChange) {
                    this.onConnectionChange(false);
                }
                this.scheduleReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (e) {
            console.error('Failed to create WebSocket:', e);
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// UI Renderer
class UIRenderer {
    constructor() {
        this.elements = {
            app: document.getElementById('app'),
            status: document.getElementById('status-display').querySelector('.status-text'),
            emotion: document.getElementById('emotion-display').querySelector('.emoji'),
            chatMessages: document.getElementById('chat-messages'),
            notification: document.getElementById('notification-display'),
            notificationText: document.getElementById('notification-text'),
            connectionStatus: document.getElementById('connection-status'),
            networkIcon: document.getElementById('network-icon'),
            batteryIcon: document.getElementById('battery-icon'),
            volumeIcon: document.getElementById('volume-icon')
        };
    }

    renderStatus(status) {
        this.elements.status.textContent = status;
    }

    renderEmotion(emotion) {
        this.elements.emotion.textContent = emotion;
    }

    renderTheme(theme) {
        this.elements.app.className = `theme-${theme}`;
    }

    renderMessages(messages) {
        this.elements.chatMessages.innerHTML = '';
        messages.forEach(msg => {
            this.addMessage(msg.role, msg.content);
        });
        this.scrollToBottom();
    }

    addMessage(role, content) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${role}`;

        const roleDiv = document.createElement('div');
        roleDiv.className = 'message-role';
        roleDiv.textContent = role;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;

        msgDiv.appendChild(roleDiv);
        msgDiv.appendChild(contentDiv);

        this.elements.chatMessages.appendChild(msgDiv);
        this.scrollToBottom();
    }

    clearMessages() {
        this.elements.chatMessages.innerHTML = '';
    }

    showNotification(message, duration = 3000) {
        this.elements.notificationText.textContent = message;
        this.elements.notification.classList.remove('hidden');

        setTimeout(() => {
            this.elements.notification.classList.add('hidden');
        }, duration);
    }

    setConnectionStatus(connected) {
        if (connected) {
            this.elements.connectionStatus.classList.remove('disconnected');
            this.elements.connectionStatus.classList.add('connected');
            this.elements.connectionStatus.querySelector('.text').textContent = 'Connected';
        } else {
            this.elements.connectionStatus.classList.remove('connected');
            this.elements.connectionStatus.classList.add('disconnected');
            this.elements.connectionStatus.querySelector('.text').textContent = 'Disconnected';
        }
    }

    updateStatusBar(battery, network, volume) {
        // Update battery icon
        if (battery && battery.level >= 0) {
            if (battery.charging) {
                this.elements.batteryIcon.textContent = '🔌';
            } else if (battery.level > 80) {
                this.elements.batteryIcon.textContent = '🔋';
            } else if (battery.level > 20) {
                this.elements.batteryIcon.textContent = '🔋';
            } else {
                this.elements.batteryIcon.textContent = '🪫';
            }
        }

        // Update network icon
        if (network) {
            switch (network) {
                case 'wifi_strong':
                    this.elements.networkIcon.textContent = '📶';
                    break;
                case 'wifi_weak':
                    this.elements.networkIcon.textContent = '📶';
                    break;
                case 'disconnected':
                    this.elements.networkIcon.textContent = '📡';
                    break;
                default:
                    this.elements.networkIcon.textContent = '📶';
            }
        }

        // Update volume icon
        if (volume >= 0) {
            if (volume === 0) {
                this.elements.volumeIcon.textContent = '🔇';
            } else if (volume < 50) {
                this.elements.volumeIcon.textContent = '🔉';
            } else {
                this.elements.volumeIcon.textContent = '🔊';
            }
        }
    }

    scrollToBottom() {
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }
}

// Main application
class DisplayApp {
    constructor() {
        this.state = new DisplayState();
        this.renderer = new UIRenderer();

        // Build WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/display`;

        this.wsManager = new WebSocketManager(wsUrl);
        this.wsManager.onMessage = (msg) => this.handleMessage(msg);
        this.wsManager.onConnectionChange = (connected) => {
            this.renderer.setConnectionStatus(connected);
        };
    }

    start() {
        console.log('Starting Display App');
        this.wsManager.connect();
        this.render();
    }

    handleMessage(message) {
        console.log('Received message:', message);

        switch (message.type) {
            case 'full_state':
                this.state.updateFromFullState(message.data);
                this.render();
                break;

            case 'chat_message':
                this.state.addMessage(message.role, message.content);
                this.renderer.addMessage(message.role, message.content);
                break;

            case 'state_update':
                if (message.field === 'status') {
                    this.state.status = message.value;
                    this.renderer.renderStatus(this.state.status);
                } else if (message.field === 'emotion') {
                    this.state.emotion = message.value;
                    this.renderer.renderEmotion(this.state.emotion);
                } else if (message.field === 'theme') {
                    this.state.theme = message.value;
                    this.renderer.renderTheme(this.state.theme);
                }
                break;

            case 'clear_messages':
                this.state.clearMessages();
                this.renderer.clearMessages();
                break;

            case 'notification':
                this.renderer.showNotification(message.message, message.duration);
                break;

            case 'status_bar':
                if (message.battery) this.state.battery = message.battery;
                if (message.network) this.state.network = message.network;
                if (message.volume !== undefined) this.state.volume = message.volume;
                this.renderer.updateStatusBar(this.state.battery, this.state.network, this.state.volume);
                break;

            default:
                console.warn('Unknown message type:', message.type);
        }
    }

    render() {
        this.renderer.renderStatus(this.state.status);
        this.renderer.renderEmotion(this.state.emotion);
        this.renderer.renderTheme(this.state.theme);
        this.renderer.renderMessages(this.state.messages);
        this.renderer.updateStatusBar(this.state.battery, this.state.network, this.state.volume);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new DisplayApp();
    app.start();
});
