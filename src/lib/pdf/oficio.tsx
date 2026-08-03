import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer"

import type { DadosImpressao } from "@/lib/db/oficios"
import { formatarCnpjCpf } from "@/lib/formato"
import { limparFormatacaoBubble } from "@/lib/oficios-constantes"

/**
 * PDF real do ofício (@react-pdf/renderer), espelhando a folha A4 de
 * `/oficio/[id]`. Renderizado no route handler `/oficio/[id]/pdf`.
 */

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

function dataPorExtenso(iso: string | null): string {
  const base = iso ?? new Date().toISOString().slice(0, 10)
  const [a, m, d] = base.split("-").map(Number)
  return `${d} de ${MESES[(m ?? 1) - 1]} de ${a}`
}

// 1 cm ≈ 28.35 pt
const CM = 28.35

const s = StyleSheet.create({
  page: {
    paddingTop: CM,
    paddingHorizontal: CM,
    paddingBottom: 96, // reserva espaço p/ o rodapé fixo (1 cm da borda + conteúdo)
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#111827",
    // OBS: NÃO usar lineHeight no nível da page — quebra o Text fixed/render da
    // paginação (o page-number some). Aplicado só no corpo abaixo.
  },
  logoBox: { alignItems: "center", marginBottom: 14 },
  logo: { width: 200, objectFit: "contain" },
  data: { textAlign: "right", marginBottom: 10 },
  meta: { lineHeight: 1, marginBottom: 2 },
  metaLabel: { fontFamily: "Helvetica-Bold" },
  saudacao: { marginTop: 24 },
  corpo: { marginVertical: 18, lineHeight: 1.3 },
  lista: { marginVertical: 12, paddingLeft: 4 },
  item: { marginBottom: 2 },
  assinatura: { marginTop: 48, alignItems: "center" },
  assinaturaNome: { fontFamily: "Helvetica-Bold" },
  rodape: {
    position: "absolute",
    bottom: CM + 12,
    left: CM,
    right: CM,
    borderTopWidth: 1,
    borderTopColor: "#dddddd",
    paddingTop: 6,
    fontSize: 8,
    color: "#444444",
  },
  rodapeRazao: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  rodapeSede: { textAlign: "left", lineHeight: 1.15, marginBottom: 0 },
  rodapeSedeNome: { fontFamily: "Helvetica-Bold" },
  rodapePagina: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 8,
    color: "#444444",
  },
})

function Meta({ label, valor }: { label: string; valor: string }) {
  return (
    <Text style={s.meta}>
      <Text style={s.metaLabel}>{label}</Text>: {valor}
    </Text>
  )
}

export function OficioPDF({
  dados,
  logoDataUri,
}: {
  dados: DadosImpressao
  logoDataUri: string | null
}) {
  const { oficio, cidade, organizacao, sedes } = dados
  const numero =
    oficio.numero != null ? `${oficio.numero} / ${oficio.ano}` : "— (rascunho)"
  const destinatario =
    oficio.destinatarioNome ?? oficio.destinatarioTexto ?? "—"
  const remetente = organizacao.nomeFantasia ?? organizacao.nomeRazao ?? "—"
  const corpo = limparFormatacaoBubble(oficio.corpo)

  return (
    <Document title={`Ofício ${numero}`} author={organizacao.nomeRazao ?? ""}>
      <Page size="A4" style={s.page}>
        {logoDataUri ? (
          <View style={s.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logo} src={logoDataUri} />
          </View>
        ) : null}

        <Text style={s.data}>
          {cidade ? `${cidade}, ` : ""}
          {dataPorExtenso(oficio.data)}.
        </Text>

        <Meta label="Número" valor={numero} />
        <Meta label="De" valor={remetente} />
        <Meta label="Para" valor={destinatario} />
        {oficio.aosCuidados ? (
          <Meta label="Aos cuidados" valor={oficio.aosCuidados} />
        ) : null}
        <Meta label="Assunto" valor={oficio.assunto ?? "—"} />

        <Text style={s.saudacao}>{oficio.saudacao ?? "Prezados,"}</Text>

        {corpo ? <Text style={s.corpo}>{corpo}</Text> : null}

        {oficio.filiados.length > 0 && (
          <View style={s.lista}>
            {oficio.filiados.map((f) => (
              <Text key={f.id} style={s.item}>
                {f.nome ?? "—"}
                {f.matricula ? ` (matrícula ${f.matricula})` : ""}
              </Text>
            ))}
          </View>
        )}

        <Text>{oficio.fecho ?? "Cordialmente,"}</Text>

        <View style={s.assinatura}>
          <Text style={s.assinaturaNome}>
            {oficio.assinanteNome ?? "________________________"}
          </Text>
          {oficio.assinanteCargo ? <Text>{oficio.assinanteCargo}</Text> : null}
        </View>

        <View style={s.rodape} fixed>
          <Text style={s.rodapeRazao}>
            {organizacao.nomeRazao ?? ""}
            {organizacao.cnpjCpf
              ? ` — CNPJ: ${formatarCnpjCpf(organizacao.cnpjCpf)}`
              : ""}
          </Text>
          {sedes.map((sede, i) => {
            const partes = [
              sede.linha1,
              sede.cep ? `CEP ${sede.cep}` : null,
              sede.telefones ? `Tel: ${sede.telefones}` : null,
            ]
              .filter(Boolean)
              .join(" — ")
            return (
              <Text key={i} style={s.rodapeSede}>
                {sede.nome ? (
                  <Text style={s.rodapeSedeNome}>{sede.nome}: </Text>
                ) : null}
                {partes}
              </Text>
            )
          })}
        </View>

        <Text
          style={s.rodapePagina}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Página ${pageNumber} de ${totalPages}`
          }
        />
      </Page>
    </Document>
  )
}
