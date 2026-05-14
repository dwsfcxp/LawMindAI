import { useState, useCallback, useContext, createContext, type ReactNode } from 'react';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

// ── Context ────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

// ── Icons & styles per type ────────────────────────────────────────────

const TOAST_STYLES: Record<ToastType, { icon: typeof CheckCircle2; border: string; bg: string; iconColor: string }> = {
  success: { icon: CheckCircle2, border: 'border-green-300', bg: 'bg-green-50', iconColor: 'text-green-600' },
  error:   { icon: AlertCircle,  border: 'border-red-300',   bg: 'bg-red-50',   iconColor: 'text-red-600' },
  warning: { icon: AlertTriangle, border: 'border-amber-300', bg: 'bg-amber-50', iconColor: 'text-amber-600' },
  info:    { icon: Info,          border: 'border-blue-300',  bg: 'bg-blue-50',  iconColor: 'text-blue-600' },
};

// ── Provider ───────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((opts: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const duration = opts.duration ?? (opts.type === 'error' ? 6000 : 4000);

    setToasts((prev) => [...prev, { ...opts, id }]);

    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast: addToast, dismiss }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => {
          const style = TOAST_STYLES[t.type];
          const Icon = style.icon;
          return (
            <div
              key={t.id}
              className={cn(
                'flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg animate-in slide-in-from-right',
                style.border,
                style.bg,
              )}
            >
              <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', style.iconColor)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded p-0.5 hover:bg-black/5"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
