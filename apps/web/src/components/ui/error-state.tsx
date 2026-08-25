import type { ReactNode } from 'react'

interface Props { title: string; message: string; action?: ReactNode }

export const ErrorState = ({ title, message, action }: Props) => (
  <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-4">
    <h3 className="text-sm font-semibold text-red-900">{title}</h3>
    <p className="text-sm text-red-800">{message}</p>
    {action}
  </div>
)
