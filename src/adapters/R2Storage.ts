/**
 * Cloudflare R2 storage adapter
 * 
 * Uses Cloudflare R2 for artifact storage.
 * 
 * Usage:
 * ```typescript
 * const storage = new R2Storage(env.ARTIFACTS);
 * ```
 */

import type { StorageAdapter, StoredArtifact, ArtifactMetadata } from '../types';

/**
 * Minimal R2 bucket interface
 * (matches Cloudflare Workers R2Bucket type)
 */
export interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream, options?: {
    httpMetadata?: {
      contentType?: string;
    };
    customMetadata?: Record<string, string>;
  }): Promise<any>;
  
  get(key: string): Promise<{
    body?: ReadableStream | ArrayBuffer;
    httpMetadata?: {
      contentType?: string;
    };
    customMetadata?: Record<string, string>;
    size?: number;
    uploaded?: Date;
  } | null>;
  
  delete(key: string): Promise<void>;
  
  head(key: string): Promise<{
    httpMetadata?: {
      contentType?: string;
    };
    customMetadata?: Record<string, string>;
    size?: number;
    uploaded?: Date;
  } | null>;
  
  list?(options?: { limit?: number; cursor?: string }): Promise<{
    objects: Array<{ key: string }>;
    truncated: boolean;
    cursor?: string;
  }>;
}

export class R2Storage implements StorageAdapter {
  constructor(private bucket: R2Bucket) {}

  async put(hash: string, content: ArrayBuffer | Uint8Array, metadata: ArtifactMetadata = {}): Promise<void> {
    await this.bucket.put(hash, content, {
      httpMetadata: {
        contentType: metadata.contentType,
      },
      customMetadata: {
        filename: metadata.filename || '',
        uploadedAt: String(metadata.uploadedAt || Date.now()),
        ...metadata.customMetadata,
      },
    });
  }

  async get(hash: string): Promise<StoredArtifact | null> {
    const obj = await this.bucket.get(hash);
    if (!obj || !obj.body) return null;

    return {
      hash,
      body: obj.body,
      metadata: {
        contentType: obj.httpMetadata?.contentType,
        filename: obj.customMetadata?.filename,
        size: obj.size,
        uploadedAt: obj.customMetadata?.uploadedAt ? Number(obj.customMetadata.uploadedAt) : undefined,
        customMetadata: obj.customMetadata,
      },
    };
  }

  async delete(hash: string): Promise<boolean> {
    const exists = await this.exists(hash);
    if (!exists) return false;
    await this.bucket.delete(hash);
    return true;
  }

  async exists(hash: string): Promise<boolean> {
    const obj = await this.bucket.head(hash);
    return obj !== null;
  }

  async list(options: { limit?: number; cursor?: string } = {}): Promise<string[]> {
    if (!this.bucket.list) {
      throw new Error('R2 list() not available in this environment');
    }

    const result = await this.bucket.list({
      limit: options.limit ?? 1000,
      cursor: options.cursor,
    });

    return result.objects.map((obj) => obj.key);
  }
}
