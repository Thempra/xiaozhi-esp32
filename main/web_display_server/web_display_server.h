#ifndef WEB_DISPLAY_SERVER_H
#define WEB_DISPLAY_SERVER_H

#include <esp_http_server.h>
#include <esp_log.h>
#include <vector>
#include <string>
#include <mutex>
#include <functional>
#include <algorithm>

struct WebSocketClient {
    int fd;
    uint64_t last_ping_time;
};

class WebDisplayServer {
public:
    WebDisplayServer();
    ~WebDisplayServer();

    bool Start(int port = 8080);
    void Stop();
    bool IsRunning() const { return server_ != nullptr; }

    // Set callback to get full state for new clients
    void SetGetStateCallback(std::function<std::string()> callback) {
        get_state_callback_ = callback;
    }

    // Broadcast methods for display updates
    void BroadcastFullState(const std::string& json);
    void BroadcastChatMessage(const std::string& role, const std::string& content);
    void BroadcastStateUpdate(const std::string& field, const std::string& value);
    void BroadcastClearMessages();

private:
    httpd_handle_t server_ = nullptr;
    std::vector<WebSocketClient> clients_;
    std::mutex clients_mutex_;
    int max_clients_ = CONFIG_WEB_DISPLAY_MAX_CLIENTS;
    std::function<std::string()> get_state_callback_;

    // HTTP handlers
    static esp_err_t IndexHandler(httpd_req_t* req);
    static esp_err_t CssHandler(httpd_req_t* req);
    static esp_err_t JsHandler(httpd_req_t* req);
    static esp_err_t ApiStateHandler(httpd_req_t* req);
    static esp_err_t WsHandler(httpd_req_t* req);

    // WebSocket helpers
    void AddClient(int fd);
    void RemoveClient(int fd);
    void BroadcastToClients(const std::string& message);

    // Helper to get server instance from request
    static WebDisplayServer* GetServerFromReq(httpd_req_t* req);
};

#endif // WEB_DISPLAY_SERVER_H
