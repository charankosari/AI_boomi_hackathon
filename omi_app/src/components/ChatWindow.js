/**
 * Chat Window Component
 * Main chat interface for displaying messages and handling user input
 * Supports text input, message display, MCP workflow cards, and typing indicators
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  ActivityIndicator,
} from 'react-native';
import { useConversation } from '../context/ConversationContext';
import MessageBubble from './MessageBubble';
import MCPWorkflowCard from './MCPWorkflowCard';
import { COLORS } from '../constants/colors';

const ChatWindow = () => {
  const { currentConversation, processUserInput, isProcessing } = useConversation();
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef(null);

  const messages = currentConversation?.messages || [];
  const workflows = currentConversation?.workflows || [];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!inputText.trim() || isProcessing) {
      return;
    }

    const messageText = inputText.trim();
    setInputText('');

    try {
      await processUserInput(messageText);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const renderItem = ({ item, index }) => {
    // Check if this message has an associated workflow
    const messageWorkflow = item.mcpWorkflow
      ? workflows.find(wf => wf.id === item.mcpWorkflow.id)
      : null;

    return (
      <View key={item.id}>
        <MessageBubble message={item} />
        {messageWorkflow && <MCPWorkflowCard workflow={messageWorkflow} />}
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>💬</Text>
      <Text style={styles.emptyTitle}>Start a Conversation</Text>
      <Text style={styles.emptyDescription}>
        Send a message or share an Omi transcript to begin orchestrating your MCPs
      </Text>
    </View>
  );

  const renderTypingIndicator = () => {
    if (!isProcessing) return null;

    return (
      <View style={styles.typingIndicator}>
        <View style={styles.typingBubble}>
          <ActivityIndicator size="small" color={COLORS.PRIMARY} />
          <Text style={styles.typingText}>AI is thinking...</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.messagesList,
          messages.length === 0 && styles.messagesListEmpty,
        ]}
        ListEmptyComponent={renderEmptyState}
        ListFooterComponent={renderTypingIndicator}
        onContentSizeChange={() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }}
      />

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor={COLORS.TEXT_SECONDARY}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={5000}
            editable={!isProcessing}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || isProcessing) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!inputText.trim() || isProcessing}
          >
            <Text style={styles.sendButtonText}>
              {isProcessing ? '⏳' : '➤'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },

  // Messages List
  messagesList: {
    paddingVertical: 12,
  },
  messagesListEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 72,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  emptyDescription: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '400',
  },

  // Typing Indicator
  typingIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.AI_MESSAGE_BG,
    borderWidth: 1,
    borderColor: COLORS.BORDER_LIGHT,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    maxWidth: '75%',
  },
  typingText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginLeft: 8,
    fontStyle: 'italic',
  },

  // Input Area
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER_LIGHT,
    backgroundColor: COLORS.SURFACE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.TEXT_PRIMARY,
    maxHeight: 100,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: COLORS.BORDER_LIGHT,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.PRIMARY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.TEXT_TERTIARY,
    shadowOpacity: 0.1,
  },
  sendButtonText: {
    fontSize: 22,
    color: COLORS.TEXT_INVERSE,
    fontWeight: '600',
  },
});

export default ChatWindow;
