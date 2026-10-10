import { AuthenticatorQr } from "../../components/settings/AuthenticatorQr";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams, useParams } from "react-router-dom";
import {
  User,
  Mail,
  Calendar,
  Phone,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Smartphone,
  Monitor,
  CheckCircle2,
  Lock,
  LogOut,
  Ban,
  Bell,
  Wallet,
  Trophy,
  Gift,
  LifeBuoy,
  MessageCircle,
  Users,
  Swords,
  Megaphone,
  X,
  ArrowRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuthStore } from "../../store/authStore";
import { useMe } from "../../services/api/useMe";
import { getAuthErrorMessage } from "../../lib/authErrors";
import { apiClient } from "../../services/api/client";
import { messagesApi, sessionsApi, securityApi } from "../../services/api/enterprise";
import { COUNTRIES, type BlockedUser, type LoginSession } from "@gaming-hub/shared";
import { Skeleton, SkeletonCircle, SkeletonText } from "../../components/Skeleton";
import { MatchHistoryView } from "../../components/MatchHistory/MatchHistoryView";
import { MyTournamentsView } from "../../components/tournaments/MyTournamentsView";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";

type ProfileTab = "profile" | "tournaments" | "security" | "activity" | "history" | "stats";

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const [searchParams] = useSearchParams();
  const tabFromUrl = (tabParam || searchParams.get("tab")) as ProfileTab | null;
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const { me, loading, reload } = useMe();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [activeTab, setActiveTab] = useState<ProfileTab>(() => {
    if (tabFromUrl && ["profile", "tournaments", "security", "activity", "history", "stats"].includes(tabFromUrl)) {
      return tabFromUrl;
    }
    return "profile";
  });

  const handleTabChange = (tab: ProfileTab) => {
    setActiveTab(tab);
    if (tab === "profile") {
      navigate("/profile");
    } else {
      navigate(`/profile/${tab}`);
    }
  };

  useEffect(() => {
    if (tabFromUrl && ["profile", "tournaments", "security", "activity", "history", "stats"].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const [kycStatus, setKycStatus] = useState<string>("NOT_STARTED");

  useEffect(() => {
    apiClient.get<{ status: string }>("/kyc/status")
      .then((res) => setKycStatus(res.status || "NOT_STARTED"))
      .catch(() => setKycStatus("NOT_STARTED"));
  }, []);

  // Profile Form States
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postcode, setPostcode] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Security Form States
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [modalMode, setModalMode] = useState<"setup" | "disable">("setup");
  const [twoFactorSecret, setTwoFactorSecret] = useState<string | null>(null);
  const [twoFactorAuthUrl, setTwoFactorAuthUrl] = useState<string | null>(null);
  const [totpToken, setTotpToken] = useState("");
  const [submitting2FA, setSubmitting2FA] = useState(false);
  const [settingUp2FA, setSettingUp2FA] = useState(false);

  // Active Sessions State
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Blocked Users State
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (me) {
      const displayName = me.user.displayName?.trim() || "";
      if (displayName) {
        const parts = displayName.split(/\s+/);
        setFirstName(parts[0] || "");
        setLastName(parts.slice(1).join(" ") || "");
      } else {
        setFirstName(me.user.username || "");
        setLastName("");
      }
      setPhone(me.profile?.phone || "");
      if (me.profile?.dateOfBirth) {
        const dateStr = typeof me.profile.dateOfBirth === "string"
          ? me.profile.dateOfBirth.slice(0, 10)
          : new Date(me.profile.dateOfBirth).toISOString().slice(0, 10);
        setDob(dateStr);
      } else {
        setDob("");
      }
      setStreet(me.profile?.streetAddress || "");
      setCity(me.profile?.city || "");
      setState(me.profile?.state || "");
      setPostcode(me.profile?.postcode || "");
      setTwoFactorEnabled(Boolean(me.profile?.twoFactorEnabled));
    }
  }, [me]);

  const loadSessions = async () => {
    if (useAuthStore.getState().isLoading || !useAuthStore.getState().session) return;
    setSessionsLoading(true);
    try {
      const list = await sessionsApi.list();
      setSessions(list || []);
    } catch (err) {
      setSessions([]);
      toast.error(getAuthErrorMessage(err));
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadBlocked = async () => {
    try {
      setBlocked(await messagesApi.blocked());
    } catch {
      setBlocked([]);
    }
  };

  const handleRevokeSession = async (id: string) => {
    setRevokingId(id);
    try {
      await sessionsApi.revoke(id);
      toast.success("Session revoked successfully");
      await loadSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke session");
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    setRevokingId("all");
    try {
      await sessionsApi.revokeAll();
      toast.success("All other active sessions revoked");
      await loadSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke sessions");
    } finally {
      setRevokingId(null);
    }
  };

  useEffect(() => {
    void loadSessions();
    void loadBlocked();
  }, [session, activeTab]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const fullName = `${firstName} ${lastName}`.trim();
      await apiClient.patch("/users/me", {
        displayName: fullName || undefined,
        phone: phone.trim() || undefined,
        dateOfBirth: dob ? new Date(dob).toISOString() : undefined,
        streetAddress: street.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        postcode: postcode.trim() || undefined,
      });
      toast.success("Profile details saved successfully!");
      setEditing(false);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error("Please fill in current and new password");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setUpdatingPassword(true);
    try {
      await securityApi.changePassword(currentPassword, newPassword);
      toast.success("Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setUpdatingPassword(false);
    }
  };



  const handleUnblock = async (blockedId: string) => {
    setBusyId(blockedId);
    try {
      await messagesApi.unblock(blockedId);
      await loadBlocked();
      toast.success("User unblocked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unblock user");
    } finally {
      setBusyId(null);
    }
  };

  const handleToggle2FA = async () => {
    if (twoFactorEnabled) {
      setTotpToken("");
      setModalMode("disable");
      setShow2FAModal(true);
    } else {
      setSettingUp2FA(true);
      try {
        const res = await securityApi.setup2FA();
        setTwoFactorSecret(res.secret);
        setTwoFactorAuthUrl(res.authUrl);
        setTotpToken("");
        setModalMode("setup");
        setShow2FAModal(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to initiate 2FA setup");
      } finally {
        setSettingUp2FA(false);
      }
    }
  };

  const handleReset2FA = async () => {
    setSettingUp2FA(true);
    try {
      const res = await securityApi.setup2FA({ reset: true });
      setTwoFactorSecret(res.secret);
      setTwoFactorAuthUrl(res.authUrl);
      setTotpToken("");
      setModalMode("setup");
      setShow2FAModal(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset 2FA");
    } finally {
      setSettingUp2FA(false);
    }
  };

  const handleVerifyAndActivate2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpToken.length !== 6) {
      toast.error("Please enter a 6-digit verification code");
      return;
    }
    setSubmitting2FA(true);
    try {
      await securityApi.verify2FA(totpToken);
      setTwoFactorEnabled(true);
      useAuthStore.getState().setIsMfaRequired(false);
      toast.success("Two-Factor Authentication activated successfully!");
      setShow2FAModal(false);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid verification code");
    } finally {
      setSubmitting2FA(false);
    }
  };

  const handleConfirmDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpToken.length !== 6) {
      toast.error("Please enter a 6-digit verification code");
      return;
    }
    setSubmitting2FA(true);
    try {
      await securityApi.disable2FA(totpToken);
      setTwoFactorEnabled(false);
      useAuthStore.getState().setIsMfaRequired(false);
      toast.success("Two-Factor Authentication disabled.");
      setShow2FAModal(false);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disable 2FA");
    } finally {
      setSubmitting2FA(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-4">
          <SkeletonCircle className="w-24 h-24 mx-auto" />
          <SkeletonText className="w-40 mx-auto h-6" />
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Unable to load profile</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Please retry or sign in again.</p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reload()}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-bold hover:bg-slate-200 transition-colors"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const emailDisplay = me.user.email || "";
  const countryCode = me.profile?.country || "";
  const matchedCountry = COUNTRIES.find((c) => c.code === countryCode);
  const countryNameDisplay = matchedCountry ? `${matchedCountry.name} (${matchedCountry.code})` : countryCode || "Not provided at registration";

  return (
    <div className="max-w-5xl w-full min-w-0 mx-auto space-y-6 sm:space-y-8 px-0 sm:px-4 py-2 sm:py-6">
      {/* Top Header & Tab Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 min-w-0 w-full">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            {activeTab === "security"
              ? "Security Settings"
              : activeTab === "history"
              ? "Match History"
              : activeTab === "stats"
              ? "Player Statistics"
              : "My Profile"}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {activeTab === "security"
              ? "Manage password, two-factor authentication and active sessions."
              : activeTab === "history"
              ? "View past matches, results, and summary statistics."
              : activeTab === "stats"
              ? "Detailed game-specific statistics, win rates, and duration analytics."
              : "Manage your personal information"}
          </p>
        </div>

        {/* Tab Navigation with sleek horizontal scroll on mobile */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl w-full md:w-auto max-w-full overflow-x-auto no-scrollbar shrink-0">
          <button
            onClick={() => handleTabChange("profile")}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "profile"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Personal Details
          </button>
          <button
            onClick={() => handleTabChange("tournaments")}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "tournaments"
                ? "bg-amber-500 text-slate-950 shadow-sm font-black"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            🏆 My Tournaments
          </button>
          <button
            onClick={() => handleTabChange("history")}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "history"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Match History
          </button>
          <button
            onClick={() => handleTabChange("stats")}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "stats"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Statistics
          </button>
          <button
            onClick={() => handleTabChange("security")}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "security"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Security Settings
          </button>
          <button
            onClick={() => handleTabChange("activity")}
            className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "activity"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Shortcuts
          </button>
        </div>
      </div>

      {/* ======================================================================== */}
      {/* TAB: MY TOURNAMENTS */}
      {/* ======================================================================== */}
      {activeTab === "tournaments" && (
        <div className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">My Tournament Hub</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Track your active tournament matches, seeds, round progress, and results.
              </p>
            </div>
            <button
              onClick={() => navigate('/tournaments')}
              className="text-xs font-bold text-amber-500 hover:text-amber-400"
            >
              Browse All Tournaments →
            </button>
          </div>
          <MyTournamentsView />
        </div>
      )}

      {/* ======================================================================== */}
      {/* TAB: MATCH HISTORY & REPLAYS (Requirement 3 & 23) */}
      {/* ======================================================================== */}
      {(activeTab === "history" || activeTab === "stats") && (
        <MatchHistoryView userId={me?.user?.id} />
      )}

      {/* ======================================================================== */}
      {/* TAB 1: PERSONAL DETAILS (Matches Screenshot 1) */}
      {/* ======================================================================== */}
      {activeTab === "profile" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Personal Details Form */}
          <div className="lg:col-span-2 rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-6 sm:p-8 space-y-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Personal Details</h2>
              <button
                onClick={() => {
                  if (editing) handleSaveProfile();
                  else setEditing(true);
                }}
                disabled={savingProfile}
                className="px-5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shadow-sm"
              >
                {savingProfile ? "Saving..." : editing ? "Save Changes" : "Edit Profile"}
              </button>
            </div>

            {/* Name Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">First Name</label>
                <div className="relative flex items-center">
                  <User className="absolute left-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={firstName}
                    disabled={!editing}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Enter first name"
                    className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-80"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  disabled={!editing}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Enter last name"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-80"
                />
              </div>
            </div>

            {/* Email & Date of Birth */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Email</label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={emailDisplay}
                    disabled
                    className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 font-bold text-sm outline-none cursor-not-allowed"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Email cannot be changed</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Date of Birth</label>
                <div className="relative flex items-center">
                  <Calendar className="absolute left-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type={editing ? "date" : "text"}
                    value={dob}
                    disabled={!editing}
                    onChange={(e) => setDob(e.target.value)}
                    placeholder="YYYY-MM-DD"
                    max={new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                    className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-80"
                  />
                </div>
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Phone</label>
              <div className="relative flex items-center">
                <Phone className="absolute left-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  disabled={!editing}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={matchedCountry ? `e.g. ${matchedCountry.callingCode} 9876543210` : "e.g. +91 9876543210"}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-80"
                />
              </div>
            </div>

            {/* Address Section Header */}
            <div className="pt-2 space-y-4">
              <div className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                <MapPin className="w-4 h-4 text-rose-500" /> Address
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Street Address</label>
                <input
                  type="text"
                  value={street}
                  disabled={!editing}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="House / Flat / Street address"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-80"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">City/Suburb</label>
                  <input
                    type="text"
                    value={city}
                    disabled={!editing}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City / Town"
                    className="w-full px-3 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-80"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">State</label>
                  <input
                    type="text"
                    value={state}
                    disabled={!editing}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="State / Province"
                    className="w-full px-3 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-80"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Postcode</label>
                  <input
                    type="text"
                    value={postcode}
                    disabled={!editing}
                    onChange={(e) => setPostcode(e.target.value)}
                    placeholder="PIN / Postal Code"
                    className="w-full px-3 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-80"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">Country</label>
                <input
                  type="text"
                  value={countryNameDisplay}
                  readOnly
                  aria-readonly="true"
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 font-bold text-sm outline-none cursor-not-allowed"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Country is permanent and cannot be changed after registration.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column Cards: Account Status & Quick Links */}
          <div className="space-y-6">
            {/* Account Status Card */}
            <div className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-6 space-y-4 shadow-sm">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Account Status</h3>
              <div className="flex flex-col gap-2.5">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 self-start">
                  <CheckCircle2 className="w-3.5 h-3.5" /> EMAIL VERIFIED
                </div>
                <Link
                  to="/kyc"
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all hover:scale-105 hover:shadow-md cursor-pointer self-start ${
                    kycStatus === 'APPROVED'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                      : kycStatus === 'PENDING' || kycStatus === 'IN_REVIEW'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                        : kycStatus === 'REJECTED'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                          : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    KYC: {kycStatus === 'NOT_STARTED' ? 'VERIFY NOW' : kycStatus.replace('_', ' ')}
                  </span>
                  <ArrowRight className="w-3 h-3 ml-0.5" />
                </Link>
              </div>
            </div>

            {/* Quick Links Card */}
            <div className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-6 space-y-4 shadow-sm">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Quick Links</h3>
              <div className="space-y-2">
                <button
                  onClick={() => handleTabChange("security")}
                  className="w-full text-left px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold text-slate-800 dark:text-white transition-colors flex items-center justify-between"
                >
                  Security & Password
                  <span className="text-slate-400">→</span>
                </button>

                <Link
                  to="/notifications"
                  className="w-full text-left px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold text-slate-800 dark:text-white transition-colors flex items-center justify-between block"
                >
                  Notification Settings
                  <span className="text-slate-400">→</span>
                </Link>

                <Link
                  to="/wallet"
                  className="w-full text-left px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold text-slate-800 dark:text-white transition-colors flex items-center justify-between block"
                >
                  Wallet & Transactions
                  <span className="text-slate-400">→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================== */}
      {/* TAB 2: SECURITY SETTINGS (Matches Screenshot 2) */}
      {/* ======================================================================== */}
      {activeTab === "security" && (
        <div className="space-y-6">
          {/* Top Row: Change Password & Two-Factor Auth */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {/* Change Password Card */}
            <div className="rounded-2xl sm:rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6 shadow-sm">
              <div className="flex items-center gap-2.5 text-base sm:text-lg font-black text-slate-900 dark:text-white">
                <KeyRound className="w-5 h-5 text-indigo-500" />
                Change Password
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  onClick={handleUpdatePassword}
                  disabled={updatingPassword}
                  className="w-full py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-[#1b367d] hover:bg-[#152a62] text-white font-black text-xs sm:text-sm uppercase tracking-wide transition-all shadow-md hover:scale-[1.01] duration-200 disabled:opacity-50 cursor-pointer"
                >
                  {updatingPassword ? "Updating..." : "Update Password"}
                </button>
              </div>
            </div>

            {/* Two-Factor Auth Card */}
            <div className="rounded-2xl sm:rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6 shadow-sm flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-2.5 text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  <Lock className="w-5 h-5 text-indigo-500" />
                  Two-Factor Auth
                </div>

                {twoFactorEnabled ? (
                  <div className="rounded-xl sm:rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 sm:p-5 flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 leading-relaxed">
                        Two-Factor Authentication is active and protecting your account.
                      </p>
                      <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1">
                        Wallet withdrawals and sensitive actions require your authenticator code.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl sm:rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 sm:p-5 flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-300 leading-relaxed">
                      Protect your account and wallet by enabling Two-Factor Authentication.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                {twoFactorEnabled ? (
                  <>
                    <button
                      onClick={handleToggle2FA}
                      disabled={settingUp2FA}
                      className="px-5 py-3 rounded-xl sm:rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 font-black text-xs sm:text-sm uppercase tracking-wide transition-all shadow-sm hover:scale-[1.02] duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <ShieldAlert className="w-4 h-4" />
                      Disable 2FA
                    </button>
                    <button
                      onClick={handleReset2FA}
                      disabled={settingUp2FA}
                      className="px-5 py-3 rounded-xl sm:rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-xs sm:text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Smartphone className="w-4 h-4 text-indigo-500" />
                      {settingUp2FA ? "Generating..." : "Reconfigure / New QR"}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleToggle2FA}
                    disabled={settingUp2FA}
                    className="w-full sm:w-auto px-6 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black text-xs sm:text-sm uppercase tracking-wide transition-all shadow-md hover:scale-[1.02] duration-200 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4" />
                    {settingUp2FA ? "Setting up..." : "Enable 2FA"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Full-Width Card: Active Sessions */}
          <div className="rounded-2xl sm:rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden shadow-sm">
            <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Monitor className="w-5 h-5 text-blue-500" />
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">Active Sessions</h3>
              </div>
              {sessions.filter((s) => !s.isCurrent).length > 0 && (
                <button
                  onClick={() => void handleRevokeAllOtherSessions()}
                  disabled={revokingId === "all"}
                  className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold text-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {revokingId === "all" ? "Revoking..." : "Revoke Others"}
                </button>
              )}
            </div>

            {sessionsLoading ? (
              <div className="p-4 sm:p-6 space-y-3">
                <Skeleton className="h-12 w-full rounded-xl sm:rounded-2xl" />
                <Skeleton className="h-12 w-full rounded-xl sm:rounded-2xl" />
              </div>
            ) : (
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full min-w-[520px] text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-400 bg-slate-50/50 dark:bg-slate-800/30">
                      <th className="px-4 sm:px-6 py-3 sm:py-3.5">DEVICE / BROWSER</th>
                      <th className="px-4 sm:px-6 py-3 sm:py-3.5">IP ADDRESS</th>
                      <th className="px-4 sm:px-6 py-3 sm:py-3.5">LAST ACTIVE</th>
                      <th className="px-4 sm:px-6 py-3 sm:py-3.5 text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {sessions.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 sm:px-6 py-3.5 sm:py-4 font-bold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            {s.deviceName || "Windows PC"}
                            {s.isCurrent && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-normal text-slate-400">{s.browserName || s.userAgent || "Google Chrome"}</div>
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">
                          {s.ip || "127.0.0.1"}
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-slate-400">
                          {new Date(s.createdAt || Date.now()).toLocaleString(undefined, {
                            year: "numeric",
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {s.isCurrent ? (
                            <span className="text-xs font-semibold text-slate-400">Current session</span>
                          ) : (
                            <button
                              onClick={() => void handleRevokeSession(s.id)}
                              disabled={revokingId === s.id}
                              className="text-xs font-bold text-rose-500 hover:text-rose-600 hover:underline transition-colors disabled:opacity-50"
                            >
                              {revokingId === s.id ? "Revoking..." : "Revoke"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sessions.length === 0 && (
                  <div className="px-6 py-8 text-center">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No active sessions found.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================================== */}
      {/* TAB 3: STATS & STUFF */}
      {/* ======================================================================== */}
      {activeTab === "activity" && (
        <div className="space-y-6">
          {/* Menu Stuff Grid */}
          <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <h3 className="text-base font-black text-slate-900 dark:text-white">My Stuff</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MenuLink to="/tournaments" icon={<Swords className="w-4 h-4" />} label="Tournaments" />
              <MenuLink to="/messages" icon={<MessageCircle className="w-4 h-4" />} label="Messages" />
              <MenuLink to="/friends" icon={<Users className="w-4 h-4" />} label="Friends" />
              <MenuLink to="/achievements" icon={<Trophy className="w-4 h-4" />} label="Achievements" />
              <MenuLink to="/notifications" icon={<Bell className="w-4 h-4" />} label="Notifications" />
              <MenuLink to="/announcements" icon={<Megaphone className="w-4 h-4" />} label="Announcements" />
              <MenuLink to="/referrals" icon={<Gift className="w-4 h-4" />} label="Referrals" />
              <MenuLink to="/tickets" icon={<LifeBuoy className="w-4 h-4" />} label="Support" />
            </div>
          </div>

          {/* Blocked Users Section */}
          <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Blocked Users <span className="text-slate-400 font-normal text-xs">({blocked.length})</span>
            </h3>
            {blocked.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                You haven't blocked any users yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {blocked.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 py-3">
                    <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center text-sm font-black text-rose-500 overflow-hidden shrink-0">
                      {b.avatarUrl ? (
                        <img src={b.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        (b.displayName || b.username || "?").slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{b.displayName}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">@{b.username}</p>
                    </div>
                    <button
                      onClick={() => void handleUnblock(b.blockedId)}
                      disabled={busyId === b.blockedId}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 text-xs font-bold text-rose-500 transition-colors hover:border-rose-500/50 disabled:opacity-50"
                    >
                      <Ban size={12} /> {busyId === b.blockedId ? "Unblocking..." : "Unblock"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="text-center pt-4">
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-rose-600/10 hover:bg-rose-600 text-rose-500 hover:text-white font-black text-xs uppercase tracking-wider transition-colors border border-rose-500/30 cursor-pointer"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>
      )}
      {/* Interactive 2FA Setup / Disable Modal */}
      {show2FAModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <button
              onClick={() => setShow2FAModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            {modalMode === "setup" ? (
              <form onSubmit={handleVerifyAndActivate2FA} className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white">Enable 2FA</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Scan QR code or enter secret key</p>
                  </div>
                </div>

                {twoFactorAuthUrl && (
                  <div className="flex flex-col items-center gap-3 p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                    <AuthenticatorQr
                      authUrl={twoFactorAuthUrl}
                      className="w-44 h-44 rounded-xl border border-white bg-white p-2 shadow-sm"
                    />
                    <div className="w-full text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Secret Key</p>
                      <code className="text-xs font-mono font-bold text-indigo-500 bg-indigo-500/10 px-3 py-1.5 rounded-lg select-all inline-block break-all">
                        {twoFactorSecret}
                      </code>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    6-Digit Authenticator Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={totpToken}
                    onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-2xl px-4 py-3 text-center tracking-[0.5em] font-mono text-lg text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting2FA || totpToken.length !== 6}
                  className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
                >
                  {submitting2FA ? "Activating..." : "Verify & Enable 2FA"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleConfirmDisable2FA} className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-500">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white">Disable 2FA</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Confirm with your 6-digit code</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Enter 6-digit Authenticator Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={totpToken}
                    onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-2xl px-4 py-3 text-center tracking-[0.5em] font-mono text-lg text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting2FA || totpToken.length !== 6}
                  className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-extrabold text-sm transition-all shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2"
                >
                  {submitting2FA ? "Disabling..." : "Confirm & Disable 2FA"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

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
        onConfirm={handleSignOut}
      />
    </div>
  );
};

function MenuLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-sm font-bold text-slate-800 dark:text-white transition-colors hover:border-blue-500/50"
    >
      <span className="text-blue-500">{icon}</span>
      {label}
    </Link>
  );
}

