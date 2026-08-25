import type { ReactNode } from 'react'

interface Props { title: string; description: string; action?: ReactNode }

export const EmptyState = ({ title, description, action }: Props) => (
  <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 px-6 py-16 text-center">
    <h3 className="text-base font-semibold text-slate-900">{title}</h3>
    <p className="max-w-md text-sm text-slate-500">{description}</p>
    {action}
  </div>
)
