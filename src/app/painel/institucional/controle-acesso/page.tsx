import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Circle, Download, ScanFace, XCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { listarAgentes, montarVerificacoes, type AgenteAcesso } from "@/lib/acesso-agente"
import { CONECTORES, ONLINE_ATE_MS } from "@/lib/acesso-agente-constantes"
import { requirePermissao } from "@/lib/auth"
import { listarSedes } from "@/lib/db/espacos"
import { formatarDataHora } from "@/lib/formato"
import { origemAtual } from "@/lib/tenant-url"

import { AtualizarSozinho, DesligarBotao, NovoAgenteForm, NovoCodigoBotao, VerificarBotao } from "./forms"

export const metadata: Metadata = { title: "Controle de acesso — Confluir" }

function Situacao({ a, agora }: { a: AgenteAcesso; agora: number }) {
  if (!a.pareadoEm) return <Badge variant="warning">Aguardando pareamento</Badge>
  const online = !!a.ultimoContatoEm && agora - new Date(a.ultimoContatoEm).getTime() < ONLINE_ATE_MS
  return online ? <Badge variant="success">Online</Badge> : <Badge variant="error">Offline</Badge>
}

function CartaoAgente({ a, agora }: { a: AgenteAcesso; agora: number }) {
  const itens = montarVerificacoes(a, agora)
  const conector = CONECTORES.find((c) => c.chave === a.conector)?.rotulo ?? a.conector
  return (
    <div className="grid gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{a.nome}</p>
            <Situacao a={a} agora={agora} />
          </div>
          <p className="text-muted-foreground text-xs">
            {a.sedeNome ?? "Sede não informada"} · {conector}
            {a.maquina && <> · {a.maquina}</>}
            {a.versao && <> · agente {a.versao}</>}
          </p>
          {a.ultimoContatoEm && <p className="text-muted-foreground text-xs">Último contato: {formatarDataHora(a.ultimoContatoEm)}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {a.pareadoEm && <VerificarBotao agenteId={a.id} pendenteNoAgente={a.verificacaoPendente} />}
          <DesligarBotao agenteId={a.id} nome={a.nome} />
        </div>
      </div>

      <ul className="grid gap-2">
        {itens.map((v) => (
          <li key={v.id} className="flex items-start gap-2 text-sm">
            {v.situacao === "ok" ? (
              <CheckCircle2 className="text-success-fg mt-0.5 size-4 shrink-0" aria-label="Conferido" />
            ) : v.situacao === "falha" ? (
              <XCircle className="text-destructive mt-0.5 size-4 shrink-0" aria-label="Falhou" />
            ) : (
              <Circle className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-label="Aguardando" />
            )}
            <span>
              <span className={v.situacao === "aguardando" ? "text-muted-foreground" : "font-medium"}>{v.rotulo}</span>
              <span className="text-muted-foreground block text-xs">{v.situacao === "falha" && v.mensagem ? v.mensagem : v.confere}</span>
            </span>
          </li>
        ))}
      </ul>

      {a.diagnosticoEm && <p className="text-muted-foreground text-xs">Última verificação do agente: {formatarDataHora(a.diagnosticoEm)}</p>}

      {!a.pareadoEm ? (
        <div className="grid gap-2 border-t pt-3">
          <p className="text-muted-foreground text-xs">
            {a.codigoExpiraEm && new Date(a.codigoExpiraEm).getTime() > agora
              ? `O código gerado vale até ${formatarDataHora(a.codigoExpiraEm)}. Perdeu o código? Gere outro.`
              : "O código venceu. Gere outro e digite no assistente do agente."}
          </p>
          <NovoCodigoBotao agenteId={a.id} />
        </div>
      ) : (
        <details className="border-t pt-3 text-xs">
          <summary className="text-muted-foreground cursor-pointer">Trocar o computador desta recepção</summary>
          <p className="text-muted-foreground my-2">Instale o agente no computador novo e digite um código novo. O computador antigo para de funcionar assim que o novo parear.</p>
          <NovoCodigoBotao agenteId={a.id} />
        </details>
      )}
    </div>
  )
}

/**
 * Agentes do controle de acesso: o computador da recepção de cada sede liga
 * o Confluir ao sistema de catracas (proposta do autoatendimento de
 * visitantes). Cadastro com código de pareamento e lista de verificação.
 */
export default async function ControleAcessoPage() {
  await requirePermissao("configuracoes")
  const [{ disponivel, agentes }, sedes, origem] = await Promise.all([listarAgentes(), listarSedes(), origemAtual()])
  // eslint-disable-next-line react-hooks/purity -- instante da renderização (status online/offline)
  const agora = Date.now()

  return (
    <>
      <AtualizarSozinho ms={5000} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional">
            <ArrowLeft />
            Institucional
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <ScanFace className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Controle de acesso</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          O agente instalado no computador da recepção liga o Confluir ao sistema de catracas da sede. Ele só faz conexões de saída: não é preciso abrir porta no firewall.
        </p>
      </div>

      {!disponivel ? (
        <Alert>
          <AlertDescription>Falta aplicar a migração do controle de acesso (supabase/migrations/…_acesso_agentes.sql).</AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Computadores das recepções</CardTitle>
              <CardDescription className="text-xs">A lista se atualiza sozinha. Verde em tudo quer dizer que a sede está pronta para receber visitantes do totem.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {agentes.length === 0 ? <p className="text-muted-foreground text-sm">Nenhum computador cadastrado ainda.</p> : agentes.map((a) => <CartaoAgente key={a.id} a={a} agora={agora} />)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cadastrar o computador de uma recepção</CardTitle>
              <CardDescription className="text-xs">
                Cadastre aqui, instale o agente no computador e digite o código de 6 dígitos no assistente.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <NovoAgenteForm sedes={sedes} />
              <div className="grid gap-2 border-t pt-4 text-sm">
                <p className="font-medium">Como instalar no computador da recepção</p>
                <ol className="text-muted-foreground grid list-decimal gap-1 pl-5 text-xs">
                  <li>
                    Baixe os dois arquivos do agente e salve na mesma pasta (ex.: <code className="font-mono">C:\Confluir</code>).
                  </li>
                  <li>
                    Clique com o botão direito em <code className="font-mono">instalar.ps1</code> e escolha <em>Executar com o PowerShell</em>. Se faltar o Node.js, o instalador avisa como instalar.
                  </li>
                  <li>
                    Quando ele pedir, informe o endereço <code className="font-mono">{origem}</code> e o código de 6 dígitos.
                  </li>
                  <li>O agente passa a iniciar sozinho com o Windows. Volte a esta tela e confira a lista de verificação.</li>
                </ol>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href="/agente-acesso/instalar.ps1" download>
                      <Download />
                      instalar.ps1
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href="/agente-acesso/agente-confluir.mjs" download>
                      <Download />
                      agente-confluir.mjs
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
