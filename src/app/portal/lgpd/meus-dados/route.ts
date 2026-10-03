import { NextResponse } from "next/server"

import { getSessaoPortal } from "@/lib/auth"
import { dadosDoTitular, registrarPortabilidade } from "@/lib/db/lgpd"

/**
 * Portabilidade (LGPD art. 18, V): o próprio filiado baixa, em JSON, tudo
 * que o sistema guarda sobre ele. Fica registrado no livro de solicitações
 * que a exportação aconteceu (sem os dados).
 */
export async function GET() {
  const sessao = await getSessaoPortal()
  if (!sessao) return NextResponse.redirect(new URL("/portal", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"))
  const dados = await dadosDoTitular(sessao.filiado.cpf)
  await registrarPortabilidade(sessao.filiado.filiacaoId)
  const nome = `meus-dados-confluir-${new Date().toISOString().slice(0, 10)}.json`
  return new NextResponse(JSON.stringify(dados, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  })
}
