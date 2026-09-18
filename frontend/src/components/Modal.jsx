import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function Modal({ open, onClose, title, children, width = 'max-w-md' }) {
  if (!open) return null
  // Rendered into document.body (not inline where the component is used) so
  // this modal can never get trapped behind other content. A `fixed`
  // element is still confined to an ancestor's stacking context if that
  // ancestor sets its own z-index (e.g. the staff menu's <header
  // className="relative z-10">) — a sibling with an equal-or-higher
  // z-index appearing later in the DOM (e.g. <main className="relative
  // z-10">) then paints on top of the whole header subtree, modal
  // included, regardless of the modal's own z-50. Escaping to body sidesteps
  // that entirely.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className={`relative z-10 w-full ${width} rounded-lg bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-sand px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} className="text-slate hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
