import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import type { CertificacaoPDF } from "@/lib/db/minuta-assinatura"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"
import { somarDiasISO } from "@/lib/periodo-dias"

/**
 * Aviso de Férias (CLT art. 135) — a comunicação por escrito ao empregado,
 * com a ciência dele (só ele assina; a entidade emissora fica no cabeçalho).
 * Assinado eletronicamente pelo link, ganha a página de certificado com a
 * trilha da assinatura.
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
  page: { paddingTop: CM * 1.4, paddingHorizontal: CM * 1.8, paddingBottom: CM * 1.4, fontSize: 10.5, fontFamily: "Helvetica", color: "#111827" },
  cabecalho: { borderBottomWidth: 1, borderBottomColor: "#d1d5db", paddingBottom: 10, marginBottom: 16 },
  org: { textAlign: "center", fontSize: 12, fontFamily: "Helvetica-Bold" },
  orgSub: { textAlign: "center", fontSize: 9, color: "#4b5563", marginTop: 2 },
  titulo: { textAlign: "center", fontSize: 15, fontFamily: "Helvetica-Bold", letterSpacing: 1, marginBottom: 16 },
  // As datas que o funcionário procura, em destaque no alto.
  datas: { flexDirection: "row", gap: 8, marginBottom: 18 },
  data: { flex: 1, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 4, paddingVertical: 8, paddingHorizontal: 6, alignItems: "center" },
  dataDestaque: { backgroundColor: "#eef1f6", borderColor: "#9ca3af" },
  dataRotulo: { fontSize: 7.5, color: "#4b5563", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  dataValor: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  dataNota: { fontSize: 7.5, color: "#4b5563", marginTop: 2 },
  bloco: { marginBottom: 14 },
  blocoTitulo: { fontFamily: "Helvetica-Bold", backgroundColor: "#eef1f6", paddingVertical: 4, paddingHorizontal: 6, marginBottom: 7, fontSize: 9.5 },
  grade: { flexDirection: "row", flexWrap: "wrap" },
  campo: { width: "50%", paddingHorizontal: 6, marginBottom: 7 },
  campoLargo: { width: "100%", paddingHorizontal: 6, marginBottom: 7 },
  campoRotulo: { fontSize: 8, color: "#4b5563", marginBottom: 1.5 },
  texto: { fontSize: 10.5, lineHeight: 1.45, textAlign: "justify", marginBottom: 8, paddingHorizontal: 6 },
  item: { flexDirection: "row", marginBottom: 4, paddingHorizontal: 6 },
  marcador: { width: 10 },
  itemTexto: { flex: 1, lineHeight: 1.35, fontSize: 9.5 },
  dataLocal: { marginTop: 10 },
  assinaturas: { marginTop: 44, flexDirection: "row", justifyContent: "center" },
  assinatura: { width: "60%", alignItems: "center" },
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

/**
 * O aviso em texto corrido, para onde o navegador não mostra o PDF (o
 * conteúdo de reserva do VisualizadorPdf): as mesmas informações da página 1.
 */
export function textoDoAviso(dados: DadosAvisoFerias, entidade: string): string {
  const { funcionario: f, aquisitivo, gozo } = dados
  const pagamentoAte = formatarData(somarDiasISO(gozo.inicio, -2))
  return [
    "AVISO DE FÉRIAS",
    entidade,
    "",
    `Início das férias: ${formatarData(gozo.inicio)}`,
    `Último dia: ${formatarData(gozo.termino)} (${gozo.dias} dias corridos)`,
    `Retorno ao trabalho: ${formatarData(gozo.retorno)}`,
    `Pagamento até: ${pagamentoAte} (férias + 1/3, CLT art. 145)`,
    "",
    "EMPREGADO(A)",
    `Nome: ${f.nome}`,
    ...(f.cpf ? [`CPF: ${formatarCnpjCpf(f.cpf)}`] : []),
    ...(f.matricula ? [`Matrícula: ${f.matricula}`] : []),
    ...(f.cargo ? [`Cargo: ${f.cargo}`] : []),
    "",
    "FÉRIAS",
    `Período aquisitivo: ${formatarData(aquisitivo.inicio)} a ${formatarData(aquisitivo.termino)}`,
    `Período de gozo: ${formatarData(gozo.inicio)} a ${formatarData(gozo.termino)} (${gozo.dias} dias)`,
    `Abono pecuniário: ${dados.abono ? "sim — conversão de 1/3 das férias em dinheiro (CLT art. 143)" : "não"}`,
    "",
    "COMUNICAÇÃO",
    `Nos termos do art. 135 da Consolidação das Leis do Trabalho, comunicamos que suas férias relativas ao período aquisitivo de ${formatarData(aquisitivo.inicio)} a ${formatarData(aquisitivo.termino)} serão concedidas de ${formatarData(gozo.inicio)} a ${formatarData(gozo.termino)}, num total de ${gozo.dias} dias corridos, devendo V. Sa. reassumir suas funções em ${formatarData(gozo.retorno)}.`,
    `A remuneração das férias, acrescida do terço constitucional${dados.abono ? " e do abono pecuniário" : ""}, será paga até ${pagamentoAte}, 2 (dois) dias antes do início do gozo (CLT art. 145).`,
    "Férias são período de descanso: nesses dias não há prestação de serviço à entidade.",
    "Havendo divergência nas datas, comunique o departamento de pessoal antes de assinar.",
  ].join("\n")
}

function Data({ rotulo, valor, nota, destaque = false }: { rotulo: string; valor: string; nota?: string; destaque?: boolean }) {
  return (
    <View style={destaque ? [s.data, s.dataDestaque] : s.data}>
      <Text style={s.dataRotulo}>{rotulo}</Text>
      <Text style={s.dataValor}>{valor}</Text>
      {nota ? <Text style={s.dataNota}>{nota}</Text> : null}
    </View>
  )
}

function Campo({ rotulo, valor, largo = false }: { rotulo: string; valor: string; largo?: boolean }) {
  return (
    <View style={largo ? s.campoLargo : s.campo}>
      <Text style={s.campoRotulo}>{rotulo}</Text>
      <Text>{valor}</Text>
    </View>
  )
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
  const pagamentoAte = somarDiasISO(gozo.inicio, -2)
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.cabecalho}>
          <Text style={s.org}>{organizacao.nome}</Text>
          {organizacao.cnpj ? <Text style={s.orgSub}>CNPJ {formatarCnpjCpf(organizacao.cnpj)}</Text> : null}
        </View>

        <Text style={s.titulo}>AVISO DE FÉRIAS</Text>

        <View style={s.datas}>
          <Data rotulo="Início das férias" valor={formatarData(gozo.inicio)} destaque />
          <Data rotulo="Último dia" valor={formatarData(gozo.termino)} nota={`${gozo.dias} dias corridos`} />
          <Data rotulo="Retorno ao trabalho" valor={formatarData(gozo.retorno)} destaque />
          <Data rotulo="Pagamento até" valor={formatarData(pagamentoAte)} nota="férias + 1/3 (art. 145)" />
        </View>

        <View style={s.bloco}>
          <Text style={s.blocoTitulo}>Empregado(a)</Text>
          <View style={s.grade}>
            <Campo rotulo="Nome" valor={f.nome} largo />
            <Campo rotulo="CPF" valor={f.cpf ? formatarCnpjCpf(f.cpf) : "—"} />
            <Campo rotulo="Matrícula" valor={f.matricula ?? "—"} />
            <Campo rotulo="Cargo" valor={f.cargo ?? "—"} largo />
          </View>
        </View>

        <View style={s.bloco}>
          <Text style={s.blocoTitulo}>Férias</Text>
          <View style={s.grade}>
            <Campo rotulo="Período aquisitivo" valor={`${formatarData(aquisitivo.inicio)} a ${formatarData(aquisitivo.termino)}`} />
            <Campo rotulo="Período de gozo" valor={`${formatarData(gozo.inicio)} a ${formatarData(gozo.termino)} (${gozo.dias} dias)`} />
            <Campo
              rotulo="Abono pecuniário"
              valor={dados.abono ? "Sim — conversão de 1/3 das férias em dinheiro (CLT art. 143)" : "Não"}
              largo
            />
          </View>
        </View>

        <View style={s.bloco}>
          <Text style={s.blocoTitulo}>Comunicação</Text>
          {/* Uma string só: em pedaços, o @react-pdf dobra o entrelinha. */}
          <Text style={s.texto}>
            {`Nos termos do art. 135 da Consolidação das Leis do Trabalho, comunicamos que suas férias relativas ao período aquisitivo de ${formatarData(aquisitivo.inicio)} a ${formatarData(aquisitivo.termino)} serão concedidas de ${formatarData(gozo.inicio)} a ${formatarData(gozo.termino)}, num total de ${gozo.dias} dias corridos, devendo V. Sa. reassumir suas funções em ${formatarData(gozo.retorno)}.`}
          </Text>
          {[
            `A remuneração das férias, acrescida do terço constitucional${dados.abono ? " e do abono pecuniário" : ""}, será paga até ${formatarData(pagamentoAte)}, 2 (dois) dias antes do início do gozo (CLT art. 145).`,
            "Férias são período de descanso: nesses dias não há prestação de serviço à entidade.",
            "Havendo divergência nas datas, comunique o departamento de pessoal antes de assinar.",
          ].map((t, i) => (
            <View key={i} style={s.item}>
              <Text style={s.marcador}>•</Text>
              <Text style={s.itemTexto}>{t}</Text>
            </View>
          ))}
        </View>

        <Text style={s.dataLocal}>
          {organizacao.cidade ? `${organizacao.cidade}, ` : ""}
          {porExtenso(dataDocumento)}.
        </Text>

        {/* Só o empregado assina: o art. 135 pede a comunicação por escrito e o
            recibo dele; o empregador fica identificado no cabeçalho. */}
        <View style={s.assinaturas} wrap={false}>
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
