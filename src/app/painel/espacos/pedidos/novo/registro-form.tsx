"use client"

import { useActionState, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { CardExigencias } from "@/app/espaco/[slug]/pedido-form"
import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { FiliadoPicker } from "@/components/filiado-picker"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import {
  CANAIS_REGISTRO,
  GATILHOS_CONDICAO,
  calcularExigencias,
  totalExigencias,
  type TipoSolicitante,
} from "@/lib/espacos-constantes"
import type { EspacoParaRegistro } from "@/lib/db/espacos-solicitacao"

import { registrarPedidoEquipeAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const TIPOS: { chave: TipoSolicitante; rotulo: string }[] = [
  { chave: "filiado", rotulo: "Filiado" },
  { chave: "entidade", rotulo: "Entidade ou empresa" },
  { chave: "avulso", rotulo: "Outra pessoa" },
]

/**
 * O mesmo pedido do link público, preenchido pela equipe: espaço, quem pede,
 * quando, o evento e as exigências calculadas ao vivo (a mesma
 * calcularExigencias). O servidor confere lotação e agenda de novo.
 */
export function RegistroForm({
  espacos,
  empresas,
  espacoInicial,
}: {
  espacos: EspacoParaRegistro[]
  empresas: EmpresaOpcao[]
  espacoInicial?: string
}) {
  const [estado, enviar, enviando] = useActionState(registrarPedidoEquipeAction, {})
  const envio = useEnvioFormulario(enviar, estado)

  const [espacoId, setEspacoId] = useState(
    espacos.some((e) => e.id === espacoInicial) ? espacoInicial! : espacos[0].id
  )
  const espaco = espacos.find((e) => e.id === espacoId) ?? espacos[0]
  const [tipo, setTipo] = useState<TipoSolicitante>(
    espaco.publico === "filiados" ? "filiado" : "avulso"
  )
  const soFiliados = espaco.publico === "filiados"
  const tipoEfetivo: TipoSolicitante = soFiliados ? "filiado" : tipo

  const [publicoEstimado, setPublicoEstimado] = useState("")
  const [condicoes, setCondicoes] = useState<Record<string, boolean>>({})
  const exigencias = useMemo(() => {
    const lista = calcularExigencias(espaco.regras, {
      publicoEstimado: publicoEstimado ? Number(publicoEstimado) : null,
      infantil: condicoes.infantil ?? false,
      idoso: condicoes.idoso ?? false,
      mobilidade: condicoes.mobilidade ?? false,
      bebida: condicoes.bebida ?? false,
      estresse: condicoes.estresse ?? false,
    })
    return { lista, ...totalExigencias(lista) }
  }, [espaco.regras, publicoEstimado, condicoes])

  return (
    <form action={enviar} {...envio} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O pedido</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="espaco_id">Espaço *</Label>
            <select
              id="espaco_id"
              name="espaco_id"
              className={SELECT}
              value={espacoId}
              onChange={(e) => setEspacoId(e.target.value)}
            >
              {espacos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
            {soFiliados && (
              <p className="text-muted-foreground text-xs">
                Este espaço é cedido só a filiados com filiação ativa.
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="canal">Por onde o pedido chegou *</Label>
            <select id="canal" name="canal" className={SELECT} required defaultValue="">
              <option value="" disabled>
                Escolha
              </option>
              {CANAIS_REGISTRO.map((c) => (
                <option key={c.chave} value={c.chave}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quem está pedindo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <input type="hidden" name="tipo_solicitante" value={tipoEfetivo} />
          {!soFiliados && (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quem pede">
              {TIPOS.map((t) => (
                <Button
                  key={t.chave}
                  type="button"
                  size="sm"
                  variant={tipo === t.chave ? "default" : "outline"}
                  aria-pressed={tipo === t.chave}
                  onClick={() => setTipo(t.chave)}
                >
                  {t.rotulo}
                </Button>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {tipoEfetivo === "filiado" && (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Filiado *</Label>
                <FiliadoPicker endpoint="/painel/espacos/pedidos/busca-filiado" />
                <p className="text-muted-foreground text-xs">
                  Nome, CPF, e-mail e telefone saem do cadastro. Preencha e-mail ou
                  telefone abaixo só se forem outros.
                </p>
              </div>
            )}
            {tipoEfetivo === "entidade" && (
              <div className="grid gap-1.5 sm:col-span-2">
                <Label>Entidade ou empresa *</Label>
                <EmpresaCombobox empresas={empresas} name="empresa_id" />
              </div>
            )}
            {tipoEfetivo === "avulso" && (
              <Campo id="entidade" rotulo="Entidade ou empresa que representa" />
            )}
            {tipoEfetivo !== "filiado" && (
              <Campo
                id="nome"
                rotulo={tipoEfetivo === "entidade" ? "Pessoa de contato *" : "Nome completo *"}
                obrigatorio
              />
            )}
            {tipoEfetivo === "avulso" && <Campo id="cpf" rotulo="CPF" />}
            <Campo id="email" rotulo="E-mail" tipo="email" />
            <Campo id="telefone" rotulo="Telefone" />
            <Campo id="representante_nome" rotulo="Responsável no dia do evento" />
            <Campo id="representante_telefone" rotulo="Telefone do responsável" />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="avisar_solicitante" defaultChecked className="mt-1" />
            <span>
              Mandar ao solicitante um e-mail com o número do pedido. Sem e-mail, ele
              não recebe os avisos da esteira (visita, confirmação, recusa); o e-mail
              de quem assina o termo pode ser informado no envio do termo.
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quando</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo id="inicio" rotulo="Início *" tipo="datetime-local" obrigatorio />
          <Campo id="termino" rotulo="Término *" tipo="datetime-local" obrigatorio />
          <Campo id="montagem_inicio" rotulo="Liberação para montagem" tipo="datetime-local" />
          <Campo id="desmontagem_termino" rotulo="Fim da desmontagem" tipo="datetime-local" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O evento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="finalidade">Para que o espaço será usado? *</Label>
            <Textarea id="finalidade" name="finalidade" rows={3} required />
          </div>
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="publico_estimado">Público estimado</Label>
            <Input
              id="publico_estimado"
              name="publico_estimado"
              type="number"
              min={1}
              value={publicoEstimado}
              onChange={(e) => setPublicoEstimado(e.target.value)}
            />
            {espaco.capacidade && (
              <p className="text-muted-foreground text-xs">
                A lotação de {espaco.nome} é de {espaco.capacidade} pessoas.
              </p>
            )}
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Sobre o público e o evento</legend>
            {GATILHOS_CONDICAO.map((g) => (
              <label
                key={g.chave}
                className="hover:bg-muted/40 flex items-start gap-2 rounded-md border p-2 text-sm"
              >
                <input
                  type="checkbox"
                  name={`tem_${g.chave}`}
                  className="mt-1"
                  checked={condicoes[g.chave] ?? false}
                  onChange={(e) =>
                    setCondicoes((c) => ({ ...c, [g.chave]: e.target.checked }))
                  }
                />
                <span>{g.pergunta}</span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="observacoes">Outras informações</Label>
            <Textarea id="observacoes" name="observacoes" rows={2} />
          </div>
        </CardContent>
      </Card>

      <CardExigencias
        exigencias={exigencias}
        titulo="O que o evento vai exigir"
        explicacao="Calculado pelas respostas, com as mesmas regras do link público. Fica congelado no pedido e vai para o termo."
      />

      <div className="flex justify-end">
        <Button type="submit" disabled={enviando}>
          {enviando && <Loader2 className="animate-spin" />}
          Registrar pedido
        </Button>
      </div>
    </form>
  )
}

function Campo({
  id,
  rotulo,
  tipo = "text",
  obrigatorio,
}: {
  id: string
  rotulo: string
  tipo?: string
  obrigatorio?: boolean
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} name={id} type={tipo} required={obrigatorio} />
    </div>
  )
}
