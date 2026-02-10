#ifndef DISPLAY_BRIDGE_H
#define DISPLAY_BRIDGE_H

#include "display/display.h"
#include "web_display_server.h"
#include <string>
#include <vector>
#include <mutex>

struct ChatMessage {
    std::string role;
    std::string content;
};

struct DisplayState {
    std::string status;
    std::string emotion;
    std::string theme;
    int battery_level = -1;
    bool battery_charging = false;
    std::string network_status;
    int volume = -1;
    std::vector<ChatMessage> messages;
    std::string notification;
    int64_t notification_expire_time = 0;
};

class DisplayBridge : public Display {
public:
    DisplayBridge(Display* wrapped, WebDisplayServer* server);
    virtual ~DisplayBridge();

    // Override Display methods to intercept and broadcast changes
    void SetStatus(const char* status) override;
    void ShowNotification(const char* notification, int duration_ms = 3000) override;
    void ShowNotification(const std::string& notification, int duration_ms = 3000) override;
    void SetEmotion(const char* emotion) override;
    void SetChatMessage(const char* role, const char* content) override;
    void ClearChatMessages() override;
    void SetTheme(Theme* theme) override;
    Theme* GetTheme() override;
    void UpdateStatusBar(bool update_all = false) override;
    void SetPowerSaveMode(bool on) override;
    void SetupUI() override;

    // Get current state for new clients
    std::string GetFullStateJson();

protected:
    bool Lock(int timeout_ms = 0) override;
    void Unlock() override;

private:
    Display* wrapped_display_;
    WebDisplayServer* web_server_;
    DisplayState current_state_;
    std::mutex state_mutex_;
    int max_messages_ = 40;

    // Helper methods
    void UpdateBatteryStatus();
    void UpdateNetworkStatus();
    void UpdateVolumeStatus();
    std::string EscapeJson(const std::string& str);
    std::string EmotionToEmoji(const std::string& emotion);
};

#endif // DISPLAY_BRIDGE_H
