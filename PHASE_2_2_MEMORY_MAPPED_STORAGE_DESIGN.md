# Phase 2.2: Memory-Mapped File Storage for Large Knowledge Graphs

## Executive Summary

Phase 2.2 implements memory-mapped file storage to handle very large knowledge graphs (10k+ nodes) without loading everything into memory. This phase builds on the B-tree indexing (Phase 1) and semantic caching (Phase 2.1) to create a scalable storage solution.

## Current State Analysis

### Performance Bottlenecks Identified

1. **Memory Usage**: Current system loads entire knowledge graph into memory
   - 61MB knowledge graph file with 37,010 nodes
   - All nodes loaded during index initialization
   - Memory usage grows linearly with dataset size

2. **Startup Time**: Index building requires full file scan
   - O(n) initialization time for n nodes
   - Blocking startup process for large datasets

3. **Cache Pressure**: Large datasets exhaust system memory
   - Node cache limited to 30-second TTL
   - B-tree indices stored entirely in RAM
   - Semantic cache competes for memory resources

### Existing Architecture Strengths

1. **B-tree Indexing**: O(log n) lookup performance
2. **Semantic Caching**: 40-60% cache hit rate for similar queries
3. **NDJSON Format**: Append-only, crash-safe storage
4. **Multi-index System**: Efficient tag, project, and content searches

## Technical Design

### Memory-Mapped Storage Architecture

#### 1. File Layout Design

```
Knowledge Graph File Structure:
┌─────────────────┬─────────────────┬─────────────────┐
│   Header (1KB)  │   Index (64KB)  │  Data Blocks    │
├─────────────────┼─────────────────┼─────────────────┤
│ - Magic number  │ - Node offsets  │ - NDJSON nodes  │
│ - Version       │ - B-tree nodes  │ - Variable size │
│ - Node count    │ - Tag indices   │                 │
│ - Index offset  │ - Project map   │                 │
└─────────────────┴─────────────────┴─────────────────┘
```

#### 2. Memory-Mapped Components

**A. Persistent B-Tree Index**
- Store B-tree structure on disk
- Memory-map tree nodes for O(log n) access
- Lazy loading of tree branches
- Write-ahead log for index updates

**B. Node Block Manager**
- Fixed-size blocks (4KB) for efficient page alignment
- Block compression for reduced I/O
- LRU eviction policy for memory management
- Background prefetching for sequential access

**C. Offset Index**
- Memory-mapped array of node ID → file offset mappings
- Binary search for O(log n) node location
- Periodic compaction to remove deleted nodes

#### 3. Implementation Strategy

**Phase 2.2.1: Memory-Mapped Index Layer**
```typescript
interface MemoryMappedIndex {
  // Core operations
  initialize(filePath: string): Promise<void>;
  getNode(nodeId: string): Promise<DagNode | undefined>;
  insertNode(node: DagNode): Promise<void>;
  updateNode(node: DagNode): Promise<void>;
  deleteNode(nodeId: string): Promise<boolean>;
  
  // Bulk operations
  bulkInsert(nodes: DagNode[]): Promise<void>;
  bulkQuery(nodeIds: string[]): Promise<DagNode[]>;
  
  // Memory management
  flushToDisk(): Promise<void>;
  evictFromMemory(nodeId: string): void;
  getMemoryUsage(): MemoryStats;
}
```

**Phase 2.2.2: Adaptive Caching Strategy**
```typescript
interface AdaptiveCacheManager {
  // Hot data detection
  trackAccess(nodeId: string): void;
  getHotNodes(limit: number): string[];
  
  // Memory pressure handling
  handleMemoryPressure(): Promise<void>;
  setMemoryLimit(bytes: number): void;
  
  // Performance optimization
  prefetchNodes(nodeIds: string[]): Promise<void>;
  warmupCache(project: string): Promise<void>;
}
```

**Phase 2.2.3: Incremental Migration**
```typescript
interface MigrationManager {
  // Legacy compatibility
  migrateFromNDJSON(inputFile: string): Promise<void>;
  exportToNDJSON(outputFile: string): Promise<void>;
  
  // Version management
  upgradeFileFormat(version: string): Promise<void>;
  validateFileIntegrity(): Promise<boolean>;
  
  // Backup and recovery
  createSnapshot(): Promise<string>;
  restoreFromSnapshot(snapshotPath: string): Promise<void>;
}
```

### Integration with Existing Systems

#### 1. KnowledgeGraphManager Updates

```typescript
class KnowledgeGraphManager {
  private storageEngine: MemoryMappedStorageEngine;
  private cacheManager: AdaptiveCacheManager;
  
  async init() {
    // Initialize memory-mapped storage
    await this.storageEngine.initialize(this.logFilePath);
    
    // Setup adaptive caching
    this.cacheManager.setMemoryLimit(this.config.maxMemoryUsage);
    
    // Migrate existing data if needed
    if (await this.needsMigration()) {
      await this.migrateToMemoryMapped();
    }
  }
  
  async getNode(id: string): Promise<DagNode | undefined> {
    // Track access for hot data detection
    this.cacheManager.trackAccess(id);
    
    // Use memory-mapped storage
    return this.storageEngine.getNode(id);
  }
}
```

#### 2. Semantic Cache Integration

```typescript
class SemanticCacheManager {
  constructor(
    private storageEngine: MemoryMappedStorageEngine,
    private config: SemanticCacheConfig
  ) {}
  
  async searchWithCache(query: SemanticQuery): Promise<CacheResult> {
    // Check cache first
    const cached = await this.checkCache(query);
    if (cached) return cached;
    
    // Perform search using memory-mapped storage
    const results = await this.storageEngine.searchNodes(query);
    
    // Cache results for future use
    await this.cacheResults(query, results);
    
    return { results, source: 'api' };
  }
}
```

### Performance Optimizations

#### 1. Memory Management

**Smart Eviction Policy**
- LRU eviction for cold data
- Pin frequently accessed nodes in memory
- Adaptive cache sizing based on system memory
- Background compression of inactive blocks

**Memory Pressure Handling**
```typescript
interface MemoryPressureHandler {
  onMemoryWarning(level: 'low' | 'critical'): Promise<void>;
  evictColdData(targetBytes: number): Promise<number>;
  compressInactiveBlocks(): Promise<void>;
  reportMemoryUsage(): MemoryReport;
}
```

#### 2. I/O Optimization

**Batch Operations**
- Group related reads/writes
- Use vectored I/O for efficiency
- Asynchronous background writes
- Read-ahead for sequential access patterns

**File Structure Optimization**
```typescript
interface FileOptimizer {
  // Block management
  allocateBlock(size: number): Promise<BlockHandle>;
  freeBlock(handle: BlockHandle): Promise<void>;
  compactFile(): Promise<CompactionStats>;
  
  // I/O optimization
  prefetchBlocks(handles: BlockHandle[]): Promise<void>;
  flushDirtyBlocks(): Promise<void>;
  getIOStats(): IOStatistics;
}
```

#### 3. Cross-Platform Compatibility

**Platform Abstraction Layer**
```typescript
interface PlatformStorageAdapter {
  // Memory mapping
  createMemoryMap(file: string, size: number): Promise<MemoryMap>;
  resizeMemoryMap(map: MemoryMap, newSize: number): Promise<void>;
  syncMemoryMap(map: MemoryMap): Promise<void>;
  
  // File operations
  allocateFile(path: string, size: number): Promise<void>;
  getLockFile(path: string): Promise<FileLock>;
  getFileStats(path: string): Promise<FileStats>;
}
```

### Configuration Schema Updates

```typescript
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
```

## Implementation Plan

### Phase 2.2.1: Memory-Mapped Foundation (Week 1-2)

1. **Core Storage Engine**
   - Implement `MemoryMappedStorageEngine` class
   - Basic file layout and header management
   - Simple node read/write operations
   - Cross-platform memory mapping

2. **Index Persistence**
   - Extend B-tree implementation for disk storage
   - Memory-mapped index nodes
   - Write-ahead logging for consistency

3. **Basic Integration**
   - Update `KnowledgeGraphManager` to use new engine
   - Maintain backward compatibility with NDJSON
   - Add configuration options

### Phase 2.2.2: Advanced Features (Week 3-4)

1. **Adaptive Caching**
   - Hot data detection and prefetching
   - Memory pressure handling
   - Smart eviction policies

2. **Performance Optimization**
   - Batch operations and vectored I/O
   - Background compression
   - File compaction

3. **Migration Tools**
   - NDJSON to memory-mapped converter
   - Integrity validation
   - Backup and recovery

### Phase 2.2.3: Integration and Testing (Week 5)

1. **Semantic Cache Integration**
   - Update cache manager for new storage
   - Optimize cache persistence
   - Performance benchmarking

2. **Comprehensive Testing**
   - Large dataset performance tests
   - Memory pressure simulation
   - Cross-platform compatibility tests

3. **Documentation and Migration Guide**
   - API documentation
   - Migration procedures
   - Performance tuning guide

## Expected Outcomes

### Performance Improvements

1. **Memory Usage**: 80% reduction in RAM usage for large datasets
2. **Startup Time**: 90% faster initialization (from O(n) to O(log n))
3. **Scalability**: Support for 100k+ nodes without memory issues
4. **I/O Efficiency**: 50% fewer disk operations through caching

### Operational Benefits

1. **Reduced Infrastructure Costs**: Lower memory requirements
2. **Better Responsiveness**: Consistent performance under load
3. **Improved Reliability**: Better handling of system memory pressure
4. **Enhanced Scalability**: Linear scaling with dataset size

## Risk Assessment

### Technical Risks

1. **Memory Mapping Complexity**: Platform-specific implementations
   - **Mitigation**: Comprehensive abstraction layer and testing

2. **Data Corruption**: File format changes increase corruption risk
   - **Mitigation**: Write-ahead logging and integrity validation

3. **Performance Regression**: New overhead might impact small datasets
   - **Mitigation**: Adaptive mode selection and fallback options

### Operational Risks

1. **Migration Complexity**: Existing installations need data migration
   - **Mitigation**: Automated migration tools and backup procedures

2. **Platform Compatibility**: Memory mapping varies across OS platforms
   - **Mitigation**: Extensive cross-platform testing and fallbacks

## Success Metrics

1. **Memory Usage**: <100MB RAM for 50k+ node datasets
2. **Query Performance**: <10ms average response time
3. **Startup Time**: <5 seconds for any dataset size
4. **Cache Hit Rate**: Maintain 40-60% semantic cache performance
5. **Data Integrity**: Zero data loss during normal operations

## Timeline

- **Week 1-2**: Memory-mapped foundation and basic operations
- **Week 3-4**: Advanced features and performance optimization
- **Week 5**: Integration testing and documentation
- **Week 6**: Production deployment and monitoring

This design provides a robust foundation for handling very large knowledge graphs while maintaining the performance gains from previous phases and ensuring backward compatibility.