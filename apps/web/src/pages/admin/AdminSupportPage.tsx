import { useEffect, useState } from "react";
import type {
  SupportArticle,
  SupportCategory,
  SupportContentType,
  SupportContentStatus,
  PageSupportConfig,
} from "@gaming-hub/shared";
import { supportApi } from "../../services/api/support";
import { SUPPORTED_PAGE_ROUTES } from "@gaming-hub/shared";

const CONTENT_TYPE_LABELS: Record<SupportContentType, string> = {
  FAQ: "FAQ",
  QUICK_ACTION: "Quick Action",
  GUIDE: "Guide",
  TROUBLESHOOTING: "Troubleshooting",
  NOTE: "Note",
  LINK: "Link",
  TUTORIAL: "Tutorial",
};

const STATUS_STYLES: Record<SupportContentStatus, string> = {
  DRAFT: "bg-yellow-500/10 text-yellow-600",
  PUBLISHED: "bg-green-500/10 text-green-600",
  ARCHIVED: "bg-gray-500/10 text-gray-600",
};

export function AdminSupportPage() {
  const [items, setItems] = useState<SupportArticle[]>([]);
  const [categories, setCategories] = useState<SupportCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [editing, setEditing] = useState<SupportArticle | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<SupportArticle | null>(null);
  const [activeTab, setActiveTab] = useState<"articles" | "categories" | "analytics">("articles");

  // Article form
  const [form, setForm] = useState({
    categoryId: "",
    title: "",
    content: "",
    contentType: "FAQ" as SupportContentType,
    status: "DRAFT" as SupportContentStatus,
    tags: [] as string[],
    keywords: [] as string[],
    quickAction: null as { label: string; action: string; link?: string; icon?: string } | null,
    sortOrder: 0,
    pageRoutes: [] as string[],
  });

  // Category form
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    slug: "",
    description: "",
    icon: "",
    sortOrder: 0,
  });

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [articlesData, categoriesData] = await Promise.all([
        supportApi.listAdminArticles(1, 100),
        supportApi.listCategories(),
      ]);
      setItems(articlesData.items);
      setCategories(categoriesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const flash = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      categoryId: categories[0]?.id || "",
      title: "",
      content: "",
      contentType: "FAQ",
      status: "DRAFT",
      tags: [],
      keywords: [],
      quickAction: null,
      sortOrder: 0,
      pageRoutes: [],
    });
    setShowModal(true);
  };

  const openEdit = (article: SupportArticle) => {
    setEditing(article);
    setForm({
      categoryId: article.categoryId,
      title: article.title,
      content: article.content,
      contentType: article.contentType,
      status: article.status,
      tags: article.tags,
      keywords: article.keywords,
      quickAction: article.quickAction || null,
      sortOrder: article.sortOrder,
      pageRoutes: article.mappings?.map((m) => m.pageRoute) || [],
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.content || !form.categoryId) return;

    try {
      if (editing) {
        await supportApi.updateArticle(editing.id, {
          title: form.title,
          content: form.content,
          categoryId: form.categoryId,
          contentType: form.contentType,
          status: form.status,
          tags: form.tags,
          keywords: form.keywords,
          quickAction: form.quickAction,
          sortOrder: form.sortOrder,
        });
        flash("Article updated");
      } else {
        await supportApi.createArticle({
          categoryId: form.categoryId,
          title: form.title,
          content: form.content,
          contentType: form.contentType,
          status: form.status,
          tags: form.tags,
          keywords: form.keywords,
          quickAction: form.quickAction || undefined,
          sortOrder: form.sortOrder,
          pageRoutes: form.pageRoutes,
        });
        flash("Article created");
      }
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this article?")) return;
    try {
      await supportApi.deleteArticle(id);
      await load();
      flash("Article deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleStatusChange = async (id: string, status: SupportContentStatus) => {
    try {
      await supportApi.setArticleStatus(id, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const handleCreateCategory = async () => {
    if (!categoryForm.name || !categoryForm.slug) return;
    try {
      await supportApi.createCategory({
        name: categoryForm.name,
        slug: categoryForm.slug,
        description: categoryForm.description,
        icon: categoryForm.icon,
        sortOrder: categoryForm.sortOrder,
      });
      setCategoryForm({ name: "", slug: "", description: "", icon: "", sortOrder: 0 });
      await load();
      flash("Category created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    }
  };

  const openMappingModal = (article: SupportArticle) => {
    setSelectedArticle(article);
    setShowMappingModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Support Assistant</h1>
        <div className="flex gap-2">
          {activeTab === "articles" && (
            <button
              onClick={openCreate}
              className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Create Article
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-border">
        <div className="flex gap-4">
          {(["articles", "categories", "analytics"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {successMessage && (
        <div className="mb-4 rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Articles Tab */}
      {activeTab === "articles" && (
        <div className="rounded-lg border border-border bg-card">
          <table className="w-full">
            <thead className="border-b border-border">
              <tr className="text-left text-sm text-muted-foreground">
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Views</th>
                <th className="px-4 py-3">Pages</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((article) => (
                <tr key={article.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{article.title}</div>
                    <div className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {article.content.slice(0, 50)}...
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {CONTENT_TYPE_LABELS[article.contentType]}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {article.category?.name || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs ${STATUS_STYLES[article.status]}`}>
                      {article.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {article.viewCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {article.mappings?.length || 0} pages
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => openEdit(article)}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => openMappingModal(article)}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        Pages
                      </button>
                      {article.status === "PUBLISHED" ? (
                        <button
                          onClick={() => handleStatusChange(article.id, "DRAFT")}
                          className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                        >
                          Unpublish
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatusChange(article.id, "PUBLISHED")}
                          className="rounded bg-green-500 px-2 py-1 text-xs text-white hover:bg-green-600"
                        >
                          Publish
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(article.id)}
                        className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No articles yet. Create your first article to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Categories Tab */}
      {activeTab === "categories" && (
        <div className="space-y-6">
          {/* Create Category Form */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="mb-4 text-lg font-semibold">Create Category</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Name</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Slug</label>
                <input
                  type="text"
                  value={categoryForm.slug}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    })
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Icon (Lucide name)</label>
                <input
                  type="text"
                  value={categoryForm.icon}
                  onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                  placeholder="HelpCircle"
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Sort Order</label>
                <input
                  type="number"
                  value={categoryForm.sortOrder}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, sortOrder: parseInt(e.target.value) || 0 })
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </div>
              <div className="col-span-2">
                <label className="mb-2 block text-sm font-medium">Description</label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </div>
            </div>
            <button
              onClick={handleCreateCategory}
              disabled={!categoryForm.name || !categoryForm.slug}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Create Category
            </button>
          </div>

          {/* Categories List */}
          <div className="rounded-lg border border-border bg-card">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Slug</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Sort</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{category.name}</td>
                    <td className="px-4 py-3 text-sm">
                      <code className="rounded bg-muted px-2 py-0.5 text-xs">{category.slug}</code>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {category.description || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          category.isActive
                            ? "bg-green-500/10 text-green-600"
                            : "bg-gray-500/10 text-gray-600"
                        }`}
                      >
                        {category.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{category.sortOrder}</td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No categories yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === "analytics" && <AdminSupportAnalytics />}

      {/* Article Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold">
              {editing ? "Edit Article" : "Create Article"}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Category</label>
                  <select
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Content Type</label>
                  <select
                    value={form.contentType}
                    onChange={(e) =>
                      setForm({ ...form, contentType: e.target.value as SupportContentType })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    {Object.entries(CONTENT_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Content (HTML supported)</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={6}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as SupportContentStatus })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Sort Order</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) =>
                      setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={form.tags.join(", ")}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                    })
                  }
                  placeholder="tag1, tag2, tag3"
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Keywords (comma separated)
                </label>
                <input
                  type="text"
                  value={form.keywords.join(", ")}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean),
                    })
                  }
                  placeholder="keyword1, keyword2"
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </div>
              {/* Quick Action */}
              <div className="rounded-md border border-border p-4">
                <label className="mb-2 block text-sm font-medium">Quick Action (optional)</label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Label</label>
                    <input
                      type="text"
                      value={form.quickAction?.label || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          quickAction: { ...form.quickAction, label: e.target.value } as any,
                        })
                      }
                      placeholder="Get Started"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Link</label>
                    <input
                      type="text"
                      value={form.quickAction?.link || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          quickAction: { ...form.quickAction, link: e.target.value } as any,
                        })
                      }
                      placeholder="/path"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
              {/* Page Mappings */}
              <div>
                <label className="mb-2 block text-sm font-medium">Show on Pages</label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto rounded-md border border-border bg-background p-2">
                  {SUPPORTED_PAGE_ROUTES.map((page) => (
                    <label key={page.pageRoute} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.pageRoutes.includes(page.pageRoute)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setForm({ ...form, pageRoutes: [...form.pageRoutes, page.pageRoute] });
                          } else {
                            setForm({
                              ...form,
                              pageRoutes: form.pageRoutes.filter((r) => r !== page.pageRoute),
                            });
                          }
                        }}
                        className="rounded border-border"
                      />
                      <span className="truncate">{page.pageName}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.title || !form.content || !form.categoryId}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {editing ? "Save Changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mapping Modal */}
      {showMappingModal && selectedArticle && (
        <AdminPageMappingModal
          article={selectedArticle}
          onClose={() => {
            setShowMappingModal(false);
            setSelectedArticle(null);
          }}
          onUpdate={load}
        />
      )}
    </div>
  );
}

// Page Mapping Modal Component
function AdminPageMappingModal({
  article,
  onClose,
  onUpdate,
}: {
  article: SupportArticle;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [mappings, setMappings] = useState<{ pageRoute: string; priority: number }[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMappings(article.mappings?.map((m) => ({ pageRoute: m.pageRoute, priority: m.priority })) || []);
    setSelectedPages(new Set(article.mappings?.map((m) => m.pageRoute) || []));
  }, [article]);

  const handleSave = async () => {
    try {
      // Delete existing mappings
      if (article.mappings?.length) {
        for (const mapping of article.mappings) {
          await supportApi.deletePageMapping(mapping.id);
        }
      }
      // Create new mappings
      for (const pageRoute of selectedPages) {
        await supportApi.createPageMapping({
          articleId: article.id,
          pageRoute,
        });
      }
      onUpdate();
      onClose();
    } catch (err) {
      console.error("Failed to save mappings:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Page Mappings</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Select pages where &ldquo;{article.title}&rdquo; should appear:
        </p>
        <div className="max-h-80 overflow-y-auto space-y-2 rounded-md border border-border p-3">
          {SUPPORTED_PAGE_ROUTES.map((page) => (
            <label key={page.pageRoute} className="flex items-center gap-3 p-2 hover:bg-muted rounded-md">
              <input
                type="checkbox"
                checked={selectedPages.has(page.pageRoute)}
                onChange={(e) => {
                  const newPages = new Set(selectedPages);
                  if (e.target.checked) {
                    newPages.add(page.pageRoute);
                  } else {
                    newPages.delete(page.pageRoute);
                  }
                  setSelectedPages(newPages);
                }}
                className="rounded border-border"
              />
              <div className="flex-1">
                <div className="text-sm font-medium">{page.pageName}</div>
                <div className="text-xs text-muted-foreground">{page.pageRoute}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Save Mappings
          </button>
        </div>
      </div>
    </div>
  );
}

// Analytics Component
function AdminSupportAnalytics() {
  const [analytics, setAnalytics] = useState<{
    totalArticles: number;
    totalCategories: number;
    totalFeedback: number;
    helpfulRate: number;
    topArticles: Array<{
      article: SupportArticle;
      views: number;
      helpfulCount: number;
    }>;
    recentSearches: Array<{ query: string; count: number }>;
  } | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    try {
      const data = await supportApi.getSupportAnalytics();
      setAnalytics(data);
    } catch (err) {
      console.error("Failed to load analytics:", err);
    }
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-2xl font-bold">{analytics.totalArticles}</div>
          <div className="text-sm text-muted-foreground">Total Articles</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-2xl font-bold">{analytics.totalCategories}</div>
          <div className="text-sm text-muted-foreground">Categories</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-2xl font-bold">{analytics.totalFeedback}</div>
          <div className="text-sm text-muted-foreground">Feedback Count</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-2xl font-bold">{analytics.helpfulRate.toFixed(1)}%</div>
          <div className="text-sm text-muted-foreground">Helpful Rate</div>
        </div>
      </div>

      {/* Top Articles */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 font-semibold">Top Articles</div>
        <table className="w-full">
          <thead className="border-b border-border">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Views</th>
              <th className="px-4 py-2">Helpful</th>
            </tr>
          </thead>
          <tbody>
            {analytics.topArticles.map(({ article, views, helpfulCount }) => (
              <tr key={article.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium">{article.title}</td>
                <td className="px-4 py-2 text-sm">{views.toLocaleString()}</td>
                <td className="px-4 py-2 text-sm">{helpfulCount}</td>
              </tr>
            ))}
            {analytics.topArticles.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  No data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recent Searches */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 font-semibold">Popular Search Terms</div>
        <div className="p-4">
          {analytics.recentSearches.length === 0 ? (
            <p className="text-center text-muted-foreground">No searches yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {analytics.recentSearches.map(({ query, count }) => (
                <span
                  key={query}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm dark:bg-slate-800"
                >
                  {query}
                  <span className="text-xs text-muted-foreground">({count})</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
