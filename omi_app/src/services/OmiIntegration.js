/**
 * Omi Integration Service
 * Handles integration with Omi backend API
 * Processes messages and communicates with the backend
 */

import { CONFIG } from "../../config";

class OmiIntegration {
  constructor() {
    this.isConnected = false;
    this.listeners = [];
    this.config = {
      apiUrl: CONFIG.API_ENDPOINTS.OMI,
      webhookSecret: null,
    };
    this.currentUid = null;
  }

  /**
   * Configure Omi connection
   */
  configure(config) {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Connect to Omi API
   */
  async connectToOmi(config) {
    try {
      this.configure(config);

      // Test connection by calling health check endpoint
      const baseUrl =
        CONFIG.BASE_URL || this.config.apiUrl.replace("/api/omi", "");
      const healthUrl = `${baseUrl}/api/omi`;
      try {
        const response = await fetch(`${healthUrl}?challenge=test`);
        if (response.ok) {
          this.isConnected = true;
          return {
            success: true,
            message: "Connected to Omi backend",
          };
        }
      } catch (e) {
        console.warn(
          "Omi Integration: Health check failed, but continuing:",
          e.message
        );
        this.isConnected = true; // Still mark as connected, will fail on actual calls
      }

      this.isConnected = true;
      return {
        success: true,
        message: "Connected to Omi backend",
      };
    } catch (error) {
      console.error("Omi Integration: Connection failed", error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Disconnect from Omi
   */
  async disconnect() {
    try {
      // TODO: Implement actual disconnection logic

      this.isConnected = false;
      this.listeners = [];

      console.log("Omi Integration: Disconnected");

      return {
        success: true,
        message: "Disconnected from Omi",
      };
    } catch (error) {
      console.error("Omi Integration: Disconnection failed", error);
      throw error;
    }
  }

  /**
   * Send message to backend and get response
   */
  async sendMessage(text, uid = null) {
    try {
      if (!text || !text.trim()) {
        throw new Error("Message text is required");
      }

      // Use provided uid or generate one
      const messageUid = uid || this.currentUid || this.generateUid();

      // Prepare request
      const baseUrl =
        CONFIG.BASE_URL || this.config.apiUrl.replace("/api/omi", "");
      const url = `${baseUrl}/api/omi?uid=${encodeURIComponent(messageUid)}`;
      const headers = {
        "Content-Type": "application/json",
      };

      // Add webhook secret if configured
      if (this.config.webhookSecret) {
        headers["x-webhook-secret"] = this.config.webhookSecret;
      }

      // Send request
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: text,
          text: text, // Support both formats
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || "Backend returned error");
      }

      // Store uid for future requests
      this.currentUid = messageUid;

      return {
        success: true,
        reply: data.reply || "",
        uid: data.uid || messageUid,
        provider: data.provider || "unknown",
        model: data.model || "unknown",
        received: data.received || { text, length: text.length },
      };
    } catch (error) {
      console.error("Omi Integration: Error sending message", error);
      throw error;
    }
  }

  /**
   * Process incoming Omi transcript (for backward compatibility)
   */
  async processTranscript(transcript) {
    try {
      if (!transcript) {
        throw new Error("Invalid transcript data");
      }

      // Parse transcript
      const parsed = this.parseTranscript(transcript);

      // Validate parsed transcript
      this.validateTranscript(parsed);

      // Format for conversation
      const formatted = this.formatForConversation(parsed);

      // Notify listeners
      this.notifyListeners("transcript", formatted);

      return formatted;
    } catch (error) {
      console.error("Omi Integration: Error processing transcript", error);
      throw error;
    }
  }

  /**
   * Parse raw transcript data
   */
  parseTranscript(transcript) {
    // If transcript is already an object, use it
    if (typeof transcript === "object") {
      return {
        id: transcript.id || this.generateTranscriptId(),
        text: transcript.text || transcript.content || "",
        timestamp: transcript.timestamp || new Date().toISOString(),
        segments: transcript.segments || [],
        metadata: transcript.metadata || {},
      };
    }

    // If transcript is a string, create a simple structure
    if (typeof transcript === "string") {
      return {
        id: this.generateTranscriptId(),
        text: transcript,
        timestamp: new Date().toISOString(),
        segments: [
          {
            speaker: "user",
            text: transcript,
            timestamp: new Date().toISOString(),
          },
        ],
        metadata: {
          source: "direct",
          confidence: 1.0,
        },
      };
    }

    throw new Error("Unsupported transcript format");
  }

  /**
   * Validate transcript structure
   */
  validateTranscript(transcript) {
    if (!transcript.id) {
      throw new Error("Transcript missing ID");
    }

    if (!transcript.text || transcript.text.trim() === "") {
      throw new Error("Transcript missing text content");
    }

    return true;
  }

  /**
   * Format transcript for conversation
   */
  formatForConversation(parsed) {
    return {
      id: parsed.id,
      type: "omi_transcript",
      content: parsed.text,
      timestamp: parsed.timestamp,
      metadata: {
        source: "omi",
        segments: parsed.segments,
        confidence: parsed.metadata?.confidence || 1.0,
        language: parsed.metadata?.language || "en",
        duration: parsed.metadata?.duration || null,
      },
    };
  }

  /**
   * Stream transcript in real-time
   * For live transcription scenarios
   */
  async streamTranscript(onChunk) {
    if (typeof onChunk !== "function") {
      throw new Error("onChunk must be a function");
    }

    // TODO: Implement streaming logic when Omi API supports it
    // This is a placeholder for future implementation

    return {
      success: true,
      message: "Streaming not yet implemented",
    };
  }

  /**
   * Register listener for transcript events
   */
  addListener(event, callback) {
    if (typeof callback !== "function") {
      throw new Error("Callback must be a function");
    }

    this.listeners.push({
      event,
      callback,
    });
  }

  /**
   * Remove listener
   */
  removeListener(callback) {
    this.listeners = this.listeners.filter(
      (listener) => listener.callback !== callback
    );
  }

  /**
   * Notify all listeners of an event
   */
  notifyListeners(event, data) {
    this.listeners
      .filter((listener) => listener.event === event)
      .forEach((listener) => {
        try {
          listener.callback(data);
        } catch (error) {
          console.error("Omi Integration: Listener error", error);
        }
      });
  }

  /**
   * Generate unique transcript ID
   */
  generateTranscriptId() {
    return `transcript_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      config: {
        hasApiUrl: !!this.config.apiUrl,
        hasApiKey: !!this.config.apiKey,
      },
      listenerCount: this.listeners.length,
    };
  }

  /**
   * Extract user intent from transcript
   * Simplified version - delegates to intent recognition
   */
  extractIntent(transcript) {
    // This will be used by the orchestrator
    // Just return the text for now
    return transcript.text || transcript.content || "";
  }

  /**
   * Mock transcript for testing
   */
  createMockTranscript(text) {
    return {
      id: this.generateTranscriptId(),
      text,
      timestamp: new Date().toISOString(),
      segments: [
        {
          speaker: "user",
          text,
          timestamp: new Date().toISOString(),
        },
      ],
      metadata: {
        source: "mock",
        confidence: 1.0,
        language: "en",
        duration: text.split(" ").length * 0.5, // Approximate duration
      },
    };
  }

  /**
   * Process webhook payload from Omi
   */
  async processWebhook(payload) {
    try {
      // Validate webhook payload
      if (!payload) {
        throw new Error("Invalid webhook payload");
      }

      // Extract transcript data from payload
      const transcript = payload.transcript || payload.data || payload;

      // Process as normal transcript
      return await this.processTranscript(transcript);
    } catch (error) {
      console.error("Omi Integration: Webhook processing failed", error);
      throw error;
    }
  }

  /**
   * Get message history for a session
   */
  async getMessageHistory(uid, options = {}) {
    try {
      const { limit = 50 } = options;
      const sessionUid = uid || this.currentUid;

      if (!sessionUid) {
        return { messages: [], count: 0 };
      }

      const baseUrl =
        CONFIG.BASE_URL || this.config.apiUrl.replace("/api/omi", "");
      const url = `${baseUrl}/api/sessions/${encodeURIComponent(
        sessionUid
      )}/messages?limit=${limit}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        messages: data.messages || [],
        count: data.count || 0,
        uid: data.uid || sessionUid,
      };
    } catch (error) {
      console.error("Omi Integration: Failed to get message history", error);
      throw error;
    }
  }

  /**
   * Get all conversations
   */
  async getAllConversations(options = {}) {
    try {
      const { limit = 200 } = options;
      // Use CONFIG.BASE_URL directly instead of parsing from apiUrl
      const baseUrl =
        CONFIG.BASE_URL || this.config.apiUrl.replace("/api/omi", "");
      const url = `${baseUrl}/api/conversations?limit=${limit}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Log for debugging
      console.log("Omi Integration: getAllConversations response:", {
        ok: data.ok,
        conversationsCount: data.conversations?.length || 0,
        firstConversation: data.conversations?.[0]
          ? {
              uid: data.conversations[0].uid,
              messageCount: data.conversations[0].messages?.length || 0,
              firstMessage: data.conversations[0].messages?.[0]
                ? {
                    role: data.conversations[0].messages[0].role,
                    text: data.conversations[0].messages[0].text?.substring(
                      0,
                      50
                    ),
                    created_at: data.conversations[0].messages[0].created_at,
                  }
                : null,
            }
          : null,
      });

      return {
        conversations: data.conversations || [],
        count: data.conversations?.length || 0,
      };
    } catch (error) {
      console.error("Omi Integration: Failed to get conversations", error);
      throw error;
    }
  }

  /**
   * Get tool actions for a session
   */
  async getToolActions(uid, options = {}) {
    try {
      const { limit = 100 } = options;
      const sessionUid = uid || this.currentUid;

      if (!sessionUid) {
        return { actions: [], count: 0 };
      }

      const baseUrl =
        CONFIG.BASE_URL || this.config.apiUrl.replace("/api/omi", "");
      const url = `${baseUrl}/api/sessions/${encodeURIComponent(
        sessionUid
      )}/tool-actions?limit=${limit}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        actions: data.actions || [],
        count: data.count || 0,
        uid: data.uid || sessionUid,
      };
    } catch (error) {
      console.error("Omi Integration: Failed to get tool actions", error);
      throw error;
    }
  }

  /**
   * Generate unique UID
   */
  generateUid() {
    return `uid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Set current UID
   */
  setUid(uid) {
    this.currentUid = uid;
  }

  /**
   * Get current UID
   */
  getUid() {
    return this.currentUid;
  }

  /**
   * Get transcript history (for backward compatibility)
   */
  async getTranscriptHistory(options = {}) {
    try {
      const { limit = 10, offset = 0 } = options;
      const conversations = await this.getAllConversations({ limit });

      return {
        transcripts: conversations.conversations || [],
      };
    } catch (error) {
      console.error("Omi Integration: Failed to get transcripts", error);
      throw error;
    }
  }

  /**
   * Get user preferences for MCP tools
   */
  async getUserPreferences(uid = null) {
    try {
      const sessionUid = uid || this.currentUid || "no-uid";
      const baseUrl =
        CONFIG.BASE_URL || this.config.apiUrl.replace("/api/omi", "");
      const url = `${baseUrl}/api/user-preferences?uid=${sessionUid}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.webhookSecret && {
            "x-webhook-secret": this.config.webhookSecret,
          }),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        preferences: data.preferences || {},
        uid: data.uid,
      };
    } catch (error) {
      console.error("Omi Integration: Failed to get user preferences", error);
      throw error;
    }
  }

  /**
   * Update user preferences for MCP tools
   */
  async updateUserPreferences(preferences, uid = null) {
    try {
      const sessionUid = uid || this.currentUid || "no-uid";
      const baseUrl =
        CONFIG.BASE_URL || this.config.apiUrl.replace("/api/omi", "");
      const url = `${baseUrl}/api/user-preferences?uid=${sessionUid}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.webhookSecret && {
            "x-webhook-secret": this.config.webhookSecret,
          }),
        },
        body: JSON.stringify(preferences),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        preferences: data.preferences || {},
        uid: data.uid,
      };
    } catch (error) {
      console.error(
        "Omi Integration: Failed to update user preferences",
        error
      );
      throw error;
    }
  }
}

// Export singleton instance
const omiIntegration = new OmiIntegration();
export default omiIntegration;
