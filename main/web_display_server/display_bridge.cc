#include "display_bridge.h"
#include <esp_timer.h>
#include <esp_log.h>
#include <sstream>

static const char* TAG = "DisplayBridge";

DisplayBridge::DisplayBridge(Display* wrapped, WebDisplayServer* server)
    : wrapped_display_(wrapped), web_server_(server) {
    if (wrapped_display_) {
        width_ = wrapped_display_->width();
        height_ = wrapped_display_->height();
        current_theme_ = wrapped_display_->GetTheme();
    }
}

DisplayBridge::~DisplayBridge() {
    // Don't delete wrapped_display_ - we don't own it
}

void DisplayBridge::SetStatus(const char* status) {
    if (wrapped_display_) {
        wrapped_display_->SetStatus(status);
    }

    std::lock_guard<std::mutex> lock(state_mutex_);
    current_state_.status = status ? status : "";

    if (web_server_) {
        web_server_->BroadcastStateUpdate("status", current_state_.status);
    }
}

void DisplayBridge::ShowNotification(const char* notification, int duration_ms) {
    if (wrapped_display_) {
        wrapped_display_->ShowNotification(notification, duration_ms);
    }

    std::lock_guard<std::mutex> lock(state_mutex_);
    current_state_.notification = notification ? notification : "";
    current_state_.notification_expire_time = esp_timer_get_time() + (duration_ms * 1000LL);

    if (web_server_) {
        std::string escaped = EscapeJson(current_state_.notification);
        std::string msg = "{\"type\":\"notification\",\"message\":\"" + escaped +
                         "\",\"duration\":" + std::to_string(duration_ms) + "}";
        web_server_->BroadcastFullState(msg);
    }
}

void DisplayBridge::ShowNotification(const std::string& notification, int duration_ms) {
    ShowNotification(notification.c_str(), duration_ms);
}

void DisplayBridge::SetEmotion(const char* emotion) {
    if (wrapped_display_) {
        wrapped_display_->SetEmotion(emotion);
    }

    std::lock_guard<std::mutex> lock(state_mutex_);
    current_state_.emotion = emotion ? emotion : "";

    if (web_server_) {
        web_server_->BroadcastStateUpdate("emotion", current_state_.emotion);
    }
}

void DisplayBridge::SetChatMessage(const char* role, const char* content) {
    if (wrapped_display_) {
        wrapped_display_->SetChatMessage(role, content);
    }

    std::lock_guard<std::mutex> lock(state_mutex_);

    ChatMessage msg;
    msg.role = role ? role : "";
    msg.content = content ? content : "";
    current_state_.messages.push_back(msg);

    // Limit message history
    if (current_state_.messages.size() > max_messages_) {
        current_state_.messages.erase(current_state_.messages.begin());
    }

    if (web_server_) {
        web_server_->BroadcastChatMessage(msg.role, msg.content);
    }
}

void DisplayBridge::ClearChatMessages() {
    if (wrapped_display_) {
        wrapped_display_->ClearChatMessages();
    }

    std::lock_guard<std::mutex> lock(state_mutex_);
    current_state_.messages.clear();

    if (web_server_) {
        web_server_->BroadcastClearMessages();
    }
}

void DisplayBridge::SetTheme(Theme* theme) {
    if (wrapped_display_) {
        wrapped_display_->SetTheme(theme);
    }

    current_theme_ = theme;

    std::lock_guard<std::mutex> lock(state_mutex_);
    current_state_.theme = theme ? theme->name() : "dark";

    if (web_server_) {
        web_server_->BroadcastStateUpdate("theme", current_state_.theme);
    }
}

Theme* DisplayBridge::GetTheme() {
    return current_theme_;
}

void DisplayBridge::UpdateStatusBar(bool update_all) {
    if (wrapped_display_) {
        wrapped_display_->UpdateStatusBar(update_all);
    }

    // Update cached status bar info
    std::lock_guard<std::mutex> lock(state_mutex_);
    UpdateBatteryStatus();
    UpdateNetworkStatus();
    UpdateVolumeStatus();

    // Broadcast full status bar update
    if (web_server_) {
        std::ostringstream json;
        json << "{\"type\":\"status_bar\",\"battery\":{\"level\":" << current_state_.battery_level
             << ",\"charging\":" << (current_state_.battery_charging ? "true" : "false")
             << "},\"network\":\"" << current_state_.network_status
             << "\",\"volume\":" << current_state_.volume << "}";
        web_server_->BroadcastFullState(json.str());
    }
}

void DisplayBridge::SetPowerSaveMode(bool on) {
    if (wrapped_display_) {
        wrapped_display_->SetPowerSaveMode(on);
    }
}

void DisplayBridge::SetupUI() {
    if (wrapped_display_) {
        wrapped_display_->SetupUI();
    }
}

bool DisplayBridge::Lock(int timeout_ms) {
    if (wrapped_display_) {
        return wrapped_display_->Lock(timeout_ms);
    }
    return true;
}

void DisplayBridge::Unlock() {
    if (wrapped_display_) {
        wrapped_display_->Unlock();
    }
}

std::string DisplayBridge::GetFullStateJson() {
    std::lock_guard<std::mutex> lock(state_mutex_);

    // Update latest status
    UpdateBatteryStatus();
    UpdateNetworkStatus();
    UpdateVolumeStatus();

    std::ostringstream json;
    json << "{\"type\":\"full_state\",\"data\":{";
    json << "\"status\":\"" << EscapeJson(current_state_.status) << "\",";
    json << "\"emotion\":\"" << EscapeJson(current_state_.emotion) << "\",";
    json << "\"theme\":\"" << current_state_.theme << "\",";
    json << "\"battery\":{\"level\":" << current_state_.battery_level
         << ",\"charging\":" << (current_state_.battery_charging ? "true" : "false") << "},";
    json << "\"network\":\"" << current_state_.network_status << "\",";
    json << "\"volume\":" << current_state_.volume << ",";
    json << "\"messages\":[";

    for (size_t i = 0; i < current_state_.messages.size(); i++) {
        if (i > 0) json << ",";
        json << "{\"role\":\"" << EscapeJson(current_state_.messages[i].role)
             << "\",\"content\":\"" << EscapeJson(current_state_.messages[i].content) << "\"}";
    }

    json << "]}}";
    return json.str();
}

void DisplayBridge::UpdateBatteryStatus() {
    // This will be populated from Board battery info in a future update
    // For now, set default values
    current_state_.battery_level = -1;  // -1 means unknown
    current_state_.battery_charging = false;
}

void DisplayBridge::UpdateNetworkStatus() {
    // This will be populated from Board network info in a future update
    // For now, set default
    current_state_.network_status = "unknown";
}

void DisplayBridge::UpdateVolumeStatus() {
    // This will be populated from AudioCodec volume in a future update
    // For now, set default
    current_state_.volume = -1;  // -1 means unknown
}

std::string DisplayBridge::EscapeJson(const std::string& str) {
    std::string result;
    for (char c : str) {
        switch (c) {
            case '"': result += "\\\""; break;
            case '\\': result += "\\\\"; break;
            case '\n': result += "\\n"; break;
            case '\r': result += "\\r"; break;
            case '\t': result += "\\t"; break;
            case '\b': result += "\\b"; break;
            case '\f': result += "\\f"; break;
            default: result += c; break;
        }
    }
    return result;
}
