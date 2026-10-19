import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import type { CertificacaoPDF } from "@/lib/db/minuta-assinatura"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"

/**
 * Aviso de Férias (CLT art. 135) — a comunicação por escrito ao empregado,
 * com a ciência dele. Assinado eletronicamente pelo link, ganha a página de
 * certificado com a trilha da assinatura.
 */

export type DadosAvisoFerias = {
  funcionario: { nome: string; cpf: string | null; cargo: string | null; matricula: string | null }
  aquisitivo: { inicio: string | null; termino: string | null }
  gozo: { inicio: string; termino: string; dias: number; retorno: string }
  /** Venda de 1/3 das férias (abono pecuniário, CLT art. 143). */
  abono: boolean
}

const CM = 28.35

const s = StyleSheet.create({
  page: { paddingTop: CM * 1.2, paddingHorizontal: CM * 1.5, paddingBottom: CM, fontSize: 10.5, fontFamily: "Helvetica", color: "#111827" },
  org: { textAlign: "center", fontSize: 11, fontFamily: "Helvetica-Bold" },
  orgSub: { textAlign: "center", fontSize: 9, color: "#444444", marginBottom: 22 },
  titulo: { textAlign: "center", fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 18 },
  bloco: { marginBottom: 12 },
  blocoTitulo: { fontFamily: "Helvetica-Bold", backgroundColor: "#eef1f6", padding: 4, marginBottom: 6, fontSize: 10 },
  linha: { marginBottom: 3, lineHeight: 1.3 },
  rotulo: { fontFamily: "Helvetica-Bold" },
  texto: { lineHeight: 1.5, textAlign: "justify", marginBottom: 10 },
  dataLocal: { marginTop: 18 },
  assinaturas: { marginTop: 44, flexDirection: "row", justifyContent: "space-between", gap: 24 },
  assinatura: { flex: 1, alignItems: "center" },
  assinaturaLinha: { borderTopWidth: 1, borderTopColor: "#111827", alignSelf: "stretch", marginBottom: 4 },
  assinaturaNome: { fontFamily: "Helvetica-Bold", fontSize: 9.5, textAlign: "center" },
  assinaturaSub: { fontSize: 8, color: "#444444", textAlign: "center" },
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
  rodape: { position: "absolute", bottom: 16, left: 0, right: 0, textAlign: "center", fontSize: 8, color: "#444444" },
})

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

function porExtenso(iso?: string | null): string {
  const d = new Date((iso ? new Date(iso) : new Date()).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

export function AvisoFeriasPDF({
  dados,
  organizacao,
  dataDocumento,
  certificacao = null,
}: {
  dados: DadosAvisoFerias
  organizacao: { nome: string; cnpj: string | null; cidade: string | null }
  /** Data do aviso (o envio ao funcionário). */
  dataDocumento?: string | null
  certificacao?: CertificacaoPDF | null
}) {
  const { funcionario: f, aquisitivo, gozo } = dados
  const assinado = certificacao?.concluida ? certificacao.assinantes[0] : null
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.org}>{organizacao.nome}</Text>
        <Text style={s.orgSub}>{organizacao.cnpj ? `CNPJ ${formatarCnpjCpf(organizacao.cnpj)}` : " "}</Text>

        <Text style={s.titulo}>AVISO DE FÉRIAS</Text>

        <View style={s.bloco}>
          <Text style={s.blocoTitulo}>Empregado(a)</Text>
          <Text style={s.linha}>
            <Text style={s.rotulo}>Nome: </Text>
            {f.nome}
          </Text>
          {f.cpf && (
            <Text style={s.linha}>
              <Text style={s.rotulo}>CPF: </Text>
              {formatarCnpjCpf(f.cpf)}
            </Text>
          )}
          {(f.cargo || f.matricula) && (
            <Text style={s.linha}>
              {f.cargo ? (
                <>
                  <Text style={s.rotulo}>Cargo: </Text>
                  {f.cargo}
                </>
              ) : null}
              {f.cargo && f.matricula ? "   " : ""}
              {f.matricula ? (
                <>
                  <Text style={s.rotulo}>Matrícula: </Text>
                  {f.matricula}
                </>
              ) : null}
            </Text>
          )}
        </View>

        <View style={s.bloco}>
          <Text style={s.blocoTitulo}>Férias</Text>
          <Text style={s.linha}>
            <Text style={s.rotulo}>Período aquisitivo: </Text>
            {formatarData(aquisitivo.inicio)} a {formatarData(aquisitivo.termino)}
          </Text>
          <Text style={s.linha}>
            <Text style={s.rotulo}>Período de gozo: </Text>
            {formatarData(gozo.inicio)} a {formatarData(gozo.termino)} ({gozo.dias} dias corridos)
          </Text>
          <Text style={s.linha}>
            <Text style={s.rotulo}>Retorno ao trabalho: </Text>
            {formatarData(gozo.retorno)}
          </Text>
          {dados.abono && (
            <Text style={s.linha}>
              <Text style={s.rotulo}>Abono pecuniário: </Text>
              conversão de 1/3 do período de férias em dinheiro (CLT art. 143)
            </Text>
          )}
        </View>

        <Text style={s.texto}>
          Nos termos do art. 135 da Consolidação das Leis do Trabalho, comunicamos que suas férias
          relativas ao período aquisitivo de {formatarData(aquisitivo.inicio)} a{" "}
          {formatarData(aquisitivo.termino)} serão concedidas de {formatarData(gozo.inicio)} a{" "}
          {formatarData(gozo.termino)}, num total de {gozo.dias} dias corridos, devendo V. Sa. reassumir
          suas funções em {formatarData(gozo.retorno)}.
        </Text>
        <Text style={s.texto}>
          A remuneração das férias, acrescida do terço constitucional
          {dados.abono ? " e do abono pecuniário" : ""}, será paga até 2 (dois) dias antes do início do
          período de gozo (CLT art. 145).
        </Text>

        <Text style={s.dataLocal}>
          {organizacao.cidade ? `${organizacao.cidade}, ` : ""}
          {porExtenso(dataDocumento)}.
        </Text>

        <View style={s.assinaturas}>
          <View style={s.assinatura}>
            <View style={s.assinaturaLinha} />
            <Text style={s.assinaturaNome}>{organizacao.nome}</Text>
            <Text style={s.assinaturaSub}>Empregador</Text>
          </View>
          <View style={s.assinatura}>
            {assinado ? (
              <Text style={[s.assinaturaSub, { marginBottom: 4 }]}>
                Ciente — assinado eletronicamente em {assinado.assinadoEm} · certificado {assinado.certificado}
              </Text>
            ) : null}
            <View style={s.assinaturaLinha} />
            <Text style={s.assinaturaNome}>{f.nome}</Text>
            <Text style={s.assinaturaSub}>Ciente — empregado(a)</Text>
          </View>
        </View>

        <Text style={s.rodape} fixed>
          Aviso de férias — {f.nome} — gozo de {formatarData(gozo.inicio)} a {formatarData(gozo.termino)} · via Confluir
        </Text>
      </Page>

      {certificacao ? (
        <Page size="A4" style={s.page}>
          <Text style={s.certTitulo}>Certificado de assinatura eletrônica</Text>
          <Text style={s.certSub}>
            {certificacao.concluida ? "Aviso de férias assinado eletronicamente pelo(a) empregado(a), com ciência do conteúdo." : "Assinatura em andamento."}{" "}
            A assinatura foi confirmada por link individual e código de uso único enviados ao e-mail do(a)
            empregado(a), com conferência do CPF digitado e aceite expresso do conteúdo e da forma eletrônica
            (MP 2.200-2/2001, art. 10, § 2º). O resumo SHA-256 abaixo identifica o conteúdo assinado:
            qualquer alteração o torna diferente.
          </Text>
          <View style={s.certLinha}>
            <Text style={s.certRotulo}>Documento</Text>
            <Text style={s.certValor}>
              Aviso de férias — {f.nome} — {formatarData(gozo.inicio)} a {formatarData(gozo.termino)} — {organizacao.nome}
            </Text>
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
            Aviso de férias — assinatura eletrônica · SHA-256 {certificacao.hash.slice(0, 16)}…
          </Text>
        </Page>
      ) : null}
    </Document>
  )
}
