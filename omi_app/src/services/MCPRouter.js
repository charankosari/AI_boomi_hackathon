/**
 * MCP Router Service
 * Routes user intents to appropriate MCP tools
 * Implements intelligent MCP selection with confidence scoring
 */

import { MCP_TOOLS } from '../constants/mcpTools';
import {
  mapIntentToMCP,
  identifySecondaryMCPs,
  determineOrchestrationPattern,
  explainMCPSelection,
} from '../utils/mcpMapping';

class MCPRouter {
  /**
   * Route intent to appropriate MCP(s)
   * Returns routing decision with primary, secondary MCPs and confidence
   */
  route(intent) {
    if (!intent || !intent.actionType) {
      throw new Error('Invalid intent provided to router');
    }

    const { actionType, targetObject, context, keywords, confidence } = intent;

    // Select primary MCP
    const primary = this.selectPrimaryMCP(actionType, targetObject, keywords);

    if (!primary) {
      throw new Error('Unable to route intent to any MCP');
    }

    // Identify secondary MCPs
    const secondary = this.identifySecondaryMCPs(intent, primary);

    // Determine orchestration pattern
    const pattern = this.determinePattern(intent, primary, secondary);

    // Calculate routing confidence
    const routingConfidence = this.calculateRoutingConfidence(
      intent,
      primary,
      secondary
    );

    // Generate reasoning explanation
    const reasoning = this.explainSelection(intent, primary, secondary);

    return {
      primary,
      secondary,
      pattern,
      confidence: routingConfidence,
      reasoning,
      metadata: {
        intentConfidence: confidence,
        actionType,
        targetObject,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Select primary MCP based on intent
   */
  selectPrimaryMCP(actionType, targetObject, keywords) {
    // Use the mapping utility
    const intent = { actionType, targetObject, keywords };
    const mcpId = mapIntentToMCP(intent);

    if (!mcpId) {
      // Fallback to keyword-based selection
      return this.selectByKeywords(keywords);
    }

    return mcpId;
  }

  /**
   * Select MCP by keywords if primary selection fails
   */
  selectByKeywords(keywords) {
    if (!keywords || keywords.length === 0) {
      return null;
    }

    const scores = {};

    // Score each MCP based on keyword matches
    Object.values(MCP_TOOLS).forEach(tool => {
      let score = 0;

      keywords.forEach(keyword => {
        if (tool.triggerKeywords.some(tk => tk.includes(keyword) || keyword.includes(tk))) {
          score += 3;
        }
        if (tool.capabilities.some(cap => cap.includes(keyword))) {
          score += 2;
        }
        if (tool.name.toLowerCase().includes(keyword)) {
          score += 5;
        }
      });

      if (score > 0) {
        scores[tool.id] = score;
      }
    });

    // Return highest scoring MCP
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

    return sorted.length > 0 ? sorted[0][0] : null;
  }

  /**
   * Identify secondary MCPs needed for the workflow
   */
  identifySecondaryMCPs(intent, primaryMCP) {
    return identifySecondaryMCPs(intent, primaryMCP);
  }

  /**
   * Determine orchestration pattern
   */
  determinePattern(intent, primary, secondary) {
    return determineOrchestrationPattern(intent, primary, secondary);
  }

  /**
   * Calculate confidence score for routing decision
   */
  calculateRoutingConfidence(intent, primary, secondary) {
    let confidence = 0;

    // Start with intent confidence
    confidence += intent.confidence * 0.4; // 40% weight

    // Add points for strong MCP match
    const mcp = Object.values(MCP_TOOLS).find(t => t.id === primary);
    if (mcp) {
      const keywordMatches = intent.keywords.filter(kw =>
        mcp.triggerKeywords.some(tk => tk.includes(kw) || kw.includes(tk))
      );
      const matchPercentage = (keywordMatches.length / Math.max(intent.keywords.length, 1)) * 100;
      confidence += matchPercentage * 0.3; // 30% weight
    }

    // Add points for clear action-target mapping
    const hasDirectMapping = this.hasDirectMapping(intent.actionType, intent.targetObject);
    if (hasDirectMapping) {
      confidence += 20; // 20% weight
    }

    // Add points for context clarity
    if (intent.context.people && intent.context.people.length > 0) confidence += 3;
    if (intent.context.dates && intent.context.dates.length > 0) confidence += 3;
    if (intent.context.times && intent.context.times.length > 0) confidence += 2;
    if (intent.context.topics && intent.context.topics.length > 0) confidence += 2;

    // Cap at 100
    return Math.min(Math.round(confidence), 100);
  }

  /**
   * Check if there's a direct mapping for action-target combination
   */
  hasDirectMapping(actionType, targetObject) {
    const mappingKey = `${actionType}-${targetObject}`;
    const { INTENT_TO_MCP_MAP } = require('../utils/mcpMapping');
    return INTENT_TO_MCP_MAP[mappingKey] !== undefined;
  }

  /**
   * Explain why the MCP was selected
   */
  explainSelection(intent, primary, secondary) {
    return explainMCPSelection(intent, primary, secondary);
  }

  /**
   * Get MCP capabilities that match the intent
   */
  getMatchingCapabilities(mcpId, intent) {
    const mcp = Object.values(MCP_TOOLS).find(t => t.id === mcpId);

    if (!mcp) {
      return [];
    }

    const { actionType, targetObject, keywords } = intent;

    return mcp.capabilities.filter(cap => {
      const capLower = cap.toLowerCase();
      return (
        capLower.includes(actionType) ||
        capLower.includes(targetObject) ||
        keywords.some(kw => capLower.includes(kw.toLowerCase()))
      );
    });
  }

  /**
   * Validate if an MCP can handle the intent
   */
  validateMCPForIntent(mcpId, intent) {
    const matchingCapabilities = this.getMatchingCapabilities(mcpId, intent);

    return {
      canHandle: matchingCapabilities.length > 0,
      capabilities: matchingCapabilities,
      confidence: this.calculateRoutingConfidence(intent, mcpId, []),
    };
  }

  /**
   * Get alternative MCPs for the intent
   */
  getAlternativeMCPs(intent, excludeMCPs = []) {
    const alternatives = [];

    Object.values(MCP_TOOLS).forEach(tool => {
      if (excludeMCPs.includes(tool.id)) {
        return;
      }

      const validation = this.validateMCPForIntent(tool.id, intent);

      if (validation.canHandle) {
        alternatives.push({
          id: tool.id,
          name: tool.name,
          confidence: validation.confidence,
          capabilities: validation.capabilities,
        });
      }
    });

    // Sort by confidence
    return alternatives.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Suggest optimal workflow pattern for multi-MCP scenario
   */
  suggestWorkflowPattern(primaryMCP, secondaryMCPs, intent) {
    const { actionType } = intent;

    // Define patterns based on action types
    const patterns = {
      sequential: [
        'send', // Usually need to fetch data first, then send
        'create', // Create then notify/share
        'schedule', // Schedule then notify
        'update', // Fetch, update, verify
      ],
      parallel: [
        'search', // Can search multiple sources simultaneously
        'read', // Can read from multiple sources
        'order', // Can order and do other things
      ],
      conditional: [
        'control', // May need to check state before acting
      ],
    };

    // Check which pattern the action type falls into
    for (const [pattern, actions] of Object.entries(patterns)) {
      if (actions.includes(actionType)) {
        return pattern;
      }
    }

    // Default based on number of secondary MCPs
    if (secondaryMCPs.length === 0) {
      return 'single';
    } else if (secondaryMCPs.length === 1) {
      return 'sequential';
    } else {
      return 'parallel';
    }
  }

  /**
   * Estimate workflow complexity
   */
  estimateComplexity(routing) {
    const { primary, secondary, pattern } = routing;

    let complexity = 1; // Base complexity

    // Add complexity for secondary MCPs
    complexity += secondary.length;

    // Add complexity for pattern
    const patternComplexity = {
      single: 0,
      sequential: 1,
      parallel: 2,
      conditional: 2,
      verification: 1,
    };

    complexity += patternComplexity[pattern] || 0;

    // Classify
    if (complexity <= 2) return 'simple';
    if (complexity <= 4) return 'moderate';
    return 'complex';
  }

  /**
   * Generate routing summary for display
   */
  generateRoutingSummary(routing) {
    const { primary, secondary, pattern, confidence, reasoning } = routing;

    const primaryMCP = Object.values(MCP_TOOLS).find(t => t.id === primary);
    const secondaryMCPObjects = secondary.map(id =>
      Object.values(MCP_TOOLS).find(t => t.id === id)
    );

    return {
      primaryMCP: {
        id: primary,
        name: primaryMCP?.name,
        icon: primaryMCP?.icon,
      },
      secondaryMCPs: secondaryMCPObjects.map(mcp => ({
        id: mcp?.id,
        name: mcp?.name,
        icon: mcp?.icon,
      })),
      pattern,
      confidence,
      complexity: this.estimateComplexity(routing),
      description: reasoning,
    };
  }
}

// Export singleton instance
const mcpRouter = new MCPRouter();
export default mcpRouter;
