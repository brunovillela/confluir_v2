import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer"

import type { CertificacaoPDF } from "@/lib/db/minuta-assinatura"

/**
 * Carta PERSONALIZADA de oposição à contribuição assistencial, gerada com os
 * dados do opositor. O trabalhador baixa, assina no gov.br e reenvia pela área
 * de oposição. Renderizada em /portal/oposicao/comprovante/[id]/carta.
 *
 * Assinada pelo próprio Confluir (08/11/2026), ganha o selo da assinatura e a
 * página de certificado — a mesma dos ofícios e do aviso de férias — com o
 * resumo SHA-256, a trilha e o QR code da verificação pública.
 */

export type DadosCartaOposicao = {
  organizacao: string | null
  nome: string | null
  cpf: string | null
  matricula: string | null
  empregador: string | null
  /** "12.345.678/0001-90", já formatado. */
  empregadorCnpj?: string | null
  campanha: string | null
  detalhe: string | null
  declaracao: string | null
  protocolo: number | null
  data: string | null
}

const CM = 28.35

/**
 * "31 de outubro de 2026" no fuso de São Paulo (A109). `confirmado_em` é ISO
 * em UTC e o servidor roda em UTC: sem o fuso, uma oposição das 22h de 31/10
 * saía datada de 1º de novembro — fora do prazo, num documento assinado.
 */
export function dataPorExtensoSP(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(Number.isNaN(d.getTime()) ? new Date() : d)
}

function fmtCpf(cpf: string | null): string {
  if (!cpf) return "—"
  const s = cpf.replace(/\D/g, "")
  if (s.length !== 11) return cpf
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`
}

const s = StyleSheet.create({
  page: {
    paddingVertical: CM,
    paddingHorizontal: CM,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#111827",
    lineHeight: 1.5,
  },
  logoBox: { alignItems: "center", marginBottom: 8 },
  logo: { width: 150, objectFit: "contain" },
  org: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12 },
  titulo: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    marginTop: 18,
    marginBottom: 18,
  },
  corpo: { textAlign: "justify", marginBottom: 12 },
  rotulo: { fontFamily: "Helvetica-Bold" },
  declaracao: {
    backgroundColor: "#f3f4f6",
    borderRadius: 4,
    padding: 10,
    marginVertical: 8,
    fontSize: 10,
  },
  protocolo: { marginTop: 10, fontSize: 10, color: "#374151" },
  local: { marginTop: 28 },
  assinatura: { marginTop: 56, alignItems: "center" },
  linhaAssinatura: {
    borderTopWidth: 1,
    borderColor: "#111827",
    width: 280,
    marginBottom: 4,
  },
  assinaturaNota: { fontSize: 9, color: "#6b7280", textAlign: "center" },
  selo: { borderWidth: 1, borderColor: "#9ca3af", borderRadius: 4, paddingVertical: 6, paddingHorizontal: 10, alignItems: "center", width: 340 },
  seloTitulo: { fontFamily: "Helvetica-Bold", fontSize: 10 },
  // Página do certificado (a mesma do aviso de férias).
  certPage: { paddingTop: CM * 1.4, paddingHorizontal: CM * 1.8, paddingBottom: CM * 1.4, fontSize: 10.5, fontFamily: "Helvetica", color: "#111827" },
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

export function CartaOposicaoPDF({
  dados,
  logoDataUri,
  certificacao = null,
  provaIdentidade = null,
}: {
  dados: DadosCartaOposicao
  logoDataUri: string | null
  /** Assinatura pelo Confluir: o selo e a página de certificado. */
  certificacao?: CertificacaoPDF | null
  /** Como a pessoa provou ser ela ao assinar (frase do certificado). */
  provaIdentidade?: string | null
}) {
  const assinado = certificacao?.concluida ? certificacao.assinantes[0] : null
  // Sem o detalhe do desconto, a frase não repete o nome da campanha
  // ("ao desconto de X (X)"): fica "da contribuição assistencial (X)".
  const alvo = dados.detalhe || "contribuição assistencial"
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {logoDataUri ? (
          <View style={s.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logo} src={logoDataUri} />
          </View>
        ) : null}
        {dados.organizacao ? <Text style={s.org}>{dados.organizacao}</Text> : null}

        <Text style={s.titulo}>
          CARTA DE OPOSIÇÃO À CONTRIBUIÇÃO ASSISTENCIAL
        </Text>

        <Text style={s.corpo}>
          Eu, <Text style={s.rotulo}>{dados.nome ?? "—"}</Text>, inscrito(a) no
          CPF sob o nº <Text style={s.rotulo}>{fmtCpf(dados.cpf)}</Text>
          {dados.matricula ? `, matrícula ${dados.matricula}` : ""}, trabalhador(a)
          {/* Sem fonte informada, a frase não leva um "—" no lugar do nome
              (A103): o documento vai ser assinado no gov.br. */}
          {dados.empregador ? (
            <>
              {" "}vinculado(a) à fonte pagadora{" "}
              <Text style={s.rotulo}>{dados.empregador}</Text>
              {dados.empregadorCnpj ? `, CNPJ ${dados.empregadorCnpj}` : ""}
            </>
          ) : null}
          , venho, pela
          presente, manifestar de forma livre e expressa a minha{" "}
          <Text style={s.rotulo}>OPOSIÇÃO</Text> ao desconto {dados.detalhe ? `de ${alvo}` : `da ${alvo}`}
          {dados.campanha ? ` (${dados.campanha})` : ""}, nos termos da legislação
          vigente.
        </Text>

        {dados.declaracao ? (
          <Text style={s.declaracao}>{dados.declaracao}</Text>
        ) : null}

        <Text style={s.corpo}>
          Declaro estar ciente de que esta manifestação será encaminhada à
          entidade sindical e submetida à avaliação cabível.
        </Text>

        {dados.protocolo != null ? (
          <Text style={s.protocolo}>Protocolo: {dados.protocolo}</Text>
        ) : null}

        <Text style={s.local}>{dataPorExtensoSP(dados.data)}.</Text>

        {assinado ? (
          <View style={[s.assinatura, { marginTop: 32 }]} wrap={false}>
            <View style={s.selo}>
              <Text style={s.seloTitulo}>Assinado eletronicamente pelo Confluir</Text>
              <Text style={s.assinaturaNota}>
                {assinado.nome} · CPF {assinado.cpf}
              </Text>
              <Text style={s.assinaturaNota}>
                {assinado.assinadoEm ? `${assinado.assinadoEm} (horário de Brasília) · ` : ""}certificado{" "}
                {assinado.certificado}
              </Text>
              {assinado.url ? <Text style={s.assinaturaNota}>Confira em {assinado.url}</Text> : null}
            </View>
          </View>
        ) : (
          <View style={s.assinatura}>
            <View style={s.linhaAssinatura} />
            <Text style={s.assinaturaNota}>
              {dados.nome ?? "Assinatura do trabalhador"}
            </Text>
            <Text style={s.assinaturaNota}>
              Assine este documento eletronicamente no Assinador gov.br.
            </Text>
          </View>
        )}
      </Page>

      {certificacao ? (
        <Page size="A4" style={s.certPage}>
          <Text style={s.certTitulo}>Certificado de assinatura eletrônica</Text>
          <Text style={s.certSub}>
            Carta de oposição assinada eletronicamente pelo(a) trabalhador(a) na página da oposição, com aceite
            expresso do conteúdo e da forma eletrônica (MP 2.200-2/2001, art. 10, § 2º; Lei 14.063/2020).{" "}
            {provaIdentidade ? `${provaIdentidade} ` : ""}O resumo SHA-256 abaixo identifica o conteúdo assinado:
            qualquer alteração o torna diferente. Qualquer pessoa pode conferir a assinatura no endereço de
            verificação ou pelo QR code.
          </Text>
          <View style={s.certLinha}>
            <Text style={s.certRotulo}>Documento</Text>
            <Text style={s.certValor}>
              Carta de oposição — {dados.nome ?? "—"}
              {dados.campanha ? ` — ${dados.campanha}` : ""}
              {dados.protocolo != null ? ` — protocolo ${dados.protocolo}` : ""}
              {dados.organizacao ? ` — ${dados.organizacao}` : ""}
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
                    ["CPF", a.cpf],
                    ["E-mail", a.email],
                    ["Situação", a.situacao === "assinado" ? "Assinado" : "Pendente"],
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
            Carta de oposição — assinatura eletrônica pelo Confluir · SHA-256 {certificacao.hash.slice(0, 16)}…
          </Text>
        </Page>
      ) : null}
    </Document>
  )
}
