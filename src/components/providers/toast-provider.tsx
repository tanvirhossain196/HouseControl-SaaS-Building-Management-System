'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastTone = 'success' | 'error' | 'warning' | 'info'
type Toast = { id: number; tone: ToastTone; title: string; body?: string }

const icons = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const

const tones: Record<ToastTone, string> = {
  success: 'border-l-paid text-paid',
  error: 'border-l-overdue text-overdue',
  warning: 'border-l-due text-due',
  info: 'border-l-primary text-primary',
}

const ToastContext = React.createContext<{
  toast: (t: Omit<Toast, 'id'>) => void
} | null>(null)

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const dismiss = React.useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const toast = React.useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = Date.now() + Math.random()
      setToasts((list) => [...list, { ...t, id }])
      window.setTimeout(() => dismiss(id), 5000)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {mounted &&
        createPortal(
          <div
            role="region"
            aria-label="Notifications"
            className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
          >
            {toasts.map((t) => {
              const Icon = icons[t.tone]
              return (
                <div
                  key={t.id}
                  role={t.tone === 'error' ? 'alert' : 'status'}
                  className={cn(
                    'pointer-events-auto flex animate-slide-in-right items-start gap-3 rounded-panel border border-l-[3px] border-line bg-surface p-3.5 shadow-lift',
                    tones[t.tone],
                  )}
                >
                  <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{t.title}</p>
                    {t.body && <p className="mt-0.5 text-xs text-muted">{t.body}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss notification"
                    className="rounded-tile p-0.5 text-muted transition-colors hover:bg-raised hover:text-ink"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}
