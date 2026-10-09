"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Loader2, RotateCcw, Save, Tags } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  CAMPOS_SAUDE,
  type CategoriaFonte,
  type ChaveCampoSaude,
  type ConfigSaude,
  EXPLICACAO_NIVEL,
  NIVEIS_SAUDE,
  type NivelSaude,
  ROTULO_CATEGORIA_SISTEMA,
  ROTULO_NIVEL,
} from "@/lib/saude-cadastros"
import { cn } from "@/lib/utils"

import { salvarConfigSaudeAction } from "./actions"

const COR_NIVEL: Record<NivelSaude, string> = {
  pendencia: "bg-destructive/15 text-destructive ring-1 ring-destructive/40",
  apontamento: "bg-warning/15 text-warning-fg ring-1 ring-warning/40",
  normal: "bg-background text-foreground ring-1 ring-border",
}

const GRUPOS = [
  { grupo: "cadastro", titulo: "Cadastro do filiado" },
  { grupo: "vinculo", titulo: "Vínculo em aberto" },
] as const

export function ConfigSaudeForm({
  inicial,
  padrao,
  categorias,
  podeGerirCategorias,
}: {
  inicial: ConfigSaude
  padrao: ConfigSaude
  categorias: CategoriaFonte[]
  podeGerirCategorias: boolean
}) {
  const [config, setConfig] = useState(inicial)
  const [aba, setAba] = useState(categorias[0]?.chave ?? "empregador")
  const categoriaAtual = categorias.find((c) => c.chave === aba) ?? categorias[0]
  const [salvando, iniciar] = useTransition()
  const [retorno, setRetorno] = useState<{ ok?: string; erro?: string }>({})

  const alterado = JSON.stringify(config) !== JSON.stringify(inicial)

  function definir(campo: ChaveCampoSaude, nivel: NivelSaude) {
    setRetorno({})
    setConfig((c) => ({ ...c, [aba]: { ...c[aba], [campo]: nivel } }))
  }

  function salvar() {
    iniciar(async () => setRetorno(await salvarConfigSaudeAction(config)))
  }

  const contagem = (chave: string) =>
    Object.values(config[chave] ?? {}).filter((n) => n === "pendencia").length

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
      <div
        role="tablist"
        aria-label="Categoria da fonte pagadora"
        className="bg-muted/60 inline-flex w-fit flex-wrap items-center gap-1 rounded-full p-1"
      >
        {categorias.map(({ chave: cat, nome, sistema, base }) => (
          <button
            key={cat}
            title={sistema ? undefined : `Criada pela entidade — segue as regras de ${ROTULO_CATEGORIA_SISTEMA[base]}`}
            type="button"
            role="tab"
            aria-selected={aba === cat}
            onClick={() => setAba(cat)}
            className={cn(
              "rounded-full px-3 py-1 text-sm transition-colors",
              aba === cat
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {nome}
            <span className="ml-1.5 text-xs opacity-75 tabular-nums">
              {contagem(cat)} pend.
            </span>
          </button>
        ))}
      </div>
      {podeGerirCategorias && (
        <Button asChild variant="outline" size="sm">
          <Link href="/painel/representacao/empregadores/categorias">
            <Tags />
            Categorias de fonte
          </Link>
        </Button>
      )}
      </div>
      {!categoriaAtual.sistema && (
        <p className="text-muted-foreground -mt-2 text-xs">
          Categoria criada pela entidade — segue as regras de{" "}
          {ROTULO_CATEGORIA_SISTEMA[categoriaAtual.base]} no vínculo e parte do padrão dela.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {GRUPOS.map(({ grupo, titulo }) => (
          <Card key={grupo}>
            <CardHeader>
              <CardTitle className="text-base">{titulo}</CardTitle>
              <CardDescription>
                {categoriaAtual.nome} — o que fazer quando falta a informação
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1">
              {CAMPOS_SAUDE.filter((c) => c.grupo === grupo).map((campo) => {
                const atual = config[aba][campo.chave]
                const diferePadrao = atual !== padrao[aba][campo.chave]
                return (
                  <div
                    key={campo.chave}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b py-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {campo.rotulo}
                        {diferePadrao && (
                          <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                            (padrão: {ROTULO_NIVEL[padrao[aba][campo.chave]].toLowerCase()})
                          </span>
                        )}
                      </p>
                      {"ajuda" in campo && (
                        <p className="text-muted-foreground text-xs">{campo.ajuda}</p>
                      )}
                    </div>
                    <div
                      role="radiogroup"
                      aria-label={campo.rotulo}
                      className="bg-muted/60 inline-flex shrink-0 gap-0.5 rounded-md p-0.5"
                    >
                      {NIVEIS_SAUDE.map((nivel) => (
                        <button
                          key={nivel}
                          type="button"
                          role="radio"
                          aria-checked={atual === nivel}
                          title={EXPLICACAO_NIVEL[nivel]}
                          onClick={() => definir(campo.chave, nivel)}
                          className={cn(
                            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                            atual === nivel
                              ? COR_NIVEL[nivel]
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {ROTULO_NIVEL[nivel]}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <ul className="text-muted-foreground grid gap-0.5 text-xs">
        {NIVEIS_SAUDE.map((n) => (
          <li key={n}>
            <strong className="text-foreground">{ROTULO_NIVEL[n]}:</strong> {EXPLICACAO_NIVEL[n]}
          </li>
        ))}
      </ul>

      {retorno.erro && <p className="text-destructive text-sm">{retorno.erro}</p>}
      {retorno.ok && <p className="text-success-fg text-sm">{retorno.ok}</p>}

      <div className="flex flex-wrap gap-2">
        <Button onClick={salvar} disabled={salvando || !alterado}>
          {salvando ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar configuração
        </Button>
        <Button
          variant="ghost"
          disabled={salvando}
          onClick={() => {
            setRetorno({})
            setConfig((c) => ({ ...c, [aba]: { ...padrao[aba] } }))
          }}
        >
          <RotateCcw />
          Restaurar padrão de {categoriaAtual.nome}
        </Button>
      </div>
    </div>
  )
}
