import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import type { DocumentoSst } from "@/lib/db/pessoal-sst"
import {
  ROTULO_CATEGORIA,
  ROTULO_FREQUENCIA,
  ROTULO_PRESENCA,
  ROTULO_RECORRENCIA,
  formatarTempoMes,
  nivelRisco,
} from "@/lib/pessoal-sst-constantes"
import { formatarCnpjCpf } from "@/lib/formato"

/**
 * PDF da Ordem de Serviço (NR-01, funcionário) e do Comunicado de SST
 * (prestador de serviço) — mesmo esqueleto, textos e responsabilidades
 * diferentes. Renderizado nas rotas de /painel/pessoal/atribuicoes/documentos.
 */

const CM = 28.35

const s = StyleSheet.create({
  page: {
    paddingTop: CM,
    paddingHorizontal: CM,
    paddingBottom: CM * 1.5,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  cabecalhoOrg: { textAlign: "center", marginBottom: 4, fontSize: 11, fontFamily: "Helvetica-Bold" },
  cabecalhoCnpj: { textAlign: "center", marginBottom: 14, fontSize: 9, color: "#444444" },
  titulo: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  subtitulo: { textAlign: "center", fontSize: 9, color: "#444444", marginBottom: 14 },
  bloco: { marginBottom: 10 },
  blocoTitulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    backgroundColor: "#eef1f6",
    padding: 4,
    marginBottom: 4,
  },
  linha: { marginBottom: 2, lineHeight: 1.3 },
  rotulo: { fontFamily: "Helvetica-Bold" },
  atividade: { marginBottom: 12 },
  atividadeNome: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
  item: { marginLeft: 10, marginBottom: 1.5, lineHeight: 1.25 },
  aviso: { marginTop: 4, marginBottom: 10, lineHeight: 1.3, textAlign: "justify" },
  assinaturas: { marginTop: 28, flexDirection: "row", justifyContent: "space-between", gap: 20 },
  assinatura: { flex: 1, alignItems: "center" },
  assinaturaLinha: { borderTopWidth: 1, borderTopColor: "#111827", width: "100%", marginBottom: 4, marginTop: 30 },
  assinaturaNome: { fontFamily: "Helvetica-Bold", fontSize: 9, textAlign: "center" },
  assinaturaPapel: { fontSize: 8, color: "#444444", textAlign: "center" },
  dataLocal: { marginTop: 20, fontSize: 10 },
  pagina: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 8,
    color: "#444444",
  },
})

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

function hojePorExtenso(): string {
  const agora = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  )
  return `${agora.getDate()} de ${MESES[agora.getMonth()]} de ${agora.getFullYear()}`
}

export function SstDocumentoPDF({
  dados,
  organizacao,
}: {
  dados: DocumentoSst
  organizacao: { nome: string; cnpj: string | null; cidade: string | null }
}) {
  const os = dados.tipo === "os"
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.cabecalhoOrg}>{organizacao.nome}</Text>
        {organizacao.cnpj && (
          <Text style={s.cabecalhoCnpj}>
            CNPJ {formatarCnpjCpf(organizacao.cnpj)}
          </Text>
        )}
        <Text style={s.titulo}>
          {os
            ? "ORDEM DE SERVIÇO SOBRE SEGURANÇA E SAÚDE NO TRABALHO"
            : "COMUNICADO DE SEGURANÇA E SAÚDE NO TRABALHO"}
        </Text>
        <Text style={s.subtitulo}>
          {os
            ? "Emitida na forma da NR-01 (item 1.4.1), para ciência dos riscos ocupacionais e das medidas de prevenção"
            : "Informações de SST ao prestador de serviço: riscos das atividades contratadas e exigências de prevenção"}
        </Text>

        <View style={s.bloco}>
          <Text style={s.blocoTitulo}>
            {os ? "Identificação do trabalhador" : "Identificação do prestador"}
          </Text>
          <Text style={s.linha}>
            <Text style={s.rotulo}>Nome: </Text>
            {dados.pessoa.nome ?? "—"}
          </Text>
          <Text style={s.linha}>
            <Text style={s.rotulo}>{os ? "CPF: " : "CNPJ/CPF: "}</Text>
            {dados.pessoa.documento
              ? formatarCnpjCpf(dados.pessoa.documento)
              : "—"}
          </Text>
          <Text style={s.linha}>
            <Text style={s.rotulo}>{os ? "Função: " : "Condição: "}</Text>
            {dados.pessoa.complemento ?? "—"}
          </Text>
        </View>

        <Text style={s.aviso}>
          {os
            ? "As atividades abaixo foram avaliadas quanto a perigos e riscos ocupacionais. O trabalhador declara-se ciente dos riscos e das medidas de prevenção, obriga-se a cumprir os procedimentos, a usar os EPIs indicados, a participar dos treinamentos exigidos e a informar imediatamente ao superior qualquer situação de risco (NR-01, item 1.4.2)."
            : "As atividades contratadas abaixo foram avaliadas quanto a perigos e riscos ocupacionais. O prestador declara-se ciente e obriga-se a atender às exigências de treinamento e EPI indicadas, respondendo pelo cumprimento das Normas Regulamentadoras aplicáveis na execução dos serviços."}
        </Text>

        {dados.atividades.map((t, i) => (
          <View key={i} style={s.atividade} wrap={false}>
            <Text style={s.atividadeNome}>
              {i + 1}. {t.nome ?? "(atividade)"}
            </Text>
            {t.descricao && <Text style={s.linha}>{t.descricao}</Text>}
            <Text style={s.linha}>
              <Text style={s.rotulo}>Execução: </Text>
              {[
                t.recorrencia ? ROTULO_RECORRENCIA[t.recorrencia] : null,
                t.frequencia ? ROTULO_FREQUENCIA[t.frequencia] : null,
                t.tempoMinMes ? `${formatarTempoMes(t.tempoMinMes)}/mês` : null,
                t.presenca ? ROTULO_PRESENCA[t.presenca] : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </Text>
            {t.ferramentas.length > 0 && (
              <Text style={s.linha}>
                <Text style={s.rotulo}>Ferramentas/equipamentos: </Text>
                {t.ferramentas.join(", ")}
              </Text>
            )}
            {t.perigos.length > 0 && (
              <>
                <Text style={s.linha}>
                  <Text style={s.rotulo}>Perigos identificados:</Text>
                </Text>
                {t.perigos.map((p) => (
                  <Text key={p.id} style={s.item}>
                    • {p.descricao}
                    {p.norma ? ` (${p.norma})` : ""}
                    {p.fonte ? ` — fonte: ${p.fonte}` : ""}
                  </Text>
                ))}
              </>
            )}
            {t.riscos.length > 0 && (
              <>
                <Text style={s.linha}>
                  <Text style={s.rotulo}>Riscos ocupacionais avaliados:</Text>
                </Text>
                {t.riscos.map((r) => {
                  const nv = nivelRisco(r.probabilidade, r.severidade)
                  const nvR = nivelRisco(
                    r.probabilidade_residual,
                    r.severidade_residual
                  )
                  return (
                    <Text key={r.id} style={s.item}>
                      • {r.categoria ? (ROTULO_CATEGORIA[r.categoria] ?? r.categoria) : "—"}
                      {nv ? ` — nível ${nv.rotulo} (${nv.valor})` : ""}
                      {nvR ? `; residual ${nvR.rotulo} (${nvR.valor})` : ""}
                      {r.observacao ? ` — ${r.observacao}` : ""}
                    </Text>
                  )
                })}
              </>
            )}
            {t.treinamentos.length > 0 && (
              <>
                <Text style={s.linha}>
                  <Text style={s.rotulo}>
                    {os
                      ? "Treinamentos obrigatórios:"
                      : "Treinamentos exigidos do prestador:"}
                  </Text>
                </Text>
                {t.treinamentos.map((m, k) => (
                  <Text key={k} style={s.item}>
                    • {m.descricao}
                    {m.recorrencia_meses
                      ? ` (reciclagem a cada ${m.recorrencia_meses} meses)`
                      : ""}
                  </Text>
                ))}
              </>
            )}
            {t.epis.length > 0 && (
              <>
                <Text style={s.linha}>
                  <Text style={s.rotulo}>
                    {os ? "EPIs de uso obrigatório:" : "EPIs exigidos:"}
                  </Text>
                </Text>
                {t.epis.map((m, k) => (
                  <Text key={k} style={s.item}>
                    • {m.descricao}
                    {m.epi_ca ? ` — CA ${m.epi_ca}` : ""}
                  </Text>
                ))}
              </>
            )}
          </View>
        ))}

        {/* data e assinaturas andam juntas: assinatura órfã em página nova
            sem a data ao lado fica sem contexto no documento impresso */}
        <View wrap={false}>
          <Text style={s.dataLocal}>
            {organizacao.cidade ? `${organizacao.cidade}, ` : ""}
            {hojePorExtenso()}.
          </Text>

          <View style={s.assinaturas}>
            <View style={s.assinatura}>
              <View style={s.assinaturaLinha} />
              <Text style={s.assinaturaNome}>{dados.pessoa.nome ?? ""}</Text>
              <Text style={s.assinaturaPapel}>
                {os
                  ? "Trabalhador — ciente dos riscos e medidas"
                  : "Prestador de serviço — ciente das exigências"}
              </Text>
            </View>
            <View style={s.assinatura}>
              <View style={s.assinaturaLinha} />
              <Text style={s.assinaturaNome}>{organizacao.nome}</Text>
              <Text style={s.assinaturaPapel}>Empregador / contratante</Text>
            </View>
          </View>
        </View>

        <Text
          style={s.pagina}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Página ${pageNumber} de ${totalPages}`
          }
        />
      </Page>
    </Document>
  )
}
