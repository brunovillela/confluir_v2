import {
  Document,
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer"

import type { DadosImpressao } from "@/lib/db/oficios"
import { formatarCnpjCpf } from "@/lib/formato"
import { lerCorpo, linkSeguro, marcadoresDaLista, type Trecho } from "@/lib/oficio-formatacao"

/**
 * PDF real do ofício (@react-pdf/renderer), espelhando a folha A4 de
 * `/oficio/[id]`. Renderizado no route handler `/oficio/[id]/pdf`.
 *
 * Com assinatura eletrônica (lib/db/oficios-assinatura.ts): pendente mostra
 * "Aguardando assinatura eletrônica" sob o nome; assinado leva o QR Code de
 * verificação no cabeçalho, o carimbo com data, hora e certificado sob a
 * assinatura e uma página final "Certificado de assinatura" com a trilha.
 */

export type AssinaturaPDF = {
  situacao: "pendente" | "assinado" | "recusado" | "cancelado"
  nome: string | null
  cargo: string | null
  /** Destino do convite e do código, mascarado (e-mail ou Telegram). */
  destino: string
  /** Como a identidade foi comprovada, para a linha "Autenticação". */
  autenticacao: string
  certificado: string | null
  hash: string | null
  /** Já formatado no fuso de Brasília ("15/09/2026 às 14:32:10"). */
  assinadoEm: string | null
  ip: string | null
  navegador: string | null
  urlVerificacao: string
  qrDataUri: string | null
  trilha: { quando: string; evento: string; detalhe: string | null; ip: string | null }[]
}

/**
 * Ofício cancelado: tarja "CANCELADO" em todas as páginas, aviso no alto e,
 * se assinado, seção no certificado. Só no PDF gerado na hora — o assinado
 * guardado no bucket não muda. `em` já vem formatado no fuso de Brasília;
 * nulo nos cancelados antes do registro da data.
 */
export type CancelamentoPDF = { em: string | null; motivo: string | null }

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
  corpo: { marginVertical: 18 },
  paragrafo: { lineHeight: 1.3 },
  titulo: { lineHeight: 1.3, fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 4, marginBottom: 2 },
  listaCorpo: { marginVertical: 3 },
  itemCorpo: { flexDirection: "row", alignItems: "flex-start" },
  marcador: { width: 18, textAlign: "right", marginRight: 5, lineHeight: 1.3 },
  itemTexto: { flex: 1, lineHeight: 1.3 },
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
  cabecalho: { flexDirection: "row", alignItems: "flex-start" },
  cabecalhoTexto: { flex: 1 },
  qrBox: { width: 84, marginLeft: 12, alignItems: "center" },
  qr: { width: 70, height: 70 },
  qrLegenda: { fontSize: 6, color: "#555555", textAlign: "center", marginTop: 2 },
  carimbo: {
    marginTop: 6,
    paddingTop: 4,
    paddingHorizontal: 10,
    borderTopWidth: 0.5,
    borderTopColor: "#bbbbbb",
    fontSize: 7.5,
    color: "#444444",
    textAlign: "center",
    lineHeight: 1.35,
  },
  carimboPendente: { marginTop: 6, fontSize: 8, color: "#9a6d00", textAlign: "center" },
  certTitulo: { fontFamily: "Helvetica-Bold", fontSize: 14, marginBottom: 4 },
  certSub: { fontSize: 9, color: "#555555", marginBottom: 16, lineHeight: 1.35 },
  certSecao: { fontFamily: "Helvetica-Bold", fontSize: 10, marginTop: 14, marginBottom: 6 },
  certLinha: { flexDirection: "row", fontSize: 9, marginBottom: 3 },
  certRotulo: { width: 120, color: "#555555" },
  certValor: { flex: 1 },
  certMono: { flex: 1, fontFamily: "Courier", fontSize: 8 },
  trilhaLinha: { flexDirection: "row", fontSize: 8.5, paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
  trilhaQuando: { width: 110, color: "#555555" },
  trilhaEvento: { width: 170 },
  trilhaDetalhe: { flex: 1, color: "#444444" },
  certNota: { marginTop: 18, fontSize: 7.5, color: "#555555", lineHeight: 1.4 },
  tarja: {
    position: "absolute",
    top: 370,
    left: -150,
    right: -150,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 84,
    color: "#dc2626",
    opacity: 0.16,
    transform: "rotate(-35deg)",
  },
  avisoCancelado: {
    borderWidth: 1.5,
    borderColor: "#dc2626",
    backgroundColor: "#fef2f2",
    color: "#991b1b",
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 14,
    fontSize: 9,
    lineHeight: 1.35,
  },
  avisoCanceladoTitulo: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
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

// ── Corpo formatado (lib/oficio-formatacao.ts) ──────────────────────────────

const RECUO_PT = 28

function fonte(t: Trecho): string {
  if (t.b && t.i) return "Helvetica-BoldOblique"
  if (t.b) return "Helvetica-Bold"
  if (t.i) return "Helvetica-Oblique"
  return "Helvetica"
}

function TrechosPDF({ trechos }: { trechos: Trecho[] }) {
  return (
    <>
      {trechos.map((t, i) => {
        const decoracao = [t.u ? "underline" : "", t.s ? "line-through" : ""].filter(Boolean).join(" ")
        const estilo = {
          fontFamily: fonte(t),
          ...(decoracao ? { textDecoration: decoracao as "underline" } : {}),
        }
        // Tabulação do legado vira espaços (a fonte do PDF não tem o caractere).
        const texto = t.texto.replace(/\t/g, "    ")
        const link = linkSeguro(t.link)
        return link ? (
          <Link key={i} src={link} style={{ ...estilo, color: "#1d4ed8" }}>
            {texto}
          </Link>
        ) : (
          <Text key={i} style={estilo}>
            {texto}
          </Text>
        )
      })}
    </>
  )
}

function CorpoPDF({ corpo }: { corpo: string | null }) {
  const blocos = lerCorpo(corpo)
  if (!blocos.length) return null
  return (
    <View style={s.corpo}>
      {blocos.map((b, i) => {
        if (b.tipo === "lista") {
          const marcadores = marcadoresDaLista(b)
          return (
            <View key={i} style={s.listaCorpo}>
              {b.itens.map((it, j) => (
                <View key={j} style={[s.itemCorpo, { paddingLeft: 10 + it.nivel * 18 }]}>
                  <Text style={s.marcador}>{marcadores[j]}</Text>
                  <Text style={s.itemTexto}>
                    <TrechosPDF trechos={it.trechos} />
                  </Text>
                </View>
              ))}
            </View>
          )
        }
        if (b.tipo === "titulo") {
          return (
            <Text key={i} style={[s.titulo, b.alinhamento ? { textAlign: b.alinhamento } : {}]}>
              <TrechosPDF trechos={b.trechos.map((t) => ({ ...t, b: true }))} />
            </Text>
          )
        }
        return (
          <Text
            key={i}
            style={[
              s.paragrafo,
              b.alinhamento ? { textAlign: b.alinhamento } : {},
              b.recuo ? { marginLeft: b.recuo * RECUO_PT } : {},
            ]}
          >
            {b.trechos.length ? <TrechosPDF trechos={b.trechos} /> : " "}
          </Text>
        )
      })}
    </View>
  )
}

function Meta({ label, valor }: { label: string; valor: string }) {
  return (
    <Text style={s.meta}>
      <Text style={s.metaLabel}>{label}</Text>: {valor}
    </Text>
  )
}

function LinhaCert({ rotulo, valor, mono }: { rotulo: string; valor: string | null; mono?: boolean }) {
  return (
    <View style={s.certLinha}>
      <Text style={s.certRotulo}>{rotulo}</Text>
      <Text style={mono ? s.certMono : s.certValor}>{valor ?? "—"}</Text>
    </View>
  )
}

/** Tarja diagonal repetida em todas as páginas (fixed). */
function TarjaCancelado() {
  return (
    <Text style={s.tarja} fixed>
      CANCELADO
    </Text>
  )
}

function AvisoCancelado({
  cancelamento,
  assinado,
  urlVerificacao,
}: {
  cancelamento: CancelamentoPDF
  assinado: boolean
  urlVerificacao: string | null
}) {
  return (
    <View style={s.avisoCancelado}>
      <Text style={s.avisoCanceladoTitulo}>
        OFÍCIO CANCELADO{cancelamento.em ? ` — ${cancelamento.em}` : ""}
      </Text>
      {cancelamento.motivo ? <Text>Motivo: {cancelamento.motivo}</Text> : null}
      <Text>
        Este documento não está mais em vigor.
        {assinado
          ? ` A assinatura eletrônica foi feita antes do cancelamento e continua autêntica${urlVerificacao ? ` — confira em ${urlVerificacao}` : ""}.`
          : ""}
      </Text>
    </View>
  )
}

export function OficioPDF({
  dados,
  logoDataUri,
  assinatura = null,
  cancelamento = null,
}: {
  dados: DadosImpressao
  logoDataUri: string | null
  assinatura?: AssinaturaPDF | null
  cancelamento?: CancelamentoPDF | null
}) {
  const assinado = assinatura?.situacao === "assinado"
  const { oficio, cidade, organizacao, sedes } = dados
  const numero =
    oficio.numero != null ? `${oficio.numero} / ${oficio.ano}` : "— (rascunho)"
  const destinatario =
    oficio.destinatarioNome ?? oficio.destinatarioTexto ?? "—"
  const remetente = organizacao.nomeFantasia ?? organizacao.nomeRazao ?? "—"

  return (
    <Document title={`Ofício ${numero}`} author={organizacao.nomeRazao ?? ""}>
      <Page size="A4" style={s.page}>
        {cancelamento ? (
          <AvisoCancelado
            cancelamento={cancelamento}
            assinado={assinado}
            urlVerificacao={assinado ? (assinatura?.urlVerificacao ?? null) : null}
          />
        ) : null}

        {logoDataUri ? (
          <View style={s.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logo} src={logoDataUri} />
          </View>
        ) : null}

        <View style={s.cabecalho}>
          <View style={s.cabecalhoTexto}>
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
          </View>
          {assinado && assinatura?.qrDataUri ? (
            <View style={s.qrBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image style={s.qr} src={assinatura.qrDataUri} />
              <Text style={s.qrLegenda}>Verifique a autenticidade</Text>
            </View>
          ) : null}
        </View>

        <Text style={s.saudacao}>{oficio.saudacao ?? "Prezados,"}</Text>

        <CorpoPDF corpo={oficio.corpo} />

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
          {assinado && assinatura ? (
            <View style={s.carimbo}>
              <Text>Assinado eletronicamente em {assinatura.assinadoEm} (horário de Brasília)</Text>
              <Text>Certificado {assinatura.certificado} · verifique em {assinatura.urlVerificacao}</Text>
            </View>
          ) : assinatura?.situacao === "pendente" ? (
            <Text style={s.carimboPendente}>Aguardando assinatura eletrônica</Text>
          ) : null}
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
        {cancelamento ? <TarjaCancelado /> : null}
      </Page>

      {assinado && assinatura ? (
        <Page size="A4" style={s.page}>
          <Text style={s.certTitulo}>Certificado de assinatura eletrônica</Text>
          <Text style={s.certSub}>
            Este certificado integra o Ofício {numero} e registra como, quando e por quem ele foi
            assinado. Confira a autenticidade em {assinatura.urlVerificacao} ou pelo QR Code da
            primeira página.
          </Text>

          <Text style={s.certSecao}>Documento</Text>
          <LinhaCert rotulo="Ofício" valor={numero} />
          <LinhaCert rotulo="Assunto" valor={oficio.assunto} />
          <LinhaCert rotulo="Remetente" valor={organizacao.nomeRazao ?? remetente} />
          <LinhaCert rotulo="Destinatário" valor={destinatario} />
          <LinhaCert rotulo="Certificado" valor={assinatura.certificado} />
          <LinhaCert rotulo="Resumo do conteúdo (SHA-256)" valor={assinatura.hash} mono />

          <Text style={s.certSecao}>Assinante</Text>
          <LinhaCert rotulo="Nome" valor={assinatura.nome} />
          <LinhaCert rotulo="Cargo" valor={assinatura.cargo} />
          <LinhaCert rotulo="Contato" valor={assinatura.destino} />
          <LinhaCert rotulo="Autenticação" valor={assinatura.autenticacao} />
          <LinhaCert rotulo="Assinado em" valor={`${assinatura.assinadoEm} (horário de Brasília)`} />
          <LinhaCert rotulo="Endereço IP" valor={assinatura.ip} />
          <LinhaCert rotulo="Navegador" valor={assinatura.navegador} />

          {cancelamento ? (
            <>
              <Text style={s.certSecao}>Cancelamento posterior</Text>
              <LinhaCert rotulo="Cancelado em" valor={cancelamento.em ? `${cancelamento.em} (horário de Brasília)` : "data não registrada"} />
              <LinhaCert rotulo="Motivo" valor={cancelamento.motivo} />
              <LinhaCert
                rotulo="Efeito"
                valor="O ofício deixou de valer. A assinatura acima continua autêntica: o documento foi de fato assinado antes do cancelamento."
              />
            </>
          ) : null}

          <Text style={s.certSecao}>Trilha de auditoria</Text>
          {assinatura.trilha.map((e, i) => (
            <View key={i} style={s.trilhaLinha} wrap={false}>
              <Text style={s.trilhaQuando}>{e.quando}</Text>
              <Text style={s.trilhaEvento}>{e.evento}</Text>
              <Text style={s.trilhaDetalhe}>
                {[e.detalhe, e.ip ? `IP ${e.ip}` : null].filter(Boolean).join(" · ")}
              </Text>
            </View>
          ))}

          <Text style={s.certNota}>
            Assinatura eletrônica realizada nos termos da Lei nº 14.063/2020 e do art. 10, § 2º, da
            Medida Provisória nº 2.200-2/2001. O resumo SHA-256 identifica o conteúdo do ofício no
            momento do envio para assinatura e foi conferido no momento da assinatura: qualquer
            alteração posterior produziria outro resumo.
          </Text>

          <Text
            style={s.rodapePagina}
            fixed
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
          {cancelamento ? <TarjaCancelado /> : null}
        </Page>
      ) : null}
    </Document>
  )
}
