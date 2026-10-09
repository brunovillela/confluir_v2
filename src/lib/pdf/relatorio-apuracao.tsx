import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer"

import type {
  DadosRelatorioApuracao,
  SecaoRelatorio,
} from "@/lib/db/assembleias-relatorio"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"

/**
 * Relatórios da apuração (votantes, resultado, completo). Renderizado em
 * `/painel/representacao/votacoes/apuracao/[id]/relatorio`.
 */

const CM = 28.35

function n(v: number): string {
  return v.toLocaleString("pt-BR")
}
function pct(v: number, total: number): string {
  if (total <= 0) return "0%"
  return `${((v / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
}

const s = StyleSheet.create({
  page: { padding: CM * 1.5, paddingBottom: CM * 1.8, fontSize: 10, fontFamily: "Helvetica", color: "#111827", lineHeight: 1.4 },
  logoBox: { alignItems: "center", marginBottom: 6 },
  logo: { width: 110, objectFit: "contain" },
  org: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 11 },
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 15, marginTop: 8 },
  subtitulo: { textAlign: "center", color: "#4b5563", fontSize: 10, marginTop: 4, marginBottom: 12 },
  secao: { fontFamily: "Helvetica-Bold", fontSize: 11.5, marginTop: 12, marginBottom: 5, color: "#091747" },
  grade: { flexDirection: "row", flexWrap: "wrap" },
  campo: { width: "50%", paddingRight: 8, marginBottom: 5 },
  rotulo: { fontSize: 8.5, color: "#4b5563" },
  valor: { fontSize: 10 },
  tile: { width: "25%", paddingRight: 8, marginBottom: 6 },
  tileValor: { fontFamily: "Helvetica-Bold", fontSize: 13 },
  pergunta: { marginBottom: 9 },
  perguntaTitulo: { fontFamily: "Helvetica-Bold", marginBottom: 3 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingVertical: 2.5 },
  cabecalho: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#111827", paddingVertical: 2.5, fontFamily: "Helvetica-Bold", fontSize: 9 },
  cel: { flex: 1 },
  celNum: { width: 70, textAlign: "right" },
  celPct: { width: 50, textAlign: "right", color: "#4b5563" },
  vNum: { width: 26, color: "#6b7280" },
  vNome: { flex: 1, paddingRight: 4 },
  vCpf: { width: 86 },
  vMat: { width: 62 },
  vCanal: { width: 66 },
  vQuando: { width: 88, textAlign: "right" },
  nota: { fontSize: 8.5, color: "#4b5563", marginTop: 3 },
  vencedor: { fontFamily: "Helvetica-Bold" },
  rodape: { position: "absolute", bottom: CM, left: CM * 1.5, right: CM * 1.5, fontSize: 8, color: "#6b7280", flexDirection: "row", justifyContent: "space-between" },
})

const TITULO: Record<string, string> = {
  votantes: "Relação dos votantes",
  resultado: "Resultado da assembleia",
  completo: "Relatório completo da assembleia",
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={s.campo}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <Text style={s.valor}>{valor}</Text>
    </View>
  )
}

function Tile({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.rotulo}>{rotulo}</Text>
      <Text style={s.tileValor}>{valor}</Text>
    </View>
  )
}

export function RelatorioApuracaoPDF({
  dados,
  tipo,
  secoes,
  entidade,
  logoDataUri,
}: {
  dados: DadosRelatorioApuracao
  tipo: string
  secoes: SecaoRelatorio[]
  entidade: string | null
  logoDataUri: string | null
}) {
  const d = dados
  const ap = d.apuracao
  const tem = (x: SecaoRelatorio) => secoes.includes(x)
  const gerado = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
  const ausentes = Math.max(ap.aptos - ap.votantes, 0)

  return (
    <Document title={`${TITULO[tipo] ?? "Relatório"} — ${d.assembleia.nome ?? "assembleia"}`}>
      <Page size="A4" style={s.page}>
        {logoDataUri ? (
          <View style={s.logoBox}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logo} src={logoDataUri} />
          </View>
        ) : null}
        {entidade ? <Text style={s.org}>{entidade}</Text> : null}
        <Text style={s.titulo}>{TITULO[tipo] ?? "Relatório"}</Text>
        <Text style={s.subtitulo}>
          {[d.assembleia.nome, d.rodada].filter(Boolean).join(" · ")}
        </Text>

        {tem("informacoes") && (
          <>
            <Text style={s.secao}>Informações da assembleia</Text>
            <View style={s.grade}>
              <Campo rotulo="Campanha" valor={d.campanha ?? "—"} />
              <Campo rotulo="Rodada" valor={d.rodada ?? "—"} />
              <Campo rotulo="Assembleia" valor={d.assembleia.nome ?? "—"} />
              <Campo rotulo="Modalidade" valor={d.assembleia.modalidade} />
              <Campo rotulo="Abertura" valor={formatarDataHora(d.assembleia.inicio)} />
              <Campo rotulo="Encerramento" valor={formatarDataHora(d.assembleia.termino)} />
              <Campo
                rotulo="Período da rodada"
                valor={`${formatarData(d.rodadaPeriodo.inicio)} a ${formatarData(d.rodadaPeriodo.termino)}`}
              />
              <Campo rotulo="Fonte pagadora" valor={d.fontes.length ? d.fontes.join(", ") : "—"} />
              <Campo rotulo="Público" valor={d.assembleia.somenteFiliados ? "Somente filiados" : "Toda a base apta"} />
              <Campo rotulo="Voto em separado" valor={d.assembleia.votoEmSeparado ? "Permitido" : "Não"} />
              {d.assembleia.sala && (
                <Campo
                  rotulo="Sala virtual"
                  valor={`${formatarData(d.assembleia.sala.data)}${d.assembleia.sala.hora ? ` às ${d.assembleia.sala.hora}` : ""} — ${d.assembleia.sala.link}`}
                />
              )}
              <Campo rotulo="Apuração" valor={ap.apuracaoEncerrada ? "Encerrada (resultado oficial)" : "Em aberto (resultado provisório)"} />
            </View>
            {d.assembleia.descricao ? <Text style={s.nota}>{d.assembleia.descricao}</Text> : null}
          </>
        )}

        {tem("comparecimento") && (
          <>
            <Text style={s.secao}>Comparecimento</Text>
            <View style={s.grade}>
              <Tile rotulo="Aptos a votar" valor={n(ap.aptos)} />
              <Tile rotulo="Votaram" valor={n(ap.votantes)} />
              <Tile rotulo="Não votaram" valor={n(ausentes)} />
              <Tile rotulo="Participação" valor={pct(ap.votantes, ap.aptos)} />
            </View>
            {d.rodadaComVarias && (
              <Text style={s.nota}>
                Aptos e votantes são da rodada inteira: o apto vota uma vez, em qualquer assembleia dela.
              </Text>
            )}
          </>
        )}

        {tem("resultado") && (
          <>
            <Text style={s.secao}>Resultado por pergunta</Text>
            {ap.perguntas.length === 0 && <Text style={s.nota}>Nenhuma pergunta cadastrada.</Text>}
            {ap.perguntas.map((p, i) => {
              const maior = Math.max(0, ...p.opcoes.map((o) => o.votos))
              return (
                <View key={p.id} style={s.pergunta} wrap={false}>
                  <Text style={s.perguntaTitulo}>
                    {i + 1}. {p.pergunta ?? "Pergunta"} ({n(p.totalVotos)} voto{p.totalVotos === 1 ? "" : "s"})
                  </Text>
                  {p.opcoes.map((o) => (
                    <View key={o.id} style={s.linha}>
                      <Text style={[s.cel, maior > 0 && o.votos === maior ? s.vencedor : {}]}>{o.texto ?? "(opção)"}</Text>
                      <Text style={s.celNum}>{n(o.votos)}</Text>
                      <Text style={s.celPct}>{pct(o.votos, p.totalVotos)}</Text>
                    </View>
                  ))}
                  {(p.branco > 0 || p.nulo > 0) && (
                    <>
                      <View style={s.linha}>
                        <Text style={s.cel}>Branco</Text>
                        <Text style={s.celNum}>{n(p.branco)}</Text>
                        <Text style={s.celPct}>{pct(p.branco, p.totalVotos)}</Text>
                      </View>
                      <View style={s.linha}>
                        <Text style={s.cel}>Nulo</Text>
                        <Text style={s.celNum}>{n(p.nulo)}</Text>
                        <Text style={s.celPct}>{pct(p.nulo, p.totalVotos)}</Text>
                      </View>
                    </>
                  )}
                </View>
              )
            })}
          </>
        )}

        {tem("perguntas") && (
          <>
            <Text style={s.secao}>Perguntas e opções</Text>
            {ap.perguntas.map((p, i) => (
              <View key={p.id} style={s.pergunta} wrap={false}>
                <Text style={s.perguntaTitulo}>
                  {i + 1}. {p.pergunta ?? "Pergunta"}
                </Text>
                {p.opcoes.map((o) => (
                  <Text key={o.id}>• {o.texto ?? "(opção)"}</Text>
                ))}
              </View>
            ))}
          </>
        )}

        {tem("em_separado") && (
          <>
            <Text style={s.secao}>Votos em separado</Text>
            <View style={s.grade}>
              <Tile rotulo="Registrados" valor={n(d.emSeparado.total)} />
              <Tile rotulo="Deferidos" valor={n(d.emSeparado.deferido)} />
              <Tile rotulo="Indeferidos" valor={n(d.emSeparado.indeferido)} />
              <Tile rotulo="Pendentes" valor={n(d.emSeparado.pendente)} />
            </View>
          </>
        )}

        {tem("urnas") && d.votosPorUrna.length > 0 && (
          <>
            <Text style={s.secao}>Comparecimento por urna</Text>
            {d.votosPorUrna.map((u, i) => (
              <View key={i} style={s.linha}>
                <Text style={s.cel}>{u.urna ?? "Urna"}</Text>
                <Text style={s.celNum}>{n(u.compareceram)}</Text>
              </View>
            ))}
          </>
        )}

        {tem("votantes") && (
          <>
            <Text style={s.secao}>
              Relação dos votantes ({n(d.votantes.length)})
            </Text>
            <View style={s.cabecalho}>
              <Text style={s.vNum}>#</Text>
              <Text style={s.vNome}>Nome</Text>
              <Text style={s.vCpf}>CPF</Text>
              <Text style={s.vMat}>Matrícula</Text>
              <Text style={s.vCanal}>Canal</Text>
              <Text style={s.vQuando}>Votou em</Text>
            </View>
            {d.votantes.map((v, i) => (
              <View key={i} style={s.linha} wrap={false}>
                <Text style={s.vNum}>{i + 1}</Text>
                <Text style={s.vNome}>{v.nome ?? "—"}</Text>
                <Text style={s.vCpf}>{v.cpf ? formatarCnpjCpf(v.cpf) : "—"}</Text>
                <Text style={s.vMat}>{v.matricula ?? "—"}</Text>
                <Text style={s.vCanal}>{v.canal ?? "—"}</Text>
                <Text style={s.vQuando}>{formatarDataHora(v.quando)}</Text>
              </View>
            ))}
            <Text style={s.nota}>
              A relação registra a participação, nunca o conteúdo do voto, que é secreto.
              {d.rodadaComVarias
                ? " Como a rodada tem mais de uma assembleia, entram os votos pela urna desta assembleia ou, online, dentro da janela dela."
                : ""}
            </Text>
          </>
        )}

        <View style={s.rodape} fixed>
          <Text>Gerado pelo Confluir em {gerado}.</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
