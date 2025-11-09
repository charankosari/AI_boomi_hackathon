/**
 * Chat Screen
 * Displays chat interface for a conversation
 * Shows messages and allows sending new messages
 */

import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useConversation } from "../context/ConversationContext";
import MessageBubble from "../components/MessageBubble";
import { COLORS } from "../constants/colors";

const HistoryScreen = ({ navigation, route }) => {
  const { currentConversation, processUserInput, isProcessing } =
    useConversation();
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef(null);

  const messages = currentConversation?.messages || [];

  // Auto-scroll to bottom when chat opens or new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      // Scroll to bottom after a short delay to ensure layout is complete
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 300);
    }
  }, [messages.length, currentConversation?.id]);

  // Scroll to bottom when screen is focused
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      if (messages.length > 0) {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }, 300);
      }
    });
    return unsubscribe;
  }, [navigation, messages.length]);

  const handleSend = async () => {
    if (!inputText.trim() || isProcessing) {
      return;
    }

    const messageText = inputText.trim();
    setInputText("");

    try {
      await processUserInput(messageText);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const renderItem = ({ item }) => <MessageBubble message={item} />;

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>💬</Text>
      <Text style={styles.emptyTitle}>Start a Conversation</Text>
      <Text style={styles.emptyDescription}>
        Send a message to begin chatting
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.BACKGROUND} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Chat</Text>
          <Text style={styles.headerSubtitle}>{messages.length} messages</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Messages List */}
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
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
                (!inputText.trim() || isProcessing) &&
                  styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!inputText.trim() || isProcessing}
            >
              <Text style={styles.sendButtonText}>
                {isProcessing ? "⏳" : "➤"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.SURFACE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.BACKGROUND,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.TEXT_PRIMARY,
    fontWeight: "600",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.TEXT_PRIMARY,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  messagesList: {
    paddingVertical: 12,
  },
  messagesListEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 72,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 10,
  },
  emptyDescription: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    textAlign: "center",
    lineHeight: 24,
  },
  typingIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.AI_MESSAGE_BG,
    borderWidth: 1,
    borderColor: COLORS.BORDER_LIGHT,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
    maxWidth: "75%",
  },
  typingText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginLeft: 8,
    fontStyle: "italic",
  },
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER_LIGHT,
    backgroundColor: COLORS.SURFACE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
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
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.PRIMARY,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.TEXT_TERTIARY,
  },
  sendButtonText: {
    fontSize: 22,
    color: COLORS.TEXT_INVERSE,
    fontWeight: "600",
  },
});

export default HistoryScreen;
