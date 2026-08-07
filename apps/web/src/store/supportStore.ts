import { create } from "zustand";
import type {
  SupportArticle,
  SupportCategory,
  SupportContentForPage,
  PageSupportConfig,
} from "@gaming-hub/shared";

interface SupportState {
  // Panel state
  isOpen: boolean;
  isMinimized: boolean;
  hasUnread: boolean;
  activeSection: SupportSection;
  searchQuery: string;

  // Content
  currentPage: string;
  pageContent: SupportContentForPage | null;
  categories: SupportCategory[];
  supportedPages: PageSupportConfig[];
  isLoading: boolean;
  error: string | null;

  // Selected content
  selectedArticle: SupportArticle | null;
  expandedArticles: Set<string>;

  // Actions
  open: () => void;
  close: () => void;
  toggle: () => void;
  minimize: () => void;
  maximize: () => void;
  setActiveSection: (section: SupportSection) => void;
  setSearchQuery: (query: string) => void;
  setCurrentPage: (page: string) => void;
  setPageContent: (content: SupportContentForPage | null) => void;
  setCategories: (categories: SupportCategory[]) => void;
  setSupportedPages: (pages: PageSupportConfig[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectArticle: (article: SupportArticle | null) => void;
  toggleArticle: (articleId: string) => void;
  setHasUnread: (hasUnread: boolean) => void;
  reset: () => void;
}

export type SupportSection =
  | "home"
  | "faqs"
  | "quickActions"
  | "guides"
  | "troubleshooting"
  | "search"
  | "article"
  | "contact"
  | "tickets";

const initialState = {
  isOpen: false,
  isMinimized: false,
  hasUnread: false,
  activeSection: "home" as SupportSection,
  searchQuery: "",
  currentPage: "/",
  pageContent: null,
  categories: [],
  supportedPages: [],
  isLoading: false,
  error: null,
  selectedArticle: null,
  expandedArticles: new Set<string>(),
};

export const useSupportStore = create<SupportState>((set, get) => ({
  ...initialState,

  open: () => set({ isOpen: true, isMinimized: false }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen, isMinimized: false })),
  minimize: () => set({ isMinimized: true }),
  maximize: () => set({ isMinimized: false }),

  setActiveSection: (section) => set({ activeSection: section }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setPageContent: (content) => set({ pageContent: content }),
  setCategories: (categories) => set({ categories }),
  setSupportedPages: (pages) => set({ supportedPages: pages }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  selectArticle: (article) => set({
    selectedArticle: article,
    activeSection: article ? "article" : "home",
  }),

  toggleArticle: (articleId) => {
    const { expandedArticles } = get();
    const newExpanded = new Set(expandedArticles);
    if (newExpanded.has(articleId)) {
      newExpanded.delete(articleId);
    } else {
      newExpanded.add(articleId);
    }
    set({ expandedArticles: newExpanded });
  },

  setHasUnread: (hasUnread) => set({ hasUnread }),

  reset: () => set(initialState),
}));
