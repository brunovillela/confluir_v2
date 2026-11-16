import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import type { RelatorioPontoFuncionario } from "@/lib/db/ponto-relatorio"
import { hhmm as hhmmTela } from "@/lib/horas"
import { rotuloAteMes, textoVariacao as variacaoTela, variacaoPct } from "@/lib/ponto-comparacao"

/** Relatório do ponto de um funcionário (16/11/2026): anos lado a lado, alertas e mês a mês. */

const CM = 28.35

// A Helvetica do PDF não tem o sinal "−" (U+2212) que a tela usa: hífen.
const hifen = (t: string) => t.replace(/−/g, "-")
const hhmm = (v: number) => hifen(hhmmTela(v))
const textoVariacao = (p: number | null) => hifen(variacaoTela(p))

const s = StyleSheet.create({
  page: { padding: CM * 1.3, paddingBottom: CM * 1.8, fontSize: 9, fontFamily: "Helvetica", color: "#111827", lineHeight: 1.4 },
  logoBox: { alignItems: "center", marginBottom: 4 },
  logo: { width: 100, objectFit: "contain" },
  org: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 14, marginTop: 8 },
  subtitulo: { textAlign: "center", color: "#4b5563", fontSize: 9.5, marginBottom: 10 },
  ficha: { flexDirection: "row", flexWrap: "wrap", borderWidth: 0.5, borderColor: "#d1d5db", padding: 6, marginBottom: 6 },
  fichaItem: { width: "33.3%", marginBottom: 2 },
  fichaRotulo: { fontSize: 7.5, color: "#4b5563" },
  secao: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 10, marginBottom: 4, color: "#091747" },
  subsecao: { fontFamily: "Helvetica-Bold", fontSize: 9.5, marginTop: 6, marginBottom: 2 },
  nota: { fontSize: 8, color: "#4b5563", marginBottom: 4 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingVertical: 1.5 },
  cabeca: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#9ca3af", paddingVertical: 2, fontFamily: "Helvetica-Bold", fontSize: 8 },
  rotulo: { flex: 1 },
  num: { width: 70, textAlign: "right" },
  numEstreito: { width: 48, textAlign: "right" },
  alerta: { marginLeft: 8, marginBottom: 1 },
  rodape: {
    position: "absolute",
    bottom: CM,
    left: CM * 1.3,
    right: CM * 1.3,
    fontSize: 7.5,
    color: "#6b7280",
    flexDirection: "row",
    justifyContent: "space-between",
  },
})

const data = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—")

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={s.fichaItem}>
      <Text style={s.fichaRotulo}>{rotulo}</Text>
      <Text>{valor}</Text>
    </View>
  )
}

export function RelatorioPontoFuncionarioPDF({
  dados,
  entidade,
  logoDataUri,
}: {
  dados: RelatorioPontoFuncionario
  entidade: string
  logoDataUri: string | null
}) {
  const { funcionario: f, faixas, comparacao, anos } = dados
  const colunas = comparacao.anos.slice(0, 5)
  const gerado = new Date(dados.geradoEm).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  })
  const linhasComp: { rotulo: string; valor: (i: number) => string; variacao?: (i: number) => [number, number] }[] = [
    { rotulo: "Meses com registro", valor: (i) => String(colunas[i].meses) },
    { rotulo: "Horas extras no ano", valor: (i) => hhmm(colunas[i].he) },
    {
      rotulo: "Média por mês",
      valor: (i) => hhmm(colunas[i].heMediaMes),
      variacao: (i) => [colunas[i].heMediaMes, colunas[i + 1].heMediaMes],
    },
    { rotulo: `A ${faixas["100"]}`, valor: (i) => hhmm(colunas[i].he100) },
    { rotulo: "Banco de horas no fim", valor: (i) => hhmm(colunas[i].saldo) },
    { rotulo: "Atestados (dias)", valor: (i) => `${colunas[i].atestados} (${colunas[i].diasAtestado})` },
    { rotulo: "Faltas injustificadas", valor: (i) => String(colunas[i].faltasInjustificadas) },
    { rotulo: "Ocorrências nas marcações", valor: (i) => String(colunas[i].ocorrencias) },
    { rotulo: "Alertas", valor: (i) => String(colunas[i].alertas.length) },
  ]
  const mp = comparacao.mesmoPeriodo
  return (
    <Document title={`Relatório do ponto — ${f.nome}`}>
      <Page size="A4" style={s.page}>
        {logoDataUri ? (
          <View style={s.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logo} src={logoDataUri} />
          </View>
        ) : null}
        <Text style={s.org}>{entidade}</Text>
        <Text style={s.titulo}>Relatório do controle de ponto</Text>
        <Text style={s.subtitulo}>{f.nome}</Text>

        <View style={s.ficha}>
          <Item rotulo="Matrícula" valor={f.matricula ?? "—"} />
          <Item rotulo="Cargo" valor={f.cargo ?? "—"} />
          <Item rotulo="Departamento" valor={f.departamento ?? "—"} />
          <Item rotulo="Admissão" valor={data(f.admissao)} />
          <Item rotulo="Desligamento" valor={data(f.demissao)} />
          <Item rotulo="Anos com registro" valor={anos.length ? `${anos[anos.length - 1].ano} a ${anos[0].ano}` : "—"} />
        </View>
        <Text style={s.nota}>
          Horas em horas e minutos (o lançamento guarda decimal). Banco de horas: saldo ao fim do mês.
        </Text>

        {colunas.length > 1 && (
          <>
            <Text style={s.secao}>Comparação entre anos</Text>
            <View style={s.cabeca}>
              <Text style={s.rotulo}>Indicador</Text>
              {colunas.map((a) => (
                <Text key={a.ano} style={s.num}>
                  {a.ano}
                </Text>
              ))}
            </View>
            {linhasComp.map((l) => (
              <View key={l.rotulo} style={s.linha} wrap={false}>
                <Text style={s.rotulo}>{l.rotulo}</Text>
                {colunas.map((a, i) => {
                  const v = l.variacao && colunas[i + 1] ? l.variacao(i) : null
                  return (
                    <Text key={a.ano} style={s.num}>
                      {l.valor(i)}
                      {v ? ` (${textoVariacao(variacaoPct(v[0], v[1]))})` : ""}
                    </Text>
                  )
                })}
              </View>
            ))}
            <Text style={[s.nota, { marginTop: 4 }]}>
              Entre parênteses, a variação da média mensal sobre o ano anterior.
              {mp
                ? ` Mesmo período (${rotuloAteMes(mp.ate)}): ${hhmm(mp.atual.he)} de horas extras em ${mp.atual.ano} contra ${hhmm(mp.anterior.he)} em ${mp.anterior.ano} (${textoVariacao(variacaoPct(mp.atual.he, mp.anterior.he))}).`
                : ""}
            </Text>
          </>
        )}

        {anos.length === 0 && <Text style={s.nota}>Nenhum registro de ponto deste funcionário.</Text>}

        {anos.map((a) => (
          <View key={a.ano}>
            <Text style={s.secao}>{a.ano}</Text>
            {a.alertas.length > 0 ? (
              <>
                <Text style={s.subsecao}>Alertas (regras da CLT e do TST)</Text>
                {a.alertas.map((t) => (
                  <Text key={t} style={s.alerta}>
                    • {t}
                  </Text>
                ))}
              </>
            ) : (
              <Text style={s.nota}>Sem alertas no ano.</Text>
            )}
            <Text style={s.subsecao}>Mês a mês</Text>
            <View style={s.cabeca} wrap={false}>
              <Text style={s.rotulo}>Mês</Text>
              <Text style={s.numEstreito}>HE {faixas["70"]}</Text>
              <Text style={s.numEstreito}>HE {faixas["100"]}</Text>
              <Text style={s.numEstreito}>Pagas</Text>
              <Text style={s.numEstreito}>Banco {faixas["70"]}</Text>
              <Text style={s.numEstreito}>Banco {faixas["100"]}</Text>
              <Text style={s.numEstreito}>Atestados</Text>
              <Text style={s.numEstreito}>Faltas J/I</Text>
              <Text style={s.numEstreito}>Ocorr.</Text>
            </View>
            {a.meses.map((m) => (
              <View key={m.rotulo} style={s.linha} wrap={false}>
                <Text style={s.rotulo}>{m.rotulo}</Text>
                <Text style={s.numEstreito}>{hhmm(m.he70)}</Text>
                <Text style={s.numEstreito}>{hhmm(m.he100)}</Text>
                <Text style={s.numEstreito}>{hhmm(m.pagas)}</Text>
                <Text style={s.numEstreito}>{hhmm(m.saldo70)}</Text>
                <Text style={s.numEstreito}>{hhmm(m.saldo100)}</Text>
                <Text style={s.numEstreito}>{m.atestados ? `${m.atestados} (${m.diasAtestado}d)` : "—"}</Text>
                <Text style={s.numEstreito}>
                  {m.faltasJustificadas || m.faltasInjustificadas ? `${m.faltasJustificadas}/${m.faltasInjustificadas}` : "—"}
                </Text>
                <Text style={s.numEstreito}>{m.ocorrencias === null ? "n/l" : String(m.ocorrencias)}</Text>
              </View>
            ))}
          </View>
        ))}
        {anos.length > 0 && (
          <Text style={[s.nota, { marginTop: 4 }]}>
            Faltas J/I: justificadas autorizadas / injustificadas. Ocorr.: ocorrências de jornada nas marcações do
            espelho; n/l = marcações não lidas (sem espelho, escaneado ou erro na leitura).
          </Text>
        )}

        {dados.isencoes.length > 0 && (
          <>
            <Text style={s.secao}>Isenções de registro de ponto</Text>
            {dados.isencoes.map((i) => (
              <View key={i.id} style={s.linha} wrap={false}>
                <Text style={{ width: 130 }}>
                  {data(i.inicio)} a {i.fim ? data(i.fim) : "sem prazo"}
                </Text>
                <Text style={s.rotulo}>
                  {i.justificativa}
                  {i.encerradoEm ? ` (encerrada em ${data(i.encerradoEm)})` : ""}
                </Text>
              </View>
            ))}
          </>
        )}

        <View style={s.rodape} fixed>
          <Text>Gerado pelo Confluir em {gerado}. Documento interno do departamento de pessoal.</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
