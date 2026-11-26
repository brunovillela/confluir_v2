import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import { formatarTelefone } from "@/lib/formato"
import { caber } from "@/lib/pdf/medida-texto"

/**
 * Relação de confirmados de um evento (19/11/2026), para quem não acessa o
 * Confluir: portaria, hotel, buffet, credenciamento. Renderizada em
 * `/painel/eventos/[id]/confirmados/pdf`. Com `assinatura`, ganha a coluna
 * para colher a assinatura na porta. O desenho é o da relação de aptos. O CPF
 * chega pronto (completo ou parcial); o recorte sai no subtítulo.
 */

export type LinhaRelacaoConfirmados = {
  nome: string | null
  /** Já formatado: completo ou parcial (***.456.789-**). */
  cpf: string | null
  telefone: string | null
  filiado: boolean
  convidado: boolean
  /** Está na lista de espera, não confirmada. */
  espera: boolean
  /** Em quantos dias do evento a porta registrou a presença. */
  diasPresente: number
}

const CM = 28.35
const LETRA = 9
const COL = { num: 28, cpf: 80, tel: 82, tipo: 62, dias: 44, assinatura: 150 }

const s = StyleSheet.create({
  conteudo: { lineHeight: 1.4 },
  page: { padding: CM * 1.5, paddingBottom: CM * 1.8, fontSize: 10, fontFamily: "Helvetica", color: "#111827" },
  logoBox: { alignItems: "center", marginBottom: 6 },
  logo: { width: 110, objectFit: "contain" },
  org: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 11 },
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 15, marginTop: 8 },
  subtitulo: { textAlign: "center", color: "#4b5563", fontSize: 10, marginTop: 4, marginBottom: 10 },
  grade: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  tile: { width: "25%", paddingRight: 8, marginBottom: 6 },
  rotulo: { fontSize: 8.5, color: "#4b5563" },
  tileValor: { fontFamily: "Helvetica-Bold", fontSize: 13 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingVertical: 2.5, fontSize: LETRA },
  linhaAssinatura: { flexDirection: "row", alignItems: "flex-end", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingTop: 10, paddingBottom: 3, fontSize: LETRA },
  cabecalho: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#111827", paddingVertical: 2.5, fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  num: { width: COL.num, paddingRight: 4, textAlign: "right", color: "#6b7280" },
  nome: { flex: 1, paddingLeft: 2, paddingRight: 6 },
  cpf: { width: COL.cpf, paddingRight: 4 },
  tel: { width: COL.tel, paddingRight: 4 },
  tipo: { width: COL.tipo, paddingRight: 4 },
  dias: { width: COL.dias, paddingRight: 4, textAlign: "right" },
  assinatura: { width: COL.assinatura, borderBottomWidth: 0.5, borderColor: "#6b7280", marginLeft: 4 },
  assinaturaTitulo: { width: COL.assinatura, marginLeft: 4 },
  espera: { color: "#b45309", fontSize: 8 },
  recorte: { fontSize: 9, color: "#374151", marginBottom: 8 },
  nota: { fontSize: 8.5, color: "#4b5563", marginTop: 6 },
  rodape: { position: "absolute", bottom: CM, left: CM * 1.5, right: CM * 1.5, fontSize: 8, color: "#6b7280", flexDirection: "row", justifyContent: "space-between" },
})

function n(v: number): string {
  return v.toLocaleString("pt-BR")
}

function tipo(l: LinhaRelacaoConfirmados): string {
  if (l.convidado) return "Convidado"
  if (l.filiado) return "Filiado"
  return "—"
}

export function RelacaoConfirmadosPDF({
  entidade,
  logoDataUri,
  evento,
  quando,
  assinatura,
  telefone,
  recorte,
  titulo,
  totalDias,
  linhas,
}: {
  entidade: string | null
  logoDataUri: string | null
  evento: string
  /** Data, horário e local, já em texto. */
  quando: string
  assinatura: boolean
  /** Mostra a coluna de telefone (fora da lista de assinatura e com contato ligado). */
  telefone: boolean
  /** O recorte em palavras ("confirmados · só filiados · CPF parcial"). */
  recorte: string
  /** Título do documento; o padrão segue o formato (relação ou lista de presença). */
  titulo?: string
  /** Com mais de um dia, a coluna "Dias" mostra em quantos a pessoa esteve. */
  totalDias?: number
  linhas: LinhaRelacaoConfirmados[]
}) {
  const gerado = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
  const filiados = linhas.filter((l) => l.filiado && !l.espera).length
  const convidados = linhas.filter((l) => l.convidado && !l.espera).length
  const emEspera = linhas.filter((l) => l.espera).length
  const colTelefone = telefone && !assinatura
  const colDias = (totalDias ?? 0) > 1
  return (
    <Document title={`Confirmados — ${evento}`}>
      <Page size="A4" style={s.page}>
        <View style={s.conteudo}>
          {logoDataUri ? (
            <View style={s.logoBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image style={s.logo} src={logoDataUri} />
            </View>
          ) : null}
          {entidade ? <Text style={s.org}>{entidade}</Text> : null}
          <Text style={s.titulo}>{titulo ?? (assinatura ? "Lista de presença" : "Relação de confirmados")}</Text>
          <Text style={s.subtitulo}>{[evento, quando].filter(Boolean).join(" · ")}</Text>

          <View style={s.grade}>
            <View style={s.tile}>
              {/* No recorte de presença entra gente de qualquer situação: conta todos. */}
              <Text style={s.rotulo}>{titulo ? "Na relação" : "Confirmados"}</Text>
              <Text style={s.tileValor}>{n(titulo ? linhas.length : linhas.length - emEspera)}</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.rotulo}>Filiados</Text>
              <Text style={s.tileValor}>{n(filiados)}</Text>
            </View>
            <View style={s.tile}>
              <Text style={s.rotulo}>Convidados</Text>
              <Text style={s.tileValor}>{n(convidados)}</Text>
            </View>
            {emEspera > 0 ? (
              <View style={s.tile}>
                <Text style={s.rotulo}>Lista de espera</Text>
                <Text style={s.tileValor}>{n(emEspera)}</Text>
              </View>
            ) : null}
          </View>
          <Text style={s.recorte}>Recorte: {recorte}</Text>

          <View style={s.cabecalho}>
            <Text style={s.num}>#</Text>
            <Text style={s.nome}>Nome</Text>
            <Text style={s.cpf}>CPF</Text>
            {colTelefone ? <Text style={s.tel}>Telefone</Text> : null}
            <Text style={s.tipo}>Tipo</Text>
            {colDias ? <Text style={s.dias}>Dias</Text> : null}
            {assinatura ? <Text style={s.assinaturaTitulo}>Assinatura</Text> : null}
          </View>
          {linhas.map((l, i) => (
            <View key={i} style={assinatura ? s.linhaAssinatura : s.linha} wrap={false}>
              <Text style={s.num}>{i + 1}</Text>
              {/* Nome quebra entre palavras, sem hifenizar. */}
              <Text style={s.nome} hyphenationCallback={(palavra) => [palavra]}>
                {l.nome ?? "—"}
                {l.espera ? <Text style={s.espera}>  (lista de espera)</Text> : null}
              </Text>
              <Text style={s.cpf}>{l.cpf ?? "—"}</Text>
              {colTelefone ? <Text style={s.tel}>{caber(l.telefone ? formatarTelefone(l.telefone) : "—", COL.tel - 4, LETRA)}</Text> : null}
              <Text style={s.tipo}>{tipo(l)}</Text>
              {colDias ? <Text style={s.dias}>{`${l.diasPresente} de ${totalDias}`}</Text> : null}
              {assinatura ? <View style={s.assinatura} /> : null}
            </View>
          ))}
          {linhas.length === 0 ? <Text style={s.nota}>Ninguém neste recorte.</Text> : null}
        </View>

        <View style={s.rodape} fixed>
          <Text>Gerado pelo Confluir em {gerado}.</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
