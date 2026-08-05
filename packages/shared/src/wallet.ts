export type TransactionType = "CREDIT" | "DEBIT" | "ADJUST";

export type TransactionReferenceType = "MATCH_WAGER" | "MATCH_PAYOUT" | "ADMIN" | "BONUS";

export interface Wallet {
  userId: string;
  balance: number;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
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
