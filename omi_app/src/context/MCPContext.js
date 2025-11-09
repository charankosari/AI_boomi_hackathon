/**
 * MCP Context
 * Manages MCP workflow state and tracking
 * Provides workflow execution status and statistics
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import storageService from "../services/StorageService";

const MCPContext = createContext();

export const useMCP = () => {
  const context = useContext(MCPContext);
  if (!context) {
    throw new Error("useMCP must be used within MCPProvider");
  }
  return context;
};

export const MCPProvider = ({ children }) => {
  const [activeWorkflows, setActiveWorkflows] = useState([]);
  const [mcpStats, setMcpStats] = useState({
    totalExecutions: 0,
    successRate: 0,
    mostUsed: [],
  });

  // Update stats periodically
  useEffect(() => {
    updateStats();
  }, [activeWorkflows]);

  /**
   * Start a new workflow
   */
  const startWorkflow = useCallback(async (workflow) => {
    setActiveWorkflows((prev) => [...prev, workflow]);
    return workflow;
  }, []);

  /**
   * Update a workflow step
   */
  const updateWorkflowStep = useCallback((workflowId, stepIndex, status) => {
    setActiveWorkflows((prev) =>
      prev.map((wf) => {
        if (wf.id === workflowId) {
          const updatedSteps = [...wf.steps];
          if (updatedSteps[stepIndex]) {
            updatedSteps[stepIndex] = {
              ...updatedSteps[stepIndex],
              status,
              updatedAt: new Date().toISOString(),
            };
          }
          return { ...wf, steps: updatedSteps };
        }
        return wf;
      })
    );
  }, []);

  /**
   * Complete a workflow
   */
  const completeWorkflow = useCallback((workflowId, result) => {
    setActiveWorkflows((prev) =>
      prev.map((wf) => {
        if (wf.id === workflowId) {
          return {
            ...wf,
            status: "completed",
            result,
            completedAt: new Date().toISOString(),
          };
        }
        return wf;
      })
    );

    // Remove from active workflows after a delay
    setTimeout(() => {
      setActiveWorkflows((prev) => prev.filter((wf) => wf.id !== workflowId));
    }, 5000);
  }, []);

  /**
   * Fail a workflow
   */
  const failWorkflow = useCallback((workflowId, error) => {
    setActiveWorkflows((prev) =>
      prev.map((wf) => {
        if (wf.id === workflowId) {
          return {
            ...wf,
            status: "failed",
            error,
            completedAt: new Date().toISOString(),
          };
        }
        return wf;
      })
    );

    // Remove from active workflows after a delay
    setTimeout(() => {
      setActiveWorkflows((prev) => prev.filter((wf) => wf.id !== workflowId));
    }, 5000);
  }, []);

  /**
   * Cancel a workflow
   * Note: Since backend handles workflow execution, this just updates local state
   */
  const cancelWorkflow = useCallback(async (workflowId) => {
    // Update local state
    setActiveWorkflows((prev) =>
      prev.map((wf) => {
        if (wf.id === workflowId) {
          return {
            ...wf,
            status: "cancelled",
            completedAt: new Date().toISOString(),
          };
        }
        return wf;
      })
    );

    // Remove from active workflows
    setTimeout(() => {
      setActiveWorkflows((prev) => prev.filter((wf) => wf.id !== workflowId));
    }, 2000);

    return true;
  }, []);

  /**
   * Get workflow by ID
   */
  const getWorkflow = useCallback(
    (workflowId) => {
      return activeWorkflows.find((wf) => wf.id === workflowId);
    },
    [activeWorkflows]
  );

  /**
   * Update MCP statistics
   */
  const updateStats = useCallback(async () => {
    try {
      const stats = await storageService.getStats();

      if (stats) {
        setMcpStats({
          totalExecutions: stats.totalWorkflows || 0,
          successRate: stats.successRate || 0,
          mostUsed: stats.mostUsedMCPs || [],
          totalConversations: stats.totalConversations || 0,
          recentConversations: stats.recentConversations || 0,
        });
      }
    } catch (error) {
      console.error("Error updating MCP stats:", error);
    }
  }, []);

  /**
   * Get workflow statistics
   */
  const getWorkflowStats = useCallback(() => {
    const total = activeWorkflows.length;
    const pending = activeWorkflows.filter(
      (wf) => wf.status === "pending"
    ).length;
    const inProgress = activeWorkflows.filter(
      (wf) => wf.status === "in_progress"
    ).length;
    const completed = activeWorkflows.filter(
      (wf) => wf.status === "completed"
    ).length;
    const failed = activeWorkflows.filter(
      (wf) => wf.status === "failed"
    ).length;

    return {
      total,
      pending,
      inProgress,
      completed,
      failed,
      activeCount: pending + inProgress,
    };
  }, [activeWorkflows]);

  /**
   * Get MCP usage breakdown
   */
  const getMCPUsage = useCallback(() => {
    const usage = {};

    activeWorkflows.forEach((wf) => {
      usage[wf.primaryMCP] = (usage[wf.primaryMCP] || 0) + 1;

      if (wf.secondaryMCPs) {
        wf.secondaryMCPs.forEach((mcp) => {
          usage[mcp] = (usage[mcp] || 0) + 1;
        });
      }
    });

    return Object.entries(usage)
      .map(([mcp, count]) => ({ mcp, count }))
      .sort((a, b) => b.count - a.count);
  }, [activeWorkflows]);

  const value = {
    // State
    activeWorkflows,
    mcpStats,

    // Actions
    startWorkflow,
    updateWorkflowStep,
    completeWorkflow,
    failWorkflow,
    cancelWorkflow,
    getWorkflow,
    updateStats,
    getWorkflowStats,
    getMCPUsage,
  };

  return <MCPContext.Provider value={value}>{children}</MCPContext.Provider>;
};

export default MCPContext;
