import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import type { RelatorioDiretoria } from "@/lib/db/relatorio-diretoria"

/** Relatório mensal da diretoria (onda 3, D5): números do mês + texto. */

const CM = 28.35

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
function n(v: number): string {
  return v.toLocaleString("pt-BR")
}

const s = StyleSheet.create({
  page: { padding: CM * 1.5, paddingBottom: CM * 1.8, fontSize: 10.5, fontFamily: "Helvetica", color: "#111827", lineHeight: 1.45 },
  logoBox: { alignItems: "center", marginBottom: 6 },
  logo: { width: 120, objectFit: "contain" },
  org: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 11 },
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 15, marginTop: 10 },
  subtitulo: { textAlign: "center", color: "#4b5563", fontSize: 10, marginBottom: 14 },
  secao: { fontFamily: "Helvetica-Bold", fontSize: 11.5, marginTop: 12, marginBottom: 4, color: "#091747" },
  paragrafo: { textAlign: "justify", marginBottom: 6 },
  grade: { flexDirection: "row", flexWrap: "wrap", marginTop: 2 },
  tile: { width: "25%", paddingRight: 8, marginBottom: 6 },
  tileRotulo: { fontSize: 8.5, color: "#4b5563" },
  tileValor: { fontFamily: "Helvetica-Bold", fontSize: 12.5 },
  tabela: { marginTop: 2 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingVertical: 2 },
  cel: { flex: 1 },
  celNum: { width: 110, textAlign: "right" },
  rodape: { position: "absolute", bottom: CM, left: CM * 1.5, right: CM * 1.5, fontSize: 8, color: "#6b7280", textAlign: "center" },
})

function Tile({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileRotulo}>{rotulo}</Text>
      <Text style={s.tileValor}>{valor}</Text>
    </View>
  )
}

export function RelatorioDiretoriaPDF({ dados, logoDataUri }: { dados: RelatorioDiretoria; logoDataUri: string | null }) {
  const d = dados
  const gerado = new Date(d.geradoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
  return (
    <Document title={`Relatório da diretoria — ${d.mesRotulo}`}>
      <Page size="A4" style={s.page}>
        {logoDataUri ? (
          <View style={s.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logo} src={logoDataUri} />
          </View>
        ) : null}
        <Text style={s.org}>{d.entidade}</Text>
        <Text style={s.titulo}>Relatório da diretoria</Text>
        <Text style={s.subtitulo}>{d.mesRotulo}</Text>

        <Text style={s.secao}>O mês em números</Text>
        <View style={s.grade}>
          {d.filiacao && <Tile rotulo="Filiados ativos (fim do mês)" valor={n(d.filiacao.ativosFim)} />}
          {d.filiacao && <Tile rotulo="Filiações / desfiliações" valor={`${n(d.filiacao.entradas)} / ${n(d.filiacao.saidas)}`} />}
          {d.arrecadacao && <Tile rotulo="Arrecadação" valor={moeda(d.arrecadacao.total)} />}
          {d.arrecadacao && <Tile rotulo="Pagantes" valor={n(d.arrecadacao.pagantes)} />}
          {d.despesa && <Tile rotulo="Despesa paga" valor={moeda(d.despesa.total)} />}
          {d.despesa && <Tile rotulo="Ordens pagas" valor={n(d.despesa.ordens)} />}
          {d.caixa && d.caixa.saldo !== null && <Tile rotulo="Saldo dos caixas" valor={moeda(d.caixa.saldo)} />}
          {d.caixa && <Tile rotulo="Ordens vencidas" valor={`${n(d.caixa.vencidas.q)} · ${moeda(d.caixa.vencidas.v)}`} />}
          {d.caixa && <Tile rotulo="A pagar em 30 dias" valor={`${n(d.caixa.aPagar30d.q)} · ${moeda(d.caixa.aPagar30d.v)}`} />}
          {d.acoes.demandasConcluidas !== null && <Tile rotulo="Demandas concluídas" valor={n(d.acoes.demandasConcluidas)} />}
          {d.acoes.noticias !== null && <Tile rotulo="Notícias publicadas" valor={n(d.acoes.noticias)} />}
        </View>

        <Text style={s.secao}>Análise</Text>
        {d.paragrafos.map((p, i) => (
          <Text key={i} style={s.paragrafo}>
            {p}
          </Text>
        ))}

        {d.arrecadacao && d.arrecadacao.porTipo.length > 0 && (
          <>
            <Text style={s.secao}>Arrecadação por tipo</Text>
            <View style={s.tabela}>
              {d.arrecadacao.porTipo.map((t) => (
                <View key={t.tipo} style={s.linha}>
                  <Text style={s.cel}>{t.tipo}</Text>
                  <Text style={s.celNum}>{n(t.pagantes)} pagantes</Text>
                  <Text style={s.celNum}>{moeda(t.valor)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {d.despesa && d.despesa.porTipo.length > 0 && (
          <>
            <Text style={s.secao}>Despesa paga por tipo de ordem</Text>
            <View style={s.tabela}>
              {d.despesa.porTipo.map((t) => (
                <View key={t.tipo} style={s.linha}>
                  <Text style={s.cel}>{t.tipo}</Text>
                  <Text style={s.celNum}>{moeda(t.valor)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {d.vencidosPorArea.length > 0 && (
          <>
            <Text style={s.secao}>Vencido nas áreas acompanhadas</Text>
            <View style={s.tabela}>
              {d.vencidosPorArea.map((v) => (
                <View key={v.titulo} style={s.linha}>
                  <Text style={s.cel}>{v.titulo}</Text>
                  <Text style={s.celNum}>{n(v.quantidade)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={s.rodape} fixed>
          Gerado pelo Confluir em {gerado}, com os números do sistema.{d.redigidoPorIA ? " Texto redigido com apoio de IA a partir desses números." : ""}
        </Text>
      </Page>
    </Document>
  )
}
