import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { serverSdk } from '@/lib/graphql-client'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const header = cookieStore.toString()

  let userName: string
  try {
    const { data } = await serverSdk(header).Me()
    userName = data.me.name
  } catch {
    redirect('/auth/login')
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header userName={userName} />
        <Breadcrumbs />
        <main className="flex-1 px-6 pb-10">{children}</main>
      </div>
    </div>
  )
}
