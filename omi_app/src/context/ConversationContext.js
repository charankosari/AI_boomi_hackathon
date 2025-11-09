/**
 * Conversation Context
 * Manages global conversation state and provides actions
 * for message management and conversation operations
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import omiIntegration from "../services/OmiIntegration";

const ConversationContext = createContext();

export const useConversation = () => {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error("useConversation must be used within ConversationProvider");
  }
  return context;
};

export const ConversationProvider = ({ children }) => {
  const [currentConversation, setCurrentConversation] = useState(null);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load conversation history on mount
  useEffect(() => {
    loadConversationHistory();
    // Initialize OMI integration
    omiIntegration.connectToOmi().catch((err) => {
      console.warn("Failed to connect to OMI backend:", err);
    });
  }, []);

  /**
   * Load conversation history from backend only (no local storage)
   */
  const loadConversationHistory = async () => {
    try {
      setIsLoading(true);

      // Load from backend only
      const backendData = await omiIntegration.getAllConversations({
        limit: 200,
      });

      if (backendData.conversations && backendData.conversations.length > 0) {
        // Convert backend conversations to app format
        // Backend format: { uid: "...", messages: [{ role, text, created_at }], count: N }
        // Same format as HTML dashboard uses
        const backendConversations = backendData.conversations.map((conv) => {
          // Backend messages have: role, text, created_at (exactly like HTML dashboard)
          // Backend messages are sorted newest first, so reverse to show oldest first, newest last (like chat app)
          const messages = (conv.messages || [])
            .map((msg) => convertBackendMessage(msg))
            .reverse();

          // Debug log for first conversation
          if (backendData.conversations.indexOf(conv) === 0) {
            console.log("First conversation:", {
              uid: conv.uid,
              messageCount: conv.messages?.length || 0,
              messages: conv.messages?.slice(0, 2).map((m) => ({
                role: m.role,
                text: m.text?.substring(0, 50),
                created_at: m.created_at,
              })),
              convertedMessages: messages.slice(0, 2).map((m) => ({
                type: m.type,
                content: m.content?.substring(0, 50),
                timestamp: m.timestamp,
              })),
            });
          }

          // Get the first message timestamp or use current time
          // Backend messages use created_at, convertBackendMessage converts to timestamp
          const firstMessage = messages.find((m) => m.type === "user");
          const timestamp =
            firstMessage?.timestamp ||
            messages[0]?.timestamp ||
            new Date().toISOString();

          return {
            id: conv.uid || generateConversationId(),
            uid: conv.uid,
            timestamp: timestamp,
            messages: messages, // Already converted by convertBackendMessage
            workflows: [],
            metadata: {
              totalMessages: messages.length,
              mcpsUsed: [],
              duration: 0,
            },
          };
        });

        // Sort by timestamp (oldest first, newest last - latest at bottom)
        backendConversations.sort(
          (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );

        setConversationHistory(backendConversations);

        // Set the most recent conversation as current (now at the end of the list)
        if (backendConversations.length > 0) {
          const mostRecentConversation =
            backendConversations[backendConversations.length - 1];
          setCurrentConversation(mostRecentConversation);
          if (mostRecentConversation.uid) {
            omiIntegration.setUid(mostRecentConversation.uid);
          }
        } else {
          // Start a new conversation if no backend conversations
          const newConversation = {
            id: generateConversationId(),
            timestamp: new Date().toISOString(),
            messages: [],
            workflows: [],
            metadata: {
              totalMessages: 0,
              mcpsUsed: [],
              duration: 0,
            },
          };
          setCurrentConversation(newConversation);
        }
      } else {
        // No conversations from backend
        setConversationHistory([]);
        // Start a new conversation
        const newConversation = {
          id: generateConversationId(),
          timestamp: new Date().toISOString(),
          messages: [],
          workflows: [],
          metadata: {
            totalMessages: 0,
            mcpsUsed: [],
            duration: 0,
          },
        };
        setCurrentConversation(newConversation);
      }
    } catch (error) {
      console.error("Error loading conversation history from backend:", error);
      // On error, show empty state
      setConversationHistory([]);
      const newConversation = {
        id: generateConversationId(),
        timestamp: new Date().toISOString(),
        messages: [],
        workflows: [],
        metadata: {
          totalMessages: 0,
          mcpsUsed: [],
          duration: 0,
        },
      };
      setCurrentConversation(newConversation);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Start a new conversation
   */
  const startNewConversation = useCallback(() => {
    const newUid = omiIntegration.generateUid();
    const newConversation = {
      id: generateConversationId(),
      uid: newUid, // Store backend UID
      timestamp: new Date().toISOString(),
      messages: [],
      workflows: [],
      metadata: {
        totalMessages: 0,
        mcpsUsed: [],
        duration: 0,
      },
    };

    omiIntegration.setUid(newUid);
    setCurrentConversation(newConversation);
    return newConversation;
  }, []);

  /**
   * Add a message to the current conversation
   */
  const addMessage = useCallback(
    async (message) => {
      if (!currentConversation) {
        startNewConversation();
      }

      const newMessage = {
        id: generateMessageId(),
        timestamp: new Date().toISOString(),
        ...message,
      };

      setCurrentConversation((prev) => {
        if (!prev) return null;

        const updated = {
          ...prev,
          messages: [...prev.messages, newMessage],
          metadata: {
            ...prev.metadata,
            totalMessages: prev.messages.length + 1,
          },
        };

        // No local storage - data is managed by backend
        return updated;
      });

      return newMessage;
    },
    [currentConversation, startNewConversation]
  );

  /**
   * Add a workflow to the current conversation
   */
  const addWorkflow = useCallback(
    async (workflow) => {
      if (!currentConversation) {
        return;
      }

      setCurrentConversation((prev) => {
        if (!prev) return null;

        const mcpsUsed = new Set(prev.metadata.mcpsUsed || []);
        mcpsUsed.add(workflow.primaryMCP);
        if (workflow.secondaryMCPs) {
          workflow.secondaryMCPs.forEach((mcp) => mcpsUsed.add(mcp));
        }

        const updated = {
          ...prev,
          workflows: [...(prev.workflows || []), workflow],
          metadata: {
            ...prev.metadata,
            mcpsUsed: Array.from(mcpsUsed),
          },
        };

        // No local storage - data is managed by backend
        return updated;
      });
    },
    [currentConversation]
  );

  /**
   * Update a workflow in the current conversation
   */
  const updateWorkflow = useCallback(
    async (workflowId, updates) => {
      if (!currentConversation) {
        return;
      }

      setCurrentConversation((prev) => {
        if (!prev) return null;

        const updated = {
          ...prev,
          workflows: prev.workflows.map((wf) =>
            wf.id === workflowId ? { ...wf, ...updates } : wf
          ),
        };

        // No local storage - data is managed by backend
        return updated;
      });
    },
    [currentConversation]
  );

  /**
   * Process user input through backend API
   */
  const processUserInput = useCallback(
    async (input) => {
      if (!input || !input.trim()) {
        return;
      }

      try {
        setIsProcessing(true);

        // Get or generate conversation UID
        const conversationUid =
          currentConversation?.uid || currentConversation?.id || null;

        // Set UID in omiIntegration if we have one
        if (conversationUid) {
          omiIntegration.setUid(conversationUid);
        }

        // Add user message
        await addMessage({
          type: "user",
          content: input,
        });

        // Send message to backend
        const result = await omiIntegration.sendMessage(input, conversationUid);

        // Update conversation UID if we got one back
        if (result.uid && !currentConversation?.uid) {
          setCurrentConversation((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              uid: result.uid,
            };
          });
        }

        // Add AI response
        await addMessage({
          type: "assistant",
          content: result.reply || "",
          metadata: {
            provider: result.provider,
            model: result.model,
          },
        });

        return {
          success: true,
          response: result.reply,
          uid: result.uid,
        };
      } catch (error) {
        console.error("Error processing user input:", error);

        // Add error message
        await addMessage({
          type: "system",
          content: `Error: ${
            error.message || "Failed to get response from backend"
          }`,
        });

        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [currentConversation, addMessage]
  );

  /**
   * Convert backend message format to app format
   * Backend format: { role: "user"|"assistant", text: "...", created_at: "..." }
   * App format: { type: "user"|"assistant", content: "...", timestamp: "..." }
   */
  const convertBackendMessage = useCallback((backendMsg) => {
    // Backend uses: role, text, created_at (exactly like HTML dashboard)
    // App uses: type, content, timestamp
    const converted = {
      id: backendMsg._id || backendMsg.id || generateMessageId(),
      type: backendMsg.role || backendMsg.type || "user", // Backend uses "role"
      content: backendMsg.text || backendMsg.content || "", // Backend uses "text"
      timestamp:
        backendMsg.created_at ||
        backendMsg.timestamp ||
        new Date().toISOString(), // Backend uses "created_at"
      metadata: {
        provider: backendMsg.provider,
        model: backendMsg.model,
      },
    };

    // Debug log for first message
    if (!converted.content) {
      console.warn("Empty message content:", backendMsg);
    }

    return converted;
  }, []);

  /**
   * Load a specific conversation from backend only (no local storage)
   */
  const loadConversation = useCallback(
    async (id) => {
      try {
        setIsLoading(true);

        // Use id as UID (backend uses UIDs)
        const uid = id;

        // Load from backend only
        const backendData = await omiIntegration.getMessageHistory(uid, {
          limit: 200,
        });

        if (backendData.messages && backendData.messages.length > 0) {
          // Convert backend messages to app format
          // Backend messages are sorted newest first, so reverse to show oldest first, newest last (like chat app)
          const convertedMessages = backendData.messages
            .map((msg) => convertBackendMessage(msg))
            .reverse();

          // Get the first message timestamp (now the oldest message)
          const firstMessage = convertedMessages.find((m) => m.type === "user");
          const timestamp =
            firstMessage?.timestamp ||
            convertedMessages[0]?.timestamp ||
            new Date().toISOString();

          // Create conversation from backend
          const conversation = {
            id: uid || generateConversationId(),
            uid: uid,
            timestamp: timestamp,
            messages: convertedMessages, // Now sorted oldest first, newest last
            workflows: [],
            metadata: {
              totalMessages: convertedMessages.length,
              mcpsUsed: [],
              duration: 0,
            },
          };

          setCurrentConversation(conversation);
          if (conversation.uid) {
            omiIntegration.setUid(conversation.uid);
          }

          return conversation;
        } else {
          // No messages from backend
          return null;
        }
      } catch (error) {
        console.error("Error loading conversation from backend:", error);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [convertBackendMessage]
  );

  /**
   * Delete a conversation (backend only - not implemented in backend API)
   * Just removes from local state
   */
  const deleteConversation = useCallback(
    async (id) => {
      try {
        // Remove from local state (backend doesn't have delete endpoint)
        setConversationHistory((prev) => prev.filter((c) => c.id !== id));

        // If deleted conversation was current, start new one
        if (currentConversation?.id === id) {
          startNewConversation();
        }

        return true;
      } catch (error) {
        console.error("Error deleting conversation:", error);
        return false;
      }
    },
    [currentConversation, startNewConversation]
  );

  /**
   * Search conversations (searches in current conversationHistory from backend)
   */
  const searchConversations = useCallback(
    async (query) => {
      try {
        const lowerQuery = query.toLowerCase();
        return conversationHistory.filter((conversation) => {
          // Search in messages
          const hasMatchingMessage = conversation.messages.some((msg) =>
            (msg.content || "").toLowerCase().includes(lowerQuery)
          );
          return hasMatchingMessage;
        });
      } catch (error) {
        console.error("Error searching conversations:", error);
        return [];
      }
    },
    [conversationHistory]
  );

  /**
   * Get conversation statistics (from current conversationHistory)
   */
  const getStats = useCallback(async () => {
    try {
      const conversations = conversationHistory;
      if (conversations.length === 0) {
        return {
          totalConversations: 0,
          totalMessages: 0,
          totalWorkflows: 0,
          mostUsedMCPs: [],
          successRate: 0,
          averageMessagesPerConversation: 0,
        };
      }

      const totalMessages = conversations.reduce(
        (sum, conv) => sum + conv.messages.length,
        0
      );

      const totalWorkflows = conversations.reduce(
        (sum, conv) => sum + (conv.workflows?.length || 0),
        0
      );

      return {
        totalConversations: conversations.length,
        totalMessages,
        totalWorkflows,
        mostUsedMCPs: [],
        successRate: 0,
        averageMessagesPerConversation: Math.round(
          totalMessages / conversations.length
        ),
      };
    } catch (error) {
      console.error("Error getting stats:", error);
      return null;
    }
  }, [conversationHistory]);

  /**
   * Export conversation (from current conversationHistory)
   */
  const exportConversation = useCallback(
    async (id, format = "json") => {
      try {
        const conversation = conversationHistory.find((c) => c.id === id);
        if (!conversation) {
          throw new Error("Conversation not found");
        }

        if (format === "json") {
          return JSON.stringify(conversation, null, 2);
        }

        if (format === "text") {
          let text = `Conversation: ${new Date(
            conversation.timestamp
          ).toLocaleString()}\n`;
          text += `Total Messages: ${conversation.messages.length}\n`;
          text += `MCPs Used: ${
            conversation.metadata?.mcpsUsed?.join(", ") || "None"
          }\n`;
          text += "\n--- Messages ---\n\n";

          conversation.messages.forEach((msg) => {
            const timestamp = new Date(msg.timestamp).toLocaleTimeString();
            const role =
              msg.type === "user"
                ? "User"
                : msg.type === "assistant"
                ? "AI"
                : "System";
            text += `[${timestamp}] ${role}: ${msg.content}\n\n`;
          });

          return text;
        }

        throw new Error(`Unsupported format: ${format}`);
      } catch (error) {
        console.error("Error exporting conversation:", error);
        throw error;
      }
    },
    [conversationHistory]
  );

  const value = {
    // State
    currentConversation,
    conversationHistory,
    isLoading,
    isProcessing,

    // Actions
    addMessage,
    addWorkflow,
    updateWorkflow,
    processUserInput,
    loadConversation,
    startNewConversation,
    deleteConversation,
    searchConversations,
    getStats,
    exportConversation,
    loadConversationHistory,
  };

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
};

/**
 * Generate unique conversation ID
 */
function generateConversationId() {
  return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate unique message ID
 */
function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default ConversationContext;
