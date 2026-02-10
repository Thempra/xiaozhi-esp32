#include "web_display_server.h"
#include <esp_http_server.h>
#include <esp_log.h>
#include <esp_timer.h>
#include <sys/param.h>
#include <cstring>

static const char* TAG = "WebDisplay";

// External declarations for embedded assets
extern const uint8_t index_html_start[] asm("_binary_index_html_start");
extern const uint8_t index_html_end[] asm("_binary_index_html_end");
extern const uint8_t display_css_start[] asm("_binary_display_css_start");
extern const uint8_t display_css_end[] asm("_binary_display_css_end");
extern const uint8_t display_js_start[] asm("_binary_display_js_start");
extern const uint8_t display_js_end[] asm("_binary_display_js_end");

WebDisplayServer::WebDisplayServer() {
}

WebDisplayServer::~WebDisplayServer() {
    Stop();
}

bool WebDisplayServer::Start(int port) {
    if (server_ != nullptr) {
        ESP_LOGW(TAG, "Server already running");
        return true;
    }

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = port;
    config.max_open_sockets = 7;
    config.ctrl_port = port + 1;

    // Register URI handlers
    httpd_uri_t index_uri = {
        .uri = "/",
        .method = HTTP_GET,
        .handler = IndexHandler,
        .user_ctx = this
    };

    httpd_uri_t css_uri = {
        .uri = "/display.css",
        .method = HTTP_GET,
        .handler = CssHandler,
        .user_ctx = this
    };

    httpd_uri_t js_uri = {
        .uri = "/display.js",
        .method = HTTP_GET,
        .handler = JsHandler,
        .user_ctx = this
    };

    httpd_uri_t api_state_uri = {
        .uri = "/api/display/state",
        .method = HTTP_GET,
        .handler = ApiStateHandler,
        .user_ctx = this
    };

    httpd_uri_t ws_uri = {
        .uri = "/ws/display",
        .method = HTTP_GET,
        .handler = WsHandler,
        .user_ctx = this,
        .is_websocket = true
    };

    if (httpd_start(&server_, &config) == ESP_OK) {
        httpd_register_uri_handler(server_, &index_uri);
        httpd_register_uri_handler(server_, &css_uri);
        httpd_register_uri_handler(server_, &js_uri);
        httpd_register_uri_handler(server_, &api_state_uri);
        httpd_register_uri_handler(server_, &ws_uri);
        ESP_LOGI(TAG, "Web Display Server started on port %d", port);
        return true;
    }

    ESP_LOGE(TAG, "Failed to start Web Display Server");
    return false;
}

void WebDisplayServer::Stop() {
    if (server_) {
        httpd_stop(server_);
        server_ = nullptr;
        std::lock_guard<std::mutex> lock(clients_mutex_);
        clients_.clear();
        ESP_LOGI(TAG, "Web Display Server stopped");
    }
}

esp_err_t WebDisplayServer::IndexHandler(httpd_req_t* req) {
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, (const char*)index_html_start, index_html_end - index_html_start);
    return ESP_OK;
}

esp_err_t WebDisplayServer::CssHandler(httpd_req_t* req) {
    httpd_resp_set_type(req, "text/css");
    httpd_resp_send(req, (const char*)display_css_start, display_css_end - display_css_start);
    return ESP_OK;
}

esp_err_t WebDisplayServer::JsHandler(httpd_req_t* req) {
    httpd_resp_set_type(req, "application/javascript");
    httpd_resp_send(req, (const char*)display_js_start, display_js_end - display_js_start);
    return ESP_OK;
}

esp_err_t WebDisplayServer::ApiStateHandler(httpd_req_t* req) {
    WebDisplayServer* server = GetServerFromReq(req);
    if (!server) {
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }

    // This will be implemented via DisplayBridge::GetFullStateJson()
    // For now, return empty state
    const char* empty_state = "{\"type\":\"full_state\",\"data\":{}}";
    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, empty_state, strlen(empty_state));
    return ESP_OK;
}

esp_err_t WebDisplayServer::WsHandler(httpd_req_t* req) {
    WebDisplayServer* server = GetServerFromReq(req);
    if (!server) {
        return ESP_FAIL;
    }

    if (req->method == HTTP_GET) {
        // New WebSocket connection
        int fd = httpd_req_to_sockfd(req);
        ESP_LOGI(TAG, "WebSocket handshake for fd %d", fd);
        server->AddClient(fd);

        // Send initial state to the new client
        if (server->get_state_callback_) {
            std::string state = server->get_state_callback_();

            httpd_ws_frame_t ws_pkt;
            memset(&ws_pkt, 0, sizeof(httpd_ws_frame_t));
            ws_pkt.type = HTTPD_WS_TYPE_TEXT;
            ws_pkt.payload = (uint8_t*)state.c_str();
            ws_pkt.len = state.length();

            esp_err_t ret = httpd_ws_send_frame_async(server->server_, fd, &ws_pkt);
            if (ret != ESP_OK) {
                ESP_LOGW(TAG, "Failed to send initial state to new client fd=%d: %d", fd, ret);
            }
        }

        return ESP_OK;
    }

    // Handle incoming WebSocket frames
    httpd_ws_frame_t ws_pkt;
    uint8_t* buf = nullptr;
    memset(&ws_pkt, 0, sizeof(httpd_ws_frame_t));
    ws_pkt.type = HTTPD_WS_TYPE_TEXT;

    // Get frame length
    esp_err_t ret = httpd_ws_recv_frame(req, &ws_pkt, 0);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "httpd_ws_recv_frame failed to get frame len with %d", ret);
        return ret;
    }

    if (ws_pkt.len) {
        buf = (uint8_t*)calloc(1, ws_pkt.len + 1);
        if (buf == nullptr) {
            ESP_LOGE(TAG, "Failed to calloc memory for buf");
            return ESP_ERR_NO_MEM;
        }
        ws_pkt.payload = buf;
        ret = httpd_ws_recv_frame(req, &ws_pkt, ws_pkt.len);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "httpd_ws_recv_frame failed with %d", ret);
            free(buf);
            return ret;
        }
    }

    if (ws_pkt.type == HTTPD_WS_TYPE_CLOSE) {
        ESP_LOGI(TAG, "WebSocket close frame received");
        int fd = httpd_req_to_sockfd(req);
        server->RemoveClient(fd);
        free(buf);
        return ESP_OK;
    }

    if (ws_pkt.type == HTTPD_WS_TYPE_TEXT && ws_pkt.len > 0 && buf) {
        buf[ws_pkt.len] = '\0';
        ESP_LOGI(TAG, "Received WS message: %s", buf);

        // Handle client messages (e.g., {"type":"get_state"})
        // For now, just log it
    }

    free(buf);
    return ESP_OK;
}

void WebDisplayServer::AddClient(int fd) {
    std::lock_guard<std::mutex> lock(clients_mutex_);

    if (clients_.size() >= max_clients_) {
        ESP_LOGW(TAG, "Max clients reached (%d), rejecting new connection", max_clients_);
        return;
    }

    WebSocketClient client;
    client.fd = fd;
    client.last_ping_time = esp_timer_get_time();
    clients_.push_back(client);
    ESP_LOGI(TAG, "Client connected: fd=%d, total=%d", fd, (int)clients_.size());
}

void WebDisplayServer::RemoveClient(int fd) {
    std::lock_guard<std::mutex> lock(clients_mutex_);

    auto it = std::remove_if(clients_.begin(), clients_.end(),
                             [fd](const WebSocketClient& c) { return c.fd == fd; });
    if (it != clients_.end()) {
        clients_.erase(it, clients_.end());
        ESP_LOGI(TAG, "Client removed: fd=%d, total=%d", fd, (int)clients_.size());
    }
}

void WebDisplayServer::BroadcastToClients(const std::string& message) {
    if (!server_) {
        return;
    }

    std::lock_guard<std::mutex> lock(clients_mutex_);

    ESP_LOGI(TAG, "Broadcasting to %d clients, msg_len=%d", (int)clients_.size(), (int)message.length());

    httpd_ws_frame_t ws_pkt;
    memset(&ws_pkt, 0, sizeof(httpd_ws_frame_t));
    ws_pkt.type = HTTPD_WS_TYPE_TEXT;
    ws_pkt.payload = (uint8_t*)message.c_str();
    ws_pkt.len = message.length();

    for (auto& client : clients_) {
        esp_err_t ret = httpd_ws_send_frame_async(server_, client.fd, &ws_pkt);
        if (ret != ESP_OK) {
            ESP_LOGW(TAG, "Failed to send to client fd=%d: %d", client.fd, ret);
        }
    }
}

void WebDisplayServer::BroadcastFullState(const std::string& json) {
    BroadcastToClients(json);
}

void WebDisplayServer::BroadcastChatMessage(const std::string& role, const std::string& content) {
    ESP_LOGI(TAG, "BroadcastChatMessage: role=%s, content_len=%d", role.c_str(), (int)content.length());

    // Escape JSON strings
    std::string escaped_content;
    for (char c : content) {
        switch (c) {
            case '"': escaped_content += "\\\""; break;
            case '\\': escaped_content += "\\\\"; break;
            case '\n': escaped_content += "\\n"; break;
            case '\r': escaped_content += "\\r"; break;
            case '\t': escaped_content += "\\t"; break;
            default: escaped_content += c; break;
        }
    }

    std::string msg = "{\"type\":\"chat_message\",\"role\":\"" + role +
                     "\",\"content\":\"" + escaped_content + "\"}";
    BroadcastToClients(msg);
}

void WebDisplayServer::BroadcastStateUpdate(const std::string& field, const std::string& value) {
    ESP_LOGI(TAG, "BroadcastStateUpdate: field=%s, value=%s", field.c_str(), value.c_str());
    std::string msg = "{\"type\":\"state_update\",\"field\":\"" + field +
                     "\",\"value\":\"" + value + "\"}";
    BroadcastToClients(msg);
}

void WebDisplayServer::BroadcastClearMessages() {
    std::string msg = "{\"type\":\"clear_messages\"}";
    BroadcastToClients(msg);
}

WebDisplayServer* WebDisplayServer::GetServerFromReq(httpd_req_t* req) {
    return static_cast<WebDisplayServer*>(req->user_ctx);
}
