/**
 * MCPs Screen
 * Displays all MCPs with usage summaries
 * Shows expandable tool actions for each MCP
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
  Switch,
} from "react-native";
import omiIntegration from "../services/OmiIntegration";
import { CONFIG } from "../../config";
import { COLORS } from "../constants/colors";

// MCP definitions
const MCP_LIST = [
  { id: "zomato", name: "Zomato", icon: "🍔", color: "#FF6B6B" },
  {
    id: "googlecalendar",
    name: "Google Calendar",
    icon: "📅",
    color: "#4ECDC4",
  },
  { id: "googledocs", name: "Google Docs", icon: "📄", color: "#45B7D1" },
  { id: "googleslides", name: "Google Slides", icon: "📊", color: "#FFA07A" },
  { id: "notion", name: "Notion", icon: "📝", color: "#000000" },
  { id: "gmail", name: "Gmail", icon: "📧", color: "#EA4335" },
  { id: "whatsapp", name: "WhatsApp", icon: "💬", color: "#25D366" },
];

const MCPsScreen = ({ navigation }) => {
  const [mcps, setMcps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState({});
  const [preferencesLoading, setPreferencesLoading] = useState(true);

  useEffect(() => {
    loadMCPData();
    loadUserPreferences();
  }, []);

  const [totalStats, setTotalStats] = useState({
    totalActions: 0,
    successfulActions: 0,
    failedActions: 0,
    uniqueMcps: 0,
  });

  const loadMCPData = async () => {
    try {
      setLoading(true);

      // Fetch all tool actions from backend
      const baseUrl =
        CONFIG.BASE_URL || omiIntegration.config.apiUrl.replace("/api/omi", "");
      const url = `${baseUrl}/api/tool-actions?limit=500`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        const actions = data.actions || [];

        // Calculate overall stats
        const total = actions.length;
        const successful = actions.filter((a) => a.success).length;
        const failed = total - successful;
        const mcpSet = new Set();
        actions.forEach((a) => {
          if (a.mcp_name) mcpSet.add(a.mcp_name);
        });

        setTotalStats({
          totalActions: total,
          successfulActions: successful,
          failedActions: failed,
          uniqueMcps: mcpSet.size,
        });

        // Group actions by MCP
        const mcpMap = {};
        MCP_LIST.forEach((mcp) => {
          mcpMap[mcp.id] = {
            ...mcp,
            actions: [],
            totalActions: 0,
            successfulActions: 0,
            failedActions: 0,
          };
        });

        // Process actions
        actions.forEach((action) => {
          const mcpName = action.mcp_name || "";
          // Match MCP name to our list - try multiple matching strategies
          let mcpId = MCP_LIST.find((m) =>
            mcpName.toLowerCase().includes(m.id.toLowerCase())
          )?.id;

          // If not found, try reverse match
          if (!mcpId) {
            mcpId = MCP_LIST.find((m) =>
              m.id.toLowerCase().includes(mcpName.toLowerCase().split("_")[0])
            )?.id;
          }

          // Try exact match with common variations
          if (!mcpId) {
            const normalizedMcpName = mcpName
              .toLowerCase()
              .replace(/[^a-z]/g, "");
            mcpId = MCP_LIST.find((m) => {
              const normalizedId = m.id.toLowerCase().replace(/[^a-z]/g, "");
              return (
                normalizedMcpName === normalizedId ||
                normalizedMcpName.includes(normalizedId) ||
                normalizedId.includes(normalizedMcpName)
              );
            })?.id;
          }

          if (mcpId && mcpMap[mcpId]) {
            mcpMap[mcpId].actions.push(action);
            mcpMap[mcpId].totalActions++;
            if (action.success) {
              mcpMap[mcpId].successfulActions++;
            } else {
              mcpMap[mcpId].failedActions++;
            }
          }
        });

        // Convert to array and sort by total actions
        const mcpArray = Object.values(mcpMap).sort(
          (a, b) => b.totalActions - a.totalActions
        );

        setMcps(mcpArray);
      }
    } catch (error) {
      console.error("Error loading MCP data:", error);
      // Set empty MCPs if error
      setMcps(
        MCP_LIST.map((mcp) => ({
          ...mcp,
          actions: [],
          totalActions: 0,
          successfulActions: 0,
          failedActions: 0,
        }))
      );
      setTotalStats({
        totalActions: 0,
        successfulActions: 0,
        failedActions: 0,
        uniqueMcps: 0,
      });
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

  const loadUserPreferences = async () => {
    try {
      setPreferencesLoading(true);
      const result = await omiIntegration.getUserPreferences();
      setPreferences(result.preferences || {});
    } catch (error) {
      console.error("Error loading user preferences:", error);
      // Set default preferences (all enabled)
      const defaultPrefs = {};
      MCP_LIST.forEach((mcp) => {
        defaultPrefs[mcp.id] = true;
      });
      setPreferences(defaultPrefs);
    } finally {
      setPreferencesLoading(false);
    }
  };

  const handleToggle = async (mcpId, value) => {
    try {
      // Optimistically update UI
      const newPreferences = { ...preferences, [mcpId]: value };
      setPreferences(newPreferences);

      // Update backend
      await omiIntegration.updateUserPreferences({ [mcpId]: value });
    } catch (error) {
      console.error("Error updating preference:", error);
      // Revert on error
      setPreferences({ ...preferences, [mcpId]: !value });
    }
  };

  const handleMCPPress = (mcp) => {
    navigation.navigate("MCPDetail", { mcp });
  };

  const renderMCPItem = ({ item }) => {
    const successRate =
      item.totalActions > 0
        ? Math.round((item.successfulActions / item.totalActions) * 100)
        : 0;

    // Get preference for this MCP (default to true if not set)
    const isEnabled = preferences[item.id] !== false;

    // Map MCP IDs to preference field names
    const preferenceFieldMap = {
      zomato: "zomato",
      googlecalendar: "googlecalendar",
      googledocs: "googledocs",
      googleslides: "googleslides",
      notion: "notion",
      gmail: "gmail",
      whatsapp: "whatsapp",
    };

    const fieldName = preferenceFieldMap[item.id] || item.id;
    const mcpEnabled = preferences[fieldName] !== false;

    return (
      <View style={styles.mcpCard}>
        {/* Header */}
        <View style={styles.mcpHeader}>
          <TouchableOpacity
            style={styles.mcpHeaderLeft}
            onPress={() => handleMCPPress(item)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.mcpIconContainer,
                { backgroundColor: item.color + "20" },
              ]}
            >
              <Text style={styles.mcpIcon}>{item.icon}</Text>
            </View>
            <View style={styles.mcpInfo}>
              <Text style={styles.mcpName}>{item.name}</Text>
              <Text style={styles.mcpStats}>
                {item.totalActions} actions • {successRate}% success
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.mcpHeaderRight}>
            <Switch
              value={mcpEnabled}
              onValueChange={(value) => handleToggle(fieldName, value)}
              trackColor={{
                false: COLORS.BORDER,
                true: item.color || COLORS.PRIMARY,
              }}
              thumbColor={
                mcpEnabled ? COLORS.BACKGROUND : COLORS.TEXT_SECONDARY
              }
              ios_backgroundColor={COLORS.BORDER}
            />
            <TouchableOpacity
              style={styles.detailButton}
              onPress={() => handleMCPPress(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.expandIcon}>→</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor={COLORS.BACKGROUND}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.PRIMARY} />
          <Text style={styles.loadingText}>Loading MCPs...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderStats = () => (
    <View style={styles.statsContainer}>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{totalStats.totalActions}</Text>
          <Text style={styles.statLabel}>Total Actions</Text>
        </View>
        <View
          style={[styles.statCard, { backgroundColor: COLORS.SUCCESS + "20" }]}
        >
          <Text style={[styles.statValue, { color: COLORS.SUCCESS }]}>
            {totalStats.successfulActions}
          </Text>
          <Text style={styles.statLabel}>Successful</Text>
        </View>
        <View
          style={[styles.statCard, { backgroundColor: COLORS.ERROR + "20" }]}
        >
          <Text style={[styles.statValue, { color: COLORS.ERROR }]}>
            {totalStats.failedActions}
          </Text>
          <Text style={styles.statLabel}>Failed</Text>
        </View>
        <View
          style={[styles.statCard, { backgroundColor: COLORS.INFO + "20" }]}
        >
          <Text style={[styles.statValue, { color: COLORS.INFO }]}>
            {totalStats.uniqueMcps}
          </Text>
          <Text style={styles.statLabel}>MCPs Used</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.BACKGROUND} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MCPs</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={loadMCPData}
          disabled={loading}
        >
          <Text style={styles.refreshButtonText}>{loading ? "⟳" : "↻"}</Text>
        </TouchableOpacity>
      </View>

      {/* Stats - Scrollable */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statsScrollContainer}
      >
        {!loading && renderStats()}
      </ScrollView>

      {/* MCPs List */}
      <FlatList
        data={mcps}
        renderItem={renderMCPItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={loadMCPData}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>Available MCPs</Text>
            <Text style={styles.listHeaderSubtitle}>
              Tap any MCP to view details
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
  statsScrollContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  statsContainer: {
    backgroundColor: COLORS.SURFACE,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
    minWidth: "100%",
  },
  statCard: {
    width: 160,
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.BORDER,
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  listHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 4,
  },
  listHeaderSubtitle: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: "500",
  },
  listContainer: {
    padding: 16,
  },
  mcpCard: {
    backgroundColor: COLORS.SURFACE,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.BORDER,
    overflow: "hidden",
  },
  mcpHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  mcpHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  mcpIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  mcpIcon: {
    fontSize: 24,
  },
  mcpInfo: {
    flex: 1,
  },
  mcpName: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 4,
  },
  mcpStats: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
  mcpHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  detailButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  expandIcon: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
  },
  mcpContent: {
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
    padding: 16,
  },
  summarySection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
  },
  actionsSection: {
    marginTop: 8,
  },
  actionItem: {
    backgroundColor: COLORS.BACKGROUND,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
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
  actionMessage: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 4,
  },
  actionResult: {
    fontSize: 13,
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 4,
  },
  actionDate: {
    fontSize: 11,
    color: COLORS.TEXT_TERTIARY,
    marginTop: 8,
    fontStyle: "italic",
  },
  emptyActions: {
    padding: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
  },
});

export default MCPsScreen;
