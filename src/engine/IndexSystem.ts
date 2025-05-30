/**
 * B-Tree-based indexing system for KnowledgeGraph performance optimization
 * Provides O(log n) indexed lookups for node IDs, tags, and content search
 */

import { DagNode } from './KnowledgeGraph.ts';
import { Tag } from './tags.ts';

interface BTreeNode<K, V> {
  keys: K[];
  values: V[];
  children: BTreeNode<K, V>[];
  isLeaf: boolean;
  parent?: BTreeNode<K, V>;
}

/**
 * Generic B-Tree implementation for indexing
 * Supports insert, delete, search operations in O(log n) time
 */
class BTree<K, V> {
  private root: BTreeNode<K, V>;
  private degree: number;
  private compareKeys: (a: K, b: K) => number;

  constructor(degree: number = 64, compareKeys: (a: K, b: K) => number) {
    this.degree = degree;
    this.compareKeys = compareKeys;
    this.root = {
      keys: [],
      values: [],
      children: [],
      isLeaf: true,
    };
  }

  /**
   * Search for a value by key - O(log n)
   */
  search(key: K): V | undefined {
    return this.searchNode(this.root, key);
  }

  /**
   * Get all values for keys in a range - O(log n + k) where k is result size
   */
  searchRange(minKey: K, maxKey: K): V[] {
    const results: V[] = [];
    this.searchRangeNode(this.root, minKey, maxKey, results);
    return results;
  }

  /**
   * Get all values with keys matching a prefix - O(log n + k)
   */
  searchPrefix(prefix: K, prefixMatch: (key: K, prefix: K) => boolean): V[] {
    const results: V[] = [];
    this.searchPrefixNode(this.root, prefix, prefixMatch, results);
    return results;
  }

  /**
   * Insert a key-value pair - O(log n)
   */
  insert(key: K, value: V): void {
    const root = this.root;
    
    // If root is full, split it
    if (root.keys.length === 2 * this.degree - 1) {
      const newRoot: BTreeNode<K, V> = {
        keys: [],
        values: [],
        children: [root],
        isLeaf: false,
      };
      root.parent = newRoot;
      this.root = newRoot;
      this.splitChild(newRoot, 0);
    }
    
    this.insertNonFull(this.root, key, value);
  }

  /**
   * Delete a key-value pair - O(log n)
   */
  delete(key: K): boolean {
    const found = this.deleteNode(this.root, key);
    
    // If root becomes empty and has children, make first child the new root
    if (this.root.keys.length === 0 && !this.root.isLeaf) {
      this.root = this.root.children[0];
      this.root.parent = undefined;
    }
    
    return found;
  }

  /**
   * Get all values in the tree - O(n)
   */
  getAllValues(): V[] {
    const results: V[] = [];
    this.getAllValuesNode(this.root, results);
    return results;
  }

  /**
   * Clear all entries - O(1)
   */
  clear(): void {
    this.root = {
      keys: [],
      values: [],
      children: [],
      isLeaf: true,
    };
  }

  private searchNode(node: BTreeNode<K, V>, key: K): V | undefined {
    let i = 0;
    
    // Find the first key greater than or equal to key
    while (i < node.keys.length && this.compareKeys(key, node.keys[i]) > 0) {
      i++;
    }
    
    // If key found in this node
    if (i < node.keys.length && this.compareKeys(key, node.keys[i]) === 0) {
      return node.values[i];
    }
    
    // If this is a leaf node, key not found
    if (node.isLeaf) {
      return undefined;
    }
    
    // Recurse to appropriate child
    return this.searchNode(node.children[i], key);
  }

  private searchRangeNode(node: BTreeNode<K, V>, minKey: K, maxKey: K, results: V[]): void {
    let i = 0;
    
    // Find first key >= minKey
    while (i < node.keys.length && this.compareKeys(node.keys[i], minKey) < 0) {
      i++;
    }
    
    // Process keys in range
    while (i < node.keys.length && this.compareKeys(node.keys[i], maxKey) <= 0) {
      results.push(node.values[i]);
      
      // If not leaf, search left child
      if (!node.isLeaf) {
        this.searchRangeNode(node.children[i], minKey, maxKey, results);
      }
      
      i++;
    }
    
    // Search right child if not leaf and we haven't exceeded max
    if (!node.isLeaf && i < node.children.length) {
      this.searchRangeNode(node.children[i], minKey, maxKey, results);
    }
  }

  private searchPrefixNode(node: BTreeNode<K, V>, prefix: K, prefixMatch: (key: K, prefix: K) => boolean, results: V[]): void {
    for (let i = 0; i < node.keys.length; i++) {
      if (prefixMatch(node.keys[i], prefix)) {
        results.push(node.values[i]);
      }
      
      // Search children
      if (!node.isLeaf) {
        this.searchPrefixNode(node.children[i], prefix, prefixMatch, results);
      }
    }
    
    // Search last child
    if (!node.isLeaf && node.children.length > node.keys.length) {
      this.searchPrefixNode(node.children[node.children.length - 1], prefix, prefixMatch, results);
    }
  }

  private insertNonFull(node: BTreeNode<K, V>, key: K, value: V): void {
    let i = node.keys.length - 1;
    
    if (node.isLeaf) {
      // Find position and insert
      while (i >= 0 && this.compareKeys(key, node.keys[i]) < 0) {
        i--;
      }
      
      node.keys.splice(i + 1, 0, key);
      node.values.splice(i + 1, 0, value);
    } else {
      // Find child to insert into
      while (i >= 0 && this.compareKeys(key, node.keys[i]) < 0) {
        i--;
      }
      i++;
      
      // Split child if full
      if (node.children[i].keys.length === 2 * this.degree - 1) {
        this.splitChild(node, i);
        if (this.compareKeys(key, node.keys[i]) > 0) {
          i++;
        }
      }
      
      this.insertNonFull(node.children[i], key, value);
    }
  }

  private splitChild(parent: BTreeNode<K, V>, index: number): void {
    const fullChild = parent.children[index];
    const newChild: BTreeNode<K, V> = {
      keys: [],
      values: [],
      children: [],
      isLeaf: fullChild.isLeaf,
      parent,
    };
    
    const midIndex = this.degree - 1;
    
    // Move half the keys and values to new child
    newChild.keys = fullChild.keys.splice(midIndex + 1);
    newChild.values = fullChild.values.splice(midIndex + 1);
    
    // Move half the children if not leaf
    if (!fullChild.isLeaf) {
      newChild.children = fullChild.children.splice(midIndex + 1);
      newChild.children.forEach(child => child.parent = newChild);
    }
    
    // Move middle key up to parent
    const midKey = fullChild.keys.splice(midIndex, 1)[0];
    const midValue = fullChild.values.splice(midIndex, 1)[0];
    
    parent.keys.splice(index, 0, midKey);
    parent.values.splice(index, 0, midValue);
    parent.children.splice(index + 1, 0, newChild);
  }

  private deleteNode(node: BTreeNode<K, V>, key: K): boolean {
    const keyIndex = node.keys.findIndex(k => this.compareKeys(k, key) === 0);
    
    if (keyIndex >= 0) {
      // Key found in this node
      if (node.isLeaf) {
        // Simple deletion from leaf
        node.keys.splice(keyIndex, 1);
        node.values.splice(keyIndex, 1);
        return true;
      } else {
        // Replace with predecessor or successor
        const leftChild = node.children[keyIndex];
        const rightChild = node.children[keyIndex + 1];
        
        if (leftChild.keys.length >= this.degree) {
          // Replace with predecessor
          const predecessor = this.getMaxKeyValue(leftChild);
          node.keys[keyIndex] = predecessor.key;
          node.values[keyIndex] = predecessor.value;
          return this.deleteNode(leftChild, predecessor.key);
        } else if (rightChild.keys.length >= this.degree) {
          // Replace with successor
          const successor = this.getMinKeyValue(rightChild);
          node.keys[keyIndex] = successor.key;
          node.values[keyIndex] = successor.value;
          return this.deleteNode(rightChild, successor.key);
        } else {
          // Merge children and delete from merged child
          this.mergeChildren(node, keyIndex);
          return this.deleteNode(leftChild, key);
        }
      }
    } else {
      // Key not in this node
      if (node.isLeaf) {
        return false; // Key not found
      }
      
      // Find child that should contain the key
      let childIndex = 0;
      while (childIndex < node.keys.length && this.compareKeys(key, node.keys[childIndex]) > 0) {
        childIndex++;
      }
      
      const child = node.children[childIndex];
      
      // Ensure child has enough keys
      if (child.keys.length < this.degree) {
        this.ensureChildHasEnoughKeys(node, childIndex);
        // Child index might change after rebalancing
        childIndex = 0;
        while (childIndex < node.keys.length && this.compareKeys(key, node.keys[childIndex]) > 0) {
          childIndex++;
        }
      }
      
      return this.deleteNode(node.children[childIndex], key);
    }
  }

  private getMinKeyValue(node: BTreeNode<K, V>): { key: K; value: V } {
    while (!node.isLeaf) {
      node = node.children[0];
    }
    return { key: node.keys[0], value: node.values[0] };
  }

  private getMaxKeyValue(node: BTreeNode<K, V>): { key: K; value: V } {
    while (!node.isLeaf) {
      node = node.children[node.children.length - 1];
    }
    const lastIndex = node.keys.length - 1;
    return { key: node.keys[lastIndex], value: node.values[lastIndex] };
  }

  private mergeChildren(parent: BTreeNode<K, V>, index: number): void {
    const leftChild = parent.children[index];
    const rightChild = parent.children[index + 1];
    
    // Move parent key and right child to left child
    leftChild.keys.push(parent.keys[index]);
    leftChild.values.push(parent.values[index]);
    leftChild.keys.push(...rightChild.keys);
    leftChild.values.push(...rightChild.values);
    leftChild.children.push(...rightChild.children);
    
    // Update parent pointers
    rightChild.children.forEach(child => child.parent = leftChild);
    
    // Remove key and right child from parent
    parent.keys.splice(index, 1);
    parent.values.splice(index, 1);
    parent.children.splice(index + 1, 1);
  }

  private ensureChildHasEnoughKeys(parent: BTreeNode<K, V>, childIndex: number): void {
    // Try to borrow from left sibling
    if (childIndex > 0 && parent.children[childIndex - 1].keys.length >= this.degree) {
      this.borrowFromLeftSibling(parent, childIndex);
    }
    // Try to borrow from right sibling
    else if (childIndex < parent.children.length - 1 && parent.children[childIndex + 1].keys.length >= this.degree) {
      this.borrowFromRightSibling(parent, childIndex);
    }
    // Merge with a sibling
    else {
      if (childIndex > 0) {
        this.mergeChildren(parent, childIndex - 1);
      } else {
        this.mergeChildren(parent, childIndex);
      }
    }
  }

  private borrowFromLeftSibling(parent: BTreeNode<K, V>, childIndex: number): void {
    const child = parent.children[childIndex];
    const leftSibling = parent.children[childIndex - 1];
    
    // Move parent key to child
    child.keys.unshift(parent.keys[childIndex - 1]);
    child.values.unshift(parent.values[childIndex - 1]);
    
    // Move left sibling's max key to parent
    parent.keys[childIndex - 1] = leftSibling.keys.pop()!;
    parent.values[childIndex - 1] = leftSibling.values.pop()!;
    
    // Move child if not leaf
    if (!child.isLeaf) {
      const borrowedChild = leftSibling.children.pop()!;
      borrowedChild.parent = child;
      child.children.unshift(borrowedChild);
    }
  }

  private borrowFromRightSibling(parent: BTreeNode<K, V>, childIndex: number): void {
    const child = parent.children[childIndex];
    const rightSibling = parent.children[childIndex + 1];
    
    // Move parent key to child
    child.keys.push(parent.keys[childIndex]);
    child.values.push(parent.values[childIndex]);
    
    // Move right sibling's min key to parent
    parent.keys[childIndex] = rightSibling.keys.shift()!;
    parent.values[childIndex] = rightSibling.values.shift()!;
    
    // Move child if not leaf
    if (!child.isLeaf) {
      const borrowedChild = rightSibling.children.shift()!;
      borrowedChild.parent = child;
      child.children.push(borrowedChild);
    }
  }

  private getAllValuesNode(node: BTreeNode<K, V>, results: V[]): void {
    for (let i = 0; i < node.keys.length; i++) {
      if (!node.isLeaf) {
        this.getAllValuesNode(node.children[i], results);
      }
      results.push(node.values[i]);
    }
    
    if (!node.isLeaf && node.children.length > node.keys.length) {
      this.getAllValuesNode(node.children[node.children.length - 1], results);
    }
  }
}

/**
 * Multi-index system for KnowledgeGraph nodes
 * Provides fast lookups by ID, tags, content, and project
 */
export class KnowledgeGraphIndexSystem {
  // Primary index: node ID -> node
  private nodeIndex: BTree<string, DagNode>;
  
  // Secondary indices
  private tagIndex: BTree<string, Set<string>>; // tag -> Set<nodeId>
  private projectIndex: BTree<string, Set<string>>; // project -> Set<nodeId>
  private contentIndex: BTree<string, Set<string>>; // content term -> Set<nodeId>
  private createdAtIndex: BTree<string, string>; // timestamp -> nodeId
  
  // Full-text search support
  private readonly STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'may', 'might', 'must']);
  
  constructor() {
    this.nodeIndex = new BTree<string, DagNode>(64, (a, b) => a.localeCompare(b));
    this.tagIndex = new BTree<string, Set<string>>(32, (a, b) => a.localeCompare(b));
    this.projectIndex = new BTree<string, Set<string>>(32, (a, b) => a.localeCompare(b));
    this.contentIndex = new BTree<string, Set<string>>(32, (a, b) => a.localeCompare(b));
    this.createdAtIndex = new BTree<string, string>(64, (a, b) => a.localeCompare(b));
  }

  /**
   * Add or update a node in all indices - O(log n * m) where m is average terms per node
   */
  indexNode(node: DagNode): void {
    // Remove old version if exists
    this.removeNode(node.id);
    
    // Add to primary index
    this.nodeIndex.insert(node.id, node);
    
    // Add to timestamp index
    this.createdAtIndex.insert(node.createdAt, node.id);
    
    // Add to project index
    this.addToSecondaryIndex(this.projectIndex, node.project, node.id);
    
    // Add to tag indices
    if (node.tags) {
      for (const tag of node.tags) {
        this.addToSecondaryIndex(this.tagIndex, tag, node.id);
      }
    }
    
    // Add to content index (tokenized)
    const contentTerms = this.tokenizeContent(node.thought);
    for (const term of contentTerms) {
      this.addToSecondaryIndex(this.contentIndex, term, node.id);
    }
  }

  /**
   * Remove a node from all indices - O(log n * m)
   */
  removeNode(nodeId: string): boolean {
    const existingNode = this.nodeIndex.search(nodeId);
    if (!existingNode) {
      return false;
    }
    
    // Remove from primary index
    this.nodeIndex.delete(nodeId);
    
    // Remove from timestamp index
    this.createdAtIndex.delete(existingNode.createdAt);
    
    // Remove from project index
    this.removeFromSecondaryIndex(this.projectIndex, existingNode.project, nodeId);
    
    // Remove from tag indices
    if (existingNode.tags) {
      for (const tag of existingNode.tags) {
        this.removeFromSecondaryIndex(this.tagIndex, tag, nodeId);
      }
    }
    
    // Remove from content index
    const contentTerms = this.tokenizeContent(existingNode.thought);
    for (const term of contentTerms) {
      this.removeFromSecondaryIndex(this.contentIndex, term, nodeId);
    }
    
    return true;
  }

  /**
   * Get node by ID - O(log n)
   */
  getNode(nodeId: string): DagNode | undefined {
    return this.nodeIndex.search(nodeId);
  }

  /**
   * Get all nodes for a project - O(log n + k) where k is result size
   */
  getNodesByProject(project: string): DagNode[] {
    const nodeIds = this.projectIndex.search(project);
    if (!nodeIds) return [];
    
    return Array.from(nodeIds)
      .map(id => this.nodeIndex.search(id))
      .filter((node): node is DagNode => node !== undefined);
  }

  /**
   * Get all nodes with specific tags - O(log n + k)
   */
  getNodesByTags(tags: Tag[]): DagNode[] {
    if (tags.length === 0) return [];
    
    // Get intersection of all tag sets
    let resultIds: Set<string> | undefined;
    
    for (const tag of tags) {
      const tagNodeIds = this.tagIndex.search(tag);
      if (!tagNodeIds || tagNodeIds.size === 0) {
        return []; // No nodes have this tag
      }
      
      if (!resultIds) {
        resultIds = new Set(tagNodeIds);
      } else {
        resultIds = new Set(Array.from(resultIds).filter(id => tagNodeIds.has(id)));
      }
      
      if (resultIds.size === 0) {
        return []; // No intersection
      }
    }
    
    if (!resultIds) return [];
    
    return Array.from(resultIds)
      .map(id => this.nodeIndex.search(id))
      .filter((node): node is DagNode => node !== undefined);
  }

  /**
   * Search nodes by content - O(log n + k) per search term
   */
  searchContent(query: string): DagNode[] {
    const searchTerms = this.tokenizeContent(query);
    if (searchTerms.length === 0) return [];
    
    // Get union of all matching nodes
    const resultIds = new Set<string>();
    
    for (const term of searchTerms) {
      const termNodeIds = this.contentIndex.search(term);
      if (termNodeIds) {
        for (const nodeId of termNodeIds) {
          resultIds.add(nodeId);
        }
      }
    }
    
    return Array.from(resultIds)
      .map(id => this.nodeIndex.search(id))
      .filter((node): node is DagNode => node !== undefined);
  }

  /**
   * Get recent nodes by creation date - O(log n + k)
   */
  getRecentNodes(project: string, limit: number): DagNode[] {
    const projectNodeIds = this.projectIndex.search(project);
    if (!projectNodeIds) return [];
    
    // Get all timestamps for this project and sort
    const timestamps: string[] = [];
    for (const nodeId of projectNodeIds) {
      const node = this.nodeIndex.search(nodeId);
      if (node) {
        timestamps.push(node.createdAt);
      }
    }
    
    timestamps.sort().reverse(); // Most recent first
    
    return timestamps
      .slice(0, limit)
      .map(timestamp => this.createdAtIndex.search(timestamp))
      .filter((nodeId): nodeId is string => nodeId !== undefined)
      .map(nodeId => this.nodeIndex.search(nodeId))
      .filter((node): node is DagNode => node !== undefined);
  }

  /**
   * Get all projects - O(log n)
   */
  getAllProjects(): string[] {
    return this.projectIndex.getAllValues().map(nodeIds => Array.from(nodeIds)).flat()
      .map(nodeId => this.nodeIndex.search(nodeId))
      .filter((node): node is DagNode => node !== undefined)
      .map(node => node.project)
      .filter((project, index, array) => array.indexOf(project) === index); // Unique
  }

  /**
   * Clear all indices - O(1)
   */
  clear(): void {
    this.nodeIndex.clear();
    this.tagIndex.clear();
    this.projectIndex.clear();
    this.contentIndex.clear();
    this.createdAtIndex.clear();
  }

  /**
   * Get index statistics for monitoring
   */
  getStats(): {
    totalNodes: number;
    totalProjects: number;
    totalTags: number;
    totalContentTerms: number;
  } {
    return {
      totalNodes: this.nodeIndex.getAllValues().length,
      totalProjects: this.projectIndex.getAllValues().length,
      totalTags: this.tagIndex.getAllValues().length,
      totalContentTerms: this.contentIndex.getAllValues().length,
    };
  }

  private addToSecondaryIndex(index: BTree<string, Set<string>>, key: string, nodeId: string): void {
    let nodeIds = index.search(key);
    if (!nodeIds) {
      nodeIds = new Set<string>();
      index.insert(key, nodeIds);
    }
    nodeIds.add(nodeId);
  }

  private removeFromSecondaryIndex(index: BTree<string, Set<string>>, key: string, nodeId: string): void {
    const nodeIds = index.search(key);
    if (nodeIds) {
      nodeIds.delete(nodeId);
      if (nodeIds.size === 0) {
        index.delete(key);
      }
    }
  }

  private tokenizeContent(content: string): string[] {
    return content
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/)
      .filter(term => term.length > 2 && !this.STOP_WORDS.has(term)); // Filter short words and stop words
  }
}