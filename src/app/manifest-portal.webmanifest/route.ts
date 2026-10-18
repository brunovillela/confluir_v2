import type { MetadataRoute } from "next"

import { nomeEntidade } from "@/lib/db/organizacao"
import { rotasDesabilitadas } from "@/lib/db/portal-partes"

/**
 * Manifest do PWA do portal do associado (A56). O de src/app/manifest.ts é o
 * do painel (start_url /painel): quem instalava o app pelo portal abria o
 * ícone no login dos funcionários. Este abre direto em /portal/inicio e tem
 * id e escopo próprios — o celular trata os dois como apps diferentes.
 *
 * Mora FORA de /portal/ de propósito: o proxy manda para o login qualquer
 * /portal/* sem sessão, e o navegador busca o manifest sem cookies. Aqui ele
 * passa direto (o proxy só resolve o tenant pelo host). É route handler, e não
 * o arquivo especial manifest.ts, porque o Next só reconhece esse na raiz de
 * app/ — e lá já está o do painel. As páginas do portal apontam para cá em
 * src/app/portal/layout.tsx (metadata.manifest).
 *
 * Escopo "/portal" (sem barra no fim) inclui a própria tela de login: sessão
 * vencida ou "Sair" continuam dentro do app instalado, sem a barra de
 * "fora do app" do navegador.
 */

// Um manifest por tenant (host): nunca pré-gerar no build. GET já é dinâmico
// por padrão, mas tenantAtual() engole o erro de headers() fora de requisição
// — explícito aqui, como nos outros route handlers que dependem do tenant.
export const dynamic = "force-dynamic"

/** Acima disso o nome da entidade não cabe sob o ícone da tela inicial. */
const LIMITE_NOME_CURTO = 15

const ICONES: MetadataRoute.Manifest["icons"] = [
  { src: "/icones/icone-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icones/icone-512.png", sizes: "512x512", type: "image/png" },
  { src: "/icones/icone-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
  { src: "/icones/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
]

/** Atalhos (toque longo no ícone) com o ícone do app — o Android pede um. */
const ICONES_ATALHO: MetadataRoute.Manifest["icons"] = [
  { src: "/icones/icone-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icones/icone-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
]

/** Atalhos do app instalado; o de parte desabilitada sai (ver GET). */
const ATALHOS: NonNullable<MetadataRoute.Manifest["shortcuts"]> = [
  {
    name: "Carteirinha",
    short_name: "Carteirinha",
    url: "/portal/carteirinha",
    description: "Sua carteirinha com o QR de verificação",
    icons: ICONES_ATALHO,
  },
  {
    name: "Contribuição",
    short_name: "Contribuição",
    url: "/portal/contribuicao",
    description: "Cobranças e histórico das suas contribuições",
    icons: ICONES_ATALHO,
  },
  {
    name: "Avisos",
    short_name: "Avisos",
    url: "/portal/avisos",
    description: "Mensagens da entidade para você",
    icons: ICONES_ATALHO,
  },
]

export async function GET() {
  // Multi-tenant: a entidade do subdomínio. nomeEntidade() cai em "Confluir"
  // quando a organização não tem nome — aí o app se apresenta só como portal,
  // para não se confundir com o do painel.
  // Atalho de parte desabilitada em Filiados › Área do associado sai (o já
  // instalado cai na página "indisponível"); na dúvida, todos ficam.
  const [entidade, desabilitadas] = await Promise.all([
    nomeEntidade(),
    rotasDesabilitadas().catch(() => [] as string[]),
  ])
  const temNome = entidade !== "Confluir"
  // A descrição também só cita o que o portal mostra.
  const itens = [
    desabilitadas.includes("/portal/carteirinha") ? null : "carteirinha",
    desabilitadas.includes("/portal/contribuicao") ? null : "contribuição",
    "avisos",
  ].filter((t): t is string => t !== null)
  const lista = `${itens.join(", ")} e serviços para associados`
  const descricao = lista.charAt(0).toUpperCase() + lista.slice(1)

  const manifest: MetadataRoute.Manifest = {
    id: "/portal",
    name: temNome ? `Portal do Associado — ${entidade}` : "Portal do Associado",
    short_name: temNome && entidade.length <= LIMITE_NOME_CURTO ? entidade : "Portal",
    description: temNome ? `${descricao} — ${entidade}.` : `${descricao}.`,
    start_url: "/portal/inicio",
    scope: "/portal",
    display: "standalone",
    orientation: "portrait",
    background_color: "#091747",
    theme_color: "#091747",
    lang: "pt-BR",
    icons: ICONES,
    shortcuts: ATALHOS.filter((a) => !desabilitadas.includes(a.url)),
  }

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      // O conteúdo muda com o host (tenant): só o navegador guarda, nunca um
      // cache compartilhado. Uma hora poupa a consulta a cada página aberta.
      "Cache-Control": "private, max-age=3600",
    },
  })
}
