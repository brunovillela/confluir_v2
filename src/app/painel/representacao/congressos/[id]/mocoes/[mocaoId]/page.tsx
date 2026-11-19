import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import QRCode from "qrcode"
import { FileDown } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { ROTULO_MEIO, ROTULO_NIVEL } from "@/lib/congressos/mocoes"
import { listarUnidades, obterCongresso } from "@/lib/db/congressos"
import { dadosDaMocao, EXPLICA_LOCAL, EXPLICA_NOMES, ROTULO_SITUACAO_MOCAO } from "@/lib/db/congressos-mocoes"
import { formatarDataHora } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { origemAtual } from "@/lib/tenant-url"

import { AcoesMocao, LancarAssinatura, MocaoForm, ProgressoLimiar, RetirarAssinaturaMesa } from "../../../mocoes-componentes"

export const metadata: Metadata = { title: "Moção — Confluir" }

const ACAO: Record<string, string> = {
  criada: "Moção criada",
  alterada: "Moção alterada",
  nova_versao: "Texto alterado (versão nova)",
  assinatura_retirada: "Assinatura retirada",
  protocolada: "Protocolada",
  habilitada: "Habilitada",
  nao_habilitada: "Não habilitada",
  retirada: "Retirada",
  aprovada: "Aprovada na plenária",
  rejeitada: "Rejeitada na plenária",
}

export default async function MocaoPage({ params }: { params: Promise<{ id: string; mocaoId: string }> }) {
  const sessao = await requirePermissao("congressos_relatoria", ["congressos_gestao", "congressos_credenciamento"])
  const decide = podeAcessar(sessao.permissoes, "congressos_relatoria", ["congressos_gestao"])
  const { id, mocaoId } = await params
  const c = await obterCongresso(id)
  if (!c) notFound()
  const [d, unidades, origem] = await Promise.all([dadosDaMocao(c, mocaoId), listarUnidades(id), origemAtual()])
  if (!d) notFound()
  const m = d.mocao
  const linkPublico = `${origem}/congresso/mocao/${m.codigo}`
  const qr = await QRCode.toDataURL(linkPublico, { errorCorrectionLevel: "M", margin: 1, width: 480 })
  const atuais = d.assinaturas.filter((a) => a.versao === m.versao)
  const anteriores = d.assinaturas.filter((a) => a.versao !== m.versao && !a.retiradaEm).length
  const base = `/painel/representacao/congressos/${id}`
  const emColeta = m.situacao === "coleta"

  return (
    <>
      <RotuloTrilha valores={{ congressos: "Congressos", [id]: c.nome, mocoes: "Moções", [mocaoId]: `Moção ${m.numero}` }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Moção {m.numero}: {m.titulo}
          </h1>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={m.situacao === "aprovada" || m.situacao === "habilitada" ? "success" : m.situacao === "rejeitada" || m.situacao === "nao_habilitada" ? "destructive" : "secondary"}>
              {ROTULO_SITUACAO_MOCAO[m.situacao]}
            </Badge>
            {m.tipo && <span>{m.tipo}</span>}
            {m.unidade && <span>· Base de origem: {m.unidade}</span>}
            {m.proponenteNome && <span>· Apresentada por {m.proponenteNome}</span>}
            <span>· versão {m.versao}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/mocoes/${mocaoId}/pdf`} target="_blank">
              <FileDown />
              PDF com as assinaturas
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}?aba=mocoes`}>Todas as moções</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Texto</CardTitle>
              {m.destinatario && <CardDescription>Destinatário: {m.destinatario}</CardDescription>}
            </CardHeader>
            <CardContent className="grid gap-3">
              <p className="whitespace-pre-wrap">{m.texto}</p>
              <p className="text-muted-foreground font-mono text-[11px] break-all">SHA-256: {m.textoHash}</p>
              {m.decisaoMotivo && <p className="text-sm">Motivo registrado: {m.decisaoMotivo}</p>}
            </CardContent>
          </Card>

          {decide && (
            <Card>
              <CardHeader>
                <CardTitle>Andamento</CardTitle>
                <CardDescription>
                  {d.regras.habilitacao === "assinaturas"
                    ? d.regras.aceiteComissao
                      ? "Atingido o mínimo, protocola-se; a comissão decide se habilita."
                      : "Atingido o mínimo, protocola-se e a moção vai à pauta da plenária."
                    : d.regras.habilitacao === "voto_grupo"
                      ? "A moção chega à plenária aprovada no grupo: protocole e habilite com o registro do grupo."
                      : "A comissão decide se a moção vai à plenária."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AcoesMocao origem={{ tipo: "painel", congressoId: id }} mocaoId={mocaoId} situacao={m.situacao} podeDecidir={decide} />
              </CardContent>
            </Card>
          )}

          {emColeta && (
            <Card>
              <CardHeader>
                <CardTitle>Lançar assinatura</CardTitle>
                <CardDescription>
                  Para quem assina na mesa (com o crachá) ou para lançar a folha de papel. {EXPLICA_LOCAL[d.regras.regraLocal]}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LancarAssinatura congressoId={id} mocaoId={mocaoId} meioPermitido={d.regras.meio} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Assinaturas · {atuais.filter((a) => !a.retiradaEm).length}</CardTitle>
              <CardDescription>
                {EXPLICA_NOMES[d.regras.nomesVisiveis]}
                {anteriores > 0 ? ` ${anteriores} assinatura(s) de versões anteriores não contam.` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {atuais.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhuma assinatura nesta versão.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Papel · base</TableHead>
                        <TableHead>Meio e prova</TableHead>
                        <TableHead>Quando</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {atuais.map((a) => (
                        <TableRow key={a.id} className={a.retiradaEm ? "text-muted-foreground line-through" : ""}>
                          <TableCell className="font-medium">{a.nome}</TableCell>
                          <TableCell className="text-sm">
                            {a.papel ?? "—"}
                            {a.unidade ? ` · ${a.unidade}` : ""}
                          </TableCell>
                          <TableCell className="text-sm">
                            {ROTULO_MEIO[a.meio]}
                            {a.nivel ? ` · ${ROTULO_NIVEL[a.nivel]}` : a.modalidade === "distancia" ? " · a distância" : ""}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatarDataHora(a.createdAt)}</TableCell>
                          <TableCell>
                            {emColeta && !a.retiradaEm && <RetirarAssinaturaMesa congressoId={id} mocaoId={mocaoId} participanteId={a.participanteId} nome={a.nome} />}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {emColeta && decide && (
            <Card>
              <CardHeader>
                <CardTitle>Alterar a moção</CardTitle>
                <CardDescription>Com assinaturas, mudar o texto cria versão nova e quem assinou precisa assinar de novo.</CardDescription>
              </CardHeader>
              <CardContent>
                <MocaoForm
                  origem={{ tipo: "painel", congressoId: id }}
                  tipos={d.regras.tipos}
                  bases={unidades.map((u) => ({ id: u.id, nome: u.nome }))}
                  mocaoId={mocaoId}
                  temAssinaturas={atuais.some((a) => !a.retiradaEm)}
                  inicial={{ tipo: m.tipo, titulo: m.titulo, destinatario: m.destinatario, texto: m.texto, unidadeId: m.unidadeId }}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid h-fit gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Mínimo</CardTitle>
              {m.protocoladaEm && <CardDescription>Calculado no protocolo, em {formatarDataHora(m.protocoladaEm)}.</CardDescription>}
            </CardHeader>
            <CardContent>
              <ProgressoLimiar limiar={d.limiar} gravado={!emColeta} />
            </CardContent>
          </Card>
          {emColeta && (
            <Card>
              <CardHeader>
                <CardTitle>QR para assinar</CardTitle>
                <CardDescription>Projete ou imprima: quem lê com o celular abre a moção e assina pelo próprio link pessoal.</CardDescription>
              </CardHeader>
              <CardContent className="grid justify-items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt={`QR da moção ${m.numero}`} className="w-full max-w-64 rounded-md border bg-white p-2" />
                <code className="text-muted-foreground text-xs break-all">{linkPublico}</code>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Trilha</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1 text-xs">
                {d.eventos.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">{ACAO[e.acao] ?? e.acao}</span>
                    {e.autor ? ` · ${e.autor}` : ""} · {formatarDataHora(e.createdAt)}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
