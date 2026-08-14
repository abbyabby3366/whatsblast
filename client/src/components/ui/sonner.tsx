import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
  Trash2Icon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Toaster as Sonner, toast, useSonner } from 'sonner'
import type { ToasterProps } from 'sonner'

function ClearAllToastsButton({ position = 'bottom-right' }: { position?: ToasterProps['position'] }) {
  const { toasts } = useSonner()
  const activeToasts = toasts.filter((t: any) => !t.dismiss)

  if (activeToasts.length === 0) return null

  const isBottom = position.startsWith('bottom')
  const isRight = position.endsWith('right')
  const isLeft = position.endsWith('left')

  let posClasses = 'bottom-2 right-4'
  if (isBottom && isRight) posClasses = 'bottom-2 right-4'
  else if (isBottom && isLeft) posClasses = 'bottom-2 left-4'
  else if (isBottom && !isRight && !isLeft) posClasses = 'bottom-2 left-1/2 -translate-x-1/2'
  else if (!isBottom && isRight) posClasses = 'top-2 right-4'
  else if (!isBottom && isLeft) posClasses = 'top-2 left-4'
  else if (!isBottom && !isRight && !isLeft) posClasses = 'top-2 left-1/2 -translate-x-1/2'

  return (
    <div className={`fixed z-[999999999] pointer-events-auto transition-all animate-in fade-in slide-in-from-bottom-2 ${posClasses}`}>
      <button
        onClick={() => toast.dismiss()}
        type="button"
        className="group flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full shadow-xl border border-red-500/40 bg-red-950/90 text-red-200 hover:bg-red-900 hover:text-white hover:border-red-500/70 backdrop-blur-md transition-all active:scale-95 cursor-pointer"
        title="Clear all toast notifications"
      >
        <Trash2Icon className="size-3.5 text-red-400 group-hover:text-red-200 transition-colors" />
        <span>Clear all {activeToasts.length > 1 ? `(${activeToasts.length})` : ''}</span>
      </button>
    </div>
  )
}

const Toaster = ({ position = 'bottom-right', closeButton = true, ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()

  return (
    <>
      <Sonner
        theme={theme as ToasterProps['theme']}
        className="toaster group"
        position={position}
        closeButton={closeButton}
        icons={{
          success: <CircleCheckIcon className="size-4" />,
          info: <InfoIcon className="size-4" />,
          warning: <TriangleAlertIcon className="size-4" />,
          error: <OctagonXIcon className="size-4" />,
          loading: <Loader2Icon className="size-4 animate-spin" />,
        }}
        style={
          {
            '--normal-bg': 'var(--popover)',
            '--normal-text': 'var(--popover-foreground)',
            '--normal-border': 'var(--border)',
            '--border-radius': 'var(--radius)',
          } as React.CSSProperties
        }
        {...props}
      />
      <ClearAllToastsButton position={position} />
    </>
  )
}

export { Toaster }

