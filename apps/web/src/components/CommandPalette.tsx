import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Search,
  Home,
  Trophy,
  Wallet,
  User,
  Settings,
  Sun,
  Moon,
  Monitor,
  Contrast as ContrastIcon,
  LogIn,
  LogOut,
  Play,
  Check,
  CornerDownLeft,
  Swords,
  MessageCircle,
  Megaphone,
  Gift,
  LifeBuoy,
  Users,
  Bell,
  Medal,
} from 'lucide-react';
import { router } from '../router';
import { GAMES_DATA } from '../data/games';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { ACCENTS, ACCENT_SWATCHES, useTheme, type Accent, type Contrast } from '../contexts/ThemeProvider';
import { cn } from '../lib/utils';
import { ConfirmDialog } from './ui/ConfirmDialog';

interface PaletteItem {
  id: string;
  label: string;
  keywords: string;
  group: string;
  icon: React.ReactNode;
  onSelect: () => void;
  active?: boolean;
}

const ICON_CLS = 'w-4 h-4 shrink-0';

export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen, togglePalette } = useUIStore();
  const { theme, setTheme, accent, setAccent, contrast, setContrast, effectiveTheme } = useTheme();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const reduceMotion = useReducedMotion();

  const [query, setQuery] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const go = (path: string) => {
    setPaletteOpen(false);
    router.navigate(path);
  };

  const items = useMemo<PaletteItem[]>(() => {
    const base: PaletteItem[] = [
      {
        id: 'nav-home',
        label: 'Home',
        keywords: 'home start dashboard',
        group: 'Navigate',
        icon: <Home className={ICON_CLS} />,
        onSelect: () => go('/'),
      },
      {
        id: 'nav-leaderboard',
        label: 'Leaderboard',
        keywords: 'leaderboard ranks top players',
        group: 'Navigate',
        icon: <Trophy className={ICON_CLS} />,
        onSelect: () => go('/leaderboard'),
      },
      {
        id: 'nav-wallet',
        label: 'Wallet',
        keywords: 'wallet balance coins money',
        group: 'Navigate',
        icon: <Wallet className={ICON_CLS} />,
        onSelect: () => (session ? go('/wallet') : go('/login')),
      },
      {
        id: 'nav-profile',
        label: 'Profile',
        keywords: 'profile account avatar me',
        group: 'Navigate',
        icon: <User className={ICON_CLS} />,
        onSelect: () => (session ? go('/profile') : go('/login')),
      },
      {
        id: 'nav-settings',
        label: 'Settings',
        keywords: 'settings preferences options',
        group: 'Navigate',
        icon: <Settings className={ICON_CLS} />,
        onSelect: () => (session ? go('/settings') : go('/login')),
      },
      {
        id: 'nav-tournaments',
        label: 'Tournaments',
        keywords: 'tournament compete prize brackets',
        group: 'Navigate',
        icon: <Swords className={ICON_CLS} />,
        onSelect: () => (session ? go('/tournaments') : go('/login')),
      },
      {
        id: 'nav-messages',
        label: 'Messages',
        keywords: 'messages chat dm inbox',
        group: 'Navigate',
        icon: <MessageCircle className={ICON_CLS} />,
        onSelect: () => (session ? go('/messages') : go('/login')),
      },
      {
        id: 'nav-friends',
        label: 'Friends',
        keywords: 'friends add invite players',
        group: 'Navigate',
        icon: <Users className={ICON_CLS} />,
        onSelect: () => (session ? go('/friends') : go('/login')),
      },
      {
        id: 'nav-achievements',
        label: 'Achievements',
        keywords: 'achievements badges trophies rewards xp',
        group: 'Navigate',
        icon: <Medal className={ICON_CLS} />,
        onSelect: () => (session ? go('/achievements') : go('/login')),
      },
      {
        id: 'nav-notifications',
        label: 'Notifications',
        keywords: 'notifications alerts bell unread',
        group: 'Navigate',
        icon: <Bell className={ICON_CLS} />,
        onSelect: () => (session ? go('/notifications') : go('/login')),
      },
      {
        id: 'nav-announcements',
        label: 'Announcements',
        keywords: 'announcements news updates alerts',
        group: 'Navigate',
        icon: <Megaphone className={ICON_CLS} />,
        onSelect: () => (session ? go('/announcements') : go('/login')),
      },
      {
        id: 'nav-referrals',
        label: 'Referrals',
        keywords: 'referrals invite friends earn',
        group: 'Navigate',
        icon: <Gift className={ICON_CLS} />,
        onSelect: () => (session ? go('/referrals') : go('/login')),
      },
      {
        id: 'nav-support',
        label: 'Support',
        keywords: 'support tickets help contact',
        group: 'Navigate',
        icon: <LifeBuoy className={ICON_CLS} />,
        onSelect: () => (session ? go('/tickets') : go('/login')),
      },
      {
        id: 'theme-toggle',
        label: `Theme: ${effectiveTheme === 'dark' ? 'dark' : 'light'}`,
        keywords: 'theme dark light mode toggle',
        group: 'Actions',
        icon: effectiveTheme === 'dark' ? <Sun className={ICON_CLS} /> : <Moon className={ICON_CLS} />,
        onSelect: () => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'theme-system',
        label: 'Theme: follow system',
        keywords: 'theme system auto',
        group: 'Actions',
        icon: <Monitor className={ICON_CLS} />,
        active: theme === 'system',
        onSelect: () => setTheme('system'),
      },
      {
        id: 'contrast',
        label: `High contrast: ${contrast === 'high' ? 'on' : 'off'}`,
        keywords: 'contrast accessibility a11y',
        group: 'Actions',
        icon: <ContrastIcon className={ICON_CLS} />,
        active: contrast === 'high',
        onSelect: () => setContrast((contrast === 'high' ? 'normal' : 'high') as Contrast),
      },
      ...ACCENTS.map<PaletteItem>((value: Accent) => ({
        id: `accent-${value}`,
        label: `Accent color: ${value}`,
        keywords: `accent color theme ${value}`,
        group: 'Actions',
        icon: <span className={cn('w-4 h-4 rounded-full', ACCENT_SWATCHES[value])} />,
        active: accent === value,
        onSelect: () => setAccent(value),
      })),
      ...(session
        ? [
            {
              id: 'auth-signout',
              label: 'Sign out',
              keywords: 'sign out logout',
              group: 'Account',
              icon: <LogOut className={ICON_CLS} />,
              onSelect: () => {
                setPaletteOpen(false);
                setShowLogoutConfirm(true);
              },
            },
          ]
        : [
            {
              id: 'auth-login',
              label: 'Sign in',
              keywords: 'sign in login auth',
              group: 'Account',
              icon: <LogIn className={ICON_CLS} />,
              onSelect: () => go('/login'),
            },
            {
              id: 'auth-signup',
              label: 'Create account',
              keywords: 'sign up create account register',
              group: 'Account',
              icon: <LogIn className={ICON_CLS} />,
              onSelect: () => go('/signup'),
            },
          ]),
    ];

    const games: PaletteItem[] = GAMES_DATA.map((game) => ({
      id: `game-${game.slug}`,
      label: game.name,
      keywords: `${game.name} ${game.category} play ${game.description}`,
      group: 'Games',
      icon: <Play className={ICON_CLS} />,
      onSelect: () => go(`/games/${game.slug}`),
    }));

    return [...base, ...games];
  }, [theme, effectiveTheme, accent, contrast, session, signOut, setTheme, setAccent, setContrast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q
      ? items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) || item.keywords.toLowerCase().includes(q)
        )
      : items.filter((item) => item.group !== 'Actions');
    if (list.length === 0 && q) list = items;
    return list.slice(0, 40);
  }, [items, query]);

  useEffect(() => {
    if (!paletteOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setQuery('');
    setSelectedIndex(0);

    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [paletteOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        togglePalette();
      }
      if (event.key === 'Escape' && paletteOpen) {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paletteOpen, togglePalette, setPaletteOpen]);

  const close = () => {
    setPaletteOpen(false);
    previousFocusRef.current?.focus();
  };

  const onSelect = (item: PaletteItem) => {
    setPaletteOpen(false);
    item.onSelect();
  };

  const groups = useMemo(() => {
    const order = ['Navigate', 'Games', 'Actions', 'Account'];
    return order
      .map((name) => ({ name, items: filtered.filter((i) => i.group === name) }))
      .filter((g) => g.items.length > 0);
  }, [filtered]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = filtered[selectedIndex];
      if (item) onSelect(item);
    }
  };

  return (
    <>
      <AnimatePresence>
        {paletteOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-20 sm:pt-28">
          <motion.button
            aria-label="Close search"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm cursor-default"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={close}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search games, pages and settings"
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 px-4">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Search games, pages, settings..."
                className="h-12 w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none"
                role="combobox"
                aria-expanded="true"
                aria-controls="command-palette-list"
              />
              <kbd className="hidden sm:block rounded-md border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                ESC
              </kbd>
            </div>

            <div
              id="command-palette-list"
              className="max-h-[60vh] overflow-y-auto p-2"
            >
              {groups.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No results for “{query}”
                </p>
              ) : (
                groups.map((group, gi) => (
                  <div key={group.name} className="mb-1">
                    <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {group.name}
                    </p>
                    {group.items.map((item, ii) => {
                      const index = filtered.indexOf(item);
                      return (
                        <button
                          key={item.id}
                          onMouseMove={() => setSelectedIndex(index)}
                          onClick={() => onSelect(item)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                            index === selectedIndex
                              ? 'bg-accent-500/10 text-slate-900 dark:text-white'
                              : 'text-slate-600 dark:text-slate-300'
                          )}
                          aria-selected={index === selectedIndex}
                          role="option"
                        >
                          <span
                            className={cn(
                              'flex items-center justify-center',
                              index === selectedIndex
                                ? 'text-accent-500'
                                : 'text-slate-400 dark:text-slate-500'
                            )}
                          >
                            {item.icon}
                          </span>
                          <span className="flex-1 truncate font-medium">{item.label}</span>
                          {item.active && (
                            <Check className="w-4 h-4 text-accent-500" aria-label="Active" />
                          )}
                          {index === selectedIndex && (
                            <CornerDownLeft className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

      {/* Logout Confirmation Safety Dialog */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title="Logout?"
        message="Are you sure you want to log out?"
        confirmText="Logout"
        cancelText="Cancel"
        variant="danger"
        icon="logout"
        onConfirm={async () => {
          await signOut();
          void router.navigate('/');
        }}
      />
    </>
  );
}
