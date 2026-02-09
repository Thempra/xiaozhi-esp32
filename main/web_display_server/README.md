# Web Display Server

This component provides a web-based interface that mirrors the LCD display of the ESP32 device. It allows users to view the device's display content from a web browser on the local network.

## Features

- **Real-time synchronization**: Display content is synchronized to web browsers in real-time via WebSocket
- **Responsive UI**: Works on desktop and mobile browsers
- **Low overhead**: Optional feature that can be disabled to save resources
- **Multiple clients**: Supports up to 3 simultaneous web browser connections (configurable)

## Architecture

The web display server uses a **DisplayBridge** pattern that wraps the physical LCD display:

```
Application → DisplayBridge → Physical LCD Display
                    ↓
              WebDisplayServer → WebSocket Clients
```

- **DisplayBridge**: Intercepts display updates and forwards them to both the physical display and web clients
- **WebDisplayServer**: HTTP+WebSocket server that serves the web UI and handles client connections
- **Frontend**: Vanilla HTML/CSS/JavaScript embedded in ESP32 flash memory

## Configuration

Enable the web display server in menuconfig:

```
Component config → Web Display Server
├── Enable Web Display Server [*]
├── Web Server Port (8080)
└── Max WebSocket Clients (3)
```

## Usage

1. Enable the feature in menuconfig
2. Build and flash the firmware
3. Connect your ESP32 to WiFi
4. Open a web browser and navigate to `http://[ESP32_IP]:8080`
5. The web interface will show the same content as the LCD display

## Resource Usage

When enabled:
- **Flash (ROM)**: ~60KB (HTML/CSS/JS assets + code)
- **RAM**: ~26KB (state cache + WebSocket buffers)
- **CPU**: <5% during updates, <1% idle

## Implementation Details

### DisplayBridge

The `DisplayBridge` class wraps any `Display` implementation and:
- Forwards all calls to the wrapped display (transparent wrapper)
- Caches current state (status, messages, theme, etc.)
- Broadcasts updates to web clients via WebSocket
- Provides full state JSON for newly connected clients

### WebDisplayServer

The server provides:
- HTTP endpoints:
  - `GET /` - Main web interface (index.html)
  - `GET /display.css` - Stylesheet
  - `GET /display.js` - JavaScript client
  - `GET /api/display/state` - REST API for current state (fallback)
- WebSocket endpoint:
  - `WS /ws/display` - Real-time updates

### Protocol

WebSocket messages (Server → Client):

```json
// Full state (on connect)
{"type": "full_state", "data": {
  "status": "Idle",
  "emotion": "😊",
  "theme": "dark",
  "battery": {"level": 85, "charging": false},
  "network": "wifi_strong",
  "volume": 50,
  "messages": [{"role": "user", "content": "Hello"}]
}}

// Incremental updates
{"type": "chat_message", "role": "assistant", "content": "Hi!"}
{"type": "state_update", "field": "status", "value": "Listening"}
{"type": "clear_messages"}
{"type": "notification", "message": "Connected", "duration": 3000}
```

## Files

- `web_display_server.h/cc` - HTTP+WebSocket server implementation
- `display_bridge.h/cc` - Display wrapper with web synchronization
- `assets/index.html` - Web UI structure
- `assets/display.css` - Styling and themes
- `assets/display.js` - WebSocket client and rendering logic

## Future Enhancements

Possible improvements:
- Authentication (Basic Auth or token-based)
- HTTPS support for secure connections
- Control interface (not just display mirroring)
- Recording/playback of display history
- Multi-language UI
