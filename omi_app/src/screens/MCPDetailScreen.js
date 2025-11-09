/**
 * MCP Detail Screen
 * Shows detailed information about a specific MCP
 * Displays all tool actions for that MCP
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { CONFIG } from "../../config";
import { COLORS } from "../constants/colors";

const MCPDetailScreen = ({ navigation, route }) => {
  const { mcp } = route.params;
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMCPActions();
  }, []);

  const loadMCPActions = async () => {
    try {
      setLoading(true);

      // Fetch all tool actions from backend
      const baseUrl = CONFIG.BASE_URL;
      const url = `${baseUrl}/api/tool-actions?limit=500`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        const allActions = data.actions || [];

        // Filter actions for this MCP
        const mcpActions = allActions.filter((action) => {
          const mcpName = action.mcp_name || "";
          const normalizedMcpName = mcpName
            .toLowerCase()
            .replace(/[^a-z]/g, "");
          const normalizedId = mcp.id.toLowerCase().replace(/[^a-z]/g, "");
          return (
            normalizedMcpName === normalizedId ||
            normalizedMcpName.includes(normalizedId) ||
            normalizedId.includes(normalizedMcpName) ||
            mcpName.toLowerCase().includes(mcp.id.toLowerCase())
          );
        });

        setActions(mcpActions);
      }
    } catch (error) {
      console.error("Error loading MCP actions:", error);
    } finally {
      setLoading(false);
    }
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

  const renderActionItem = ({ item }) => (
    <View
      style={[
        styles.actionItem,
        {
          borderLeftColor: item.success ? COLORS.SUCCESS : COLORS.ERROR,
          borderLeftWidth: 4,
        },
      ]}
    >
      <View style={styles.actionHeader}>
        <View style={styles.actionHeaderLeft}>
          <Text style={styles.actionToolName}>
            {item.tool_name || "Unknown Tool"}
          </Text>
          {item.session_uid && (
            <Text style={styles.actionSessionId}>
              Session: {item.session_uid.substring(0, 20)}...
            </Text>
          )}
        </View>
        <View
          style={[
            styles.actionStatusBadge,
            {
              backgroundColor: item.success
                ? COLORS.SUCCESS + "20"
                : COLORS.ERROR + "20",
            },
          ]}
        >
          <Text
            style={[
              styles.actionStatusText,
              {
                color: item.success ? COLORS.SUCCESS : COLORS.ERROR,
              },
            ]}
          >
            {item.success ? "✓ Success" : "✗ Failed"}
          </Text>
        </View>
      </View>
      {item.user_message && (
        <View style={styles.actionDetailItem}>
          <Text style={styles.actionDetailLabel}>User Message:</Text>
          <Text style={styles.actionDetailValue}>{item.user_message}</Text>
        </View>
      )}
      {item.result_summary && (
        <View style={styles.actionDetailItem}>
          <Text style={styles.actionDetailLabel}>Summary:</Text>
          <Text style={[styles.actionDetailValue, styles.actionSummary]}>
            {item.result_summary}
          </Text>
        </View>
      )}
      {item.tool_args && Object.keys(item.tool_args).length > 0 && (
        <View style={styles.actionDetailItem}>
          <Text style={styles.actionDetailLabel}>Arguments:</Text>
          <Text style={styles.actionDetailValue}>
            {JSON.stringify(item.tool_args, null, 2)}
          </Text>
        </View>
      )}
      {!item.success && item.error_message && (
        <View style={styles.actionDetailItem}>
          <Text style={styles.actionDetailLabel}>Error:</Text>
          <Text style={[styles.actionDetailValue, styles.actionError]}>
            {item.error_message}
          </Text>
        </View>
      )}
      <Text style={styles.actionDate}>
        {formatDate(item.created_at || item.timestamp)}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={COLORS.BACKGROUND}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.PRIMARY} />
          <Text style={styles.loadingText}>Loading MCP details...</Text>
        </View>
      </SafeAreaView>
    );
  }

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
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerIcon}>{mcp.icon}</Text>
          <Text style={styles.headerTitle}>{mcp.name}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Actions List */}
      <FlatList
        data={actions}
        renderItem={renderActionItem}
        keyExtractor={(item, index) => item._id || index.toString()}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={loadMCPActions}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No Actions Yet</Text>
            <Text style={styles.emptyDescription}>
              No tool actions found for this MCP
            </Text>
          </View>
        }
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
    backgroundColor: COLORS.SURFACE,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  backButtonText: {
    fontSize: 24,
    color: COLORS.TEXT_PRIMARY,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  headerIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.TEXT_PRIMARY,
  },
  headerSpacer: {
    width: 40,
  },
  listContainer: {
    padding: 16,
  },
  actionItem: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  actionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  actionHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  actionToolName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 4,
  },
  actionSessionId: {
    fontSize: 11,
    color: COLORS.TEXT_SECONDARY,
    fontFamily: "monospace",
  },
  actionStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  actionStatusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  actionDetailItem: {
    marginBottom: 12,
  },
  actionDetailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 6,
  },
  actionDetailValue: {
    fontSize: 13,
    color: COLORS.TEXT_PRIMARY,
    backgroundColor: COLORS.BACKGROUND,
    padding: 10,
    borderRadius: 6,
    fontFamily: "monospace",
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    maxHeight: 150,
  },
  actionSummary: {
    backgroundColor: COLORS.SUCCESS + "15",
    color: COLORS.SUCCESS,
    fontWeight: "600",
    fontFamily: "inherit",
  },
  actionError: {
    backgroundColor: COLORS.ERROR + "15",
    color: COLORS.ERROR,
    fontWeight: "600",
  },
  actionDate: {
    fontSize: 11,
    color: COLORS.TEXT_TERTIARY,
    marginTop: 8,
    fontStyle: "italic",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
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
  },
});

export default MCPDetailScreen;
