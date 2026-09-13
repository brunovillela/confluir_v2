import type { Metadata } from "next"

import { exibicaoDoLink } from "@/lib/db/comunicacao-slides"

import { TelaTv } from "./tela-tv"

/**
 * Tela pública de um conjunto de slides (Comunicação › Slides para TV) — SEM
 * login, tenant pelo host. A TV abre este endereço e fica rodando.
 *
 * Os slides giram com animação CSS e a página traz um script ES5 embutido
 * (./script-tv.ts): assim funciona em navegador de TV antigo, onde o
 * JavaScript da aplicação pode não rodar. Quando o conteúdo muda no painel,
 * a versão muda e a TV recarrega sozinha.
 *
 * ?previa=1 — usado pelo painel: não registra a conexão da TV.
 */

export const metadata: Metadata = {
  title: "TV — Confluir",
  robots: { index: false, follow: false },
}

export default async function TelaTvPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ previa?: string }>
}) {
  const { slug } = await params
  const previa = (await searchParams).previa === "1"
  const exibicao = await exibicaoDoLink(slug, { registrarAcesso: !previa })
  return <TelaTv exibicao={exibicao} slug={slug} previa={previa} agora={new Date()} />
}
