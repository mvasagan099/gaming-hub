import React, { useState, useEffect } from "react";
import {
  ArrowUpRight,
  Coins,
  ShieldAlert,
  ShieldCheck,
  Info,
  Clock,
  CheckCheck,
  Copy,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { WalletActionModal } from "./WalletActionModal";
import { WalletProcessingAnimation } from "./WalletProcessingAnimation";
import { WalletSuccessAnimation } from "./WalletSuccessAnimation";
import { OtpVerificationModal } from "./OtpVerificationModal";
import { walletApi } from "../../services/api/enterprise";
import { twoFactorApi } from "../../services/api/twoFactor";
import { useWalletStore } from "../../store/walletStore";
import { notifyWalletChanged } from "../../services/api/practiceReward";
import { cn } from "../../lib/utils";

function maskEmail(email?: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local.slice(0, 1)}***@${domain}`;
  }
  return `${local.slice(0, 1)}***${local.slice(-1)}@${domain}`;
}

export interface WithdrawalFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  currency?: string;
  withdrawalFeePercent?: number;
  twoFactorEnabled?: boolean;
  userEmail?: string | null;
  onSuccessDone?: () => void;
  onViewTransactions?: () => void;
  onSetup2FA?: () => void;
}

type WithdrawStep =
  | "input"
  | "confirm"
  | "otp"
  | "processing"
  | "success"
  | "pending"
  | "refunded"
  | "error";

interface TransactionResult {
  transactionId?: string;
  amount: number;
  fee: number;
  netAmount: number;
  newBalance?: number;
  status?: string;
  message?: string;
}

export const WithdrawalFlowModal: React.FC<WithdrawalFlowModalProps> = ({
  isOpen,
  onClose,
  currentBalance,
  currency = "Coins",
  withdrawalFeePercent = 0,
  twoFactorEnabled = false,
  userEmail = null,
  onSuccessDone,
  onViewTransactions,
  onSetup2FA,
}) => {
  const [step, setStep] = useState<WithdrawStep>("input");
  const [amountInput, setAmountInput] = useState<string>("");
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpErrorMessage, setOtpErrorMessage] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<TransactionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("Failed to complete withdrawal.");
  const [copied, setCopied] = useState(false);

  // Determine verification method: 2FA -> TOTP; No 2FA -> EMAIL_OTP
  const verificationMethod: "TOTP" | "EMAIL_OTP" = twoFactorEnabled ? "TOTP" : "EMAIL_OTP";
  const maskedEmail = maskEmail(userEmail);

  // Numeric amount calculation
  const parsedAmount = parseFloat(amountInput) || 0;
  const calculatedFee =
    withdrawalFeePercent > 0 ? Math.round((parsedAmount * withdrawalFeePercent) / 100) : 0;
  const youReceive = Math.max(0, parsedAmount - calculatedFee);
  const remainingBalance = Math.max(0, currentBalance - parsedAmount);

  // Reset state on open/close
  useEffect(() => {
    if (!isOpen) {
      handleReset();
    }
  }, [isOpen]);

  const handleReset = () => {
    setStep("input");
    setAmountInput("");
    setIsRequestingOtp(false);
    setIsSubmitting(false);
    setOtpErrorMessage(null);
    setTxResult(null);
    setErrorMessage("Failed to complete withdrawal.");
  };

  const handleModalClose = () => {
    if (step === "processing") return; // Prevent dismiss during active transfer
    handleReset();
    onClose();
  };

  // Step 1: Input Validation -> Confirm
  const handleProceedToConfirm = () => {
    if (parsedAmount < 50) {
      toast.error("Minimum withdrawal is 50 Coins");
      return;
    }
    if (parsedAmount > currentBalance) {
      toast.error("Withdrawal amount exceeds your available MAIN balance");
      return;
    }
    setStep("confirm");
  };

  // Step 2: Confirm -> Proceed to Verification (TOTP or Email OTP)
  const handleConfirmAndProceed = async () => {
    setOtpErrorMessage(null);

    if (twoFactorEnabled) {
      // 2FA enabled: Do NOT send email OTP. Proceed directly to Authenticator input.
      setStep("otp");
      return;
    }

    // 2FA disabled: Request email OTP first
    setIsRequestingOtp(true);
    try {
      const res = await walletApi.requestOtp();
      if (res.debugCode) {
        toast.success(`Verification OTP sent! (Dev code: ${res.debugCode})`);
      } else {
        toast.success(
          `Verification code sent to ${maskedEmail || "your registered email"}!`
        );
      }
      setStep("otp");
    } catch (err: unknown) {
      let msg = "Failed to dispatch verification code";
      if (err instanceof Error) {
        msg = err.message;
      }
      const reason = (err as any)?.details?.reason;
      if (reason && !msg.includes(reason)) {
        msg = `${msg}: ${reason}`;
      }
      toast.error(msg);
      setErrorMessage(msg);
      setStep("error");
    } finally {
      setIsRequestingOtp(false);
    }
  };

  // Resend OTP from within OTP Step (Email only)
  const handleResendOtp = async () => {
    if (twoFactorEnabled) return false;
    try {
      const res = await walletApi.requestOtp();
      if (res.debugCode) {
        toast.success(`New code sent! (Dev: ${res.debugCode})`);
      } else {
        toast.success(
          `New verification code sent to ${maskedEmail || "your email"}!`
        );
      }
      setOtpErrorMessage(null);
      return true;
    } catch (err: unknown) {
      let msg = "Failed to resend code";
      if (err instanceof Error) {
        msg = err.message;
      }
      const reason = (err as any)?.details?.reason;
      if (reason && !msg.includes(reason)) {
        msg = `${msg}: ${reason}`;
      }
      toast.error(msg);
      setOtpErrorMessage(msg);
      return false;
    }
  };

  // Step 3: Verify (TOTP or Email OTP) & Submit Withdrawal
  const handleVerifyAndWithdraw = async (otpCode: string) => {
    if (isSubmitting) return; // Prevent double submit
    setIsSubmitting(true);
    setOtpErrorMessage(null);

    try {
      if (verificationMethod === "TOTP") {
        // Server-side authoritative verification of TOTP code, stamping session
        try {
          await twoFactorApi.verifySession(otpCode.trim());
        } catch (totpErr: any) {
          const errMsg =
            totpErr?.message ||
            "Invalid authenticator code. Please check your app and try again.";
          setOtpErrorMessage(errMsg);
          setIsSubmitting(false);
          return;
        }
      }

      setStep("processing");

      // For EMAIL_OTP, pass otpCode. For TOTP, session is freshly stamped server-side.
      const res = await walletApi.withdraw(
        parsedAmount,
        verificationMethod === "EMAIL_OTP" ? otpCode.trim() : undefined
      );

      // Refresh store balances
      await useWalletStore.getState().fetchWallet();
      notifyWalletChanged();
      const updatedBalance = useWalletStore.getState().balance;

      const resultPayload: TransactionResult = {
        transactionId: res.transactionId || (res as any).id,
        amount: parsedAmount,
        fee: calculatedFee,
        netAmount: youReceive,
        newBalance: res.newBalance !== undefined ? res.newBalance : updatedBalance,
        status: (res as any).status || "COMPLETED",
        message: "Your funds have been transferred to CouponVault.",
      };
      setTxResult(resultPayload);

      // Check authoritative status
      const statusUpper = (resultPayload.status || "").toUpperCase();
      if (statusUpper === "PENDING" || statusUpper === "UNCONFIRMED_HOLD") {
        setStep("pending");
      } else {
        setStep("success");
      }
    } catch (err: any) {
      console.error("[WithdrawalFlowModal] Withdrawal error:", err);

      // Distinguish UNCONFIRMED_HOLD / timeout from fatal errors
      const errCode = err?.code || "";
      const isTimeout =
        err?.isTimeout ||
        err?.isUncertain ||
        errCode === "COUPON_TRANSFER_TIMEOUT" ||
        err?.statusCode === 504;

      if (isTimeout) {
        // Must show PENDING popup, NOT failure
        await useWalletStore.getState().fetchWallet();
        notifyWalletChanged();
        setTxResult({
          transactionId: err?.transactionId || "PENDING_CONFIRMATION",
          amount: parsedAmount,
          fee: calculatedFee,
          netAmount: youReceive,
          newBalance: useWalletStore.getState().balance,
          status: "UNCONFIRMED_HOLD",
        });
        setStep("pending");
        return;
      }

      // Check if refund happened or if it was rejected with refund
      if (errCode === "TRANSFER_FAILED" || errCode === "COUPON_TRANSFER_CONFLICT") {
        await useWalletStore.getState().fetchWallet();
        notifyWalletChanged();
        setTxResult({
          transactionId: err?.transactionId,
          amount: parsedAmount,
          fee: calculatedFee,
          netAmount: youReceive,
          newBalance: useWalletStore.getState().balance,
        });
        setStep("refunded");
        return;
      }

      // Check if it's invalid OTP or MFA required (allows user to re-try OTP)
      if (
        errCode === "OTP_INVALID" ||
        errCode === "OTP_ALREADY_USED" ||
        errCode === "OTP_EXPIRED" ||
        errCode === "MFA_REQUIRED"
      ) {
        setOtpErrorMessage(err.message || "Invalid or expired verification code.");
        setStep("otp");
        return;
      }

      // Other failure
      setErrorMessage(err.message || "Withdrawal could not be completed.");
      setStep("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyTransactionId = (txId?: string) => {
    if (!txId) return;
    navigator.clipboard.writeText(txId);
    setCopied(true);
    toast.success("Transaction reference copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDoneAction = () => {
    handleReset();
    onClose();
    if (onSuccessDone) onSuccessDone();
  };

  const handleViewTxsAction = () => {
    handleReset();
    onClose();
    if (onViewTransactions) onViewTransactions();
  };

  return (
    <>
      {/* 1. INPUT STEP MODAL */}
      {step === "input" && (
        <WalletActionModal
          isOpen={isOpen}
          onClose={handleModalClose}
          title="Withdraw to CouponVault"
          description="Transfer coins from your MAIN wallet to your CouponVault account."
          icon={<ArrowUpRight className="w-6 h-6 text-emerald-400" />}
          maxWidth="lg"
        >
          <div className="space-y-6 pt-2">
            {/* Authenticator App Notice Banner */}
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldAlert size={18} />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs sm:text-sm font-bold text-amber-300">Email Verification Required</h4>
                  {onSetup2FA && (
                    <button
                      onClick={() => {
                        handleModalClose();
                        onSetup2FA();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold transition-all"
                    >
                      Setup 2FA
                    </button>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-amber-200/80 leading-relaxed">
                  For your security, withdrawals require a 6-digit OTP code sent to your registered email address.
                </p>
              </div>
            </div>

            {/* Available Balance Overview */}
            <div className="rounded-2xl bg-blue-500/10 border border-blue-500/20 p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Info className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-xs text-blue-200 font-medium">Available to Transfer:</span>
              </div>
              <span className="text-sm sm:text-base font-black text-white">
                {currentBalance.toFixed(2)} {currency}
              </span>
            </div>

            {/* Amount Input */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Amount to Transfer (Min 50 {currency})
              </label>
              <div className="relative flex items-center">
                <Coins className="absolute left-4 text-amber-400 w-5 h-5 pointer-events-none" />
                <input
                  type="number"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0.00"
                  min="50"
                  max={currentBalance}
                  autoFocus
                  className="w-full pl-11 pr-24 py-4 rounded-2xl border border-slate-700/80 bg-slate-800/80 text-white font-black text-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setAmountInput(String(Math.floor(currentBalance)))}
                  className="absolute right-3 px-3 py-1.5 rounded-xl bg-slate-700/80 hover:bg-slate-600 text-slate-200 font-bold text-xs transition-colors"
                >
                  Max
                </button>
              </div>
            </div>

            {/* Quick Amount Pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {[100, 250, 500, 1000].map((quickAmt) => (
                <button
                  key={quickAmt}
                  type="button"
                  onClick={() => setAmountInput(String(quickAmt))}
                  disabled={quickAmt > currentBalance}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 hover:text-white border border-slate-700 transition-all disabled:opacity-40"
                >
                  +{quickAmt}
                </button>
              ))}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleProceedToConfirm}
                disabled={parsedAmount < 50 || parsedAmount > currentBalance}
                className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-base uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/30 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </WalletActionModal>
      )}

      {/* 2. CONFIRMATION STEP MODAL */}
      {step === "confirm" && (
        <WalletActionModal
          isOpen={isOpen}
          onClose={handleModalClose}
          title="Confirm Withdrawal"
          description="Please review the withdrawal details before confirming."
          icon={<ArrowUpRight className="w-6 h-6 text-emerald-400" />}
          maxWidth="md"
        >
          <div className="space-y-5 pt-2">
            {/* Financial Summary Card */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-800/90 to-slate-900 border border-slate-700/80 shadow-inner space-y-3.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Withdrawal Amount:</span>
                <span className="font-black text-white text-base">
                  {parsedAmount.toLocaleString()} {currency}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Processing Fee:</span>
                <span className="font-semibold text-slate-300">
                  {calculatedFee > 0 ? `${calculatedFee.toLocaleString()} ${currency}` : "Free"}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between">
                <span className="text-emerald-400 font-bold">You Receive:</span>
                <span className="text-xl sm:text-2xl font-black text-emerald-400">
                  {youReceive.toLocaleString()} {currency}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-xs">
                <span className="text-slate-400">Destination:</span>
                <span className="font-bold text-slate-200">CouponVault Wallet</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">MAIN Wallet Balance:</span>
                <span className="text-slate-300">{currentBalance.toLocaleString()} {currency}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Remaining Balance:</span>
                <span className="text-slate-300 font-bold">{remainingBalance.toLocaleString()} {currency}</span>
              </div>
            </div>

            {/* Security Verification Status Banner */}
            {twoFactorEnabled ? (
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck size={18} />
                </div>
                <div className="flex-1 space-y-1">
                  <h4 className="text-sm font-bold text-emerald-400">
                    Verify with Authenticator
                  </h4>
                  <p className="text-xs text-emerald-300/80 leading-relaxed">
                    Enter the 6-digit code from your authenticator app to authorize this withdrawal.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldAlert size={18} />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-amber-400">
                      Verify with Email
                    </h4>
                    {onSetup2FA && (
                      <button
                        type="button"
                        onClick={onSetup2FA}
                        className="px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold transition-all"
                      >
                        Setup 2FA App
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-amber-300/80 leading-relaxed">
                    We will send a 6-digit verification code to {maskedEmail || "your registered email address"}.
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-400 text-center leading-relaxed">
              {twoFactorEnabled
                ? "You will enter your authenticator app code on the next step to authorize this transfer."
                : `A verification code will be sent to ${maskedEmail || "your email"} to authorize this transfer.`}
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep("input")}
                disabled={isRequestingOtp}
                className="w-full sm:w-1/3 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-sm transition-colors border border-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmAndProceed}
                disabled={isRequestingOtp}
                className="w-full sm:w-2/3 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-base uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/30 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {isRequestingOtp ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Sending Code...</span>
                  </>
                ) : (
                  <span>{twoFactorEnabled ? "Continue to Authenticator" : "Confirm & Send Code"}</span>
                )}
              </button>
            </div>
          </div>
        </WalletActionModal>
      )}

      {/* 3. OTP VERIFICATION STEP MODAL */}
      {step === "otp" && (
        <OtpVerificationModal
          isOpen={isOpen}
          onClose={handleModalClose}
          onBack={() => setStep("confirm")}
          onVerify={handleVerifyAndWithdraw}
          onResendOtp={twoFactorEnabled ? undefined : handleResendOtp}
          amount={parsedAmount}
          currency={currency}
          destinationText="CouponVault Wallet"
          isSubmitting={isSubmitting}
          errorMessage={otpErrorMessage}
          verificationMethod={verificationMethod}
          maskedEmail={maskedEmail}
        />
      )}

      {/* 4. PROCESSING STEP MODAL */}
      {step === "processing" && (
        <WalletActionModal
          isOpen={isOpen}
          onClose={() => {}}
          hideClose
          isProcessing
          maxWidth="md"
        >
          <WalletProcessingAnimation flow="withdraw" />
        </WalletActionModal>
      )}

      {/* 5. SUCCESS STEP MODAL */}
      {step === "success" && (
        <WalletActionModal
          isOpen={isOpen}
          onClose={handleDoneAction}
          maxWidth="md"
        >
          <WalletSuccessAnimation
            title="Withdrawal Successful"
            subtitle="Funds transferred to your CouponVault account"
            amount={txResult?.netAmount || youReceive}
            currency={currency}
            prefix=""
            newBalance={txResult?.newBalance}
            transactionId={txResult?.transactionId}
            onDone={handleDoneAction}
            onViewTransactions={onViewTransactions ? handleViewTxsAction : undefined}
            viewTransactionsLabel="View Transaction"
          />
        </WalletActionModal>
      )}

      {/* 6. PENDING / UNCONFIRMED_HOLD STEP MODAL */}
      {step === "pending" && (
        <WalletActionModal
          isOpen={isOpen}
          onClose={handleDoneAction}
          title="Withdrawal Processing"
          icon={<Clock className="w-6 h-6 text-amber-400" />}
          maxWidth="md"
        >
          <div className="space-y-6 pt-2 text-center">
            {/* Animated Clock / Shield Visual */}
            <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>

            <div className="space-y-2">
              <p className="text-sm text-slate-200 font-semibold leading-relaxed">
                Your withdrawal was submitted successfully, but we're still confirming the transfer status with CouponVault.
              </p>
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 font-medium">
                ⚠️ Do not submit another withdrawal for the same transaction.
              </div>
            </div>

            {/* Summary details */}
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-xs space-y-2 text-left">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Amount:</span>
                <span className="font-bold text-white">{parsedAmount.toLocaleString()} {currency}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Status:</span>
                <span className="font-bold text-amber-400 uppercase tracking-wider">Processing</span>
              </div>
              {txResult?.transactionId && (
                <div className="flex justify-between items-center pt-2 border-t border-slate-700/60">
                  <span className="text-slate-400">Ref ID:</span>
                  <button
                    type="button"
                    onClick={() => handleCopyTransactionId(txResult.transactionId)}
                    className="inline-flex items-center gap-1 font-mono text-slate-300 hover:text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700"
                  >
                    <span className="truncate max-w-[140px]">{txResult.transactionId}</span>
                    {copied ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleDoneAction}
                className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm uppercase tracking-wide transition-all shadow-md hover:scale-[1.01]"
              >
                Done
              </button>

              {onViewTransactions && (
                <button
                  type="button"
                  onClick={handleViewTxsAction}
                  className="w-full py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-sm transition-colors border border-slate-700"
                >
                  View Transaction
                </button>
              )}
            </div>
          </div>
        </WalletActionModal>
      )}

      {/* 7. REFUNDED STEP MODAL */}
      {step === "refunded" && (
        <WalletActionModal
          isOpen={isOpen}
          onClose={handleDoneAction}
          title="Withdrawal Refunded"
          icon={<RotateCcw className="w-6 h-6 text-blue-400" />}
          maxWidth="md"
        >
          <div className="space-y-6 pt-2 text-center sm:text-left">
            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs sm:text-sm text-blue-200 leading-relaxed">
              The transfer could not be completed. Your funds have been safely returned to your MAIN wallet balance.
            </div>

            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Refund Amount:</span>
                <span className="font-bold text-white text-sm">+{parsedAmount.toLocaleString()} {currency}</span>
              </div>
              {txResult?.newBalance !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Current Balance:</span>
                  <span className="font-bold text-emerald-400">{txResult.newBalance.toLocaleString()} {currency}</span>
                </div>
              )}
              {txResult?.transactionId && (
                <div className="flex justify-between items-center pt-2 border-t border-slate-700/60">
                  <span className="text-slate-400">Ref ID:</span>
                  <span className="font-mono text-slate-300">{txResult.transactionId}</span>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleDoneAction}
                className="w-full py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm uppercase tracking-wider transition-all border border-slate-700"
              >
                Done
              </button>
            </div>
          </div>
        </WalletActionModal>
      )}

      {/* 8. ERROR STEP MODAL */}
      {step === "error" && (
        <WalletActionModal
          isOpen={isOpen}
          onClose={handleModalClose}
          title="Withdrawal Failed"
          icon={<AlertTriangle className="w-6 h-6 text-rose-400" />}
          maxWidth="md"
        >
          <div className="space-y-6 pt-2 text-center sm:text-left">
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs sm:text-sm text-rose-300/90 leading-relaxed">
              {errorMessage}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep("input")}
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm uppercase tracking-wide transition-all shadow-md hover:scale-[1.01]"
              >
                Try Again
              </button>

              <button
                type="button"
                onClick={handleModalClose}
                className="w-full py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-sm transition-colors border border-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </WalletActionModal>
      )}
    </>
  );
};
