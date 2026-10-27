import { createElement } from "react"
import type { NextRequest } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"

import { getSessaoPainel } from "@/lib/auth"
import { obterCampanha, obterOpositorDetalhe } from "@/lib/db/oposicao"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { registrarExportacao } from "@/lib/exportacoes"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"
import { mascaraCpf } from "@/lib/mascaras"
import { MODOS_FORMALIZACAO, ROTULO_SITUACAO_OPOSITOR } from "@/lib/oposicao-constantes"
import { DossieOposicaoPDF } from "@/lib/pdf/dossie-oposicao"
import { logoDataUri } from "@/lib/pdf/logo-pdf"
import { podeAcessar } from "@/lib/permissoes"

export const runtime = "nodejs"

const ROTULO_VALIDACAO: Record<string, string> = {
  valida: "Assinatura válida",
  ressalva: "Assinatura íntegra, com ressalva",
  invalida: "Assinatura inválida",
  sem_assinatura: "Sem assinatura digital",
  erro: "Não foi possível verificar",
}

/** Dossiê da oposição em PDF (C7): o ato, a prova e a trilha, para defesa em juízo. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; opositorId: string }> }
): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "oposicao")) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { id, opositorId } = await params
  const [o, campanha, org] = await Promise.all([obterOpositorDetalhe(opositorId), obterCampanha(id), obterOrganizacao()])
  if (!o || o.campanhaId !== id || !campanha) return new Response("Não encontrado", { status: 404 })

  await registrarExportacao(request, {
    usuarioId: sessao.usuario.id,
    recurso: "oposicao_dossie",
    formato: "pdf",
    quantidade: 1,
    filtros: { campanha: id, oposicao: opositorId },
  })
  const v = o.validacao
  const modo = MODOS_FORMALIZACAO.find((m) => m.chave === o.modoAto)?.rotulo ?? o.modoAto
  const logo = await logoDataUri(org?.logoUrl ?? null)
  const elemento = createElement(DossieOposicaoPDF, {
    dados: {
      organizacao: org?.nomeRazao ?? org?.nomeFantasia ?? null,
      cnpj: org?.cnpjCpf ? formatarCnpjCpf(org.cnpjCpf) : null,
      emitidoEm: formatarDataHora(new Date().toISOString()),
      emitidoPor: sessao.usuario.nome_completo ?? sessao.usuario.nome_guerra ?? null,
      campanha: [campanha.nome ?? campanha.codigo, campanha.detalhe_desconto].filter(Boolean).join(" — "),
      identificacao: [
        ["Nome", o.nome],
        ["CPF", o.cpf ? mascaraCpf(o.cpf) : null],
        ["Perfil", o.ehFiliado ? "Filiado" : "Não filiado"],
        ["Matrícula", o.matricula],
        ["Fonte pagadora", o.empregadorNome],
        ["Lotação", o.lotacao],
        ["E-mail", o.email],
        ["Telefone", o.telefone],
      ],
      ato: [
        ["Protocolo", o.protocolo == null ? null : String(o.protocolo)],
        ["Registrada em", o.confirmado_em ? `${formatarDataHora(o.confirmado_em)} (horário de Brasília)` : null],
        ["Formalização", modo],
        ["Prazo vigente no ato", o.prazoFimAto ? formatarData(o.prazoFimAto) : null],
        ["IP", o.ip],
        ["Navegador", o.userAgent],
      ],
      declaracao: o.declaracaoAceita,
      declaracaoHash: o.declaracaoHash,
      respostas: o.respostas,
      carta: o.documentoAssinadoUrl
        ? [
            ["Recebida em", o.documentoEnviadoEm ? formatarDataHora(o.documentoEnviadoEm) : "registrada (sem data)"],
            ["Conferência", v ? `${ROTULO_VALIDACAO[v.situacao] ?? v.situacao}${v.cpfConfere === true ? " · CPF confere" : v.cpfConfere === false ? " · CPF NÃO confere" : ""}` : "não verificada"],
            ["Resumo", v?.resumo ?? null],
            ["Verificada em", v?.verificadoEm ? formatarDataHora(v.verificadoEm) : null],
            ["Arquivo", o.documentoAssinadoUrl],
          ]
        : [["Carta", "não houve carta assinada"]],
      assinaturas: (v?.assinaturas ?? []).map(
        (a, i) =>
          `Assinatura ${i + 1}: ${a.nome ?? "?"}${a.cpf ? ` · CPF ${a.cpf}` : ""} · emissor ${a.emissor ?? "?"} · raiz ${a.raiz ?? "?"} · ${a.integra ? "íntegra" : "ADULTERADA"} · ${a.assinaturaOk ? "assinatura confere" : "assinatura NÃO confere"}${a.assinadoEm ? ` · assinada em ${formatarDataHora(a.assinadoEm)}` : ""}`
      ),
      avaliacao: [
        ["Situação", ROTULO_SITUACAO_OPOSITOR[o.situacao]],
        ["Avaliada em", o.avaliacao_data ? formatarData(o.avaliacao_data) : null],
        ["Avaliador", o.avaliadorNome],
        ["Motivo", o.reprovacao_motivo],
      ],
      trilha: o.eventos.map((e) => ({
        quando: e.created_at ? formatarDataHora(e.created_at) : "—",
        evento: e.evento ?? "—",
        detalhe: [e.usuarioNome ? `por ${e.usuarioNome}` : null, e.detalhe, e.ip ? `IP ${e.ip}` : null]
          .filter(Boolean)
          .join(" · ") || null,
      })),
    },
    logoDataUri: logo,
  }) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(elemento)
  const nome = o.protocolo != null ? `protocolo-${o.protocolo}` : opositorId.slice(0, 8)
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="dossie-oposicao-${nome}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
