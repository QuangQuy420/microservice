import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Supertest integration tests for the three T10 endpoints (AC3), run against a real
 * Postgres reachable via `DATABASE_URL` (same as the app), seeded by
 * `test/global-setup.ts` with a small, deterministic fixture: brand "E2E Test Brand",
 * category "E2E Test Category", and three products — two PUBLISHED (an AVIATOR and a
 * ROUND) and one DRAFT (a SQUARE) — see that file for exact values.
 *
 * The response envelope (`{data}` / `{data, meta}` / `{error}`), the 422 validation pipe and
 * the error filter come from `AppModule`'s APP_* providers, so this app answers exactly like
 * the one `main.ts` boots.
 */
describe('product-service (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('returns ok with no auth, outside the envelope', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  describe('GET /categories', () => {
    it('lists the seeded category', async () => {
      const res = await request(app.getHttpServer())
        .get('/categories')
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body).not.toHaveProperty('meta'); // unpaginated list
      const testCategory = res.body.data.find(
        (c: { slug: string }) => c.slug === 'e2e-test-category',
      );
      expect(testCategory).toBeDefined();
      expect(testCategory.name).toBe('E2E Test Category');
      expect(testCategory).not.toHaveProperty('parentId');
    });
  });

  describe('GET /products', () => {
    it('defaults to PUBLISHED products only, including variants + images', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .expect(200);

      // the DRAFT fixture product is excluded by default
      expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      const skus = res.body.data.map((p: { sku: string }) => p.sku);
      expect(skus).toEqual(
        expect.arrayContaining(['E2E-AVI-001', 'E2E-RND-002']),
      );
      expect(skus).not.toContain('E2E-SQR-003');

      const aviator = res.body.data.find(
        (p: { sku: string }) => p.sku === 'E2E-AVI-001',
      );
      expect(aviator.variants).toHaveLength(2);
      expect(aviator.images).toHaveLength(2);
      expect(aviator.brand.name).toBe('E2E Test Brand');
      expect(aviator.category.slug).toBe('e2e-test-category');
    });

    it('filters by frameShape', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ frameShape: 'ROUND' })
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].sku).toBe('E2E-RND-002');
    });

    it('can explicitly opt into non-PUBLISHED statuses', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ status: 'DRAFT' })
        .expect(200);

      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0].sku).toBe('E2E-SQR-003');
    });

    it('returns an empty page (not an error) when a filter matches nothing', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ frameShape: 'CAT_EYE' })
        .expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 0 });
    });

    it('paginates: page 1 of pageSize=1 then page 2 returns the other product', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/products')
        .query({ pageSize: 1, page: 1 })
        .expect(200);
      expect(page1.body.data).toHaveLength(1);
      expect(page1.body.meta).toEqual({ page: 1, pageSize: 1, total: 2 });

      const page2 = await request(app.getHttpServer())
        .get('/products')
        .query({ pageSize: 1, page: 2 })
        .expect(200);
      expect(page2.body.data).toHaveLength(1);
      expect(page2.body.meta.page).toBe(2);

      expect(page1.body.data[0].id).not.toBe(page2.body.data[0].id);
    });

    it('422s with field details on an invalid enum filter value', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .query({ frameShape: 'NOT_A_SHAPE' })
        .expect(422);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.error.details.frameShape)).toBe(true);
    });
  });

  describe('GET /products/:id', () => {
    it('returns full detail with variants + images for an existing product', async () => {
      const list = await request(app.getHttpServer())
        .get('/products')
        .query({ frameShape: 'AVIATOR' })
        .expect(200);
      const id = list.body.data[0].id;

      const res = await request(app.getHttpServer())
        .get(`/products/${id}`)
        .expect(200);

      expect(res.body.data.sku).toBe('E2E-AVI-001');
      expect(res.body.data.variants).toHaveLength(2);
      expect(res.body.data.images).toHaveLength(2);
    });

    it('404s for a well-formed but non-existent id', async () => {
      const res = await request(app.getHttpServer())
        .get('/products/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });

    it('400s for a malformed id', async () => {
      const res = await request(app.getHttpServer())
        .get('/products/not-a-uuid')
        .expect(400);

      expect(res.body.error.code).toBe('MALFORMED_REQUEST');
    });
  });
});
