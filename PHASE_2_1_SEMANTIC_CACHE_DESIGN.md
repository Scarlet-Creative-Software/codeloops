# Phase 2.1: Semantic Query Caching Design Specification

## Overview

This document outlines the technical design for implementing semantic query caching with embeddings to enable context-aware cache hits in the CodeLoops MCP server. The system will improve cache hit rates by matching semantically similar queries even when they use different wording, significantly reducing Gemini API calls and improving response times.

## Current State Analysis

### Existing Cache Infrastructure

1. **GeminiCache** (`src/utils/geminiCache.ts`)
   - Simple string-based prompt caching with Map<string, string>
   - Uses Gemini's native cache API with TTL
   - Exact match only - no semantic understanding
   - Connected to GeminiConnectionManager for prioritized execution

2. **IndexSystem** (`src/engine/IndexSystem.ts`)
   - B-tree-based indexing for O(log n) performance
   - Supports node ID, tag, and content-based search
   - Text search uses simple string contains matching
   - Well-architected foundation for semantic enhancement

3. **KnowledgeGraph Search** (`src/engine/KnowledgeGraph.ts`)
   - Project, tag, and query-based search functionality
   - Uses IndexSystem for optimized lookups
   - Linear content search as fallback
   - No semantic similarity capabilities

## Semantic Query Cache Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Semantic Query Cache                     │
├─────────────────────────────────────────────────────────────┤
│ 1. EmbeddingService          │ 2. VectorIndex (HNSW)        │
│    - Query vectorization     │    - Similarity search       │
│    - Batch processing        │    - Incremental updates     │
│    - Rate limiting           │    - Persistence              │
├─────────────────────────────────────────────────────────────┤
│ 3. SemanticCacheManager     │ 4. CacheEntry Storage        │
│    - Cache coordination     │    - Structured entries      │
│    - Hit/miss logic         │    - TTL management          │
│    - Confidence scoring     │    - Eviction policies       │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Integration Layer                         │
├─────────────────────────────────────────────────────────────┤
│ • KnowledgeGraph.search() enhancement                      │
│ • ActorCriticEngine semantic search capabilities           │
│ • Backwards compatibility with existing APIs               │
└─────────────────────────────────────────────────────────────┘
```

### 1. EmbeddingService

**Purpose**: Generate vector embeddings for queries using Gemini's embedding API.

```typescript
interface EmbeddingService {
  // Generate embedding for a single query
  generateEmbedding(query: string): Promise<Float32Array>;
  
  // Batch processing for efficiency
  generateEmbeddings(queries: string[]): Promise<Float32Array[]>;
  
  // Check if embedding exists in cache
  getCachedEmbedding(query: string): Promise<Float32Array | null>;
  
  // Cache embedding result
  cacheEmbedding(query: string, embedding: Float32Array): Promise<void>;
}

interface EmbeddingConfig {
  model: 'text-embedding-004'; // Latest Gemini embedding model
  dimensions: 768; // Standard dimensionality
  batchSize: 100; // Max requests per batch
  cacheTimeout: 86400; // 24 hours in seconds
  rateLimitDelay: 100; // ms between requests
}
```

**Key Features**:
- Integration with existing GeminiConnectionManager for reliability
- Local embedding cache with 24-hour TTL
- Batch processing for multiple queries
- Rate limiting to respect API quotas
- Error handling and retry logic

### 2. VectorIndex (HNSW Implementation)

**Purpose**: Efficient similarity search using Hierarchical Navigable Small World algorithm.

```typescript
interface VectorIndex {
  // Add embedding to index
  addVector(id: string, embedding: Float32Array, metadata: any): Promise<void>;
  
  // Find k nearest neighbors
  search(queryEmbedding: Float32Array, k: number, threshold: number): Promise<SearchResult[]>;
  
  // Update existing vector
  updateVector(id: string, embedding: Float32Array, metadata: any): Promise<void>;
  
  // Remove vector from index
  removeVector(id: string): Promise<void>;
  
  // Persist index to disk
  save(): Promise<void>;
  
  // Load index from disk
  load(): Promise<void>;
}

interface SearchResult {
  id: string;
  similarity: number; // Cosine similarity score
  metadata: any;
}

interface HNSWConfig {
  efConstruction: 200; // Build-time search parameter
  efSearch: 50; // Query-time search parameter  
  maxConnections: 16; // Max connections per layer
  layers: 'auto'; // Auto-calculate optimal layers
  similarityThreshold: 0.85; // Minimum similarity for cache hit
}
```

**Key Features**:
- Efficient O(log n) approximate nearest neighbor search
- Configurable similarity thresholds
- Incremental index updates
- Persistent storage with versioning
- Memory-efficient implementation

### 3. SemanticCacheManager

**Purpose**: Orchestrate caching logic with semantic understanding.

```typescript
interface SemanticCacheManager {
  // Check for semantic cache hit
  get(query: string, tags?: Tag[], project?: string): Promise<CacheHit | null>;
  
  // Store result in semantic cache
  set(query: string, result: any, metadata: CacheMetadata): Promise<void>;
  
  // Invalidate cache entries
  invalidate(criteria: InvalidationCriteria): Promise<void>;
  
  // Get cache statistics
  getStats(): Promise<CacheStats>;
}

interface CacheHit {
  query: string; // Original cached query
  result: any; // Cached result
  similarity: number; // Similarity score
  confidence: number; // Confidence in result relevance
  metadata: CacheMetadata;
}

interface CacheMetadata {
  project: string;
  tags: Tag[];
  timestamp: number;
  hitCount: number;
  embedding: Float32Array;
  resultType: 'search' | 'generation' | 'analysis';
}

interface CacheStats {
  totalEntries: number;
  hitRate: number;
  averageSimilarity: number;
  memoryUsage: number;
  diskUsage: number;
}
```

**Key Features**:
- Multi-criteria semantic matching (query + tags + project)
- Confidence scoring based on similarity and context
- Adaptive caching strategies
- Comprehensive metrics and monitoring
- Integration with existing cache infrastructure

### 4. Cache Entry Storage

**Purpose**: Efficient storage and retrieval of cache entries with metadata.

```typescript
interface CacheEntry {
  id: string; // Unique identifier
  queryHash: string; // Hash of original query
  query: string; // Original query text
  embedding: Float32Array; // Query embedding
  result: any; // Cached result (compressed)
  metadata: CacheMetadata;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number;
}

interface CacheStorage {
  // Store cache entry
  store(entry: CacheEntry): Promise<void>;
  
  // Retrieve cache entry by ID
  retrieve(id: string): Promise<CacheEntry | null>;
  
  // List entries matching criteria
  list(criteria: StorageCriteria): Promise<CacheEntry[]>;
  
  // Remove expired entries
  cleanup(): Promise<number>;
  
  // Get storage statistics
  getStats(): Promise<StorageStats>;
}
```

**Key Features**:
- Compressed storage using zlib
- B-tree indexing for fast retrieval
- TTL-based expiration
- Background cleanup processes
- Storage quota management

## Integration Strategy

### Phase 1: Foundation (Week 1)

1. **EmbeddingService Implementation**
   ```typescript
   // src/engine/EmbeddingService.ts
   export class GeminiEmbeddingService implements EmbeddingService {
     private connectionManager: GeminiConnectionManager;
     private embeddingCache: Map<string, Float32Array>;
     private config: EmbeddingConfig;
     
     constructor(config: EmbeddingConfig) {
       this.connectionManager = getConnectionManager();
       this.embeddingCache = new Map();
       this.config = config;
     }
     
     async generateEmbedding(query: string): Promise<Float32Array> {
       // Check local cache first
       const cached = this.embeddingCache.get(query);
       if (cached) return cached;
       
       // Generate using Gemini API
       const response = await this.connectionManager.execute(
         async (client) => {
           return await client.embedContent({
             model: this.config.model,
             content: { parts: [{ text: query }] }
           });
         },
         { priority: RequestPriority.MEDIUM }
       );
       
       const embedding = new Float32Array(response.embedding.values);
       this.embeddingCache.set(query, embedding);
       return embedding;
     }
   }
   ```

2. **VectorIndex Implementation**
   ```typescript
   // src/engine/VectorIndex.ts
   export class HNSWVectorIndex implements VectorIndex {
     private index: HNSWNode[];
     private config: HNSWConfig;
     private persistPath: string;
     
     constructor(config: HNSWConfig, persistPath: string) {
       this.config = config;
       this.persistPath = persistPath;
       this.index = [];
     }
     
     async search(
       queryEmbedding: Float32Array, 
       k: number, 
       threshold: number
     ): Promise<SearchResult[]> {
       // HNSW approximate nearest neighbor search
       const candidates = this.searchLayer(queryEmbedding, k);
       
       return candidates
         .map(candidate => ({
           id: candidate.id,
           similarity: this.cosineSimilarity(queryEmbedding, candidate.embedding),
           metadata: candidate.metadata
         }))
         .filter(result => result.similarity >= threshold)
         .sort((a, b) => b.similarity - a.similarity)
         .slice(0, k);
     }
   }
   ```

### Phase 2: Cache Manager (Week 2)

1. **SemanticCacheManager Implementation**
   ```typescript
   // src/engine/SemanticCacheManager.ts
   export class SemanticCacheManager {
     private embeddingService: EmbeddingService;
     private vectorIndex: VectorIndex;
     private storage: CacheStorage;
     private config: SemanticCacheConfig;
     
     async get(
       query: string, 
       tags?: Tag[], 
       project?: string
     ): Promise<CacheHit | null> {
       // Generate query embedding
       const queryEmbedding = await this.embeddingService.generateEmbedding(query);
       
       // Search for similar queries
       const candidates = await this.vectorIndex.search(
         queryEmbedding,
         this.config.maxCandidates,
         this.config.similarityThreshold
       );
       
       // Filter by context (project, tags)
       const contextMatches = await this.filterByContext(candidates, project, tags);
       
       // Return best match if confidence is high enough
       if (contextMatches.length > 0) {
         const best = contextMatches[0];
         if (best.similarity >= this.config.confidenceThreshold) {
           return await this.createCacheHit(best, query);
         }
       }
       
       return null;
     }
     
     async set(query: string, result: any, metadata: CacheMetadata): Promise<void> {
       // Generate embedding for storage
       const embedding = await this.embeddingService.generateEmbedding(query);
       
       // Create cache entry
       const entry: CacheEntry = {
         id: this.generateId(),
         queryHash: this.hashQuery(query),
         query,
         embedding,
         result: await this.compressResult(result),
         metadata,
         createdAt: Date.now(),
         lastAccessedAt: Date.now(),
         expiresAt: Date.now() + metadata.ttl
       };
       
       // Store in both vector index and storage
       await Promise.all([
         this.vectorIndex.addVector(entry.id, embedding, metadata),
         this.storage.store(entry)
       ]);
     }
   }
   ```

### Phase 3: Integration (Week 3)

1. **KnowledgeGraph Enhancement**
   ```typescript
   // Enhance existing search method in KnowledgeGraph.ts
   async search({
     project,
     tags,
     query,
     limit,
     useSemanticCache = true
   }: SearchParams): Promise<DagNode[]> {
     // Try semantic cache first if enabled
     if (useSemanticCache && query) {
       const cacheHit = await this.semanticCache.get(query, tags, project);
       if (cacheHit) {
         this.logger.info(`[KnowledgeGraph] Semantic cache hit: ${cacheHit.similarity.toFixed(3)}`);
         return cacheHit.result;
       }
     }
     
     // Fallback to existing search logic
     const results = await this.performTraditionalSearch({ project, tags, query, limit });
     
     // Cache results for future semantic matching
     if (useSemanticCache && query && results.length > 0) {
       await this.semanticCache.set(query, results, {
         project,
         tags: tags || [],
         timestamp: Date.now(),
         hitCount: 0,
         resultType: 'search'
       });
     }
     
     return results;
   }
   ```

2. **Configuration Integration**
   ```typescript
   // Add to ConfigurationManager schema
   export const SemanticCacheConfigSchema = z.object({
     enabled: z.boolean().default(true),
     embeddingModel: z.string().default('text-embedding-004'),
     similarityThreshold: z.number().min(0).max(1).default(0.85),
     confidenceThreshold: z.number().min(0).max(1).default(0.90),
     maxCandidates: z.number().min(1).max(100).default(10),
     cacheSize: z.number().min(1000).default(10000),
     ttl: z.number().min(300).default(86400), // 24 hours
     cleanup: z.object({
       enabled: z.boolean().default(true),
       intervalMs: z.number().default(3600000), // 1 hour
       maxAge: z.number().default(604800) // 7 days
     })
   });
   ```

## Performance Targets

### Cache Hit Rates
- **Semantic Cache**: 40% hit rate for similar queries
- **Combined Cache**: 80% overall hit rate (semantic + exact)
- **API Reduction**: 60% fewer Gemini API calls

### Response Times
- **Embedding Generation**: <100ms per query
- **Similarity Search**: <10ms for 10k entries
- **Cache Retrieval**: <5ms end-to-end
- **Storage Operations**: <1ms for most operations

### Resource Usage
- **Memory**: <500MB for 10k cached entries
- **Disk**: <2GB for full cache with compression
- **CPU**: <5% overhead during normal operations
- **Network**: 50% reduction in API bandwidth

## Testing Strategy

### Unit Tests
- EmbeddingService functionality and error handling
- VectorIndex accuracy and performance
- CacheManager hit/miss logic
- Storage compression and retrieval

### Integration Tests
- End-to-end semantic search workflow
- Cache invalidation and cleanup
- Configuration management
- Backwards compatibility

### Performance Tests
- Large-scale similarity search benchmarks
- Memory usage under load
- Cache eviction performance
- Concurrent access scenarios

### Accuracy Tests
- Semantic similarity validation
- False positive rate analysis
- Confidence scoring accuracy
- Edge case handling

## Risk Mitigation

### Technical Risks
1. **Embedding Quality**
   - Risk: Poor semantic matching accuracy
   - Mitigation: Configurable similarity thresholds, A/B testing

2. **Performance Overhead**
   - Risk: Slow embedding generation
   - Mitigation: Aggressive caching, batch processing, async operations

3. **Memory Usage**
   - Risk: Excessive RAM consumption
   - Mitigation: Configurable cache sizes, efficient storage, LRU eviction

4. **False Positives**
   - Risk: Incorrect semantic matches
   - Mitigation: Confidence scoring, user feedback, manual overrides

### Operational Risks
1. **API Rate Limits**
   - Risk: Hitting Gemini embedding API limits
   - Mitigation: Rate limiting, exponential backoff, quota monitoring

2. **Storage Growth**
   - Risk: Unbounded cache growth
   - Mitigation: TTL enforcement, size limits, automated cleanup

3. **Configuration Complexity**
   - Risk: Difficult to tune parameters
   - Mitigation: Sensible defaults, auto-tuning, monitoring dashboards

## Success Criteria

### Functional Requirements
- [x] Semantic similarity matching with configurable thresholds
- [x] Integration with existing KnowledgeGraph search
- [x] Backwards compatibility with current APIs
- [x] Comprehensive configuration options
- [x] Robust error handling and fallbacks

### Performance Requirements
- [ ] 40% semantic cache hit rate achieved
- [ ] <100ms embedding generation time
- [ ] <10ms similarity search time
- [ ] 60% reduction in API calls
- [ ] 50% reduction in response times

### Quality Requirements
- [ ] 90% test coverage for new code
- [ ] Zero regressions in existing functionality
- [ ] Complete API documentation
- [ ] Performance monitoring integration
- [ ] Production-ready error handling

## Implementation Timeline

### Week 1: Foundation
- [x] Design document completion
- [ ] EmbeddingService implementation
- [ ] VectorIndex base implementation
- [ ] Unit tests for core components

### Week 2: Cache Management  
- [ ] SemanticCacheManager implementation
- [ ] CacheStorage implementation
- [ ] Integration with existing cache system
- [ ] Performance optimization

### Week 3: Integration & Testing
- [ ] KnowledgeGraph integration
- [ ] Configuration system updates
- [ ] Comprehensive testing suite
- [ ] Performance benchmarking

### Week 4: Production Readiness
- [ ] Documentation completion
- [ ] Monitoring integration
- [ ] Production deployment preparation
- [ ] Performance validation

## Next Steps

1. **Review and Approval**: Technical review of this design document
2. **Configuration Setup**: Update configuration schema and templates
3. **Development Environment**: Set up testing infrastructure for embeddings
4. **Implementation**: Begin with EmbeddingService and VectorIndex
5. **Testing**: Establish performance benchmarks and accuracy metrics

---

*Document Version: 1.0*  
*Created: 2025-05-30*  
*Phase: 2.1 - Semantic Query Caching*  
*Status: Design Complete - Ready for Implementation*