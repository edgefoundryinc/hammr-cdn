/**
 * CDN - Content-Addressable Storage System
 * 
 * Features:
 * - Content-addressable (SHA256 hashing via @sygnl/normalizer)
 * - Storage abstraction (R2, S3, Memory, etc.)
 * - Automatic content-type detection
 * - Immutable artifacts (hash-based URLs)
 * - Cache-friendly headers
 */

import { sha256 } from '@sygnl/normalizer';
import type {
  CDNOptions,
  StorageAdapter,
  UploadResult,
  StoredArtifact,
  ArtifactMetadata,
} from './types';
import { detectContentType } from './types';

export class CDN {
  private storage: StorageAdapter;
  private baseUrl: string;
  private cacheMaxAge: number;
  private defaultContentType: string;
  private cors: boolean;

  constructor(options: CDNOptions) {
    this.storage = options.storage;
    this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.cacheMaxAge = options.cacheMaxAge ?? 31536000; // 1 year default
    this.defaultContentType = options.defaultContentType ?? 'application/octet-stream';
    this.cors = options.cors ?? true;
  }

  /**
   * Upload an artifact and get content-addressable URL
   * 
   * @param content - Raw bytes to upload
   * @param metadata - Optional metadata (filename, contentType, etc.)
   * @returns Upload result with hash and URL
   * 
   * @example
   * ```typescript
   * const result = await cdn.put(imageBytes, {
   *   filename: 'logo.png',
   *   contentType: 'image/png'
   * });
   * 
   * console.log(result.url); // https://cdn.example.com/a/5e88489...
   * ```
   */
  async put(
    content: ArrayBuffer | Uint8Array,
    metadata: Partial<ArtifactMetadata> = {}
  ): Promise<UploadResult> {
    // Convert to Uint8Array for consistent hashing
    const bytes = content instanceof ArrayBuffer ? new Uint8Array(content) : content;

    // Hash the content (content-addressable)
    const hash = await sha256(Array.from(bytes).map(b => String.fromCharCode(b)).join(''));

    // Check if already exists (idempotent uploads)
    const exists = await this.storage.exists(hash);

    // Detect content type from filename if not provided
    const contentType = metadata.contentType ||
      (metadata.filename ? detectContentType(metadata.filename, this.defaultContentType) : this.defaultContentType);

    const fullMetadata: ArtifactMetadata = {
      contentType,
      filename: metadata.filename,
      size: bytes.length,
      uploadedAt: Date.now(),
      customMetadata: metadata.customMetadata,
    };

    // Store artifact
    await this.storage.put(hash, bytes, fullMetadata);

    // Generate URL with optional filename extension
    const ext = metadata.filename?.split('.').pop();
    const urlPath = ext ? `${hash}.${ext}` : hash;

    return {
      hash,
      url: `${this.baseUrl}/a/${urlPath}`,
      created: !exists,
      metadata: fullMetadata,
    };
  }

  /**
   * Retrieve an artifact by hash
   * 
   * @param hash - Content-addressable hash
   * @returns Artifact or null if not found
   * 
   * @example
   * ```typescript
   * const artifact = await cdn.get('5e884898...');
   * if (artifact) {
   *   console.log(artifact.metadata.contentType);
   * }
   * ```
   */
  async get(hash: string): Promise<StoredArtifact | null> {
    return this.storage.get(hash);
  }

  /**
   * Delete an artifact by hash
   * 
   * @param hash - Content-addressable hash
   * @returns true if deleted, false if not found
   * 
   * @example
   * ```typescript
   * const deleted = await cdn.delete('5e884898...');
   * ```
   */
  async delete(hash: string): Promise<boolean> {
    return this.storage.delete(hash);
  }

  /**
   * Check if artifact exists
   * 
   * @param hash - Content-addressable hash
   * @returns true if exists
   */
  async exists(hash: string): Promise<boolean> {
    return this.storage.exists(hash);
  }

  /**
   * List all artifacts (if supported by storage adapter)
   * 
   * @param options - List options
   * @returns Array of hashes
   */
  async list(options?: { limit?: number; cursor?: string }): Promise<string[]> {
    if (!this.storage.list) {
      throw new Error('Storage adapter does not support list()');
    }
    return this.storage.list(options);
  }

  /**
   * Handle HTTP request (for Cloudflare Workers, Express, etc.)
   * 
   * Routes:
   * - PUT /artifact - Upload artifact
   * - GET /a/:hash(.ext) - Retrieve artifact
   * - DELETE /a/:hash - Delete artifact
   * 
   * @param request - HTTP request
   * @returns HTTP response
   * 
   * @example
   * ```typescript
   * export default {
   *   async fetch(request, env) {
   *     const cdn = new CDN({
   *       storage: new R2Storage(env.ARTIFACTS),
   *       baseUrl: 'https://cdn.example.com'
   *     });
   *     return cdn.handleRequest(request);
   *   }
   * }
   * ```
   */
  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PUT /artifact - Upload artifact
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (method === 'PUT' && url.pathname === '/artifact') {
      try {
        const bytes = await request.arrayBuffer();
        
        // Extract filename from query param or header
        const filename = url.searchParams.get('filename') ||
          request.headers.get('x-filename') ||
          undefined;

        const contentType = request.headers.get('content-type') || undefined;

        const result = await this.put(bytes, { filename, contentType });

        return new Response(JSON.stringify(result, null, 2), {
          status: 200,
          headers: this.getCORSHeaders({
            'Content-Type': 'application/json',
          }),
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ error: error instanceof Error ? error.message : 'Upload failed' }),
          {
            status: 500,
            headers: this.getCORSHeaders({ 'Content-Type': 'application/json' }),
          }
        );
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // GET /a/:hash(.ext) - Retrieve artifact
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (method === 'GET' && url.pathname.startsWith('/a/')) {
      const filename = url.pathname.replace('/a/', '');
      const hash = filename.split('.')[0]; // Remove extension if present

      try {
        const artifact = await this.get(hash);
        
        if (!artifact) {
          return new Response('Not found', {
            status: 404,
            headers: this.getCORSHeaders(),
          });
        }

        const contentType = artifact.metadata.contentType || this.defaultContentType;

        return new Response(artifact.body, {
          status: 200,
          headers: this.getCORSHeaders({
            'Content-Type': contentType,
            'Cache-Control': `public, max-age=${this.cacheMaxAge}, immutable`,
            'ETag': `"${hash}"`,
          }),
        });
      } catch (error) {
        return new Response('Internal server error', {
          status: 500,
          headers: this.getCORSHeaders(),
        });
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // DELETE /a/:hash - Delete artifact
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (method === 'DELETE' && url.pathname.startsWith('/a/')) {
      const filename = url.pathname.replace('/a/', '');
      const hash = filename.split('.')[0];

      try {
        const deleted = await this.delete(hash);

        if (!deleted) {
          return new Response('Not found', {
            status: 404,
            headers: this.getCORSHeaders(),
          });
        }

        return new Response(JSON.stringify({ deleted: true, hash }), {
          status: 200,
          headers: this.getCORSHeaders({ 'Content-Type': 'application/json' }),
        });
      } catch (error) {
        return new Response('Internal server error', {
          status: 500,
          headers: this.getCORSHeaders(),
        });
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // OPTIONS - CORS preflight
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: this.getCORSHeaders(),
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 404 - Not found
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    return new Response('Not found', {
      status: 404,
      headers: this.getCORSHeaders(),
    });
  }

  /**
   * Get CORS headers if enabled
   */
  private getCORSHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
    if (!this.cors) return additionalHeaders;

    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Filename',
      'Access-Control-Max-Age': '86400',
      ...additionalHeaders,
    };
  }
}
