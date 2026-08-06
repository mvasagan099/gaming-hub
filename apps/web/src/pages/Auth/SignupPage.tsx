import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  User,
  Mail,
  Lock,
  UserPlus,
  Loader2,
  MailCheck,
  Phone,
  CalendarDays,
  MapPin,
  Banknote,
  Gift,
  ShieldCheck,
  AtSign,
} from "lucide-react";
import { COUNTRIES, CURRENCIES, countryToCurrency } from "@gaming-hub/shared";
import { supabase } from "../../services/supabase";
import { AuthLayout } from "./AuthLayout";
import { useSettingsStore } from "../../store/settingsStore";

const GENDERS = ["Female", "Male", "Other", "Prefer not to say"];

const inputClass =
  "w-full bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white rounded-xl px-4 py-3 border border-slate-300 dark:border-slate-800 focus:outline-none focus:border-indigo-500 transition-colors";
const selectClass = inputClass + " appearance-none";

interface SignupForm {
  fullName: string;
  username: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  country: string;
  currency: string;
  currencyTouched: boolean;
  referredBy: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
}

const initialForm: SignupForm = {
  fullName: "",
  username: "",
  email: "",
  phone: "",
  dob: "",
  gender: "",
  country: "",
  currency: "",
  currencyTouched: false,
  referredBy: "",
  password: "",
  confirmPassword: "",
  acceptedTerms: false,
};

export function SignupPage() {
  const navigate = useNavigate();
  const settings = useSettingsStore((s) => s.settings);
  const [form, setForm] = useState<SignupForm>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const signupEnabled = settings?.auth?.signupEnabled ?? true;
  const maintenanceEnabled = settings?.general?.maintenanceEnabled ?? false;
  const maintenanceMessage = settings?.general?.maintenanceMessage ?? "";

  const set = <K extends keyof SignupForm>(key: K, value: SignupForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleCountryChange = (code: string) => {
    setForm((prev) => ({
      ...prev,
      country: code,
      currency: prev.currencyTouched ? prev.currency : countryToCurrency(code),
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.country;
      delete next.currency;
      return next;
    });
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = "Full name is required";
    if (!/^[a-z0-9_]{3,24}$/.test(form.username.trim().toLowerCase()))
      e.username = "3–24 chars: lowercase letters, numbers, underscores";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email address";
    if (form.phone.trim() && !/^\+?[0-9\s()-]{7,17}$/.test(form.phone.trim()))
      e.phone = "Enter a valid phone number";
    if (!form.dob) {
      e.dob = "Date of birth is required";
    } else {
      const d = new Date(form.dob);
      const eighteen = new Date();
      eighteen.setFullYear(eighteen.getFullYear() - 18);
      if (Number.isNaN(d.getTime())) e.dob = "Enter a valid date";
      else if (d > eighteen) e.dob = "You must be at least 18 years old";
    }
    if (!form.country) e.country = "Select your country";
    if (!form.currency) e.currency = "Select your currency";
    if (form.referredBy.trim() && !/^[A-Za-z0-9_-]{3,24}$/.test(form.referredBy.trim()))
      e.referredBy = "Invalid referral code";
    if (form.password.length < 8) e.password = "Password must be at least 8 characters";
    if (form.confirmPassword !== form.password) e.confirmPassword = "Passwords do not match";
    if (!form.acceptedTerms) e.acceptedTerms = "You must accept the Terms & Privacy Policy";
    return e;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      toast.error("Please fix the highlighted fields");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            username: form.username.trim().toLowerCase(),
            display_name: form.fullName.trim(),
            phone: form.phone.trim() || null,
            date_of_birth: form.dob,
            gender: form.gender || null,
            country: form.country,
            currency: form.currency,
            referred_by: form.referredBy.trim() || null,
          },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;

      if (data.session) {
        toast.success("Account created — welcome!");
        navigate("/", { replace: true });
        return;
      }
      setConfirmationSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setSubmitting(false);
    }
  };

  if (maintenanceEnabled || !signupEnabled) {
    return (
      <AuthLayout
        title={maintenanceEnabled ? "Under Maintenance" : "Registrations Closed"}
        subtitle={maintenanceEnabled ? "We're working hard to improve the experience" : "New accounts are currently not being accepted"}
      >
        <div className="text-center space-y-4 py-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-amber-400" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {maintenanceEnabled && maintenanceMessage
              ? maintenanceMessage
              : maintenanceEnabled
                ? "We are performing scheduled maintenance. Please check back soon."
                : "We're not accepting new registrations at this time."}
          </p>
          <Link
            to="/login"
            className="inline-block px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
          >
            Go to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (confirmationSent) {
    return (
      <AuthLayout
        title="Check your inbox"
        subtitle="Confirm your email address to activate your account"
      >
        <div className="text-center space-y-4 py-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <MailCheck className="w-7 h-7 text-emerald-400" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            We sent a confirmation link to <span className="font-bold">{form.email}</span>. Click it to
            finish creating your account, then sign in.
          </p>
          <Link
            to="/login"
            className="inline-block px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors"
          >
            Go to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join the arena — save stats, coins and play online"
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="text"
                autoComplete="name"
                placeholder="Full name"
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value)}
                className={inputClass + " pl-10"}
              />
            </div>
            {errors.fullName && <FieldError message={errors.fullName} />}
          </div>

          <div>
            <div className="relative">
              <AtSign className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="text"
                autoComplete="username"
                placeholder="Username"
                value={form.username}
                onChange={(e) => set("username", e.target.value)}
                className={inputClass + " pl-10"}
              />
            </div>
            {errors.username && <FieldError message={errors.username} />}
          </div>
        </div>

        <div>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
            <input
              type="email"
              autoComplete="email"
              placeholder="Email address"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className={inputClass + " pl-10"}
            />
          </div>
          {errors.email && <FieldError message={errors.email} />}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="tel"
                autoComplete="tel"
                placeholder="Phone (optional)"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={inputClass + " pl-10"}
              />
            </div>
            {errors.phone && <FieldError message={errors.phone} />}
          </div>

          <div>
            <div className="relative">
              <CalendarDays className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="date"
                autoComplete="bday"
                max={new Date().toISOString().split("T")[0]}
                value={form.dob}
                onChange={(e) => set("dob", e.target.value)}
                className={inputClass + " pl-10"}
              />
            </div>
            {errors.dob && <FieldError message={errors.dob} />}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <select
              value={form.gender}
              onChange={(e) => set("gender", e.target.value)}
              className={selectClass}
            >
              <option value="">Gender (optional)</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="relative">
              <Banknote className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5 pointer-events-none" />
              <select
                value={form.currency}
                onChange={(e) => {
                  set("currency", e.target.value);
                  set("currencyTouched", true);
                }}
                className={selectClass + " pl-10"}
              >
                <option value="">Currency</option>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.symbol}
                  </option>
                ))}
              </select>
            </div>
            {errors.currency && <FieldError message={errors.currency} />}
          </div>
        </div>

        <div>
          <div className="relative">
            <MapPin className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5 pointer-events-none" />
            <select
              value={form.country}
              onChange={(e) => handleCountryChange(e.target.value)}
              className={selectClass + " pl-10"}
            >
              <option value="">Country / Region</option>
              {[...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {errors.country && <FieldError message={errors.country} />}
        </div>

        <div>
          <div className="relative">
            <Gift className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
            <input
              type="text"
              autoComplete="off"
              placeholder="Referral code (optional)"
              value={form.referredBy}
              onChange={(e) => set("referredBy", e.target.value)}
              className={inputClass + " pl-10"}
            />
          </div>
          {errors.referredBy && <FieldError message={errors.referredBy} />}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Password (min 8)"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                className={inputClass + " pl-10"}
              />
            </div>
            {errors.password && <FieldError message={errors.password} />}
          </div>

          <div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password"
                value={form.confirmPassword}
                onChange={(e) => set("confirmPassword", e.target.value)}
                className={inputClass + " pl-10"}
              />
            </div>
            {errors.confirmPassword && <FieldError message={errors.confirmPassword} />}
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.acceptedTerms}
            onChange={(e) => set("acceptedTerms", e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded accent-indigo-600"
          />
          <span className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            I confirm I am at least 18 years old and agree to the{" "}
            <span className="text-indigo-500 font-semibold">Terms of Service</span> and{" "}
            <span className="text-indigo-500 font-semibold">Privacy Policy</span>.
          </span>
        </label>
        {errors.acceptedTerms && <FieldError message={errors.acceptedTerms} />}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          {submitting ? "Creating account…" : "CREATE ACCOUNT"}
        </button>

        <p className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5" />
          Your personal details are encrypted and never shared.
        </p>
      </form>

      <p className="pt-5 mt-5 border-t border-slate-200 dark:border-slate-800 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
        Already have an account?{" "}
        <Link to="/login" className="text-indigo-500 hover:text-indigo-400 transition-colors">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}

function FieldError({ message }: { message: string }) {
  return <p className="mt-1.5 text-[11px] font-semibold text-rose-500">{message}</p>;
}
