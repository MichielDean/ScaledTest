import { useState, useCallback } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';

interface Toast {
  id: string;
  title: string;
  variant: 'error' | 'success';
}

let addToastFn: ((toast: Omit<Toast, 'id'>) => void) | null = null;

export function toast(title: string, variant: 'error' | 'success' = 'error') {
  if (addToastFn) {
    addToastFn({ title, variant });
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  addToastFn = addToast;

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {children}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-96 outline-none">
        {toasts.map(t => (
          <ToastPrimitive.Root
            key={t.id}
            className={`rounded-lg border p-4 shadow-lg ${
              t.variant === 'error'
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : 'border-success/30 bg-success/10 text-success'
            }`}
          >
            <div className="flex items-center justify-between">
              <ToastPrimitive.Title className="text-sm font-medium">
                {t.title}
              </ToastPrimitive.Title>
              <ToastPrimitive.Close className="text-current opacity-50 hover:opacity-100 ml-2 text-sm">
                ✕
              </ToastPrimitive.Close>
            </div>
          </ToastPrimitive.Root>
        ))}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Provider>
  );
}