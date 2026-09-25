export type SupportContentType = "FAQ" | "QUICK_ACTION" | "GUIDE" | "TROUBLESHOOTING" | "NOTE" | "LINK" | "TUTORIAL";
export type SupportContentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface SupportCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuickActionConfig {
  label: string;
  action: string;
  link?: string;
  icon?: string;
}

export interface SupportArticle {
  id: string;
  categoryId: string;
  category?: SupportCategory | null;
  title: string;
  slug: string;
  content: string;
  contentType: SupportContentType;
  status: SupportContentStatus;
  tags: string[];
  keywords: string[];
  quickAction?: QuickActionConfig | null;
  sortOrder: number;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  createdAt: string;
  updatedAt: string;
  mappings?: SupportPageMapping[];
}

export interface SupportPageMapping {
  id: string;
  articleId: string;
  article?: SupportArticle;
  pageRoute: string;
  context?: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupportArticleFeedback {
  id: string;
  articleId: string;
  userId?: string;
  isHelpful: boolean;
  feedback?: string;
  pageRoute?: string;
  createdAt: string;
}

export interface SupportArticleTranslation {
  id: string;
  articleId: string;
  language: string;
  title: string;
  content: string;
  keywords: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SupportContentForPage {
  pageRoute: string;
  categories: SupportCategory[];
  faqs: SupportArticle[];
  quickActions: SupportArticle[];
  guides: SupportArticle[];
  troubleshooting: SupportArticle[];
  notes: SupportArticle[];
  links: SupportArticle[];
  tutorials: SupportArticle[];
}

export interface CreateCategoryInput {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  sortOrder?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  icon?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreateArticleInput {
  categoryId: string;
  title: string;
  content: string;
  contentType?: SupportContentType;
  status?: SupportContentStatus;
  tags?: string[];
  keywords?: string[];
  quickAction?: QuickActionConfig;
  sortOrder?: number;
  pageRoutes?: string[];
}

export interface UpdateArticleInput {
  categoryId?: string;
  title?: string;
  content?: string;
  contentType?: SupportContentType;
  status?: SupportContentStatus;
  tags?: string[];
  keywords?: string[];
  quickAction?: QuickActionConfig | null;
  sortOrder?: number;
}

export interface CreatePageMappingInput {
  articleId: string;
  pageRoute: string;
  context?: string;
  priority?: number;
}

export interface UpdatePageMappingInput {
  context?: string;
  priority?: number;
  isActive?: boolean;
}

export interface CreateFeedbackInput {
  articleId: string;
  isHelpful: boolean;
  feedback?: string;
  pageRoute?: string;
}

export interface SearchSupportInput {
  query: string;
  pageRoute?: string;
  contentTypes?: SupportContentType[];
  limit?: number;
}

export interface SupportSearchResult {
  articles: SupportArticle[];
  total: number;
}

export interface SupportAnalytics {
  totalArticles: number;
  totalCategories: number;
  totalFeedback: number;
  helpfulRate: number;
  topArticles: Array<{
    article: SupportArticle;
    views: number;
    helpfulCount: number;
  }>;
  recentSearches: Array<{
    query: string;
    count: number;
  }>;
}

// Route-specific context configuration
export interface PageSupportConfig {
  pageRoute: string;
  pageName: string;
  icon: string;
  description: string;
  defaultCategorySlug?: string;
}

export const SUPPORTED_PAGE_ROUTES: PageSupportConfig[] = [
  { pageRoute: "/", pageName: "Home", icon: "Home", description: "Home page" },
  { pageRoute: "/dashboard", pageName: "Dashboard", icon: "LayoutDashboard", description: "User dashboard" },
  { pageRoute: "/wallet", pageName: "Wallet", icon: "Wallet", description: "Wallet management" },
  { pageRoute: "/wallet/deposit", pageName: "Deposit", icon: "ArrowDownCircle", description: "Deposit coins" },
  { pageRoute: "/wallet/withdraw", pageName: "Withdraw", icon: "ArrowUpCircle", description: "Withdraw funds" },
  { pageRoute: "/coupons", pageName: "Coupons", icon: "Ticket", description: "Coupon management" },
  { pageRoute: "/games", pageName: "Games", icon: "Gamepad2", description: "Game lobby" },
  { pageRoute: "/games/chess", pageName: "Chess", icon: "ChessKing", description: "Chess game" },
  { pageRoute: "/games/ludo", pageName: "Ludo", icon: "Dice5", description: "Ludo game" },
  { pageRoute: "/games/snake-ladder", pageName: "Snake & Ladder", icon: "Ladder", description: "Snake and Ladder game" },
  { pageRoute: "/games/bubble-shooter", pageName: "Bubble Shooter", icon: "CircleDot", description: "Bubble Shooter game" },
  { pageRoute: "/games/fruit-ninja", pageName: "Fruit Ninja", icon: "Apple", description: "Fruit Ninja game" },
  { pageRoute: "/games/table-tennis", pageName: "Table Tennis", icon: "Table2", description: "Table Tennis game" },
  { pageRoute: "/games/snake-vs-worms", pageName: "Snake vs Worms", icon: "Snail", description: "Snake vs Worms game" },
  { pageRoute: "/games/carrom", pageName: "Carrom", icon: "Disc", description: "Carrom game" },
  { pageRoute: "/leaderboard", pageName: "Leaderboard", icon: "Trophy", description: "Leaderboards" },
  { pageRoute: "/tournaments", pageName: "Tournaments", icon: "Swords", description: "Tournaments" },
  { pageRoute: "/friends", pageName: "Friends", icon: "Users", description: "Friends list" },
  { pageRoute: "/profile", pageName: "Profile", icon: "User", description: "User profile" },
  { pageRoute: "/settings", pageName: "Settings", icon: "Settings", description: "App settings" },
  { pageRoute: "/notifications", pageName: "Notifications", icon: "Bell", description: "Notifications" },
  { pageRoute: "/lobby", pageName: "Game Lobby", icon: "Users", description: "Multiplayer lobby" },
  { pageRoute: "/referrals", pageName: "Referrals", icon: "Share2", description: "Referral program" },
  { pageRoute: "/achievements", pageName: "Achievements", icon: "Medal", description: "Achievements" },
  { pageRoute: "/tickets", pageName: "Support Tickets", icon: "Ticket", description: "Support tickets" },
  { pageRoute: "/messages", pageName: "Messages", icon: "MessageCircle", description: "Messages" },
  { pageRoute: "/search", pageName: "Search", icon: "Search", description: "Search" },
  { pageRoute: "/announcements", pageName: "Announcements", icon: "Megaphone", description: "Platform announcements" },
  { pageRoute: "/kyc", pageName: "KYC Verification", icon: "ShieldCheck", description: "Identity verification" },
  { pageRoute: "/kyc/verify", pageName: "KYC Verify", icon: "ScanLine", description: "Submit KYC documents" },
  { pageRoute: "/admin", pageName: "Admin", icon: "Shield", description: "Admin panel" },
  { pageRoute: "/admin/users", pageName: "Admin Users", icon: "Users", description: "Manage users" },
  { pageRoute: "/admin/matches", pageName: "Admin Matches", icon: "Swords", description: "Review matches" },
  { pageRoute: "/admin/rooms", pageName: "Admin Rooms", icon: "DoorOpen", description: "Manage game rooms" },
];
