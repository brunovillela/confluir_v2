import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import type { FaixasHE } from "@/lib/faixas-he"
import { motivoAcerto } from "@/lib/ponto-acertos"
import { custoMedioHora, hh, rotuloMesCurto, ROTULO_DIVERGENCIA, type RelatorioGeral, type TipoDivergencia } from "@/lib/ponto-relatorio-geral"

/**
 * Relatório consolidado do ponto e das horas extras em PDF (Ponto, Fase 3 —
 * 28/11/2026): resumo, mês a mês, por funcionário, acertos do banco e
 * divergências. Paisagem, para caber as duas faixas.
 */

const CM = 28.35

const s = StyleSheet.create({
  page: { padding: CM * 1.2, paddingBottom: CM * 1.8, fontSize: 8.5, fontFamily: "Helvetica", color: "#111827", lineHeight: 1.35 },
  logoBox: { alignItems: "center", marginBottom: 4 },
  logo: { width: 90, objectFit: "contain" },
  org: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 14, marginTop: 6 },
  subtitulo: { textAlign: "center", color: "#4b5563", fontSize: 9.5, marginTop: 4, marginBottom: 8 },
  resumo: { flexDirection: "row", borderWidth: 0.5, borderColor: "#d1d5db", padding: 6, marginBottom: 4 },
  resumoItem: { flex: 1, marginBottom: 2, paddingRight: 6 },
  resumoRotulo: { fontSize: 7.5, color: "#4b5563" },
  resumoValor: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  secao: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 10, marginBottom: 4, color: "#091747" },
  subsecao: { fontFamily: "Helvetica-Bold", fontSize: 9, marginTop: 5, marginBottom: 2 },
  nota: { fontSize: 7.5, color: "#4b5563", marginBottom: 3 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingVertical: 1.5 },
  cabeca: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#9ca3af", paddingVertical: 2, fontFamily: "Helvetica-Bold", fontSize: 7.5 },
  rotulo: { flex: 1 },
  num: { width: 58, textAlign: "right" },
  rodape: {
    position: "absolute",
    bottom: CM,
    left: CM * 1.2,
    right: CM * 1.2,
    fontSize: 7.5,
    color: "#6b7280",
    flexDirection: "row",
    justifyContent: "space-between",
  },
})

const r$ = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// A Helvetica do PDF não tem o sinal "−": hífen.
const t = (x: string) => x.replace(/−/g, "-")

function Resumo({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <View style={s.resumoItem}>
      <Text style={s.resumoRotulo}>{rotulo}</Text>
      <Text style={s.resumoValor}>{valor}</Text>
      {nota ? <Text style={s.resumoRotulo}>{nota}</Text> : null}
    </View>
  )
}

export function RelatorioPontoGeralPDF({
  relatorio,
  faixas,
  recorte,
  entidade,
  logoDataUri,
  geradoEm,
}: {
  relatorio: RelatorioGeral
  faixas: FaixasHE
  /** "Todos os departamentos", o departamento ou a pessoa. */
  recorte: string
  entidade: string
  logoDataUri: string | null
  geradoEm: string
}) {
  const { filtro, totais, meses, pessoas, divergencias, usaValor } = relatorio
  const f1 = faixas["70"]
  const f2 = faixas["100"]
  const custo1 = custoMedioHora(totais, "f1")
  const custo2 = custoMedioHora(totais, "f2")
  const gerado = new Date(geradoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
  const comAcerto = pessoas.filter((p) => p.acertos.length)
  const porTipo = new Map<TipoDivergencia, typeof divergencias>()
  for (const d of divergencias) (porTipo.get(d.tipo) ?? porTipo.set(d.tipo, []).get(d.tipo)!).push(d)

  return (
    <Document title={`Relatório do ponto — ${rotuloMesCurto(filtro.de)} a ${rotuloMesCurto(filtro.ate)}`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        {logoDataUri ? (
          <View style={s.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logo} src={logoDataUri} />
          </View>
        ) : null}
        <Text style={s.org}>{entidade}</Text>
        <Text style={s.titulo}>Relatório do ponto e das horas extras</Text>
        <Text style={s.subtitulo}>
          {rotuloMesCurto(filtro.de)} a {rotuloMesCurto(filtro.ate)} · {recorte} · {totais.pessoas} pessoa(s), {totais.registros} registro(s)
        </Text>

        <View style={s.resumo}>
          <Resumo rotulo="Horas extras realizadas" valor={hh(totais.realizadas.f1 + totais.realizadas.f2)} nota={`${hh(totais.realizadas.f1)} a ${f1} · ${hh(totais.realizadas.f2)} a ${f2}`} />
          <Resumo rotulo="Horas pagas" valor={hh(totais.pagas.f1 + totais.pagas.f2)} nota={`${hh(totais.pagas.f1)} a ${f1} · ${hh(totais.pagas.f2)} a ${f2}`} />
          <Resumo
            rotulo="Valor pago"
            valor={usaValor ? r$(totais.valor.f1 + totais.valor.f2) : "—"}
            nota={usaValor ? [custo1 !== null && `${r$(custo1)}/h a ${f1}`, custo2 !== null && `${r$(custo2)}/h a ${f2}`].filter(Boolean).join(" · ") : "não informado"}
          />
          <Resumo rotulo="Banco no fim do período" valor={hh(totais.saldoFinal.f1 + totais.saldoFinal.f2)} nota={`${hh(totais.saldoFinal.f1)} a ${f1} · ${hh(totais.saldoFinal.f2)} a ${f2}`} />
          <Resumo
            rotulo="Zerado em acertos"
            valor={hh(totais.acertos.positivo)}
            nota={`${hh(totais.acertos.pagoEmFolha)} pagas em folha · ${hh(totais.acertos.negativo)} negativas descontadas`}
          />
        </View>
        <Text style={s.nota}>
          Horas em horas e minutos. Banco: saldo ao fim do mês (no fim do período, já descontados os acertos). Valor pago:
          lido do contracheque; o custo médio da hora considera só as horas com valor informado.
          {divergencias.length ? ` ${divergencias.length} divergência(s) listada(s) no fim.` : " Nenhuma divergência."}
        </Text>

        <Text style={s.secao} minPresenceAhead={60}>Mês a mês</Text>
        <View style={s.cabeca} wrap={false}>
          <Text style={s.rotulo}>Mês</Text>
          <Text style={s.num}>Registros</Text>
          <Text style={s.num}>Realiz. {f1}</Text>
          <Text style={s.num}>Realiz. {f2}</Text>
          <Text style={s.num}>Pagas {f1}</Text>
          <Text style={s.num}>Pagas {f2}</Text>
          {usaValor ? <Text style={[s.num, { width: 75 }]}>Valor pago</Text> : null}
          <Text style={s.num}>Banco {f1}</Text>
          <Text style={s.num}>Banco {f2}</Text>
          <Text style={s.num}>Zerado</Text>
        </View>
        {meses.map((m) => (
          <View key={m.competencia} style={s.linha} wrap={false}>
            <Text style={s.rotulo}>{rotuloMesCurto(m.competencia)}</Text>
            <Text style={s.num}>{m.registros}</Text>
            <Text style={s.num}>{hh(m.realizadas.f1)}</Text>
            <Text style={s.num}>{hh(m.realizadas.f2)}</Text>
            <Text style={s.num}>{hh(m.pagas.f1)}</Text>
            <Text style={s.num}>{hh(m.pagas.f2)}</Text>
            {usaValor ? <Text style={[s.num, { width: 75 }]}>{m.valor.f1 + m.valor.f2 ? r$(m.valor.f1 + m.valor.f2) : "—"}</Text> : null}
            <Text style={s.num}>{hh(m.saldo.f1)}</Text>
            <Text style={s.num}>{hh(m.saldo.f2)}</Text>
            <Text style={s.num}>{m.zerado.positivo || m.zerado.negativo ? `${hh(m.zerado.positivo)}${m.zerado.negativo ? ` · -${hh(m.zerado.negativo)}` : ""}` : "—"}</Text>
          </View>
        ))}

        <Text style={s.secao} minPresenceAhead={60}>Por funcionário</Text>
        <View style={s.cabeca} wrap={false}>
          <Text style={s.rotulo}>Funcionário</Text>
          <Text style={s.num}>Meses</Text>
          <Text style={s.num}>Realiz. {f1}</Text>
          <Text style={s.num}>Realiz. {f2}</Text>
          <Text style={s.num}>Pagas {f1}</Text>
          <Text style={s.num}>Pagas {f2}</Text>
          {usaValor ? <Text style={[s.num, { width: 75 }]}>Valor pago</Text> : null}
          {usaValor ? <Text style={s.num}>R$/h {f1}</Text> : null}
          <Text style={s.num}>Banco {f1}</Text>
          <Text style={s.num}>Banco {f2}</Text>
          <Text style={s.num}>Diverg.</Text>
        </View>
        {pessoas.map((p) => (
          <View key={p.funcionarioId} style={s.linha} wrap={false}>
            <Text style={s.rotulo}>
              {p.nome} <Text style={{ color: "#6b7280" }}>· {p.departamento}</Text>
            </Text>
            <Text style={s.num}>{p.meses}</Text>
            <Text style={s.num}>{hh(p.realizadas.f1)}</Text>
            <Text style={s.num}>{hh(p.realizadas.f2)}</Text>
            <Text style={s.num}>{hh(p.pagas.f1)}</Text>
            <Text style={s.num}>{hh(p.pagas.f2)}</Text>
            {usaValor ? <Text style={[s.num, { width: 75 }]}>{p.valor.f1 + p.valor.f2 ? r$(p.valor.f1 + p.valor.f2) : "—"}</Text> : null}
            {usaValor ? <Text style={s.num}>{p.valorHora.f1 !== null ? r$(p.valorHora.f1) : "—"}</Text> : null}
            <Text style={s.num}>{hh(p.saldoFinal.f1)}</Text>
            <Text style={s.num}>{hh(p.saldoFinal.f2)}</Text>
            <Text style={s.num}>{p.divergencias || "—"}</Text>
          </View>
        ))}

        {comAcerto.length > 0 && (
          <>
            <Text style={s.secao} minPresenceAhead={60}>Acertos do banco de horas</Text>
            <Text style={s.nota}>
              Saldo zerado em cada acerto. Horas negativas são descontadas em folha; positivas vão à folha com o motivo
              pago ou rescisão.
            </Text>
            <View style={s.cabeca} wrap={false}>
              <Text style={s.rotulo}>Funcionário</Text>
              <Text style={s.num}>Mês</Text>
              <Text style={[s.num, { width: 90 }]}>Motivo</Text>
              <Text style={s.num}>Zerado {f1}</Text>
              <Text style={s.num}>Zerado {f2}</Text>
            </View>
            {comAcerto.flatMap((p) =>
              p.acertos.map((a) => (
                <View key={`${p.funcionarioId}-${a.acertoId}`} style={s.linha} wrap={false}>
                  <Text style={s.rotulo}>{p.nome}</Text>
                  <Text style={s.num}>{rotuloMesCurto(a.competencia)}</Text>
                  <Text style={[s.num, { width: 90 }]}>{motivoAcerto(a.motivo)?.rotulo ?? a.motivo}</Text>
                  <Text style={s.num}>{a.saldo70 === null ? "—" : hh(a.saldo70)}</Text>
                  <Text style={s.num}>{a.saldo100 === null ? "—" : hh(a.saldo100)}</Text>
                </View>
              ))
            )}
          </>
        )}

        {divergencias.length > 0 && (
          <>
            <Text style={s.secao} minPresenceAhead={60}>Divergências</Text>
            {[...porTipo].map(([tipo, lista]) => (
              <View key={tipo}>
                <Text style={s.subsecao} minPresenceAhead={40}>
                  {ROTULO_DIVERGENCIA[tipo].rotulo} ({lista.length})
                </Text>
                <Text style={s.nota}>{t(ROTULO_DIVERGENCIA[tipo].explicacao)}</Text>
                {lista.map((d, i) => (
                  <View key={i} style={s.linha} wrap={false}>
                    <Text style={{ width: 200 }}>
                      {d.nome} · {rotuloMesCurto(d.competencia)}
                    </Text>
                    <Text style={s.rotulo}>{t(d.texto)}</Text>
                  </View>
                ))}
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
