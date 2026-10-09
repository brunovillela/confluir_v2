import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import type { RpaDetalhe } from "@/lib/db/compras-rpa"
import type { CertificacaoPDF } from "@/lib/db/minuta-assinatura"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"

/**
 * PDF do RPA (Recibo de Pagamento a Autônomo) — baixado pelo painel, assinado
 * pelo prestador e arquivado como comprovante fiscal do serviço.
 */

const CM = 28.35

const s = StyleSheet.create({
  page: {
    paddingTop: CM,
    paddingHorizontal: CM * 1.2,
    paddingBottom: CM,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  org: { textAlign: "center", fontSize: 11, fontFamily: "Helvetica-Bold" },
  orgSub: { textAlign: "center", fontSize: 9, color: "#444444", marginBottom: 16 },
  titulo: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  numero: { textAlign: "center", fontSize: 10, color: "#444444", marginBottom: 16 },
  bloco: { marginBottom: 12 },
  blocoTitulo: {
    fontFamily: "Helvetica-Bold",
    backgroundColor: "#eef1f6",
    padding: 4,
    marginBottom: 6,
    fontSize: 10,
  },
  linha: { marginBottom: 3, lineHeight: 1.3 },
  rotulo: { fontFamily: "Helvetica-Bold" },
  tabela: { borderWidth: 1, borderColor: "#cccccc" },
  tRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
  },
  tRowUltima: { flexDirection: "row" },
  tCelRotulo: { flex: 1, padding: 5 },
  tCelValor: { width: 120, padding: 5, textAlign: "right" },
  forte: { fontFamily: "Helvetica-Bold" },
  quitacao: { marginTop: 14, lineHeight: 1.4, textAlign: "justify" },
  dataLocal: { marginTop: 22 },
  assinatura: { marginTop: 40, alignItems: "center" },
  assinaturaLinha: {
    borderTopWidth: 1,
    borderTopColor: "#111827",
    width: 280,
    marginBottom: 4,
  },
  assinaturaNome: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  assinaturaSub: { fontSize: 8, color: "#444444" },
  certTitulo: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  certSub: { fontSize: 8, color: "#444444", marginBottom: 10, lineHeight: 1.35 },
  certSecao: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  certBloco: { borderWidth: 0.5, borderColor: "#cccccc", borderRadius: 3, padding: 8, marginBottom: 8 },
  certLinha: { flexDirection: "row", fontSize: 8, marginBottom: 1.5 },
  certRotulo: { width: 110, color: "#555555" },
  certValor: { flex: 1 },
  mono: { fontFamily: "Courier", fontSize: 7.5 },
  trilha: { flexDirection: "row", fontSize: 7, color: "#444444", marginBottom: 1 },
  qr: { width: 64, height: 64 },
  rodape: {
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

function porExtenso(iso?: string | null): string {
  const agora = new Date(
    (iso ? new Date(iso) : new Date()).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  )
  return `${agora.getDate()} de ${MESES[agora.getMonth()]} de ${agora.getFullYear()}`
}

function brl(v: number | null): string {
  return (v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

export function RpaPDF({
  rpa,
  organizacao,
  dataDocumento,
  certificacao = null,
}: {
  rpa: RpaDetalhe
  organizacao: { nome: string; cnpj: string | null; cidade: string | null }
  /** Data do recibo (padrão: hoje). Na assinatura eletrônica, a da assinatura. */
  dataDocumento?: string | null
  /** Página final com o certificado da assinatura eletrônica pelo link. */
  certificacao?: CertificacaoPDF | null
}) {
  const ano = rpa.created_at.slice(0, 4)
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.org}>{organizacao.nome}</Text>
        <Text style={s.orgSub}>
          {organizacao.cnpj ? `CNPJ ${formatarCnpjCpf(organizacao.cnpj)}` : " "}
        </Text>

        <Text style={s.titulo}>RECIBO DE PAGAMENTO A AUTÔNOMO — RPA</Text>
        <Text style={s.numero}>Nº {rpa.numero ?? "—"}/{ano}</Text>

        <View style={s.bloco}>
          <Text style={s.blocoTitulo}>Prestador do serviço</Text>
          <Text style={s.linha}>
            <Text style={s.rotulo}>Nome: </Text>
            {rpa.fornecedorNome ?? "—"}
          </Text>
          <Text style={s.linha}>
            <Text style={s.rotulo}>CPF/CNPJ: </Text>
            {rpa.fornecedorCnpjCpf
              ? formatarCnpjCpf(rpa.fornecedorCnpjCpf)
              : "—"}
          </Text>
          {rpa.fornecedorEndereco && (
            <Text style={s.linha}>
              <Text style={s.rotulo}>Endereço: </Text>
              {rpa.fornecedorEndereco}
            </Text>
          )}
        </View>

        <View style={s.bloco}>
          <Text style={s.blocoTitulo}>Serviço prestado</Text>
          <Text style={s.linha}>{rpa.descricao_servico ?? "—"}</Text>
          {rpa.data_servico && (
            <Text style={s.linha}>
              <Text style={s.rotulo}>Data do serviço: </Text>
              {formatarData(rpa.data_servico)}
            </Text>
          )}
        </View>

        <View style={s.bloco}>
          <Text style={s.blocoTitulo}>Valores</Text>
          <View style={s.tabela}>
            <View style={s.tRow}>
              <Text style={[s.tCelRotulo, s.forte]}>Valor bruto dos serviços</Text>
              <Text style={[s.tCelValor, s.forte]}>{brl(rpa.valor_bruto)}</Text>
            </View>
            <View style={s.tRow}>
              <Text style={s.tCelRotulo}>(-) INSS retido</Text>
              <Text style={s.tCelValor}>{brl(rpa.inss)}</Text>
            </View>
            <View style={s.tRow}>
              <Text style={s.tCelRotulo}>
                (-) IRRF retido
                {rpa.dependentes
                  ? ` (${rpa.dependentes} dependente${rpa.dependentes === 1 ? "" : "s"})`
                  : ""}
              </Text>
              <Text style={s.tCelValor}>{brl(rpa.irrf)}</Text>
            </View>
            <View style={s.tRow}>
              <Text style={s.tCelRotulo}>
                (-) ISS retido
                {rpa.iss_aliquota != null ? ` (${rpa.iss_aliquota}%)` : ""}
              </Text>
              <Text style={s.tCelValor}>{brl(rpa.iss)}</Text>
            </View>
            <View style={s.tRowUltima}>
              <Text style={[s.tCelRotulo, s.forte]}>Valor líquido a receber</Text>
              <Text style={[s.tCelValor, s.forte]}>
                {brl(rpa.valor_liquido)}
              </Text>
            </View>
          </View>
        </View>

        <Text style={s.quitacao}>
          Declaro que recebi de {organizacao.nome}
          {organizacao.cnpj
            ? `, CNPJ ${formatarCnpjCpf(organizacao.cnpj)},`
            : ""}{" "}
          a importância líquida de {brl(rpa.valor_liquido)} pelos serviços acima
          descritos, dando plena e total quitação pelo valor recebido. As
          retenções discriminadas neste recibo serão recolhidas pela fonte
          pagadora na forma da legislação vigente.
        </Text>

        <Text style={s.dataLocal}>
          {organizacao.cidade ? `${organizacao.cidade}, ` : ""}
          {porExtenso(dataDocumento)}.
        </Text>

        <View style={s.assinatura}>
          {certificacao?.concluida ? (
            <Text style={[s.assinaturaSub, { marginBottom: 4 }]}>
              Assinado eletronicamente — certificado {certificacao.assinantes[0]?.certificado ?? ""} (ver página final)
            </Text>
          ) : null}
          <View style={s.assinaturaLinha} />
          <Text style={s.assinaturaNome}>{rpa.fornecedorNome ?? ""}</Text>
          <Text style={s.assinaturaSub}>
            {rpa.fornecedorCnpjCpf
              ? `CPF/CNPJ ${formatarCnpjCpf(rpa.fornecedorCnpjCpf)}`
              : "Assinatura do prestador"}
          </Text>
        </View>

        <Text style={s.rodape} fixed>
          RPA nº {rpa.numero ?? "—"}/{ano} — emitido em{" "}
          {formatarData(rpa.created_at)} via Confluir
        </Text>
      </Page>

      {certificacao ? (
        <Page size="A4" style={s.page}>
          <Text style={s.certTitulo}>Certificado de assinatura eletrônica</Text>
          <Text style={s.certSub}>
            {certificacao.concluida
              ? "Recibo assinado eletronicamente pelo prestador."
              : "Assinatura em andamento."}{" "}
            A assinatura foi confirmada por link individual e código de uso único enviados ao e-mail do
            prestador, com conferência do CPF digitado por ele e aceite expresso do conteúdo e da forma
            eletrônica (MP 2.200-2/2001, art. 10, § 2º). O resumo SHA-256 abaixo identifica o conteúdo
            assinado: qualquer alteração o torna diferente.
          </Text>
          <View style={s.certLinha}>
            <Text style={s.certRotulo}>Documento</Text>
            <Text style={s.certValor}>RPA nº {rpa.numero ?? "—"}/{ano} — {organizacao.nome}</Text>
          </View>
          <View style={s.certLinha}>
            <Text style={s.certRotulo}>SHA-256 do conteúdo</Text>
            <Text style={[s.certValor, s.mono]}>{certificacao.hash}</Text>
          </View>
          <Text style={s.certSecao}>Assinatura</Text>
          {certificacao.assinantes.map((a, i) => (
            <View key={i} style={s.certBloco} wrap={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  {[
                    ["Papel", a.papel],
                    ["Nome declarado", a.nome],
                    ["CPF (conferido)", a.cpf],
                    ["E-mail", a.email],
                    ["Situação", a.situacao === "assinado" ? "Assinado" : a.situacao === "recusado" ? "Recusado" : "Pendente"],
                    ["Assinado em", a.assinadoEm ? `${a.assinadoEm} (horário de Brasília)` : "—"],
                    ["Endereço IP", a.ip ?? "—"],
                    ["Navegador", a.navegador ?? "—"],
                    ["Certificado", a.certificado],
                    ["Verificação", a.url || "—"],
                  ].map(([r, v]) => (
                    <View key={r} style={s.certLinha}>
                      <Text style={s.certRotulo}>{r}</Text>
                      <Text style={s.certValor}>{v}</Text>
                    </View>
                  ))}
                </View>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do @react-pdf não aceita alt */}
                {a.qr ? <Image src={a.qr} style={s.qr} /> : null}
              </View>
              {a.trilha.length > 0 ? (
                <View style={{ marginTop: 4 }}>
                  {a.trilha.map((e, j) => (
                    <View key={j} style={s.trilha}>
                      <Text style={{ width: 120 }}>{e.quando}</Text>
                      <Text style={{ flex: 1 }}>{e.evento}</Text>
                      <Text style={{ width: 110 }}>{e.ip ?? ""}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
          <Text style={s.rodape} fixed>
            RPA nº {rpa.numero ?? "—"}/{ano} — assinatura eletrônica · SHA-256 {certificacao.hash.slice(0, 16)}…
          </Text>
        </Page>
      ) : null}
    </Document>
  )
}
