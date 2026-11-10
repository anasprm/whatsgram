/**
 * Relay Messenger — Telegram Stars (XTR) Digital Ledger
 * Client-side simulated digital invoice generation, escrow balances,
 * and transaction history stored in localStorage for premium features
 * (50-game arcade vault pass, sovereign sync unlock, ad-free access).
 */

export interface StarInvoice {
  invoiceId: string;
  title: string;
  amountXTR: number;
  description: string;
  status: "PENDING" | "PAID" | "EXPIRED";
  timestamp: number;
}

export interface StarTransaction {
  txId: string;
  type: "PURCHASE" | "EARN" | "REFUND";
  amountXTR: number;
  description: string;
  timestamp: number;
  balanceAfter: number;
}

const BALANCE_KEY = "relay_xtr_balance";
const INVOICES_KEY = "relay_xtr_invoices";
const TRANSACTIONS_KEY = "relay_xtr_transactions";
const DEFAULT_BALANCE = 500;

export const TelegramStarsLedger = {
  /**
   * Get current XTR balance.
   */
  getBalance: (): number => {
    if (typeof window === "undefined") return DEFAULT_BALANCE;
    try {
      const saved = localStorage.getItem(BALANCE_KEY);
      return saved ? parseInt(saved, 10) : DEFAULT_BALANCE;
    } catch {
      return DEFAULT_BALANCE;
    }
  },

  /**
   * Deduct stars if sufficient balance exists.
   */
  deductStars: (amount: number): boolean => {
    if (amount <= 0) return false;
    const current = TelegramStarsLedger.getBalance();
    if (current < amount) return false;
    const updated = current - amount;
    try {
      localStorage.setItem(BALANCE_KEY, updated.toString());
    } catch {
      return false;
    }
    TelegramStarsLedger.addTransaction("PURCHASE", -amount, "Stars deducted", updated);
    return true;
  },

  /**
   * Add stars to balance.
   */
  addStars: (amount: number): number => {
    if (amount <= 0) return TelegramStarsLedger.getBalance();
    const current = TelegramStarsLedger.getBalance();
    const updated = current + amount;
    try {
      localStorage.setItem(BALANCE_KEY, updated.toString());
    } catch {}
    TelegramStarsLedger.addTransaction("EARN", amount, "Stars added", updated);
    return updated;
  },

  /**
   * Generate a new pending invoice.
   */
  generateInvoice: (itemKey: string): StarInvoice => {
    const isArcadePass = itemKey === "arcade_pass";
    return {
      invoiceId: `XTR-${Math.random()
        .toString(36)
        .substring(2, 9)
        .toUpperCase()}`,
      title: isArcadePass ? "Lifetime Arcade Pass" : "Sovereign Sync Unlock",
      amountXTR: 100,
      description:
        "Unlock all 50 rule-verified mini-game engines and decentralized outbox sync.",
      status: "PENDING",
      timestamp: Date.now(),
    };
  },

  /**
   * Mark an invoice as paid and deduct stars.
   */
  payInvoice: (invoice: StarInvoice): boolean => {
    if (invoice.status !== "PENDING") return false;
    if (!TelegramStarsLedger.deductStars(invoice.amountXTR)) return false;
    try {
      const invoices = TelegramStarsLedger.getInvoices();
      const updated = invoices.map((inv) =>
        inv.invoiceId === invoice.invoiceId ? { ...inv, status: "PAID" } : inv
      );
      localStorage.setItem(INVOICES_KEY, JSON.stringify(updated));
    } catch {
      return false;
    }
    return true;
  },

  /**
   * Get all stored invoices.
   */
  getInvoices: (): StarInvoice[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(INVOICES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Save an invoice to storage.
   */
  saveInvoice: (invoice: StarInvoice): void => {
    try {
      const invoices = TelegramStarsLedger.getInvoices();
      const existing = invoices.find((i) => i.invoiceId === invoice.invoiceId);
      const updated = existing
        ? invoices.map((i) => (i.invoiceId === invoice.invoiceId ? invoice : i))
        : [...invoices, invoice];
      localStorage.setItem(INVOICES_KEY, JSON.stringify(updated));
    } catch {}
  },

  /**
   * Add a transaction to history.
   */
  addTransaction: (
    type: StarTransaction["type"],
    amountXTR: number,
    description: string,
    balanceAfter: number
  ): void => {
    try {
      const tx: StarTransaction = {
        txId: `TX-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        type,
        amountXTR,
        description,
        timestamp: Date.now(),
        balanceAfter,
      };
      const raw = localStorage.getItem(TRANSACTIONS_KEY);
      const transactions = raw ? JSON.parse(raw) : [];
      transactions.push(tx);
      // Keep only last 100 transactions
      if (transactions.length > 100) transactions.splice(0, transactions.length - 100);
      localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
    } catch {}
  },

  /**
   * Get transaction history.
   */
  getTransactions: (): StarTransaction[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(TRANSACTIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Reset balance to default (testing only).
   */
  resetBalance: (): void => {
    try {
      localStorage.setItem(BALANCE_KEY, DEFAULT_BALANCE.toString());
    } catch {}
  },
};
