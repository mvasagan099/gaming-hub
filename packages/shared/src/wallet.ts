export type TransactionType = "CREDIT" | "DEBIT" | "ADJUST";

export type TransactionReferenceType =
  | "MATCH_WAGER"
  | "MATCH_PAYOUT"
  | "ADMIN"
  | "BONUS"
  | "PRACTICE"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "REFERRAL"
  | "COUPON"
  | "TOURNAMENT_ENTRY"
  | "TOURNAMENT_PRIZE"
  | "LOCKED_CREDIT"
  | "REWARD_CREDIT"
  | "CASHBACK_CREDIT"
  | "WAGER_REFUND"
  | "REVERSAL";

export type WalletBalanceType = "MAIN" | "BONUS" | "LOCKED" | "REWARD" | "CASHBACK";

export interface Wallet {
  userId: string;
  balance: number;
  bonusBalance: number;
  lockedBalance: number;
  rewardBalance: number;
  cashbackBalance: number;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  walletType: WalletBalanceType;
  referenceType: TransactionReferenceType;
  referenceId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
  page: number;
  pageSize: number;
}

export interface WalletAdjustmentInput {
  userId: string;
  amount: number;
  walletType?: WalletBalanceType;
  referenceType?: TransactionReferenceType;
  referenceId?: string;
  reason?: string;
}
