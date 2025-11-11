// rag-service.js
// RAG (Retrieval-Augmented Generation) service using MongoDB Vector Search
// Based: https://www.mongodb.com/docs/atlas/atlas-vector-search/rag/

const mongoose = require("mongoose");
const OpenAI = require("openai");
const https = require("https");
const http = require("http");
const { HfInference } = require("@huggingface/inference");

// Embedding provider configuration
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || "huggingface"; // "openai", "huggingface", or "local" (default: huggingface)
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = parseInt(
  process.env.EMBEDDING_DIMENSIONS || "1536",
  10
);

// Local embedding model (for @xenova/transformers)
const LOCAL_EMBEDDING_MODEL =
  process.env.LOCAL_EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
const LOCAL_EMBEDDING_DIMENSIONS = 384; // MiniLM-L6-v2 is always 384

// OpenAI configuration
const embeddingBaseURL =
  process.env.EMBEDDING_API_BASE || "https://api.openai.com/v1";
const embeddingApiKey =
  process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || "";

const openai = new OpenAI({
  baseURL: embeddingBaseURL,
  apiKey: embeddingApiKey,
});

// Hugging Face configuration (free tier available)
const HUGGINGFACE_API_KEY =
  process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || "";
const HUGGINGFACE_MODEL =
  process.env.HUGGINGFACE_MODEL || "sentence-transformers/all-MiniLM-L6-v2"; // Free, 384 dimensions

// Initialize Hugging Face Inference Client (SDK)
let hfClient = null;
if (HUGGINGFACE_API_KEY) {
  hfClient = new HfInference(HUGGINGFACE_API_KEY);
}

// --- Local Embedding Setup (@xenova/transformers) ---
let localPipeline = null;

/**
 * Get or initialize local embedding pipeline
 * Uses @xenova/transformers for local embeddings (no API needed)
 */
async function getLocalPipeline() {
  if (!localPipeline) {
    try {
      console.log(`⏳ Loading local model '${LOCAL_EMBEDDING_MODEL}'...`);
      // Dynamic import for @xenova/transformers
      const { pipeline } = await import("@xenova/transformers");
      // 'feature-extraction' is the task for creating embeddings
      localPipeline = await pipeline(
        "feature-extraction",
        LOCAL_EMBEDDING_MODEL
      );
      console.log("✅ Local model loaded successfully!");
    } catch (error) {
      console.error("Failed to load local embedding model:", error.message);
      throw new Error(
        `Failed to load local embedding model: ${error.message}. ` +
          `Make sure @xenova/transformers is installed: npm install @xenova/transformers`
      );
    }
  }
  return localPipeline;
}

/**
 * Generate embedding using local model (@xenova/transformers)
 * Runs entirely on your machine - no API calls needed
 */
async function generateEmbeddingLocal(text) {
  try {
    const pipe = await getLocalPipeline();
    const output = await pipe(text, {
      pooling: "mean", // standard for sentence-transformers
      normalize: true, // important for cosine similarity
    });

    // Convert Tensor to standard JS array
    const embedding = Array.from(output.data);

    // Verify dimensions
    if (embedding.length !== LOCAL_EMBEDDING_DIMENSIONS) {
      console.warn(
        `Warning: Expected ${LOCAL_EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`
      );
    }

    return embedding;
  } catch (error) {
    console.error("Local embedding error:", error);
    throw error;
  }
}

// Schema for storing conversation context with embeddings
const ConversationContextSchema = new mongoose.Schema(
  {
    session_uid: { type: String, index: true, required: true },
    content: { type: String, required: true }, // The text content
    content_type: {
      type: String,
      enum: [
        "user_message",
        "assistant_response",
        "tool_result",
        "conversation_summary",
        "contact_info", // New type for contact information
        "qa_pair", // New type for question-answer pairs
      ],
      required: true,
    },
    embedding: {
      type: [Number], // Vector embedding array
      required: true,
    },
    metadata: {
      type: Object,
      default: {},
      // Can include: tool_name, mcp_name, message_id, timestamp, etc.
    },
    created_at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// Create model
const ConversationContext = mongoose.model(
  "ConversationContext",
  ConversationContextSchema
);

/**
 * Generate embedding using Hugging Face Inference API SDK (free tier available)
 * Uses the @huggingface/inference SDK for feature extraction (embeddings)
 */
async function generateEmbeddingHuggingFace(text) {
  try {
    if (!hfClient) {
      throw new Error(
        "Hugging Face client not initialized. Set HUGGINGFACE_API_KEY or HF_TOKEN in .env"
      );
    }

    const model = HUGGINGFACE_MODEL;

    // Use the SDK's feature extraction method for embeddings
    // This automatically handles the correct endpoint routing
    const response = await hfClient.featureExtraction({
      model: model,
      inputs: text.trim(),
    });

    // The SDK returns embeddings in different formats:
    // - Single text: array of numbers
    // - Multiple texts: array of arrays
    // - Sometimes nested: [[numbers]]
    if (Array.isArray(response)) {
      // If first element is an array, it's nested format
      if (response.length > 0 && Array.isArray(response[0])) {
        return response[0]; // Return first embedding
      }
      // If all elements are numbers, it's a single embedding
      if (response.length > 0 && typeof response[0] === "number") {
        return response; // Return the embedding array
      }
      // Otherwise, it might be an array of embeddings
      return response[0] || response;
    }

    throw new Error("Invalid Hugging Face response format - expected array");
  } catch (error) {
    // Handle specific error cases
    if (
      error.message?.includes("401") ||
      error.message?.includes("Unauthorized")
    ) {
      console.error("Hugging Face API key is invalid or missing");
      throw new Error(
        "Hugging Face authentication failed. Check your HUGGINGFACE_API_KEY or HF_TOKEN in .env"
      );
    } else if (
      error.message?.includes("503") ||
      error.message?.includes("loading")
    ) {
      console.warn("Model is loading, please wait...");
      throw new Error("Model is loading. Please wait a moment and try again.");
    } else if (
      error.message?.includes("429") ||
      error.message?.includes("rate limit")
    ) {
      console.warn("Rate limit exceeded");
      throw new Error("Rate limit exceeded. Please wait before retrying.");
    } else if (
      error.message?.includes("404") ||
      error.message?.includes("Not Found")
    ) {
      console.error(`Model "${HUGGINGFACE_MODEL}" not found or not available`);
      throw new Error(
        `Model "${HUGGINGFACE_MODEL}" not found. Please check the model name or use a different model.`
      );
    }

    console.error("Hugging Face embedding error:", error.message);
    throw error;
  }
}

/**
 * Generate embedding for text using OpenAI, Hugging Face, or local models
 * Includes retry logic for rate limits (429 errors)
 */
async function generateEmbedding(text, retryCount = 0) {
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second base delay

  try {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      throw new Error("Invalid text for embedding generation");
    }

    // Route to appropriate provider
    if (EMBEDDING_PROVIDER === "local") {
      // Use local embeddings (@xenova/transformers) - runs on your machine
      return await generateEmbeddingLocal(text);
    }

    if (EMBEDDING_PROVIDER === "huggingface") {
      return await generateEmbeddingHuggingFace(text);
    }

    // Default to OpenAI (or Voyage AI if configured)
    if (EMBEDDING_PROVIDER !== "openai") {
      console.warn(
        `Unknown embedding provider: ${EMBEDDING_PROVIDER}, falling back to OpenAI`
      );
    }

    // Check if we have an API key for OpenAI
    if (!embeddingApiKey) {
      throw new Error(
        "No embedding API key configured. Set EMBEDDING_API_KEY, OPENAI_API_KEY, or use EMBEDDING_PROVIDER=huggingface"
      );
    }

    // Check if using Voyage AI (different API format)
    const isVoyageAI =
      EMBEDDING_MODEL.startsWith("voyage-") ||
      embeddingBaseURL.includes("voyageai.com");

    if (isVoyageAI && retryCount === 0) {
      // Voyage AI uses a different API format
      // Note: Voyage AI might require different request format
      // For now, we'll try OpenAI-compatible format, but Voyage AI might need custom implementation
      console.warn(
        "Voyage AI detected - consider using OpenAI embeddings for better compatibility"
      );
    }

    // Use OpenAI embeddings (or Voyage AI if configured)
    const requestParams = {
      model: EMBEDDING_MODEL,
      input: text.trim(),
    };

    // Only add dimensions for OpenAI models (Voyage AI might not support it)
    if (!isVoyageAI && EMBEDDING_DIMENSIONS) {
      requestParams.dimensions = EMBEDDING_DIMENSIONS;
    }

    const response = await openai.embeddings.create(requestParams);

    if (
      !response ||
      !response.data ||
      !response.data[0] ||
      !response.data[0].embedding
    ) {
      throw new Error("Invalid embedding response");
    }

    return response.data[0].embedding;
  } catch (error) {
    // Handle rate limit errors (429) with retry
    if (error.status === 429 && retryCount < maxRetries) {
      const delay = retryDelay * Math.pow(2, retryCount); // Exponential backoff
      console.warn(
        `Rate limit hit (429), retrying in ${delay}ms... (attempt ${
          retryCount + 1
        }/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return generateEmbedding(text, retryCount + 1);
    }

    // Provide more detailed error information
    if (error.status === 400) {
      console.error(
        `Error generating embedding: ${error.status} - ${
          error.message || "Bad Request"
        }`
      );
      console.error(`  Current configuration:`);
      console.error(`    Model: ${EMBEDDING_MODEL}`);
      console.error(`    Base URL: ${embeddingBaseURL}`);
      console.error(`    API Key: ${embeddingApiKey ? "Set" : "Not set"}`);
      console.error(`  This might mean:`);
      console.error(
        `  1. The embedding model "${EMBEDDING_MODEL}" is not available at ${embeddingBaseURL}`
      );
      console.error(
        `  2. The API key is invalid or doesn't have access to embeddings`
      );
      console.error(
        `  3. Voyage AI requires a different API format (use OpenAI embeddings instead)`
      );
      console.error(`  Solution:`);
      console.error(
        `    - For OpenAI: Set EMBEDDING_MODEL=text-embedding-3-small and EMBEDDING_API_BASE=https://api.openai.com/v1`
      );
      console.error(
        `    - For Voyage AI: Ensure you have a valid Voyage AI API key and correct endpoint`
      );
      console.error(
        `    - Recommended: Use OpenAI embeddings (text-embedding-3-small) for better compatibility`
      );
    } else if (error.status === 429) {
      console.error(
        `Rate limit exceeded (429) after ${
          retryCount + 1
        } attempts. This means:`
      );
      console.error(
        `  1. You're making too many embedding requests too quickly`
      );
      console.error(`  2. Your API key has hit its rate limit`);
      console.error(`  Solutions:`);
      console.error(`    - Wait a few minutes before trying again`);
      console.error(`    - Upgrade your API plan for higher rate limits`);
      console.error(
        `    - Switch to Hugging Face (free tier): Set EMBEDDING_PROVIDER=huggingface`
      );
      console.error(
        `    - Use OpenAI embeddings (text-embedding-3-small) which typically have higher rate limits`
      );
      console.error(
        `    - Consider disabling RAG temporarily if rate limits persist`
      );
    } else {
      console.error("Error generating embedding:", error.message);
    }
    throw error;
  }
}

/**
 * Store conversation context with embedding
 * Enhanced to extract and store additional metadata automatically
 */
async function storeContext(session_uid, content, content_type, metadata = {}) {
  try {
    if (!content || content.trim().length === 0) {
      return null;
    }

    // Extract additional metadata from content
    const enhancedMetadata = {
      ...metadata,
      // Extract topics for better retrieval
      topics: extractTopics(content),
      // Store content length for filtering
      content_length: content.length,
      // Store word count
      word_count: content.split(/\s+/).length,
    };

    // For long content, use chunking for better embedding quality
    const shouldChunk = content.length > 1000;

    if (shouldChunk) {
      // Store as chunks for better retrieval
      return await storeContextChunked(
        session_uid,
        content,
        content_type,
        enhancedMetadata
      );
    }

    // Generate embedding
    const embedding = await generateEmbedding(content);

    // Store in MongoDB
    const contextDoc = await ConversationContext.create({
      session_uid,
      content: content.trim(),
      content_type,
      embedding,
      metadata: enhancedMetadata,
    });

    return contextDoc;
  } catch (error) {
    console.error("Error storing context:", error.message);
    // Don't throw - RAG is optional, shouldn't break the main flow
    return null;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Expand query for better natural language understanding
 * Extracts key concepts, synonyms, and related terms
 */
function expandQuery(query) {
  if (!query || query.trim().length === 0) {
    return query;
  }

  // Extract key words (remove common stop words)
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "can",
    "this",
    "that",
    "these",
    "those",
    "i",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they",
    "what",
    "which",
    "who",
    "when",
    "where",
    "why",
    "how",
    "all",
    "each",
    "every",
    "some",
    "any",
  ]);

  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  // Add original query + key words for better matching
  const expanded = [query, ...words].join(" ");

  return expanded;
}

/**
 * Extract topics and entities from text for better context understanding
 */
function extractTopics(text) {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Extract potential topics (capitalized words, quoted phrases, etc.)
  const topics = [];

  // Extract quoted phrases
  const quoted = text.match(/"([^"]+)"/g) || [];
  topics.push(...quoted.map((q) => q.replace(/"/g, "")));

  // Extract capitalized words/phrases (potential proper nouns)
  const capitalized = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  topics.push(...capitalized);

  // Extract tool/MCP names (common patterns)
  const toolPatterns = [
    /(?:whatsapp|gmail|calendar|notion|google|slack|zomato)/gi,
    /(?:send|create|get|list|update|delete)\s+\w+/gi,
  ];
  toolPatterns.forEach((pattern) => {
    const matches = text.match(pattern) || [];
    topics.push(...matches);
  });

  return [...new Set(topics)].filter((t) => t.length > 2);
}

/**
 * Retrieve relevant context using MongoDB Vector Search OR in-memory similarity search
 * MongoDB Vector Search is OPTIONAL - falls back to in-memory similarity or text search
 * Enhanced with query expansion and better natural language understanding
 * Can filter by MCP name for MCP-specific context
 */
async function retrieveRelevantContext(
  session_uid,
  query,
  limit = 5,
  mcpName = null
) {
  try {
    if (!query || query.trim().length === 0) {
      return [];
    }

    // Expand query for better understanding
    const expandedQuery = expandQuery(query);
    const topics = extractTopics(query);

    // Generate embeddings for both original and expanded query
    const queryEmbedding = await generateEmbedding(query);
    const expandedEmbedding = await generateEmbedding(expandedQuery);

    // Try MongoDB Vector Search first (if index is available)
    const useVectorSearch = process.env.USE_MONGODB_VECTOR_SEARCH !== "false";

    if (useVectorSearch) {
      try {
        const indexName =
          process.env.VECTOR_SEARCH_INDEX_NAME || "vector_index";

        // Build match filter - include MCP filter if specified
        const matchFilter = { session_uid };
        if (mcpName) {
          matchFilter["metadata.mcp_name"] = mcpName;
        }

        const pipeline = [
          {
            $vectorSearch: {
              index: indexName,
              path: "embedding",
              queryVector: queryEmbedding,
              numCandidates: limit * 10,
              limit: limit * 2, // Get more candidates for filtering
            },
          },
          {
            $match: matchFilter, // Filter by session and optionally by MCP
          },
          {
            $project: {
              content: 1,
              content_type: 1,
              metadata: 1,
              created_at: 1,
              score: { $meta: "vectorSearchScore" },
            },
          },
          {
            $sort: { score: -1 },
          },
          {
            $limit: limit, // Limit final results
          },
        ];

        const results = await ConversationContext.aggregate(pipeline);

        if (results && results.length > 0) {
          return results.map((doc) => ({
            content: doc.content,
            content_type: doc.content_type,
            metadata: doc.metadata,
            score: doc.score,
            created_at: doc.created_at,
          }));
        }
      } catch (vectorSearchError) {
        // Vector search not available, fall through to in-memory search
        console.log(
          "MongoDB Vector Search not available, using in-memory similarity search"
        );
      }
    }

    // Fallback: MongoDB aggregation for cosine similarity (more efficient than in-memory)
    // OR in-memory similarity search if aggregation fails
    // Enhanced with query expansion, topic matching, and temporal relevance
    // Can filter by MCP name for MCP-specific context
    try {
      // Build match filter - include MCP filter if specified
      const matchFilter = { session_uid };

      // If MCP name is specified, filter by MCP name in metadata
      if (mcpName) {
        matchFilter["metadata.mcp_name"] = mcpName;
      }

      // Try MongoDB aggregation for cosine similarity (more efficient)
      try {
        const aggregationResults = await ConversationContext.aggregate([
          { $match: matchFilter },
          {
            $addFields: {
              similarity: {
                $divide: [
                  {
                    $reduce: {
                      input: {
                        $zip: {
                          inputs: ["$embedding", queryEmbedding],
                        },
                      },
                      initialValue: 0,
                      in: {
                        $add: [
                          "$$value",
                          {
                            $multiply: [
                              { $arrayElemAt: ["$$this", 0] },
                              { $arrayElemAt: ["$$this", 1] },
                            ],
                          },
                        ],
                      },
                    },
                  },
                  {
                    $sqrt: {
                      $multiply: [
                        {
                          $reduce: {
                            input: "$embedding",
                            initialValue: 0,
                            in: {
                              $add: [
                                "$$value",
                                { $multiply: ["$$this", "$$this"] },
                              ],
                            },
                          },
                        },
                        {
                          $reduce: {
                            input: queryEmbedding,
                            initialValue: 0,
                            in: {
                              $add: [
                                "$$value",
                                { $multiply: ["$$this", "$$this"] },
                              ],
                            },
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
          { $sort: { similarity: -1, created_at: -1 } },
          { $limit: limit * 2 }, // Get more candidates for filtering
        ]);

        if (aggregationResults && aggregationResults.length > 0) {
          // Apply enhanced scoring with topics, temporal relevance, etc.
          const enhancedResults = aggregationResults.map((doc) => {
            let similarity = doc.similarity || 0;

            // Boost score if topics match
            if (topics.length > 0 && doc.metadata?.topics) {
              const docTopics = Array.isArray(doc.metadata.topics)
                ? doc.metadata.topics
                : [];
              const topicMatches = topics.filter((topic) =>
                docTopics.some((dt) => dt.toLowerCase() === topic.toLowerCase())
              ).length;
              if (topicMatches > 0) {
                similarity += (topicMatches / topics.length) * 0.2;
              }
            }

            // Boost score for tool results if query mentions tools
            if (
              doc.content_type === "tool_result" &&
              (query.toLowerCase().includes("tool") ||
                query.toLowerCase().includes("result") ||
                query.toLowerCase().includes("action"))
            ) {
              similarity += 0.1;
            }

            // Boost score for recent conversations (temporal relevance)
            const daysAgo =
              (Date.now() - new Date(doc.created_at).getTime()) /
              (1000 * 60 * 60 * 24);
            if (daysAgo < 1) {
              similarity += 0.1; // Very recent (today)
            } else if (daysAgo < 7) {
              similarity += 0.05; // Recent (this week)
            }

            // Boost score if metadata matches (tool names, MCP names, etc.)
            if (doc.metadata) {
              const queryLower = query.toLowerCase();
              if (
                (doc.metadata.tool_name &&
                  queryLower.includes(doc.metadata.tool_name.toLowerCase())) ||
                (doc.metadata.mcp_name &&
                  queryLower.includes(doc.metadata.mcp_name.toLowerCase()))
              ) {
                similarity += 0.15;
              }
            }

            // Normalize score to 0-1 range
            similarity = Math.min(1.0, Math.max(0, similarity));

            return {
              content: doc.content,
              content_type: doc.content_type,
              metadata: doc.metadata,
              score: similarity,
              created_at: doc.created_at,
            };
          });

          // Filter and deduplicate
          const finalResults = [];
          const seenContent = new Set();

          for (const doc of enhancedResults) {
            if (doc.score < 0.1) continue; // Filter low-similarity results

            // Skip exact duplicates
            const contentHash = doc.content.substring(0, 100);
            if (seenContent.has(contentHash)) {
              continue;
            }
            seenContent.add(contentHash);

            finalResults.push(doc);
            if (finalResults.length >= limit) {
              break;
            }
          }

          if (finalResults.length > 0) {
            console.log(
              `✅ MongoDB aggregation found ${
                finalResults.length
              } relevant contexts (avg score: ${(
                finalResults.reduce((sum, d) => sum + d.score, 0) /
                finalResults.length
              ).toFixed(3)})`
            );
            return finalResults;
          }
        }
      } catch (aggregationError) {
        // If aggregation fails, fall through to in-memory search
        console.log(
          "MongoDB aggregation failed, using in-memory similarity search:",
          aggregationError.message
        );
      }

      // Fallback: In-memory similarity search
      // Build query filter - include MCP filter if specified
      const queryFilter = { session_uid };

      // If MCP name is specified, filter by MCP name in metadata
      if (mcpName) {
        queryFilter["metadata.mcp_name"] = mcpName;
      }

      // Get more contexts for better retrieval (increased from 100 to 200)
      const allContexts = await ConversationContext.find(queryFilter)
        .sort({ created_at: -1 })
        .limit(200) // Get recent 200 contexts for similarity search
        .lean();

      // Calculate similarity scores for all contexts with enhanced scoring
      const contextsWithScores = allContexts
        .map((doc) => {
          if (!doc.embedding || !Array.isArray(doc.embedding)) {
            return null;
          }

          // Base similarity score (original query)
          const baseSimilarity = cosineSimilarity(
            queryEmbedding,
            doc.embedding
          );

          // Expanded query similarity (boost for related concepts)
          const expandedSimilarity = cosineSimilarity(
            expandedEmbedding,
            doc.embedding
          );

          // Combine similarities (weight original query more)
          let similarity = baseSimilarity * 0.7 + expandedSimilarity * 0.3;

          // Boost score if topics match
          if (topics.length > 0) {
            const contentLower = (doc.content || "").toLowerCase();
            const topicMatches = topics.filter((topic) =>
              contentLower.includes(topic.toLowerCase())
            ).length;
            if (topicMatches > 0) {
              similarity += (topicMatches / topics.length) * 0.2; // Boost up to 0.2
            }
          }

          // Boost score for tool results if query mentions tools
          if (
            doc.content_type === "tool_result" &&
            (query.toLowerCase().includes("tool") ||
              query.toLowerCase().includes("result") ||
              query.toLowerCase().includes("action"))
          ) {
            similarity += 0.1;
          }

          // Boost score for recent conversations (temporal relevance)
          const daysAgo =
            (Date.now() - new Date(doc.created_at).getTime()) /
            (1000 * 60 * 60 * 24);
          if (daysAgo < 1) {
            similarity += 0.1; // Very recent (today)
          } else if (daysAgo < 7) {
            similarity += 0.05; // Recent (this week)
          }

          // Boost score if metadata matches (tool names, MCP names, etc.)
          if (doc.metadata) {
            const metadataStr = JSON.stringify(doc.metadata).toLowerCase();
            const queryLower = query.toLowerCase();

            // Strong boost if MCP name matches (for MCP-specific queries)
            if (mcpName && doc.metadata.mcp_name === mcpName) {
              similarity += 0.3; // Strong boost for MCP-specific context
            }

            if (
              (doc.metadata.tool_name &&
                queryLower.includes(doc.metadata.tool_name.toLowerCase())) ||
              (doc.metadata.mcp_name &&
                queryLower.includes(doc.metadata.mcp_name.toLowerCase()))
            ) {
              similarity += 0.15;
            }
          }

          // Normalize score to 0-1 range
          similarity = Math.min(1.0, Math.max(0, similarity));

          return {
            content: doc.content,
            content_type: doc.content_type,
            metadata: doc.metadata,
            score: similarity,
            created_at: doc.created_at,
          };
        })
        .filter((doc) => doc !== null && doc.score > 0.1) // Filter out low-similarity results (threshold increased)
        .sort((a, b) => b.score - a.score) // Sort by similarity (highest first)
        .slice(0, limit * 2); // Get more candidates for final filtering

      // Final filtering: ensure diversity and relevance
      const finalResults = [];
      const seenContent = new Set();

      for (const doc of contextsWithScores) {
        // Skip exact duplicates
        const contentHash = doc.content.substring(0, 100);
        if (seenContent.has(contentHash)) {
          continue;
        }
        seenContent.add(contentHash);

        finalResults.push(doc);
        if (finalResults.length >= limit) {
          break;
        }
      }

      if (finalResults.length > 0) {
        console.log(
          `✅ In-memory similarity search found ${
            finalResults.length
          } relevant contexts (avg score: ${(
            finalResults.reduce((sum, d) => sum + d.score, 0) /
            finalResults.length
          ).toFixed(3)})`
        );
        return finalResults;
      }
    } catch (similarityError) {
      console.warn(
        "In-memory similarity search failed:",
        similarityError.message
      );
    }

    // Final fallback: Simple text-based search (no embeddings needed)
    try {
      const queryRegex = new RegExp(query.split(/\s+/).join("|"), "i");
      const results = await ConversationContext.find({
        session_uid,
        content: { $regex: queryRegex },
      })
        .sort({ created_at: -1 })
        .limit(limit)
        .lean();

      return results.map((doc) => ({
        content: doc.content,
        content_type: doc.content_type,
        metadata: doc.metadata,
        score: 0.5, // Default score for text search
        created_at: doc.created_at,
      }));
    } catch (fallbackError) {
      console.error("All search methods failed:", fallbackError.message);
      return [];
    }
  } catch (error) {
    console.error("Error retrieving relevant context:", error.message);
    return [];
  }
}

/**
 * Store user message with embedding
 */
async function storeUserMessage(session_uid, message, metadata = {}) {
  return storeContext(session_uid, message, "user_message", metadata);
}

/**
 * Store assistant response with embedding
 */
async function storeAssistantResponse(session_uid, response, metadata = {}) {
  return storeContext(session_uid, response, "assistant_response", metadata);
}

/**
 * Store question-answer pair together
 * This helps RAG understand the relationship between questions and answers
 * @param {String} session_uid - Session UID
 * @param {String} question - User question
 * @param {String} answer - Assistant answer
 * @param {Object} metadata - Additional metadata
 */
async function storeQAPair(session_uid, question, answer, metadata = {}) {
  try {
    if (!question || !answer) {
      return null;
    }

    // Combine question and answer for better context
    const qaContent = `Question: ${question}\n\nAnswer: ${answer}`;

    // Store with special content type for Q&A pairs
    return await storeContext(session_uid, qaContent, "qa_pair", {
      question: question,
      answer: answer,
      question_length: question.length,
      answer_length: answer.length,
      ...metadata,
    });
  } catch (error) {
    console.error("Error storing Q&A pair:", error.message);
    return null;
  }
}

/**
 * Store tool result with embedding
 */
async function storeToolResult(
  session_uid,
  toolResult,
  toolName,
  mcpName,
  metadata = {}
) {
  const content =
    typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);

  return storeContext(session_uid, content, "tool_result", {
    tool_name: toolName,
    mcp_name: mcpName,
    ...metadata,
  });
}

/**
 * Build RAG context string from retrieved documents
 * Enhanced with better formatting and metadata information
 */
function buildRAGContext(retrievedDocs) {
  if (!retrievedDocs || retrievedDocs.length === 0) {
    return "";
  }

  const contextParts = retrievedDocs.map((doc, index) => {
    const typeLabel =
      {
        user_message: "User said",
        assistant_response: "Assistant responded",
        tool_result: "Tool result",
        conversation_summary: "Summary",
        qa_pair: "Q&A Pair",
        contact_info: "Contact Info",
      }[doc.content_type] || "Context";

    // Add metadata information if available
    let metadataInfo = "";
    if (doc.metadata) {
      const metadataParts = [];
      if (doc.metadata.tool_name) {
        metadataParts.push(`Tool: ${doc.metadata.tool_name}`);
      }
      if (doc.metadata.mcp_name) {
        metadataParts.push(`MCP: ${doc.metadata.mcp_name}`);
      }
      if (metadataParts.length > 0) {
        metadataInfo = ` (${metadataParts.join(", ")})`;
      }
    }

    // Add relevance score for debugging (optional)
    const scoreInfo = doc.score ? ` [relevance: ${doc.score.toFixed(2)}]` : "";

    // Format with better structure
    return `[${index + 1}] ${typeLabel}${metadataInfo}${scoreInfo}:\n${
      doc.content
    }`;
  });

  return `\n\n=== RELEVANT CONTEXT FROM PREVIOUS CONVERSATIONS ===\n${contextParts.join(
    "\n\n"
  )}\n\n=== END OF RELEVANT CONTEXT ===\n`;
}

/**
 * Chunk text for better embedding quality
 * Splits long text into smaller chunks for optimal retrieval
 */
function chunkText(text, maxChunkSize = 500, overlap = 50) {
  if (!text || text.length <= maxChunkSize) {
    return [text];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChunkSize;

    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start) {
        end = breakPoint + 1;
      }
    }

    chunks.push(text.substring(start, end).trim());
    start = end - overlap; // Overlap for context continuity
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

/**
 * Store long text as multiple chunks
 */
async function storeContextChunked(
  session_uid,
  content,
  content_type,
  metadata = {}
) {
  const chunks = chunkText(content);
  const storedDocs = [];

  for (const chunk of chunks) {
    const doc = await storeContext(session_uid, chunk, content_type, {
      ...metadata,
      chunk_index: storedDocs.length,
      total_chunks: chunks.length,
    });
    if (doc) storedDocs.push(doc);
  }

  return storedDocs;
}

/**
 * Extract and store all conversation history from database
 * This ensures we capture ALL available data for better RAG understanding
 * Call this periodically or on-demand to backfill RAG with existing data
 */
async function extractAndStoreAllHistory(session_uid, Message, ToolAction) {
  try {
    console.log(
      `📚 Extracting all conversation history for session ${session_uid}...`
    );

    // Get all messages from database
    const messages = await Message.find({ session_uid })
      .sort({ created_at: 1 }) // Chronological order
      .lean();

    let storedCount = 0;

    // Process messages in batches to avoid overwhelming the system
    for (const message of messages) {
      if (!message.text || message.text.trim().length === 0) {
        continue;
      }

      try {
        if (message.role === "user") {
          await storeUserMessage(session_uid, message.text, {
            provider: message.provider,
            model: message.model,
            message_id: message._id?.toString(),
            extracted_from_db: true,
          });
          storedCount++;
        } else if (message.role === "assistant") {
          await storeAssistantResponse(session_uid, message.text, {
            provider: message.provider,
            model: message.model,
            message_id: message._id?.toString(),
            extracted_from_db: true,
          });
          storedCount++;
        }
      } catch (err) {
        console.warn(`Failed to store message ${message._id}:`, err.message);
      }
    }

    // Get all tool actions from database
    if (ToolAction) {
      const toolActions = await ToolAction.find({ session_uid })
        .sort({ created_at: 1 })
        .lean();

      for (const action of toolActions) {
        if (!action.result_summary && !action.tool_result) {
          continue;
        }

        try {
          const toolResultText =
            action.result_summary ||
            (typeof action.tool_result === "string"
              ? action.tool_result
              : JSON.stringify(action.tool_result));

          await storeToolResult(
            session_uid,
            toolResultText,
            action.tool_name,
            action.mcp_name,
            {
              user_message: action.user_message || "",
              tool_args: action.tool_args || {},
              result_summary: action.result_summary,
              success: action.success,
              extracted_from_db: true,
            }
          );
          storedCount++;
        } catch (err) {
          console.warn(
            `Failed to store tool action ${action._id}:`,
            err.message
          );
        }
      }
    }

    console.log(
      `✅ Extracted and stored ${storedCount} context items from database history`
    );
    return storedCount;
  } catch (error) {
    console.error("Error extracting conversation history:", error.message);
    return 0;
  }
}

/**
 * List all RAG training data with optional filters
 * @param {Object} options - Filter options
 * @param {String} options.session_uid - Filter by session UID (optional)
 * @param {String} options.content_type - Filter by content type (user_message, assistant_response, tool_result, conversation_summary) (optional)
 * @param {String} options.mcp_name - Filter by MCP name (optional)
 * @param {String} options.tool_name - Filter by tool name (optional)
 * @param {Number} options.limit - Maximum number of results (default: 100)
 * @param {Number} options.skip - Number of results to skip (default: 0)
 * @param {String} options.sort - Sort order: 'newest' or 'oldest' (default: 'newest')
 * @returns {Promise<Array>} Array of RAG context documents
 */
async function listRAGData(options = {}) {
  try {
    const {
      session_uid,
      content_type,
      mcp_name,
      tool_name,
      limit = 100,
      skip = 0,
      sort = "newest",
    } = options;

    // Build query filter
    const queryFilter = {};
    if (session_uid) {
      queryFilter.session_uid = session_uid;
    }
    if (content_type) {
      queryFilter.content_type = content_type;
    }
    if (mcp_name) {
      queryFilter["metadata.mcp_name"] = mcp_name;
    }
    if (tool_name) {
      queryFilter["metadata.tool_name"] = tool_name;
    }

    // Build sort order
    const sortOrder = sort === "oldest" ? 1 : -1;

    // Query with pagination
    const results = await ConversationContext.find(queryFilter)
      .sort({ created_at: sortOrder })
      .limit(limit)
      .skip(skip)
      .lean() // Use lean() for better performance (returns plain JS objects)
      .exec();

    // Get total count
    const totalCount = await ConversationContext.countDocuments(queryFilter);

    // Format results (exclude embedding for readability, but include metadata)
    const formattedResults = results.map((doc) => ({
      id: doc._id.toString(),
      session_uid: doc.session_uid,
      content: doc.content,
      content_type: doc.content_type,
      metadata: doc.metadata || {},
      created_at: doc.created_at,
      embedding_dimensions: doc.embedding ? doc.embedding.length : 0,
      // Include embedding preview (first 5 values) for debugging
      embedding_preview: doc.embedding
        ? doc.embedding.slice(0, 5).map((v) => v.toFixed(4))
        : [],
    }));

    return {
      results: formattedResults,
      total: totalCount,
      limit,
      skip,
      hasMore: skip + results.length < totalCount,
    };
  } catch (error) {
    console.error("Error listing RAG data:", error.message);
    throw error;
  }
}

/**
 * Get RAG data statistics
 * @param {String} session_uid - Optional session UID to filter by
 * @returns {Promise<Object>} Statistics about RAG data
 */
async function getRAGStats(session_uid = null) {
  try {
    const queryFilter = session_uid ? { session_uid } : {};

    // Get counts by content type
    const countsByType = await ConversationContext.aggregate([
      { $match: queryFilter },
      {
        $group: {
          _id: "$content_type",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get counts by MCP
    const countsByMCP = await ConversationContext.aggregate([
      { $match: queryFilter },
      {
        $group: {
          _id: "$metadata.mcp_name",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Get total count
    const totalCount = await ConversationContext.countDocuments(queryFilter);

    // Get date range
    const dateRange = await ConversationContext.aggregate([
      { $match: queryFilter },
      {
        $group: {
          _id: null,
          oldest: { $min: "$created_at" },
          newest: { $max: "$created_at" },
        },
      },
    ]);

    return {
      total: totalCount,
      by_content_type: countsByType.reduce((acc, item) => {
        acc[item._id || "unknown"] = item.count;
        return acc;
      }, {}),
      by_mcp: countsByMCP
        .filter((item) => item._id) // Filter out null MCP names
        .reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      date_range: dateRange[0]
        ? {
            oldest: dateRange[0].oldest,
            newest: dateRange[0].newest,
          }
        : null,
    };
  } catch (error) {
    console.error("Error getting RAG stats:", error.message);
    throw error;
  }
}

/**
 * Normalize email address from spoken form
 * Examples:
 * - "nithishbaddula a gmail dot com" → "nithishbaddula@gmail.com"
 * - "john dot smith at gmail dot com" → "john.smith@gmail.com"
 * - "test at example dot com" → "test@example.com"
 */
function normalizeEmailFromSpoken(text) {
  if (!text) return null;

  // Convert to lowercase for processing
  let normalized = text.toLowerCase().trim();

  // Replace common spoken patterns
  // "a gmail dot com" → "@gmail.com"
  normalized = normalized.replace(/\s+a\s+gmail\s+dot\s+com\b/gi, "@gmail.com");
  // "at gmail dot com" → "@gmail.com"
  normalized = normalized.replace(
    /\s+at\s+gmail\s+dot\s+com\b/gi,
    "@gmail.com"
  );
  // "gmail dot com" → "@gmail.com" (if no @ present)
  if (!normalized.includes("@")) {
    normalized = normalized.replace(/\s+gmail\s+dot\s+com\b/gi, "@gmail.com");
  }

  // Replace "dot" with "." (but not if it's part of "dot com")
  normalized = normalized.replace(/\s+dot\s+/gi, ".");
  // Replace "at" with "@" (but not if it's part of "at gmail")
  normalized = normalized.replace(/\s+at\s+/gi, "@");

  // Clean up multiple spaces
  normalized = normalized.replace(/\s+/g, "");

  // Validate email format
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (emailRegex.test(normalized)) {
    return normalized;
  }

  return null;
}

/**
 * Normalize email address from various formats
 * Handles both written and spoken forms
 */
function normalizeEmail(email) {
  if (!email) return null;

  // If it's already a valid email, return as is
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (emailRegex.test(email.trim())) {
    return email.trim().toLowerCase();
  }

  // Try to normalize from spoken form
  const normalized = normalizeEmailFromSpoken(email);
  if (normalized) {
    return normalized;
  }

  return null;
}

/**
 * Extract contact information from text (email addresses, phone numbers, names)
 * Enhanced with email normalization and entity linking
 * @param {String} text - Text to extract contacts from
 * @param {Object} metadata - Additional metadata (tool_name, mcp_name, tool_args, etc.)
 * @returns {Object} Extracted contact information
 */
function extractContacts(text, metadata = {}) {
  const contacts = {
    emails: [],
    phones: [],
    names: [],
    mappings: {}, // name -> {email, phone}
    normalized_emails: [], // Normalized email addresses
  };

  if (!text) return contacts;

  // Extract email addresses (standard format)
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const emails = text.match(emailRegex) || [];
  contacts.emails = [
    ...new Set(emails.map((e) => normalizeEmail(e)).filter(Boolean)),
  ];

  // Extract email addresses from spoken form
  // Pattern: "mail to nithishbaddula a gmail dot com"
  const spokenEmailPatterns = [
    /\b([a-zA-Z0-9._%+-]+)\s+(?:a|at)\s+(?:gmail|yahoo|outlook|hotmail)\s+dot\s+com\b/gi,
    /\b([a-zA-Z0-9._%+-]+)\s+dot\s+([a-zA-Z0-9._%+-]+)\s+(?:a|at)\s+(?:gmail|yahoo|outlook|hotmail)\s+dot\s+com\b/gi,
    /\bmail\s+to\s+([a-zA-Z0-9._%+-]+)\s+(?:a|at)\s+(?:gmail|yahoo|outlook|hotmail)\s+dot\s+com\b/gi,
  ];

  for (const pattern of spokenEmailPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let emailPart = match[1];
      // If there's a second part (like "john dot smith"), combine them
      if (match[2]) {
        emailPart = `${match[1]}.${match[2]}`;
      }
      // Extract domain from pattern
      const domainMatch = text
        .substring(match.index)
        .match(/(?:gmail|yahoo|outlook|hotmail)\s+dot\s+com/gi);
      if (domainMatch) {
        const domain = domainMatch[0]
          .replace(/\s+dot\s+/gi, ".")
          .replace(/\s+/g, "");
        const fullEmail = `${emailPart}@${domain}`;
        const normalized = normalizeEmail(fullEmail);
        if (normalized) {
          contacts.emails.push(normalized);
        }
      }
    }
  }

  // Also try to extract from the full text as spoken email
  const spokenEmail = normalizeEmailFromSpoken(text);
  if (spokenEmail && !contacts.emails.includes(spokenEmail)) {
    contacts.emails.push(spokenEmail);
  }

  // Remove duplicates and normalize all emails
  contacts.emails = [
    ...new Set(contacts.emails.map((e) => normalizeEmail(e)).filter(Boolean)),
  ];
  contacts.normalized_emails = contacts.emails;

  // Extract phone numbers (various formats)
  const phoneRegex =
    /(\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;
  const phones = text.match(phoneRegex) || [];
  // Clean and normalize phone numbers
  contacts.phones = [
    ...new Set(
      phones
        .map((p) => p.replace(/[-.\s()]/g, ""))
        .filter((p) => p.length >= 10)
    ),
  ];

  // Extract names from common patterns
  // Pattern 1: "From: Name <email>"
  const fromPattern = /From:\s*([^<]+?)\s*<([^>]+)>/gi;
  let match;
  while ((match = fromPattern.exec(text)) !== null) {
    const name = match[1].trim();
    const email = match[2].trim();
    if (name && email) {
      contacts.names.push(name);
      if (!contacts.mappings[name]) {
        contacts.mappings[name] = {};
      }
      contacts.mappings[name].email = email;
    }
  }

  // Pattern 2: "To: Name <email>"
  const toPattern = /To:\s*([^<]+?)\s*<([^>]+)>/gi;
  while ((match = toPattern.exec(text)) !== null) {
    const name = match[1].trim();
    const email = match[2].trim();
    if (name && email) {
      contacts.names.push(name);
      if (!contacts.mappings[name]) {
        contacts.mappings[name] = {};
      }
      contacts.mappings[name].email = email;
    }
  }

  // Pattern 3: "recipient: 918074914825" or "recipient: phone"
  const recipientPattern = /recipient[:\s]+([0-9+]+)/gi;
  while ((match = recipientPattern.exec(text)) !== null) {
    const phone = match[1].replace(/[-.\s()]/g, "");
    if (phone.length >= 10) {
      contacts.phones.push(phone);
    }
  }

  // Pattern 4: Extract names from tool arguments
  if (metadata.tool_args) {
    const args = metadata.tool_args;
    // Check for recipient, to, from fields
    if (args.recipient && typeof args.recipient === "string") {
      const recipient = args.recipient;
      // Check if it's a phone number
      if (/^\d{10,}$/.test(recipient.replace(/[^0-9]/g, ""))) {
        contacts.phones.push(recipient.replace(/[^0-9]/g, ""));
      }
      // Check if it's an email (normalize it)
      else {
        const normalized = normalizeEmail(recipient);
        if (normalized) {
          contacts.emails.push(normalized);
        }
      }
    }
    if (args.to && typeof args.to === "string") {
      const normalized = normalizeEmail(args.to);
      if (normalized) {
        contacts.emails.push(normalized);
      }
    }
    if (args.from && typeof args.from === "string") {
      const normalized = normalizeEmail(args.from);
      if (normalized) {
        contacts.emails.push(normalized);
      }
    }
  }

  // Remove duplicates and normalize all emails
  contacts.names = [...new Set(contacts.names)];
  contacts.emails = [
    ...new Set(contacts.emails.map((e) => normalizeEmail(e)).filter(Boolean)),
  ];
  contacts.phones = [...new Set(contacts.phones)];
  contacts.normalized_emails = contacts.emails;

  return contacts;
}

/**
 * Store contact information in RAG with entity linking
 * Links different representations of the same contact
 * @param {String} session_uid - Session UID
 * @param {String} name - Contact name
 * @param {String} email - Email address (optional)
 * @param {String} phone - Phone number (optional)
 * @param {String} mcp_name - MCP name (whatsapp, gmail, etc.)
 * @param {Object} metadata - Additional metadata
 */
async function storeContact(
  session_uid,
  name,
  email = null,
  phone = null,
  mcp_name = null,
  metadata = {}
) {
  try {
    // Normalize email if provided
    const normalizedEmail = email ? normalizeEmail(email) : null;

    // Check if we already have this contact stored (entity linking)
    // Search for existing contacts with the same normalized email or phone
    let existingContact = null;
    if (normalizedEmail) {
      try {
        const results = await ConversationContext.find({
          session_uid,
          content_type: "contact_info",
          $or: [
            { "metadata.contact_email": normalizedEmail },
            { content: { $regex: normalizedEmail, $options: "i" } },
          ],
        })
          .sort({ created_at: -1 })
          .limit(1)
          .lean();

        if (results.length > 0) {
          existingContact = results[0];
          console.log(
            `🔗 Entity Linking: Found existing contact with email ${normalizedEmail}`
          );
        }
      } catch (searchErr) {
        // Continue if search fails
      }
    }

    // If we found an existing contact, merge the information
    if (existingContact) {
      const existingEmail = existingContact.metadata?.contact_email;
      const existingPhone = existingContact.metadata?.contact_phone;
      const existingName = existingContact.metadata?.contact_name || name;

      // Merge emails (use normalized version)
      const mergedEmail = normalizedEmail || existingEmail;
      // Merge phones
      const mergedPhone = phone || existingPhone;
      // Merge names (prefer the one we have more info for)
      const mergedName = name || existingName;

      // Build updated contact description
      const contactParts = [`Contact: ${mergedName}`];
      if (mergedEmail) contactParts.push(`Email: ${mergedEmail}`);
      if (mergedPhone) contactParts.push(`Phone: ${mergedPhone}`);
      if (mcp_name) contactParts.push(`MCP: ${mcp_name}`);

      const contactText = contactParts.join(", ");

      // Update existing contact or create new one with merged info
      return await storeContext(session_uid, contactText, "contact_info", {
        contact_name: mergedName,
        contact_email: mergedEmail,
        contact_phone: mergedPhone,
        mcp_name: mcp_name || existingContact.metadata?.mcp_name,
        linked_from: existingContact._id?.toString(),
        ...metadata,
      });
    }

    // New contact - store it
    if (!name && !normalizedEmail && !phone) {
      return null; // Need at least name or one contact method
    }

    // Build contact description
    const contactParts = [];
    if (name) contactParts.push(`Contact: ${name}`);
    if (normalizedEmail) contactParts.push(`Email: ${normalizedEmail}`);
    if (phone) contactParts.push(`Phone: ${phone}`);
    if (mcp_name) contactParts.push(`MCP: ${mcp_name}`);

    const contactText = contactParts.join(", ");

    // Store with special content type for contacts
    return await storeContext(session_uid, contactText, "contact_info", {
      contact_name: name,
      contact_email: normalizedEmail,
      contact_phone: phone,
      mcp_name: mcp_name,
      ...metadata,
    });
  } catch (error) {
    console.error("Error storing contact:", error.message);
    return null;
  }
}

/**
 * Retrieve contact information by name
 * @param {String} session_uid - Session UID
 * @param {String} name - Contact name to search for
 * @returns {Promise<Object|null>} Contact information or null
 */
async function getContactByName(session_uid, name) {
  try {
    if (!name || !session_uid) return null;

    // Search for contact info in RAG
    const results = await retrieveRelevantContext(
      session_uid,
      name,
      5,
      null // No MCP filter - search all
    );

    // Look for contact_info type or tool results with contact info
    for (const doc of results) {
      // Check if it's a contact_info type
      if (doc.content_type === "contact_info") {
        // Parse contact info
        const emailMatch = doc.content.match(/Email:\s*([^\s,]+)/);
        const phoneMatch = doc.content.match(/Phone:\s*([^\s,]+)/);
        const nameMatch = doc.content.match(/Contact:\s*([^\s,]+)/);

        if (nameMatch && nameMatch[1].toLowerCase() === name.toLowerCase()) {
          return {
            name: nameMatch[1],
            email: emailMatch ? emailMatch[1] : null,
            phone: phoneMatch ? phoneMatch[1] : null,
            mcp_name: doc.metadata?.mcp_name || null,
            metadata: doc.metadata || {},
          };
        }
      }

      // Check if tool result contains contact info
      if (doc.content_type === "tool_result") {
        const contacts = extractContacts(doc.content, doc.metadata || {});
        if (contacts.mappings[name]) {
          return {
            name: name,
            email: contacts.mappings[name].email || null,
            phone: contacts.mappings[name].phone || null,
            mcp_name: doc.metadata?.mcp_name || null,
            metadata: doc.metadata || {},
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error retrieving contact:", error.message);
    return null;
  }
}

/**
 * Extract and store contacts from tool result
 * This is called automatically when storing tool results
 */
async function extractAndStoreContacts(
  session_uid,
  toolResult,
  toolName,
  mcpName,
  metadata = {}
) {
  try {
    const resultText =
      typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);

    // Extract contacts from tool result
    const contacts = extractContacts(resultText, {
      tool_name: toolName,
      mcp_name: mcpName,
      ...metadata,
    });

    console.log(
      `📇 Contact Extraction (${mcpName}/${toolName}): Found ${contacts.emails.length} emails, ${contacts.phones.length} phones, ${contacts.names.length} names`
    );

    // Store individual contacts
    let storedCount = 0;
    for (const [name, info] of Object.entries(contacts.mappings)) {
      if (name && (info.email || info.phone)) {
        await storeContact(
          session_uid,
          name,
          info.email || null,
          info.phone || null,
          mcpName,
          {
            source: "tool_result",
            tool_name: toolName,
            extracted_at: new Date().toISOString(),
          }
        );
        storedCount++;
        console.log(
          `✅ Stored contact: ${name} -> ${
            info.email || info.phone || "N/A"
          } (${mcpName})`
        );
      }
    }

    // Also store contacts from tool arguments (e.g., recipient, to, from)
    if (metadata.tool_args) {
      const args = metadata.tool_args;
      // Extract name from user message if available
      const userMessage = metadata.user_message || "";
      const nameMatch = userMessage.match(/\b(nithish|nitish|nithi)\b/i);
      const extractedName = nameMatch ? nameMatch[1] : null;

      if (args.recipient) {
        const recipient = args.recipient;
        // Check if it's a phone number
        if (/^\d{10,}$/.test(recipient.replace(/[^0-9]/g, ""))) {
          const phone = recipient.replace(/[^0-9]/g, "");
          if (extractedName) {
            await storeContact(
              session_uid,
              extractedName,
              null,
              phone,
              mcpName,
              {
                source: "tool_args",
                tool_name: toolName,
                extracted_at: new Date().toISOString(),
              }
            );
            storedCount++;
            console.log(
              `✅ Stored contact from tool args: ${extractedName} -> ${phone} (${mcpName})`
            );
          }
        }
        // Check if it's an email
        else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
          if (extractedName) {
            await storeContact(
              session_uid,
              extractedName,
              recipient,
              null,
              mcpName,
              {
                source: "tool_args",
                tool_name: toolName,
                extracted_at: new Date().toISOString(),
              }
            );
            storedCount++;
            console.log(
              `✅ Stored contact from tool args: ${extractedName} -> ${recipient} (${mcpName})`
            );
          }
        }
      }

      if (args.to && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.to)) {
        if (extractedName) {
          await storeContact(
            session_uid,
            extractedName,
            args.to,
            null,
            mcpName,
            {
              source: "tool_args",
              tool_name: toolName,
              extracted_at: new Date().toISOString(),
            }
          );
          storedCount++;
          console.log(
            `✅ Stored contact from tool args: ${extractedName} -> ${args.to} (${mcpName})`
          );
        }
      }
    }

    if (storedCount > 0) {
      console.log(
        `📚 RAG Training: Stored ${storedCount} contact(s) from ${mcpName}/${toolName}`
      );
    }

    return contacts;
  } catch (error) {
    console.error("Error extracting and storing contacts:", error.message);
    return null;
  }
}

module.exports = {
  generateEmbedding,
  storeContext,
  retrieveRelevantContext,
  storeUserMessage,
  storeAssistantResponse,
  storeToolResult,
  buildRAGContext,
  chunkText,
  storeContextChunked,
  extractAndStoreAllHistory, // New function to extract all history
  listRAGData, // New function to list RAG training data
  getRAGStats, // New function to get RAG statistics
  extractContacts, // New function to extract contacts
  storeContact, // New function to store contact
  getContactByName, // New function to get contact by name
  extractAndStoreContacts, // New function to extract and store contacts from tool results
  storeQAPair, // New function to store question-answer pairs
  ConversationContext, // Export model for direct access if needed
};
