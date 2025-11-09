/**
 * Color constants for the MCP Orchestrator app
 * Gray and white theme (ash and white)
 */

export const COLORS = {
  // Primary colors - Gray tones
  PRIMARY: "#6B7280", // Medium gray
  SECONDARY: "#9CA3AF", // Light gray

  // Status colors - Subtle grays
  SUCCESS: "#10B981", // Green for success
  WARNING: "#F59E0B", // Amber for warning
  ERROR: "#EF4444", // Red for error
  INFO: "#3B82F6", // Blue for info

  // Background colors - White and light gray
  BACKGROUND: "#F9FAFB", // Very light gray (ash)
  SURFACE: "#FFFFFF", // White
  CARD: "#FFFFFF", // White
  CARD_HOVER: "#F3F4F6", // Slightly darker gray

  // Text colors - Dark grays
  TEXT_PRIMARY: "#111827", // Almost black
  TEXT_SECONDARY: "#6B7280", // Medium gray
  TEXT_TERTIARY: "#9CA3AF", // Light gray
  TEXT_INVERSE: "#FFFFFF", // White

  // Message bubble colors - Gray tones
  USER_MESSAGE_BG: "#6B7280", // Medium gray
  USER_MESSAGE_TEXT: "#FFFFFF", // White
  AI_MESSAGE_BG: "#F3F4F6", // Light gray
  AI_MESSAGE_TEXT: "#111827", // Dark gray
  SYSTEM_MESSAGE_BG: "#E5E7EB", // Light gray
  SYSTEM_MESSAGE_TEXT: "#6B7280", // Medium gray

  // Border colors - Light grays
  BORDER: "#E5E7EB", // Light gray
  BORDER_LIGHT: "#F3F4F6", // Very light gray

  // MCP status colors - Gray tones
  MCP_PENDING: "#9CA3AF", // Light gray
  MCP_IN_PROGRESS: "#3B82F6", // Blue
  MCP_COMPLETED: "#10B981", // Green
  MCP_FAILED: "#EF4444", // Red

  // Overlay colors
  OVERLAY: "rgba(0, 0, 0, 0.4)",
  OVERLAY_LIGHT: "rgba(0, 0, 0, 0.1)",
};

export const THEME = {
  colors: {
    primary: COLORS.PRIMARY,
    secondary: COLORS.SECONDARY,
    background: COLORS.BACKGROUND,
    surface: COLORS.SURFACE,
    error: COLORS.ERROR,
    text: COLORS.TEXT_PRIMARY,
    disabled: COLORS.TEXT_TERTIARY,
    placeholder: COLORS.TEXT_SECONDARY,
    backdrop: COLORS.OVERLAY,
  },
  roundness: 12,
  animation: {
    scale: 1.0,
  },
};
