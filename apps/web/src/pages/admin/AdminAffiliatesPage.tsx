import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Coins,
  Percent,
  TrendingUp,
  Users,
  Award,
  Clock,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Calendar,
  Filter,
  ArrowRight,
  ExternalLink,
  Copy,
  Info,
  Sliders,
  History,
  Lock,
  Ban,
  BarChart3,
  FileText,
  Check,
} from 'lucide-react';
import { apiClient } from '../../services/api/client';
import { openMfaModal } from '../../components/auth/MfaVerificationModal';
import { useMe } from '../../services/api/useMe';
import { hasPermission } from '@gaming-hub/shared';
import type {
  AdminAffiliateStats,
  AdminCommissionItem,
  AdminAffiliateAuditItem,
} from '@gaming-hub/shared';
import { Drawer } from '../../components/ui/Drawer';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

interface AffiliateSettingsData {
  enabled: boolean;
  affiliateEnabled: boolean;
  affiliateMode: 'ONE_TIME' | 'CONTINUOUS';
  affiliateDepositPercent: number;
  minDepositEligible?: number;
  maxAffiliateCommissionPerDeposit?: number;
  affiliateDailyCommissionCap?: number;
  affiliateMonthlyCommissionCap?: number;
  affiliateCommissionHoldMinutes?: number;
  affiliateOnFirstDeposit?: boolean;
}

export function AdminAffiliatesPage() {
  const { me } = useMe();
  const userRole = me?.user?.role;
  const canEdit =
    userRole === 'ADMIN' ||
    (userRole ? hasPermission(userRole as any, 'admin:settings:edit') : false);

  // Sub-navigation tab
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'RISK' | 'MONITORING'>(
    'OVERVIEW'
  );

  // 1. Settings state
  const [settings, setSettings] = useState<AffiliateSettingsData>({
    enabled: true,
    affiliateEnabled: true,
    affiliateMode: 'CONTINUOUS',
    affiliateDepositPercent: 5,
    minDepositEligible: 0,
    maxAffiliateCommissionPerDeposit: 0,
    affiliateDailyCommissionCap: 0,
    affiliateMonthlyCommissionCap: 0,
    affiliateCommissionHoldMinutes: 0,
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form edit state
  const [formState, setFormState] = useState<{
    affiliateEnabled: boolean;
    affiliateMode: 'ONE_TIME' | 'CONTINUOUS';
    affiliateDepositPercent: string;
    minDepositEligible: string;
    maxAffiliateCommissionPerDeposit: string;
    affiliateDailyCommissionCap: string;
    affiliateMonthlyCommissionCap: string;
    affiliateCommissionHoldMinutes: string;
  }>({
    affiliateEnabled: true,
    affiliateMode: 'CONTINUOUS',
    affiliateDepositPercent: '5',
    minDepositEligible: '0',
    maxAffiliateCommissionPerDeposit: '0',
    affiliateDailyCommissionCap: '0',
    affiliateMonthlyCommissionCap: '0',
    affiliateCommissionHoldMinutes: '0',
  });

  // 2. Stats state
  const [stats, setStats] = useState<AdminAffiliateStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // 3. Commissions state
  const [commissions, setCommissions] = useState<AdminCommissionItem[]>([]);
  const [totalCommissions, setTotalCommissions] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [loadingCommissions, setLoadingCommissions] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modeFilter, setModeFilter] = useState('ALL');
  const [searchReferrer, setSearchReferrer] = useState('');
  const [searchReferred, setSearchReferred] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected commission for drawer
  const [selectedCommission, setSelectedCommission] =
    useState<AdminCommissionItem | null>(null);

  // 4. Audit history state
  const [auditLogs, setAuditLogs] = useState<AdminAffiliateAuditItem[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);

  // 5. Risk and Fraud State
  const [riskOverview, setRiskOverview] = useState<{
    flaggedReferrals: number;
    highRiskReferrals: number;
    commissionsUnderReview: number;
    reversedCommissions: number;
    volume24h: number;
  } | null>(null);
  const [riskEvents, setRiskEvents] = useState<any[]>([]);
  const [totalRiskEvents, setTotalRiskEvents] = useState(0);
  const [riskPage, setRiskPage] = useState(1);
  const [riskSeverityFilter, setRiskSeverityFilter] = useState('ALL');
  const [riskStatusFilter, setRiskStatusFilter] = useState('ALL');
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [riskAlerts, setRiskAlerts] = useState<any>(null);

  // Review Modal state
  const [selectedRiskEvent, setSelectedRiskEvent] = useState<any | null>(null);
  const [reviewStatusChoice, setReviewStatusChoice] = useState<
    'REVIEWED' | 'DISMISSED'
  >('REVIEWED');
  const [reviewNoteInput, setReviewNoteInput] = useState('');
  const [blockReasonInput, setBlockReasonInput] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // 6. Monitoring & Analytics State
  const [analyticsData, setAnalyticsData] = useState<any | null>(null);
  const [dailyReportData, setDailyReportData] = useState<any | null>(null);
  const [dailyReportDate, setDailyReportDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<any | null>(null);

  // Confirmation modal state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: async () => {},
  });

  // Fresh MFA retry refs
  const pendingValuesRef = useRef<Partial<AffiliateSettingsData> | null>(null);
  const isRetryingMfaRef = useRef<boolean>(false);

  // Fetch Settings
  const loadSettings = useCallback(async () => {
    try {
      setLoadingSettings(true);
      const res = await apiClient.get<AffiliateSettingsData>(
        '/admin/referrals/settings'
      );
      setSettings(res);
      setFormState({
        affiliateEnabled: res.affiliateEnabled ?? true,
        affiliateMode: res.affiliateMode ?? 'CONTINUOUS',
        affiliateDepositPercent: String(res.affiliateDepositPercent ?? 5),
        minDepositEligible: String(res.minDepositEligible ?? 0),
        maxAffiliateCommissionPerDeposit: String(
          res.maxAffiliateCommissionPerDeposit ?? 0
        ),
        affiliateDailyCommissionCap: String(res.affiliateDailyCommissionCap ?? 0),
        affiliateMonthlyCommissionCap: String(
          res.affiliateMonthlyCommissionCap ?? 0
        ),
        affiliateCommissionHoldMinutes: String(
          res.affiliateCommissionHoldMinutes ?? 0
        ),
      });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load affiliate settings');
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  // Fetch Stats
  const loadStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      const res = await apiClient.get<AdminAffiliateStats>(
        '/admin/affiliates/stats'
      );
      setStats(res);
    } catch {
      // stats fallback
    } finally {
      setLoadingStats(false);
    }
  }, []);

  // Fetch Commissions
  const loadCommissions = useCallback(async () => {
    try {
      setLoadingCommissions(true);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (modeFilter !== 'ALL') params.set('mode', modeFilter);
      if (searchReferrer.trim())
        params.set('searchReferrer', searchReferrer.trim());
      if (searchReferred.trim())
        params.set('searchReferred', searchReferred.trim());
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await apiClient.get<{
        items: AdminCommissionItem[];
        total: number;
      }>(`/admin/affiliates/commissions?${params.toString()}`);
      setCommissions(res.items);
      setTotalCommissions(res.total);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load commissions');
    } finally {
      setLoadingCommissions(false);
    }
  }, [
    page,
    statusFilter,
    modeFilter,
    searchReferrer,
    searchReferred,
    startDate,
    endDate,
  ]);

  // Fetch Audit History
  const loadAudit = useCallback(async () => {
    try {
      setLoadingAudit(true);
      const res = await apiClient.get<{ items: AdminAffiliateAuditItem[] }>(
        '/admin/affiliates/audit'
      );
      setAuditLogs(res.items);
    } catch {
      // audit fallback
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadStats();
    void loadAudit();
  }, [loadSettings, loadStats, loadAudit]);

  useEffect(() => {
    void loadCommissions();
  }, [loadCommissions]);

  // Handle fresh MFA verified event
  useEffect(() => {
    const onMfaVerified = async () => {
      if (pendingValuesRef.current && !isRetryingMfaRef.current) {
        isRetryingMfaRef.current = true;
        const vals = pendingValuesRef.current;
        pendingValuesRef.current = null;
        try {
          await executeSave(vals);
        } finally {
          isRetryingMfaRef.current = false;
        }
      }
    };

    window.addEventListener('gaming-hub:mfa-verified', onMfaVerified);
    return () =>
      window.removeEventListener('gaming-hub:mfa-verified', onMfaVerified);
  }, []);

  // Core save execution
  const executeSave = async (payload: Partial<AffiliateSettingsData>) => {
    setIsSaving(true);
    try {
      await apiClient.patch('/admin/referrals/settings', payload);
      toast.success('Affiliate settings successfully updated!');
      pendingValuesRef.current = null;
      await Promise.all([loadSettings(), loadStats(), loadAudit()]);
    } catch (err: any) {
      if (
        err?.code === 'MFA_REQUIRED' ||
        err?.message?.includes('2FA verification') ||
        err?.message?.includes('/api/auth/2fa/verify')
      ) {
        pendingValuesRef.current = payload;
        openMfaModal(
          'Two-Factor Authentication is required to update affiliate campaign settings.'
        );
        return;
      }
      toast.error(err?.message || 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  // Fetch Risk
  const loadRisk = useCallback(async () => {
    try {
      setLoadingRisk(true);
      const params = new URLSearchParams({
        page: String(riskPage),
        pageSize: '15',
      });
      if (riskSeverityFilter !== 'ALL') params.set('severity', riskSeverityFilter);
      if (riskStatusFilter !== 'ALL') params.set('status', riskStatusFilter);

      const res = await apiClient.get<{
        overview: any;
        events: any[];
        total: number;
        alerts: any;
      }>(`/admin/affiliates/risk?${params.toString()}`);

      setRiskOverview(res.overview);
      setRiskEvents(res.events);
      setTotalRiskEvents(res.total);
      setRiskAlerts(res.alerts);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load risk events');
    } finally {
      setLoadingRisk(false);
    }
  }, [riskPage, riskSeverityFilter, riskStatusFilter]);

  // Fetch Analytics & Daily Report
  const loadAnalytics = useCallback(async () => {
    try {
      setLoadingAnalytics(true);
      const res = await apiClient.get<any>('/admin/affiliates/analytics');
      setAnalyticsData(res);
    } catch {
      // fallback
    } finally {
      setLoadingAnalytics(false);
    }
  }, []);

  const loadDailyReport = useCallback(
    async (date?: string) => {
      try {
        const d = date || dailyReportDate;
        const res = await apiClient.get<any>(
          `/admin/affiliates/daily-report?date=${d}`
        );
        setDailyReportData(res);
      } catch {
        // fallback
      }
    },
    [dailyReportDate]
  );

  // Trigger reconciliation
  const handleTriggerReconcile = async (dryRun = true) => {
    try {
      setIsReconciling(true);
      const res = await apiClient.post<any>('/admin/affiliates/reconcile', {
        dryRun,
      });
      setReconcileResult(res);
      toast.success(
        dryRun
          ? 'Reconciliation dry-run completed safely (0 database writes).'
          : `Reconciliation completed: ${res.repaired} repaired.`
      );
      void loadRisk();
      void loadStats();
      void loadCommissions();
    } catch (err: any) {
      if (
        err?.code === 'MFA_REQUIRED' ||
        err?.message?.includes('2FA verification')
      ) {
        openMfaModal(
          'Two-Factor Authentication is required for reconciliation.'
        );
        return;
      }
      toast.error(err?.message || 'Reconciliation failed');
    } finally {
      setIsReconciling(false);
    }
  };

  // Risk actions
  const handleReviewRiskEvent = async (
    eventId: string,
    status: 'REVIEWED' | 'DISMISSED',
    note?: string
  ) => {
    try {
      setIsSubmittingReview(true);
      await apiClient.patch(`/admin/affiliates/risk/${eventId}/review`, {
        status,
        note,
      });
      toast.success(`Risk event marked as ${status.toLowerCase()}`);
      setSelectedRiskEvent(null);
      void loadRisk();
    } catch (err: any) {
      if (
        err?.code === 'MFA_REQUIRED' ||
        err?.message?.includes('2FA verification')
      ) {
        openMfaModal(
          'Two-Factor Authentication is required to review risk events.'
        );
        return;
      }
      toast.error(err?.message || 'Failed to review risk event');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleBlockReferral = async (referralId: string, reason: string) => {
    if (!reason.trim()) {
      toast.error('Please specify a reason for blocking affiliate earnings.');
      return;
    }
    try {
      setIsSubmittingReview(true);
      await apiClient.patch(
        `/admin/affiliates/referrals/${referralId}/block`,
        { reason: reason.trim() }
      );
      toast.success('Referral affiliate earnings successfully blocked');
      setSelectedRiskEvent(null);
      setBlockReasonInput('');
      void loadRisk();
    } catch (err: any) {
      if (
        err?.code === 'MFA_REQUIRED' ||
        err?.message?.includes('2FA verification')
      ) {
        openMfaModal(
          'Two-Factor Authentication is required to block affiliate earnings.'
        );
        return;
      }
      toast.error(err?.message || 'Failed to block affiliate earnings');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleUnblockReferral = async (referralId: string) => {
    try {
      setIsSubmittingReview(true);
      await apiClient.patch(
        `/admin/affiliates/referrals/${referralId}/unblock`,
        {}
      );
      toast.success('Referral affiliate earnings unblocked');
      setSelectedRiskEvent(null);
      void loadRisk();
    } catch (err: any) {
      if (
        err?.code === 'MFA_REQUIRED' ||
        err?.message?.includes('2FA verification')
      ) {
        openMfaModal(
          'Two-Factor Authentication is required to unblock affiliate earnings.'
        );
        return;
      }
      toast.error(err?.message || 'Failed to unblock affiliate earnings');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const [isReleasingHeld, setIsReleasingHeld] = useState(false);
  const handleReleaseHeld = async () => {
    try {
      setIsReleasingHeld(true);
      const res = await apiClient.post<any>(
        '/admin/affiliates/release-held',
        {}
      );
      toast.success(
        `Released ${res.releasedCount ?? 0} matured commissions (${(
          res.totalBonusAmount ?? 0
        ).toLocaleString()} BONUS)`
      );
      void loadRisk();
      void loadCommissions();
      void loadStats();
    } catch (err: any) {
      if (
        err?.code === 'MFA_REQUIRED' ||
        err?.message?.includes('2FA verification')
      ) {
        openMfaModal(
          'Two-Factor Authentication is required to release held commissions.'
        );
        return;
      }
      toast.error(err?.message || 'Failed to release held commissions');
    } finally {
      setIsReleasingHeld(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'RISK') {
      void loadRisk();
    } else if (activeTab === 'MONITORING') {
      void loadAnalytics();
      void loadDailyReport();
    }
  }, [activeTab, loadRisk, loadAnalytics, loadDailyReport]);

  // Submit handler with rate validation and safety confirmations
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      toast.error(
        'Read-only: You do not have permission to modify affiliate settings.'
      );
      return;
    }

    const percent = parseFloat(formState.affiliateDepositPercent);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      toast.error(
        'Please enter a valid commission percentage between 0% and 100%.'
      );
      return;
    }

    const minDeposit = parseFloat(formState.minDepositEligible) || 0;
    if (minDeposit < 0) {
      toast.error('Minimum deposit must be 0 or greater.');
      return;
    }

    const maxCommission =
      parseFloat(formState.maxAffiliateCommissionPerDeposit) || 0;
    if (maxCommission < 0) {
      toast.error('Maximum commission must be 0 or greater.');
      return;
    }

    const dailyCap = parseFloat(formState.affiliateDailyCommissionCap) || 0;
    const monthlyCap = parseFloat(formState.affiliateMonthlyCommissionCap) || 0;
    const holdMinutes = parseInt(formState.affiliateCommissionHoldMinutes, 10) || 0;

    const payload: Partial<AffiliateSettingsData> = {
      affiliateEnabled: formState.affiliateEnabled,
      affiliateMode: formState.affiliateMode,
      affiliateDepositPercent: percent,
      minDepositEligible: minDeposit,
      maxAffiliateCommissionPerDeposit: maxCommission,
      affiliateDailyCommissionCap: dailyCap,
      affiliateMonthlyCommissionCap: monthlyCap,
      affiliateCommissionHoldMinutes: holdMinutes,
    };

    // Check 1: ONE_TIME -> CONTINUOUS transition confirmation
    if (
      settings.affiliateMode === 'ONE_TIME' &&
      formState.affiliateMode === 'CONTINUOUS'
    ) {
      setConfirmDialog({
        isOpen: true,
        title: 'Switch to Continuous Commission Mode',
        message:
          'Continuous mode will allow future eligible deposits from referred users to generate affiliate commission. Historical commissions will not be recalculated.',
        action: async () => {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          await executeSave(payload);
        },
      });
      return;
    }

    // Check 2: Commission percentage increase confirmation
    if (percent > settings.affiliateDepositPercent) {
      setConfirmDialog({
        isOpen: true,
        title: 'Increase Commission Percentage',
        message: `Future eligible deposits will use the new ${percent}% commission rate. Historical commission records remain unchanged.`,
        action: async () => {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          await executeSave(payload);
        },
      });
      return;
    }

    // Default immediate save
    void executeSave(payload);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const totalPages = Math.max(1, Math.ceil(totalCommissions / pageSize));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Affiliate Program Management
            </h1>
            <Badge
              variant={
                settings.affiliateEnabled && settings.enabled
                  ? 'success'
                  : 'danger'
              }
              className="px-3 py-1 font-bold text-xs"
            >
              {settings.affiliateEnabled && settings.enabled
                ? 'Active'
                : 'Disabled'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Configure commission modes, monitor Gaming Hub wallet deposit
            rewards, and review affiliate audit trails.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void loadSettings();
              void loadStats();
              void loadCommissions();
              void loadAudit();
            }}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('OVERVIEW')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'OVERVIEW'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Overview & Settings
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('RISK')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'RISK'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Risk & Fraud Controls
          {((riskOverview?.flaggedReferrals ?? 0) > 0 ||
            (riskOverview?.highRiskReferrals ?? 0) > 0) && (
            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20">
              {(riskOverview?.flaggedReferrals ?? 0) +
                (riskOverview?.highRiskReferrals ?? 0)}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('MONITORING')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'MONITORING'
              ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Analytics & Monitoring
        </button>
      </div>

      {activeTab === 'OVERVIEW' && (
        <>
          {/* Safety Disabled Alert Banner */}
      {!settings.affiliateEnabled && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-500 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-amber-500">
              Affiliate commissions are currently disabled
            </h3>
            <p className="text-xs sm:text-sm text-amber-400/90 leading-relaxed">
              No new affiliate commissions will be credited for user deposits
              while disabled. Existing referral records, historical commissions,
              and firstCommissionAt timestamps remain completely untouched.
            </p>
          </div>
        </div>
      )}

      {/* 8 Overview KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Affiliate Status
            </span>
            <Shield
              className={`w-4 h-4 ${
                settings.affiliateEnabled
                  ? 'text-emerald-500'
                  : 'text-rose-500'
              }`}
            />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {settings.affiliateEnabled ? 'Enabled' : 'Disabled'}
          </p>
          <span className="text-[11px] text-slate-400">Global campaign switch</span>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Mode
            </span>
            <Sliders className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {settings.affiliateMode === 'ONE_TIME'
              ? 'One-Time'
              : 'Continuous'}
          </p>
          <span className="text-[11px] text-slate-400">
            {settings.affiliateMode === 'ONE_TIME'
              ? 'First deposit only'
              : 'Every deposit'}
          </span>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Commission Rate
            </span>
            <Percent className="w-4 h-4 text-teal-500" />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {settings.affiliateDepositPercent}%
          </p>
          <span className="text-[11px] text-slate-400">Of MAIN wallet deposit</span>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Earnings
            </span>
            <Coins className="w-4 h-4 text-amber-500" />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {(stats?.totalAffiliateEarnings ?? 0).toLocaleString()}{' '}
            <span className="text-xs font-bold text-amber-500">BONUS</span>
          </p>
          <span className="text-[11px] text-slate-400">All-time distributed</span>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Commissions
            </span>
            <Award className="w-4 h-4 text-blue-500" />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {(stats?.totalCommissions ?? 0).toLocaleString()}
          </p>
          <span className="text-[11px] text-slate-400">Successful payouts</span>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Active Referrals
            </span>
            <Users className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {(stats?.activeReferrals ?? 0).toLocaleString()}
          </p>
          <span className="text-[11px] text-slate-400">Qualified referee links</span>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Affiliate Users
            </span>
            <Users className="w-4 h-4 text-purple-500" />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {(stats?.affiliateUsers ?? 0).toLocaleString()}
          </p>
          <span className="text-[11px] text-slate-400">Earning referrers</span>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              This Month Paid
            </span>
            <TrendingUp className="w-4 h-4 text-rose-500" />
          </div>
          <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {(stats?.thisMonthPaid ?? 0).toLocaleString()}{' '}
            <span className="text-xs font-bold text-rose-500">BONUS</span>
          </p>
          <span className="text-[11px] text-slate-400">Current calendar month</span>
        </div>
      </div>

      {/* Main Settings Form Card */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              Campaign Configuration
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Manage live affiliate business rules. Updates are fresh-MFA
              protected and logged to the audit trail.
            </p>
          </div>
          {!canEdit && (
            <div className="flex items-center gap-1.5 text-xs text-amber-500 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20 font-medium">
              <Lock className="w-3.5 h-3.5" />
              View-Only Access
            </div>
          )}
        </div>

        <form onSubmit={handleSaveSettings} className="mt-6 space-y-6">
          {/* Status Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
            <div>
              <label className="text-sm font-bold text-slate-900 dark:text-white">
                Affiliate Program Status
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enable or disable ongoing affiliate commission evaluations on
                Gaming Hub wallet deposits.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() =>
                  setFormState((prev) => ({
                    ...prev,
                    affiliateEnabled: !prev.affiliateEnabled,
                  }))
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  formState.affiliateEnabled
                    ? 'bg-emerald-500'
                    : 'bg-slate-300 dark:bg-slate-700'
                } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    formState.affiliateEnabled
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                {formState.affiliateEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          {/* Commission Mode Selection */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-900 dark:text-white">
              Commission Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label
                className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                  formState.affiliateMode === 'ONE_TIME'
                    ? 'border-indigo-500/80 bg-indigo-500/5 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                } ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="affiliateMode"
                  value="ONE_TIME"
                  disabled={!canEdit}
                  checked={formState.affiliateMode === 'ONE_TIME'}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      affiliateMode: e.target.value as any,
                    }))
                  }
                  className="mt-1 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    ONE_TIME
                  </span>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Commission is paid only on the first eligible Gaming Hub
                    wallet deposit made by each referred player.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                  formState.affiliateMode === 'CONTINUOUS'
                    ? 'border-indigo-500/80 bg-indigo-500/5 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                } ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="affiliateMode"
                  value="CONTINUOUS"
                  disabled={!canEdit}
                  checked={formState.affiliateMode === 'CONTINUOUS'}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      affiliateMode: e.target.value as any,
                    }))
                  }
                  className="mt-1 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    CONTINUOUS
                  </span>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Commission is paid on every eligible Gaming Hub wallet deposit
                    made by referred players indefinitely.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Rates, Caps, and Bounds */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Commission Percentage
              </label>
              <div className="relative mt-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  disabled={!canEdit}
                  value={formState.affiliateDepositPercent}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      affiliateDepositPercent: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <span className="absolute right-3.5 top-2.5 text-sm font-bold text-slate-400">
                  %
                </span>
              </div>
              <span className="text-[11px] text-slate-400">Standard rate: 0–100%</span>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Minimum Eligible Deposit
              </label>
              <div className="relative mt-2">
                <input
                  type="number"
                  min="0"
                  disabled={!canEdit}
                  value={formState.minDepositEligible}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      minDepositEligible: e.target.value,
                    }))
                  }
                  placeholder="Optional (0 for any)"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <span className="text-[11px] text-slate-400">0 means no minimum</span>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Max Commission / Deposit
              </label>
              <div className="relative mt-2">
                <input
                  type="number"
                  min="0"
                  disabled={!canEdit}
                  value={formState.maxAffiliateCommissionPerDeposit}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      maxAffiliateCommissionPerDeposit: e.target.value,
                    }))
                  }
                  placeholder="Optional (0 for unlimited)"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <span className="text-[11px] text-slate-400">0 means unlimited</span>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Daily Commission Cap
              </label>
              <div className="relative mt-2">
                <input
                  type="number"
                  min="0"
                  disabled={!canEdit}
                  value={formState.affiliateDailyCommissionCap}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      affiliateDailyCommissionCap: e.target.value,
                    }))
                  }
                  placeholder="Optional (0 for unlimited)"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <span className="text-[11px] text-slate-400">Max BONUS coins per day per referrer</span>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Monthly Commission Cap
              </label>
              <div className="relative mt-2">
                <input
                  type="number"
                  min="0"
                  disabled={!canEdit}
                  value={formState.affiliateMonthlyCommissionCap}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      affiliateMonthlyCommissionCap: e.target.value,
                    }))
                  }
                  placeholder="Optional (0 for unlimited)"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <span className="text-[11px] text-slate-400">Max BONUS coins per month per referrer</span>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Commission Hold (Minutes)
              </label>
              <div className="relative mt-2">
                <input
                  type="number"
                  min="0"
                  disabled={!canEdit}
                  value={formState.affiliateCommissionHoldMinutes}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      affiliateCommissionHoldMinutes: e.target.value,
                    }))
                  }
                  placeholder="0 = Immediate, 1440 = 24 hours"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <span className="text-[11px] text-slate-400">User deposit unaffected; bonus held</span>
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Requires Fresh Two-Factor Authentication</span>
            </div>
            {canEdit && (
              <Button
                type="submit"
                variant="primary"
                disabled={isSaving}
                className="px-6 py-2.5 rounded-xl font-bold"
              >
                {isSaving ? 'Saving Changes...' : 'Save Changes'}
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* Admin Commission History Section */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              Commission Ledger History
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Authoritative record of Gaming Hub MAIN wallet deposit
              commissions paid to referrers.
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            Total Records: {totalCommissions.toLocaleString()}
          </span>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="REVERSED">Reversed</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">
              Mode
            </label>
            <select
              value={modeFilter}
              onChange={(e) => {
                setModeFilter(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="ALL">All Modes</option>
              <option value="ONE_TIME">ONE_TIME</option>
              <option value="CONTINUOUS">CONTINUOUS</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">
              Referrer
            </label>
            <div className="relative mt-1">
              <input
                type="text"
                placeholder="Search referrer..."
                value={searchReferrer}
                onChange={(e) => {
                  setSearchReferrer(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">
              Referred Player
            </label>
            <div className="relative mt-1">
              <input
                type="text"
                placeholder="Search referee..."
                value={searchReferred}
                onChange={(e) => {
                  setSearchReferred(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-8 pr-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
            />
          </div>
        </div>

        {/* Commissions Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3.5">Referrer</th>
                <th className="px-4 py-3.5">Referred Player</th>
                <th className="px-4 py-3.5">Wallet Deposit</th>
                <th className="px-4 py-3.5">Rate</th>
                <th className="px-4 py-3.5">Commission</th>
                <th className="px-4 py-3.5">Mode</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {loadingCommissions ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-slate-400"
                  >
                    Loading affiliate commission ledger...
                  </td>
                </tr>
              ) : commissions.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-slate-400"
                  >
                    No affiliate commission records match the active filters.
                  </td>
                </tr>
              ) : (
                commissions.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedCommission(item)}
                    className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">
                      @{item.referrerUsername}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-600 dark:text-slate-300">
                      @{item.referredUsername}
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-200">
                      {item.depositAmount.toLocaleString()} MAIN
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-600 dark:text-slate-400">
                      {item.commissionPercent}%
                    </td>
                    <td className="px-4 py-3.5 font-black text-emerald-600 dark:text-emerald-400">
                      +{item.commissionAmount.toLocaleString()} BONUS
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.affiliateMode === 'ONE_TIME'
                            ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                            : 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20'
                        }`}
                      >
                        {item.affiliateMode}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.status === 'COMPLETED'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-rose-500/10 text-rose-600'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Affiliate Settings Audit Trail Section */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <History className="w-5 h-5 text-indigo-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Affiliate Settings Audit History
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Action: referral.settings_updated
          </span>
        </div>

        <div className="space-y-3">
          {loadingAudit ? (
            <p className="text-xs text-slate-400 py-4">
              Loading settings audit trail...
            </p>
          ) : auditLogs.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">
              No recent affiliate settings modification logs found.
            </p>
          ) : (
            auditLogs.slice(0, 10).map((log) => {
              const prev = log.meta?.previous as Record<string, any> | undefined;
              const next = log.meta?.updated as Record<string, any> | undefined;

              return (
                <div
                  key={log.id}
                  className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-4 space-y-2"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Modified by: @{log.actorUsername}
                    </span>
                    <span className="text-slate-400">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'medium',
                      })}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {next &&
                      Object.keys(next).map((key) => {
                        const oldVal = prev?.[key];
                        const newVal = next[key];
                        if (oldVal === newVal) return null;

                        return (
                          <div
                            key={key}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                          >
                            <span className="font-semibold text-slate-500 dark:text-slate-400">
                              {key}:
                            </span>
                            <span className="text-rose-500 line-through font-mono">
                              {String(oldVal ?? 'none')}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span className="text-emerald-500 font-bold font-mono">
                              {String(newVal)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      </>
      )}

      {/* ================================================================ */}
      {/* RISK & FRAUD CONTROLS TAB */}
      {/* ================================================================ */}
      {activeTab === 'RISK' && (
        <div className="space-y-8">
          {/* 5 Risk KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Flagged Links
                </span>
                <ShieldAlert className="w-4 h-4 text-amber-500" />
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {(riskOverview?.flaggedReferrals ?? 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-slate-400">Active risk signals</span>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  High Risk Events
                </span>
                <AlertOctagon className="w-4 h-4 text-rose-500" />
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400">
                {(riskOverview?.highRiskReferrals ?? 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-slate-400">High / Critical severity</span>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Under Hold / Review
                </span>
                <Clock className="w-4 h-4 text-indigo-500" />
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {(riskOverview?.commissionsUnderReview ?? 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-slate-400">Pending maturity window</span>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Reversed Payouts
                </span>
                <Ban className="w-4 h-4 text-orange-500" />
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {(riskOverview?.reversedCommissions ?? 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-slate-400">Compensated payouts</span>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-all col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  24h Commission Vol
                </span>
                <Coins className="w-4 h-4 text-amber-500" />
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {(riskOverview?.volume24h ?? 0).toLocaleString()}{' '}
                <span className="text-xs font-bold text-amber-500">BONUS</span>
              </p>
              <span className="text-[11px] text-slate-400">Past 24 hours total</span>
            </div>
          </div>

          {/* Operational Alert Banners if any */}
          {riskAlerts?.hasAlerts && riskAlerts.alerts?.length > 0 && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2.5 text-rose-500 font-bold">
                <AlertOctagon className="w-5 h-5" />
                <span>Active Operational & Fraud Alerts</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {riskAlerts.alerts.map((alert: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-rose-500/20 text-xs text-slate-700 dark:text-slate-200 font-medium"
                  >
                    <span>{alert.message}</span>
                    <Badge
                      variant={alert.severity === 'CRITICAL' ? 'danger' : 'warning'}
                      className="text-[10px] uppercase font-bold"
                    >
                      {alert.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risk Events Table Card */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  Affiliate Risk Events & Audit Signals
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Automated security tracking for self-referral attempts, IP/device matches, velocity caps, and ledger anomalies.
                </p>
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                Total Signals: {totalRiskEvents.toLocaleString()}
              </span>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">
                  Severity
                </label>
                <select
                  value={riskSeverityFilter}
                  onChange={(e) => {
                    setRiskSeverityFilter(e.target.value);
                    setRiskPage(1);
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="ALL">All Severities</option>
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase">
                  Review Status
                </label>
                <select
                  value={riskStatusFilter}
                  onChange={(e) => {
                    setRiskStatusFilter(e.target.value);
                    setRiskPage(1);
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="UNREVIEWED">Unreviewed</option>
                  <option value="REVIEWED">Reviewed</option>
                  <option value="DISMISSED">Dismissed</option>
                </select>
              </div>

              <div className="sm:ml-auto flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadRisk()}
                  disabled={loadingRisk}
                  className="flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRisk ? 'animate-spin' : ''}`} />
                  Refresh Signals
                </Button>
              </div>
            </div>

            {/* Risk Events Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Date / Time</th>
                    <th className="py-3 px-4">Severity</th>
                    <th className="py-3 px-4">Risk Type</th>
                    <th className="py-3 px-4">Referrer / User</th>
                    <th className="py-3 px-4">Signals & Details</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {loadingRisk ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Loading risk events...
                      </td>
                    </tr>
                  ) : riskEvents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No risk events recorded for current filters.
                      </td>
                    </tr>
                  ) : (
                    riskEvents.map((evt) => {
                      const sevVariant =
                        evt.severity === 'CRITICAL'
                          ? 'danger'
                          : evt.severity === 'HIGH'
                          ? 'warning'
                          : evt.severity === 'MEDIUM'
                          ? 'outline'
                          : 'default';

                      return (
                        <tr
                          key={evt.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {new Date(evt.createdAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={sevVariant} className="text-[10px] uppercase font-bold">
                              {evt.severity}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white">
                            {evt.type}
                          </td>
                          <td className="py-3 px-4">
                            {evt.referral?.referrer ? (
                              <div>
                                <span className="font-bold text-slate-900 dark:text-white">
                                  @{evt.referral.referrer.username}
                                </span>
                                <div className="text-[10px] text-slate-400">
                                  Referee: @{evt.referral.referredUser?.username ?? 'N/A'}
                                </div>
                              </div>
                            ) : evt.user ? (
                              <span className="font-bold text-slate-900 dark:text-white">
                                @{evt.user.username}
                              </span>
                            ) : (
                              <span className="text-slate-400">N/A</span>
                            )}
                          </td>
                          <td className="py-3 px-4 max-w-xs truncate text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                            {evt.metadata ? (
                              <span>
                                {evt.metadata.ipHash ? `IP: ${String(evt.metadata.ipHash).slice(0, 8)}... ` : ''}
                                {evt.metadata.deviceHash ? `Dev: ${String(evt.metadata.deviceHash).slice(0, 8)}... ` : ''}
                                {evt.metadata.velocityMinutes ? `Velocity: ${evt.metadata.velocityMinutes}m ` : ''}
                                {evt.metadata.unrecoveredAmount ? `Unrecovered: ${evt.metadata.unrecoveredAmount} ` : ''}
                                {!evt.metadata.ipHash && !evt.metadata.deviceHash && !evt.metadata.velocityMinutes && !evt.metadata.unrecoveredAmount ? JSON.stringify(evt.metadata) : ''}
                              </span>
                            ) : (
                              'None'
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={
                                evt.status === 'REVIEWED'
                                  ? 'success'
                                  : evt.status === 'DISMISSED'
                                  ? 'default'
                                  : 'warning'
                              }
                              className="text-[10px] uppercase font-bold"
                            >
                              {evt.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedRiskEvent(evt);
                                setReviewStatusChoice(
                                  evt.status === 'UNREVIEWED' ? 'REVIEWED' : (evt.status as any)
                                );
                                setReviewNoteInput(evt.adminNote ?? '');
                                setBlockReasonInput('');
                              }}
                              className="text-xs px-3 py-1"
                            >
                              Review
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalRiskEvents > 20 && (
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500">
                  Page {riskPage} of {Math.ceil(totalRiskEvents / 20)}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={riskPage <= 1}
                    onClick={() => setRiskPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={riskPage >= Math.ceil(totalRiskEvents / 20)}
                    onClick={() => setRiskPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* ANALYTICS & MONITORING TAB */}
      {/* ================================================================ */}
      {activeTab === 'MONITORING' && (
        <div className="space-y-8">
          {/* Automated Reconciliation Card */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  Affiliate Ledger Reconciliation & Automated Operations
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Cross-checks qualifying Gaming Hub MAIN deposits against AffiliateCommission records. Dry-run mode produces zero database mutations.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onClick={() => void handleTriggerReconcile(true)}
                disabled={isReconciling}
                className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl"
              >
                <RefreshCw className={`w-4 h-4 ${isReconciling ? 'animate-spin' : ''}`} />
                {isReconciling ? 'Checking...' : 'Run Dry-Run Reconciliation'}
              </Button>

              {canEdit && (
                <Button
                  variant="outline"
                  onClick={() => void handleTriggerReconcile(false)}
                  disabled={isReconciling}
                  className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl text-rose-600 border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                >
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                  Run Live Repair (MFA Required)
                </Button>
              )}

              {canEdit && (
                <Button
                  variant="outline"
                  onClick={() => void handleReleaseHeld()}
                  disabled={isReleasingHeld}
                  className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl text-indigo-600 border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
                >
                  <Clock className="w-4 h-4 text-indigo-500" />
                  {isReleasingHeld ? 'Releasing...' : 'Release Matured Held Commissions'}
                </Button>
              )}
            </div>

            {reconcileResult && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Latest Reconciliation Result ({reconcileResult.dryRun ? 'Dry-Run' : 'Live Repair'})
                  </span>
                  <Badge variant={reconcileResult.missingCount === 0 && reconcileResult.duplicatesCount === 0 ? 'success' : 'warning'}>
                    {reconcileResult.missingCount === 0 && reconcileResult.duplicatesCount === 0 ? 'Consistent' : 'Discrepancy Found'}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium">
                  <div>
                    <span className="text-slate-400">Total Checked:</span>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {reconcileResult.checkedCount ?? 0}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Missing Commissions:</span>
                    <p className="text-sm font-bold text-amber-500">
                      {reconcileResult.missingCount ?? 0}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Duplicates Detected:</span>
                    <p className="text-sm font-bold text-rose-500">
                      {reconcileResult.duplicatesCount ?? 0}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Records Repaired:</span>
                    <p className="text-sm font-bold text-emerald-500">
                      {reconcileResult.repairedCount ?? 0}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Daily Affiliate Report Card */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-500" />
                  Daily Affiliate Performance Report
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Aggregated snapshot of eligible deposits, bonus distributions, reversal liabilities, and held commissions.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dailyReportDate}
                  onChange={(e) => {
                    setDailyReportDate(e.target.value);
                    void loadDailyReport(e.target.value);
                  }}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadDailyReport()}
                  className="text-xs"
                >
                  Fetch
                </Button>
              </div>
            </div>

            {dailyReportData && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">
                    Eligible Deposits
                  </span>
                  <p className="mt-1 text-base font-black text-slate-900 dark:text-white">
                    {dailyReportData.eligibleDepositsCount ?? 0}
                  </p>
                  <span className="text-[10px] text-slate-400">
                    {(dailyReportData.totalEligibleDepositVolume ?? 0).toLocaleString()} MAIN
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">
                    Commissions Paid
                  </span>
                  <p className="mt-1 text-base font-black text-emerald-500">
                    {(dailyReportData.totalCommissionPaidBonus ?? 0).toLocaleString()}
                  </p>
                  <span className="text-[10px] text-slate-400">
                    {dailyReportData.commissionsGeneratedCount ?? 0} payouts
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">
                    Effective Rate
                  </span>
                  <p className="mt-1 text-base font-black text-indigo-500">
                    {(dailyReportData.effectiveCommissionRatePercent ?? 0).toFixed(2)}%
                  </p>
                  <span className="text-[10px] text-slate-400">Weighted avg rate</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">
                    Active Referrers
                  </span>
                  <p className="mt-1 text-base font-black text-slate-900 dark:text-white">
                    {dailyReportData.activeReferrersCount ?? 0}
                  </p>
                  <span className="text-[10px] text-slate-400">Earned commission</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">
                    Reversals
                  </span>
                  <p className="mt-1 text-base font-black text-rose-500">
                    {dailyReportData.reversalsCount ?? 0}
                  </p>
                  <span className="text-[10px] text-slate-400">
                    {(dailyReportData.totalReversedAmountBonus ?? 0).toLocaleString()} BONUS
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">
                    Held Pending
                  </span>
                  <p className="mt-1 text-base font-black text-amber-500">
                    {dailyReportData.heldPendingCount ?? 0}
                  </p>
                  <span className="text-[10px] text-slate-400">
                    {(dailyReportData.totalHeldPendingBonus ?? 0).toLocaleString()} BONUS
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Conversion Funnel & Leaderboard */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Conversion Funnel */}
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-teal-500" />
                Referral Conversion Funnel
              </h3>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">
                    Total Registrations
                  </span>
                  <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                    {(analyticsData?.funnel?.totalUsers ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">
                    Referred Accounts
                  </span>
                  <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                    {(analyticsData?.funnel?.totalReferrals ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">
                    Depositing Referees
                  </span>
                  <p className="mt-1 text-xl font-black text-emerald-500">
                    {(analyticsData?.funnel?.activeDepositingReferees ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">
                    Deposit Conversion Rate
                  </span>
                  <p className="mt-1 text-xl font-black text-indigo-500">
                    {(analyticsData?.funnel?.conversionRatePercent ?? 0).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Top Referrers Leaderboard */}
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                Top Affiliate Referrers
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-400 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="pb-2">User</th>
                      <th className="pb-2">Referees</th>
                      <th className="pb-2">Commission Earned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(analyticsData?.topReferrers ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-4 text-center text-slate-400">
                          No referrers active yet.
                        </td>
                      </tr>
                    ) : (
                      analyticsData.topReferrers.map((ref: any, idx: number) => (
                        <tr key={ref.userId || idx} className="py-2">
                          <td className="py-2.5 font-bold text-slate-900 dark:text-white">
                            #{idx + 1} @{ref.username}
                          </td>
                          <td className="py-2.5 text-slate-500">
                            {ref.referredUsersCount ?? 0}
                          </td>
                          <td className="py-2.5 font-bold text-amber-500">
                            {(ref.totalEarnedBonus ?? 0).toLocaleString()} BONUS
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Risk Event Modal */}
      <Modal
        isOpen={!!selectedRiskEvent}
        onClose={() => setSelectedRiskEvent(null)}
        size="lg"
        title={
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <span className="font-bold text-slate-900 dark:text-white">
              Review Risk Signal
            </span>
          </div>
        }
      >
        {selectedRiskEvent && (
          <div className="space-y-6 text-sm">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-indigo-500">
                  {selectedRiskEvent.type}
                </span>
                <Badge
                  variant={
                    selectedRiskEvent.severity === 'CRITICAL'
                      ? 'danger'
                      : selectedRiskEvent.severity === 'HIGH'
                      ? 'warning'
                      : 'default'
                  }
                  className="text-[10px] uppercase font-bold"
                >
                  {selectedRiskEvent.severity}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div>
                  <span className="text-slate-400">Referrer:</span>{' '}
                  <span className="font-bold text-slate-900 dark:text-white">
                    {selectedRiskEvent.referral?.referrer
                      ? `@${selectedRiskEvent.referral.referrer.username}`
                      : selectedRiskEvent.user
                      ? `@${selectedRiskEvent.user.username}`
                      : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Referee:</span>{' '}
                  <span className="font-bold text-slate-900 dark:text-white">
                    {selectedRiskEvent.referral?.referredUser
                      ? `@${selectedRiskEvent.referral.referredUser.username}`
                      : 'N/A'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">Timestamp:</span>{' '}
                  <span className="text-slate-600 dark:text-slate-300">
                    {new Date(selectedRiskEvent.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Metadata Preview */}
            {selectedRiskEvent.metadata && (
              <div className="p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-xs overflow-x-auto">
                <pre>{JSON.stringify(selectedRiskEvent.metadata, null, 2)}</pre>
              </div>
            )}

            {/* Review Status & Note Form */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Resolution Status
              </label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="riskStatus"
                    value="REVIEWED"
                    checked={reviewStatusChoice === 'REVIEWED'}
                    onChange={() => setReviewStatusChoice('REVIEWED')}
                    className="text-indigo-600"
                  />
                  <span>Mark as Reviewed</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="radio"
                    name="riskStatus"
                    value="DISMISSED"
                    checked={reviewStatusChoice === 'DISMISSED'}
                    onChange={() => setReviewStatusChoice('DISMISSED')}
                    className="text-indigo-600"
                  />
                  <span>Dismiss as False Positive</span>
                </label>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Admin Resolution Note
                </label>
                <textarea
                  rows={2}
                  value={reviewNoteInput}
                  onChange={(e) => setReviewNoteInput(e.target.value)}
                  placeholder="Optional review rationale or action details..."
                  className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Block / Unblock Referral Section */}
            {selectedRiskEvent.referralId && (
              <div className="p-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <Ban className="w-4 h-4" />
                  Referral Affiliate Earnings Control
                </h4>

                {selectedRiskEvent.referral?.affiliateBlockedAt ? (
                  <div className="space-y-2">
                    <p className="text-xs text-rose-600 font-medium">
                      Earnings on this referral link are currently blocked (Reason: {selectedRiskEvent.referral.affiliateBlockedReason || 'Unspecified'}).
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleUnblockReferral(selectedRiskEvent.referralId)}
                      disabled={isSubmittingReview}
                      className="text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-50"
                    >
                      Unblock Affiliate Earnings
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Blocking prevents future affiliate commission from being paid to the referrer for deposits by this referee. Referee deposits remain unaffected.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Reason for blocking (required)..."
                        value={blockReasonInput}
                        onChange={(e) => setBlockReasonInput(e.target.value)}
                        className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleBlockReferral(selectedRiskEvent.referralId, blockReasonInput)}
                        disabled={isSubmittingReview || !blockReasonInput.trim()}
                        className="text-xs text-rose-600 border-rose-500/30 hover:bg-rose-50"
                      >
                        Block Referral
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedRiskEvent(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() =>
                  void handleReviewRiskEvent(
                    selectedRiskEvent.id,
                    reviewStatusChoice,
                    reviewNoteInput
                  )
                }
                disabled={isSubmittingReview}
              >
                {isSubmittingReview ? 'Submitting...' : 'Save Resolution'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Commission Details Slide-over Drawer */}
      <Drawer
        isOpen={!!selectedCommission}
        onClose={() => setSelectedCommission(null)}
        title={
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-indigo-500" />
            <span className="font-black text-slate-900 dark:text-white">
              Commission Details
            </span>
          </div>
        }
      >
        {selectedCommission && (
          <div className="space-y-6 text-sm">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Commission ID
              </span>
              <div className="flex items-center justify-between gap-2">
                <code className="font-mono text-xs font-bold text-slate-900 dark:text-white break-all">
                  {selectedCommission.id}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(selectedCommission.id)}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-slate-400 font-semibold uppercase">
                  Referrer
                </span>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                  @{selectedCommission.referrerUsername}
                </p>
                <span className="text-[11px] text-slate-500 font-mono">
                  {selectedCommission.referrerId}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 font-semibold uppercase">
                  Referred Player
                </span>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5">
                  @{selectedCommission.referredUsername}
                </p>
                <span className="text-[11px] text-slate-500 font-mono">
                  {selectedCommission.referredUserId}
                </span>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-500">Source Type:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {selectedCommission.sourceType}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Source Transaction ID:</span>
                <span className="font-mono font-medium text-slate-900 dark:text-white">
                  {selectedCommission.sourceId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Referral ID:</span>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                  {selectedCommission.referralId ?? 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Deposit Amount:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {selectedCommission.depositAmount.toLocaleString()} MAIN
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Commission Rate:</span>
                <span className="font-bold text-indigo-500">
                  {selectedCommission.commissionPercent}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Commission Amount:</span>
                <span className="font-black text-emerald-500">
                  +{selectedCommission.commissionAmount.toLocaleString()} BONUS
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Affiliate Mode:</span>
                <Badge
                  variant={
                    selectedCommission.affiliateMode === 'ONE_TIME'
                      ? 'warning'
                      : 'default'
                  }
                >
                  {selectedCommission.affiliateMode}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <Badge
                  variant={
                    selectedCommission.status === 'COMPLETED'
                      ? 'success'
                      : 'danger'
                  }
                >
                  {selectedCommission.status}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Timestamp:</span>
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  {new Date(selectedCommission.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            {selectedCommission.status === 'REVERSED' && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 space-y-1">
                <p className="font-bold text-xs">Reversal Information</p>
                <p className="text-xs">
                  Reason: {selectedCommission.reversalReason ?? 'N/A'}
                </p>
                {selectedCommission.reversedAt && (
                  <p className="text-[11px] text-rose-400">
                    Reversed at:{' '}
                    {new Date(selectedCommission.reversedAt).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Safety Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() =>
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
        }
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.action}
        confirmText="Confirm Changes"
        variant="warning"
      />
    </div>
  );
}
export default AdminAffiliatesPage;
