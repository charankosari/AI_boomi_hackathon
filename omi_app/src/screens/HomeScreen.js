/**
 * Home Screen
 * Displays all conversations list
 * Allows opening conversations and starting new ones
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  FlatList,
  TextInput,
} from "react-native";
import { useConversation } from "../context/ConversationContext";
import { COLORS } from "../constants/colors";

const HomeScreen = ({ navigation }) => {
  const {
    conversationHistory,
    loadConversation,
    startNewConversation,
    loadConversationHistory,
    isLoading,
  } = useConversation();

  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadConversationHistory();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadConversationHistory();
    } finally {
      setRefreshing(false);
    }
  };

  const handleOpenConversation = async (conversation) => {
    await loadConversation(conversation.id);
    navigation.navigate("Chat", { conversationId: conversation.id });
  };

  const handleNewConversation = () => {
    startNewConversation();
  };

  const formatDate = (timestamp) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString();
    } catch (error) {
      return "";
    }
  };

  const getFirstMessage = (conversation) => {
    const firstUserMessage = conversation.messages.find(
      (msg) => msg.type === "user"
    );
    if (firstUserMessage) {
      return firstUserMessage.content.substring(0, 60) + "...";
    }
    return "No messages";
  };

  const filteredConversations = conversationHistory.filter((conv) => {
    if (!searchQuery.trim()) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      getFirstMessage(conv).toLowerCase().includes(searchLower) ||
      conv.id.toLowerCase().includes(searchLower)
    );
  });

  const renderConversationItem = ({ item }) => (
    <TouchableOpacity
      style={styles.conversationCard}
      onPress={() => handleOpenConversation(item)}
      activeOpacity={0.7}
    >
      <View style={styles.conversationHeader}>
        <Text style={styles.sessionId}>
          Session: {item.uid ? item.uid.substring(0, 30) + "..." : item.id}
        </Text>
        <Text style={styles.messageCount}>{item.messages.length} messages</Text>
      </View>
      <View style={styles.messagesPreview}>
        {item.messages.slice(0, 3).map((msg, index) => (
          <View
            key={msg.id || index}
            style={[
              styles.messagePreview,
              msg.type === "user"
                ? styles.messageUser
                : styles.messageAssistant,
            ]}
          >
            <Text style={styles.messagePreviewHeader}>
              {msg.type === "user" ? "👤 User" : "🤖 Assistant"}
            </Text>
            <Text style={styles.messagePreviewText} numberOfLines={2}>
              {msg.content || ""}
            </Text>
            <Text style={styles.messagePreviewTime}>
              {formatDate(msg.timestamp)}
            </Text>
          </View>
        ))}
        {item.messages.length > 3 && (
          <Text style={styles.moreMessages}>
            +{item.messages.length - 3} more messages
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>💬</Text>
      <Text style={styles.emptyTitle}>No Conversations</Text>
      <Text style={styles.emptyDescription}>
        Start a new conversation to begin
      </Text>
      <TouchableOpacity
        style={styles.newButton}
        onPress={handleNewConversation}
      >
        <Text style={styles.newButtonText}>+ New Conversation</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.BACKGROUND} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversations</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefresh}
            disabled={refreshing || isLoading}
          >
            <Text style={styles.refreshButtonText}>
              {refreshing ? "⟳" : "↻"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.newButtonSmall}
            onPress={handleNewConversation}
          >
            <Text style={styles.newButtonSmallText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
          placeholderTextColor={COLORS.TEXT_SECONDARY}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Text style={styles.clearButton}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Conversations List */}
      <FlatList
        data={filteredConversations}
        renderItem={renderConversationItem}
        keyExtractor={(item) => item.id || item.uid}
        contentContainerStyle={[
          styles.listContainer,
          filteredConversations.length === 0 && styles.listContainerEmpty,
        ]}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing || isLoading}
        onRefresh={handleRefresh}
      />
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.TEXT_PRIMARY,
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.BACKGROUND,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  refreshButtonText: {
    fontSize: 18,
    color: COLORS.TEXT_PRIMARY,
    fontWeight: "600",
  },
  newButtonSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.PRIMARY,
    justifyContent: "center",
    alignItems: "center",
  },
  newButtonSmallText: {
    fontSize: 24,
    color: COLORS.TEXT_INVERSE,
    fontWeight: "600",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.SURFACE,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.TEXT_PRIMARY,
    paddingVertical: 10,
  },
  clearButton: {
    fontSize: 18,
    color: COLORS.TEXT_SECONDARY,
    paddingLeft: 8,
  },
  listContainer: {
    padding: 16,
  },
  listContainerEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  conversationCard: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    overflow: "hidden",
  },
  conversationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.PRIMARY,
  },
  sessionId: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.PRIMARY,
    flex: 1,
    fontFamily: "monospace",
  },
  messageCount: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: "500",
  },
  messagesPreview: {
    padding: 16,
    paddingTop: 12,
  },
  messagePreview: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  messageUser: {
    backgroundColor: COLORS.INFO + "15",
    borderLeftColor: COLORS.INFO,
  },
  messageAssistant: {
    backgroundColor: COLORS.BACKGROUND,
    borderLeftColor: COLORS.PRIMARY,
  },
  messagePreviewHeader: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 6,
  },
  messagePreviewText: {
    fontSize: 14,
    color: COLORS.TEXT_PRIMARY,
    lineHeight: 20,
    marginBottom: 4,
  },
  messagePreviewTime: {
    fontSize: 11,
    color: COLORS.TEXT_TERTIARY,
    marginTop: 4,
  },
  moreMessages: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 8,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    textAlign: "center",
    marginBottom: 24,
  },
  newButton: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  newButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.TEXT_INVERSE,
  },
});

export default HomeScreen;
