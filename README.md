<div align="center">
  <img src="assets/hammr-logo.png" alt="Hammr Logo" width="200"/>
</div>

# @hammr/cdn

> Content-addressable CDN with storage abstraction for Cloudflare Workers, Node.js, and beyond.

[![npm version](https://img.shields.io/npm/v/@hammr/cdn.svg)](https://www.npmjs.com/package/@hammr/cdn)
[![License](https://img.shields.io/npm/l/@hammr/cdn.svg)](https://github.com/hammr/cdn/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)

## Features

- **Content-Addressable** - Automatic SHA256 hashing via [@hammr/normalizer](https://www.npmjs.com/package/@hammr/normalizer)
- **Idempotent Uploads** - Same content = same hash, stored once
- **Storage Abstraction** - R2, S3, Memory, FileSystem (bring your own!)
- **Auto Content-Type Detection** - 40+ file types recognized automatically
- **Immutable Artifacts** - Hash-based URLs with aggressive caching
- **HTTP Request Handler** - Drop-in handler for Cloudflare Workers
- **Production-Ready** - CORS, ETag, Cache-Control, error handling
- **Zero Config** - Works out of the box with sensible defaults
- **100% Test Coverage** - Fully tested and type-safe

## Installation

```bash
npm install @hammr/cdn
```

## Quick Start

### Cloudflare Workers (R2 Storage)

```typescript
import { CDN, R2Storage } from '@hammr/cdn';

export default {
  async fetch(request: Request, env: Env) {
    const cdn = new CDN({
      storage: new R2Storage(env.ARTIFACTS),
      baseUrl: 'https://cdn.example.com'
    });
    
    return cdn.handleRequest(request);
  }
}
```

### Programmatic Usage

```typescript
import { CDN, MemoryStorage } from '@hammr/cdn';

const cdn = new CDN({
  storage: new MemoryStorage(),
  baseUrl: 'https://cdn.example.com'
});

// Upload artifact
const imageBytes = await fetch('https://example.com/logo.png').then(r => r.arrayBuffer());
const result = await cdn.put(imageBytes, {
  filename: 'logo.png'
});

console.log(result.url);
// → https://cdn.example.com/a/5e884898da28047151d0e56f8dc629...png

// Retrieve artifact
const artifact = await cdn.get(result.hash);
console.log(artifact.metadata.contentType); // → image/png

// Delete artifact
await cdn.delete(result.hash);
```

## How It Works

1. **Upload** → Content is hashed with SHA256 (content-addressable)
2. **Store** → Artifact stored with hash as key (idempotent)
3. **Serve** → Immutable URL with aggressive caching
4. **Deduplicate** → Same content = same hash = stored once

```typescript
// Upload the same file twice
const upload1 = await cdn.put(bytes, { filename: 'logo.png' });
const upload2 = await cdn.put(bytes, { filename: 'logo.png' });

console.log(upload1.hash === upload2.hash); // → true
console.log(upload1.created); // → true (new upload)
console.log(upload2.created); // → false (already existed)
```

## API Reference

### `CDN`

#### Constructor

```typescript
new CDN(options: CDNOptions)
```

**Options:**
- `storage: StorageAdapter` - Storage backend (R2, Memory, etc.)
- `baseUrl: string` - Base URL for generating artifact URLs
- `cacheMaxAge?: number` - Cache-Control max-age in seconds (default: 31536000 = 1 year)
- `defaultContentType?: string` - Fallback content type (default: `application/octet-stream`)
- `cors?: boolean` - Enable CORS headers (default: `true`)

#### Methods

##### `put(content, metadata?): Promise<UploadResult>`

Upload an artifact and get content-addressable URL.

```typescript
const result = await cdn.put(imageBytes, {
  filename: 'logo.png',        // Optional: filename (used for content-type detection)
  contentType: 'image/png',    // Optional: override content-type
  customMetadata: {            // Optional: custom key-value metadata
    author: 'John Doe',
    version: '1.0'
  }
});

console.log(result);
// {
//   hash: '5e884898da28047151d0e56f8dc629...',
//   url: 'https://cdn.example.com/a/5e88489...png',
//   created: true,
//   metadata: {
//     contentType: 'image/png',
//     filename: 'logo.png',
//     size: 12345,
//     uploadedAt: 1609459200000,
//     customMetadata: { author: 'John Doe', version: '1.0' }
//   }
// }
```

##### `get(hash): Promise<StoredArtifact | null>`

Retrieve an artifact by hash.

```typescript
const artifact = await cdn.get('5e884898da28047151d0e56f8dc629...');

if (artifact) {
  console.log(artifact.hash);              // SHA256 hash
  console.log(artifact.body);              // ArrayBuffer | ReadableStream
  console.log(artifact.metadata);          // Metadata object
}
```

##### `delete(hash): Promise<boolean>`

Delete an artifact by hash.

```typescript
const deleted = await cdn.delete('5e884898da28047151d0e56f8dc629...');
console.log(deleted); // true if deleted, false if not found
```

##### `exists(hash): Promise<boolean>`

Check if an artifact exists.

```typescript
const exists = await cdn.exists('5e884898da28047151d0e56f8dc629...');
```

##### `list(options?): Promise<string[]>`

List all artifact hashes (if supported by storage adapter).

```typescript
const hashes = await cdn.list({ limit: 100 });
```

##### `handleRequest(request): Promise<Response>`

Handle HTTP requests (for Cloudflare Workers, Express, etc.).

**Supported Routes:**
- `PUT /artifact?filename=logo.png` - Upload artifact
- `GET /a/:hash` or `GET /a/:hash.ext` - Retrieve artifact
- `DELETE /a/:hash` - Delete artifact
- `OPTIONS *` - CORS preflight

```typescript
// Cloudflare Workers
export default {
  async fetch(request: Request, env: Env) {
    const cdn = new CDN({
      storage: new R2Storage(env.ARTIFACTS),
      baseUrl: 'https://cdn.example.com'
    });
    return cdn.handleRequest(request);
  }
}
```

## Storage Adapters

### R2Storage (Cloudflare R2)

```typescript
import { CDN, R2Storage } from '@hammr/cdn';

const cdn = new CDN({
  storage: new R2Storage(env.ARTIFACTS), // R2 binding from Cloudflare Workers
  baseUrl: 'https://cdn.example.com'
});
```

**Requirements:**
- Cloudflare Workers environment
- R2 bucket binding in `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "ARTIFACTS"
bucket_name = "my-cdn-artifacts"
```

### MemoryStorage (Development/Testing)

```typescript
import { CDN, MemoryStorage } from '@hammr/cdn';

const cdn = new CDN({
  storage: new MemoryStorage(),
  baseUrl: 'https://cdn.example.com'
});
```

**Note:** Data is lost on restart. Use for testing only.

### Custom Storage Adapter

Implement the `StorageAdapter` interface:

```typescript
import type { StorageAdapter, StoredArtifact, ArtifactMetadata } from '@hammr/cdn';

class S3Storage implements StorageAdapter {
  async put(hash: string, content: ArrayBuffer | Uint8Array, metadata?: ArtifactMetadata): Promise<void> {
    // Upload to S3
  }

  async get(hash: string): Promise<StoredArtifact | null> {
    // Retrieve from S3
  }

  async delete(hash: string): Promise<boolean> {
    // Delete from S3
  }

  async exists(hash: string): Promise<boolean> {
    // Check if exists in S3
  }

  async list?(options?: { limit?: number; cursor?: string }): Promise<string[]> {
    // List all hashes (optional)
  }
}

const cdn = new CDN({
  storage: new S3Storage(),
  baseUrl: 'https://cdn.example.com'
});
```

## Content-Type Detection

Automatic detection for 40+ file types:

| Extension | Content-Type |
|-----------|--------------|
| `.png`, `.jpg`, `.gif`, `.webp` | `image/*` |
| `.pdf`, `.json`, `.xml`, `.txt` | `application/*` or `text/*` |
| `.js`, `.mjs`, `.ts`, `.wasm` | `application/javascript`, etc. |
| `.mp3`, `.mp4`, `.webm`, `.ogg` | `audio/*` or `video/*` |
| `.woff`, `.woff2`, `.ttf`, `.otf` | `font/*` |

**Override detection:**

```typescript
await cdn.put(bytes, {
  filename: 'data.txt',
  contentType: 'application/json' // Override detected type
});
```

## HTTP API

### Upload Artifact

**Request:**
```http
PUT /artifact?filename=logo.png HTTP/1.1
Content-Type: image/png

[binary data]
```

**Response:**
```json
{
  "hash": "5e884898da28047151d0e56f8dc6296...",
  "url": "https://cdn.example.com/a/5e884898...png",
  "created": true,
  "metadata": {
    "contentType": "image/png",
    "filename": "logo.png",
    "size": 12345,
    "uploadedAt": 1609459200000
  }
}
```

### Retrieve Artifact

**Request:**
```http
GET /a/5e884898da28047151d0e56f8dc6296...png HTTP/1.1
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: image/png
Cache-Control: public, max-age=31536000, immutable
ETag: "5e884898da28047151d0e56f8dc6296..."
Access-Control-Allow-Origin: *

[binary data]
```

### Delete Artifact

**Request:**
```http
DELETE /a/5e884898da28047151d0e56f8dc6296... HTTP/1.1
```

**Response:**
```json
{
  "deleted": true,
  "hash": "5e884898da28047151d0e56f8dc6296..."
}
```

## Examples

### Upload from Form Data

```typescript
// Client-side
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('https://cdn.example.com/artifact?filename=logo.png', {
  method: 'PUT',
  body: await fileInput.files[0].arrayBuffer()
});

const result = await response.json();
console.log(result.url); // Use this URL in <img> tags, etc.
```

### Bulk Upload

```typescript
const files = ['logo.png', 'icon.svg', 'banner.jpg'];

const results = await Promise.all(
  files.map(async (filename) => {
    const bytes = await fs.readFile(filename);
    return cdn.put(bytes, { filename });
  })
);

console.log(results.map(r => r.url));
```

### Custom Metadata

```typescript
const result = await cdn.put(imageBytes, {
  filename: 'product.jpg',
  customMetadata: {
    productId: 'prod_123',
    uploadedBy: 'user_456',
    version: '2.0'
  }
});

// Retrieve metadata later
const artifact = await cdn.get(result.hash);
console.log(artifact.metadata.customMetadata.productId); // → prod_123
```

### Verify Upload Integrity

```typescript
import { sha256 } from '@hammr/normalizer';

// Client computes hash before upload
const clientHash = await sha256(Array.from(new Uint8Array(fileBytes))
  .map(b => String.fromCharCode(b)).join(''));

// Upload
const result = await cdn.put(fileBytes, { filename: 'file.dat' });

// Verify server returned same hash
if (result.hash === clientHash) {
  console.log('✅ Upload verified - content matches hash');
} else {
  console.error('❌ Upload corrupted - hashes do not match');
}
```

## Configuration

### Cache Strategy

```typescript
const cdn = new CDN({
  storage: new R2Storage(env.ARTIFACTS),
  baseUrl: 'https://cdn.example.com',
  cacheMaxAge: 31536000, // 1 year (default)
});
```

**Cache-Control header:**
```
Cache-Control: public, max-age=31536000, immutable
```

**Why immutable?**
Content-addressable URLs never change. The hash IS the content. Safe to cache forever.

### Disable CORS

```typescript
const cdn = new CDN({
  storage: new R2Storage(env.ARTIFACTS),
  baseUrl: 'https://cdn.example.com',
  cors: false, // Disable CORS headers
});
```

### Custom Base URL with Path

```typescript
const cdn = new CDN({
  storage: new R2Storage(env.ARTIFACTS),
  baseUrl: 'https://example.com/cdn', // Trailing slash removed automatically
});

const result = await cdn.put(bytes, { filename: 'logo.png' });
console.log(result.url);
// → https://example.com/cdn/a/5e884898...png
```

## Production Deployment

### Cloudflare Workers

**1. Install dependencies:**

```bash
npm install @hammr/cdn
```

**2. Configure `wrangler.toml`:**

```toml
name = "cdn-worker"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[[r2_buckets]]
binding = "ARTIFACTS"
bucket_name = "my-cdn-artifacts"
```

**3. Create worker:**

```typescript
// src/index.ts
import { CDN, R2Storage } from '@hammr/cdn';

interface Env {
  ARTIFACTS: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cdn = new CDN({
      storage: new R2Storage(env.ARTIFACTS),
      baseUrl: 'https://cdn.example.com'
    });

    return cdn.handleRequest(request);
  }
};
```

**4. Deploy:**

```bash
npx wrangler deploy
```

### Custom Domain

In Cloudflare dashboard:
1. Workers & Pages → your worker → Settings → Domains & Routes
2. Add custom domain: `cdn.example.com`
3. Update `baseUrl` in code to match

## Performance

### Benchmarks (Cloudflare Workers + R2)

- **Upload (PUT):** ~50ms (includes SHA256 hashing + R2 write)
- **Retrieve (GET):** ~10-30ms (R2 read, first request)
- **Retrieve (cached):** ~1-5ms (edge cache hit)
- **Delete:** ~20ms (R2 delete)

### Optimization Tips

1. **Use R2 for production** - Fast, cheap, globally distributed
2. **Enable Cloudflare Cache** - Artifacts cached at edge automatically
3. **Use HTTP/2** - Multiplexing for bulk uploads
4. **Compress before upload** - Use gzip/brotli for compressible files

## Troubleshooting

### "Cannot find module '@hammr/normalizer'"

The normalizer package is a required peer dependency:

```bash
npm install @hammr/normalizer
```

### R2 binding not found

Ensure `wrangler.toml` has R2 binding:

```toml
[[r2_buckets]]
binding = "ARTIFACTS"
bucket_name = "my-bucket"
```

And your worker receives it in `env`:

```typescript
interface Env {
  ARTIFACTS: R2Bucket;
}
```

### Content-Type not detected

Specify explicitly:

```typescript
await cdn.put(bytes, {
  contentType: 'application/custom'
});
```

### CORS errors

Ensure `cors: true` (default):

```typescript
const cdn = new CDN({
  storage: new R2Storage(env.ARTIFACTS),
  baseUrl: 'https://cdn.example.com',
  cors: true, // Enable CORS (default)
});
```

## Related Packages

- [@hammr/normalizer](https://www.npmjs.com/package/@hammr/normalizer) - PII normalization & SHA256 hashing (used internally)
- [@sygnl/identity-manager](https://www.npmjs.com/package/@traceos/identity-manager) - Session & identity tracking
- [@sygnl/health-check](https://www.npmjs.com/package/@traceos/health-check) - Production observability
- [@sygnl/event-schema](https://www.npmjs.com/package/@sygnl/event-schema) - Event schemas for e-commerce and SaaS

## License

Apache 2.0

## Contributing

Issues and PRs welcome! This package is part of the [Hammr](https://hammr.ai) ecosystem.

---

**Built with ❤️ by Edge Foundry, Inc.**
