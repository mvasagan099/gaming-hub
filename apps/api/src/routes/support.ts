import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@gaming-hub/db";
import { authenticate } from "../plugins/authenticate";
import { parseSchema, routeParams, queryParams, queryString } from "../lib/http";
import { clampPagination } from "@gaming-hub/shared";
import { requirePermission } from "../lib/permissions";
import {
  listCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  listArticles,
  getArticleBySlug,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
  setArticleStatus,
  getContentForPage,
  createPageMapping,
  updatePageMapping,
  deletePageMapping,
  listPageMappings,
  searchSupportContent,
  createFeedback,
  getSupportAnalytics,
} from "../services/support";
import { SUPPORTED_PAGE_ROUTES } from "@gaming-hub/shared";

// Validation schemas
const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(500).optional(),
  icon: z.string().max(50).optional(),
  sortOrder: z.number().int().default(0),
});

const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  icon: z.string().max(50).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const createArticleSchema = z.object({
  categoryId: z.string(),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(10000),
  contentType: z.enum(["FAQ", "QUICK_ACTION", "GUIDE", "TROUBLESHOOTING", "NOTE", "LINK", "TUTORIAL"]).default("FAQ"),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  tags: z.array(z.string().max(50)).default([]),
  keywords: z.array(z.string().max(50)).default([]),
  quickAction: z.object({
    label: z.string(),
    action: z.string(),
    link: z.string().optional(),
    icon: z.string().optional(),
  }).optional(),
  sortOrder: z.number().int().default(0),
  pageRoutes: z.array(z.string()).optional(),
});

const updateArticleSchema = z.object({
  categoryId: z.string().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).max(10000).optional(),
  contentType: z.enum(["FAQ", "QUICK_ACTION", "GUIDE", "TROUBLESHOOTING", "NOTE", "LINK", "TUTORIAL"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  tags: z.array(z.string().max(50)).optional(),
  keywords: z.array(z.string().max(50)).optional(),
  quickAction: z.object({
    label: z.string(),
    action: z.string(),
    link: z.string().optional(),
    icon: z.string().optional(),
  }).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

const createMappingSchema = z.object({
  articleId: z.string(),
  pageRoute: z.string().min(1),
  context: z.string().optional(),
  priority: z.number().int().default(0),
});

const updateMappingSchema = z.object({
  context: z.string().optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const searchSchema = z.object({
  query: z.string().trim().min(1).max(200),
  pageRoute: z.string().optional(),
  contentTypes: z.array(z.enum(["FAQ", "QUICK_ACTION", "GUIDE", "TROUBLESHOOTING", "NOTE", "LINK", "TUTORIAL"])).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

const feedbackSchema = z.object({
  articleId: z.string(),
  isHelpful: z.boolean(),
  feedback: z.string().max(500).optional(),
  pageRoute: z.string().optional(),
});

export async function supportRoutes(app: FastifyInstance) {
  // ============================================================================
  // Public routes (no auth required)
  // ============================================================================

  // Get content for current page
  app.get("/api/support/page-content", async (request) => {
    const q = queryParams(request);
    const pageRoute = queryString(q.pageRoute) || "/";
    return getContentForPage(pageRoute);
  });

  // Search support content
  app.get("/api/support/search", async (request) => {
    const q = queryParams(request);
    const query = queryString(q.query) || "";
    const pageRoute = queryString(q.pageRoute) || undefined;
    const limit = Math.min(50, Math.max(1, Number(q.limit) || 10));

    return searchSupportContent({
      query,
      pageRoute,
      limit,
    });
  });

  // Get article by slug
  app.get("/api/support/articles/:slug", async (request) => {
    const { slug } = routeParams(request);
    return getArticleBySlug(slug, true);
  });

  // List categories
  app.get("/api/support/categories", async () => {
    return listCategories();
  });

  // Get category by slug
  app.get("/api/support/categories/:slug", async (request) => {
    const { slug } = routeParams(request);
    return getCategoryBySlug(slug);
  });

  // Submit feedback
  app.post("/api/support/feedback", async (request) => {
    const userId = (request as { user?: { id: string } }).user?.id;
    const input = parseSchema(feedbackSchema, request.body);
    return createFeedback(input, userId);
  });

  // Get supported pages
  app.get("/api/support/supported-pages", async () => {
    return SUPPORTED_PAGE_ROUTES;
  });

  // ============================================================================
  // Admin routes (require authentication and permissions)
  // ============================================================================

  // Categories (Admin)
  app.post("/api/admin/support/categories", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:crm:manage", prisma);
    const input = parseSchema(createCategorySchema, request.body);
    return createCategory(input, admin.id);
  });

  app.patch("/api/admin/support/categories/:id", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:crm:manage", prisma);
    const { id } = routeParams(request);
    const input = parseSchema(updateCategorySchema, request.body);
    return updateCategory(id, input);
  });

  app.delete("/api/admin/support/categories/:id", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:crm:manage", prisma);
    const { id } = routeParams(request);
    return deleteCategory(id);
  });

  // Articles (Admin)
  app.get("/api/admin/support/articles", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:crm:view", prisma);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const categoryId = queryString(q.categoryId) || undefined;
    const contentType = queryString(q.contentType) as "FAQ" | "QUICK_ACTION" | "GUIDE" | "TROUBLESHOOTING" | "NOTE" | "LINK" | "TUTORIAL" | undefined;
    const status = queryString(q.status) as "DRAFT" | "PUBLISHED" | "ARCHIVED" | undefined;
    const tag = queryString(q.tag) || undefined;

    return listArticles(page, pageSize, { categoryId, contentType, status, tag });
  });

  app.post("/api/admin/support/articles", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:crm:manage", prisma);
    const input = parseSchema(createArticleSchema, request.body);
    return createArticle(input, admin.id);
  });

  app.get("/api/admin/support/articles/:id", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:crm:view", prisma);
    const { id } = routeParams(request);
    return getArticleById(id);
  });

  app.patch("/api/admin/support/articles/:id", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:crm:manage", prisma);
    const { id } = routeParams(request);
    const input = parseSchema(updateArticleSchema, request.body);
    return updateArticle(id, input, admin.id);
  });

  app.patch("/api/admin/support/articles/:id/status", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:crm:manage", prisma);
    const { id } = routeParams(request);
    const { status } = parseSchema(z.object({ status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }), request.body);
    return setArticleStatus(id, status);
  });

  app.delete("/api/admin/support/articles/:id", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:crm:manage", prisma);
    const { id } = routeParams(request);
    return deleteArticle(id);
  });

  // Page Mappings (Admin)
  app.get("/api/admin/support/mappings", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:crm:view", prisma);
    const q = queryParams(request);
    const articleId = queryString(q.articleId) || undefined;
    return listPageMappings(articleId);
  });

  app.post("/api/admin/support/mappings", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:crm:manage", prisma);
    const input = parseSchema(createMappingSchema, request.body);
    return createPageMapping(input);
  });

  app.patch("/api/admin/support/mappings/:id", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:crm:manage", prisma);
    const { id } = routeParams(request);
    const input = parseSchema(updateMappingSchema, request.body);
    return updatePageMapping(id, input);
  });

  app.delete("/api/admin/support/mappings/:id", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:crm:manage", prisma);
    const { id } = routeParams(request);
    return deletePageMapping(id);
  });

  // Analytics (Admin)
  app.get("/api/admin/support/analytics", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:analytics:view");
    return getSupportAnalytics();
  });
}
