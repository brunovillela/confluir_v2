import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Search, TriangleAlert, Users, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { requirePermissao } from "@/lib/auth"
import { formatarData } from "@/lib/formato"
import { listarQuadro, type PessoaQuadro } from "@/lib/db/quadro"
import { VINCULOS_INSTITUICAO } from "@/lib/vinculos-instituicao"

import { ClassificarForm } from "./classificar-form"

export const metadata: Metadata = { title: "Quadro da entidade — Confluir" }

const SEM = "sem"
const CONFERIR = "conferir"

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

export default async function QuadroPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; busca?: string }>
}) {
  await requirePermissao("permissoes", ["configuracoes"])
  const { filtro: filtroBruto, busca = "" } = await searchParams
  const pessoas = await listarQuadro()

  const conferir = pessoas.filter((p) => p.alertas.length > 0)
  const filtro = filtroBruto ?? (conferir.length > 0 ? CONFERIR : "todos")
  const contagem = (f: string) =>
    f === CONFERIR
      ? conferir.length
      : f === SEM
        ? pessoas.filter((p) => !p.classificacao).length
        : f === "todos"
          ? pessoas.length
          : pessoas.filter((p) => p.classificacao === f).length

  const termo = semAcento(busca.trim())
  const lista = pessoas
    .filter((p) =>
      filtro === CONFERIR
        ? p.alertas.length > 0
        : filtro === SEM
          ? !p.classificacao
          : filtro === "todos"
            ? true
            : p.classificacao === filtro
    )
    .filter((p) => !termo || semAcento(`${p.nome ?? ""} ${p.email ?? ""}`).includes(termo))

  const url = (f: string) =>
    `/painel/institucional/usuarios/quadro?filtro=${encodeURIComponent(f)}${busca ? `&busca=${encodeURIComponent(busca)}` : ""}`
  const filtros: { chave: string; rotulo: string }[] = [
    { chave: CONFERIR, rotulo: "A conferir" },
    { chave: "todos", rotulo: "Todos" },
    ...VINCULOS_INSTITUICAO.map((v) => ({ chave: v, rotulo: v })),
    { chave: SEM, rotulo: "Sem classificação" },
  ]

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/institucional/usuarios">
            <ArrowLeft />
            Usuários e permissões
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Quadro da entidade</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Quem é funcionário, diretor, prestador, aprendiz ou estagiário da entidade. A classificação
          decide quem aparece nos aniversários do painel, no caixa e no convite em lote; o vínculo
          trabalhista com a entidade, quem aparece no Pessoal. Aqui estão as duas coisas lado a lado.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {filtros.map((f) => (
          <Button
            key={f.chave}
            asChild
            size="sm"
            variant={filtro === f.chave ? "default" : "outline"}
          >
            <Link href={url(f.chave)}>
              {f.chave === CONFERIR && <TriangleAlert />}
              {f.rotulo}
              <span className="tabular-nums opacity-70">{contagem(f.chave)}</span>
            </Link>
          </Button>
        ))}
      </div>

      <form className="flex gap-2">
        <input type="hidden" name="filtro" value={filtro} />
        <Input name="busca" defaultValue={busca} placeholder="Nome ou e-mail" className="w-full sm:w-72" />
        <Button type="submit" variant="outline" size="icon" aria-label="Buscar">
          <Search />
        </Button>
        {busca && (
          <Button asChild variant="ghost" size="icon" title="Limpar">
            <Link href={url(filtro)}>
              <X />
            </Link>
          </Button>
        )}
      </form>

      {lista.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <Users className="size-6" />
            {filtro === CONFERIR && !busca ? "Nada a conferir: classificação e Pessoal batem." : "Ninguém neste filtro."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {lista.map((p) => (
            <LinhaPessoa key={p.usuarioId} pessoa={p} />
          ))}
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Não achou alguém? A lista mostra quem já tem classificação ou vínculo trabalhista com a
        entidade. Para incluir outra pessoa, use <strong>Nova pessoa</strong> em Usuários e permissões
        — ela já sai classificada.
      </p>
    </>
  )
}

function LinhaPessoa({ pessoa: p }: { pessoa: PessoaQuadro }) {
  return (
    <Card className={p.alertas.length > 0 ? "border-warning/50" : undefined}>
      <CardContent className="grid gap-4 md:grid-cols-[1fr_18rem]">
        <div className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{p.nome ?? "(sem nome)"}</span>
            {p.filiado && <Badge variant="outline">Filiado</Badge>}
            {p.temLogin && <Badge variant="outline">Login</Badge>}
            {p.temAcesso && <Badge variant="outline">Acesso ao painel</Badge>}
            {p.excluido ? (
              <Badge variant="destructive">Cadastro excluído</Badge>
            ) : (
              p.inativo && <Badge variant="secondary">Inativo</Badge>
            )}
          </div>
          {p.email && <span className="text-muted-foreground -mt-1 truncate text-xs">{p.email}</span>}

          <dl className="grid gap-1 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">Na entidade (Pessoal):</dt>
              <dd>
                {p.vinculosEntidade.length === 0
                  ? "sem vínculo trabalhista"
                  : p.vinculosEntidade
                      .map((v) =>
                        [
                          v.cargo ?? v.contrato ?? "vínculo",
                          v.matricula ? `mat. ${v.matricula}` : null,
                          v.admissao ? `desde ${formatarData(v.admissao)}` : null,
                          v.demissao ? `até ${formatarData(v.demissao)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      )
                      .join("; ")}
                {p.temRegistrosPessoal && (
                  <span className="text-muted-foreground"> — com contracheque, ponto ou férias</span>
                )}
              </dd>
            </div>
            {p.outrasEmpresas.length > 0 && (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">Em outras empresas:</dt>
                <dd>
                  {p.outrasEmpresas
                    .map((e) => [e.empresa, e.matricula ? `mat. ${e.matricula}` : null].filter(Boolean).join(" · "))
                    .join("; ")}
                </dd>
              </div>
            )}
          </dl>

          {p.alertas.length > 0 && (
            <ul className="text-warning-fg grid gap-0.5 text-xs">
              {p.alertas.map((a) => (
                <li key={a} className="flex items-start gap-1.5">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid content-start gap-2">
          {p.excluido ? (
            <p className="text-muted-foreground text-xs">
              Se a pessoa saiu, registre a demissão no Pessoal para ela deixar de contar como ativa.
            </p>
          ) : (
            <ClassificarForm
              usuarioId={p.usuarioId}
              atual={p.classificacao}
              sugestao={p.sugestao}
              vinculosEntidade={p.vinculosEntidade.length}
            />
          )}
          {p.vinculosEntidade.length > 0 && (
            <Link href={`/painel/pessoal/${p.usuarioId}`} className="text-primary justify-self-start text-xs underline-offset-2 hover:underline">
              Abrir no Pessoal
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
