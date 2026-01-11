/**
 * @sygnl/cdn
 * 
 * Content-addressable CDN with storage abstraction.
 * 
 * @example
 * ```typescript
 * import { CDN, R2Storage } from '@sygnl/cdn';
 * 
 * // Cloudflare Workers
 * export default {
 *   async fetch(request, env) {
 *     const cdn = new CDN({
 *       storage: new R2Storage(env.ARTIFACTS),
 *       baseUrl: 'https://cdn.example.com'
 *     });
 *     return cdn.handleRequest(request);
 *   }
 * }
 * 
 * // Manual usage
 * const result = await cdn.put(imageBytes, { filename: 'logo.png' });
 * console.log(result.url); // https://cdn.example.com/a/5e88489...
 * ```
 */

export { CDN } from './CDN';
export { MemoryStorage, R2Storage } from './adapters';
export type { R2Bucket } from './adapters';
export type {
  CDNOptions,
  StorageAdapter,
  StoredArtifact,
  ArtifactMetadata,
  UploadResult,
} from './types';
export { detectContentType, CONTENT_TYPES } from './types';
