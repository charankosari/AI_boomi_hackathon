require("dotenv").config();
const mongoose = require("mongoose");
const OpenAI = require("openai");

// --- Configuration ---
// Change this to 'local' in your .env to use your RTX 4050/CPU
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || "local";
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIMENSIONS = 384; // MiniLM-L6-v2 is always 384

// MongoDB Schema setup
const contextSchema = new mongoose.Schema({
  text: { type: String, required: true },
  embedding: { type: [Number], required: true },
  metadata: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

const Context = mongoose.model("Context", contextSchema);

// Initialize OpenAI client (only if using OpenAI embeddings)
let openai = null;
if (EMBEDDING_PROVIDER === "openai") {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// --- Local Embedding Setup (@xenova/transformers) ---
let localPipeline = null;

async function getLocalPipeline() {
  if (!localPipeline) {
    console.log(`⏳ Loading local model '${EMBEDDING_MODEL}'...`);
    // Dynamic import for @xenova/transformers
    const { pipeline } = await import("@xenova/transformers");
    // 'feature-extraction' is the task for creating embeddings
    localPipeline = await pipeline("feature-extraction", EMBEDDING_MODEL);
    console.log("✅ Local model loaded successfully!");
  }
  return localPipeline;
}

async function generateEmbeddingLocal(text) {
  try {
    const pipe = await getLocalPipeline();
    const output = await pipe(text, {
      pooling: "mean", // standard for sentence-transformers
      normalize: true, // important for cosine similarity
    });

    // Convert Tensor to standard JS array
    return Array.from(output.data);
  } catch (error) {
    console.error("Local embedding error:", error);
    throw error;
  }
}

// --- Main Embedding Router ---
async function generateEmbedding(text) {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Invalid text for embedding");
  }

  // ROUTE TO PROVIDER
  if (EMBEDDING_PROVIDER === "local" || EMBEDDING_PROVIDER === "huggingface") {
    return await generateEmbeddingLocal(text);
  } else if (EMBEDDING_PROVIDER === "openai") {
    if (!openai) {
      throw new Error("OpenAI API key is required for OpenAI embeddings");
    }
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });
    return response.data[0].embedding;
  }
  throw new Error(`Unknown embedding provider: ${EMBEDDING_PROVIDER}`);
}

// Store context with its embedding
async function storeContext(text, metadata = {}) {
  const embedding = await generateEmbedding(text);
  const context = new Context({
    text,
    embedding,
    metadata,
  });
  return await context.save();
}

// Retrieve relevant context using cosine similarity
async function retrieveRelevantContext(query, limit = 5) {
  const queryEmbedding = await generateEmbedding(query);

  // Compute cosine similarity using MongoDB's $expr and $reduce
  const results = await Context.aggregate([
    {
      $addFields: {
        similarity: {
          $divide: [
            {
              $reduce: {
                input: { $zip: { inputs: ["$embedding", queryEmbedding] } },
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
                        $add: ["$$value", { $multiply: ["$$this", "$$this"] }],
                      },
                    },
                  },
                  {
                    $reduce: {
                      input: queryEmbedding,
                      initialValue: 0,
                      in: {
                        $add: ["$$value", { $multiply: ["$$this", "$$this"] }],
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
    { $sort: { similarity: -1 } },
    { $limit: limit },
  ]);

  return results;
}

// Connect to MongoDB
async function connectToMongo() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/rag-service"
    );
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

// Export functions
module.exports = {
  generateEmbedding,
  storeContext,
  retrieveRelevantContext,
  connectToMongo,
};
