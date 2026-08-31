import type { Metadata } from "next"
import { ExternalLink, Link2 } from "lucide-react"

import { obterPaginaLinks } from "@/lib/db/comunicacao-links"
import { obterOrganizacao } from "@/lib/db/organizacao"

/**
 * Página pública de links ("link na bio", estilo Linktree) — SEM login, tenant
 * pelo host. Gerenciada em Comunicação › Página de links. Visual próprio
 * (navy + laranja da marca), mobile-first: o público chega pelo navegador
 * embutido do Instagram.
 */

export async function generateMetadata(): Promise<Metadata> {
  const organizacao = await obterOrganizacao().catch(() => null)
  const nome = organizacao?.nomeFantasia ?? organizacao?.nomeRazao ?? "Links"
  return { title: `${nome} — Links` }
}

export default async function LinksPublicPage() {
  const [{ ativo, config, links }, organizacao] = await Promise.all([
    obterPaginaLinks(),
    obterOrganizacao().catch(() => null),
  ])

  const nome =
    config.titulo ??
    organizacao?.nomeFantasia ??
    organizacao?.nomeRazao ??
    "Links"
  const visiveis = links.filter((l) => l.ativo && l.url)
  const publicada = ativo && config.publicada

  return (
    <main
      className="flex min-h-svh flex-col items-center px-4 py-10"
      style={{
        background:
          "linear-gradient(175deg, #091747 0%, #0d1f5c 55%, #122a73 100%)",
        color: "#ffffff",
      }}
    >
      <div className="w-full max-w-md">
        <header className="flex flex-col items-center text-center">
          {organizacao?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={organizacao.logoUrl}
              alt={`Logo ${nome}`}
              className="size-20 rounded-full border-2 border-white/20 bg-white object-contain p-1.5 shadow-lg"
            />
          ) : (
            <div
              className="flex size-20 items-center justify-center rounded-full text-2xl font-bold shadow-lg"
              style={{ backgroundColor: "#FF5722", color: "#fff" }}
            >
              {nome.slice(0, 1).toUpperCase()}
            </div>
          )}
          <h1 className="mt-4 text-xl font-semibold">{nome}</h1>
          {publicada && config.bio && (
            <p className="mt-1 text-sm text-white/70">{config.bio}</p>
          )}
        </header>

        {!publicada || visiveis.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/15 bg-white/5 p-6 text-center">
            <Link2 className="mx-auto mb-3 size-8 text-white/50" />
            <p className="text-sm text-white/80">
              {publicada
                ? "Ainda não há links por aqui — volte em breve."
                : "Esta página não está disponível no momento."}
            </p>
          </div>
        ) : (
          <nav className="mt-8 grid gap-3" aria-label="Links">
            {visiveis.map((l) => (
              <a
                key={l.id}
                href={`/links/ir/${l.id}`}
                className="group block rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-center backdrop-blur transition-colors hover:border-[#FF5722] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5722]"
              >
                <span className="flex items-center justify-center gap-2 font-medium">
                  {l.titulo ?? l.url}
                  <ExternalLink className="size-3.5 shrink-0 text-white/40 transition-colors group-hover:text-[#FF5722]" />
                </span>
                {l.descricao && (
                  <span className="mt-0.5 block text-xs text-white/60">
                    {l.descricao}
                  </span>
                )}
              </a>
            ))}
          </nav>
        )}

        <footer className="mt-12 text-center text-xs text-white/40">
          {nome} · feito com Confluir
        </footer>
      </div>
    </main>
  )
}
