/**
 * Type definitions for CDN storage system
 */

/**
 * Metadata for stored artifacts
 */
export interface ArtifactMetadata {
  /**
   * Content-Type header (e.g., 'image/png', 'application/json')
   */
  contentType?: string;

  /**
   * Original filename (if provided)
   */
  filename?: string;

  /**
   * File size in bytes
   */
  size?: number;

  /**
   * Upload timestamp (Unix milliseconds)
   */
  uploadedAt?: number;

  /**
   * Custom metadata fields
   */
  customMetadata?: Record<string, string>;
}

/**
 * Stored artifact with content and metadata
 */
export interface StoredArtifact {
  /**
   * Content-addressable hash (SHA256)
   */
  hash: string;

  /**
   * Artifact content (raw bytes)
   */
  body: ArrayBuffer | ReadableStream | Uint8Array;

  /**
   * Metadata about the artifact
   */
  metadata: ArtifactMetadata;
}

/**
 * Result from uploading an artifact
 */
export interface UploadResult {
  /**
   * Content-addressable hash
   */
  hash: string;

  /**
   * Public URL to access the artifact
   */
  url: string;

  /**
   * Whether this was a new upload (true) or already existed (false)
   */
  created: boolean;

  /**
   * Artifact metadata
   */
  metadata: ArtifactMetadata;
}

/**
 * Storage adapter interface
 * 
 * Implement this to support different storage backends (R2, S3, etc.)
 */
export interface StorageAdapter {
  /**
   * Store artifact content with hash as key
   * 
   * @param hash - Content-addressable hash (SHA256)
   * @param content - Raw bytes to store
   * @param metadata - Optional metadata
   */
  put(hash: string, content: ArrayBuffer | Uint8Array, metadata?: ArtifactMetadata): Promise<void>;

  /**
   * Retrieve artifact by hash
   * 
   * @param hash - Content-addressable hash
   * @returns Artifact or null if not found
   */
  get(hash: string): Promise<StoredArtifact | null>;

  /**
   * Delete artifact by hash
   * 
   * @param hash - Content-addressable hash
   * @returns true if deleted, false if not found
   */
  delete(hash: string): Promise<boolean>;

  /**
   * Check if artifact exists
   * 
   * @param hash - Content-addressable hash
   * @returns true if exists, false otherwise
   */
  exists(hash: string): Promise<boolean>;

  /**
   * List all artifact hashes (optional, for admin/debugging)
   * 
   * @param options - List options (limit, cursor, etc.)
   * @returns Array of hashes
   */
  list?(options?: { limit?: number; cursor?: string }): Promise<string[]>;
}

/**
 * Options for CDN
 */
export interface CDNOptions {
  /**
   * Storage adapter (R2, S3, Memory, etc.)
   */
  storage: StorageAdapter;

  /**
   * Base URL for generating artifact URLs
   * @example 'https://cdn.example.com'
   */
  baseUrl: string;

  /**
   * Cache-Control max-age in seconds
   * @default 31536000 (1 year)
   */
  cacheMaxAge?: number;

  /**
   * Default content type if not detected
   * @default 'application/octet-stream'
   */
  defaultContentType?: string;

  /**
   * Enable CORS headers
   * @default true
   */
  cors?: boolean;
}

/**
 * Content type map for common extensions
 */
export const CONTENT_TYPES: Record<string, string> = {
  // Images
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'ico': 'image/x-icon',

  // Documents
  'pdf': 'application/pdf',
  'json': 'application/json',
  'xml': 'application/xml',
  'txt': 'text/plain',
  'html': 'text/html',
  'css': 'text/css',
  'csv': 'text/csv',

  // Scripts
  'js': 'application/javascript',
  'mjs': 'application/javascript',
  'ts': 'application/typescript',
  'wasm': 'application/wasm',

  // Archives
  'zip': 'application/zip',
  'gz': 'application/gzip',
  'tar': 'application/x-tar',

  // Media
  'mp3': 'audio/mpeg',
  'mp4': 'video/mp4',
  'webm': 'video/webm',
  'ogg': 'audio/ogg',

  // Fonts
  'woff': 'font/woff',
  'woff2': 'font/woff2',
  'ttf': 'font/ttf',
  'otf': 'font/otf',
};

/**
 * Detect content type from filename extension
 */
export function detectContentType(filename: string, defaultType = 'application/octet-stream'): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? (CONTENT_TYPES[ext] || defaultType) : defaultType;
}
