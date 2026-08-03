import Link from "next/link"
import { ShieldCheck } from "lucide-react"

import { requireSuperAdmin } from "@/lib/plataforma"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const sa = await requireSuperAdmin()

  return (
    <div className="bg-muted/30 min-h-screen">
      <header className="bg-background border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-3">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="text-primary size-5" />
            Confluir <span className="text-muted-foreground font-normal">· Plataforma</span>
          </Link>
          <div className="text-muted-foreground text-sm">
            {sa.nome ?? sa.email ?? "super-admin"}
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">{children}</main>
    </div>
  )
}
