# RAG (Retrieval-Augmented Generation) Setup Guide

This guide explains how to set up MongoDB Vector Search for RAG functionality in the OMI system.

## Overview

RAG (Retrieval-Augmented Generation) enhances the AI's understanding by:

1. **Storing** conversation context, user messages, assistant responses, and tool results as vector embeddings in MongoDB
2. **Retrieving** semantically similar context when processing new queries
3. **Augmenting** the AI's response with relevant historical context

## Prerequisites

1. **MongoDB Atlas Account**: You need a MongoDB Atlas cluster (free tier works)
2. **OpenAI API Key** (or Voyage AI API key): For generating embeddings
3. **MongoDB Connection String**: Already configured in your `.env` file

## Step 1: Configure Environment Variables

Add these to your `.env` file:

### Option A: Using OpenAI Directly (Recommended)

**Important**: FastRouter may not support embeddings API. Use OpenAI directly for embeddings:

```env
# Embedding Model Configuration (using OpenAI directly)
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
EMBEDDING_API_KEY=your_openai_api_key  # Your OpenAI API key (not FastRouter)
EMBEDDING_API_BASE=https://api.openai.com/v1

# Vector Search Index Name (optional, defaults to "vector_index")
VECTOR_SEARCH_INDEX_NAME=vector_index
```

**Or if you have `OPENAI_API_KEY` set**, the code will automatically use it:

```env
# Minimal configuration - just set these if you already have OPENAI_API_KEY
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
EMBEDDING_API_BASE=https://api.openai.com/v1
# EMBEDDING_API_KEY will automatically use OPENAI_API_KEY if not set
```

### Option B: Using FastRouter (If Supported)

**Note**: FastRouter may not support embeddings API. If you want to try FastRouter:

```env
# Embedding Model Configuration (using FastRouter - may not work)
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
EMBEDDING_API_KEY=your_fastrouter_api_key
EMBEDDING_API_BASE=https://go.fastrouter.ai/api/v1

# Vector Search Index Name (optional, defaults to "vector_index")
VECTOR_SEARCH_INDEX_NAME=vector_index
```

**If you get 400 errors**, FastRouter doesn't support embeddings - use Option A (OpenAI directly) instead.

### Option C: Using Voyage AI

For better embedding quality, you can use Voyage AI:

```env
# Embedding Model Configuration (using Voyage AI)
EMBEDDING_MODEL=voyage-large-2
EMBEDDING_DIMENSIONS=1024
EMBEDDING_API_KEY=your_voyage_api_key
EMBEDDING_API_BASE=https://api.voyageai.com/v1

# Vector Search Index Name (optional, defaults to "vector_index")
VECTOR_SEARCH_INDEX_NAME=vector_index
```

**Note**: The RAG service automatically falls back to `OPENAI_API_KEY` if `EMBEDDING_API_KEY` is not set. **FastRouter may not support embeddings**, so it's recommended to use OpenAI directly for embeddings.

## Step 2: Create Vector Search Index in MongoDB Atlas

You need to create a vector search index in MongoDB Atlas. Follow these steps:

### Option A: Using MongoDB Atlas UI

1. **Log in to MongoDB Atlas**: Go to [https://cloud.mongodb.com](https://cloud.mongodb.com)

2. **Navigate to your cluster**: Select your cluster and database

3. **Go to Search tab**: Click on "Search" in the left sidebar

4. **Create Search Index**:
   - Click "Create Search Index"
   - Select "JSON Editor"
   - Paste the following index definition:

```json
{
  "mappings": {
    "dynamic": true,
    "fields": {
      "embedding": {
        "type": "knnVector",
        "dimensions": 1536,
        "similarity": "cosine"
      }
    }
  }
}
```

**Important**:

- Change `dimensions` to match your embedding model:
  - `1536` for `text-embedding-3-small` (OpenAI)
  - `1024` for `voyage-large-2` (Voyage AI)
- The `similarity` can be `cosine`, `euclidean`, or `dotProduct` (cosine is recommended)

5. **Configure Index**:

   - **Database**: Select your database (e.g., "omi")
   - **Collection**: Select "conversationcontexts" (the collection name will be automatically created)
   - **Index Name**: `vector_index` (or match `VECTOR_SEARCH_INDEX_NAME` in your `.env`)

6. **Create Index**: Click "Create Search Index" and wait for it to build (may take a few minutes)

### Option B: Using MongoDB Shell

You can also create the index using MongoDB shell or Compass:

```javascript
use omi  // Your database name

db.conversationcontexts.createSearchIndex({
  "name": "vector_index",
  "definition": {
    "mappings": {
      "dynamic": true,
      "fields": {
        "embedding": {
          "type": "knnVector",
          "dimensions": 1536,
          "similarity": "cosine"
        }
      }
    }
  }
})
```

## Step 3: Verify Setup

1. **Check Index Status**: In MongoDB Atlas, go to Search → Your Index → Check status (should be "Active")

2. **Test RAG Service**: The RAG service will automatically:
   - Store embeddings when messages are sent/received
   - Retrieve relevant context when processing queries
   - Fall back to text search if vector search is not available

## How It Works

### 1. **Ingestion** (Automatic)

When a user sends a message or a tool is executed:

- The text content is converted to a vector embedding
- The embedding is stored in MongoDB along with metadata

### 2. **Retrieval** (Automatic)

When processing a new query:

- The query is converted to a vector embedding
- MongoDB Vector Search finds the most similar documents
- Top 5 most relevant contexts are retrieved and added to the AI's context

### 3. **Generation** (Automatic)

The AI uses the retrieved context along with the current conversation to generate more accurate responses.

## Troubleshooting

### Issue: "Vector search not available, falling back to text search"

**Cause**: The vector search index hasn't been created or isn't active yet.

**Solution**:

1. Check that the index exists in MongoDB Atlas
2. Verify the index name matches `VECTOR_SEARCH_INDEX_NAME` in your `.env`
3. Wait for the index to finish building (check status in Atlas UI)

### Issue: "Invalid embedding response"

**Cause**: API key is missing or incorrect, or the embedding model is not accessible.

**Solution**:

1. **If using FastRouter** (may not be supported):

   - **Important**: FastRouter may not support embeddings API. If you get 400 errors, use OpenAI directly instead.
   - Verify `EMBEDDING_API_KEY` is set correctly
   - Check that `EMBEDDING_API_BASE` is set to `https://go.fastrouter.ai/api/v1`
   - If you get 400 errors, FastRouter doesn't support embeddings - use OpenAI directly

2. **If using OpenAI directly**:

   - Verify `EMBEDDING_API_KEY` is set correctly
   - Check that `EMBEDDING_API_BASE` is set to `https://api.openai.com/v1`
   - Ensure your OpenAI API key has credits/quota available

3. **If using Voyage AI**:
   - Verify `EMBEDDING_API_KEY` is set to your Voyage AI key
   - Check that `EMBEDDING_API_BASE` is set to `https://api.voyageai.com/v1`
   - Ensure your Voyage AI API key is valid

### Issue: Embeddings are not being stored

**Cause**: RAG storage is non-blocking and errors are logged but don't break the main flow.

**Solution**:

1. Check server logs for "Failed to store" warnings
2. Verify MongoDB connection is working
3. Check that the `conversationcontexts` collection exists

## Performance Considerations

- **Embedding Generation**: Adds ~100-500ms per message (non-blocking)
- **Vector Search**: Adds ~50-200ms per query (non-blocking)
- **Storage**: Minimal impact (async operations)

## Advanced Configuration

### Using OpenAI Directly for Embeddings (Recommended)

**Important**: FastRouter may not support embeddings API. Use OpenAI directly for embeddings:

1. **If you already have `OPENAI_API_KEY` set**, you can simply add:

   ```env
   EMBEDDING_MODEL=text-embedding-3-small
   EMBEDDING_DIMENSIONS=1536
   EMBEDDING_API_BASE=https://api.openai.com/v1
   # EMBEDDING_API_KEY will automatically use OPENAI_API_KEY
   ```

2. **Or set it explicitly**:

   ```env
   EMBEDDING_MODEL=text-embedding-3-small
   EMBEDDING_DIMENSIONS=1536
   EMBEDDING_API_KEY=your_openai_api_key  # Your OpenAI API key
   EMBEDDING_API_BASE=https://api.openai.com/v1
   ```

**Why use OpenAI directly**:

- FastRouter may not support embeddings API (you'll get 400 errors)
- OpenAI embeddings API is reliable and well-documented
- Direct access to OpenAI's embedding models

### Using Voyage AI Embeddings

Voyage AI often provides better embeddings for RAG. To use Voyage AI:

1. Get a Voyage AI API key
2. Update `.env`:

   ```env
   EMBEDDING_MODEL=voyage-large-2
   EMBEDDING_DIMENSIONS=1024
   EMBEDDING_API_KEY=your_voyage_api_key
   EMBEDDING_API_BASE=https://api.voyageai.com/v1
   ```

3. Update the vector search index dimensions to `1024`

### Custom Chunking

For long documents, the RAG service automatically chunks text. You can customize chunking in `rag-service.js`:

```javascript
function chunkText(text, maxChunkSize = 500, overlap = 50) {
  // Customize chunk size and overlap
}
```

## References

- [MongoDB Vector Search Documentation](https://www.mongodb.com/docs/atlas/atlas-vector-search/)
- [MongoDB RAG Tutorial](https://www.mongodb.com/docs/atlas/atlas-vector-search/rag/)
- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)
- [Voyage AI Embeddings](https://www.voyageai.com/)
