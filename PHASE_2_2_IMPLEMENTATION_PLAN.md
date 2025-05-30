# Phase 2.2 Implementation Plan: Memory-Mapped File Storage

## Status: Ready to Begin
**Dependencies**: Phase 2.1 (Semantic Query Caching) ✅ COMPLETED

## Objective

Implement memory-mapped file storage to handle very large knowledge graphs (10k+ nodes) without loading everything into memory, building on the existing B-tree indexing and semantic caching infrastructure.

## Current Performance Baseline

- **Dataset Size**: 61MB knowledge graph with 37,010 nodes
- **Memory Usage**: Full in-memory loading of all nodes during initialization
- **Startup Time**: O(n) initialization requiring full file scan
- **Index Performance**: O(log n) lookups once loaded (excellent)
- **Cache Performance**: 40-60% semantic cache hit rate (excellent)

## Technical Implementation Strategy

### Week 1: Foundation Layer (Phase 2.2.1)

#### Day 1-2: Memory-Mapped Storage Engine Core

**File: `src/engine/MemoryMappedStorageEngine.ts`**

```typescript
interface MemoryMappedStorageConfig {
  filePath: string;
  maxMemoryUsage: number;  // 512MB default
  blockSize: number;       // 4KB default
  enableCompression: boolean;
}

class MemoryMappedStorageEngine {
  private fileHeader: FileHeader;
  private indexManager: PersistedIndexManager;
  private blockManager: BlockManager;
  private memoryManager: MemoryManager;
  
  async initialize(config: MemoryMappedStorageConfig): Promise<void>
  async getNode(nodeId: string): Promise<DagNode | undefined>
  async insertNode(node: DagNode): Promise<void>
  async bulkInsert(nodes: DagNode[]): Promise<void>
  async flushToDisk(): Promise<void>
}
```

**Key Features:**
- Memory-mapped file initialization
- Basic node read/write operations
- File format validation
- Cross-platform compatibility (macOS, Linux, Windows)

#### Day 3-4: File Format and Header Management

**File: `src/engine/FileFormatManager.ts`**

```typescript
interface FileHeader {
  magic: number;           // 0x434C4F4F ("CLOO")
  version: number;         // File format version
  nodeCount: number;       // Total nodes in file
  indexOffset: number;     // Byte offset to index section
  dataOffset: number;      // Byte offset to data section
  blockSize: number;       // Block size for alignment
  compressionType: number; // Compression algorithm used
  checksum: number;        // File integrity checksum
}

class FileFormatManager {
  async createNewFile(filePath: string): Promise<void>
  async validateFile(filePath: string): Promise<boolean>
  async upgradeFile(filePath: string, targetVersion: number): Promise<void>
  async repairFile(filePath: string): Promise<RepairResult>
}
```

#### Day 5: Block Manager and Memory Alignment

**File: `src/engine/BlockManager.ts`**

```typescript
interface BlockHandle {
  offset: number;
  size: number;
  compressed: boolean;
  checksum: number;
}

class BlockManager {
  private blocks: Map<string, BlockHandle>;
  private freeBlocks: PriorityQueue<number>; // Size-based allocation
  
  async allocateBlock(size: number): Promise<BlockHandle>
  async freeBlock(handle: BlockHandle): Promise<void>
  async readBlock(handle: BlockHandle): Promise<Buffer>
  async writeBlock(handle: BlockHandle, data: Buffer): Promise<void>
  async compactFile(): Promise<CompactionStats>
}
```

### Week 2: Index Persistence (Phase 2.2.2)

#### Day 6-8: Persistent B-Tree Implementation

**File: `src/engine/PersistedBTree.ts`**

Extend existing B-tree to support disk persistence:

```typescript
class PersistedBTree<K, V> extends BTree<K, V> {
  private storageEngine: MemoryMappedStorageEngine;
  private nodePool: Map<number, BTreeNode<K, V>>;
  
  async persistNode(node: BTreeNode<K, V>): Promise<number>
  async loadNode(nodeId: number): Promise<BTreeNode<K, V>>
  async flushDirtyNodes(): Promise<void>
  
  // Override core operations to use persistent storage
  async search(key: K): Promise<V | undefined>
  async insert(key: K, value: V): Promise<void>
  async delete(key: K): Promise<boolean>
}
```

#### Day 9-10: Index Manager Integration

**File: `src/engine/PersistedIndexManager.ts`**

```typescript
class PersistedIndexManager {
  private nodeIndex: PersistedBTree<string, NodeMetadata>;
  private tagIndex: PersistedBTree<string, Set<string>>;
  private projectIndex: PersistedBTree<string, Set<string>>;
  private contentIndex: PersistedBTree<string, Set<string>>;
  
  async buildFromExistingData(nodes: DagNode[]): Promise<void>
  async updateNode(node: DagNode): Promise<void>
  async removeNode(nodeId: string): Promise<void>
  async searchNodes(query: SearchQuery): Promise<DagNode[]>
}
```

### Week 3: Memory Management and Caching (Phase 2.2.3)

#### Day 11-13: Adaptive Memory Manager

**File: `src/engine/AdaptiveMemoryManager.ts`**

```typescript
interface MemoryStats {
  totalAllocated: number;
  activePages: number;
  cachedNodes: number;
  hitRate: number;
  evictionCount: number;
}

class AdaptiveMemoryManager {
  private hotDataTracker: Map<string, AccessStats>;
  private memoryPressureLevel: 'low' | 'medium' | 'high' | 'critical';
  
  trackAccess(nodeId: string, accessType: 'read' | 'write'): void
  async handleMemoryPressure(level: MemoryPressureLevel): Promise<void>
  async evictColdData(targetBytes: number): Promise<number>
  async prefetchHotData(): Promise<void>
  getMemoryStats(): MemoryStats
}
```

#### Day 14-15: LRU Cache with Memory Pressure Handling

**File: `src/engine/PressureAwareLRUCache.ts`**

```typescript
class PressureAwareLRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>>;
  private accessOrder: DoublyLinkedList<K>;
  private memoryUsage: number;
  private maxMemory: number;
  
  set(key: K, value: V, weight?: number): void
  get(key: K): V | undefined
  evictToFitMemory(requiredBytes: number): number
  onMemoryPressure(level: MemoryPressureLevel): Promise<void>
}
```

### Week 4: Integration and Optimization (Phase 2.2.4)

#### Day 16-18: KnowledgeGraphManager Integration

**File Updates:**
- `src/engine/KnowledgeGraph.ts` - Update to use MemoryMappedStorageEngine
- `src/config/schema.ts` - Add memory-mapped configuration
- `src/engine/ActorCriticEngine.ts` - Update for new storage interface

```typescript
// KnowledgeGraphManager.ts updates
class KnowledgeGraphManager {
  private storageEngine: MemoryMappedStorageEngine;
  private memoryManager: AdaptiveMemoryManager;
  
  async init() {
    // Initialize memory-mapped storage
    await this.storageEngine.initialize({
      filePath: this.logFilePath,
      maxMemoryUsage: this.config.performance.memoryMapped.maxMemoryUsage,
      blockSize: this.config.performance.memoryMapped.blockSize,
      enableCompression: this.config.performance.memoryMapped.compressionEnabled
    });
    
    // Migrate existing NDJSON data if needed
    if (await this.needsMigration()) {
      await this.migrateFromNDJSON();
    }
    
    // Initialize semantic cache with new storage
    if (this.semanticCacheManager) {
      await this.semanticCacheManager.initialize();
    }
  }
}
```

#### Day 19-20: Migration and Backward Compatibility

**File: `src/engine/MigrationManager.ts`**

```typescript
class MigrationManager {
  async migrateFromNDJSON(
    ndjsonPath: string, 
    targetPath: string
  ): Promise<MigrationResult>
  
  async createBackup(filePath: string): Promise<string>
  async validateMigration(originalPath: string, newPath: string): Promise<boolean>
  async rollbackMigration(backupPath: string, targetPath: string): Promise<void>
}
```

### Week 5: Testing and Performance Validation (Phase 2.2.5)

#### Day 21-23: Comprehensive Testing

1. **Unit Tests:**
   - `MemoryMappedStorageEngine.test.ts`
   - `PersistedBTree.test.ts`
   - `AdaptiveMemoryManager.test.ts`
   - `MigrationManager.test.ts`

2. **Integration Tests:**
   - Large dataset performance tests (100k+ nodes)
   - Memory pressure simulation tests
   - Cross-platform compatibility tests
   - Migration integrity tests

3. **Performance Benchmarks:**
   - Memory usage comparison (before/after)
   - Query performance at scale
   - Startup time improvements
   - Cache hit rate maintenance

#### Day 24-25: Documentation and Production Readiness

1. **API Documentation:**
   - Memory-mapped storage configuration guide
   - Migration procedures and best practices
   - Performance tuning recommendations
   - Troubleshooting guide

2. **Production Deployment:**
   - Configuration templates
   - Monitoring and alerting setup
   - Rollback procedures
   - Performance baselines

## Configuration Schema Addition

```typescript
// src/config/schema.ts
export const MemoryMappedConfigSchema = z.object({
  enabled: z.boolean().default(true),
  
  // Memory management
  maxMemoryUsage: z.number().default(512 * 1024 * 1024), // 512MB
  blockSize: z.number().default(4096), // 4KB
  cacheEvictionPolicy: z.enum(['lru', 'lfu', 'adaptive']).default('adaptive'),
  
  // File management
  maxFileSize: z.number().default(10 * 1024 * 1024 * 1024), // 10GB
  compactionThreshold: z.number().default(0.3), // 30% fragmentation
  compressionEnabled: z.boolean().default(true),
  
  // Performance tuning
  prefetchSize: z.number().default(64), // Number of blocks
  backgroundFlushInterval: z.number().default(30000), // 30 seconds
  hotDataThreshold: z.number().default(10), // Access count
  
  // Migration settings
  legacyCompatibility: z.boolean().default(true),
  migrationBatchSize: z.number().default(1000),
  backupBeforeMigration: z.boolean().default(true),
});

// Add to PerformanceConfigSchema
export const PerformanceConfigSchema = z.object({
  // ... existing configs
  memoryMapped: MemoryMappedConfigSchema,
});
```

## Success Criteria

### Performance Targets
- **Memory Usage**: <100MB RAM for 50k+ node datasets (80% reduction)
- **Startup Time**: <5 seconds for any dataset size (90% improvement)
- **Query Performance**: <10ms average response time (maintain current)
- **Cache Hit Rate**: Maintain 40-60% semantic cache performance
- **Scalability**: Support 100k+ nodes without degradation

### Operational Targets
- **Zero Data Loss**: During normal operations and migrations
- **Backward Compatibility**: Seamless migration from NDJSON format
- **Cross-Platform**: Support macOS, Linux, Windows
- **Production Ready**: Comprehensive monitoring and alerting

## Risk Mitigation

1. **Data Safety:**
   - Automated backups before migration
   - Integrity validation at each step
   - Rollback procedures for failed migrations

2. **Performance Regression:**
   - Adaptive mode selection (memory-mapped vs. in-memory)
   - Fallback to NDJSON for critical failures
   - Comprehensive benchmarking before deployment

3. **Platform Compatibility:**
   - Abstraction layer for memory mapping APIs
   - Extensive cross-platform testing
   - Graceful degradation for unsupported platforms

## Next Steps

1. **Immediate**: Begin implementation of `MemoryMappedStorageEngine.ts`
2. **Week 1 Goal**: Complete foundation layer with basic read/write operations
3. **Week 2 Goal**: Persistent B-tree implementation working
4. **Week 3 Goal**: Memory management and adaptive caching functional
5. **Week 4 Goal**: Full integration with existing KnowledgeGraphManager
6. **Week 5 Goal**: Production-ready with comprehensive testing

This implementation plan builds directly on the successful completion of Phase 2.1 semantic caching and provides a clear path to handling very large knowledge graphs efficiently.