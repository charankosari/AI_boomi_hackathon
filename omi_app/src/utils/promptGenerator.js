/**
 * Prompt Generator Utility
 * Generates structured execution prompts for MCP workflows
 * Follows the Execution Prompt Framework template
 */

import { MCP_TOOLS } from '../constants/mcpTools';
import { describeIntent } from './intentRecognition';

/**
 * Generate complete execution prompt for MCP workflow
 */
export function generateExecutionPrompt(intent, mcpSelection, context = {}) {
  const prompt = {
    task: generateTaskDescription(intent),
    identifiedMCPs: {
      primary: mcpSelection.primary,
      secondary: mcpSelection.secondary || [],
    },
    executionSteps: generateExecutionSteps(intent, mcpSelection),
    parameters: extractParameters(intent, context),
    expectedOutput: generateExpectedOutput(intent, mcpSelection),
    fallback: generateFallbackStrategy(intent, mcpSelection),
  };

  return formatPrompt(prompt);
}

/**
 * Generate clear task description from intent
 */
function generateTaskDescription(intent) {
  const description = describeIntent(intent);

  // Capitalize first letter
  return description.charAt(0).toUpperCase() + description.slice(1);
}

/**
 * Generate step-by-step execution plan
 */
function generateExecutionSteps(intent, mcpSelection) {
  const steps = [];
  const { primary, secondary, pattern } = mcpSelection;

  const primaryMCP = Object.values(MCP_TOOLS).find(t => t.id === primary);
  const { actionType, targetObject } = intent;

  // Generate primary MCP steps
  const primarySteps = generateMCPSteps(primary, actionType, targetObject, intent);
  steps.push(...primarySteps);

  // Generate secondary MCP steps based on pattern
  if (secondary && secondary.length > 0) {
    if (pattern === 'sequential') {
      // Add secondary steps after primary
      secondary.forEach(mcpId => {
        const secondarySteps = generateMCPSteps(mcpId, actionType, targetObject, intent);
        steps.push(...secondarySteps);
      });
    } else if (pattern === 'parallel') {
      // Add note about parallel execution
      steps.push({
        description: `Execute in parallel: ${secondary.map(id => getMCPName(id)).join(', ')}`,
        mcp: secondary,
        type: 'parallel',
      });
    }
  }

  // Add verification step
  steps.push({
    description: 'Verify execution and confirm results',
    mcp: primary,
    type: 'verification',
  });

  return steps;
}

/**
 * Generate specific steps for an MCP
 */
function generateMCPSteps(mcpId, actionType, targetObject, intent) {
  const steps = [];
  const mcpName = getMCPName(mcpId);

  // Action-specific step templates
  const stepTemplates = {
    send: {
      email: [
        `Use ${mcpName} to compose email`,
        `Add recipients and subject`,
        `Send email via ${mcpName}`,
      ],
      message: [
        `Use ${mcpName} to compose message`,
        `Select recipient`,
        `Send message via ${mcpName}`,
      ],
    },
    schedule: {
      event: [
        `Use ${mcpName} to check availability`,
        `Create event with details`,
        `Add attendees and send invites`,
      ],
      meeting: [
        `Use ${mcpName} to find free time slot`,
        `Schedule meeting with participants`,
        `Send calendar invites`,
      ],
    },
    create: {
      document: [
        `Use ${mcpName} to create new document`,
        `Add content and formatting`,
        `Save and share document`,
      ],
      note: [
        `Use ${mcpName} to create new note`,
        `Add content and tags`,
        `Save to appropriate location`,
      ],
      code: [
        `Use ${mcpName} to generate code structure`,
        `Implement functionality`,
        `Test and validate code`,
      ],
    },
    search: {
      research: [
        `Use ${mcpName} to search for information`,
        `Analyze and filter results`,
        `Compile relevant findings`,
      ],
      information: [
        `Use ${mcpName} to query information`,
        `Verify accuracy`,
        `Format response`,
      ],
    },
    order: {
      food: [
        `Use ${mcpName} to browse restaurants`,
        `Select items and customize`,
        `Place order and track delivery`,
      ],
    },
    control: {
      device: [
        `Use ${mcpName} to connect to device`,
        `Execute control command`,
        `Verify device state`,
      ],
    },
  };

  // Get appropriate template
  const template = stepTemplates[actionType]?.[targetObject] ||
                   stepTemplates[actionType]?.default ||
                   [`Use ${mcpName} to ${actionType} ${targetObject}`, `Complete ${actionType} operation`];

  // Convert template to step objects
  template.forEach((desc, index) => {
    steps.push({
      description: desc,
      mcp: mcpId,
      type: 'execution',
      order: index + 1,
    });
  });

  return steps;
}

/**
 * Extract parameters from intent and context
 */
function extractParameters(intent, context = {}) {
  const parameters = {};

  // Extract from intent context
  if (intent.context.people && intent.context.people.length > 0) {
    parameters.recipients = intent.context.people;
  }

  if (intent.context.dates && intent.context.dates.length > 0) {
    parameters.date = intent.context.dates[0].value;
  }

  if (intent.context.times && intent.context.times.length > 0) {
    parameters.time = intent.context.times[0].value;
  }

  if (intent.context.topics && intent.context.topics.length > 0) {
    parameters.subject = intent.context.topics[0];
  }

  if (intent.context.location && intent.context.location.length > 0) {
    parameters.location = intent.context.location[0];
  }

  if (intent.context.urgency) {
    parameters.urgency = intent.context.urgency;
  }

  // Add any additional context parameters
  if (context.conversationId) {
    parameters.conversationId = context.conversationId;
  }

  // Add raw input for reference
  parameters.userInput = intent.raw;

  return parameters;
}

/**
 * Generate expected output description
 */
function generateExpectedOutput(intent, mcpSelection) {
  const { primary } = mcpSelection;
  const { actionType, targetObject } = intent;

  const outputs = [];

  // Define expected outputs based on action type
  const outputTemplates = {
    send: [
      'Confirmation that message/email was sent successfully',
      'Delivery status or receipt',
      'Message ID or reference number',
    ],
    schedule: [
      'Event created in calendar',
      'Calendar invites sent to participants',
      'Event ID and confirmation details',
    ],
    create: [
      'New item created successfully',
      'Link or reference to created item',
      'Confirmation of save/publish',
    ],
    search: [
      'Relevant results matching the query',
      'Summary of findings',
      'Sources and citations (if applicable)',
    ],
    order: [
      'Order placed successfully',
      'Order ID and tracking information',
      'Estimated delivery time',
    ],
    control: [
      'Device state changed successfully',
      'Confirmation of command execution',
      'Current device status',
    ],
    read: [
      'Retrieved information',
      'Summary of content',
      'Relevant details extracted',
    ],
  };

  const template = outputTemplates[actionType] || [
    'Operation completed successfully',
    'Confirmation details',
    'Reference or ID',
  ];

  outputs.push(...template);

  return outputs;
}

/**
 * Generate fallback strategy
 */
function generateFallbackStrategy(intent, mcpSelection) {
  const { primary, secondary } = mcpSelection;
  const fallbacks = [];

  // Primary fallback: try alternative MCP
  if (secondary && secondary.length > 0) {
    fallbacks.push(`If ${getMCPName(primary)} fails, try using ${getMCPName(secondary[0])} as alternative`);
  } else {
    // Suggest alternative MCPs based on action
    const alternatives = suggestAlternativeMCPs(primary, intent);
    if (alternatives.length > 0) {
      fallbacks.push(`If ${getMCPName(primary)} fails, try: ${alternatives.map(getMCPName).join(' or ')}`);
    }
  }

  // Secondary fallback: manual intervention
  fallbacks.push('If all automated attempts fail, prompt user for manual intervention');

  // Tertiary fallback: save for later
  fallbacks.push('Save task details for retry later if persistent failures occur');

  return fallbacks.join('\n- ');
}

/**
 * Suggest alternative MCPs for fallback
 */
function suggestAlternativeMCPs(primaryMCP, intent) {
  const { actionType, targetObject } = intent;

  const alternatives = {
    gmail: ['outlook'],
    outlook: ['gmail'],
    whatsapp: [],
    google_calendar: [],
    google_docs: ['notion'],
    notion: ['google_docs', 'obsidian'],
    obsidian: ['notion'],
    lovable: ['cursor'],
    cursor: ['lovable'],
    claude: ['chatgpt', 'perplexity'],
    chatgpt: ['claude', 'perplexity'],
    perplexity: ['chatgpt', 'claude'],
  };

  return alternatives[primaryMCP] || [];
}

/**
 * Get MCP name by ID
 */
function getMCPName(mcpId) {
  const mcp = Object.values(MCP_TOOLS).find(t => t.id === mcpId);
  return mcp ? mcp.name : mcpId;
}

/**
 * Format the complete prompt as a string
 */
function formatPrompt(prompt) {
  const secondaryList = prompt.identifiedMCPs.secondary.length > 0
    ? prompt.identifiedMCPs.secondary.map(getMCPName).join(', ')
    : 'None';

  return `
TASK: ${prompt.task}

IDENTIFIED MCPs: ${getMCPName(prompt.identifiedMCPs.primary)}${
    prompt.identifiedMCPs.secondary.length > 0
      ? ', ' + prompt.identifiedMCPs.secondary.map(getMCPName).join(', ')
      : ''
  }

PRIMARY MCP: ${getMCPName(prompt.identifiedMCPs.primary)}
SECONDARY MCPs: ${secondaryList}

EXECUTION STEPS:
${prompt.executionSteps.map((step, i) => `${i + 1}. ${step.description}`).join('\n')}

PARAMETERS:
${Object.entries(prompt.parameters).map(([key, val]) => `- ${key}: ${val}`).join('\n')}

EXPECTED OUTPUT:
${prompt.expectedOutput.map(output => `- ${output}`).join('\n')}

FALLBACK STRATEGY:
- ${prompt.fallback}
  `.trim();
}

/**
 * Generate a simplified prompt for display in UI
 */
export function generateDisplayPrompt(intent, mcpSelection) {
  const { primary, secondary } = mcpSelection;
  const { actionType, targetObject } = intent;

  return {
    title: `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} ${targetObject}`,
    primaryMCP: getMCPName(primary),
    secondaryMCPs: secondary ? secondary.map(getMCPName) : [],
    description: describeIntent(intent),
  };
}

/**
 * Generate workflow metadata
 */
export function generateWorkflowMetadata(intent, mcpSelection) {
  return {
    intentConfidence: intent.confidence,
    actionType: intent.actionType,
    targetObject: intent.targetObject,
    primaryMCP: mcpSelection.primary,
    secondaryMCPs: mcpSelection.secondary || [],
    pattern: mcpSelection.pattern || 'single',
    estimatedSteps: generateExecutionSteps(intent, mcpSelection).length,
    complexity: calculateWorkflowComplexity(intent, mcpSelection),
  };
}

/**
 * Calculate workflow complexity
 */
function calculateWorkflowComplexity(intent, mcpSelection) {
  let complexity = 'simple';

  const { secondary, pattern } = mcpSelection;

  // Multiple MCPs = more complex
  if (secondary && secondary.length > 0) {
    complexity = 'moderate';
  }

  // Parallel execution = more complex
  if (pattern === 'parallel') {
    complexity = 'complex';
  }

  // Many parameters = more complex
  const paramCount = Object.keys(extractParameters(intent)).length;
  if (paramCount > 5) {
    complexity = 'complex';
  }

  return complexity;
}

export default {
  generateExecutionPrompt,
  generateDisplayPrompt,
  generateWorkflowMetadata,
};
