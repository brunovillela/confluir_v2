import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

/**
 * Comprovante da oposição à contribuição assistencial em PDF (A107): a prova
 * que o trabalhador guarda ou leva à fonte pagadora. Diferente da tela
 * impressa, sai sempre com a identificação da entidade (nome, CNPJ, logo),
 * o protocolo, a data e hora do registro, a situação e o endereço do
 * comprovante. Renderizado em /portal/oposicao/comprovante/[id]/pdf, só para
 * o dono da oposição. Os textos já chegam prontos (rótulos do portal e datas
 * no fuso de São Paulo) — o PDF só desenha.
 */

export type DadosComprovanteOposicao = {
  organizacao: string | null
  cnpj: string | null
  protocolo: number | null
  /** "31/10/2026 22:14" (horário de Brasília). */
  registradoEm: string
  emitidoEm: string
  nome: string | null
  cpf: string | null
  matricula: string | null
  empregador: string | null
  campanha: string | null
  detalhe: string | null
  declaracao: string | null
  situacao: string
  resultado: string
  motivo: string | null
  /** "Recebida em 01/11/2026 10:02" — só quando houve carta assinada. */
  documento: string | null
  url: string | null
}

const CM = 28.35

const s = StyleSheet.create({
  page: {
    paddingVertical: CM * 1.5,
    paddingHorizontal: CM * 2,
    fontSize: 10.5,
    fontFamily: "Helvetica",
    color: "#111827",
    lineHeight: 1.45,
  },
  logoBox: { alignItems: "center", marginBottom: 6 },
  logo: { width: 130, objectFit: "contain" },
  org: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12 },
  cnpj: { textAlign: "center", fontSize: 9, color: "#4b5563" },
  titulo: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    marginTop: 20,
    letterSpacing: 0.5,
  },
  subtitulo: { textAlign: "center", fontSize: 9.5, color: "#374151", marginBottom: 18 },
  linha: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: "#e5e7eb",
    paddingVertical: 4,
  },
  rotulo: { width: 120, color: "#4b5563" },
  valor: { flex: 1, fontFamily: "Helvetica-Bold" },
  declaracao: {
    backgroundColor: "#f3f4f6",
    borderRadius: 4,
    padding: 10,
    marginTop: 14,
    fontSize: 9.5,
  },
  resultado: {
    borderWidth: 1,
    borderColor: "#9ca3af",
    borderRadius: 4,
    padding: 10,
    marginTop: 14,
  },
  resultadoTitulo: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  rodape: {
    marginTop: 24,
    borderTopWidth: 0.5,
    borderColor: "#e5e7eb",
    paddingTop: 10,
    fontSize: 8.5,
    color: "#4b5563",
  },
})

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <View style={s.linha}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <Text style={s.valor}>{valor || "—"}</Text>
    </View>
  )
}

function cpfFormatado(cpf: string | null): string | null {
  const d = (cpf ?? "").replace(/\D/g, "")
  if (d.length !== 11) return cpf
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function ComprovanteOposicaoPDF({
  dados,
  logoDataUri,
}: {
  dados: DadosComprovanteOposicao
  logoDataUri: string | null
}) {
  const protocolo = dados.protocolo == null ? "—" : String(dados.protocolo)
  return (
    <Document title={`Comprovante de oposição — protocolo ${protocolo}`}>
      <Page size="A4" style={s.page}>
        {logoDataUri ? (
          <View style={s.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logo} src={logoDataUri} />
          </View>
        ) : null}
        {dados.organizacao ? <Text style={s.org}>{dados.organizacao}</Text> : null}
        {dados.cnpj ? <Text style={s.cnpj}>CNPJ {dados.cnpj}</Text> : null}

        <Text style={s.titulo}>COMPROVANTE DE OPOSIÇÃO À CONTRIBUIÇÃO ASSISTENCIAL</Text>
        <Text style={s.subtitulo}>
          Comprovante eletrônico · protocolo {protocolo} · registrado em {dados.registradoEm}
        </Text>

        <Linha rotulo="Protocolo" valor={protocolo} />
        <Linha rotulo="Registrada em" valor={`${dados.registradoEm} (horário de Brasília)`} />
        <Linha rotulo="Nome" valor={dados.nome} />
        <Linha rotulo="CPF" valor={cpfFormatado(dados.cpf)} />
        <Linha rotulo="Fonte pagadora" valor={dados.empregador} />
        <Linha rotulo="Matrícula" valor={dados.matricula} />
        <Linha
          rotulo="Campanha"
          valor={[dados.campanha, dados.detalhe].filter(Boolean).join(" — ") || null}
        />
        {dados.documento ? <Linha rotulo="Carta assinada" valor={dados.documento} /> : null}

        {dados.declaracao ? <Text style={s.declaracao}>{dados.declaracao}</Text> : null}

        <View style={s.resultado}>
          <Text style={s.resultadoTitulo}>Situação: {dados.situacao}</Text>
          <Text>{dados.resultado}</Text>
          {dados.motivo ? <Text>Motivo: {dados.motivo}</Text> : null}
        </View>

        <View style={s.rodape}>
          <Text>
            Emitido em {dados.emitidoEm} (horário de Brasília). Documento gerado
            eletronicamente; o registro da oposição, com data, hora e origem do
            acesso, fica guardado pela entidade.
          </Text>
          {dados.url ? <Text>Comprovante on-line (acesso com o seu login): {dados.url}</Text> : null}
        </View>
      </Page>
    </Document>
  )
}
