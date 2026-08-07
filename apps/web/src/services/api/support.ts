import type {
  SupportCategory,
  SupportArticle,
  SupportPageMapping,
  SupportArticleFeedback,
  SupportContentForPage,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateArticleInput,
  UpdateArticleInput,
  CreatePageMappingInput,
  UpdatePageMappingInput,
  CreateFeedbackInput,
  SearchSupportInput,
  SupportSearchResult,
  SupportAnalytics,
  PageSupportConfig,
} from "@gaming-hub/shared";
import { apiClient } from "./client";

// ============================================================================
// Public API
// ============================================================================

export async function getPageContent(pageRoute: string): Promise<SupportContentForPage> {
  return apiClient.get(`/support/page-content?pageRoute=${encodeURIComponent(pageRoute)}`);
}

export async function searchSupportContent(input: SearchSupportInput): Promise<SupportSearchResult> {
  const params = new URLSearchParams();
  params.append("query", input.query);
  if (input.pageRoute) params.append("pageRoute", input.pageRoute);
  if (input.contentTypes) params.append("contentTypes", JSON.stringify(input.contentTypes));
  if (input.limit) params.append("limit", input.limit.toString());
  return apiClient.get(`/support/search?${params.toString()}`);
}

export async function getArticleBySlug(slug: string): Promise<SupportArticle> {
  return apiClient.get(`/support/articles/${slug}`);
}

export async function listCategories(): Promise<SupportCategory[]> {
  return apiClient.get("/support/categories");
}

export async function getCategoryBySlug(slug: string): Promise<SupportCategory & { articles: Pick<SupportArticle, "id" | "title" | "slug" | "contentType" | "sortOrder">[] }> {
  return apiClient.get(`/support/categories/${slug}`);
}

export async function createFeedback(input: CreateFeedbackInput): Promise<SupportArticleFeedback> {
  return apiClient.post("/support/feedback", input);
}

export async function getSupportedPages(): Promise<PageSupportConfig[]> {
  return apiClient.get("/support/supported-pages");
}

// ============================================================================
// Admin API
// ============================================================================

export async function listAdminArticles(
  page = 1,
  pageSize = 20,
  filters?: {
    categoryId?: string;
    contentType?: string;
    status?: string;
    tag?: string;
  }
): Promise<{ items: SupportArticle[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("pageSize", pageSize.toString());
  if (filters?.categoryId) params.append("categoryId", filters.categoryId);
  if (filters?.contentType) params.append("contentType", filters.contentType);
  if (filters?.status) params.append("status", filters.status);
  if (filters?.tag) params.append("tag", filters.tag);
  return apiClient.get(`/admin/support/articles?${params.toString()}`);
}

export async function getAdminArticle(id: string): Promise<SupportArticle> {
  return apiClient.get(`/admin/support/articles/${id}`);
}

export async function createArticle(input: CreateArticleInput): Promise<SupportArticle> {
  return apiClient.post("/admin/support/articles", input);
}

export async function updateArticle(id: string, input: UpdateArticleInput): Promise<SupportArticle> {
  return apiClient.patch(`/admin/support/articles/${id}`, input);
}

export async function setArticleStatus(id: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED"): Promise<{ ok: boolean; status: string }> {
  return apiClient.patch(`/admin/support/articles/${id}/status`, { status });
}

export async function deleteArticle(id: string): Promise<{ ok: boolean }> {
  return apiClient.delete(`/admin/support/articles/${id}`);
}

// Categories
export async function createCategory(input: CreateCategoryInput): Promise<SupportCategory> {
  return apiClient.post("/admin/support/categories", input);
}

export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<SupportCategory> {
  return apiClient.patch(`/admin/support/categories/${id}`, input);
}

export async function deleteCategory(id: string): Promise<{ ok: boolean }> {
  return apiClient.delete(`/admin/support/categories/${id}`);
}

// Page Mappings
export async function listPageMappings(articleId?: string): Promise<(SupportPageMapping & { article?: { title: string; slug: string } })[]> {
  const params = new URLSearchParams();
  if (articleId) params.append("articleId", articleId);
  return apiClient.get(`/admin/support/mappings?${params.toString()}`);
}

export async function createPageMapping(input: CreatePageMappingInput): Promise<SupportPageMapping> {
  return apiClient.post("/admin/support/mappings", input);
}

export async function updatePageMapping(id: string, input: UpdatePageMappingInput): Promise<SupportPageMapping> {
  return apiClient.patch(`/admin/support/mappings/${id}`, input);
}

export async function deletePageMapping(id: string): Promise<{ ok: boolean }> {
  return apiClient.delete(`/admin/support/mappings/${id}`);
}

// Analytics
export async function getSupportAnalytics(): Promise<SupportAnalytics> {
  return apiClient.get("/admin/support/analytics");
}

export const supportApi = {
  // Public
  getPageContent,
  searchSupportContent,
  getArticleBySlug,
  listCategories,
  getCategoryBySlug,
  createFeedback,
  getSupportedPages,
  // Admin
  listAdminArticles,
  getAdminArticle,
  createArticle,
  updateArticle,
  setArticleStatus,
  deleteArticle,
  createCategory,
  updateCategory,
  deleteCategory,
  listPageMappings,
  createPageMapping,
  updatePageMapping,
  deletePageMapping,
  getSupportAnalytics,
};
