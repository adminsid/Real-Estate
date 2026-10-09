// Prime View — Shared Frontend Types
// Minimal set used by PrimeViewPanel and WorkspaceContext.

export type UserRole = 'admin' | 'broker' | 'agent' | 'assistant' | 'salesperson' | 'vendor' | 'partner';

export interface PrimeViewState {
  isOpen: boolean;
  togglePrimeView: () => void;
  openPrimeView: () => void;
  closePrimeView: () => void;
}
