/**
 * Message Bubble Component
 * Displays individual messages in the chat interface
 * Supports user, assistant, and system message types
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';

const MessageBubble = ({ message }) => {
  const { type, content, timestamp } = message;

  const isUser = type === 'user';
  const isAssistant = type === 'assistant';
  const isSystem = type === 'system';

  const getBubbleStyle = () => {
    if (isUser) return styles.userBubble;
    if (isSystem) return styles.systemBubble;
    return styles.aiBubble;
  };

  const getTextStyle = () => {
    if (isUser) return styles.userText;
    if (isSystem) return styles.systemText;
    return styles.aiText;
  };

  const getContainerStyle = () => {
    if (isUser) return styles.userContainer;
    if (isSystem) return styles.systemContainer;
    return styles.aiContainer;
  };

  const formatTime = (timestamp) => {
    try {
      const date = new Date(timestamp);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch (error) {
      return '';
    }
  };

  return (
    <View style={getContainerStyle()}>
      <View style={[styles.bubble, getBubbleStyle()]}>
        <Text style={[styles.messageText, getTextStyle()]}>{content}</Text>
        {timestamp && (
          <Text style={[styles.timestamp, isUser && styles.userTimestamp]}>
            {formatTime(timestamp)}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Container styles
  userContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginVertical: 6,
    marginHorizontal: 16,
  },
  aiContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginVertical: 6,
    marginHorizontal: 16,
  },
  systemContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 10,
    marginHorizontal: 16,
  },

  // Bubble styles
  bubble: {
    maxWidth: '80%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 3,
  },
  userBubble: {
    backgroundColor: COLORS.USER_MESSAGE_BG,
    borderBottomRightRadius: 6,
  },
  aiBubble: {
    backgroundColor: COLORS.AI_MESSAGE_BG,
    borderWidth: 1,
    borderColor: COLORS.BORDER_LIGHT,
    borderBottomLeftRadius: 6,
  },
  systemBubble: {
    backgroundColor: COLORS.SYSTEM_MESSAGE_BG,
    maxWidth: '90%',
    borderRadius: 16,
  },

  // Text styles
  messageText: {
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.3,
  },
  userText: {
    color: COLORS.USER_MESSAGE_TEXT,
    fontWeight: '400',
  },
  aiText: {
    color: COLORS.AI_MESSAGE_TEXT,
    fontWeight: '400',
  },
  systemText: {
    color: COLORS.SYSTEM_MESSAGE_TEXT,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Timestamp styles
  timestamp: {
    fontSize: 10,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 6,
    alignSelf: 'flex-end',
    fontWeight: '500',
  },
  userTimestamp: {
    color: COLORS.USER_MESSAGE_TEXT,
    opacity: 0.8,
  },
});

export default MessageBubble;
