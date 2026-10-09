// PrimeViewPanel — Minimal slide-over panel
// Shows the user's active Next seller journeys and assigned outcomes.
// All unimplemented tabs (How To, Status, Company) and features
// (Expectations, Gap Detectors, Action Guidance, Capabilities) removed.

import { useEffect } from 'react';
import { X, Target } from 'lucide-react';
import { NextWork } from './NextWork';
import { useAuth } from '@/hooks/useAuth';

interface PrimeViewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: string;
  userId?: string;
}

export function PrimeViewPanel({ isOpen, onClose, userRole }: PrimeViewPanelProps) {
  const { can } = useAuth();

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Prime View"
        className="relative w-full max-w-sm lg:max-w-md h-full bg-white shadow-2xl flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-brand-navy">
              <Target className="h-5 w-5 text-brand-gold" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-gray-900">PRIME VIEW</h2>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">
                {userRole.toUpperCase()} · MY DAY
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Close Prime View"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {can('crm', 'read') && (
            <NextWork
              onNavigate={onClose}
              refreshKey={0}
              canWrite={can('crm', 'write')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
