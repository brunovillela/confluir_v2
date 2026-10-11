import { NextResponse } from "next/server"

import { hojeSP } from "@/lib/db/comum"
import { dadosDoTitular, registrarPortabilidade } from "@/lib/db/lgpd"
import { origemAtual } from "@/lib/tenant-url"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Portabilidade (LGPD art. 18, V): o próprio filiado baixa, em JSON, tudo
 * que o sistema guarda sobre ele. Fica registrado no livro de solicitações
 * que a exportação aconteceu (sem os dados).
 *
 * Só o filiado da sessão do portal baixa. Na visualização pela gestão ("Ver
 * como filiado") nada é lido nem registrado, e a tela explica: a exportação
 * é ato do titular — sem a trava, o atendente levaria dados bancários e o
 * resto do cadastro, e o livro LGPD anotaria uma portabilidade que o
 * associado não pediu.
 *
 * Os redirecionamentos usam a origem da requisição (origemAtual, pelo
 * cabeçalho host): em produção cada entidade está no próprio subdomínio, e
 * uma URL fixa mandaria o associado para fora dela. Não use `request.url`:
 * fora da Vercel o Next o monta com o hostname do servidor (localhost), não
 * com o subdomínio.
 */
export async function GET() {
  const [vis, origem] = await Promise.all([getVisualizacaoPortal(), origemAtual()])
  // Sem sessão de filiado (vencida, ou conta que não é de filiado ativo):
  // volta ao login do portal.
  if (!vis) return NextResponse.redirect(`${origem}/portal`)
  if (vis.preview) return NextResponse.redirect(`${origem}/portal/lgpd?aviso=visualizacao`)
  const dados = await dadosDoTitular(vis.filiado.cpf)
  await registrarPortabilidade(vis.filiado.filiacaoId)
  // Data de São Paulo: toISOString() é UTC e, depois das 21h, dava amanhã.
  const nome = `meus-dados-confluir-${hojeSP()}.json`
  return new NextResponse(JSON.stringify(dados, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  })
}
