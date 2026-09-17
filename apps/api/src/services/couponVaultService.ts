import { AppError } from "@gaming-hub/shared";
import { env } from "../env";

export interface CouponVaultVerifyResponse {
  success: boolean;
  couponId: string;
  amount: number;
  currency: string;
  status: string;
}

export interface CouponVaultRedeemParams {
  couponId: string;
  userId: string;
  walletTransactionId: string;
  ipAddress?: string;
  device?: string;
}

export interface CouponVaultTransferParams {
  userId: string;
  userEmail: string;
  amount: number;
  transactionId: string;
}

export interface CouponVaultTransferResponse {
  success: boolean;
  message?: string;
  data?: unknown;
  isDuplicate?: boolean;
}

export class CouponVaultService {
  private static getApiConfig() {
    let apiUrl = (env.COUPON_API_URL || process.env.COUPON_API_URL || "http://127.0.0.1:4000/api/v1").trim();
    const apiKey = (env.COUPON_API_KEY || process.env.COUPON_API_KEY || "").trim();
    if (!apiKey) {
      throw new AppError(
        "COUPON_SERVICE_UNAVAILABLE",
        "CouponVault integration is not configured. Please configure COUPON_API_KEY.",
        503,
      );
    }
    // Clean trailing slashes
    apiUrl = apiUrl.replace(/\/+$/, "");
    // Ensure /api/v1 path is present if caller only provided base domain/origin
    if (!apiUrl.endsWith("/api/v1") && !apiUrl.includes("/api/")) {
      apiUrl = `${apiUrl}/api/v1`;
    }
    return { apiUrl, apiKey };
  }

  /**
   * Step 1: Verify coupon exists and is valid on CouponVault.
   * Read-only operation; does not lock or mutate balances.
   */
  static async verifyCoupon(
    couponCode: string,
    userId: string,
  ): Promise<CouponVaultVerifyResponse> {
    const { apiUrl, apiKey } = this.getApiConfig();
    const codeUpper = couponCode.trim().toUpperCase();

    const verifyUrl = `${apiUrl}/coupons/verify`;
    let response: Response | undefined;
    let lastError: unknown;

    // Retry once on network error or timeout to accommodate Render cold starts (free tier wake-up)
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        response = await fetch(verifyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            couponCode: codeUpper,
            userId,
            gameId: "gaming-hub",
          }),
          // First attempt: 15s. Second attempt (cold-start recovery): 25s.
          signal: AbortSignal.timeout(attempt === 1 ? 15000 : 25000),
        });
        break;
      } catch (err: unknown) {
        lastError = err;
        console.warn(`[CouponVaultService.verifyCoupon] Attempt ${attempt} failed:`, err);
        if (attempt === 1) {
          // Wait 2 seconds before retry to give cold-start container time to initialize
          await new Promise((res) => setTimeout(res, 2000));
        }
      }
    }

    if (!response) {
      console.error("[CouponVaultService.verifyCoupon] Network error after retries:", lastError);
      throw new AppError(
        "COUPON_SERVICE_UNAVAILABLE",
        "Coupon verification service is temporarily unavailable. Please try again later.",
        503,
      );
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      console.error("[CouponVaultService.verifyCoupon] Failed to parse JSON response:", response.status);
      throw new AppError(
        "COUPON_SERVICE_INVALID_RESPONSE",
        "Coupon service returned an invalid response.",
        502,
      );
    }

    if (!response.ok || !data?.success) {
      let code: "COUPON_INVALID" | "COUPON_ALREADY_USED" | "COUPON_DISABLED" | "COUPON_EXPIRED" = "COUPON_INVALID";
      if (data?.code === "REDEEMED" || data?.code === "COUPON_ALREADY_USED") {
        code = "COUPON_ALREADY_USED";
      } else if (data?.code === "DISABLED" || data?.code === "COUPON_DISABLED") {
        code = "COUPON_DISABLED";
      } else if (data?.code === "EXPIRED" || data?.code === "COUPON_EXPIRED") {
        code = "COUPON_EXPIRED";
      }
      const message = data?.message || "Failed to verify coupon";
      const statusCode = response.status === 404 ? 404 : 400;
      throw new AppError(code, message, statusCode);
    }

    return {
      success: true,
      couponId: data.couponId,
      amount: Number(data.amount),
      currency: data.currency || "INR",
      status: data.status || "ACTIVE",
    };
  }

  /**
   * Step 2: Atomically redeem on CouponVault FIRST.
   * CouponVault uses SELECT ... FOR UPDATE internally to guarantee only
   * one concurrent redemption succeeds.
   */
  static async redeemCoupon(params: CouponVaultRedeemParams): Promise<{ success: boolean }> {
    const { apiUrl, apiKey } = this.getApiConfig();
    const redeemUrl = `${apiUrl}/coupons/redeem`;

    let response: Response;
    try {
      response = await fetch(redeemUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          couponId: params.couponId,
          userId: params.userId,
          gameId: "gaming-hub",
          walletTransactionId: params.walletTransactionId,
          ipAddress: params.ipAddress || "0.0.0.0",
          device: params.device || "unknown",
        }),
        signal: AbortSignal.timeout(25000),
      });
    } catch (err: unknown) {
      console.error("[CouponVaultService.redeemCoupon] Network error:", err);
      throw new AppError(
        "COUPON_SERVICE_UNAVAILABLE",
        "Coupon redemption service is temporarily unavailable. Please try again later.",
        503,
      );
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      console.error("[CouponVaultService.redeemCoupon] Failed to parse JSON response:", response.status);
      throw new AppError(
        "COUPON_SERVICE_INVALID_RESPONSE",
        "Coupon service returned an invalid response during redemption.",
        502,
      );
    }

    if (!response.ok || !data?.success) {
      const code: "COUPON_ALREADY_USED" | "COUPON_INVALID" =
        response.status === 409 || data?.code === "REDEEMED" || data?.code === "COUPON_ALREADY_USED"
          ? "COUPON_ALREADY_USED"
          : "COUPON_INVALID";
      const message = data?.message || "Coupon could not be redeemed. It may have already been used.";
      const statusCode = response.status === 409 ? 409 : 400;
      throw new AppError(code, message, statusCode);
    }

    return { success: true };
  }

  /**
   * Step 3: Transfer funds to CouponVault wallet upon user explicit withdrawal.
   * Uses transactionId for external idempotency.
   */
  static async transferToCouponWallet(
    params: CouponVaultTransferParams,
  ): Promise<CouponVaultTransferResponse> {
    const { apiUrl, apiKey } = this.getApiConfig();
    const transferUrl = `${apiUrl}/wallet/transfer`;

    const normalizedEmail = params.userEmail.toLowerCase().trim();

    let response: Response;
    try {
      response = await fetch(transferUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          userId: params.userId,
          userEmail: normalizedEmail,
          amount: params.amount,
          transactionId: params.transactionId,
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (err: unknown) {
      console.error("[CouponVaultService.transferToCouponWallet] Network / timeout error:", err);
      // Timeout/Network failure means external state is unconfirmed
      const error = new AppError(
        "COUPON_TRANSFER_TIMEOUT",
        "Transfer request timed out or network error. Please check your transaction history before retrying.",
        504,
      );
      (error as any).isTimeout = true;
      throw error;
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      console.error("[CouponVaultService.transferToCouponWallet] Failed to parse JSON response:", response.status);
      const error = new AppError(
        "COUPON_SERVICE_INVALID_RESPONSE",
        "Coupon API returned an invalid response.",
        502,
      );
      (error as any).isUncertain = true;
      throw error;
    }

    // 409 Conflict represents duplicate transaction - verify it actually matches this transactionId
    if (response.status === 409 || data?.code === "DUPLICATE_TRANSACTION") {
      const returnedTxId = data?.data?.transactionId || data?.transactionId;
      if (returnedTxId === params.transactionId) {
        return {
          success: true,
          isDuplicate: true,
          message: "Transaction already processed on CouponVault.",
          data: data?.data,
        };
      }

      // If the response didn't explicitly match transactionId, verify with checkTransferStatus
      try {
        const statusCheck = await this.checkTransferStatus(params.transactionId);
        if (statusCheck.processed && statusCheck.status === "SUCCESS") {
          return {
            success: true,
            isDuplicate: true,
            message: "Transaction verified as already processed on CouponVault.",
            data: data?.data,
          };
        }
      } catch (err) {
        console.warn("[CouponVaultService.transferToCouponWallet] 409 status check failed:", err);
      }

      const error = new AppError(
        "COUPON_TRANSFER_CONFLICT",
        data?.message || "Transfer resulted in an unconfirmed conflict on CouponVault.",
        409,
      );
      (error as any).isUncertain = true;
      throw error;
    }

    if (!response.ok || !data?.success) {
      const code: "DUPLICATE_TRANSACTION" | "TRANSFER_FAILED" =
        data?.code === "DUPLICATE_TRANSACTION" ? "DUPLICATE_TRANSACTION" : "TRANSFER_FAILED";
      const message = data?.message || "Failed to transfer to Coupon Wallet";
      throw new AppError(code, message, 400);
    }

    return {
      success: true,
      message: data.message || "Transfer successful",
      data: data.data,
    };
  }

  /**
   * Step 4 (Reconciliation): Check if a transfer with transactionId has been processed in CouponVault.
   * Returns:
   * - { processed: true, status: 'SUCCESS', amount?: number } if found and completed
   * - { processed: false, status: 'NOT_FOUND' } if not found in CouponVault
   */
  static async checkTransferStatus(transactionId: string): Promise<{
    success: boolean;
    processed: boolean;
    status: string;
    amount?: number;
  }> {
    const { apiUrl, apiKey } = this.getApiConfig();
    const checkUrl = `${apiUrl}/wallet/transfer/${encodeURIComponent(transactionId)}`;

    let response: Response;
    try {
      response = await fetch(checkUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        signal: AbortSignal.timeout(25000),
      });
    } catch (err: unknown) {
      console.error("[CouponVaultService.checkTransferStatus] Network error:", err);
      throw new AppError(
        "COUPON_SERVICE_UNAVAILABLE",
        "Unable to reach CouponVault to check transfer status.",
        503,
      );
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new AppError(
        "COUPON_SERVICE_INVALID_RESPONSE",
        "Coupon service returned an invalid response during status check.",
        502,
      );
    }

    if (!response.ok) {
      if (response.status === 404) {
        return { success: true, processed: false, status: "NOT_FOUND" };
      }
      throw new AppError(
        "COUPON_SERVICE_UNAVAILABLE",
        data?.message || "Failed to check transfer status on CouponVault",
        response.status,
      );
    }

    return {
      success: true,
      processed: Boolean(data?.processed),
      status: data?.status || (data?.processed ? "SUCCESS" : "NOT_FOUND"),
      amount: data?.amount ? Number(data.amount) : undefined,
    };
  }
}

