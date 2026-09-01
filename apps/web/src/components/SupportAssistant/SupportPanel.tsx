import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  MessageSquare,
  FileText,
  Wrench,
  AlertCircle,
  PlayCircle,
  Link2,
  Sparkles,
  ArrowLeft,
  HelpCircle,
  Zap,
  BookOpen,
  X,
  Loader2,
} from "lucide-react";
import { useSupportStore, type SupportSection } from "../../store/supportStore";
import { useTheme } from "../../contexts/ThemeProvider";
import { supportApi } from "../../services/api/support";
import { cn } from "../../utils/cn";
import type { SupportArticle, SupportContentType } from "@gaming-hub/shared";

const sectionIcons: Record<SupportContentType, React.ReactNode> = {
  FAQ: <HelpCircle className="h-5 w-5" />,
  QUICK_ACTION: <Zap className="h-5 w-5" />,
  GUIDE: <BookOpen className="h-5 w-5" />,
  TROUBLESHOOTING: <Wrench className="h-5 w-5" />,
  NOTE: <AlertCircle className="h-5 w-5" />,
  LINK: <Link2 className="h-5 w-5" />,
  TUTORIAL: <PlayCircle className="h-5 w-5" />,
};

const sectionLabels: Record<SupportContentType, string> = {
  FAQ: "Frequently Asked Questions",
  QUICK_ACTION: "Quick Actions",
  GUIDE: "Step-by-Step Guides",
  TROUBLESHOOTING: "Troubleshooting",
  NOTE: "Important Notes",
  LINK: "Related Links",
  TUTORIAL: "Video Tutorials",
};

export function SupportPanel() {
  const {
    activeSection,
    searchQuery,
    pageContent,
    isLoading,
    error,
    selectedArticle,
    expandedArticles,
    setActiveSection,
    setSearchQuery,
    selectArticle,
    toggleArticle,
  } = useSupportStore();

  const { effectiveTheme } = useTheme();
  const [searchResults, setSearchResults] = useState<SupportArticle[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<Set<string>>(new Set());

  // Handle search
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchQuery.trim()) {
        performSearch(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  async function performSearch(query: string) {
    setIsSearching(true);
    try {
      const results = await supportApi.searchSupportContent({
        query,
        pageRoute: pageContent?.pageRoute,
        limit: 10,
      });
      setSearchResults(results.articles);
      setActiveSection("search");
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  }

  async function handleFeedback(articleId: string, isHelpful: boolean) {
    if (feedbackSubmitted.has(articleId)) return;

    try {
      await supportApi.createFeedback({
        articleId,
        isHelpful,
        pageRoute: pageContent?.pageRoute,
      });

      const newFeedback = new Set(feedbackSubmitted);
      newFeedback.add(articleId);
      setFeedbackSubmitted(newFeedback);
    } catch (err) {
      console.error("Failed to submit feedback:", err);
    }
  }

  function handleQuickAction(action: { label: string; action: string; link?: string }) {
    if (action.link) {
      window.open(action.link, "_blank");
    }
    // Other actions can be handled here (e.g., navigation, modals)
  }

  function getSectionArticles(section: SupportSection): SupportArticle[] {
    if (!pageContent) return [];
    switch (section) {
      case "faqs":
        return pageContent.faqs;
      case "quickActions":
        return pageContent.quickActions;
      case "guides":
        return pageContent.guides;
      case "troubleshooting":
        return pageContent.troubleshooting;
      default:
        return [];
    }
  }

  function renderHome() {
    if (!pageContent) {
      return (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center">
            <HelpCircle className="mx-auto mb-4 h-12 w-12 text-slate-400" />
            <p className={cn("text-sm", effectiveTheme === "dark" ? "text-slate-400" : "text-slate-500")}>
              No support content available for this page.
            </p>
          </div>
        </div>
      );
    }

    const sections: { id: SupportSection; label: string; icon: React.ReactNode; count: number }[] = [
      { id: "faqs" as SupportSection, label: "FAQs", icon: <HelpCircle className="h-5 w-5" />, count: pageContent.faqs.length },
      { id: "quickActions" as SupportSection, label: "Quick Actions", icon: <Zap className="h-5 w-5" />, count: pageContent.quickActions.length },
      { id: "guides" as SupportSection, label: "Guides", icon: <BookOpen className="h-5 w-5" />, count: pageContent.guides.length },
      { id: "troubleshooting" as SupportSection, label: "Troubleshooting", icon: <Wrench className="h-5 w-5" />, count: pageContent.troubleshooting.length },
    ].filter((s) => s.count > 0);

    return (
      <div className="flex-1 overflow-y-auto p-4">
        {/* Welcome message */}
        <div
          className={cn(
            "mb-6 rounded-xl p-4",
            effectiveTheme === "dark" ? "bg-slate-800/50" : "bg-slate-50"
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                effectiveTheme === "dark" ? "bg-accent-500/20 text-accent-400" : "bg-indigo-100 text-indigo-600"
              )}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3
                className={cn(
                  "mb-1 font-semibold",
                  effectiveTheme === "dark" ? "text-slate-100" : "text-slate-900"
                )}
              >
                How can we help?
              </h3>
              <p
                className={cn(
                  "text-sm",
                  effectiveTheme === "dark" ? "text-slate-400" : "text-slate-500"
                )}
              >
                Get answers to common questions and quick access to features on this page.
              </p>
            </div>
          </div>
        </div>

        {/* Quick links */}
        {sections.length > 0 && (
          <div className="space-y-2">
            <h4
              className={cn(
                "mb-3 text-xs font-semibold uppercase tracking-wider",
                effectiveTheme === "dark" ? "text-slate-500" : "text-slate-400"
              )}
            >
              Browse by topic
            </h4>
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl p-3 transition-colors",
                  effectiveTheme === "dark"
                    ? "bg-slate-800/50 hover:bg-slate-800"
                    : "bg-white hover:bg-slate-50 border border-slate-200"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg",
                      effectiveTheme === "dark" ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {section.icon}
                  </div>
                  <span
                    className={cn(
                      "font-medium",
                      effectiveTheme === "dark" ? "text-slate-200" : "text-slate-700"
                    )}
                  >
                    {section.label}
                  </span>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    effectiveTheme === "dark" ? "bg-slate-700 text-slate-400" : "bg-slate-200 text-slate-600"
                  )}
                >
                  {section.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        {pageContent.quickActions.length > 0 && (
          <div className="mt-6 space-y-3">
            <h4
              className={cn(
                "text-xs font-semibold uppercase tracking-wider",
                effectiveTheme === "dark" ? "text-slate-500" : "text-slate-400"
              )}
            >
              Quick Actions
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {pageContent.quickActions.slice(0, 4).map((action) => (
                <button
                  key={action.id}
                  onClick={() => action.quickAction && handleQuickAction(action.quickAction)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl p-3 transition-colors",
                    effectiveTheme === "dark"
                      ? "bg-slate-800/50 hover:bg-slate-800"
                      : "bg-white hover:bg-slate-50 border border-slate-200"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full",
                      effectiveTheme === "dark" ? "bg-accent-500/20 text-accent-400" : "bg-indigo-100 text-indigo-600"
                    )}
                  >
                    {action.quickAction?.icon ? (
                      <span className="text-lg">{action.quickAction.icon}</span>
                    ) : (
                      <Zap className="h-5 w-5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-center text-xs font-medium",
                      effectiveTheme === "dark" ? "text-slate-300" : "text-slate-600"
                    )}
                  >
                    {action.quickAction?.label || action.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Contact Support */}
        <div className="mt-6">
          <button
            onClick={() => setActiveSection("tickets")}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl py-3 font-medium transition-colors",
              effectiveTheme === "dark"
                ? "bg-slate-800 text-slate-200 hover:bg-slate-700"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            <MessageSquare className="h-4 w-4" />
            Contact Support
          </button>
        </div>
      </div>
    );
  }

  function renderSection(section: SupportSection) {
    const articles = getSectionArticles(section);
    const title = sectionLabels[section as SupportContentType] || section;

    return (
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div
          className={cn(
            "sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3",
            effectiveTheme === "dark"
              ? "border-slate-800 bg-slate-900"
              : "border-slate-200 bg-white"
          )}
        >
          <button
            onClick={() => setActiveSection("home")}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              effectiveTheme === "dark"
                ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            )}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            {sectionIcons[section as SupportContentType]}
            <h3
              className={cn(
                "font-semibold",
                effectiveTheme === "dark" ? "text-slate-100" : "text-slate-900"
              )}
            >
              {title}
            </h3>
          </div>
        </div>

        {/* Articles */}
        <div className="p-4">
          {articles.length === 0 ? (
            <div className="py-8 text-center">
              <HelpCircle className="mx-auto mb-3 h-10 w-10 text-slate-400" />
              <p
                className={cn(
                  "text-sm",
                  effectiveTheme === "dark" ? "text-slate-400" : "text-slate-500"
                )}
              >
                No {section.toLowerCase()} available for this page.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {articles.map((article) => (
                <div
                  key={article.id}
                  className={cn(
                    "rounded-xl border transition-all",
                    effectiveTheme === "dark"
                      ? "border-slate-800 bg-slate-800/30"
                      : "border-slate-200 bg-white"
                  )}
                >
                  <button
                    onClick={() => toggleArticle(article.id)}
                    className="flex w-full items-center justify-between p-4"
                  >
                    <span
                      className={cn(
                        "text-left font-medium",
                        effectiveTheme === "dark" ? "text-slate-200" : "text-slate-700"
                      )}
                    >
                      {article.title}
                    </span>
                    {expandedArticles.has(article.id) ? (
                      <ChevronUp
                        className={cn(
                          "h-5 w-5 shrink-0",
                          effectiveTheme === "dark" ? "text-slate-500" : "text-slate-400"
                        )}
                      />
                    ) : (
                      <ChevronDown
                        className={cn(
                          "h-5 w-5 shrink-0",
                          effectiveTheme === "dark" ? "text-slate-500" : "text-slate-400"
                        )}
                      />
                    )}
                  </button>
                  <AnimatePresence>
                    {expandedArticles.has(article.id) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div
                          className={cn(
                            "border-t px-4 pb-4",
                            effectiveTheme === "dark" ? "border-slate-800" : "border-slate-200"
                          )}
                        >
                          <div
                            className={cn(
                              "prose prose-sm max-w-none pt-3",
                              effectiveTheme === "dark" ? "prose-invert" : ""
                            )}
                            dangerouslySetInnerHTML={{ __html: article.content }}
                          />
                          {article.quickAction && (
                            <button
                              onClick={() => handleQuickAction(article.quickAction!)}
                              className={cn(
                                "mt-4 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                                effectiveTheme === "dark"
                                  ? "bg-accent-500 text-white hover:bg-accent-600"
                                  : "bg-indigo-600 text-white hover:bg-indigo-700"
                              )}
                            >
                              {article.quickAction.label}
                              <ExternalLink className="h-4 w-4" />
                            </button>
                          )}
                          {/* Feedback */}
                          <div className="mt-4 flex items-center gap-2">
                            <span
                              className={cn(
                                "text-xs",
                                effectiveTheme === "dark" ? "text-slate-500" : "text-slate-400"
                              )}
                            >
                              Was this helpful?
                            </span>
                            <button
                              onClick={() => handleFeedback(article.id, true)}
                              disabled={feedbackSubmitted.has(article.id)}
                              className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                                feedbackSubmitted.has(article.id)
                                  ? "cursor-not-allowed opacity-50"
                                  : effectiveTheme === "dark"
                                  ? "hover:bg-slate-700"
                                  : "hover:bg-slate-100"
                              )}
                            >
                              <ThumbsUp
                                className={cn(
                                  "h-4 w-4",
                                  feedbackSubmitted.has(article.id + "_helpful")
                                    ? "text-green-500"
                                    : effectiveTheme === "dark"
                                    ? "text-slate-400"
                                    : "text-slate-500"
                                )}
                              />
                            </button>
                            <button
                              onClick={() => handleFeedback(article.id, false)}
                              disabled={feedbackSubmitted.has(article.id)}
                              className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                                feedbackSubmitted.has(article.id)
                                  ? "cursor-not-allowed opacity-50"
                                  : effectiveTheme === "dark"
                                  ? "hover:bg-slate-700"
                                  : "hover:bg-slate-100"
                              )}
                            >
                              <ThumbsDown
                                className={cn(
                                  "h-4 w-4",
                                  feedbackSubmitted.has(article.id + "_not_helpful")
                                    ? "text-red-500"
                                    : effectiveTheme === "dark"
                                    ? "text-slate-400"
                                    : "text-slate-500"
                                )}
                              />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderSearch() {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        {/* Back button */}
        <button
          onClick={() => {
            setSearchQuery("");
            setActiveSection("home");
          }}
          className={cn(
            "mb-4 flex items-center gap-2 text-sm transition-colors",
            effectiveTheme === "dark"
              ? "text-slate-400 hover:text-slate-200"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </button>

        {isSearching ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : searchResults.length === 0 ? (
          <div className="py-8 text-center">
            <Search className="mx-auto mb-3 h-10 w-10 text-slate-400" />
            <p
              className={cn(
                "text-sm",
                effectiveTheme === "dark" ? "text-slate-400" : "text-slate-500"
              )}
            >
              No results found for &ldquo;{searchQuery}&rdquo;
            </p>
            <p
              className={cn(
                "mt-1 text-xs",
                effectiveTheme === "dark" ? "text-slate-500" : "text-slate-400"
              )}
            >
              Try different keywords or browse the categories above.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p
              className={cn(
                "mb-3 text-sm",
                effectiveTheme === "dark" ? "text-slate-400" : "text-slate-500"
              )}
            >
              Found {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
            </p>
            {searchResults.map((article) => (
              <button
                key={article.id}
                onClick={() => {
                  selectArticle(article);
                }}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl p-3 text-left transition-colors",
                  effectiveTheme === "dark"
                    ? "bg-slate-800/50 hover:bg-slate-800"
                    : "bg-white hover:bg-slate-50 border border-slate-200"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    effectiveTheme === "dark" ? "bg-slate-700" : "bg-slate-100"
                  )}
                >
                  {sectionIcons[article.contentType]}
                </div>
                <div className="min-w-0 flex-1">
                  <h4
                    className={cn(
                      "font-medium",
                      effectiveTheme === "dark" ? "text-slate-200" : "text-slate-700"
                    )}
                  >
                    {article.title}
                  </h4>
                  <p
                    className={cn(
                      "mt-1 line-clamp-2 text-xs",
                      effectiveTheme === "dark" ? "text-slate-400" : "text-slate-500"
                    )}
                    dangerouslySetInnerHTML={{ __html: article.content.slice(0, 150) + "..." }}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderArticle() {
    if (!selectedArticle) return null;

    return (
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div
          className={cn(
            "sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3",
            effectiveTheme === "dark"
              ? "border-slate-800 bg-slate-900"
              : "border-slate-200 bg-white"
          )}
        >
          <button
            onClick={() => selectArticle(null)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
              effectiveTheme === "dark"
                ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            )}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span
            className={cn(
              "text-xs font-medium uppercase tracking-wider",
              effectiveTheme === "dark" ? "text-slate-500" : "text-slate-400"
            )}
          >
            {sectionLabels[selectedArticle.contentType]}
          </span>
        </div>

        {/* Content */}
        <div className="p-4">
          <h2
            className={cn(
              "mb-4 text-lg font-bold",
              effectiveTheme === "dark" ? "text-slate-100" : "text-slate-900"
            )}
          >
            {selectedArticle.title}
          </h2>
          <div
            className={cn(
              "prose prose-sm max-w-none",
              effectiveTheme === "dark" ? "prose-invert" : ""
            )}
            dangerouslySetInnerHTML={{ __html: selectedArticle.content }}
          />

          {selectedArticle.quickAction && (
            <button
              onClick={() => handleQuickAction(selectedArticle.quickAction!)}
              className={cn(
                "mt-6 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-medium transition-colors",
                effectiveTheme === "dark"
                  ? "bg-accent-500 text-white hover:bg-accent-600"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              )}
            >
              {selectedArticle.quickAction.label}
              <ExternalLink className="h-4 w-4" />
            </button>
          )}

          {/* Feedback */}
          <div className="mt-6 flex items-center justify-center gap-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
            <span
              className={cn(
                "text-sm",
                effectiveTheme === "dark" ? "text-slate-400" : "text-slate-500"
              )}
            >
              Was this article helpful?
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handleFeedback(selectedArticle.id, true)}
                disabled={feedbackSubmitted.has(selectedArticle.id)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                  feedbackSubmitted.has(selectedArticle.id)
                    ? "cursor-not-allowed opacity-50"
                    : effectiveTheme === "dark"
                    ? "bg-slate-700 hover:bg-green-500/20"
                    : "bg-slate-200 hover:bg-green-100"
                )}
              >
                <ThumbsUp
                  className={cn(
                    "h-5 w-5",
                    feedbackSubmitted.has(selectedArticle.id + "_helpful")
                      ? "text-green-500"
                      : effectiveTheme === "dark"
                      ? "text-slate-400"
                      : "text-slate-500"
                  )}
                />
              </button>
              <button
                onClick={() => handleFeedback(selectedArticle.id, false)}
                disabled={feedbackSubmitted.has(selectedArticle.id)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                  feedbackSubmitted.has(selectedArticle.id)
                    ? "cursor-not-allowed opacity-50"
                    : effectiveTheme === "dark"
                    ? "bg-slate-700 hover:bg-red-500/20"
                    : "bg-slate-200 hover:bg-red-100"
                )}
              >
                <ThumbsDown
                  className={cn(
                    "h-5 w-5",
                    feedbackSubmitted.has(selectedArticle.id + "_not_helpful")
                      ? "text-red-500"
                      : effectiveTheme === "dark"
                      ? "text-slate-400"
                      : "text-slate-500"
                  )}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderTickets() {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <button
          onClick={() => setActiveSection("home")}
          className={cn(
            "mb-4 flex items-center gap-2 text-sm transition-colors",
            effectiveTheme === "dark"
              ? "text-slate-400 hover:text-slate-200"
              : "text-slate-500 hover:text-slate-700"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </button>

        <div className="text-center">
          <div
            className={cn(
              "mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full",
              effectiveTheme === "dark" ? "bg-slate-800" : "bg-slate-100"
            )}
          >
            <MessageSquare
              className={cn(
                "h-8 w-8",
                effectiveTheme === "dark" ? "text-slate-400" : "text-slate-500"
              )}
            />
          </div>
          <h3
            className={cn(
              "mb-2 font-semibold",
              effectiveTheme === "dark" ? "text-slate-100" : "text-slate-900"
            )}
          >
            Contact Support
          </h3>
          <p
            className={cn(
              "mb-6 text-sm",
              effectiveTheme === "dark" ? "text-slate-400" : "text-slate-500"
            )}
          >
            Need more help? Create a support ticket and our team will assist you.
          </p>
          <a
            href="/tickets"
            onClick={(e) => {
              e.preventDefault();
              window.location.href = "/tickets";
            }}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-medium transition-colors",
              effectiveTheme === "dark"
                ? "bg-accent-500 text-white hover:bg-accent-600"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            )}
          >
            <FileText className="h-4 w-4" />
            Go to Tickets
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search Bar */}
      <div
        className={cn(
          "border-b px-4 py-3",
          effectiveTheme === "dark" ? "border-slate-800" : "border-slate-200"
        )}
      >
        <div
          className={cn(
            "relative flex items-center",
            effectiveTheme === "dark" ? "text-slate-300" : "text-slate-600"
          )}
        >
          <Search className="absolute left-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search for help..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full rounded-lg py-2 pl-9 pr-8 text-sm outline-none transition-colors",
              effectiveTheme === "dark"
                ? "bg-slate-800 text-slate-200 placeholder:text-slate-500 focus:bg-slate-700"
                : "bg-slate-100 text-slate-700 placeholder:text-slate-400 focus:bg-slate-200"
            )}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content based on active section */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-2 h-10 w-10 text-red-500" />
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        </div>
      ) : activeSection === "home" ? (
        renderHome()
      ) : activeSection === "search" ? (
        renderSearch()
      ) : activeSection === "article" ? (
        renderArticle()
      ) : activeSection === "tickets" ? (
        renderTickets()
      ) : (
        renderSection(activeSection)
      )}
    </div>
  );
}
