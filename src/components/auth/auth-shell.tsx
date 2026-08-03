import { Marca } from "@/components/marca"

export function AuthShell({
  children,
  rodape,
}: {
  children: React.ReactNode
  rodape?: React.ReactNode
}) {
  return (
    <main className="bg-muted/40 flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <Marca variante="completa" />
      <div className="w-full max-w-sm">{children}</div>
      {rodape && (
        <div className="text-muted-foreground text-center text-sm text-balance">
          {rodape}
        </div>
      )}
    </main>
  )
}
