// index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
// const { Anthropic } = require("@anthropic-ai/sdk"); // COMMENTED: Using OpenAI SDK via fastrouter.ai instead
const OpenAI = require("openai");
const { spawn } = require("node:child_process");
const os = require("node:os");
const {
  connectMongo,
  upsertSession,
  saveMessage,
  listMessages, // (uid, limit) -> newest-first array
  saveToolAction,
  listToolActions,
  listAllToolActions,
  getUserPreferences,
  updateUserPreferences,
  isToolEnabled,
} = require("./db.mongo");
const {
  retrieveRelevantContext,
  buildRAGContext,
  storeUserMessage,
  storeAssistantResponse,
  storeToolResult,
  listRAGData,
  getRAGStats,
  getContactByName,
  extractAndStoreContacts,
  storeQAPair,
} = require("./rag-service");
const {
  parseDateTimeForCalendar,
  extractEventSummary,
} = require("./date-parser");

// ------------------- required env -------------------
// COMMENTED: Old Anthropic check
// if (!process.env.ANTHROPIC_API_KEY) {
//   console.error("❌ Missing ANTHROPIC_API_KEY in .env");
//   process.exit(1);
// }
// Note: NOTION_TOKEN and other MCP tokens are optional - MCPs will be enabled if tokens are provided

const CLAUDE_MODEL =
  process.env.CLAUDE_MODEL || "anthropic/claude-sonnet-4-20250514";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || null;
const FASTROUTER_API_KEY = process.env.FASTROUTER_API_KEY || "";
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS || "2048", 10); // Default 2048 tokens for responses

// ------------------- clients -------------------
// COMMENTED: Old Anthropic client
// const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// New OpenAI client via fastrouter.ai
// This allows us to use Anthropic Claude models through the OpenAI-compatible API
if (!FASTROUTER_API_KEY) {
  console.warn("⚠️  FASTROUTER_API_KEY not set. API calls may fail.");
}
const openai = new OpenAI({
  baseURL: "https://go.fastrouter.ai/api/v1",
  apiKey: FASTROUTER_API_KEY,
});

// ------------------- app setup -------------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: "text/*" }));
app.use(
  express.raw({
    type: ["application/octet-stream", "image/*", "audio/*", "video/*"],
  })
);

// ------------------- MCP Manager -------------------
const { getMCP, getEnabledMCPs, getAvailableMCPs } = require("./mcp-manager");

// Cache for active MCP clients
const activeMCPs = new Map(); // name -> proxy

// Notion-specific adapters (kept for backward compatibility)
function makeTitleProp(text) {
  return { title: [{ text: { content: String(text || "") } }] };
}

function makeChildrenFromContent(content) {
  if (!content) return [];
  return [
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: String(content) } }],
      },
    },
  ];
}

// Notion-specific adapter function
async function adaptNotionCall(mcpProxy, toolName, args) {
  const ALIASES = new Map([
    ["create_page", "API-post-page"],
    ["create-page", "API-post-page"],
    ["create_page_in_database", "API-post-page"],
    ["createPage", "API-post-page"],
    ["search", "API-post-search"],
    ["database_query", "API-post-database-query"],
    ["append_blocks", "API-patch-block-children"],
    ["appendBlocks", "API-patch-block-children"],
  ]);

  const tools = await mcpProxy.listTools();
  const names = new Set(tools.map((t) => t.name));

  const alias = ALIASES.get(toolName);
  const resolved = names.has(toolName) ? toolName : alias || toolName;

  // For Notion, apply special handling if needed
  // Enhanced Notion adapter logic can go here

  return { toolName: resolved, args };
}

// ------------------- helpers -------------------

/**
 * Check if conversation is important and save summary to Notion
 */
async function checkAndSaveSummaryToNotion(uid, userMessage, assistantReply) {
  // Check if Notion MCP is available
  if (!process.env.NOTION_TOKEN) {
    return; // Notion not configured
  }

  // Determine if conversation is important
  const isImportant = isConversationImportant(userMessage, assistantReply);

  if (!isImportant) {
    return; // Not important, skip
  }

  try {
    // Get Notion MCP
    const notionMCP = await getMCP("notion");
    if (!notionMCP) {
      console.warn("Notion MCP not available");
      return;
    }

    // Generate a summary of the conversation
    const summary = generateConversationSummary(userMessage, assistantReply);

    // Create Notion page with summary only
    const pageTitle = `Important Note - ${new Date().toLocaleDateString()}`;

    const notionArgs = {
      parent: {
        type: "page_id",
        page_id: process.env.NOTION_PAGE_ID || undefined, // Optional: parent page ID
      },
      title: pageTitle,
      children: makeChildrenFromContent(summary),
    };

    // Use the Notion adapter to call the correct tool
    const adapted = await adaptNotionCall(
      notionMCP,
      "API-post-page",
      notionArgs
    );
    const result = await notionMCP.call(adapted.toolName, adapted.args);

    console.log("✅ Saved important conversation summary to Notion");

    // Save tool action for tracking
    await saveToolAction({
      session_uid: uid,
      tool_name: "API-post-page",
      mcp_name: "notion",
      tool_args: notionArgs,
      tool_result: result,
      result_summary: "Saved important conversation summary to Notion",
      success: true,
      user_message: userMessage,
    });
  } catch (error) {
    console.error("Error saving to Notion:", error);
    throw error;
  }
}

/**
 * Determine if a conversation is important
 */
function isConversationImportant(userMessage, assistantReply) {
  const message = (userMessage + " " + assistantReply).toLowerCase();

  // Keywords that indicate importance
  const importantKeywords = [
    "important",
    "remember",
    "save",
    "note",
    "document",
    "critical",
    "urgent",
    "action item",
    "todo",
    "task",
    "decision",
    "meeting notes",
    "summary",
    "key point",
    "takeaway",
  ];

  // Check if message contains important keywords
  const hasImportantKeyword = importantKeywords.some((keyword) =>
    message.includes(keyword)
  );

  // Check if user explicitly asked to save/note
  const explicitSaveRequest =
    message.includes("save this") ||
    message.includes("note this") ||
    message.includes("remember this") ||
    message.includes("document this") ||
    message.includes("add to notion");

  // Check if conversation is substantial (longer conversations might be important)
  const isSubstantial = userMessage.length + assistantReply.length > 500;

  // Check if it contains actionable items
  const hasActionItems =
    message.includes("action:") ||
    message.includes("todo:") ||
    message.includes("task:") ||
    message.includes("follow up");

  return (
    explicitSaveRequest ||
    (hasImportantKeyword && isSubstantial) ||
    hasActionItems
  );
}

/**
 * Generate a summary of the conversation (only essential information)
 */
function generateConversationSummary(userMessage, assistantReply) {
  let summary = `# Summary\n\n`;
  summary += `**Date:** ${new Date().toLocaleString()}\n\n`;
  summary += `---\n\n`;

  // Extract key points from user message
  summary += `## Key Points\n\n`;
  summary += `**User Request:** ${userMessage}\n\n`;

  // Extract key information from assistant reply
  summary += `**Summary:** ${assistantReply.substring(0, 500)}${
    assistantReply.length > 500 ? "..." : ""
  }\n\n`;

  // If there are action items or tasks mentioned, extract them
  const actionItems = extractActionItems(userMessage + " " + assistantReply);
  if (actionItems.length > 0) {
    summary += `## Action Items\n\n`;
    actionItems.forEach((item, index) => {
      summary += `${index + 1}. ${item}\n`;
    });
    summary += `\n`;
  }

  return summary;
}

/**
 * Extract action items from text
 */
function extractActionItems(text) {
  const actionItems = [];
  const lowerText = text.toLowerCase();

  // Look for patterns like "todo:", "action:", "task:", etc.
  const patterns = [
    /(?:todo|action|task):\s*([^\n]+)/gi,
    /(?:need to|must|should)\s+([^\n\.]+)/gi,
    /(?:follow up|follow-up):\s*([^\n]+)/gi,
  ];

  patterns.forEach((pattern) => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        actionItems.push(match[1].trim());
      }
    }
  });

  return actionItems.slice(0, 5); // Limit to 5 action items
}

function normalizeBody(body) {
  if (Buffer.isBuffer(body)) return { type: "buffer", byteLength: body.length };
  return body;
}

function extractText(body) {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (typeof body.message === "string") return body.message;
  if (Array.isArray(body.segments)) {
    return body.segments
      .map((s) => (s && typeof s.text === "string" ? s.text.trim() : ""))
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return "";
}

// ===== context helpers =====
const CONTEXT_MAX_MESSAGES = 12; // look back at most this many
const CONTEXT_MAX_AGE_MIN = 20; // only last 20 minutes
const CONTEXT_CHAR_BUDGET = 2000; // cap total context chars

function tokenize(s = "") {
  return (
    s.toLowerCase().match(/[a-z\u0900-\u097F\u0C00-\u0C7F0-9]+/g) || []
  ).slice(0, 256);
}
function jaccard(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

async function getRecentContext(uid) {
  const since = new Date(Date.now() - CONTEXT_MAX_AGE_MIN * 60 * 1000);
  const newestFirst = await listMessages(uid, CONTEXT_MAX_MESSAGES);
  return [...newestFirst]
    .reverse()
    .filter((m) => new Date(m.created_at) >= since);
}

// Get all messages for a session (for knowledge/context queries)
async function getAllContext(uid) {
  const allMessages = await listMessages(uid, 1000); // Get up to 1000 messages
  return [...allMessages].reverse(); // Return oldest first
}

// Detect if user is asking about themselves or past actions
function isKnowledgeQuery(currentText) {
  const knowledgeKeywords = [
    "what did i",
    "what did we",
    "what have i",
    "what have we",
    "when did i",
    "when did we",
    "where did i",
    "where did we",
    "how did i",
    "how did we",
    "did i",
    "did we",
    "my",
    "me",
    "i did",
    "i created",
    "i made",
    "i sent",
    "i booked",
    "i ordered",
    "i scheduled",
    "i reserved",
    "show me",
    "tell me about",
    "what about",
    "remember",
    "recall",
    "history",
    "past",
    "previous",
    "earlier",
    "before",
  ];
  const lowerText = currentText.toLowerCase();
  return knowledgeKeywords.some((keyword) => lowerText.includes(keyword));
}

// Detect if conversation is continuous (related to recent messages)
function isContinuousConversation(history, currentText) {
  if (!history.length) return false;

  // Check last 3 messages for relevance
  const recentMessages = history.slice(-3);
  const recentText = recentMessages
    .map((m) => m.text || "")
    .join(" ")
    .toLowerCase();

  const currentLower = currentText.toLowerCase();

  // Check for continuity indicators
  const continuityIndicators = [
    "and",
    "also",
    "then",
    "next",
    "after",
    "before",
    "that",
    "this",
    "it",
    "them",
    "those",
    "these",
    "the",
    "same",
    "continue",
    "more",
    "another",
    "again",
    "still",
    "yet",
  ];

  // Check if current message references recent context
  const hasContinuity = continuityIndicators.some((indicator) =>
    currentLower.includes(indicator)
  );

  // Check semantic similarity with recent messages
  const similarity = jaccard(recentText, currentLower);
  const isSimilar = similarity > 0.1;

  return hasContinuity || isSimilar;
}

function buildContextBlock(history, currentText, allHistory = null) {
  // Determine context strategy
  const isKnowledge = isKnowledgeQuery(currentText);
  const isContinuous =
    history.length > 0 && isContinuousConversation(history, currentText);

  let contextMessages = [];
  let contextType = "";

  if (isKnowledge && allHistory && allHistory.length > 0) {
    // User is asking about themselves or past actions - include all relevant history
    contextMessages = allHistory;
    contextType = "COMPLETE CONVERSATION HISTORY (FOR KNOWLEDGE/CONTEXT)";
  } else if (isContinuous && history.length > 0) {
    // Conversation is continuous - include last 10 messages
    contextMessages = history.slice(-10);
    contextType = "RECENT CONVERSATION CONTEXT (LAST 10 MESSAGES)";
  } else {
    // New topic or no history - just use current message (no context needed)
    return "";
  }

  if (!contextMessages.length) return "";

  const lines = [];
  let used = 0;

  // Include messages in chronological order (oldest first)
  for (let i = 0; i < contextMessages.length; i++) {
    const m = contextMessages[i];
    const line = `- ${m.role}: ${m.text || ""}`.trim();
    if (!line) continue;

    // Respect character budget
    const budget = isKnowledge
      ? CONTEXT_CHAR_BUDGET * 5
      : CONTEXT_CHAR_BUDGET * 2;
    if (used + line.length > budget) break;
    lines.push(line);
    used += line.length + 1;
  }

  if (!lines.length) return "";

  const instructions = isKnowledge
    ? [
        "IMPORTANT: This is the complete conversation history for knowledge and context purposes.",
        "Use this history to answer questions about what the user did, created, ordered, scheduled, etc.",
        "Reference specific past actions, events, or conversations when relevant to the current question.",
        "If the user asks about themselves or past actions, use this history to provide accurate information.",
      ]
    : [
        "IMPORTANT: This is recent conversation context for continuity purposes.",
        "Use this history ONLY if the current message is a continuation of the recent conversation.",
        "If the current message is about a new topic, ignore this history and focus on the current request.",
      ];

  return [
    `=== ${contextType} ===`,
    ...instructions,
    "",
    "Conversation history:",
    ...lines,
  ].join("\n");
}

// Retry helper for OpenAI API calls (via fastrouter.ai) with exponential backoff
async function retryAnthropicCall(apiCall, maxRetries = 5) {
  let lastError;
  let attemptCount = 0;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;
      attemptCount = attempt + 1;

      // Check if error is retryable (529 overloaded, 429 rate limit, 503 service unavailable)
      // OpenAI SDK errors have status in error.status or error.response?.status
      const status =
        error.status || error.response?.status || error.statusCode || 0;
      const headers = error.headers || error.response?.headers || {};

      // Check retry header (support both Headers object and plain object)
      const shouldRetryHeader =
        (typeof headers.get === "function" &&
          headers.get("x-should-retry") === "true") ||
        headers["x-should-retry"] === "true" ||
        headers["X-Should-Retry"] === "true";

      const isRetryable =
        status === 529 || // Overloaded
        status === 429 || // Rate limit
        status === 503 || // Service unavailable
        (status >= 500 && status < 600) || // Server errors
        shouldRetryHeader; // Explicit retry header

      // If not retryable or this was the last attempt, throw error
      if (!isRetryable || attempt === maxRetries - 1) {
        if (attempt === maxRetries - 1 && isRetryable) {
          // Add helpful context to the error
          const errorMsg =
            status === 529
              ? `API is overloaded. All ${maxRetries} retry attempts failed. Please try again in a moment.`
              : `API error (${status}). All ${maxRetries} retry attempts failed.`;
          console.error(`❌ ${errorMsg}`);
          // Create a more user-friendly error
          const friendlyError = new Error(errorMsg);
          friendlyError.status = status;
          friendlyError.originalError = error;
          friendlyError.retryAttempts = attemptCount;
          throw friendlyError;
        }
        throw error;
      }

      // Calculate exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s
      // Add small random jitter to avoid thundering herd
      const baseDelay = 1000 * Math.pow(2, attempt);
      const jitter = Math.random() * 500; // 0-500ms random jitter
      const delayMs = Math.min(baseDelay + jitter, 30000); // Cap at 30s

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function askClaudeWithContext(uid, currentText) {
  // Store current user message for tool action tracking
  const currentUserMessage = currentText;
  const history = await getRecentContext(uid);

  // Get all history for knowledge/context queries
  const allHistory = await getAllContext(uid);

  // STEP 1: RAG - Retrieve ALL relevant context FIRST (before MCP detection)
  // This ensures RAG understands the full context before deciding which MCPs to use
  let ragContext = "";
  let ragContextForMCPDetection = "";
  try {
    // Retrieve general context for better understanding (increased from 5 to 8)
    const retrievedDocs = await retrieveRelevantContext(uid, currentText, 8);
    if (retrievedDocs && retrievedDocs.length > 0) {
      ragContext = buildRAGContext(retrievedDocs);
      const avgScore =
        retrievedDocs.reduce((sum, d) => sum + (d.score || 0), 0) /
        retrievedDocs.length;
      console.log(
        `🔍 RAG: Retrieved ${
          retrievedDocs.length
        } relevant context documents (avg relevance: ${avgScore.toFixed(3)})`
      );

      // Build context string for MCP detection (includes RAG context)
      ragContextForMCPDetection = retrievedDocs
        .map((doc) => doc.content)
        .join(" ");
    }
  } catch (ragError) {
    console.warn(
      "RAG retrieval failed, continuing without RAG context:",
      ragError.message
    );
    // Continue without RAG if it fails - it's optional
  }

  const contextBlock = buildContextBlock(history, currentText, allHistory);

  // Combine RAG context with regular context block
  const contextWithRAG = ragContext
    ? contextBlock
      ? `${contextBlock}\n\n${ragContext}`
      : ragContext
    : contextBlock;

  // STEP 2: MCP Detection - Use RAG context to better understand which MCPs to use
  // Combine current text with recent context AND RAG context for better MCP detection
  // This helps when messages are split (e.g., "I need to see slots" + "in Google Calendar")
  const recentUserMessages = history
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.text || "")
    .join(" ");

  // Include RAG context in MCP detection for better understanding
  const combinedText =
    `${recentUserMessages} ${ragContextForMCPDetection} ${currentText}`.trim();

  // Detect which MCPs should be enabled based on combined text (now includes RAG context)
  const detectedMCPNames = getEnabledMCPs(combinedText);

  // Filter MCPs based on user preferences (check if tool is enabled for this user)
  const enabledMCPNames = [];
  for (const mcpName of detectedMCPNames) {
    const toolEnabled = await isToolEnabled(uid, mcpName);
    if (toolEnabled) {
      enabledMCPNames.push(mcpName);
    } else {
      console.log(
        `⚠️ ${mcpName} MCP detected but disabled by user preferences`
      );
    }
  }

  console.log(
    `🔍 MCP Detection - Text: "${currentText}" | Combined: "${combinedText}" | Detected MCPs: [${detectedMCPNames.join(
      ", "
    )}] | Enabled MCPs (after user preferences): [${enabledMCPNames.join(
      ", "
    )}]`
  );

  // STEP 3: For each enabled MCP, retrieve MCP-specific RAG context
  // This ensures each MCP gets context relevant to its domain
  const mcpSpecificRAGContexts = new Map();
  for (const mcpName of enabledMCPNames) {
    try {
      // Retrieve MCP-specific context from RAG
      const mcpRAGDocs = await retrieveRelevantContext(
        uid,
        currentText,
        5,
        mcpName
      );
      if (mcpRAGDocs && mcpRAGDocs.length > 0) {
        const mcpRAGContext = buildRAGContext(mcpRAGDocs);
        mcpSpecificRAGContexts.set(mcpName, mcpRAGContext);
        console.log(
          `🔍 RAG (${mcpName}): Retrieved ${mcpRAGDocs.length} MCP-specific context documents`
        );
      }
    } catch (mcpRAGError) {
      console.warn(
        `RAG retrieval for ${mcpName} failed, continuing without MCP-specific context:`,
        mcpRAGError.message
      );
    }
  }

  // Initialize enabled MCPs
  const enabledMCPs = [];
  for (const mcpName of enabledMCPNames) {
    try {
      if (!activeMCPs.has(mcpName)) {
        console.log(`🚀 Initializing ${mcpName} MCP...`);
        const mcpProxy = await getMCP(mcpName);
        activeMCPs.set(mcpName, mcpProxy);
        console.log(`✅ ${mcpName} MCP initialized successfully`);
      } else {
        console.log(`♻️ Using cached ${mcpName} MCP`);
      }
      enabledMCPs.push(activeMCPs.get(mcpName));
    } catch (err) {
      console.error(`❌ Failed to initialize ${mcpName} MCP:`, err.message);
      console.error(`   Full error:`, err);
      // Continue with other MCPs even if one fails
    }
  }

  // COMMENTED: Old Anthropic content array format
  // const content = [];
  // if (contextBlock) content.push({ type: "text", text: contextBlock });
  // content.push({
  //   type: "text",
  //   text: `Current user message:\n${currentText || "Say hello."}`,
  // });

  // Function to normalize JSON Schema for OpenAI compatibility
  function normalizeSchema(schema) {
    if (!schema || typeof schema !== "object") {
      return { type: "object", properties: {}, required: [] };
    }

    // Clone the schema to avoid mutating the original
    const normalized = JSON.parse(JSON.stringify(schema));

    // Remove $schema if present (OpenAI doesn't need it)
    delete normalized.$schema;

    // Ensure type is set (default to object if missing)
    if (!normalized.type) {
      normalized.type = "object";
    }

    // Ensure properties exists for object types
    if (normalized.type === "object" && !normalized.properties) {
      normalized.properties = {};
    }

    // Ensure required is an array
    if (normalized.required && !Array.isArray(normalized.required)) {
      normalized.required = [];
    } else if (!normalized.required && normalized.type === "object") {
      normalized.required = [];
    }

    // Remove $ref (OpenAI doesn't support references well)
    if (normalized.$ref) {
      delete normalized.$ref;
      if (!normalized.type) {
        normalized.type = "object";
      }
    }

    // Handle anyOf/oneOf/allOf - simplify to first option
    if (normalized.anyOf || normalized.oneOf || normalized.allOf) {
      const options = normalized.anyOf || normalized.oneOf || normalized.allOf;
      if (
        Array.isArray(options) &&
        options.length > 0 &&
        typeof options[0] === "object"
      ) {
        const firstOption = normalizeSchema(options[0]);
        Object.assign(normalized, firstOption);
      }
      delete normalized.anyOf;
      delete normalized.oneOf;
      delete normalized.allOf;
    }

    // Clean up properties recursively
    if (normalized.properties && typeof normalized.properties === "object") {
      const cleanedProperties = {};
      for (const [key, prop] of Object.entries(normalized.properties)) {
        if (typeof prop === "object" && prop !== null && !Array.isArray(prop)) {
          // Remove unsupported fields
          delete prop.$comment;
          delete prop.examples;
          delete prop.$ref;
          delete prop.title;

          // Handle anyOf/oneOf/allOf in properties
          if (prop.anyOf || prop.oneOf || prop.allOf) {
            const options = prop.anyOf || prop.oneOf || prop.allOf;
            if (Array.isArray(options) && options.length > 0) {
              Object.assign(prop, normalizeSchema(options[0]));
            }
            delete prop.anyOf;
            delete prop.oneOf;
            delete prop.allOf;
          }

          // Ensure property has a valid type
          const validTypes = [
            "string",
            "number",
            "integer",
            "boolean",
            "object",
            "array",
            "null",
          ];
          if (!prop.type || !validTypes.includes(prop.type)) {
            if (prop.enum) {
              prop.type = "string";
            } else if (prop.properties) {
              prop.type = "object";
            } else {
              prop.type = "string"; // Default fallback
            }
          }

          // Recursively normalize nested objects and arrays
          if (prop.type === "object") {
            cleanedProperties[key] = normalizeSchema(prop);
          } else if (prop.type === "array") {
            if (prop.items) {
              prop.items = normalizeSchema(prop.items);
            } else {
              prop.items = { type: "string" }; // Default array item type
            }
            cleanedProperties[key] = prop;
          } else {
            cleanedProperties[key] = prop;
          }
        }
      }
      normalized.properties = cleanedProperties;
    }

    // Remove additionalProperties if it's not a boolean (OpenAI prefers boolean)
    if (
      normalized.additionalProperties !== undefined &&
      typeof normalized.additionalProperties !== "boolean"
    ) {
      delete normalized.additionalProperties;
    }

    return normalized;
  }

  // Build tools from enabled MCPs FIRST (before system message)
  const tools = [];
  const mcpToolsMap = new Map(); // tool_name -> { mcpName, toolName }

  for (const mcpProxy of enabledMCPs) {
    try {
      console.log(`🔧 Listing tools from ${mcpProxy.name} MCP...`);
      const mcpTools = await mcpProxy.listTools();
      console.log(`   Found ${mcpTools.length} tools from ${mcpProxy.name}`);
      for (const tool of mcpTools) {
        const fullToolName = `${mcpProxy.name}_${tool.name}`;
        // MCP tools have inputSchema, not input_schema
        const rawSchema = tool.inputSchema || {
          type: "object",
          properties: {},
          required: [],
        };

        // Normalize the schema for OpenAI compatibility
        const normalizedSchema = normalizeSchema(rawSchema);

        // OpenAI format: tools need type: "function" and function object
        try {
          tools.push({
            type: "function",
            function: {
              name: fullToolName,
              description: `${
                tool.description ||
                `Call ${tool.name} from ${mcpProxy.name} MCP`
              }. MCP: ${mcpProxy.name}, Tool: ${tool.name}`,
              parameters: normalizedSchema, // Use normalized schema
            },
          });
        } catch (schemaError) {
          console.error(
            `❌ Failed to normalize schema for ${fullToolName}:`,
            schemaError
          );
          console.error(
            `   Original schema:`,
            JSON.stringify(rawSchema, null, 2)
          );
          console.error(
            `   Normalized schema:`,
            JSON.stringify(normalizedSchema, null, 2)
          );
          // Skip this tool if schema normalization fails
          continue;
        }
        mcpToolsMap.set(fullToolName, {
          mcpName: mcpProxy.name,
          toolName: tool.name,
          mcpProxy,
        });
      }
    } catch (err) {
      console.error(
        `❌ Failed to list tools from ${mcpProxy.name}:`,
        err.message
      );
      console.error(`   Full error:`, err);
    }
  }

  if (tools.length > 0) {
    console.log(
      `📋 Total tools available: ${tools.length} (from ${enabledMCPs.length} MCPs)`
    );
  }

  // Build system message AFTER tools are built
  // Include MCP-specific RAG context for better understanding
  let system =
    "You are a concise, helpful assistant. Detect the user's language and reply in the same language. " +
    "IMPORTANT: The complete conversation history is provided below for training and context purposes. " +
    "Use this history ONLY when it is specifically relevant to the current user message. " +
    "If the current message is about a new topic or unrelated to past messages, ignore the history and focus on the current request. " +
    "Only reference past messages when they directly help answer the current question or provide necessary context. " +
    "DONT ASK ANYTHING AGAIN TO USER , he cant hear you just answer or take a step what ever it may be. " +
    "CRITICAL: Only use tools when the user EXPLICITLY asks you to DO something (like 'send email', 'check messages', 'create event'). " +
    "If the user just mentions a service casually (like 'Hey, are you able to listen?' or 'I use Gmail'), just respond normally without using tools. " +
    "Act naturally and conversationally - don't automatically use tools just because a service is mentioned. ";

  // Add MCP-specific RAG context to system prompt
  if (mcpSpecificRAGContexts.size > 0) {
    system += "\n\n=== MCP-SPECIFIC CONTEXT FROM PREVIOUS CONVERSATIONS ===\n";
    for (const [mcpName, mcpContext] of mcpSpecificRAGContexts.entries()) {
      system += `\n[${mcpName.toUpperCase()} MCP Context]:\n${mcpContext}\n`;
    }
    system += "=== END OF MCP-SPECIFIC CONTEXT ===\n";
    system +=
      "\nIMPORTANT: Use the MCP-specific context above to understand previous interactions with each MCP. " +
      "This context helps you understand what the user has done before and what they might want to do now.\n";

    // Special handling for WhatsApp MCP - extract contact mappings from RAG context
    if (mcpSpecificRAGContexts.has("whatsapp")) {
      const whatsappContext = mcpSpecificRAGContexts.get("whatsapp");
      // Check if RAG context contains contact mappings
      if (
        whatsappContext.includes("nithish") ||
        whatsappContext.includes("918074914825")
      ) {
        system +=
          "\n[WHATSAPP CONTEXT]: Based on previous conversations, 'nithish' refers to WhatsApp recipient '918074914825'. " +
          "When user mentions 'nithish' or 'send to nithish', use recipient '918074914825' in whatsapp_send_message.\n";
      }
    }

    // Special handling for Gmail MCP - extract contact mappings from RAG context
    if (mcpSpecificRAGContexts.has("gmail")) {
      const gmailContext = mcpSpecificRAGContexts.get("gmail");
      // Extract email mappings from context
      const emailMatches = gmailContext.match(
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
      );
      if (emailMatches && emailMatches.length > 0) {
        system +=
          `\n[GMAIL CONTEXT]: Based on previous conversations, found email addresses: ${emailMatches
            .slice(0, 5)
            .join(", ")}. ` +
          "Use these email addresses when user mentions contact names from previous conversations.\n";
      }
    }
  }

  // STEP 4: Retrieve contact information for mentioned names
  // Extract potential contact names from user message
  const contactNamePattern = /\b(nithish|nitish|nithi|[\w]+)\b/gi;
  const mentionedNames = [];
  let nameMatch;
  while ((nameMatch = contactNamePattern.exec(currentText)) !== null) {
    const name = nameMatch[1].toLowerCase();
    if (
      name.length > 2 &&
      !["send", "message", "email", "to", "the", "a", "an"].includes(name)
    ) {
      mentionedNames.push(name);
    }
  }

  // Retrieve contact information for mentioned names
  const contactInfo = {};
  for (const name of mentionedNames) {
    try {
      const contact = await getContactByName(uid, name);
      if (contact) {
        contactInfo[name] = contact;
        console.log(`📇 Found contact for '${name}':`, {
          email: contact.email,
          phone: contact.phone,
          mcp: contact.mcp_name,
        });
      }
    } catch (contactErr) {
      console.warn(
        `Failed to retrieve contact for '${name}':`,
        contactErr.message
      );
    }
  }

  // Add contact information to system prompt
  if (Object.keys(contactInfo).length > 0) {
    system += "\n\n=== CONTACT INFORMATION FROM PREVIOUS CONVERSATIONS ===\n";
    for (const [name, contact] of Object.entries(contactInfo)) {
      const contactParts = [];
      if (contact.email) contactParts.push(`Email: ${contact.email}`);
      if (contact.phone) contactParts.push(`Phone: ${contact.phone}`);
      if (contact.mcp_name) contactParts.push(`MCP: ${contact.mcp_name}`);

      system += `\n[${name.toUpperCase()}]: ${contactParts.join(", ")}\n`;
    }
    system +=
      "\nIMPORTANT: When the user mentions a contact name above, use the corresponding email or phone number automatically. " +
      "Do NOT ask for confirmation - just use the contact information from previous conversations.\n";
  }

  if (tools.length > 0) {
    // Build list of available tools for Claude
    // OpenAI format: tools have structure { type: "function", function: { name: ... } }
    const toolNames = tools.map((t) => t.function?.name || t.name || "");

    system +=
      `\n\nIMPORTANT: You have access to ${tools.length} MCP tools. When the user asks you to DO something (like create events, search, list items, etc.), you MUST use the appropriate tool. Do NOT just describe what you would do - actually call the tool.\n` +
      `Available tools: ${toolNames.slice(0, 20).join(", ")}${
        toolNames.length > 20 ? "..." : ""
      }\n`;

    // Add specific guidance for Google Docs
    if (
      toolNames.some(
        (t) => t.startsWith("googledocs_") || t.startsWith("google-docs_")
      )
    ) {
      system +=
        `\nFor Google Docs operations, you MUST use googledocs_* or google-docs_* tools:\n` +
        `- When user says "create a google doc", "write a document", "make a doc", "create a document": USE googledocs_create-doc\n` +
        `- When user says "find documents", "get documents", "list documents", "show documents", "my documents", "documents created today", "find the documents that have created today": USE googledocs_list-docs to get all documents, then filter by date if needed\n` +
        `- When user asks to search for documents by keyword: USE googledocs_search-docs with query parameter\n` +
        `- When user wants to update a document, "add to document", "edit document": USE googledocs_update-doc with docId and content\n` +
        `- When user says "delete document", "remove document", "delete that document": USE googledocs_delete-doc with the document ID\n` +
        `- When user says "get document", "view document", "read document": USE googledocs_get-doc with the document ID\n` +
        `- When user provides content to save: Extract the content and use googledocs_create-doc with title and content\n` +
        `- IMPORTANT: Always execute the action when user requests it - don't just describe what you would do\n` +
        `- For delete operations: Extract the document ID from previous conversation context or use googledocs_list-docs to find it\n` +
        `- For "documents created today": Use googledocs_list-docs to get all documents, then filter by createdTime to show only today's documents\n`;
    }

    // Add specific guidance for WhatsApp
    if (
      toolNames.some(
        (t) =>
          t.startsWith("whatsapp_") ||
          t.includes("send_message") ||
          t.includes("search_contacts")
      )
    ) {
      system +=
        `\nFor WhatsApp operations, you MUST use whatsapp_* tools:\n` +
        `- CRITICAL: Only use WhatsApp tools when the user EXPLICITLY asks you to DO something with WhatsApp (like "send message", "check messages", "list chats"). If the user just mentions WhatsApp casually or asks a question, respond normally without using tools.\n` +
        `- IMPORTANT: If user says something like "Hey, are you able to listen?" or mentions WhatsApp in passing, just respond normally - don't automatically use WhatsApp tools.\n` +
        `- When user says "check whatsapp messages", "see whatsapp messages", "any whatsapp messages", "whatsapp messages", "check messages on whatsapp": USE whatsapp_list_messages to get recent messages\n` +
        `- When user says "list chats", "my chats", "whatsapp chats": USE whatsapp_list_chats to get all chats\n` +
        `- When user says "send a whatsapp message", "message on whatsapp", "text on whatsapp": USE whatsapp_send_message\n` +
        `- When user wants to find a contact: USE whatsapp_search_contacts with the contact name or number\n` +
        `- When user provides a phone number: Use it directly in send_message (format: country code + number without + or spaces, e.g., "918074914825" for India)\n` +
        `- When user mentions a contact name: First search using whatsapp_search_contacts, then use the phone number or JID from results\n` +
        `- IMPORTANT: Always execute the action when user requests it - don't just describe what you would do\n` +
        `- Phone numbers should include country code without + or spaces (e.g., "918074914825" for India)\n` +
        `- CRITICAL: When user says "send to nithish", "send message to nithish", "message nithish", "text nithish", or mentions sending to nithish: IMMEDIATELY use whatsapp_send_message with recipient "918074914825" and extract the message content from the user's request. Do NOT ask for confirmation - just send it.\n` +
        `- CRITICAL: When user says "send summary" or "send the summary": Send the current summary of the recent conversation to nithish (recipient "918074914825") using whatsapp_send_message\n` +
        `- IMPORTANT: The system automatically checks for duplicate messages before sending. If a similar message was already sent to the same recipient within the last 5 minutes, it will skip sending and inform you that the message was already sent. You don't need to check for duplicates manually.\n` +
        `- Example: If user says "send to nithish: Hello", immediately call whatsapp_send_message with recipient="918074914825" and message="Hello"\n` +
        `- Example: If user says "message nithish about the meeting", extract the message content and call whatsapp_send_message with recipient="918074914825" and the extracted message\n`;
    }

    // Add specific guidance for Google Calendar
    if (toolNames.some((t) => t.startsWith("googlecalendar_"))) {
      system +=
        `\nFor calendar operations, you MUST use googlecalendar_* tools:\n` +
        `- When user says "book", "create", "reserve", "add" an event/slot: USE googlecalendar_create_event\n` +
        `- When user asks to see/list events or slots: USE googlecalendar_list_events\n` +
        `- When user asks "am I free", "am I available", "do I have time", "check if I'm free" at a specific time/date: USE googlecalendar_list_events with timeMin and timeMax parameters to check for events in that time range. DO NOT use googlecalendar_get-current-time for checking availability.\n` +
        `- CRITICAL: When user asks "available slots", "free slots", "is there available slots", "check available slots", "show available slots": You MUST use googlecalendar_list_events with timeMin set to today's start time and timeMax set to today's end time (or the requested date range), then analyze the gaps between events to show available time slots. NEVER use googlecalendar_get-current-time for this - it only returns the current time, not calendar events.\n` +
        `- When user asks for free/available slots: USE googlecalendar_list_events with timeMin and timeMax to check, then analyze gaps\n` +
        `- When user says "delete", "remove", "cancel" an event/slot: First use googlecalendar_list_events to find the event by time/date, then use googlecalendar_delete_event with the event ID\n` +
        `- When user wants to update/modify/reschedule an event: First use googlecalendar_list_events to find the event by time/date, then use googlecalendar_update_event with the event ID and new parameters\n` +
        `- When user says "delay", "reschedule", "move", "change time", "postpone", "push back" an event: First use googlecalendar_list_events to find the event, then use googlecalendar_update_event to change the start and end times\n` +
        `- When user says "change text", "change title", "change summary", "update text", "rename" an event: First use googlecalendar_list_events to find the event, then use googlecalendar_update_event to change the summary field\n` +
        `- NEVER just say you created an event - ALWAYS call googlecalendar_create_event first, then report the result\n` +
        `- NEVER just say you deleted an event - ALWAYS find the event first using googlecalendar_list_events, then call googlecalendar_delete_event with the event ID, then report the result\n` +
        `- NEVER use googlecalendar_get-current-time to check availability - ALWAYS use googlecalendar_list_events with timeMin and timeMax for availability checks\n` +
        `- If user mentions dates/times (like "November 8th at 10AM to 11AM"), parse them and call googlecalendar_create_event with proper parameters\n` +
        `- If user says something like "book this" or "reserve this" after mentioning a time/date, use googlecalendar_create_event\n` +
        `- To check availability (e.g., "am I free today at 5 to 6 PM"):\n` +
        `  1. Parse the date and time range from the user's message\n` +
        `  2. Use googlecalendar_list_events with timeMin and timeMax set to the requested time range\n` +
        `  3. If no events are found in that range, the user is free. If events are found, the user is busy.\n` +
        `  4. Report the availability status to the user\n` +
        `- To delete an event/slot by time/date (e.g., "delete event from 5 to 6 PM", "delete slot from 5 to 6 PM", "remove event 5 to 6 PM"):\n` +
        `  1. CRITICAL: Parse the date and time range from the user's message (e.g., "5 to 6 PM today" = timeMin="2025-11-08T17:00:00+05:30", timeMax="2025-11-08T18:00:00+05:30")\n` +
        `  2. Use googlecalendar_list_events with timeMin and timeMax parameters set to the exact time range\n` +
        `  3. From the list_events response, find the event(s) that match the time range\n` +
        `  4. Extract the event ID from the event object (it's usually in the "id" field, e.g., event.id or event["id"])\n` +
        `  5. Use googlecalendar_delete_event with the event ID as the parameter (e.g., { "eventId": "abc123..." })\n` +
        `  6. IMPORTANT: The delete_event tool requires the event ID, NOT the event object. Extract just the ID string.\n` +
        `  7. After deletion, confirm to the user that the event was deleted\n` +
        `- If multiple events match the time/date, delete all matching events or ask the user to clarify which one\n` +
        `- When deleting, "slot" and "event" mean the same thing - both refer to calendar events\n` +
        `- To update/reschedule an event by time/date (e.g., "delay the event from 5 to 6 PM by 1 hour", "reschedule the event from 5-6 PM to 6-7 PM", "move the event from 5 to 6 PM to 6 to 7 PM"):\n` +
        `  1. CRITICAL: Parse the original time/date from the user's message (e.g., "event from 5 to 6 PM" = timeMin="2025-11-08T17:00:00+05:30", timeMax="2025-11-08T18:00:00+05:30")\n` +
        `  2. Use googlecalendar_list_events with timeMin and timeMax parameters set to the original time range\n` +
        `  3. From the list_events response, find the event(s) that match the time range\n` +
        `  4. Extract the event ID from the event object (it's usually in the "id" field, e.g., event.id or event["id"])\n` +
        `  5. Calculate the new start and end times based on the user's request:\n` +
        `     - If user says "delay by 1 hour" or "move by 1 hour": Add 1 hour to both start and end times\n` +
        `     - If user says "delay by X hours": Add X hours to both start and end times\n` +
        `     - If user says "reschedule to 6 to 7 PM": Set new start="2025-11-08T18:00:00+05:30", end="2025-11-08T19:00:00+05:30"\n` +
        `     - If user says "move to tomorrow": Keep the same time but change the date to tomorrow\n` +
        `  6. Use googlecalendar_update_event with the event ID and new start/end times:\n` +
        `     - eventId: The event ID from step 4\n` +
        `     - start: New start time in ISO 8601 format (e.g., "2025-11-08T18:00:00+05:30")\n` +
        `     - end: New end time in ISO 8601 format (e.g., "2025-11-08T19:00:00+05:30")\n` +
        `     - Keep the original summary and other fields unless the user wants to change them\n` +
        `  7. After updating, confirm to the user that the event was rescheduled\n` +
        `- To change the text/title of an event (e.g., "change the text of the event from 5 to 6 PM", "update the title of the event from 5-6 PM", "rename the event from 5 to 6 PM"):\n` +
        `  1. CRITICAL: Parse the time/date from the user's message to identify which event to update (e.g., "event from 5 to 6 PM" = timeMin="2025-11-08T17:00:00+05:30", timeMax="2025-11-08T18:00:00+05:30")\n` +
        `  2. Use googlecalendar_list_events with timeMin and timeMax parameters set to the time range\n` +
        `  3. From the list_events response, find the event(s) that match the time range\n` +
        `  4. Extract the event ID from the event object (it's usually in the "id" field, e.g., event.id or event["id"])\n` +
        `  5. Extract the new text/title from the user's message (e.g., if user says "change text to 'Meeting with John'", use "Meeting with John" as the new summary)\n` +
        `  6. Use googlecalendar_update_event with the event ID and new summary:\n` +
        `     - eventId: The event ID from step 4\n` +
        `     - summary: The new text/title from step 5\n` +
        `     - Keep the original start, end, and other fields unless the user wants to change them\n` +
        `  7. After updating, confirm to the user that the event text was changed\n` +
        `- IMPORTANT: The update_event tool requires the event ID, NOT the event object. Extract just the ID string.\n` +
        `- IMPORTANT: When rescheduling, always update both start and end times to maintain the same duration (unless user specifies otherwise)\n` +
        `- IMPORTANT: When updating, you can change multiple fields at once (e.g., both summary and start/end times)\n` +
        `- If multiple events match the time/date, update all matching events or ask the user to clarify which one\n` +
        `\nDATE/TIME PARSING RULES (CRITICAL):\n` +
        `- Current date context: ${
          new Date().toISOString().split("T")[0]
        } (${new Date().toLocaleString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })})\n` +
        `- Relative dates: "tomorrow" = next day, "today" = today, "next week" = 7 days from now\n` +
        `- Time expressions: "10 to 11 am" = 10:00-11:00, "morning 10 to 11" = 10:00-11:00, "1 hour from 10 am" = 10:00-11:00\n` +
        `- If only month and date given (e.g., "November 8th"), use current year ${new Date().getFullYear()} unless user specifies otherwise\n` +
        `- Format dates as ISO 8601: "YYYY-MM-DDTHH:mm:ss" (e.g., "2024-11-08T10:00:00")\n` +
        `- Always include timezone in your calculations based on user's context (default: Asia/Kolkata)\n` +
        `- If user says "1 hour from 10 am", calculate: start="10:00", end="11:00" on the specified date\n` +
        `- If user says "tomorrow at morning 10 to 11", calculate: date=tomorrow, start="10:00", end="11:00"\n` +
        `- Use descriptive event titles (summary field) - extract from user's message, don't just use "Appointment"\n`;
    }

    // Add specific guidance for Gmail
    if (
      toolNames.some(
        (t) => t.startsWith("gmail_") || t.startsWith("google-gmail_")
      )
    ) {
      system +=
        `\nFor Gmail operations, you MUST use gmail_* or google-gmail_* tools:\n` +
        `- CRITICAL: Only use Gmail tools when the user EXPLICITLY asks you to DO something with Gmail (like "send email", "check email", "create draft"). If the user just mentions Gmail casually or asks a question about Gmail, respond normally without using tools.\n` +
        `- IMPORTANT: If user says something like "Hey, are you able to listen?" or mentions Gmail in passing, just respond normally - don't automatically use Gmail tools.\n` +
        `- When user says "create draft", "create email draft", "save draft", "draft email", "create a draft": USE gmail_create-draft with subject and body (this saves to Gmail drafts folder)\n` +
        `- When user says "list drafts", "show drafts", "my drafts", "get drafts": USE gmail_list-drafts\n` +
        `- When user says "delete draft", "delete the draft", "delete drafts", "remove draft", "can you delete the draft [subject/content]": \n` +
        `  1. First get all drafts using gmail_list-drafts\n` +
        `  2. If user mentioned a specific draft subject or content (e.g., "delete the draft Need to open WhatsApp"), find the draft matching that subject/content\n` +
        `  3. If no specific draft mentioned, use the first (most recent) draft\n` +
        `  4. Extract the draft ID from the matching draft\n` +
        `  5. Use gmail_delete-draft with that draft ID\n` +
        `- CRITICAL: When user says "delete the draft" or "delete draft" followed by subject/content, you MUST execute the deletion immediately. Do NOT say you can't do it or describe what you would do. The draft content may mention other services (like WhatsApp, Telegram, etc.) but you should still delete the Gmail draft. Steps: 1) Call gmail_list-drafts, 2) Find the draft matching the subject/content, 3) Call gmail_delete-draft with the draft ID.\n` +
        `- When user says "delete the drafts I created today" or "delete drafts created today": \n` +
        `  1. First get all drafts using gmail_list-drafts\n` +
        `  2. Filter drafts created today (check the date in the draft details)\n` +
        `  3. Extract draft IDs from today's drafts\n` +
        `  4. Use gmail_delete-draft with those draft IDs\n` +
        `- When user says "delete the last draft", "delete the most recent draft", "delete last draft", "delete most recent draft": \n` +
        `  1. First get all drafts using gmail_list-drafts\n` +
        `  2. The first draft in the list is the most recent one\n` +
        `  3. Extract the draft ID from the first draft\n` +
        `  4. Use gmail_delete-draft with that draft ID\n` +
        `- When user says "delete the last draft I created today" or "delete the most recent draft I created today": \n` +
        `  1. First get all drafts using gmail_list-drafts\n` +
        `  2. Filter drafts created today (check the date in the draft details)\n` +
        `  3. The first draft from today's drafts is the most recent one\n` +
        `  4. Extract the draft ID from that draft\n` +
        `  5. Use gmail_delete-draft with that draft ID\n` +
        `- When user says "send the last draft to [email]" or "send the last draft to [recipient]" (e.g., "send the last draft to example@gmail.com"): \n` +
        `  1. First get all drafts using gmail_list-drafts\n` +
        `  2. The first draft in the list is the most recent one\n` +
        `  3. Extract the draft ID from the first draft\n` +
        `  4. Extract the recipient email address from the user's message (e.g., "example@gmail.com")\n` +
        `  5. Use gmail_send-draft with the draft ID and the recipient email address\n` +
        `- When user says "send draft", "send the last draft", "send draft as email" (without specifying recipient): \n` +
        `  1. First get all drafts using gmail_list-drafts\n` +
        `  2. The first draft in the list is the most recent one\n` +
        `  3. Extract the draft ID from the first draft\n` +
        `  4. Use gmail_send-draft with the draft ID (the draft's existing recipient will be used)\n` +
        `- When user says "send draft [draft ID]" or "send draft [draft ID] to [email]": USE gmail_send-draft with draft ID and recipient (if provided)\n` +
        `- When user says "send email", "compose email", "write email", "create email": USE gmail_send-email (this sends immediately)\n` +
        `- IMPORTANT: The system automatically checks for duplicate emails before sending. If a similar email was already sent to the same recipient within the last 5 minutes, it will skip sending and inform you that the email was already sent. You don't need to check for duplicates manually.\n` +
        `- When user says "check email", "check inbox", "read email", "check mail": USE gmail_list-emails\n` +
        `- When user says "spam emails", "spam mails", "see spam", "check spam", "junk mail": USE gmail_get-spam-emails\n` +
        `- When user says "mark as spam", "mark email as spam", "mark mails as spam", "mark unnecessary as spam": USE gmail_mark-as-spam with message ID(s)\n` +
        `- When user says "mark as read", "mark email as read", "mark mails as read": USE gmail_mark-as-read with message ID(s)\n` +
        `- When user says "mark as important", "mark email as important", "mark mails as important", "this is important": USE gmail_mark-as-important with message ID(s)\n` +
        `- IMPORTANT: When marking emails as important, they will automatically remain unread (unseen) so people can see which important emails haven't been read yet\n` +
        `- When user says "search email", "find email", "look for email": USE gmail_list-emails with query parameter\n` +
        `- When user says "get email", "read email", "view email": USE gmail_get-email with message ID\n` +
        `- When user asks for "unread emails": USE gmail_list-emails with query="is:unread"\n` +
        `- IMPORTANT: Always execute the action when user requests it - don't just describe what you would do\n` +
        `- For creating drafts, extract subject and body from user's message (recipient is optional)\n` +
        `- For sending emails, extract recipient (to), subject, and body from user's message\n` +
        `- For marking emails as spam, read, or important, extract message ID(s) from the email list or from previous context\n` +
        `- For searching, use Gmail search syntax (e.g., "from:example@gmail.com", "subject:meeting", "is:unread", "is:spam")\n` +
        `- When user says "mark unnecessary as spam and remaining as read and important": \n` +
        `  1. First get all emails using gmail_list-emails\n` +
        `  2. Identify unnecessary emails (promotional, spam-like, low priority) and mark them as spam using gmail_mark-as-spam\n` +
        `  3. Mark the remaining emails as read using gmail_mark-as-read\n` +
        `  4. Mark the remaining emails as important using gmail_mark-as-important (they will remain unread so people can see which important emails haven't been read)\n` +
        `- When passing multiple message IDs, you can pass them as an array or comma-separated string - the tool will handle both formats\n`;
    }

    // Add specific guidance for Google Slides/Presentations
    if (
      toolNames.some(
        (t) =>
          t.startsWith("googleslides_") ||
          t.startsWith("google-slides_") ||
          t.startsWith("googlepresentation_")
      )
    ) {
      system +=
        `\nFor Google Slides/Presentations operations, you MUST use googleslides_* or google-slides_* tools:\n` +
        `- When user says "create presentation", "create slide", "make presentation", "new presentation": USE googleslides_create-presentation\n` +
        `- When user says "edit presentation", "update presentation", "add to presentation", "modify presentation", "edit the recent presentation": USE googleslides_update-presentation with presentation ID and content\n` +
        `- When user says "list presentations", "show presentations", "my presentations": USE googleslides_list-presentations\n` +
        `- When user says "get presentation", "open presentation", "view presentation": USE googleslides_get-presentation with presentation ID\n` +
        `- When user says "delete presentation", "remove presentation": USE googleslides_delete-presentation with presentation ID\n` +
        `- IMPORTANT: Always execute the action when user requests it - don't just describe what you would do\n` +
        `- For creating presentations, extract title from user's message\n` +
        `- For updating presentations, extract presentation ID (from previous context or user's message) and content to add\n` +
        `- When user says "edit the recent presentation" or "edit the presentation I made", use the presentation ID from the conversation context\n` +
        `- Presentation IDs are required for most operations - get them from list-presentations or create-presentation responses\n`;
    }

    // Add specific guidance for Zomato
    if (
      toolNames.some(
        (t) =>
          t.startsWith("zomato_") ||
          t.includes("order") ||
          t.includes("restaurant") ||
          t.includes("search") ||
          t.includes("address") ||
          t.includes("history")
      )
    ) {
      system +=
        `\nFor Zomato operations, you MUST use zomato_* tools:\n` +
        `- CRITICAL: When user says "search restaurants", "find restaurants", "restaurants near me", "any restaurants near me": \n` +
        `  1. FIRST call zomato_get_saved_addresses_for_user to get the user's location coordinates\n` +
        `  2. Extract latitude and longitude from the first address in the response (e.g., addresses[0].latitude and addresses[0].longitude)\n` +
        `  3. THEN call zomato_get_restaurants_for_keyword with keyword="" (empty string) AND user_location as an object: {"latitude": "17.490611", "longitude": "78.413867"} (use the coordinates from step 2)\n` +
        `- When user says "find [restaurant name] restaurants" (e.g., "Self's restaurants near me"): \n` +
        `  1. FIRST call zomato_get_saved_addresses_for_user to get coordinates\n` +
        `  2. Extract latitude and longitude from addresses[0]\n` +
        `  3. THEN call zomato_get_restaurants_for_keyword with keyword="Self" (extract restaurant name) AND user_location object with coordinates\n` +
        `- When user says "search", "find", "look for" food items with "near me" (e.g., "chicken biryani near me"): \n` +
        `  1. FIRST call zomato_get_saved_addresses_for_user to get coordinates\n` +
        `  2. Extract latitude and longitude from addresses[0]\n` +
        `  3. THEN call zomato_get_restaurants_for_keyword with keyword="chicken biryani" AND user_location object with coordinates\n` +
        `- When user says "search", "find", "look for" food items WITHOUT "near me": USE zomato_get_restaurants_for_keyword with just the food item name as keyword (no user_location needed)\n` +
        `- CRITICAL: user_location parameter MUST be an object with latitude and longitude as strings, NOT a string like "near me" or "current location". Format: {"latitude": "17.490611", "longitude": "78.413867"}\n` +
        `- When using zomato_get_all_restaurants or zomato_get_restaurants_for_keyword: user_location is REQUIRED when user says "near me". It must be an object with latitude/longitude from saved addresses.\n` +
        `- When user says "create order", "place order", "order food", "place a food order": USE zomato_create_cart to add items, then zomato_checkout_cart to place the order\n` +
        `- When user says "edit order", "modify order", "update order", "change order": First get order details, then update cart using zomato_create_cart\n` +
        `- When user says "order history", "my orders", "past orders", "get history": USE zomato_get_search_order_history\n` +
        `- When user says "get my order", "my current order", "order status", "get order": USE zomato_get_order_tracking_info with order ID\n` +
        `- When user says "saved address", "my addresses", "get address", "saved locations": Use zomato_get_saved_addresses_for_user\n` +
        `- IMPORTANT: For "near me" searches, ALWAYS get addresses first to get real-time location coordinates, then use those coordinates in the search. The user_location parameter is REQUIRED and must be an object!\n` +
        `- IMPORTANT: Always execute the action when user requests it - don't just describe what you would do\n` +
        `- For order operations, you may need to first search for restaurants/items using zomato_get_restaurants_for_keyword, then use zomato_create_cart to add items\n` +
        `- For editing orders, you need the order ID - get it from zomato_get_search_order_history first\n` +
        `- When user asks for "my account orders" or "orders of my account": Use zomato_get_search_order_history\n`;
    }

    system += `\nRemember: Actions require tool calls. Descriptions don't help - you must actually execute the action using the appropriate tool.`;
  }

  // Build messages array for OpenAI format
  // OpenAI uses messages array with system message as first message
  let messages = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }

  // Add current user message with context block if available
  // The contextWithRAG contains the complete conversation history + RAG-retrieved context
  const userContent = contextWithRAG
    ? `${contextWithRAG}\n\n=== CURRENT USER MESSAGE ===\n${
        currentText || "Say hello."
      }`
    : `Current user message:\n${currentText || "Say hello."}`;
  messages.push({ role: "user", content: userContent });

  // COMMENTED: Old Anthropic API call format
  // for (let i = 0; i < 6; i++) {
  //   const resp = await retryAnthropicCall(() =>
  //     anthropic.messages.create({
  //       model: CLAUDE_MODEL,
  //       max_tokens: 1024, // Increased to allow tool usage
  //       system,
  //       messages,
  //       tools: tools.length > 0 ? tools : undefined,
  //       tool_choice: tools.length > 0 ? { type: "auto" } : { type: "none" },
  //     })
  //   );
  //   const finalText = resp.content.find((c) => c.type === "text")?.text?.trim();
  //   const calls = resp.content.filter((c) => c.type === "tool_use");

  // New OpenAI API call format via fastrouter.ai
  // Since fastrouter.ai routes to Anthropic, we need to ensure messages are in Anthropic format
  // Helper function to normalize messages to Anthropic format
  function normalizeMessagesToAnthropic(msgs) {
    return msgs
      .map((msg) => {
        // If it's already in Anthropic format (content is array), ensure tool_use items have input
        if (Array.isArray(msg.content)) {
          const normalizedContent = msg.content.map((item) => {
            if (item.type === "tool_use") {
              // Ensure input field exists - CRITICAL: must always be present
              let input = {};
              if (item.input !== undefined && item.input !== null) {
                // If input is already an object, use it
                if (
                  typeof item.input === "object" &&
                  !Array.isArray(item.input)
                ) {
                  input = item.input;
                } else if (typeof item.input === "string") {
                  // Try to parse if it's a string
                  try {
                    input = JSON.parse(item.input);
                  } catch (e) {
                    input = {};
                  }
                }
              } else {
                // Try to get input from function.arguments if present (conversion case)
                input = item.function?.arguments
                  ? typeof item.function.arguments === "string"
                    ? JSON.parse(item.function.arguments)
                    : item.function.arguments
                  : {};
              }
              return {
                ...item,
                input: input, // Always ensure input field is present
              };
            }
            return item;
          });

          // Ensure content array is never empty
          if (normalizedContent.length === 0) {
            normalizedContent.push({ type: "text", text: "" });
          }

          // For assistant messages, ensure there's at least one non-empty text block FIRST
          if (msg.role === "assistant") {
            const hasTextBlock = normalizedContent.some(
              (item) =>
                item.type === "text" && item.text && item.text.trim() !== ""
            );
            const hasToolUse = normalizedContent.some(
              (item) => item.type === "tool_use"
            );

            if (hasToolUse) {
              // Separate text blocks and tool_use items
              const textBlocks = normalizedContent.filter(
                (item) => item.type === "text"
              );
              const toolUseItems = normalizedContent.filter(
                (item) => item.type === "tool_use"
              );

              // Find or create a non-empty text block
              let nonEmptyTextBlock = textBlocks.find(
                (item) => item.text && item.text.trim() !== ""
              );
              if (!nonEmptyTextBlock) {
                // Use first text block if exists, or create new one
                nonEmptyTextBlock = textBlocks[0] || { type: "text", text: "" };
                nonEmptyTextBlock.text =
                  nonEmptyTextBlock.text && nonEmptyTextBlock.text.trim() !== ""
                    ? nonEmptyTextBlock.text
                    : "Processing...";
              }

              // Rebuild content array: text block FIRST, then tool_use items
              normalizedContent = [nonEmptyTextBlock, ...toolUseItems];
            }
          }

          return { ...msg, content: normalizedContent };
        }
        // If it's OpenAI format, convert to Anthropic format
        if (msg.role === "assistant" && msg.tool_calls) {
          const content = [];
          // Always include at least one non-empty text block when there are tool_calls
          // This ensures the message has non-empty content as required by the API
          if (msg.content && msg.content.trim() !== "") {
            content.push({ type: "text", text: msg.content });
          } else {
            // If no text content or empty, add a non-empty text block
            content.push({ type: "text", text: "Processing..." });
          }
          msg.tool_calls.forEach((call) => {
            const input = call.function?.arguments
              ? typeof call.function.arguments === "string"
                ? JSON.parse(call.function.arguments)
                : call.function.arguments
              : {};
            content.push({
              type: "tool_use",
              id: call.id,
              name: call.function?.name || call.name || "unknown",
              input: input,
            });
          });
          // Ensure content is never empty
          if (content.length === 0) {
            content.push({ type: "text", text: "" });
          }
          return {
            role: msg.role,
            content: content,
          };
        }
        // For user messages with tool results (role: "tool"), convert to Anthropic format
        if (msg.role === "tool") {
          // Ensure content is not empty
          const toolContent = msg.content || "";
          if (!toolContent || toolContent.trim() === "") {
            // Skip empty tool results
            return null;
          }
          return {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: msg.tool_call_id,
                content: toolContent,
              },
            ],
          };
        }
        // For regular messages, ensure content is in Anthropic format
        if (typeof msg.content === "string") {
          // For assistant messages, ensure non-empty text
          const textContent = msg.content || "";
          if (msg.role === "assistant" && textContent.trim() === "") {
            return {
              ...msg,
              content: [{ type: "text", text: "Processing..." }],
            };
          }
          return {
            ...msg,
            content: [{ type: "text", text: textContent }],
          };
        }
        // If content is already an array, ensure it's not empty
        if (Array.isArray(msg.content) && msg.content.length === 0) {
          const defaultText = msg.role === "assistant" ? "Processing..." : "";
          return { ...msg, content: [{ type: "text", text: defaultText }] };
        }
        // If content is missing entirely, add default
        if (!msg.content) {
          const defaultText = msg.role === "assistant" ? "Processing..." : "";
          return { ...msg, content: [{ type: "text", text: defaultText }] };
        }
        return msg;
      })
      .filter((msg) => msg !== null); // Remove null messages (empty tool results)
  }

  for (let i = 0; i < 6; i++) {
    // Convert messages to OpenAI format for fastrouter.ai (it uses OpenAI SDK but routes to Anthropic)
    // fastrouter.ai expects OpenAI format: content as string, tool_calls as array
    // BUT: When messages contain tool results in Anthropic format, we need to keep them in Anthropic format
    const normalizedMessages = messages
      .map((msg) => {
        // CRITICAL: First, ensure any tool_use objects in ANY message have an input field
        // Check ALL messages that have content as an array (Anthropic format)
        if (Array.isArray(msg.content)) {
          msg.content = msg.content.map((item) => {
            if (item.type === "tool_use") {
              // Ensure input field exists - if missing or null, use empty object
              if (item.input === undefined || item.input === null) {
                // Try to get input from function.arguments if present (conversion case)
                const input = item.function?.arguments
                  ? typeof item.function.arguments === "string"
                    ? JSON.parse(item.function.arguments)
                    : item.function.arguments
                  : {};
                return {
                  ...item,
                  input: input,
                };
              }
              // Ensure input is an object, not a string or other type
              if (typeof item.input !== "object" || Array.isArray(item.input)) {
                // Try to parse if it's a string
                if (typeof item.input === "string") {
                  try {
                    const parsed = JSON.parse(item.input);
                    if (typeof parsed === "object" && !Array.isArray(parsed)) {
                      return {
                        ...item,
                        input: parsed,
                      };
                    }
                  } catch (e) {
                    // If parsing fails, use empty object
                  }
                }
                return {
                  ...item,
                  input: {},
                };
              }
            }
            return item;
          });
        }

        // If it's already in Anthropic format (content is array with tool_use), convert to OpenAI format
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
          const textBlocks = msg.content.filter((item) => item.type === "text");
          const toolUseItems = msg.content.filter(
            (item) => item.type === "tool_use"
          );

          // Extract text content
          const textContent =
            textBlocks
              .map((item) => item.text || "")
              .join("")
              .trim() || "Processing...";

          // Convert tool_use items to OpenAI tool_calls format
          // CRITICAL: Ensure all tool_use items have the 'input' field
          const toolCalls = toolUseItems.map((item) => {
            // Ensure input field exists - if missing, use empty object
            // CRITICAL: Preserve the input field from the original tool_use
            let input = {};
            if (item.input !== undefined && item.input !== null) {
              if (
                typeof item.input === "object" &&
                !Array.isArray(item.input)
              ) {
                input = item.input;
              } else if (typeof item.input === "string") {
                try {
                  input = JSON.parse(item.input);
                } catch (e) {
                  input = {};
                }
              }
            }

            return {
              id: item.id,
              type: "function",
              function: {
                name: item.name || "unknown",
                arguments: JSON.stringify(input),
              },
            };
          });

          const result = {
            role: "assistant",
            content: textContent,
          };

          if (toolCalls.length > 0) {
            result.tool_calls = toolCalls;
          }

          return result;
        }

        // If it's OpenAI format with tool_calls, ensure content is non-empty
        if (msg.role === "assistant" && msg.tool_calls) {
          return {
            ...msg,
            content:
              msg.content && msg.content.trim() !== ""
                ? msg.content
                : "Processing...",
          };
        }

        // For tool results (role: "tool"), convert to OpenAI format
        if (
          msg.role === "tool" ||
          (msg.role === "user" &&
            Array.isArray(msg.content) &&
            msg.content[0]?.type === "tool_result")
        ) {
          // Extract tool result content
          let toolContent = "";
          if (msg.role === "tool") {
            toolContent = msg.content || "";
          } else if (
            Array.isArray(msg.content) &&
            msg.content[0]?.type === "tool_result"
          ) {
            toolContent = msg.content[0].content || "";
          }

          if (!toolContent || toolContent.trim() === "") {
            return null; // Skip empty tool results
          }

          return {
            role: "tool",
            tool_call_id: msg.tool_call_id || msg.content[0]?.tool_use_id || "",
            content: toolContent,
          };
        }

        // For regular messages, ensure content is a string
        if (Array.isArray(msg.content)) {
          // Check if it's Anthropic format with tool_result - convert to OpenAI format
          // This might be a user message with tool results
          if (
            msg.role === "user" &&
            msg.content.some((item) => item.type === "tool_result")
          ) {
            // Convert Anthropic format tool results to OpenAI format
            // Extract text blocks
            const textBlocks = msg.content.filter(
              (item) => item.type === "text"
            );
            const toolResults = msg.content.filter(
              (item) => item.type === "tool_result"
            );

            // Combine text blocks
            const textContent =
              textBlocks
                .map((item) => item.text || "")
                .join("")
                .trim() || "";

            // If we have tool results, we need to convert them to separate tool messages
            // But for now, we'll extract the first tool result and convert it
            if (toolResults.length > 0) {
              // For OpenAI format, tool results should be separate messages with role: "tool"
              // But we can't split one message into multiple, so we'll keep the first tool result
              // and convert it to OpenAI format
              const firstToolResult = toolResults[0];
              if (firstToolResult && firstToolResult.content) {
                return {
                  role: "tool",
                  tool_call_id: firstToolResult.tool_use_id || "",
                  content:
                    typeof firstToolResult.content === "string"
                      ? firstToolResult.content
                      : JSON.stringify(firstToolResult.content),
                };
              }
            }

            // If no tool results or conversion failed, return text content
            return {
              ...msg,
              content: textContent || "",
            };
          }

          // Extract text from array
          const textContent =
            msg.content
              .filter((item) => item.type === "text")
              .map((item) => item.text || "")
              .join("")
              .trim() || "";

          return {
            ...msg,
            content:
              textContent || (msg.role === "assistant" ? "Processing..." : ""),
          };
        }

        // For string content, ensure it's non-empty for assistant messages
        if (
          typeof msg.content === "string" &&
          msg.role === "assistant" &&
          msg.content.trim() === ""
        ) {
          return {
            ...msg,
            content: "Processing...",
          };
        }

        return msg;
      })
      .filter((msg) => msg !== null);

    // CRITICAL: Final pass - ensure ALL messages with content arrays have tool_use objects with input field
    // This is needed because fastrouter.ai might convert messages internally and require input field
    const finalNormalizedMessages = normalizedMessages.map((msg) => {
      if (Array.isArray(msg.content)) {
        msg.content = msg.content.map((item) => {
          if (item.type === "tool_use") {
            // Ensure input field exists - CRITICAL: must always be present
            let input = {};
            if (item.input !== undefined && item.input !== null) {
              // If input is already an object, use it
              if (
                typeof item.input === "object" &&
                !Array.isArray(item.input)
              ) {
                input = item.input;
              } else if (typeof item.input === "string") {
                // Try to parse if it's a string
                try {
                  const parsed = JSON.parse(item.input);
                  if (typeof parsed === "object" && !Array.isArray(parsed)) {
                    input = parsed;
                  }
                } catch (e) {
                  // If parsing fails, use empty object
                  input = {};
                }
              } else {
                input = {};
              }
            } else {
              // If input is missing, try to get it from function.arguments (conversion case)
              if (item.function?.arguments) {
                try {
                  input =
                    typeof item.function.arguments === "string"
                      ? JSON.parse(item.function.arguments)
                      : item.function.arguments;
                } catch (e) {
                  input = {};
                }
              }
            }
            return {
              ...item,
              input: input, // Always ensure input field is present
            };
          }
          return item;
        });
      }
      return msg;
    });

    // Debug: Log message structure to help diagnose empty content issues
    if (i === 1) {
      console.log(
        `🔍 Debug: Normalized messages for turn ${i + 1}:`,
        finalNormalizedMessages.map((msg, idx) => ({
          index: idx,
          role: msg.role,
          hasContent: !!msg.content,
          contentType: Array.isArray(msg.content)
            ? "array"
            : typeof msg.content,
          contentLength: Array.isArray(msg.content)
            ? msg.content.length
            : typeof msg.content === "string"
            ? msg.content.length
            : 0,
          firstItem:
            Array.isArray(msg.content) && msg.content.length > 0
              ? msg.content[0]
              : null,
          fullContent: Array.isArray(msg.content) ? msg.content : msg.content,
        }))
      );

      // Additional check: Verify assistant messages have non-empty content (OpenAI format)
      finalNormalizedMessages.forEach((msg, idx) => {
        if (msg.role === "assistant") {
          const hasContent =
            msg.content &&
            typeof msg.content === "string" &&
            msg.content.trim() !== "";
          const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;

          console.log(
            `⚠️  Assistant message ${idx} check (OpenAI format):`,
            `hasContent: ${hasContent},`,
            `content: "${msg.content}",`,
            `hasToolCalls: ${hasToolCalls},`,
            `toolCallsCount: ${msg.tool_calls ? msg.tool_calls.length : 0}`
          );

          if (!hasContent && !hasToolCalls) {
            console.error(
              `❌ Assistant message ${idx} FAILS validation - no content and no tool_calls!`,
              JSON.stringify(msg, null, 2)
            );
          }
        }
      });

      // Log the actual payload being sent to the API
      console.log(
        `📤 Payload being sent to API (first 3 messages):`,
        JSON.stringify(
          finalNormalizedMessages.slice(0, 3).map((msg) => ({
            role: msg.role,
            content: msg.content,
            tool_calls: msg.tool_calls,
            tool_call_id: msg.tool_call_id,
          })),
          null,
          2
        )
      );
    }

    // CRITICAL: Final safety check - ensure ALL messages with content arrays have tool_use objects with input field
    // This must run right before sending to API to catch any edge cases
    // Recursively check all nested structures for tool_use objects
    function ensureToolUseInput(obj) {
      if (obj === null || obj === undefined) return obj;

      // If it's an array, check each item
      if (Array.isArray(obj)) {
        return obj.map((item) => ensureToolUseInput(item));
      }

      // If it's an object, check for tool_use and recursively check all properties
      if (typeof obj === "object") {
        // Check if this is a tool_use object
        if (obj.type === "tool_use") {
          const result = { ...obj };
          // Ensure input field exists
          if (result.input === undefined || result.input === null) {
            result.input = {};
          } else if (
            typeof result.input !== "object" ||
            Array.isArray(result.input)
          ) {
            // Try to parse if it's a string
            if (typeof result.input === "string") {
              try {
                const parsed = JSON.parse(result.input);
                if (typeof parsed === "object" && !Array.isArray(parsed)) {
                  result.input = parsed;
                } else {
                  result.input = {};
                }
              } catch (e) {
                result.input = {};
              }
            } else {
              result.input = {};
            }
          }
          // Recursively check other properties
          for (const k in result) {
            if (k !== "input" && k !== "type") {
              result[k] = ensureToolUseInput(result[k]);
            }
          }
          return result;
        } else {
          // Not a tool_use object, recursively check all properties
          const result = {};
          for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
              result[key] = ensureToolUseInput(obj[key]);
            }
          }
          return result;
        }
      }

      // Primitive value, return as-is
      return obj;
    }

    const safeMessages = finalNormalizedMessages.map((msg) => {
      // Deep clone and ensure all tool_use objects have input field
      const safeMsg = ensureToolUseInput(JSON.parse(JSON.stringify(msg)));
      return safeMsg;
    });

    const resp = await retryAnthropicCall(() =>
      openai.chat.completions.create({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS, // Configurable via MAX_TOKENS env var (default: 2048)
        messages: safeMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : "none",
      })
    );

    // Check response format - fastrouter.ai might return Anthropic format even though we use OpenAI SDK
    const message = resp.choices[0]?.message;

    // Check if response is in Anthropic format (content array with tool_use) or OpenAI format (tool_calls)
    let finalText = "";
    let calls = [];

    if (Array.isArray(message?.content)) {
      // Anthropic format: content is an array with {type: "text"} and {type: "tool_use"}
      const textContent = message.content.find((c) => c.type === "text");
      finalText = textContent?.text?.trim() || "";
      calls = message.content.filter((c) => c.type === "tool_use") || [];
    } else {
      // OpenAI format: content is string, tool_calls is array
      finalText = message?.content?.trim() || "";
      calls = message?.tool_calls || [];
    }

    console.log(
      `🔄 Turn ${i + 1}: ${calls.length} tool calls, ${
        finalText ? "has text response" : "no text"
      }`
    );
    if (calls.length > 0) {
      console.log(
        `🔧 Tool calls:`,
        calls.map((c) => {
          // OpenAI format: c.function.name and c.function.arguments
          // Anthropic format: c.name and c.input
          const toolName = c.function?.name || c.name || "unknown";
          const toolArgs = c.function?.arguments || c.input || {};
          const argsStr =
            typeof toolArgs === "string"
              ? toolArgs.slice(0, 100)
              : JSON.stringify(toolArgs).slice(0, 100);
          return `${toolName}(${argsStr})`;
        })
      );
    }

    if (!calls.length) return finalText || "";

    const toolResults = [];
    for (const call of calls) {
      // OpenAI tool_calls format: call.function.name and call.function.arguments (JSON string)
      // Anthropic format: call.name and call.input (object)
      const toolName = call.function?.name || call.name;
      const toolArgs = call.function?.arguments
        ? JSON.parse(call.function.arguments)
        : call.input || {};

      const toolInfo = mcpToolsMap.get(toolName);
      if (!toolInfo) {
        toolResults.push({
          role: "tool",
          tool_call_id: call.id,
          content: `Unknown tool: ${toolName}`,
        });
        continue;
      }

      // Check if the tool is enabled for this user before executing
      const toolEnabled = await isToolEnabled(uid, toolInfo.mcpName);
      if (!toolEnabled) {
        console.log(
          `🚫 Tool ${toolName} (${toolInfo.mcpName}) is disabled by user preferences`
        );
        toolResults.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            error: `Tool ${toolInfo.mcpName} is disabled. Please enable it in your preferences to use this feature.`,
          }),
        });
        continue;
      }

      try {
        let { mcpProxy, toolName: mcpToolName } = toolInfo;
        let args = toolArgs;

        // Pre-process Google Calendar create-event calls to normalize dates
        if (
          toolInfo.mcpName === "googlecalendar" &&
          mcpToolName === "create-event"
        ) {
          // Get the original user text - combine current text with recent context for better parsing
          const userText =
            `${recentUserMessages} ${currentText}`.trim() || currentText || "";
          const parsedDateTime = parseDateTimeForCalendar(userText);

          // If we successfully parsed dates, use them (but prefer explicit args if provided)
          if (parsedDateTime.start && !args.start) {
            args.start = parsedDateTime.start;
            console.log(`📅 Parsed start time from text: ${args.start}`);
          }
          if (parsedDateTime.end && !args.end) {
            args.end = parsedDateTime.end;
            console.log(`📅 Parsed end time from text: ${args.end}`);
          }

          // Extract better summary if not provided or generic
          if (!args.summary || args.summary === "Appointment") {
            const extractedSummary = extractEventSummary(userText);
            if (extractedSummary && extractedSummary !== "Appointment") {
              args.summary = extractedSummary;
              console.log(`📝 Extracted event summary: ${args.summary}`);
            }
          }
        }

        console.log(
          `⚙️ Calling tool: ${toolName} -> ${toolInfo.mcpName}.${mcpToolName} with args:`,
          JSON.stringify(args).slice(0, 200)
        );

        // Check for duplicate messages (WhatsApp or Email) before sending
        const isMessageTool =
          (toolInfo.mcpName === "whatsapp" &&
            (mcpToolName === "send_message" ||
              toolName.includes("send_message"))) ||
          (toolInfo.mcpName === "gmail" &&
            (mcpToolName === "send-email" ||
              toolName.includes("send-email") ||
              mcpToolName === "send_email"));

        if (isMessageTool) {
          try {
            // Get recent tool actions (last 20) to check for duplicates
            const recentActions = await listToolActions(uid, 20);
            const recipient = args.recipient || args.to || args.recipient_email;
            const messageContent =
              args.message || args.body || args.text || args.content || "";
            const currentUserMessageForContext =
              currentUserMessage || currentText || "";

            // Check if a similar message was already sent recently (within last 5 minutes)
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const duplicate = recentActions.find((action) => {
              // Check if it's the same tool type
              const isSameTool =
                (action.tool_name === toolName ||
                  action.tool_name?.includes("send_message") ||
                  action.tool_name?.includes("send-email") ||
                  action.tool_name?.includes("send_email")) &&
                action.mcp_name === toolInfo.mcpName;

              if (!isSameTool) return false;

              // Check if it was sent recently
              const actionTime = new Date(action.created_at);
              if (actionTime < fiveMinutesAgo) return false;

              // Check if recipient matches
              const actionRecipient =
                action.tool_args?.recipient ||
                action.tool_args?.to ||
                action.tool_args?.recipient_email;
              if (
                recipient &&
                actionRecipient &&
                recipient !== actionRecipient
              ) {
                return false;
              }

              // Check if message content is similar (at least 50% match)
              const actionMessage =
                action.tool_args?.message ||
                action.tool_args?.body ||
                action.tool_args?.text ||
                action.tool_args?.content ||
                "";
              let messageSimilarity = 0;
              if (messageContent && actionMessage) {
                messageSimilarity = jaccard(
                  messageContent.toLowerCase(),
                  actionMessage.toLowerCase()
                );
              }

              // Check if user context/topic is similar (at least 40% match)
              // This checks if the user asked about the same topic/context
              const actionUserMessage = action.user_message || "";
              let contextSimilarity = 0;
              if (currentUserMessageForContext && actionUserMessage) {
                contextSimilarity = jaccard(
                  currentUserMessageForContext.toLowerCase(),
                  actionUserMessage.toLowerCase()
                );
              }

              // Consider it a duplicate if:
              // 1. Message content is similar (50%+ match), OR
              // 2. User context/topic is similar (40%+ match) - same topic being discussed
              // This prevents sending multiple messages about the same topic/context
              const isDuplicate =
                messageSimilarity >= 0.5 || contextSimilarity >= 0.4;

              if (!isDuplicate) return false;

              // Check if it was successful
              return action.success === true;
            });

            if (duplicate) {
              // Calculate similarities for logging
              const duplicateMessage =
                duplicate.tool_args?.message ||
                duplicate.tool_args?.body ||
                duplicate.tool_args?.text ||
                duplicate.tool_args?.content ||
                "";
              const duplicateUserMessage = duplicate.user_message || "";
              const msgSimilarity =
                messageContent && duplicateMessage
                  ? jaccard(
                      messageContent.toLowerCase(),
                      duplicateMessage.toLowerCase()
                    )
                  : 0;
              const ctxSimilarity =
                currentUserMessageForContext && duplicateUserMessage
                  ? jaccard(
                      currentUserMessageForContext.toLowerCase(),
                      duplicateUserMessage.toLowerCase()
                    )
                  : 0;

              console.log(
                `⚠️ Duplicate message detected - skipping send. Previous message sent at ${duplicate.created_at}`
              );
              console.log(
                `   Message similarity: ${(msgSimilarity * 100).toFixed(
                  1
                )}%, Context similarity: ${(ctxSimilarity * 100).toFixed(1)}%`
              );

              // Return a result indicating the message was already sent
              const duplicateResult = {
                success: true,
                message: `Message already sent to ${
                  recipient || "recipient"
                } at ${new Date(
                  duplicate.created_at
                ).toLocaleString()} about the same topic/context. Skipping duplicate send.`,
                duplicate: true,
                previous_sent_at: duplicate.created_at,
                reason:
                  msgSimilarity >= 0.5
                    ? "similar message content"
                    : "same conversation context/topic",
              };

              // Save this as a tool action (skipped duplicate)
              await saveToolAction({
                session_uid: uid,
                tool_name: toolName,
                mcp_name: toolInfo.mcpName,
                tool_args: args,
                tool_result: duplicateResult,
                result_summary: "Duplicate message detected - skipped sending",
                success: true,
                user_message: currentUserMessage || currentText || "",
              });

              // Return the duplicate result in the expected format (MCP format)
              toolResults.push({
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify(duplicateResult),
              });
              continue; // Skip the actual tool call
            }
          } catch (duplicateCheckErr) {
            console.warn(
              "Failed to check for duplicate messages, proceeding anyway:",
              duplicateCheckErr.message
            );
            // Continue with sending if duplicate check fails
          }
        }

        // Apply Notion-specific adapter if needed
        if (toolInfo.mcpName === "notion") {
          const adapted = await adaptNotionCall(mcpProxy, mcpToolName, args);
          mcpToolName = adapted.toolName;
          args = adapted.args;
        }

        const result = await mcpProxy.call(mcpToolName, args);

        // Generate AI summary of the tool result
        let resultSummary = null;
        try {
          // Extract text content from result for summarization
          let resultText = "";
          if (Array.isArray(result) && result.length > 0) {
            const textItem = result.find((item) => item.type === "text");
            if (textItem && textItem.text) {
              resultText = textItem.text;
            } else {
              resultText = JSON.stringify(result, null, 2);
            }
          } else if (typeof result === "object" && result !== null) {
            resultText = JSON.stringify(result, null, 2);
          } else if (typeof result === "string") {
            resultText = result;
          } else {
            resultText = String(result || "");
          }

          // Limit text length for summarization (keep it reasonable)
          const textForSummary = resultText.slice(0, 4000);

          // Get user message and tool name for context
          const userMessage = currentUserMessage || currentText || "";
          const toolDisplayName = toolName.replace(/_/g, " ");

          // Generate summary using AI with context about what was asked and what was done
          if (textForSummary && textForSummary.trim().length > 0) {
            const summaryResponse = await openai.chat.completions.create({
              model: CLAUDE_MODEL,
              messages: [
                {
                  role: "system",
                  content:
                    "You are a helpful assistant that creates concise summaries of tool actions. Summarize what the user asked, what action was taken, and the key result in 1-2 sentences.",
                },
                {
                  role: "user",
                  content: `User asked: "${userMessage}"\n\nTool used: ${toolDisplayName}\nTool arguments: ${JSON.stringify(
                    args,
                    null,
                    2
                  ).slice(
                    0,
                    500
                  )}\n\nTool result:\n${textForSummary}\n\nCreate a concise summary (1-2 sentences) explaining what the user asked for, what action was taken, and the key result.`,
                },
              ],
              max_tokens: 200, // Slightly longer to include context
              temperature: 0.3, // Lower temperature for more consistent summaries
            });

            resultSummary =
              summaryResponse.choices[0]?.message?.content?.trim() || null;
            if (resultSummary) {
              console.log(`📝 Generated summary: ${resultSummary}`);
            }
          }
        } catch (summaryErr) {
          console.error("Failed to generate summary:", summaryErr);
          // Continue without summary - don't fail the tool action
        }

        // Save successful tool action to database
        try {
          await saveToolAction({
            session_uid: uid,
            tool_name: toolName,
            mcp_name: toolInfo.mcpName,
            tool_args: args,
            tool_result: result,
            result_summary: resultSummary, // AI-generated summary
            success: true,
            user_message: currentUserMessage || currentText || "",
          });
        } catch (saveErr) {
          console.error("Failed to save tool action:", saveErr);
        }

        // RAG: Store tool result with embedding (async, don't block)
        try {
          const toolResultText =
            resultSummary ||
            (typeof result === "string" ? result : JSON.stringify(result));
          storeToolResult(uid, toolResultText, toolName, toolInfo.mcpName, {
            user_message: currentUserMessage || currentText || "",
            tool_args: args,
            result_summary: resultSummary,
          })
            .then(() => {
              console.log(
                `📚 RAG Training: Stored tool result from ${toolInfo.mcpName}/${toolName} with embedding`
              );
            })
            .catch((err) =>
              console.warn(
                "Failed to store tool result embedding:",
                err.message
              )
            );

          // Extract and store contacts from tool result (async, don't block)
          extractAndStoreContacts(uid, result, toolName, toolInfo.mcpName, {
            user_message: currentUserMessage || currentText || "",
            tool_args: args,
            result_summary: resultSummary,
          }).catch((err) =>
            console.warn("Failed to extract and store contacts:", err.message)
          );
        } catch (ragErr) {
          console.warn(
            "Failed to prepare tool result for RAG:",
            ragErr.message
          );
        }

        // Enhanced logging for calendar events
        if (toolInfo.mcpName === "googlecalendar") {
          try {
            if (mcpToolName === "create-event") {
              const resultObj =
                typeof result === "string" ? JSON.parse(result) : result;
              const eventData =
                resultObj?.event || resultObj?.[0]?.text || result;
              if (typeof eventData === "string") {
                const parsed = JSON.parse(eventData);
                if (parsed.event) {
                  console.log(`📅 Calendar Event Created Successfully!`);
                  console.log(`   Event ID: ${parsed.event.id}`);
                  console.log(
                    `   Title: ${parsed.event.summary || "Untitled"}`
                  );
                  console.log(
                    `   Start: ${
                      parsed.event.start?.dateTime || parsed.event.start?.date
                    }`
                  );
                  console.log(
                    `   End: ${
                      parsed.event.end?.dateTime || parsed.event.end?.date
                    }`
                  );
                  console.log(`   Status: ${parsed.event.status || "unknown"}`);
                  console.log(`   Calendar: ${args.calendarId || "primary"}`);
                }
              }
            } else if (mcpToolName === "update-event") {
              console.log(`✏️  Calendar Event Update Attempted`);
              console.log(
                `   Event ID: ${args.eventId || args.id || "unknown"}`
              );
              console.log(`   Calendar: ${args.calendarId || "primary"}`);
              if (args.start) {
                console.log(`   New Start Time: ${args.start}`);
              }
              if (args.end) {
                console.log(`   New End Time: ${args.end}`);
              }
              if (args.summary) {
                console.log(`   New Summary: ${args.summary}`);
              }
              const resultObj =
                typeof result === "string" ? JSON.parse(result) : result;
              const resultText =
                resultObj?.[0]?.text ||
                resultObj?.text ||
                (typeof resultObj === "object" && resultObj !== null
                  ? JSON.stringify(resultObj)
                  : String(result));
              if (
                resultText &&
                (resultText.includes("success") ||
                  resultText.includes("updated") ||
                  resultText.includes("id"))
              ) {
                console.log(`✅ Calendar Event Updated Successfully!`);
              } else {
                console.log(`⚠️  Calendar Event Update Result: ${resultText}`);
              }
            } else if (mcpToolName === "delete-event") {
              console.log(`🗑️  Calendar Event Deletion Attempted`);
              console.log(
                `   Event ID: ${args.eventId || args.id || "unknown"}`
              );
              console.log(`   Calendar: ${args.calendarId || "primary"}`);
              const resultObj =
                typeof result === "string" ? JSON.parse(result) : result;
              const resultText =
                resultObj?.[0]?.text ||
                resultObj?.text ||
                JSON.stringify(result);
              if (resultText && !resultText.toLowerCase().includes("error")) {
                console.log(
                  `   ✅ Deletion Successful: ${resultText.slice(0, 200)}`
                );
              } else {
                console.log(
                  `   ❌ Deletion Result: ${resultText.slice(0, 200)}`
                );
              }
            } else if (mcpToolName === "list-events") {
              const resultObj =
                typeof result === "string" ? JSON.parse(result) : result;
              const resultText =
                resultObj?.[0]?.text ||
                resultObj?.text ||
                JSON.stringify(result);
              if (resultText) {
                try {
                  const parsed = JSON.parse(resultText);
                  if (parsed.events && Array.isArray(parsed.events)) {
                    console.log(
                      `📋 Found ${parsed.events.length} event(s) in time range`
                    );
                    parsed.events.forEach((event, idx) => {
                      console.log(
                        `   ${idx + 1}. ${event.summary || "Untitled"} (ID: ${
                          event.id
                        }) - ${event.start?.dateTime || event.start?.date}`
                      );
                    });
                  }
                } catch (e) {
                  // Not JSON, just log the text
                  console.log(
                    `📋 List Events Result: ${resultText.slice(0, 200)}`
                  );
                }
              }
            }
          } catch (e) {
            // If parsing fails, just log the preview
            console.log(
              `✅ Tool ${toolName} succeeded. Result preview:`,
              JSON.stringify(result).slice(0, 300)
            );
          }
        } else {
          console.log(
            `✅ Tool ${toolName} succeeded. Result preview:`,
            JSON.stringify(result).slice(0, 300)
          );
        }

        // Detect format based on call structure
        const isAnthropicFormat = call.type === "tool_use";

        // Process result - MCP results can be arrays with {type: "text", text: "..."} format
        let resultContent = result;
        if (Array.isArray(result) && result.length > 0) {
          // If result is an array like [{"type":"text","text":"{...}"}], extract the text
          const textItem = result.find((item) => item.type === "text");
          if (textItem && textItem.text) {
            resultContent = textItem.text;
          } else {
            // If no text item, stringify the whole array
            resultContent = JSON.stringify(result, null, 2);
          }
        } else if (typeof result === "object" && result !== null) {
          // If result is an object, stringify it
          resultContent = JSON.stringify(result, null, 2);
        } else if (typeof result === "string") {
          // If result is already a string, use it as-is
          resultContent = result;
        } else {
          // Fallback: convert to string
          resultContent = String(result || "{}");
        }

        // Ensure content is not empty
        if (
          !resultContent ||
          (typeof resultContent === "string" && resultContent.trim() === "")
        ) {
          resultContent = "{}"; // Fallback to empty object string
        }

        // Limit content length
        const finalContent =
          typeof resultContent === "string"
            ? resultContent.slice(0, 8000)
            : JSON.stringify(resultContent, null, 2).slice(0, 8000);

        if (isAnthropicFormat) {
          // Anthropic format: type: "tool_result"
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: finalContent,
          });
        } else {
          // OpenAI format: role: "tool"
          toolResults.push({
            role: "tool",
            tool_call_id: call.id,
            content: finalContent,
          });
        }
      } catch (err) {
        console.error(`❌ Error calling ${toolName}:`, err);
        console.error(`   Full error:`, err);

        // Save failed tool action to database
        try {
          await saveToolAction({
            session_uid: uid,
            tool_name: toolName,
            mcp_name: toolInfo?.mcpName || "unknown",
            tool_args: toolArgs,
            tool_result: {},
            success: false,
            error_message: err.message || String(err),
            user_message: currentUserMessage || currentText || "",
          });
        } catch (saveErr) {
          console.error("Failed to save tool action:", saveErr);
        }

        // Detect format based on call structure
        const isAnthropicFormat = call.type === "tool_use";

        if (isAnthropicFormat) {
          // Anthropic format: type: "tool_result" with is_error
          toolResults.push({
            type: "tool_result",
            tool_use_id: call.id,
            is_error: true,
            content: `Error: ${err.message}`,
          });
        } else {
          // OpenAI format: role: "tool"
          toolResults.push({
            role: "tool",
            tool_call_id: call.id,
            content: `Error: ${err.message}`,
          });
        }
      }
    }

    // Detect format: if calls have type: "tool_use", it's Anthropic format
    const isAnthropicFormat = calls.length > 0 && calls[0].type === "tool_use";

    if (isAnthropicFormat) {
      // Anthropic format: assistant message has content array with text and tool_use
      const assistantContent = [];

      // CRITICAL: Anthropic API requires assistant messages with tool_use to have
      // a non-empty text block as the FIRST item in the content array
      // Always include at least one non-empty text block when there are tool_use items
      if (calls.length > 0) {
        // If we have tool calls, ensure we have a non-empty text block first
        if (finalText && finalText.trim() !== "") {
          assistantContent.push({ type: "text", text: finalText });
        } else {
          // If no text or empty text, add a non-empty text block
          assistantContent.push({ type: "text", text: "Processing..." });
        }
      } else if (finalText) {
        // If no tool calls, just add the text
        assistantContent.push({ type: "text", text: finalText });
      }

      if (calls.length > 0) {
        // Ensure all tool_use items have the required 'input' field
        const toolUses = calls.map((call) => {
          // If it already has input, use it; otherwise convert from OpenAI format
          if (call.input !== undefined) {
            return call;
          }
          // Convert from OpenAI format (function.arguments) to Anthropic format (input)
          const input = call.function?.arguments
            ? typeof call.function.arguments === "string"
              ? JSON.parse(call.function.arguments)
              : call.function.arguments
            : {};

          return {
            type: "tool_use",
            id: call.id,
            name: call.function?.name || call.name || "unknown",
            input: input,
          };
        });
        assistantContent.push(...toolUses);
      }

      // Ensure content is never empty - CRITICAL for Anthropic API
      if (assistantContent.length === 0) {
        assistantContent.push({ type: "text", text: "Processing..." });
      }

      // CRITICAL: Final check - ensure first item is always a non-empty text block when we have tool_use
      if (calls.length > 0 && assistantContent.length > 0) {
        const firstItem = assistantContent[0];
        if (
          firstItem.type !== "text" ||
          !firstItem.text ||
          firstItem.text.trim() === ""
        ) {
          // Rebuild: text block FIRST, then tool_use items
          const textBlocks = assistantContent.filter(
            (item) => item.type === "text"
          );
          const toolUseItems = assistantContent.filter(
            (item) => item.type === "tool_use"
          );
          const nonEmptyText =
            textBlocks.find((item) => item.text && item.text.trim() !== "")
              ?.text ||
            finalText ||
            "Processing...";
          assistantContent.length = 0; // Clear array
          assistantContent.push({ type: "text", text: nonEmptyText });
          assistantContent.push(...toolUseItems);
        } else {
          // Ensure text block is first (reorder if needed)
          const textBlocks = assistantContent.filter(
            (item) => item.type === "text"
          );
          const toolUseItems = assistantContent.filter(
            (item) => item.type === "tool_use"
          );
          if (textBlocks.length > 0 && toolUseItems.length > 0) {
            // Rebuild with text first
            const nonEmptyTextBlock =
              textBlocks.find((item) => item.text && item.text.trim() !== "") ||
              textBlocks[0];
            assistantContent.length = 0; // Clear array
            assistantContent.push(nonEmptyTextBlock);
            assistantContent.push(...toolUseItems);
          }
        }
      }

      messages.push({
        role: "assistant",
        content: assistantContent,
      });

      // Anthropic format: tool results are sent as user message with content array
      if (toolResults.length > 0) {
        // Ensure all tool results have valid content
        const validToolResults = toolResults.filter((tr) => {
          // Filter out empty content
          const content = tr.content;
          if (
            content === undefined ||
            content === null ||
            content === "" ||
            (typeof content === "string" && content.trim() === "")
          ) {
            return false;
          }
          return true;
        });

        // Only add if we have valid tool results with non-empty content array
        if (validToolResults.length > 0) {
          // Ensure each tool_result has valid content
          const finalToolResults = validToolResults.map((tr) => {
            // Ensure content is a string and not empty
            let content = tr.content;
            if (typeof content !== "string") {
              content = JSON.stringify(content);
            }
            if (!content || content.trim() === "") {
              content = "{}"; // Fallback to empty object string
            }
            return {
              ...tr,
              content: content,
            };
          });

          messages.push({
            role: "user",
            content: finalToolResults,
          });
        }
      }
    } else {
      // OpenAI format: assistant message with tool_calls
      const assistantMsg = {
        role: "assistant",
      };

      // Add content if present
      if (finalText) {
        assistantMsg.content = finalText;
      } else if (calls.length === 0) {
        assistantMsg.content = "";
      }

      // Add tool_calls if present
      if (calls.length > 0) {
        assistantMsg.tool_calls = calls;
      }

      messages.push(assistantMsg);

      // OpenAI format: tool results are separate messages with role: "tool"
      if (toolResults.length > 0) {
        messages.push(...toolResults);
      }
    }
  }

  return "I tried but couldn't complete the action.";
}

// (optional) debounce micro-segments from same uid
const inflight = new Map();
function debounceSegments(uid, text) {
  return new Promise((resolve) => {
    const prev = inflight.get(uid);
    if (prev) clearTimeout(prev.t);
    const obj = { buf: (prev?.buf || []).concat(text), t: null };
    obj.t = setTimeout(() => {
      inflight.delete(uid);
      resolve(obj.buf.join(" ").trim());
    }, 800);
    inflight.set(uid, obj);
  });
}

// ------------------- routes -------------------
app.get("/api/omi", (req, res) => {
  if (req.query.challenge) return res.status(200).send(req.query.challenge);
  res.json({
    ok: true,
    provider: "openai (fastrouter.ai)",
    model: CLAUDE_MODEL,
  });
});

app.post("/api/omi", async (req, res) => {
  try {
    if (WEBHOOK_SECRET && req.headers["x-webhook-secret"] !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: "invalid secret" });
    }

    const uid = req.query?.uid || "no-uid";
    const textRaw = extractText(req.body);

    console.log("---- Incoming /api/omi ----");
    console.log("UID:", uid);
    console.log("Method:", req.method);
    console.log("URL:", req.originalUrl);
    console.log("Headers:", req.headers);
    console.log("Body:", normalizeBody(req.body));
    console.log("Extracted text:", textRaw);
    console.log("Provider: openai (fastrouter.ai) | Model:", CLAUDE_MODEL);
    console.log("---------------------------");

    const text = await debounceSegments(uid, textRaw);

    await upsertSession(uid);
    await saveMessage({
      session_uid: uid,
      role: "user",
      text,
      provider: "openai (fastrouter.ai)",
      model: CLAUDE_MODEL,
      raw: req.body,
    });

    // RAG: Store user message with embedding (async, don't block)
    storeUserMessage(uid, text, {
      provider: "openai (fastrouter.ai)",
      model: CLAUDE_MODEL,
    })
      .then(() => {
        console.log(`📚 RAG Training: Stored user message with embedding`);
      })
      .catch((err) =>
        console.warn("Failed to store user message embedding:", err.message)
      );

    // Extract and store contacts from user message (for entity linking)
    // This helps connect different representations (e.g., "nithishbaddula a gmail dot com" → "nithishbaddula@gmail.com")
    try {
      const {
        extractContacts,
        normalizeEmail,
        storeContact,
      } = require("./rag-service");
      const contacts = extractContacts(text);

      // Store any emails found in the message
      for (const email of contacts.normalized_emails || contacts.emails) {
        if (email) {
          // Try to extract name from context
          const nameMatch = text.match(/\b(nithish|nitish|nithi|[\w]+)\b/i);
          const extractedName = nameMatch ? nameMatch[1] : null;

          if (extractedName) {
            await storeContact(uid, extractedName, email, null, null, {
              source: "user_message",
              extracted_at: new Date().toISOString(),
            });
            console.log(
              `🔗 Entity Linking: Stored contact ${extractedName} -> ${email} from user message`
            );
          }
        }
      }
    } catch (contactErr) {
      // Don't fail if contact extraction fails
      console.warn(
        "Failed to extract contacts from user message:",
        contactErr.message
      );
    }

    const reply = await askClaudeWithContext(uid, text || "Say hello.");

    await saveMessage({
      session_uid: uid,
      role: "assistant",
      text: reply,
      provider: "openai (fastrouter.ai)",
      model: CLAUDE_MODEL,
    });

    // RAG: Store assistant response with embedding (async, don't block)
    storeAssistantResponse(uid, reply, {
      provider: "openai (fastrouter.ai)",
      model: CLAUDE_MODEL,
    })
      .then(() => {
        console.log(
          `📚 RAG Training: Stored assistant response with embedding`
        );
      })
      .catch((err) =>
        console.warn(
          "Failed to store assistant response embedding:",
          err.message
        )
      );

    // RAG: Store Q&A pair together (async, don't block)
    // This helps RAG understand the relationship between questions and answers
    storeQAPair(uid, text, reply, {
      provider: "openai (fastrouter.ai)",
      model: CLAUDE_MODEL,
    })
      .then(() => {
        console.log(`📚 RAG Training: Stored Q&A pair with embedding`);
      })
      .catch((err) =>
        console.warn("Failed to store Q&A pair embedding:", err.message)
      );

    console.log("Reply:", reply);

    // Check if conversation is important and save summary to Notion
    try {
      await checkAndSaveSummaryToNotion(uid, text, reply);
    } catch (notionErr) {
      // Don't fail the request if Notion save fails
      console.warn(
        "Failed to save to Notion (non-critical):",
        notionErr.message
      );
    }

    res.json({
      ok: true,
      provider: "openai (fastrouter.ai)",
      model: CLAUDE_MODEL,
      uid,
      received: { text, length: (text || "").length },
      reply,
    });
  } catch (e) {
    console.error("Claude/Mongo error:", e);

    // Provide user-friendly error messages for common issues
    let statusCode = 500;
    let errorMessage = e.message || "server error";

    if (e.status === 529) {
      // API overloaded - return 503 (Service Unavailable) which is more appropriate
      statusCode = 503;
      errorMessage =
        "The AI service is currently overloaded. Please try again in a few moments.";
    } else if (e.status === 429) {
      // Rate limited
      statusCode = 429;
      errorMessage =
        "Rate limit exceeded. Please wait a moment before trying again.";
    } else if (e.status >= 500 && e.status < 600) {
      // Server errors
      statusCode = 503;
      errorMessage =
        "The AI service is temporarily unavailable. Please try again shortly.";
    }

    res.status(statusCode).json({
      ok: false,
      error: errorMessage,
      status: e.status || statusCode,
      retryAttempts: e.retryAttempts || 0,
    });
  }
});

// Optional: fetch recent messages for a session (debug/view)
app.get("/api/sessions/:uid/messages", async (req, res) => {
  try {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const docs = await listMessages(req.params.uid, limit);
    res.json({
      ok: true,
      uid: req.params.uid,
      count: docs.length,
      messages: docs,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// API endpoint to get all conversations (messages grouped by session)
app.get("/api/conversations", async (req, res) => {
  try {
    const limit = Math.min(500, Number(req.query.limit) || 200);
    const messages = await listMessages(null, limit); // Get all messages (null = no filter)
    // Group by session_uid
    const conversations = {};
    messages.forEach((msg) => {
      const uid = msg.session_uid || "unknown";
      if (!conversations[uid]) {
        conversations[uid] = [];
      }
      conversations[uid].push(msg);
    });
    // Sort conversations by latest message timestamp (oldest first, newest last)
    const sortedConversations = Object.entries(conversations)
      .map(([uid, msgs]) => {
        // Get the latest message timestamp for sorting
        const latestMessage = msgs[0]; // Messages are already sorted newest first
        const latestTimestamp =
          latestMessage?.created_at || new Date().toISOString();
        return {
          uid,
          messages: msgs.reverse(), // Reverse to show oldest first, newest last (like chat app)
          count: msgs.length,
          latestTimestamp,
        };
      })
      .sort(
        (a, b) => new Date(a.latestTimestamp) - new Date(b.latestTimestamp)
      ); // Oldest conversations first, newest last

    res.json({
      ok: true,
      conversations: sortedConversations.map(({ uid, messages, count }) => ({
        uid,
        messages,
        count,
      })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// API endpoint to get tool actions for a specific session
app.get("/api/sessions/:uid/tool-actions", async (req, res) => {
  try {
    const limit = Math.min(200, Number(req.query.limit) || 100);
    const actions = await listToolActions(req.params.uid, limit);
    res.json({
      ok: true,
      uid: req.params.uid,
      count: actions.length,
      actions: actions, // Already sorted by created_at: -1 (newest first)
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// API endpoint to get all tool actions across all sessions
app.get("/api/tool-actions", async (req, res) => {
  try {
    const limit = Math.min(500, Number(req.query.limit) || 200);
    const actions = await listAllToolActions(limit);
    res.json({
      ok: true,
      count: actions.length,
      actions: actions, // Already sorted by created_at: -1 (newest first)
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// API endpoint to get user preferences
app.get("/api/user-preferences", async (req, res) => {
  try {
    const uid = req.query?.uid || "no-uid";
    const prefs = await getUserPreferences(uid);
    res.json({
      ok: true,
      uid,
      preferences: prefs,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// API endpoint to update user preferences
app.post("/api/user-preferences", async (req, res) => {
  try {
    const uid = req.query?.uid || req.body?.uid || "no-uid";
    const preferences = req.body?.preferences || req.body;

    // Validate preferences object
    const validToolNames = [
      "googlecalendar",
      "googledocs",
      "googleslides",
      "googlepresentation",
      "gmail",
      "notion",
      "zomato",
      "whatsapp",
      "filesystem",
      "fetch",
      "github",
    ];

    const filteredPreferences = {};
    for (const [key, value] of Object.entries(preferences)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (validToolNames.includes(normalizedKey)) {
        filteredPreferences[normalizedKey] = value === true || value === "true";
      }
    }

    const updatedPrefs = await updateUserPreferences(uid, filteredPreferences);
    res.json({
      ok: true,
      uid,
      preferences: updatedPrefs,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// API endpoint to get RAG training data
app.get("/api/rag/data", async (req, res) => {
  try {
    const options = {
      session_uid: req.query.uid || null,
      content_type: req.query.content_type || null,
      mcp_name: req.query.mcp_name || null,
      tool_name: req.query.tool_name || null,
      limit: Math.min(500, Number(req.query.limit) || 100),
      skip: Number(req.query.skip) || 0,
      sort: req.query.sort || "newest", // 'newest' or 'oldest'
    };

    // Remove null values
    Object.keys(options).forEach(
      (key) => options[key] === null && delete options[key]
    );

    const data = await listRAGData(options);
    res.json({
      ok: true,
      ...data,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// API endpoint to get RAG statistics
app.get("/api/rag/stats", async (req, res) => {
  try {
    const session_uid = req.query.uid || null;
    const stats = await getRAGStats(session_uid);
    res.json({
      ok: true,
      stats,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// serve your front-end (put the index.html in ./public)
app.use(express.static("public"));

// ------------------- start -------------------
(async () => {
  try {
    await connectMongo();
    console.log("✅ Mongo connected");

    // MCPs will start lazily when detected in user messages
    const availableMCPs = getAvailableMCPs();
    console.log(
      `ℹ️ MCPs available (${availableMCPs.length}): ${availableMCPs.join(", ")}`
    );
    console.log(
      "ℹ️ MCPs will start on-demand when user messages trigger them."
    );

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(
        `✅ Claude+Mongo (context-aware) server at http://localhost:${PORT}`
      );
      console.log(
        `Provider at startup: openai (fastrouter.ai) - ${CLAUDE_MODEL}`
      );
    });
  } catch (err) {
    console.error("Mongo connect failed:", err.message);
    process.exit(1);
  }
})();
