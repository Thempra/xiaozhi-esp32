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

// Operations Panel Manager - Ejecuta acciones REALES del hardware
class OperationsPanel {
    constructor() {
        this.activeAttack = null;
        this.statusInterval = null;
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Network operations
        document.getElementById('btnWifiScan')?.addEventListener('click', () => this.wifiScan());
        document.getElementById('btnWifiInfo')?.addEventListener('click', () => this.wifiInfo());

        // Pentest operations
        document.getElementById('btnPentestScan')?.addEventListener('click', () => this.pentestScan());
        document.getElementById('btnDeauth')?.addEventListener('click', () => this.deauthAttack());
        document.getElementById('btnRogue')?.addEventListener('click', () => this.rogueAP());
        document.getElementById('btnPMKID')?.addEventListener('click', () => this.pmkidCapture());
        document.getElementById('btnDoS')?.addEventListener('click', () => this.dosAttack());
        document.getElementById('btnStopAttack')?.addEventListener('click', () => this.stopAttack());
        document.getElementById('btnExport')?.addEventListener('click', () => this.exportCapture());

        // Bluetooth operations
        document.getElementById('btnBleScan')?.addEventListener('click', () => this.bleScan());

        // System operations
        document.getElementById('btnSystemInfo')?.addEventListener('click', () => this.systemInfo());
        document.getElementById('btnBattery')?.addEventListener('click', () => this.batteryInfo());
        document.getElementById('btnReboot')?.addEventListener('click', () => this.reboot());

        // Sliders con debounce
        this.setupSlider('volumeSlider', 'volumeValue', (val) => this.setVolume(val));
        this.setupSlider('brightnessSlider', 'brightnessValue', (val) => this.setBrightness(val));

        // Theme buttons
        document.getElementById('btnThemeLight')?.addEventListener('click', () => this.setTheme('light'));
        document.getElementById('btnThemeDark')?.addEventListener('click', () => this.setTheme('dark'));
    }

    setupSlider(sliderId, valueId, callback) {
        const slider = document.getElementById(sliderId);
        const valueDisplay = document.getElementById(valueId);
        if (!slider || !valueDisplay) return;

        let timeout;
        slider.addEventListener('input', (e) => {
            valueDisplay.textContent = e.target.value;
            clearTimeout(timeout);
            timeout = setTimeout(() => callback(parseInt(e.target.value)), 300);
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === `tab-${tabName}`);
        });
    }

    // Llama a herramientas MCP reales del dispositivo
    async callMCP(tool, params = {}) {
        try {
            const response = await fetch('/api/mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool, params })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // Check if the response has success field
            if (data.success === false) {
                throw new Error(data.error || 'Unknown error');
            }

            // Return the actual result, not the wrapper
            // If data has a 'result' field, return that, otherwise return data itself
            return data.result !== undefined ? data.result : data;
        } catch (error) {
            console.error('MCP call failed:', tool, error);
            this.showNotification(`❌ Error: ${error.message}`, 'error');
            throw error;
        }
    }

    // Network Operations
    async wifiScan() {
        try {
            this.showNotification('🔍 Escaneando redes WiFi...', 'info');
            const result = await this.callMCP('self.network.scan_wifi');

            const container = document.getElementById('wifiNetworks');
            if (result && result.networks) {
                container.innerHTML = result.networks.map(net => `
                    <div class="network-item" data-bssid="${net.bssid}">
                        <div class="network-header">
                            <strong>${net.ssid || '(oculto)'}</strong>
                            <span>${this.getSignalIcon(net.rssi)}</span>
                        </div>
                        <div class="network-info">
                            <span>📍 ${net.bssid}</span>
                            <span>📡 CH${net.channel}</span>
                            <span>${this.getSecurityIcon(net.auth_mode)}</span>
                            <span>${net.rssi} dBm</span>
                        </div>
                    </div>
                `).join('');

                this.showNotification(`✅ ${result.networks.length} redes encontradas`, 'success');
            }
        } catch (error) {
            console.error('WiFi scan failed:', error);
        }
    }

    async wifiInfo() {
        try {
            const result = await this.callMCP('self.network.get_wifi_info');
            const container = document.getElementById('networkStatus');

            if (result) {
                container.innerHTML = `
                    <div class="status-item"><label>SSID:</label><span>${result.ssid || '-'}</span></div>
                    <div class="status-item"><label>IP:</label><span>${result.ip || '-'}</span></div>
                    <div class="status-item"><label>BSSID:</label><span>${result.bssid || '-'}</span></div>
                    <div class="status-item"><label>RSSI:</label><span>${result.rssi || '-'} dBm</span></div>
                    <div class="status-item"><label>Canal:</label><span>${result.channel || '-'}</span></div>
                    <div class="status-item"><label>Gateway:</label><span>${result.gateway || '-'}</span></div>
                `;
                this.showNotification('✅ Info WiFi actualizada', 'success');
            }
        } catch (error) {
            console.error('WiFi info failed:', error);
        }
    }

    // Pentest Operations
    async pentestScan() {
        try {
            this.showNotification('🎯 Escaneando targets...', 'info');
            const result = await this.callMCP('self.wifi_pentest.scan_targets');

            const container = document.getElementById('pentestTargets');
            if (result && result.networks) {
                container.innerHTML = result.networks.map(net => `
                    <div class="network-item clickable" onclick="app.operations.selectTarget('${net.bssid}', '${net.ssid}', ${net.channel})">
                        <div class="network-header">
                            <strong>${net.ssid || '(oculto)'}</strong>
                            <span>${this.getSignalIcon(net.rssi)}</span>
                        </div>
                        <div class="network-info">
                            <span>📍 ${net.bssid}</span>
                            <span>📡 CH${net.channel}</span>
                            <span>${this.getSecurityIcon(net.auth_mode)}</span>
                        </div>
                    </div>
                `).join('');

                this.showNotification(`✅ ${result.networks.length} targets encontrados`, 'success');
            }
        } catch (error) {
            console.error('Pentest scan failed:', error);
        }
    }

    selectTarget(bssid, ssid, channel) {
        // Auto-fill en todos los formularios de ataque
        document.getElementById('deauthBSSID').value = bssid;
        document.getElementById('rogueBSSID').value = bssid;
        document.getElementById('rogueSSID').value = ssid;
        document.getElementById('rogueChannel').value = channel;
        document.getElementById('pmkidBSSID').value = bssid;
        document.getElementById('pmkidChannel').value = channel;
        document.getElementById('dosBSSID').value = bssid;

        this.showNotification(`✅ Target seleccionado: ${ssid}`, 'success');
    }

    async deauthAttack() {
        const bssid = document.getElementById('deauthBSSID').value;
        const duration = parseInt(document.getElementById('deauthDuration').value) || 30;

        if (!bssid) {
            this.showNotification('⚠️ BSSID requerido', 'warning');
            return;
        }

        try {
            this.showNotification('💥 Iniciando ataque Deauth...', 'info');
            const result = await this.callMCP('self.wifi_pentest.deauth_attack', {
                target_bssid: bssid,
                duration_seconds: duration,
                frame_rate: 50
            });

            if (result.success) {
                this.activeAttack = 'deauth';
                this.startStatusMonitoring();
                this.showNotification('✅ Ataque Deauth iniciado', 'success');
            }
        } catch (error) {
            console.error('Deauth attack failed:', error);
        }
    }

    async rogueAP() {
        const bssid = document.getElementById('rogueBSSID').value;
        const ssid = document.getElementById('rogueSSID').value;
        const channel = parseInt(document.getElementById('rogueChannel').value) || 6;

        if (!bssid || !ssid) {
            this.showNotification('⚠️ BSSID y SSID requeridos', 'warning');
            return;
        }

        try {
            this.showNotification('📡 Iniciando Rogue AP...', 'info');
            const result = await this.callMCP('self.wifi_pentest.rogue_ap', {
                target_bssid: bssid,
                target_ssid: ssid,
                channel: channel,
                duration_seconds: 60
            });

            if (result.success) {
                this.activeAttack = 'rogue_ap';
                this.startStatusMonitoring();
                this.showNotification('✅ Rogue AP iniciado', 'success');
            }
        } catch (error) {
            console.error('Rogue AP failed:', error);
        }
    }

    async pmkidCapture() {
        const bssid = document.getElementById('pmkidBSSID').value;
        const channel = parseInt(document.getElementById('pmkidChannel').value) || 6;

        if (!bssid) {
            this.showNotification('⚠️ BSSID requerido', 'warning');
            return;
        }

        try {
            this.showNotification('🔑 Iniciando captura PMKID...', 'info');
            const result = await this.callMCP('self.wifi_pentest.pmkid_capture', {
                target_bssid: bssid,
                channel: channel,
                duration_seconds: 120
            });

            if (result.success) {
                this.activeAttack = 'pmkid';
                this.startStatusMonitoring();
                this.showNotification('✅ Captura PMKID iniciada', 'success');
            }
        } catch (error) {
            console.error('PMKID capture failed:', error);
        }
    }

    async dosAttack() {
        const bssid = document.getElementById('dosBSSID').value;

        if (!bssid) {
            this.showNotification('⚠️ BSSID requerido', 'warning');
            return;
        }

        try {
            this.showNotification('💣 Iniciando ataque DoS...', 'info');
            const result = await this.callMCP('self.wifi_pentest.dos_attack', {
                target_bssid: bssid,
                duration_seconds: 60
            });

            if (result.success) {
                this.activeAttack = 'dos';
                this.startStatusMonitoring();
                this.showNotification('✅ Ataque DoS iniciado', 'success');
            }
        } catch (error) {
            console.error('DoS attack failed:', error);
        }
    }

    async stopAttack() {
        try {
            this.showNotification('⏹️ Deteniendo ataque...', 'info');
            await this.callMCP('self.wifi_pentest.stop_attack');

            this.activeAttack = null;
            this.stopStatusMonitoring();
            this.showNotification('✅ Ataque detenido', 'success');
            document.getElementById('attackStatus').innerHTML = '';
        } catch (error) {
            console.error('Stop attack failed:', error);
        }
    }

    async exportCapture() {
        const format = document.getElementById('exportFormat').value;

        try {
            this.showNotification('💾 Exportando captura...', 'info');
            const result = await this.callMCP('self.wifi_pentest.export_capture', {
                format: format,
                base64_encode: true
            });

            if (result && result.data) {
                // Crear enlace de descarga
                const blob = this.base64ToBlob(result.data, 'application/octet-stream');
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `capture_${Date.now()}.${format.toLowerCase()}`;
                a.click();
                URL.revokeObjectURL(url);

                this.showNotification('✅ Captura exportada', 'success');
            }
        } catch (error) {
            console.error('Export failed:', error);
        }
    }

    startStatusMonitoring() {
        this.stopStatusMonitoring();
        this.statusInterval = setInterval(() => this.updateAttackStatus(), 2000);
    }

    stopStatusMonitoring() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
    }

    async updateAttackStatus() {
        try {
            const result = await this.callMCP('self.wifi_pentest.get_status');
            if (result) {
                const container = document.getElementById('attackStatus');
                container.innerHTML = `
                    <div class="status-item"><strong>Estado:</strong> ${result.state || 'Unknown'}</div>
                    <div class="status-item"><strong>Frames:</strong> ${result.frames_sent || 0}</div>
                    <div class="status-item"><strong>Tiempo:</strong> ${result.elapsed_time || 0}s</div>
                    <div class="status-item"><strong>Errores:</strong> ${result.error_count || 0}</div>
                `;
            }
        } catch (error) {
            // Silenciosamente fallar si el ataque terminó
        }
    }

    // Bluetooth Operations
    async bleScan() {
        this.showNotification('📲 Funcionalidad Bluetooth en desarrollo', 'info');
        // TODO: Implementar cuando esté disponible el MCP tool
    }

    // System Operations
    async systemInfo() {
        try {
            const result = await this.callMCP('self.get_device_status');
            const container = document.getElementById('systemInfo');

            if (result) {
                container.innerHTML = `<pre>${JSON.stringify(result, null, 2)}</pre>`;
                this.showNotification('✅ Info del sistema actualizada', 'success');
            }
        } catch (error) {
            console.error('System info failed:', error);
        }
    }

    async batteryInfo() {
        try {
            const result = await this.callMCP('self.battery.get_level');
            const container = document.getElementById('batteryInfo');

            if (result) {
                container.innerHTML = `
                    <div class="status-item"><strong>Nivel:</strong> ${result.level}%</div>
                    <div class="status-item"><strong>Cargando:</strong> ${result.charging ? 'Sí' : 'No'}</div>
                `;
                this.showNotification('✅ Info de batería actualizada', 'success');
            }
        } catch (error) {
            console.error('Battery info failed:', error);
        }
    }

    async setVolume(volume) {
        try {
            await this.callMCP('self.audio_speaker.set_volume', { volume });
            this.showNotification(`🔊 Volumen: ${volume}%`, 'success');
        } catch (error) {
            console.error('Set volume failed:', error);
        }
    }

    async setBrightness(brightness) {
        try {
            await this.callMCP('self.screen.set_brightness', { brightness });
            this.showNotification(`💡 Brillo: ${brightness}%`, 'success');
        } catch (error) {
            console.error('Set brightness failed:', error);
        }
    }

    async setTheme(theme) {
        try {
            await this.callMCP('self.screen.set_theme', { theme });
            this.showNotification(`🎨 Tema: ${theme}`, 'success');
        } catch (error) {
            console.error('Set theme failed:', error);
        }
    }

    async reboot() {
        if (!confirm('¿Estás seguro de reiniciar el dispositivo?')) return;

        try {
            this.showNotification('🔄 Reiniciando dispositivo...', 'warning');
            await this.callMCP('self.reboot');
        } catch (error) {
            console.error('Reboot failed:', error);
        }
    }

    // Helper methods
    getSignalIcon(rssi) {
        if (rssi > -50) return '📶📶📶📶';
        if (rssi > -60) return '📶📶📶';
        if (rssi > -70) return '📶📶';
        return '📶';
    }

    getSecurityIcon(authMode) {
        if (authMode === 0) return '🔓 Abierta';
        if (authMode === 2) return '🔒 WPA';
        if (authMode === 3) return '🔒 WPA2';
        if (authMode === 4) return '🔒 WPA/WPA2';
        if (authMode === 5) return '🔒 WPA3';
        return '🔐 Segura';
    }

    base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationArea');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        container.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// UI Renderer (adaptado del original)
class UIRenderer {
    constructor() {
        this.elements = {
            statusText: document.getElementById('statusText'),
            emotionDisplay: document.getElementById('emotionDisplay'),
            chatMessages: document.getElementById('chatMessages'),
            wsStatus: document.getElementById('wsStatus'),
            batteryInd: document.getElementById('batteryInd'),
            networkInd: document.getElementById('networkInd'),
            volumeInd: document.getElementById('volumeInd')
        };
    }

    renderStatus(status) {
        if (this.elements.statusText) {
            this.elements.statusText.textContent = status;
        }
    }

    renderEmotion(emotion) {
        if (this.elements.emotionDisplay) {
            this.elements.emotionDisplay.textContent = emotion;
        }
    }

    renderMessages(messages) {
        if (!this.elements.chatMessages) return;

        this.elements.chatMessages.innerHTML = '';
        messages.forEach(msg => this.addMessage(msg.role, msg.content));
        this.scrollToBottom();
    }

    addMessage(role, content) {
        if (!this.elements.chatMessages) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${role}`;
        msgDiv.textContent = content;

        this.elements.chatMessages.appendChild(msgDiv);
        this.scrollToBottom();
    }

    clearMessages() {
        if (this.elements.chatMessages) {
            this.elements.chatMessages.innerHTML = '';
        }
    }

    setConnectionStatus(connected) {
        if (this.elements.wsStatus) {
            const dot = this.elements.wsStatus.querySelector('.status-dot');
            const text = this.elements.wsStatus.querySelector('span:last-child');

            if (connected) {
                dot.className = 'status-dot online';
                text.textContent = 'Conectado';
            } else {
                dot.className = 'status-dot offline';
                text.textContent = 'Desconectado';
            }
        }
    }

    updateStatusBar(battery, network, volume) {
        if (battery && battery.level >= 0 && this.elements.batteryInd) {
            this.elements.batteryInd.textContent = battery.charging ? '🔌' : `🔋${battery.level}%`;
        }

        if (network && this.elements.networkInd) {
            const icons = {
                'wifi_strong': '📶📶📶',
                'wifi_weak': '📶📶',
                'disconnected': '📡',
                'unknown': '📶'
            };
            this.elements.networkInd.textContent = icons[network] || '📶';
        }

        if (volume >= 0 && this.elements.volumeInd) {
            const icon = volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊';
            this.elements.volumeInd.textContent = `${icon}${volume}%`;
        }
    }

    scrollToBottom() {
        if (this.elements.chatMessages) {
            this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
        }
    }
}

// Main application
class DisplayApp {
    constructor() {
        this.state = new DisplayState();
        this.renderer = new UIRenderer();
        this.operations = new OperationsPanel();

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
                }
                break;

            case 'clear_messages':
                this.state.clearMessages();
                this.renderer.clearMessages();
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
        this.renderer.renderMessages(this.state.messages);
        this.renderer.updateStatusBar(this.state.battery, this.state.network, this.state.volume);
    }
}

// Global app instance
let app;

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app = new DisplayApp();
    app.start();
});
