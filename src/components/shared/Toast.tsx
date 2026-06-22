import * as ToastPrimitive from '@radix-ui/react-toast'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  type: ToastType
  title: string
  description?: string
}

// Simple zustand-free store using module-level state + listeners
let toasts: ToastItem[] = []
let listeners: Array<(toasts: ToastItem[]) => void> = []

function notify(listeners: Array<(t: ToastItem[]) => void>, next: ToastItem[]) {
  toasts = next
  listeners.forEach(l => l(next))
}

export function toast(type: ToastType, title: string, description?: string) {
  const id = Math.random().toString(36).slice(2)
  const item: ToastItem = { id, type, title, description }
  notify(listeners, [...toasts, item])
  setTimeout(() => notify(listeners, toasts.filter(t => t.id !== id)), 4000)
}

toast.success = (title: string, description?: string) => toast('success', title, description)
toast.error   = (title: string, description?: string) => toast('error', title, description)
toast.info    = (title: string, description?: string) => toast('info', title, description)

const ICONS = {
  success: <CheckCircle2 size={14} className="text-green-600 shrink-0 mt-0.5" />,
  error:   <AlertCircle  size={14} className="text-red-600 shrink-0 mt-0.5" />,
  info:    <Info         size={14} className="text-blue-600 shrink-0 mt-0.5" />,
}

const BG = {
  success: 'border-green-200 bg-green-50',
  error:   'border-red-200 bg-red-50',
  info:    'border-blue-200 bg-blue-50',
}

import { useEffect, useState } from 'react'

export function ToastProvider() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    listeners.push(setItems)
    return () => { listeners = listeners.filter(l => l !== setItems) }
  }, [])

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {items.map(item => (
        <ToastPrimitive.Root
          key={item.id}
          open={true}
          onOpenChange={open => {
            if (!open) notify(listeners, toasts.filter(t => t.id !== item.id))
          }}
          className={cn(
            'flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg w-80',
            'data-[state=open]:animate-fade-up data-[state=closed]:animate-fade-out',
            BG[item.type]
          )}
        >
          {ICONS[item.type]}
          <div className="flex-1 min-w-0">
            <ToastPrimitive.Title className="text-sm font-semibold text-brand-950">
              {item.title}
            </ToastPrimitive.Title>
            {item.description && (
              <ToastPrimitive.Description className="text-xs text-muted-foreground mt-0.5">
                {item.description}
              </ToastPrimitive.Description>
            )}
          </div>
          <ToastPrimitive.Close className="text-muted-foreground hover:text-foreground shrink-0">
            <X size={12} />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2 z-[100] outline-none" />
    </ToastPrimitive.Provider>
  )
}
