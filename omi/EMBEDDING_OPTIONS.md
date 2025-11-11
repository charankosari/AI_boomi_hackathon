# Embedding Provider Options

This document explains the different embedding providers you can use for RAG functionality.

## Available Providers

### 1. OpenAI Embeddings (Default)

**Pros:**

- High quality embeddings
- Well-documented API
- Good rate limits (depending on plan)

**Cons:**

- Requires API key
- Costs money (but very affordable)

**Configuration:**

```env
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
EMBEDDING_API_KEY=your_openai_api_key
EMBEDDING_API_BASE=https://api.openai.com/v1
```

**Or if you have OPENAI_API_KEY set:**

```env
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
EMBEDDING_API_BASE=https://api.openai.com/v1
# EMBEDDING_API_KEY will automatically use OPENAI_API_KEY
```

---

### 2. Hugging Face Inference API (Recommended for Free Tier)

**Pros:**

- **FREE tier available** (no API key required for public models)
- No rate limits on free tier (reasonable usage)
- Open source models
- Good quality embeddings

**Cons:**

- Smaller embedding dimensions (384 for all-MiniLM-L6-v2)
- Slightly lower quality than OpenAI (but still very good)

**Configuration:**

```env
EMBEDDING_PROVIDER=huggingface
HUGGINGFACE_MODEL=sentence-transformers/all-MiniLM-L6-v2
# HUGGINGFACE_API_KEY is optional (free tier works without it)
```

**Popular Free Models for RAG:**

1. **`sentence-transformers/all-MiniLM-L6-v2`** (Default)

   - 384 dimensions
   - Fast, good quality
   - Best for: General purpose RAG, fast retrieval
   - Recommended for most use cases

2. **`sentence-transformers/all-mpnet-base-v2`**

   - 768 dimensions
   - Better quality, slightly slower
   - Best for: High-quality semantic search
   - Recommended for: Production RAG systems

3. **`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`**

   - 384 dimensions
   - Multilingual support
   - Best for: Multi-language RAG applications

4. **`sentence-transformers/all-MiniLM-L12-v2`**

   - 384 dimensions
   - Better quality than L6, still fast
   - Best for: Balanced quality and speed

5. **`BAAI/bge-small-en-v1.5`**

   - 384 dimensions
   - State-of-the-art for retrieval
   - Best for: High-quality retrieval tasks

6. **`intfloat/e5-small-v2`**
   - 384 dimensions
   - Excellent for semantic search
   - Best for: Document retrieval

**Note:** All these models work great for RAG! Choose based on your needs:

- **Speed priority**: Use `all-MiniLM-L6-v2` (default)
- **Quality priority**: Use `all-mpnet-base-v2` or `bge-small-en-v1.5`
- **Multilingual**: Use `paraphrase-multilingual-MiniLM-L12-v2`

**Note:**

- Update your MongoDB Vector Search index dimensions to match the model:
  - Most models: `384` dimensions
  - `all-mpnet-base-v2`: `768` dimensions
- You can use **any** Hugging Face embedding model that supports feature extraction
- All sentence-transformers models work perfectly for RAG architecture

---

### 3. Voyage AI (If you have API key)

**Pros:**

- High quality embeddings
- Good for specific use cases

**Cons:**

- Requires API key
- Rate limits can be strict
- May have compatibility issues

**Configuration:**

```env
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=voyage-large-2
EMBEDDING_DIMENSIONS=1024
EMBEDDING_API_KEY=your_voyage_api_key
EMBEDDING_API_BASE=https://api.voyageai.com/v1
```

---

## Quick Setup Guide

### Option 1: Hugging Face (Free, Recommended)

1. Add to `.env`:

```env
EMBEDDING_PROVIDER=huggingface
HUGGINGFACE_MODEL=sentence-transformers/all-MiniLM-L6-v2
```

2. Update MongoDB Vector Search index dimensions to `384` (for all-MiniLM-L6-v2)

3. Restart your server

### Option 2: OpenAI (Paid, Best Quality)

1. Add to `.env`:

```env
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
EMBEDDING_API_KEY=your_openai_api_key
EMBEDDING_API_BASE=https://api.openai.com/v1
```

2. Keep MongoDB Vector Search index dimensions at `1536`

3. Restart your server

---

## Comparison

| Provider     | Cost | Quality   | Rate Limits | Dimensions | Setup  |
| ------------ | ---- | --------- | ----------- | ---------- | ------ |
| Hugging Face | Free | Good      | Generous    | 384-768    | Easy   |
| OpenAI       | Paid | Excellent | Good        | 1536       | Easy   |
| Voyage AI    | Paid | Excellent | Strict      | 1024       | Medium |

---

## Troubleshooting

### Issue: Rate limit errors (429)

**Solution:** Switch to Hugging Face (free tier has generous limits)

```env
EMBEDDING_PROVIDER=huggingface
```

### Issue: Dimension mismatch

**Solution:** Update your MongoDB Vector Search index dimensions to match your model:

- Hugging Face all-MiniLM-L6-v2: `384`
- OpenAI text-embedding-3-small: `1536`
- Voyage AI voyage-large-2: `1024`

### Issue: API key errors

**Solution:** For Hugging Face, you don't need an API key for public models. Just set:

```env
EMBEDDING_PROVIDER=huggingface
```

---

## References

- [Hugging Face Inference API](https://huggingface.co/docs/api-inference/index)
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [Sentence Transformers Models](https://www.sbert.net/docs/pretrained_models.html)
