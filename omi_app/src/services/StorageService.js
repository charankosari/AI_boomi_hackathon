/**
 * Storage Service
 * Manages local data persistence using AsyncStorage
 * Handles conversations, workflows, and application state
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CONFIG } from '../../config';

class StorageService {
  constructor() {
    this.keys = CONFIG.STORAGE_KEYS;
  }

  /**
   * Save a new conversation
   */
  async saveConversation(conversation) {
    try {
      const conversations = await this.loadConversations();

      // Add or update conversation
      const existingIndex = conversations.findIndex(c => c.id === conversation.id);

      if (existingIndex >= 0) {
        conversations[existingIndex] = conversation;
      } else {
        conversations.unshift(conversation); // Add to beginning
      }

      // Limit stored conversations
      const limitedConversations = conversations.slice(0, CONFIG.APP.MAX_CONVERSATIONS_STORED);

      await AsyncStorage.setItem(
        this.keys.CONVERSATIONS,
        JSON.stringify(limitedConversations)
      );

      return conversation;
    } catch (error) {
      console.error('Error saving conversation:', error);
      throw error;
    }
  }

  /**
   * Load all conversations
   */
  async loadConversations() {
    try {
      const data = await AsyncStorage.getItem(this.keys.CONVERSATIONS);

      if (!data) {
        return [];
      }

      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading conversations:', error);
      return [];
    }
  }

  /**
   * Get a specific conversation by ID
   */
  async getConversation(id) {
    try {
      const conversations = await this.loadConversations();
      return conversations.find(c => c.id === id) || null;
    } catch (error) {
      console.error('Error getting conversation:', error);
      return null;
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(id) {
    try {
      const conversations = await this.loadConversations();
      const filtered = conversations.filter(c => c.id !== id);

      await AsyncStorage.setItem(
        this.keys.CONVERSATIONS,
        JSON.stringify(filtered)
      );

      return true;
    } catch (error) {
      console.error('Error deleting conversation:', error);
      return false;
    }
  }

  /**
   * Search conversations
   */
  async searchConversations(query) {
    try {
      const conversations = await this.loadConversations();
      const lowerQuery = query.toLowerCase();

      return conversations.filter(conversation => {
        // Search in messages
        const hasMatchingMessage = conversation.messages.some(msg =>
          msg.content.toLowerCase().includes(lowerQuery)
        );

        // Search in workflows
        const hasMatchingWorkflow = conversation.workflows?.some(wf =>
          wf.intent?.toLowerCase().includes(lowerQuery) ||
          wf.primaryMCP?.toLowerCase().includes(lowerQuery)
        );

        return hasMatchingMessage || hasMatchingWorkflow;
      });
    } catch (error) {
      console.error('Error searching conversations:', error);
      return [];
    }
  }

  /**
   * Filter conversations by date range
   */
  async filterConversationsByDate(startDate, endDate) {
    try {
      const conversations = await this.loadConversations();

      return conversations.filter(conversation => {
        const convDate = new Date(conversation.timestamp);
        return convDate >= startDate && convDate <= endDate;
      });
    } catch (error) {
      console.error('Error filtering conversations:', error);
      return [];
    }
  }

  /**
   * Filter conversations by MCP type
   */
  async filterConversationsByMCP(mcpId) {
    try {
      const conversations = await this.loadConversations();

      return conversations.filter(conversation =>
        conversation.metadata?.mcpsUsed?.includes(mcpId)
      );
    } catch (error) {
      console.error('Error filtering by MCP:', error);
      return [];
    }
  }

  /**
   * Export conversation to JSON format
   */
  async exportConversation(id, format = 'json') {
    try {
      const conversation = await this.getConversation(id);

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      if (format === 'json') {
        return JSON.stringify(conversation, null, 2);
      }

      if (format === 'text') {
        return this.formatConversationAsText(conversation);
      }

      throw new Error(`Unsupported format: ${format}`);
    } catch (error) {
      console.error('Error exporting conversation:', error);
      throw error;
    }
  }

  /**
   * Format conversation as plain text
   */
  formatConversationAsText(conversation) {
    let text = `Conversation: ${new Date(conversation.timestamp).toLocaleString()}\n`;
    text += `Total Messages: ${conversation.messages.length}\n`;
    text += `MCPs Used: ${conversation.metadata?.mcpsUsed?.join(', ') || 'None'}\n`;
    text += '\n--- Messages ---\n\n';

    conversation.messages.forEach(msg => {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString();
      const role = msg.type === 'user' ? 'User' : msg.type === 'assistant' ? 'AI' : 'System';
      text += `[${timestamp}] ${role}: ${msg.content}\n\n`;
    });

    if (conversation.workflows && conversation.workflows.length > 0) {
      text += '\n--- Workflows ---\n\n';
      conversation.workflows.forEach((wf, index) => {
        text += `${index + 1}. ${wf.intent}\n`;
        text += `   Primary MCP: ${wf.primaryMCP}\n`;
        text += `   Status: ${wf.status}\n\n`;
      });
    }

    return text;
  }

  /**
   * Get statistics about conversations
   */
  async getStats() {
    try {
      const conversations = await this.loadConversations();

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

      // Calculate total messages
      const totalMessages = conversations.reduce(
        (sum, conv) => sum + conv.messages.length,
        0
      );

      // Calculate total workflows
      const totalWorkflows = conversations.reduce(
        (sum, conv) => sum + (conv.workflows?.length || 0),
        0
      );

      // Count MCP usage
      const mcpUsage = {};
      conversations.forEach(conv => {
        conv.metadata?.mcpsUsed?.forEach(mcp => {
          mcpUsage[mcp] = (mcpUsage[mcp] || 0) + 1;
        });
      });

      // Get most used MCPs
      const mostUsedMCPs = Object.entries(mcpUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([mcp, count]) => ({ mcp, count }));

      // Calculate success rate
      const completedWorkflows = conversations.reduce(
        (sum, conv) =>
          sum + (conv.workflows?.filter(wf => wf.status === 'completed').length || 0),
        0
      );
      const successRate = totalWorkflows > 0
        ? Math.round((completedWorkflows / totalWorkflows) * 100)
        : 0;

      // Get recent activity
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      const recentConversations = conversations.filter(
        conv => new Date(conv.timestamp) >= lastWeek
      );

      return {
        totalConversations: conversations.length,
        totalMessages,
        totalWorkflows,
        mostUsedMCPs,
        successRate,
        averageMessagesPerConversation: Math.round(totalMessages / conversations.length),
        recentConversations: recentConversations.length,
        lastActivityDate: conversations[0]?.timestamp || null,
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return null;
    }
  }

  /**
   * Clear all conversations (for testing/reset)
   */
  async clearAllConversations() {
    try {
      await AsyncStorage.removeItem(this.keys.CONVERSATIONS);
      return true;
    } catch (error) {
      console.error('Error clearing conversations:', error);
      return false;
    }
  }

  /**
   * Save user settings/preferences
   */
  async saveSettings(settings) {
    try {
      await AsyncStorage.setItem(
        this.keys.SETTINGS,
        JSON.stringify(settings)
      );
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
  }

  /**
   * Load user settings/preferences
   */
  async loadSettings() {
    try {
      const data = await AsyncStorage.getItem(this.keys.SETTINGS);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error loading settings:', error);
      return null;
    }
  }

  /**
   * Update conversation metadata
   */
  async updateConversationMetadata(id, metadata) {
    try {
      const conversation = await this.getConversation(id);

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      conversation.metadata = {
        ...conversation.metadata,
        ...metadata,
      };

      await this.saveConversation(conversation);
      return conversation;
    } catch (error) {
      console.error('Error updating metadata:', error);
      throw error;
    }
  }

  /**
   * Get conversations paginated
   */
  async getConversationsPaginated(page = 1, limit = 20) {
    try {
      const conversations = await this.loadConversations();
      const start = (page - 1) * limit;
      const end = start + limit;

      return {
        conversations: conversations.slice(start, end),
        total: conversations.length,
        page,
        totalPages: Math.ceil(conversations.length / limit),
        hasMore: end < conversations.length,
      };
    } catch (error) {
      console.error('Error getting paginated conversations:', error);
      return {
        conversations: [],
        total: 0,
        page: 1,
        totalPages: 0,
        hasMore: false,
      };
    }
  }
}

// Export singleton instance
const storageService = new StorageService();
export default storageService;
