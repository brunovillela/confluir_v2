import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Landmark } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { PedirDadosBancarios } from "@/components/pedir-dados-bancarios"
import {
  contatosDosDonos,
  mascararDocumento,
  mascararTexto,
  ordensEsperandoConta,
  saudeDasContas,
  type ContatoDono,
  type ContaRevisao,
  type DonoConta,
} from "@/lib/db/contas-saude"
import { ROTULO_ORIGEM } from "@/lib/db/dados-bancarios-pessoa"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { BotaoConferir, BotaoDesfazerConferencia, BotaoJuntar, CorrigirTitular } from "./acoes"

export const metadata: Metadata = { title: "Contas bancárias — Confluir" }

const FICHA: Record<DonoConta["tipo"], string> = {
  fornecedor: "/painel/compras/fornecedores/",
  usuario: "/painel/pessoal/",
  filiado: "/painel/filiados/",
}

function Dono({ dono }: { dono: DonoConta }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Link href={`${FICHA[dono.tipo]}${dono.id}#dados-bancarios`} className="font-medium hover:underline">
        {dono.nome}
      </Link>
      <span className="text-muted-foreground text-xs">{mascararDocumento(dono.documento)}</span>
      <Badge variant="outline">{ROTULO_ORIGEM[dono.tipo]}</Badge>
    </span>
  )
}

function Conta({ c }: { c: ContaRevisao }) {
  const meio = c.conta
    ? [c.banco ?? "banco ?", c.agencia ? `ag. ${c.agencia}` : null, `conta ${c.conta}`].filter(Boolean).join(" · ")
    : `Pix ${c.pixTipo ? `${c.pixTipo}: ` : ""}${c.pix ?? ""}`
  return (
    <span className="text-sm">
      {meio}
      <span className="text-muted-foreground">
        {" "}
        · {c.ordens} ordem(ns)
        {c.abertas > 0 && (
          <span className="text-warning-fg font-medium">
            {" "}
            · {c.abertas} a pagar{c.valorAberto > 0 ? `, ${formatarMoeda(c.valorAberto)}` : ""}
          </span>
        )}
        {c.titularDocumento ? ` · titular ${mascararDocumento(c.titularDocumento)}` : ""}
        {c.favorito ? " · principal" : ""}
      </span>
    </span>
  )
}

function Secao({ titulo, descricao, vazio, children, total }: { titulo: string; descricao: string; vazio: string; total: number; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {titulo}
          <Badge variant={total ? "secondary" : "outline"}>{total}</Badge>
        </CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">{total === 0 ? <p className="text-muted-foreground text-sm">{vazio}</p> : children}</CardContent>
    </Card>
  )
}

/**
 * Saúde das contas bancárias: repetidas (com Juntar), a mesma conta em
 * pessoas diferentes, titular de outra pessoa e conta sem documento (com o
 * campo para gravar). Ver lib/db/contas-saude.ts.
 */
export default async function ContasBancariasPage() {
  const sessao = await requirePermissao("financeiro_pagamento", ["financeiro_leitura"])
  const podeAgir = podeAcessar(sessao.permissoes, "financeiro_pagamento")
  const [s, esperando] = await Promise.all([saudeDasContas(), ordensEsperandoConta()])
  // Um pedido serve a todas as ordens do mesmo favorecido.
  const grupos = new Map<string, typeof esperando>()
  for (const o of esperando) {
    const k = o.dono ? `${o.dono.tipo}:${o.dono.id}` : o.id
    grupos.set(k, [...(grupos.get(k) ?? []), o])
  }
  const porFavorecido = [...grupos.values()]
  // Titular errado ou sem documento: pedir a conta certa ao próprio favorecido.
  const contatos = podeAgir
    ? await contatosDosDonos([...s.outroTitular, ...s.semDocumento].map(({ conta }) => ({ tipo: conta.dono.tipo, id: conta.dono.id })))
    : new Map<string, ContatoDono>()
  const pedir = (dono: DonoConta) => {
    const c = contatos.get(`${dono.tipo}:${dono.id}`)
    if (!c) return null
    return (
      <div>
        <PedirDadosBancarios dono={{ tipo: dono.tipo, id: dono.id }} emailSugerido={c.email} telefoneSugerido={c.telefone} pendente={c.pedido} />
      </div>
    )
  }
  const sobrando = s.repetidas.reduce((n, g) => n + g.copias.length, 0)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/financeiro">
            <ArrowLeft />
            Financeiro
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Landmark className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Contas bancárias</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {s.total} contas e chaves Pix de fornecedores, filiados e funcionários. Aqui ficam as que pedem atenção antes de virar
          pagamento errado ou recusado pelo banco. Em cada seção vêm primeiro as contas com ordens a pagar (maior valor no topo).
        </p>
      </div>

      <Secao
        titulo="Ordens esperando conta"
        total={esperando.length}
        descricao={'Agrupadas por favorecido. Ordens abertas sem forma de pagamento porque o favorecido não tem chave Pix nem conta cadastrada. "Pedir dados bancários" manda a ele um link; quando ele responde, a ordem recebe a forma e a conta sozinha.'}
        vazio="Nenhuma ordem esperando conta."
      >
        {porFavorecido.map(([o, ...outras]) => (
          <div key={o.id} className="grid gap-1.5 rounded-lg border p-3">
            {[o, ...outras].map((x) => (
              <div key={x.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={`/painel/financeiro/ordens/${x.id}`} className="font-medium hover:underline">
                  {x.codigo ?? "Ordem"}
                </Link>
                {x.tipo && <Badge variant="outline">{x.tipo}</Badge>}
                <span className="text-muted-foreground">
                  {x.situacao}
                  {x.valor != null ? ` · ${formatarMoeda(x.valor)}` : ""}
                  {x.vencimento ? ` · vence ${formatarData(x.vencimento)}` : ""}
                </span>
              </div>
            ))}
            {o.dono ? (
              <Dono dono={o.dono} />
            ) : (
              <span className="text-sm">
                {o.favorecido}
                <span className="text-warning-fg text-xs"> · sem cadastro: corrija a ordem com a chave Pix ou cadastre o favorecido.</span>
              </span>
            )}
            {o.pedido?.abertoEm && (
              <span className="text-muted-foreground text-xs">O favorecido abriu o link em {formatarData(o.pedido.abertoEm)}, mas ainda não respondeu.</span>
            )}
            {podeAgir && o.dono && (
              <div>
                <PedirDadosBancarios
                  dono={{ tipo: o.dono.tipo, id: o.dono.id }}
                  emailSugerido={o.email}
                  telefoneSugerido={o.telefone}
                  pendente={o.pedido}
                />
              </div>
            )}
          </div>
        ))}
      </Secao>

      <Secao
        titulo="Repetidas"
        total={s.repetidas.length}
        descricao={`A mesma conta (ou chave Pix) mais de uma vez na mesma pessoa — no mesmo cadastro ou em papéis dela com o mesmo CPF. ${sobrando} cópia(s) sobrando. "Juntar" mantém a primeira e passa as ordens das outras para ela.`}
        vazio="Nenhuma conta repetida."
      >
        {s.repetidas.map((g) => (
          <div key={g.fica.id} className="grid gap-1.5 rounded-lg border p-3">
            <Dono dono={g.fica.dono} />
            <div className="grid gap-1 pl-1">
              <span className="text-success-fg text-xs">Fica:</span>
              <Conta c={g.fica} />
              <span className="text-muted-foreground text-xs">Sai{g.copias.length > 1 ? "em" : ""}:</span>
              {g.copias.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2">
                  {c.dono.id !== g.fica.dono.id && <Badge variant="outline">{ROTULO_ORIGEM[c.dono.tipo]}</Badge>}
                  <Conta c={c} />
                </div>
              ))}
            </div>
            {podeAgir && <BotaoJuntar fica={g.fica.id} copias={g.copias.map((c) => c.id)} />}
          </div>
        ))}
      </Secao>

      <Secao
        titulo="Mesma conta em pessoas diferentes"
        total={s.cruzadas.length}
        descricao="A mesma agência e conta em cadastros de CPF/CNPJ diferentes — pode ser cadastro duplicado (ex.: MEI no CNPJ e a pessoa no CPF) ou conta de terceiro. Confira nas fichas."
        vazio="Nenhuma."
      >
        {s.cruzadas.map((g) => (
          <div key={g[0].id} className="grid gap-1.5 rounded-lg border p-3">
            <Conta c={g[0]} />
            {g.map((c) => (
              <Dono key={c.id} dono={c.dono} />
            ))}
            {podeAgir && <BotaoConferir contas={g.map((c) => c.id)} />}
          </div>
        ))}
      </Secao>

      <Secao
        titulo="Titular de outra pessoa"
        total={s.outroTitular.length}
        descricao="O CPF/CNPJ do titular da conta não é o do cadastro (matriz e filial contam como o mesmo). A regra de auditoria alerta nas ordens e a remessa avisa. Na dúvida, peça os dados bancários ao próprio favorecido."
        vazio="Nenhuma."
      >
        {s.outroTitular.map(({ conta, motivo }) => (
          <div key={conta.id} className="grid gap-1.5 rounded-lg border p-3">
            <Dono dono={conta.dono} />
            <Conta c={conta} />
            {motivo !== "outro" && (
              <span className="text-warning-fg text-xs">
                {motivo === "cadastro_incompleto"
                  ? "O CPF/CNPJ do cadastro está incompleto — corrija o cadastro."
                  : "Difere do cadastro em até 2 dígitos — parece digitação."}
              </span>
            )}
            {podeAgir && motivo === "digitacao" && <CorrigirTitular conta={conta.id} sugestao={conta.dono.documento} />}
            {pedir(conta.dono)}
            {podeAgir && <BotaoConferir contas={[conta.id]} />}
          </div>
        ))}
      </Secao>

      <Secao
        titulo="Sem documento do titular"
        total={s.semDocumento.length}
        descricao="Conta sem o CPF/CNPJ do titular e com titular de outro nome (ou um número que não passa na validação). Grave o documento certo ou peça os dados bancários ao favorecido."
        vazio="Nenhuma."
      >
        {s.semDocumento.map(({ conta, dica }) => (
          <div key={conta.id} className="grid gap-1.5 rounded-lg border p-3">
            <Dono dono={conta.dono} />
            <Conta c={conta} />
            {conta.favorecido && <span className="text-muted-foreground text-xs">Titular informado: {mascararTexto(conta.favorecido)}</span>}
            {dica && <span className="text-warning-fg text-xs">{dica}</span>}
            {podeAgir && <CorrigirTitular conta={conta.id} />}
            {pedir(conta.dono)}
            {podeAgir && <BotaoConferir contas={[conta.id]} />}
          </div>
        ))}
      </Secao>

      {s.conferidas.length > 0 && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Conferidas <Badge variant="outline">{s.conferidas.length}</Badge>
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              aceitas como estão; saem das listas e a auditoria não alerta. Se o titular mudar, voltam sozinhas.
            </span>
          </summary>
          <div className="mt-3 grid gap-3">
            {s.conferidas.map((c) => (
              <div key={c.id} className="grid gap-1.5 rounded-lg border p-3">
                <Dono dono={c.dono} />
                <Conta c={c} />
                {c.conferida && (
                  <span className="text-muted-foreground text-xs">
                    Conferida em {formatarData(c.conferida.em)}
                    {c.conferida.por ? ` por ${c.conferida.por}` : ""}
                    {c.conferida.obs ? `: ${c.conferida.obs}` : ""}
                  </span>
                )}
                {podeAgir && <BotaoDesfazerConferencia conta={c.id} />}
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  )
}
