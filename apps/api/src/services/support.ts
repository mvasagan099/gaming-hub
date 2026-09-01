import { prisma } from "@gaming-hub/db";
import { AppError, type SupportContentType, type SupportContentStatus, type QuickActionConfig } from "@gaming-hub/shared";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateArticleInput,
  UpdateArticleInput,
  CreatePageMappingInput,
  UpdatePageMappingInput,
  CreateFeedbackInput,
  SearchSupportInput,
  SupportSearchResult,
  SupportContentForPage,
  SupportAnalytics,
} from "@gaming-hub/shared";

interface SupportCategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toSupportCategory(c: SupportCategoryRow) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description ?? undefined,
    icon: c.icon ?? undefined,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// ============================================================================
// Categories
// ============================================================================

export async function listCategories(includeInactive = false) {
  const categories = await prisma.supportCategory.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    icon: c.icon,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
}

export async function getCategoryBySlug(slug: string) {
  const category = await prisma.supportCategory.findUnique({
    where: { slug },
    include: {
      articles: {
        where: { status: "PUBLISHED" },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!category) throw new AppError("NOT_FOUND", "Category not found", 404);

  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    articles: category.articles.map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      contentType: a.contentType,
      sortOrder: a.sortOrder,
    })),
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export async function createCategory(input: CreateCategoryInput, createdBy: string | null) {
  const existing = await prisma.supportCategory.findUnique({
    where: { slug: input.slug },
  });

  if (existing) throw new AppError("VALIDATION_ERROR", "Category with this slug already exists", 409);

  const category = await prisma.supportCategory.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      icon: input.icon,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  const existing = await prisma.supportCategory.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Category not found", 404);

  const category = await prisma.supportCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });

  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export async function deleteCategory(id: string) {
  const existing = await prisma.supportCategory.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Category not found", 404);

  await prisma.supportCategory.delete({ where: { id } });
  return { ok: true };
}

// ============================================================================
// Articles
// ============================================================================

export async function listArticles(
  page: number,
  pageSize: number,
  filters?: {
    categoryId?: string;
    contentType?: SupportContentType;
    status?: SupportContentStatus;
    tag?: string;
  }
) {
  const where: Record<string, unknown> = {};
  if (filters?.categoryId) where.categoryId = filters.categoryId;
  if (filters?.contentType) where.contentType = filters.contentType;
  if (filters?.status) where.status = filters.status;
  if (filters?.tag) where.tags = { has: filters.tag };

  const [items, total] = await Promise.all([
    prisma.supportArticle.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { category: true },
    }),
    prisma.supportArticle.count({ where }),
  ]);

  return {
    items: items.map((a) => ({
      id: a.id,
      categoryId: a.categoryId,
      category: a.category ? toSupportCategory(a.category) : null,
      title: a.title,
      slug: a.slug,
      content: a.content,
      contentType: a.contentType,
      status: a.status,
      tags: a.tags,
      keywords: a.keywords,
      quickAction: a.quickAction,
      sortOrder: a.sortOrder,
      viewCount: a.viewCount,
      helpfulCount: a.helpfulCount,
      notHelpfulCount: a.notHelpfulCount,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

export async function getArticleBySlug(slug: string, incrementViews = false) {
  const article = await prisma.supportArticle.findUnique({
    where: { slug },
    include: { category: true, mappings: true },
  });

  if (!article) throw new AppError("NOT_FOUND", "Article not found", 404);
  if (article.status !== "PUBLISHED") throw new AppError("NOT_FOUND", "Article not found", 404);

  if (incrementViews) {
    await prisma.supportArticle.update({
      where: { id: article.id },
      data: { viewCount: { increment: 1 } },
    });
  }

  return {
    id: article.id,
    categoryId: article.categoryId,
    category: article.category ? {
      id: article.category.id,
      name: article.category.name,
      slug: article.category.slug,
    } : null,
    title: article.title,
    slug: article.slug,
    content: article.content,
    contentType: article.contentType,
    status: article.status,
    tags: article.tags,
    keywords: article.keywords,
    quickAction: article.quickAction,
    sortOrder: article.sortOrder,
    viewCount: article.viewCount + (incrementViews ? 1 : 0),
    helpfulCount: article.helpfulCount,
    notHelpfulCount: article.notHelpfulCount,
    mappings: article.mappings.map((m) => ({
      id: m.id,
      pageRoute: m.pageRoute,
      context: m.context,
      priority: m.priority,
      isActive: m.isActive,
    })),
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  };
}

export async function getArticleById(id: string) {
  const article = await prisma.supportArticle.findUnique({
    where: { id },
    include: { category: true, mappings: true },
  });

  if (!article) throw new AppError("NOT_FOUND", "Article not found", 404);

  return {
    id: article.id,
    categoryId: article.categoryId,
    category: article.category ? {
      id: article.category.id,
      name: article.category.name,
      slug: article.category.slug,
    } : null,
    title: article.title,
    slug: article.slug,
    content: article.content,
    contentType: article.contentType,
    status: article.status,
    tags: article.tags,
    keywords: article.keywords,
    quickAction: article.quickAction,
    sortOrder: article.sortOrder,
    viewCount: article.viewCount,
    helpfulCount: article.helpfulCount,
    notHelpfulCount: article.notHelpfulCount,
    mappings: article.mappings.map((m) => ({
      id: m.id,
      pageRoute: m.pageRoute,
      context: m.context,
      priority: m.priority,
      isActive: m.isActive,
    })),
    createdAt: article.createdAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  };
}

export async function createArticle(input: CreateArticleInput, createdBy: string | null) {
  // Generate slug from title
  const slug = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;

  const article = await prisma.supportArticle.create({
    data: {
      categoryId: input.categoryId,
      title: input.title,
      slug,
      content: input.content,
      contentType: input.contentType ?? "FAQ",
      status: input.status ?? "DRAFT",
      tags: input.tags ?? [],
      keywords: input.keywords ?? [],
      quickAction: input.quickAction ? JSON.parse(JSON.stringify(input.quickAction)) : null,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  // Create page mappings if provided
  if (input.pageRoutes?.length) {
    await prisma.supportPageMapping.createMany({
      data: input.pageRoutes.map((route) => ({
        articleId: article.id,
        pageRoute: route,
        isActive: true,
      })),
    });
  }

  return getArticleById(article.id);
}

export async function updateArticle(id: string, input: UpdateArticleInput, updatedBy: string | null) {
  const existing = await prisma.supportArticle.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Article not found", 404);

  const data: Record<string, unknown> = {};
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.title !== undefined) data.title = input.title;
  if (input.content !== undefined) data.content = input.content;
  if (input.contentType !== undefined) data.contentType = input.contentType;
  if (input.status !== undefined) data.status = input.status;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.keywords !== undefined) data.keywords = input.keywords;
  if (input.quickAction !== undefined) data.quickAction = input.quickAction;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  await prisma.supportArticle.update({ where: { id }, data });

  return getArticleById(id);
}

export async function deleteArticle(id: string) {
  const existing = await prisma.supportArticle.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Article not found", 404);

  await prisma.supportArticle.delete({ where: { id } });
  return { ok: true };
}

export async function setArticleStatus(id: string, status: SupportContentStatus) {
  const existing = await prisma.supportArticle.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Article not found", 404);

  await prisma.supportArticle.update({ where: { id }, data: { status } });
  return { ok: true, status };
}

// ============================================================================
// Page Mappings
// ============================================================================

export async function getContentForPage(pageRoute: string): Promise<SupportContentForPage> {
  const mappings = await prisma.supportPageMapping.findMany({
    where: {
      pageRoute: { startsWith: pageRoute },
      isActive: true,
      article: { status: "PUBLISHED" },
    },
    include: { article: { include: { category: true } } },
    orderBy: { priority: "desc" },
  });

  // Also get articles mapped to parent routes
  const parentMappings = await prisma.supportPageMapping.findMany({
    where: {
      pageRoute: "/",
      isActive: true,
      article: { status: "PUBLISHED" },
    },
    include: { article: { include: { category: true } } },
    orderBy: { priority: "desc" },
  });

  const allArticles = [...mappings.map((m) => m.article), ...parentMappings.map((m) => m.article)];
  const uniqueArticles = Array.from(new Map(allArticles.map((a) => [a.id, a])).values());

  const articles = uniqueArticles.map((a) => ({
    id: a.id,
    categoryId: a.categoryId,
    category: a.category ? toSupportCategory(a.category) : null,
    title: a.title,
    slug: a.slug,
    content: a.content,
    contentType: a.contentType as SupportContentType,
    status: a.status as SupportContentStatus,
    tags: a.tags,
    keywords: a.keywords,
    quickAction: a.quickAction as QuickActionConfig | null | undefined,
    sortOrder: a.sortOrder,
    viewCount: a.viewCount,
    helpfulCount: a.helpfulCount,
    notHelpfulCount: a.notHelpfulCount,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  // Get unique categories
  const categoryMap = new Map();
  articles.forEach((a) => {
    if (a.category && !categoryMap.has(a.category.id)) {
      categoryMap.set(a.category.id, a.category);
    }
  });

  const categories = Array.from(categoryMap.values());

  return {
    pageRoute,
    categories,
    faqs: articles.filter((a) => a.contentType === "FAQ"),
    quickActions: articles.filter((a) => a.contentType === "QUICK_ACTION"),
    guides: articles.filter((a) => a.contentType === "GUIDE"),
    troubleshooting: articles.filter((a) => a.contentType === "TROUBLESHOOTING"),
    notes: articles.filter((a) => a.contentType === "NOTE"),
    links: articles.filter((a) => a.contentType === "LINK"),
    tutorials: articles.filter((a) => a.contentType === "TUTORIAL"),
  };
}

export async function createPageMapping(input: CreatePageMappingInput) {
  const mapping = await prisma.supportPageMapping.create({
    data: {
      articleId: input.articleId,
      pageRoute: input.pageRoute,
      context: input.context,
      priority: input.priority ?? 0,
    },
  });

  return {
    id: mapping.id,
    articleId: mapping.articleId,
    pageRoute: mapping.pageRoute,
    context: mapping.context,
    priority: mapping.priority,
    isActive: mapping.isActive,
    createdAt: mapping.createdAt.toISOString(),
    updatedAt: mapping.updatedAt.toISOString(),
  };
}

export async function updatePageMapping(id: string, input: UpdatePageMappingInput) {
  const existing = await prisma.supportPageMapping.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Mapping not found", 404);

  const mapping = await prisma.supportPageMapping.update({
    where: { id },
    data: {
      ...(input.context !== undefined && { context: input.context }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });

  return {
    id: mapping.id,
    articleId: mapping.articleId,
    pageRoute: mapping.pageRoute,
    context: mapping.context,
    priority: mapping.priority,
    isActive: mapping.isActive,
    createdAt: mapping.createdAt.toISOString(),
    updatedAt: mapping.updatedAt.toISOString(),
  };
}

export async function deletePageMapping(id: string) {
  await prisma.supportPageMapping.delete({ where: { id } });
  return { ok: true };
}

export async function listPageMappings(articleId?: string) {
  const mappings = await prisma.supportPageMapping.findMany({
    where: articleId ? { articleId } : undefined,
    include: { article: { select: { title: true, slug: true } } },
    orderBy: { pageRoute: "asc" },
  });

  return mappings.map((m) => ({
    id: m.id,
    articleId: m.articleId,
    article: m.article,
    pageRoute: m.pageRoute,
    context: m.context,
    priority: m.priority,
    isActive: m.isActive,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }));
}

// ============================================================================
// Search
// ============================================================================

export async function searchSupportContent(input: SearchSupportInput): Promise<SupportSearchResult> {
  const query = input.query.toLowerCase().trim();
  const limit = input.limit ?? 10;

  if (!query) {
    return { articles: [], total: 0 };
  }

  const where: Record<string, unknown> = {
    status: "PUBLISHED",
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { content: { contains: query, mode: "insensitive" } },
      { keywords: { has: query } },
      { tags: { has: query } },
    ],
  };

  if (input.contentTypes?.length) {
    where.contentType = { in: input.contentTypes };
  }

  const [items, total] = await Promise.all([
    prisma.supportArticle.findMany({
      where,
      orderBy: [{ helpfulCount: "desc" }, { viewCount: "desc" }],
      take: limit,
      include: { category: true },
    }),
    prisma.supportArticle.count({ where }),
  ]);

  // Log search
  await prisma.supportSearchLog.create({
    data: {
      query: input.query,
      pageRoute: input.pageRoute,
      results: items.map((i) => i.id),
    },
  });

  return {
    articles: items.map((a) => ({
      id: a.id,
      categoryId: a.categoryId,
      category: a.category ? toSupportCategory(a.category) : null,
      title: a.title,
      slug: a.slug,
      content: a.content.length > 200 ? `${a.content.slice(0, 200)}...` : a.content,
      contentType: a.contentType as SupportContentType,
      status: a.status as SupportContentStatus,
      tags: a.tags,
      keywords: a.keywords,
    quickAction: a.quickAction as QuickActionConfig | null | undefined,
      sortOrder: a.sortOrder,
      viewCount: a.viewCount,
      helpfulCount: a.helpfulCount,
      notHelpfulCount: a.notHelpfulCount,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
    total,
  };
}

// ============================================================================
// Feedback
// ============================================================================

export async function createFeedback(input: CreateFeedbackInput, userId?: string) {
  const feedback = await prisma.supportArticleFeedback.create({
    data: {
      articleId: input.articleId,
      userId: userId ?? null,
      isHelpful: input.isHelpful,
      feedback: input.feedback,
      pageRoute: input.pageRoute,
    },
  });

  // Update article counters
  await prisma.supportArticle.update({
    where: { id: input.articleId },
    data: input.isHelpful
      ? { helpfulCount: { increment: 1 } }
      : { notHelpfulCount: { increment: 1 } },
  });

  return {
    id: feedback.id,
    articleId: feedback.articleId,
    userId: feedback.userId,
    isHelpful: feedback.isHelpful,
    feedback: feedback.feedback,
    pageRoute: feedback.pageRoute,
    createdAt: feedback.createdAt.toISOString(),
  };
}

// ============================================================================
// Analytics
// ============================================================================

export async function getSupportAnalytics(): Promise<SupportAnalytics> {
  const [
    totalArticles,
    totalCategories,
    totalFeedback,
    topArticles,
    recentSearches,
  ] = await Promise.all([
    prisma.supportArticle.count(),
    prisma.supportCategory.count(),
    prisma.supportArticleFeedback.count(),
    prisma.supportArticle.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ viewCount: "desc" }, { helpfulCount: "desc" }],
      take: 10,
      include: { category: true },
    }),
    prisma.supportSearchLog.groupBy({
      by: ["query"],
      _count: { query: true },
      orderBy: { _count: { query: "desc" } },
      take: 20,
    }),
  ]);

  const helpfulCount = await prisma.supportArticleFeedback.count({ where: { isHelpful: true } });
  const notHelpfulCount = await prisma.supportArticleFeedback.count({ where: { isHelpful: false } });
  const totalHelpfulVotes = helpfulCount + notHelpfulCount;
  const helpfulRate = totalHelpfulVotes > 0 ? (helpfulCount / totalHelpfulVotes) * 100 : 0;

  return {
    totalArticles,
    totalCategories,
    totalFeedback,
    helpfulRate,
    topArticles: topArticles.map((a) => ({
      article: {
        id: a.id,
        categoryId: a.categoryId,
        category: a.category ? toSupportCategory(a.category) : null,
        title: a.title,
        slug: a.slug,
        content: a.content,
        contentType: a.contentType as SupportContentType,
        status: a.status as SupportContentStatus,
        tags: a.tags,
        keywords: a.keywords,
        sortOrder: a.sortOrder,
        viewCount: a.viewCount,
        helpfulCount: a.helpfulCount,
        notHelpfulCount: a.notHelpfulCount,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      },
      views: a.viewCount,
      helpfulCount: a.helpfulCount,
    })),
    recentSearches: recentSearches.map((s) => ({
      query: s.query,
      count: s._count.query,
    })),
  };
}
