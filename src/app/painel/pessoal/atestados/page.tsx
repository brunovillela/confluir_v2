import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { linkDeOrdem } from "@/components/coluna-ordenavel"
import { TileIndicador } from "@/components/graficos/tile"
import { AbasLink } from "@/components/pessoal/abas-link"
import { FiltrosFuncionarios } from "@/components/pessoal/filtros-funcionarios"
import { TabelaFuncionarios } from "@/components/pessoal/tabela-funcionarios"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { SelectNativo } from "@/components/ui/select-nativo"
import { LembrarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { departamentosDaLista, funcionariosDaArea } from "@/lib/db/pessoal-area"
import { listarAtestados, listarAusencias, type Atestado, type Ausencia } from "@/lib/db/pessoal-saude"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { filtrarFuncionarios, lerFiltrosArea, ordenarPor, paramsDosFiltros } from "@/lib/pessoal-area"

import { RegistrosSaude } from "./registros-lista"

export const metadata: Metadata = { title: "Atestados e ausências — Confluir" }

const ORDENS = ["nome", "atestados", "dias", "ausencias", "ultimo"] as const
const anoDo = (d: string | null) => (d ?? "").slice(0, 4)

/**
 * Atestados e ausências — nível 1 do padrão das áreas do Pessoal: quem está
 * fora hoje, indicadores do ano e as abas Funcionários (inicial), Atestados
 * médicos e Ausências (estas com os formulários de lançar e editar).
 */
export default async function AtestadosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("pessoal_gestao")
  const sp = await searchParams
  const aba = sp.aba === "atestados" || sp.aba === "ausencias" ? sp.aba : "funcionarios"
  const [atestados, ausencias, funcionarios] = await Promise.all([listarAtestados(), listarAusencias(), funcionariosDaArea()])

  const hoje = hojeSP()
  const anoAtual = hoje.slice(0, 4)
  const cobreHoje = (i: { inicio: string | null; termino: string | null }) =>
    Boolean(i.inicio && i.inicio <= hoje && (i.termino ?? i.inicio) >= hoje)
  const foraHoje = new Set([...atestados.filter(cobreHoje), ...ausencias.filter(cobreHoje)].map((i) => i.funcionario_id))
  const atestadosAno = atestados.filter((a) => anoDo(a.inicio) === anoAtual)
  const diasAno = atestadosAno.reduce((s, a) => s + (a.quantidade_dias ?? 0), 0)
  const longos = atestadosAno.filter((a) => (a.quantidade_dias ?? 0) > 15)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Atestados e ausências</h1>
        <p className="text-muted-foreground mt-1 text-xs">Registros de saúde e afastamentos dos funcionários</p>
      </div>

      {sp.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Registro salvo.</AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador
          rotulo="Fora hoje"
          valor={String(foraHoje.size)}
          nota={
            foraHoje.size
              ? funcionarios.filter((f) => foraHoje.has(f.usuarioId)).map((f) => f.nome.split(" ")[0]).join(", ")
              : "ninguém afastado"
          }
        />
        <TileIndicador rotulo={`Atestados em ${anoAtual}`} valor={String(atestadosAno.length)} nota={`${diasAno} dia(s) de afastamento`} />
        <TileIndicador
          rotulo="Acima de 15 dias"
          valor={String(longos.length)}
          nota="a partir do 16º dia o afastamento vai ao INSS"
        />
        <TileIndicador rotulo={`Ausências em ${anoAtual}`} valor={String(ausencias.filter((a) => anoDo(a.inicio) === anoAtual).length)} />
      </section>

      <AbasLink
        rotulo="Visões de atestados e ausências"
        abas={[
          { href: "/painel/pessoal/atestados", rotulo: "Funcionários", ativo: aba === "funcionarios" },
          { href: "/painel/pessoal/atestados?aba=atestados", rotulo: "Atestados médicos", ativo: aba === "atestados", contador: atestados.length },
          { href: "/painel/pessoal/atestados?aba=ausencias", rotulo: "Ausências", ativo: aba === "ausencias", contador: ausencias.length },
        ]}
      />

      {aba === "funcionarios" ? (
        <AbaFuncionarios sp={sp} atestados={atestados} ausencias={ausencias} funcionarios={funcionarios} />
      ) : (
        <RegistrosSaude brutos={sp} />
      )}
    </>
  )
}

function AbaFuncionarios({
  sp,
  atestados,
  ausencias,
  funcionarios,
}: {
  sp: Record<string, string | undefined>
  atestados: Atestado[]
  ausencias: Ausencia[]
  funcionarios: Awaited<ReturnType<typeof funcionariosDaArea>>
}) {
  const anos = [...new Set([...atestados, ...ausencias].map((i) => anoDo(i.inicio)).filter(Boolean))].sort().reverse()
  const anoAtual = new Date().getFullYear().toString()
  const ano = sp.ano && anos.includes(sp.ano) ? sp.ano : anoAtual
  type Resumo = { atestados: number; dias: number; ausencias: number; ultimo: { data: string; rotulo: string; href: string } | null }
  const resumo = new Map<string, Resumo>()
  const pega = (id: string) => resumo.get(id) ?? { atestados: 0, dias: 0, ausencias: 0, ultimo: null }
  const marcaUltimo = (r: Resumo, data: string | null, rotulo: string, href: string) => {
    if (data && (!r.ultimo || data > r.ultimo.data)) r.ultimo = { data, rotulo, href }
  }
  for (const a of atestados) {
    if (!a.funcionario_id || anoDo(a.inicio) !== ano) continue
    const r = pega(a.funcionario_id)
    r.atestados++
    r.dias += a.quantidade_dias ?? 0
    marcaUltimo(r, a.inicio, "Atestado", `/painel/pessoal/atestados/${a.id}`)
    resumo.set(a.funcionario_id, r)
  }
  for (const a of ausencias) {
    if (!a.funcionario_id || anoDo(a.inicio) !== ano) continue
    const r = pega(a.funcionario_id)
    r.ausencias++
    marcaUltimo(r, a.inicio, a.motivo ?? "Ausência", `/painel/pessoal/atestados/funcionario/${a.funcionario_id}?ano=${ano}`)
    resumo.set(a.funcionario_id, r)
  }

  const f = lerFiltrosArea(sp, ORDENS, { ordem: "nome" })
  const valor = (l: (typeof funcionarios)[number]) => {
    const r = resumo.get(l.usuarioId)
    switch (f.ordem) {
      case "atestados":
        return r?.atestados
      case "dias":
        return r?.dias
      case "ausencias":
        return r?.ausencias
      case "ultimo":
        return r?.ultimo?.data
      default:
        return l.nome
    }
  }
  const linhas = ordenarPor(filtrarFuncionarios(funcionarios, f), f.dir, valor)
  const paginacao = lerPaginacao(sp, 30)
  const pagina = paginar(linhas, paginacao)
  const params = paramsDosFiltros(f, { ano: sp.ano })
  const urlAtual = `/painel/pessoal/atestados?${new URLSearchParams(
    Object.entries({ ...params, pagina: sp.pagina, porPagina: sp.porPagina }).filter((e): e is [string, string] => Boolean(e[1]))
  )}`

  return (
    <>
      <LembrarLista chave="atestados-funcionarios" url={urlAtual} />
      <FiltrosFuncionarios
        filtros={f}
        departamentos={departamentosDaLista(funcionarios)}
        extras={
          <SelectNativo name="ano" defaultValue={ano} aria-label="Ano" className="h-9 w-auto">
            {[...new Set([anoAtual, ...anos])].sort().reverse().map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </SelectNativo>
        }
      />
      <TabelaFuncionarios
        pagina={pagina}
        ordem={f.ordem}
        dir={f.dir}
        porPagina={paginacao.porPagina}
        linkOrdem={linkDeOrdem("/painel/pessoal/atestados", params, f.ordem, f.dir)}
        hrefFuncionario={(l) => `/painel/pessoal/atestados/funcionario/${l.usuarioId}?ano=${ano}`}
        colunas={[
          { chave: "atestados", rotulo: `Atestados ${ano}`, className: "text-right tabular-nums", valor: (l) => resumo.get(l.usuarioId)?.atestados || "—" },
          {
            chave: "dias",
            rotulo: "Dias",
            className: "text-right tabular-nums",
            valor: (l) => {
              const d = resumo.get(l.usuarioId)?.dias ?? 0
              return d ? <span className={d > 15 ? "text-warning-fg font-medium" : ""}>{d}</span> : "—"
            },
          },
          { chave: "ausencias", rotulo: "Ausências", className: "hidden text-right tabular-nums md:table-cell", valor: (l) => resumo.get(l.usuarioId)?.ausencias || "—" },
          {
            chave: "ultimo",
            rotulo: "Último",
            className: "hidden lg:table-cell",
            valor: (l) => {
              const u = resumo.get(l.usuarioId)?.ultimo
              return u ? (
                <Link href={u.href} className="hover:underline">
                  {formatarData(u.data)} · {u.rotulo}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            },
          },
        ]}
      />
    </>
  )
}
