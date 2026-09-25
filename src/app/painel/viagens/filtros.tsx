import Link from "next/link"
import { Download, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Viagem } from "@/lib/db/viagens"
import {
  ROTULO_SITUACAO_VIAGEM,
  SITUACOES_VIAGEM,
  type FiltroViagens,
} from "@/lib/viagens-constantes"

/** O filtro de volta para a URL (mesmos nomes que lerFiltroViagens lê). */
function consultaDoFiltro(f: FiltroViagens): string {
  const p = new URLSearchParams()
  if (f.pessoa) p.set("pessoa", f.pessoa)
  if (f.tipo) p.set("tipo", f.tipo)
  if (f.situacao) p.set("situacao", f.situacao)
  if (f.quadro) p.set("quadro", f.quadro)
  if (f.eventoId) p.set("evento", f.eventoId)
  if (f.fornecedorId) p.set("agencia", f.fornecedorId)
  if (f.de) p.set("de", f.de)
  if (f.ate) p.set("ate", f.ate)
  const s = p.toString()
  return s ? `?${s}` : ""
}

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * Filtros da lista (GET, sem JavaScript): pessoa, tipo de serviço, situação,
 * quadro, evento, agência e período da viagem. Evento e agência só oferecem
 * o que aparece em alguma viagem.
 */
export function FiltrosViagens({ filtro, viagens }: { filtro: FiltroViagens; viagens: Viagem[] }) {
  const eventos = new Map<string, string>()
  const agencias = new Map<string, string>()
  for (const v of viagens) {
    if (v.eventoId) eventos.set(v.eventoId, v.eventoTitulo ?? "(sem título)")
    for (const i of v.itens) {
      if (i.fornecedorId) agencias.set(i.fornecedorId, i.fornecedorNome ?? "(sem nome)")
    }
  }
  const ordenar = (m: Map<string, string>) =>
    [...m].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))

  return (
    <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="grid gap-1.5 lg:col-span-2">
        <Label htmlFor="f-pessoa">Pessoa</Label>
        <Input
          id="f-pessoa"
          name="pessoa"
          defaultValue={filtro.pessoa ?? ""}
          placeholder="Nome de quem viaja"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-tipo">Serviço</Label>
        <select id="f-tipo" name="tipo" defaultValue={filtro.tipo ?? ""} className={SELECT}>
          <option value="">Todos</option>
          <option value="passagem">Passagens</option>
          <option value="hospedagem">Hospedagens</option>
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-situacao">Situação</Label>
        <select
          id="f-situacao"
          name="situacao"
          defaultValue={filtro.situacao ?? ""}
          className={SELECT}
        >
          <option value="">Todas</option>
          <option value="abertas">Aguardando atendimento</option>
          {SITUACOES_VIAGEM.map((s) => (
            <option key={s} value={s}>
              {ROTULO_SITUACAO_VIAGEM[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-quadro">Quem viaja</Label>
        <select id="f-quadro" name="quadro" defaultValue={filtro.quadro ?? ""} className={SELECT}>
          <option value="">Todos</option>
          <option value="diretor">Diretores</option>
          <option value="funcionario">Funcionários</option>
          <option value="convidado">Convidados</option>
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-evento">Evento</Label>
        <select id="f-evento" name="evento" defaultValue={filtro.eventoId ?? ""} className={SELECT}>
          <option value="">Todos</option>
          {ordenar(eventos).map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="f-agencia">Agência</Label>
        <select
          id="f-agencia"
          name="agencia"
          defaultValue={filtro.fornecedorId ?? ""}
          className={SELECT}
        >
          <option value="">Todas</option>
          {ordenar(agencias).map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="f-de">Viagem de</Label>
          <Input id="f-de" name="de" type="date" defaultValue={filtro.de ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-ate">até</Label>
          <Input id="f-ate" name="ate" type="date" defaultValue={filtro.ate ?? ""} />
        </div>
      </div>
      <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/painel/viagens">Limpar</Link>
        </Button>
        {/* Rota de download: <a> comum, não Link (não é página). */}
        <Button asChild variant="outline" size="sm">
          <a href={`/painel/viagens/exportar${consultaDoFiltro(filtro)}`}>
            <Download />
            CSV
          </a>
        </Button>
        <Button type="submit" size="sm">
          <Search />
          Filtrar
        </Button>
      </div>
    </form>
  )
}
