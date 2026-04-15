import { useState, useCallback, useEffect } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';

interface Toast {
  id: string;
  title: string;
  variant: 'error' | 'success';
}

type AddToastFn = (toast: Omit<Toast, 'id'>) => void;

let addToastFn: AddToastFn | null = null;

const pendingToasts: Array<Omit<Toast, 'id'>> = [];

export function toast(title: string, variant: 'error' | 'success' = 'error') {
  if (addToastFn) {
    addToastFn({ title, variant });
  } else {
    pendingToasts.push({ title, variant });
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { ...t, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(item => item.id !== id));
    }, 5000);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    while (pendingToasts.length > 0) {
      addToast(pendingToasts.shift()!);
    }
    return () => {
      if (addToastFn === addToast) {
        addToastFn = null;
      }
    };
  }, [addToast]);

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