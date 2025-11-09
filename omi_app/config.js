/**
 * Application configuration
 * Environment variables and app settings
 *
 * IMPORTANT: Change BASE_URL to your backend server URL
 * For mobile devices, use your computer's IP address instead of localhost
 * Example: "http://192.168.1.100:3000" or "http://10.0.2.2:3000" (Android emulator)
 */

// Change this to your backend server URL
const BASE_URL = "https://23eda7f96e35.ngrok-free.app";

export const CONFIG = {
  // Base URL for all API calls - CHANGE THIS to your backend URL
  BASE_URL: BASE_URL,

  // API Endpoints
  API_ENDPOINTS: {
    // Backend OMI API endpoint
    OMI: `${BASE_URL}/api/omi`,
    // Backend endpoints for history
    SESSIONS: `${BASE_URL}/api/sessions`,
    CONVERSATIONS: `${BASE_URL}/api/conversations`,
    TOOL_ACTIONS: `${BASE_URL}/api/tool-actions`,
  },

  // AsyncStorage keys
  STORAGE_KEYS: {
    CONVERSATIONS: "@mcp_conversations",
    SETTINGS: "@mcp_settings",
    USER_PREFERENCES: "@mcp_user_preferences",
  },

  // App settings
  APP: {
    MAX_MESSAGE_LENGTH: 5000,
    MAX_CONVERSATIONS_STORED: 100,
    AUTO_SAVE_INTERVAL: 5000, // 5 seconds
    TYPING_INDICATOR_DELAY: 800,
  },

  // MCP settings
  MCP: {
    MAX_CONCURRENT_WORKFLOWS: 3,
    WORKFLOW_TIMEOUT: 30000, // 30 seconds
    RETRY_ATTEMPTS: 3,
  },
};

export default CONFIG;
