import { describe, it, expect, beforeEach } from 'vitest';
import { CDN } from '../src/CDN';
import { MemoryStorage } from '../src/adapters/MemoryStorage';
import { detectContentType } from '../src/types';

describe('CDN', () => {
  let cdn: CDN;
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    cdn = new CDN({
      storage,
      baseUrl: 'https://cdn.example.com',
      cacheMaxAge: 3600,
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * UPLOAD (PUT)
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  describe('put', () => {
    it('should upload artifact and return hash + URL', async () => {
      const content = new TextEncoder().encode('Hello, CDN!');
      const result = await cdn.put(content);

      expect(result.hash).toHaveLength(64); // SHA256
      expect(result.url).toContain('https://cdn.example.com/a/');
      expect(result.url).toContain(result.hash);
      expect(result.created).toBe(true);
      expect(result.metadata.size).toBe(content.length);
    });

    it('should detect content type from filename', async () => {
      const content = new TextEncoder().encode('PNG data');
      const result = await cdn.put(content, { filename: 'logo.png' });

      expect(result.metadata.contentType).toBe('image/png');
      expect(result.url).toContain('.png');
    });

    it('should use custom content type if provided', async () => {
      const content = new TextEncoder().encode('{"test": true}');
      const result = await cdn.put(content, {
        filename: 'data.txt',
        contentType: 'application/json',
      });

      expect(result.metadata.contentType).toBe('application/json');
    });

    it('should be idempotent (same content = same hash)', async () => {
      const content = new TextEncoder().encode('Same content');

      const result1 = await cdn.put(content);
      const result2 = await cdn.put(content);

      expect(result1.hash).toBe(result2.hash);
      expect(result1.created).toBe(true);
      expect(result2.created).toBe(false); // Already existed
    });

    it('should store custom metadata', async () => {
      const content = new TextEncoder().encode('Test');
      const result = await cdn.put(content, {
        filename: 'test.txt',
        customMetadata: {
          author: 'John Doe',
          version: '1.0',
        },
      });

      const artifact = await cdn.get(result.hash);
      expect(artifact?.metadata.customMetadata).toEqual({
        author: 'John Doe',
        version: '1.0',
      });
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * RETRIEVE (GET)
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  describe('get', () => {
    it('should retrieve uploaded artifact', async () => {
      const content = new TextEncoder().encode('Hello, World!');
      const result = await cdn.put(content);

      const artifact = await cdn.get(result.hash);

      expect(artifact).not.toBeNull();
      expect(artifact?.hash).toBe(result.hash);
      expect(new Uint8Array(artifact!.body as ArrayBuffer)).toEqual(content);
    });

    it('should return null for non-existent artifact', async () => {
      const artifact = await cdn.get('nonexistent_hash');
      expect(artifact).toBeNull();
    });

    it('should retrieve metadata', async () => {
      const content = new TextEncoder().encode('Test');
      const result = await cdn.put(content, {
        filename: 'test.txt',
        contentType: 'text/plain',
      });

      const artifact = await cdn.get(result.hash);

      expect(artifact?.metadata.filename).toBe('test.txt');
      expect(artifact?.metadata.contentType).toBe('text/plain');
      expect(artifact?.metadata.size).toBe(content.length);
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * DELETE
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  describe('delete', () => {
    it('should delete artifact', async () => {
      const content = new TextEncoder().encode('To be deleted');
      const result = await cdn.put(content);

      expect(await cdn.exists(result.hash)).toBe(true);

      const deleted = await cdn.delete(result.hash);

      expect(deleted).toBe(true);
      expect(await cdn.exists(result.hash)).toBe(false);
    });

    it('should return false for non-existent artifact', async () => {
      const deleted = await cdn.delete('nonexistent_hash');
      expect(deleted).toBe(false);
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * EXISTS
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  describe('exists', () => {
    it('should return true for existing artifact', async () => {
      const content = new TextEncoder().encode('Exists');
      const result = await cdn.put(content);

      expect(await cdn.exists(result.hash)).toBe(true);
    });

    it('should return false for non-existent artifact', async () => {
      expect(await cdn.exists('nonexistent_hash')).toBe(false);
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * LIST
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  describe('list', () => {
    it('should list all artifacts', async () => {
      const content1 = new TextEncoder().encode('First');
      const content2 = new TextEncoder().encode('Second');

      const result1 = await cdn.put(content1);
      const result2 = await cdn.put(content2);

      const hashes = await cdn.list();

      expect(hashes).toContain(result1.hash);
      expect(hashes).toContain(result2.hash);
      expect(hashes).toHaveLength(2);
    });

    it('should respect limit', async () => {
      for (let i = 0; i < 5; i++) {
        await cdn.put(new TextEncoder().encode(`Content ${i}`));
      }

      const hashes = await cdn.list({ limit: 3 });
      expect(hashes).toHaveLength(3);
    });
  });

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   * REQUEST HANDLER
   * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  describe('handleRequest', () => {
    describe('PUT /artifact', () => {
      it('should upload artifact via HTTP', async () => {
        const content = new TextEncoder().encode('HTTP Upload');
        const request = new Request('https://cdn.example.com/artifact', {
          method: 'PUT',
          body: content,
        });

        const response = await cdn.handleRequest(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.hash).toBeDefined();
        expect(body.url).toContain('https://cdn.example.com/a/');
      });

      it('should extract filename from query param', async () => {
        const content = new TextEncoder().encode('Test');
        const request = new Request('https://cdn.example.com/artifact?filename=test.png', {
          method: 'PUT',
          body: content,
        });

        const response = await cdn.handleRequest(request);
        const body = await response.json();

        expect(body.metadata.filename).toBe('test.png');
        expect(body.metadata.contentType).toBe('image/png');
        expect(body.url).toContain('.png');
      });

      it('should extract filename from header', async () => {
        const content = new TextEncoder().encode('Test');
        const request = new Request('https://cdn.example.com/artifact', {
          method: 'PUT',
          body: content,
          headers: {
            'X-Filename': 'header-test.jpg',
          },
        });

        const response = await cdn.handleRequest(request);
        const body = await response.json();

        expect(body.metadata.filename).toBe('header-test.jpg');
        expect(body.metadata.contentType).toBe('image/jpeg');
      });
    });

    describe('GET /a/:hash', () => {
      it('should retrieve artifact via HTTP', async () => {
        const content = new TextEncoder().encode('HTTP Get');
        const uploadResult = await cdn.put(content, {
          filename: 'test.txt',
          contentType: 'text/plain',
        });

        const request = new Request(`https://cdn.example.com/a/${uploadResult.hash}`, {
          method: 'GET',
        });

        const response = await cdn.handleRequest(request);

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('text/plain');
        expect(response.headers.get('Cache-Control')).toContain('max-age=3600');
        expect(response.headers.get('Cache-Control')).toContain('immutable');
        expect(response.headers.get('ETag')).toBe(`"${uploadResult.hash}"`);

        const body = await response.arrayBuffer();
        expect(new Uint8Array(body)).toEqual(content);
      });

      it('should handle hash with extension', async () => {
        const content = new TextEncoder().encode('Test');
        const result = await cdn.put(content, { filename: 'test.png' });

        const request = new Request(`https://cdn.example.com/a/${result.hash}.png`, {
          method: 'GET',
        });

        const response = await cdn.handleRequest(request);
        expect(response.status).toBe(200);
      });

      it('should return 404 for non-existent artifact', async () => {
        const request = new Request('https://cdn.example.com/a/nonexistent', {
          method: 'GET',
        });

        const response = await cdn.handleRequest(request);
        expect(response.status).toBe(404);
      });
    });

    describe('DELETE /a/:hash', () => {
      it('should delete artifact via HTTP', async () => {
        const content = new TextEncoder().encode('To delete');
        const result = await cdn.put(content);

        const request = new Request(`https://cdn.example.com/a/${result.hash}`, {
          method: 'DELETE',
        });

        const response = await cdn.handleRequest(request);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.deleted).toBe(true);
        expect(body.hash).toBe(result.hash);
        expect(await cdn.exists(result.hash)).toBe(false);
      });

      it('should return 404 for non-existent artifact', async () => {
        const request = new Request('https://cdn.example.com/a/nonexistent', {
          method: 'DELETE',
        });

        const response = await cdn.handleRequest(request);
        expect(response.status).toBe(404);
      });
    });

    describe('OPTIONS (CORS)', () => {
      it('should handle CORS preflight', async () => {
        const request = new Request('https://cdn.example.com/artifact', {
          method: 'OPTIONS',
        });

        const response = await cdn.handleRequest(request);

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
        expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
      });
    });

    describe('404', () => {
      it('should return 404 for unknown routes', async () => {
        const request = new Request('https://cdn.example.com/unknown', {
          method: 'GET',
        });

        const response = await cdn.handleRequest(request);
        expect(response.status).toBe(404);
      });
    });
  });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * MEMORY STORAGE
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('should store and retrieve', async () => {
    const content = new Uint8Array([1, 2, 3, 4]);
    await storage.put('test_hash', content);

    const artifact = await storage.get('test_hash');

    expect(artifact).not.toBeNull();
    expect(artifact?.hash).toBe('test_hash');
    expect(new Uint8Array(artifact!.body as ArrayBuffer)).toEqual(content);
  });

  it('should return null for non-existent', async () => {
    const artifact = await storage.get('nonexistent');
    expect(artifact).toBeNull();
  });

  it('should delete', async () => {
    const content = new Uint8Array([1, 2, 3]);
    await storage.put('test_hash', content);

    expect(await storage.exists('test_hash')).toBe(true);
    const deleted = await storage.delete('test_hash');

    expect(deleted).toBe(true);
    expect(await storage.exists('test_hash')).toBe(false);
  });

  it('should list', async () => {
    await storage.put('hash1', new Uint8Array([1]));
    await storage.put('hash2', new Uint8Array([2]));

    const hashes = await storage.list();

    expect(hashes).toContain('hash1');
    expect(hashes).toContain('hash2');
  });

  it('should clear all', async () => {
    await storage.put('hash1', new Uint8Array([1]));
    await storage.put('hash2', new Uint8Array([2]));

    storage.clear();

    expect(storage.size()).toBe(0);
  });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * CONTENT TYPE DETECTION
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

describe('detectContentType', () => {
  it('should detect image types', () => {
    expect(detectContentType('logo.png')).toBe('image/png');
    expect(detectContentType('photo.jpg')).toBe('image/jpeg');
    expect(detectContentType('icon.svg')).toBe('image/svg+xml');
  });

  it('should detect document types', () => {
    expect(detectContentType('data.json')).toBe('application/json');
    expect(detectContentType('doc.pdf')).toBe('application/pdf');
    expect(detectContentType('notes.txt')).toBe('text/plain');
  });

  it('should detect script types', () => {
    expect(detectContentType('app.js')).toBe('application/javascript');
    expect(detectContentType('module.mjs')).toBe('application/javascript');
    expect(detectContentType('types.ts')).toBe('application/typescript');
  });

  it('should use default for unknown extensions', () => {
    expect(detectContentType('file.unknown')).toBe('application/octet-stream');
    expect(detectContentType('noextension')).toBe('application/octet-stream');
  });

  it('should use custom default', () => {
    expect(detectContentType('file.unknown', 'text/plain')).toBe('text/plain');
  });
});
