import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import { formatarCnpjCpf, formatarDataHora } from "@/lib/formato"
import { caber } from "@/lib/pdf/medida-texto"

/**
 * Relação dos aptos a votar na rodada (09/11/2026), com os filtros da aba
 * Aptos. Renderizada em `/painel/representacao/votacoes/rodadas/[id]/aptos/pdf`.
 * O mesmo desenho da relação de votantes da apuração.
 */

export type LinhaRelacaoAptos = {
  nome: string | null
  cpf: string | null
  matricula: string | null
  /** Quando votou (ISO); null = não votou. */
  votouEm: string | null
  /** online | urna_digital | urna_fisica. */
  canal: string | null
}

const CM = 28.35
const LETRA = 9
const COL = { num: 28, cpf: 78, mat: 72, quando: 84, canal: 58 }

const s = StyleSheet.create({
  conteudo: { lineHeight: 1.4 },
  page: { padding: CM * 1.5, paddingBottom: CM * 1.8, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  logoBox: { alignItems: "center", marginBottom: 6 },
  logo: { width: 110, objectFit: "contain" },
  org: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 11 },
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 15, marginTop: 8 },
  subtitulo: { textAlign: "center", color: "#4b5563", fontSize: 10, marginTop: 4, marginBottom: 10 },
  grade: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  tile: { width: "25%", paddingRight: 8, marginBottom: 6 },
  rotulo: { fontSize: 8.5, color: "#4b5563" },
  tileValor: { fontFamily: "Helvetica-Bold", fontSize: 13 },
  filtro: { fontSize: 9, color: "#374151", marginBottom: 8 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingVertical: 2.5, fontSize: LETRA },
  cabecalho: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#111827", paddingVertical: 2.5, fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  num: { width: COL.num, paddingRight: 4, textAlign: "right", color: "#6b7280" },
  nome: { flex: 1, paddingLeft: 2, paddingRight: 6 },
  cpf: { width: COL.cpf, paddingRight: 4 },
  mat: { width: COL.mat, paddingRight: 4 },
  quando: { width: COL.quando, paddingRight: 4 },
  canal: { width: COL.canal },
  nota: { fontSize: 8.5, color: "#4b5563", marginTop: 6 },
  rodape: { position: "absolute", bottom: CM, left: CM * 1.5, right: CM * 1.5, fontSize: 8, color: "#6b7280", flexDirection: "row", justifyContent: "space-between" },
})

function n(v: number): string {
  return v.toLocaleString("pt-BR")
}

export function RelacaoAptosPDF({
  entidade,
  logoDataUri,
  campanha,
  rodada,
  fonte,
  filtro,
  totais,
  linhas,
}: {
  entidade: string | null
  logoDataUri: string | null
  campanha: string | null
  rodada: string | null
  fonte: string | null
  /** O filtro aplicado, em palavras ("Todos os aptos", "Não votaram", …). */
  filtro: string
  totais: { listados: number; votaram: number; naoVotaram: number }
  linhas: LinhaRelacaoAptos[]
}) {
  const gerado = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
  return (
    <Document title={`Relação de aptos — ${rodada ?? "rodada"}`}>
      <Page size="A4" style={s.page}>
        <View style={s.conteudo}>
          {logoDataUri ? (
            <View style={s.logoBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image style={s.logo} src={logoDataUri} />
            </View>
          ) : null}
          {entidade ? <Text style={s.org}>{entidade}</Text> : null}
          <Text style={s.titulo}>Relação dos aptos a votar</Text>
          <Text style={s.subtitulo}>{[campanha, rodada, fonte].filter(Boolean).join(" · ")}</Text>

          <View style={s.grade}>
            <View style={s.tile}>
              <Text style={s.rotulo}>Na relação</Text>
              <Text style={s.tileValor}>{n(totais.listados)}</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.rotulo}>Votaram</Text>
              <Text style={s.tileValor}>{n(totais.votaram)}</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.rotulo}>Não votaram</Text>
              <Text style={s.tileValor}>{n(totais.naoVotaram)}</Text>
            </View>
          </View>
          <Text style={s.filtro}>Filtro: {filtro}</Text>

          <View style={s.cabecalho}>
            <Text style={s.num}>#</Text>
            <Text style={s.nome}>Nome</Text>
            <Text style={s.cpf}>CPF</Text>
            <Text style={s.mat}>Matrícula</Text>
            <Text style={s.quando}>Votou em</Text>
            <Text style={s.canal}>Canal</Text>
          </View>
          {linhas.map((l, i) => (
            <View key={i} style={s.linha} wrap={false}>
              <Text style={s.num}>{i + 1}</Text>
              {/* Nome quebra entre palavras, sem hifenizar. */}
              <Text style={s.nome} hyphenationCallback={(palavra) => [palavra]}>
                {l.nome ?? "—"}
              </Text>
              <Text style={s.cpf}>{l.cpf ? formatarCnpjCpf(l.cpf) : "—"}</Text>
              <Text style={s.mat}>{caber(l.matricula, COL.mat - 4, LETRA)}</Text>
              <Text style={s.quando}>{l.votouEm ? formatarDataHora(l.votouEm) : "Não votou"}</Text>
              <Text style={s.canal}>{l.canal ? (ROTULO_CANAL_CURTO[l.canal] ?? l.canal) : "—"}</Text>
            </View>
          ))}
          {linhas.length === 0 ? <Text style={s.nota}>Nenhum apto com este filtro.</Text> : null}
          <Text style={s.nota}>
            A relação registra a participação (se votou, quando e por qual canal), nunca o conteúdo do voto, que é
            secreto.
          </Text>
        </View>

        <View style={s.rodape} fixed>
          <Text>Gerado pelo Confluir em {gerado}.</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export const ROTULO_CANAL_CURTO: Record<string, string> = {
  online: "online",
  urna_digital: "urna digital",
  urna_fisica: "urna física",
}
