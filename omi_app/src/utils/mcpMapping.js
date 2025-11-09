/**
 * MCP Mapping Utility
 * Maps user intents to appropriate MCP tools
 * Implements the intent-to-MCP routing logic
 */

import { MCP_TOOLS } from '../constants/mcpTools';

/**
 * Quick Reference: Intent → Primary MCP Mapping
 * Based on the MCP Orchestration Guide
 */
export const INTENT_TO_MCP_MAP = {
  // Communication actions
  'send-message': ['whatsapp'],
  'send-email': ['gmail', 'outlook'],
  'read-email': ['gmail', 'outlook'],
  'check-messages': ['whatsapp'],

  // Scheduling actions
  'schedule-event': ['google_calendar'],
  'schedule-meeting': ['google_calendar'],
  'find-availability': ['google_calendar'],
  'cancel-event': ['google_calendar'],

  // Documentation actions
  'create-document': ['google_docs', 'notion'],
  'create-note': ['notion', 'obsidian'],
  'update-document': ['google_docs', 'notion'],
  'search-notes': ['notion', 'obsidian'],

  // Development actions
  'create-code': ['cursor', 'lovable'],
  'build-website': ['lovable'],
  'edit-code': ['cursor'],
  'deploy-app': ['lovable'],

  // Research actions
  'search-web': ['perplexity'],
  'research-topic': ['perplexity', 'chatgpt'],
  'ask-question': ['claude', 'chatgpt', 'perplexity'],
  'fact-check': ['perplexity'],

  // Financial actions
  'trade-stock': ['zerodha'],
  'check-portfolio': ['zerodha'],
  'buy-stock': ['zerodha'],
  'sell-stock': ['zerodha'],

  // Lifestyle actions
  'order-food': ['zomato'],
  'find-restaurant': ['zomato'],
  'control-device': ['alexa'],
  'play-music': ['alexa'],
};

/**
 * Multi-MCP scenarios
 * When multiple MCPs should be used together
 */
export const MULTI_MCP_SCENARIOS = {
  'email-about-meeting': {
    primary: 'gmail',
    secondary: ['google_calendar'],
    pattern: 'sequential',
    description: 'Fetch meeting details from calendar, then send email'
  },
  'schedule-and-notify': {
    primary: 'google_calendar',
    secondary: ['gmail', 'whatsapp'],
    pattern: 'sequential',
    description: 'Create calendar event, then send notifications'
  },
  'research-and-document': {
    primary: 'perplexity',
    secondary: ['google_docs', 'notion'],
    pattern: 'sequential',
    description: 'Research topic, then create document with findings'
  },
  'code-and-deploy': {
    primary: 'cursor',
    secondary: ['lovable'],
    pattern: 'sequential',
    description: 'Write code, then deploy to web'
  },
  'order-and-schedule': {
    primary: 'zomato',
    secondary: ['google_calendar'],
    pattern: 'parallel',
    description: 'Order food and add to calendar simultaneously'
  },
};

/**
 * Map intent to primary MCP tool
 */
export function mapIntentToMCP(intent) {
  const { actionType, targetObject, keywords } = intent;

  // Construct intent key
  const intentKey = `${actionType}-${targetObject}`;

  // Direct mapping lookup
  let candidates = INTENT_TO_MCP_MAP[intentKey] || [];

  // If no direct match, use keyword-based matching
  if (candidates.length === 0) {
    candidates = findMCPsByKeywords(keywords);
  }

  // If still no match, use fallback based on action type
  if (candidates.length === 0) {
    candidates = fallbackMCPSelection(actionType, targetObject);
  }

  return candidates.length > 0 ? candidates[0] : null;
}

/**
 * Find MCPs by keyword matching
 */
function findMCPsByKeywords(keywords) {
  const matches = [];
  const mcpScores = {};

  Object.values(MCP_TOOLS).forEach(tool => {
    let score = 0;

    keywords.forEach(keyword => {
      if (tool.triggerKeywords.some(tk => tk.includes(keyword) || keyword.includes(tk))) {
        score += 2;
      }
      if (tool.capabilities.some(cap => cap.includes(keyword))) {
        score += 1;
      }
    });

    if (score > 0) {
      mcpScores[tool.id] = score;
    }
  });

  // Sort by score and return IDs
  return Object.entries(mcpScores)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

/**
 * Fallback MCP selection based on action type and target
 */
function fallbackMCPSelection(actionType, targetObject) {
  const fallbackMap = {
    send: {
      message: ['whatsapp'],
      email: ['gmail'],
      default: ['gmail'],
    },
    schedule: {
      event: ['google_calendar'],
      meeting: ['google_calendar'],
      default: ['google_calendar'],
    },
    create: {
      document: ['google_docs'],
      note: ['notion'],
      code: ['cursor'],
      default: ['notion'],
    },
    search: {
      research: ['perplexity'],
      information: ['perplexity'],
      default: ['perplexity'],
    },
    order: {
      food: ['zomato'],
      default: ['zomato'],
    },
    control: {
      device: ['alexa'],
      default: ['alexa'],
    },
  };

  if (fallbackMap[actionType]) {
    return fallbackMap[actionType][targetObject] || fallbackMap[actionType].default || [];
  }

  return [];
}

/**
 * Identify secondary MCPs based on intent and primary MCP
 */
export function identifySecondaryMCPs(intent, primaryMCP) {
  const { actionType, targetObject, context } = intent;

  const secondaryMCPs = [];

  // Check for multi-MCP scenarios
  const scenarioKey = `${actionType}-${targetObject}`;

  // Look through multi-MCP scenarios
  for (const [key, scenario] of Object.entries(MULTI_MCP_SCENARIOS)) {
    if (key.includes(actionType) || key.includes(targetObject)) {
      if (scenario.primary === primaryMCP) {
        secondaryMCPs.push(...scenario.secondary);
      }
    }
  }

  // Context-based secondary MCP identification
  if (context.dates && context.dates.length > 0) {
    // If dates mentioned, might need calendar
    if (primaryMCP !== 'google_calendar' && !secondaryMCPs.includes('google_calendar')) {
      if (actionType === 'send' && (targetObject === 'email' || targetObject === 'message')) {
        secondaryMCPs.push('google_calendar');
      }
    }
  }

  if (context.people && context.people.length > 0) {
    // If people mentioned, might need communication tools
    if (primaryMCP === 'google_calendar' && !secondaryMCPs.includes('gmail')) {
      secondaryMCPs.push('gmail');
    }
  }

  // Remove duplicates
  return [...new Set(secondaryMCPs)];
}

/**
 * Determine orchestration pattern for multi-MCP workflow
 */
export function determineOrchestrationPattern(intent, primaryMCP, secondaryMCPs) {
  if (secondaryMCPs.length === 0) {
    return 'single';
  }

  const { actionType, targetObject } = intent;

  // Check predefined scenarios
  for (const scenario of Object.values(MULTI_MCP_SCENARIOS)) {
    if (scenario.primary === primaryMCP &&
        scenario.secondary.some(s => secondaryMCPs.includes(s))) {
      return scenario.pattern;
    }
  }

  // Default patterns based on action type
  const actionPatterns = {
    send: 'sequential', // Usually need to fetch data first, then send
    create: 'sequential', // Create then share/notify
    schedule: 'sequential', // Schedule then notify
    search: 'parallel', // Can search multiple sources simultaneously
    order: 'parallel', // Can order and do other things in parallel
  };

  return actionPatterns[actionType] || 'sequential';
}

/**
 * Get MCP capabilities that match the intent
 */
export function getMatchingCapabilities(mcpId, intent) {
  const mcp = MCP_TOOLS[mcpId.toUpperCase()] || Object.values(MCP_TOOLS).find(t => t.id === mcpId);

  if (!mcp) return [];

  const { actionType, targetObject, keywords } = intent;

  return mcp.capabilities.filter(cap => {
    // Check if capability matches action or target
    return (
      cap.includes(actionType) ||
      cap.includes(targetObject) ||
      keywords.some(kw => cap.includes(kw))
    );
  });
}

/**
 * Explain why an MCP was selected
 */
export function explainMCPSelection(intent, primaryMCP, secondaryMCPs = []) {
  const { actionType, targetObject, confidence } = intent;

  let explanation = `Selected ${primaryMCP} as primary tool because:\n`;

  const mcp = Object.values(MCP_TOOLS).find(t => t.id === primaryMCP);

  if (mcp) {
    explanation += `- It specializes in ${mcp.capabilities.join(', ')}\n`;
    explanation += `- The intent matches: ${actionType} ${targetObject}\n`;
  }

  if (secondaryMCPs.length > 0) {
    explanation += `\nSecondary tools needed:\n`;
    secondaryMCPs.forEach(id => {
      const secondaryMCP = Object.values(MCP_TOOLS).find(t => t.id === id);
      if (secondaryMCP) {
        explanation += `- ${secondaryMCP.name}: ${secondaryMCP.description}\n`;
      }
    });
  }

  explanation += `\nConfidence: ${confidence}%`;

  return explanation;
}

export default {
  mapIntentToMCP,
  identifySecondaryMCPs,
  determineOrchestrationPattern,
  getMatchingCapabilities,
  explainMCPSelection,
};
