/**
 * In-memory storage adapter
 * 
 * Useful for:
 * - Testing
 * - Development
 * - Temporary caching
 * 
 * NOT for production (data lost on restart)
 */

import type { StorageAdapter, StoredArtifact, ArtifactMetadata } from '../types';

export class MemoryStorage implements StorageAdapter {
  private storage: Map<string, { content: Uint8Array; metadata: ArtifactMetadata }> = new Map();

  async put(hash: string, content: ArrayBuffer | Uint8Array, metadata: ArtifactMetadata = {}): Promise<void> {
    const bytes = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
    this.storage.set(hash, {
      content: bytes,
      metadata: {
        size: bytes.length,
        uploadedAt: Date.now(),
        ...metadata,
      },
    });
  }

  async get(hash: string): Promise<StoredArtifact | null> {
    const stored = this.storage.get(hash);
    if (!stored) return null;

    return {
      hash,
      body: stored.content.buffer as ArrayBuffer,
      metadata: stored.metadata,
    };
  }

  async delete(hash: string): Promise<boolean> {
    return this.storage.delete(hash);
  }

  async exists(hash: string): Promise<boolean> {
    return this.storage.has(hash);
  }

  async list(options: { limit?: number; cursor?: string } = {}): Promise<string[]> {
    const hashes = Array.from(this.storage.keys());
    const limit = options.limit ?? 1000;
    return hashes.slice(0, limit);
  }

  /**
   * Clear all stored artifacts (useful for testing)
   */
  clear(): void {
    this.storage.clear();
  }

  /**
   * Get storage size (number of artifacts)
   */
  size(): number {
    return this.storage.size;
  }
}
