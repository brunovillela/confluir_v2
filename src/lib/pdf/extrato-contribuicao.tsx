import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import { formatarMoeda } from "@/lib/formato"

/**
 * Extrato anual de contribuições (A61): emitido pelo próprio associado no
 * portal, para conferência, o imposto de renda ou um processo. As linhas já
 * chegam prontas para ler (mês, tipo com nome de gente, quem pagou); o total
 * sai por tipo e no ano, porque misturar mensalidade e assistencial num
 * número só engana quem vai usá-lo. Renderizado em
 * /portal/contribuicao/extrato.
 */

const CM = 28.35
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

function extenso(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number)
  return `${d} de ${MESES[m - 1]} de ${a}`
}

const s = StyleSheet.create({
  page: { paddingTop: CM * 1.5, paddingHorizontal: CM * 1.8, paddingBottom: 64, fontSize: 10, fontFamily: "Helvetica", color: "#111827", lineHeight: 1.45 },
  cabecalho: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#dddddd", paddingBottom: 8, marginBottom: 14 },
  logo: { width: 96, objectFit: "contain", marginRight: 12 },
  org: { flex: 1 },
  orgNome: { fontFamily: "Helvetica-Bold", fontSize: 11.5 },
  orgCnpj: { color: "#4b5563", fontSize: 8.5, marginTop: 2 },
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 14, letterSpacing: 0.6, marginBottom: 2 },
  subtitulo: { textAlign: "center", fontSize: 10, color: "#374151", marginBottom: 12 },
  dados: { flexDirection: "row", flexWrap: "wrap", borderWidth: 0.5, borderColor: "#d1d5db", borderRadius: 3, padding: 8, marginBottom: 12 },
  campo: { width: "50%", marginBottom: 4 },
  rotulo: { color: "#6b7280", fontSize: 7.5 },
  valor: { fontSize: 10 },
  corpo: { textAlign: "justify", marginBottom: 10 },
  tabelaCabeca: { flexDirection: "row", backgroundColor: "#f3f4f6", borderBottomWidth: 0.75, borderBottomColor: "#9ca3af", paddingVertical: 4, paddingHorizontal: 4, fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb", paddingVertical: 2.5, paddingHorizontal: 4, fontSize: 9.5, lineHeight: 1.3 },
  colMes: { width: 92 },
  colTipo: { width: 135 },
  colFonte: { flex: 1, paddingRight: 6 },
  colValor: { width: 80, textAlign: "right" },
  vazio: { paddingVertical: 10, textAlign: "center", color: "#6b7280" },
  totais: { marginTop: 10, alignSelf: "flex-end", width: 260 },
  totalLinha: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalAno: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.75, borderTopColor: "#9ca3af", marginTop: 3, paddingTop: 4, fontFamily: "Helvetica-Bold" },
  data: { marginTop: 14, textAlign: "right" },
  nota: { marginTop: 10, fontSize: 8.5, color: "#4b5563", lineHeight: 1.4 },
  rodape: {
    position: "absolute",
    bottom: CM * 0.8,
    left: CM * 1.8,
    right: CM * 1.8,
    borderTopWidth: 0.5,
    borderTopColor: "#dddddd",
    paddingTop: 5,
    fontSize: 7.5,
    color: "#6b7280",
    flexDirection: "row",
    justifyContent: "space-between",
  },
})

export type ExtratoContribuicaoProps = {
  org: { nome: string; cnpjCpf: string | null; cidade: string | null; logoDataUri: string | null }
  pessoa: { nome: string; cpfMascarado: string; matricula: string | null }
  ano: number
  /** Já em texto de leitura: mês MM/AAAA, tipo pelo nome, quem pagou. */
  linhas: { mes: string; tipo: string; fonte: string; valor: number }[]
  porTipo: { tipo: string; valor: number }[]
  total: number
  /** AAAA-MM-DD (fuso de São Paulo). */
  emitidoEm: string
}

export function ExtratoContribuicaoPDF({ org, pessoa, ano, linhas, porTipo, total, emitidoEm }: ExtratoContribuicaoProps) {
  return (
    <Document title={`Extrato de contribuições ${ano} — ${pessoa.nome}`}>
      <Page size="A4" style={s.page}>
        <View style={s.cabecalho} fixed>
          {org.logoDataUri ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={s.logo} src={org.logoDataUri} />
          ) : null}
          <View style={s.org}>
            <Text style={s.orgNome}>{org.nome}</Text>
            {org.cnpjCpf ? <Text style={s.orgCnpj}>CNPJ {org.cnpjCpf}</Text> : null}
          </View>
        </View>

        <Text style={s.titulo}>EXTRATO DE CONTRIBUIÇÕES</Text>
        <Text style={s.subtitulo}>Ano de {ano}</Text>

        <View style={s.dados}>
          <View style={s.campo}>
            <Text style={s.rotulo}>Associado(a)</Text>
            <Text style={s.valor}>{pessoa.nome}</Text>
          </View>
          <View style={s.campo}>
            <Text style={s.rotulo}>CPF</Text>
            <Text style={s.valor}>{pessoa.cpfMascarado}</Text>
          </View>
          <View style={s.campo}>
            <Text style={s.rotulo}>Matrícula sindical</Text>
            <Text style={s.valor}>{pessoa.matricula ?? "—"}</Text>
          </View>
          <View style={s.campo}>
            <Text style={s.rotulo}>Emitido em</Text>
            <Text style={s.valor}>{emitidoEm.split("-").reverse().join("/")}</Text>
          </View>
        </View>

        <Text style={s.corpo}>
          Contribuições registradas por esta entidade em nome do(a) associado(a) acima, com mês de referência em {ano}. Cada mês
          entra no registro quando a empresa envia ao sindicato a relação de descontos daquele mês, ou quando o pagamento direto
          (Pix ou boleto) é reconhecido.
        </Text>

        <View style={s.tabelaCabeca}>
          <Text style={s.colMes}>Mês de referência</Text>
          <Text style={s.colTipo}>Tipo</Text>
          <Text style={s.colFonte}>Fonte pagadora</Text>
          <Text style={s.colValor}>Valor</Text>
        </View>
        {linhas.length === 0 ? (
          <Text style={s.vazio}>Nenhuma contribuição registrada neste ano.</Text>
        ) : (
          linhas.map((l, i) => (
            <View key={`${l.mes}-${l.tipo}-${i}`} style={s.linha} wrap={false}>
              <Text style={s.colMes}>{l.mes}</Text>
              <Text style={s.colTipo}>{l.tipo}</Text>
              <Text style={s.colFonte}>{l.fonte}</Text>
              <Text style={s.colValor}>{formatarMoeda(l.valor)}</Text>
            </View>
          ))
        )}

        <View style={s.totais} wrap={false}>
          {porTipo.length > 1 &&
            porTipo.map((t) => (
              <View key={t.tipo} style={s.totalLinha}>
                <Text>{t.tipo}</Text>
                <Text>{formatarMoeda(t.valor)}</Text>
              </View>
            ))}
          <View style={s.totalAno}>
            <Text>Total de {ano}</Text>
            <Text>{formatarMoeda(total)}</Text>
          </View>
        </View>

        <Text style={s.data}>
          {org.cidade ? `${org.cidade}, ` : ""}
          {extenso(emitidoEm)}
        </Text>

        <Text style={s.nota}>
          Documento emitido eletronicamente pelo(a) próprio(a) associado(a) no portal da entidade. Reflete os registros do sindicato na
          data de emissão: um mês cuja relação de descontos ainda não chegou não aparece aqui. O CPF sai parcialmente oculto para
          proteger os seus dados.
        </Text>

        <View style={s.rodape} fixed>
          <Text>
            Extrato de contribuições {ano} · {pessoa.nome}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
