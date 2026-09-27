"use client"

import { useActionState, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"

import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  PAPEIS_ENTIDADE,
  TIPOS_MINUTA,
  type ParametrosMinuta,
} from "@/lib/contratos-minutas-constantes"

import { criarMinutaAction } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const CARTAO =
  "border-input has-[:checked]:border-primary has-[:checked]:bg-primary/5 hover:bg-muted/50 flex cursor-pointer gap-2.5 rounded-lg border p-2.5 transition-colors"

function Campo({
  nome,
  rotulo,
  dica,
  valor,
  area = false,
  placeholder,
}: {
  nome: string
  rotulo: string
  dica?: string
  valor?: string | null
  area?: boolean
  placeholder?: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={nome}>{rotulo}</Label>
      {area ? (
        <Textarea id={nome} name={nome} defaultValue={valor ?? ""} placeholder={placeholder} rows={3} />
      ) : (
        <Input id={nome} name={nome} defaultValue={valor ?? ""} placeholder={placeholder} />
      )}
      {dica && <span className="text-muted-foreground text-xs">{dica}</span>}
    </div>
  )
}

export function NovaMinutaForm({
  fornecedores,
  assinantes,
  sedes,
  contratos,
  contratoId,
  inicial,
}: {
  fornecedores: EmpresaOpcao[]
  assinantes: { id: string; nome: string; cargo: string | null }[]
  sedes: { id: string; nome: string; cidade: string | null }[]
  contratos: { id: string; rotulo: string }[]
  contratoId: string | null
  inicial: Partial<ParametrosMinuta>
}) {
  const [estado, acao, pendente] = useActionState(criarMinutaAction, {})
  const [tipo, setTipo] = useState<string>(inicial.tipo ?? "")

  return (
    <form action={acao} className="grid gap-8">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">1. Tipo de contrato *</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {TIPOS_MINUTA.map((t) => (
            <label key={t.chave} className={CARTAO}>
              <input
                type="radio"
                name="tipo"
                value={t.chave}
                required
                checked={tipo === t.chave}
                onChange={() => setTipo(t.chave)}
                className="accent-primary mt-0.5 size-4 shrink-0"
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{t.rotulo}</span>
                <span className="text-muted-foreground text-xs leading-relaxed">{t.explicacao}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {!tipo ? (
        <p className="text-muted-foreground text-sm">Escolha o tipo para preencher o restante.</p>
      ) : (
        <>
          <section className="grid gap-4">
            <h2 className="text-sm font-medium">2. As partes</h2>
            <fieldset className="grid gap-2">
              <legend className="text-muted-foreground mb-1 text-xs">A entidade, neste contrato, é a</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {PAPEIS_ENTIDADE.map((p) => (
                  <label key={p.chave} className={CARTAO}>
                    <input
                      type="radio"
                      name="papel_entidade"
                      value={p.chave}
                      defaultChecked={(inicial.papelEntidade ?? "contratante") === p.chave}
                      className="accent-primary mt-0.5 size-4 shrink-0"
                    />
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium">{p.rotulo}</span>
                      <span className="text-muted-foreground text-xs">{p.explicacao}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="assinante_id">Quem assina pela entidade</Label>
                <select id="assinante_id" name="assinante_id" defaultValue="" className={SELECT}>
                  <option value="">(a preencher)</option>
                  {assinantes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                      {a.cargo ? ` — ${a.cargo}` : ""}
                    </option>
                  ))}
                </select>
                {assinantes.length === 0 && (
                  <span className="text-warning-fg text-xs">
                    Nenhum assinante — cadastre a diretoria vigente em Institucional.
                  </span>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sede_id">Endereço da entidade (sede)</Label>
                <select id="sede_id" name="sede_id" defaultValue={sedes[0]?.id ?? ""} className={SELECT}>
                  {sedes.length === 0 && <option value="">(sem sede cadastrada)</option>}
                  {sedes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                      {s.cidade ? ` — ${s.cidade}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 rounded-lg border p-3">
              <p className="text-sm font-medium">Outra parte *</p>
              <div className="grid gap-1.5">
                <Label>Do cadastro de fornecedores</Label>
                <EmpresaCombobox
                  empresas={fornecedores}
                  name="outra_parte_id"
                  defaultId={inicial.outraParteId ?? undefined}
                />
                <span className="text-muted-foreground text-xs">
                  Razão social, CNPJ e endereço vêm do cadastro. Se a outra parte não estiver lá, preencha
                  abaixo.
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Campo nome="outra_parte_nome" rotulo="Nome (se não estiver no cadastro)" valor={inicial.outraParteNome} />
                <Campo
                  nome="outra_parte_representante"
                  rotulo="Representante que assina"
                  placeholder="Nome, cargo e CPF"
                  valor={inicial.outraParteRepresentante}
                />
              </div>
              <Campo
                nome="outra_parte_qualificacao"
                rotulo="Qualificação adicional"
                placeholder="CNPJ/CPF, endereço, estado civil e profissão (pessoa física)…"
                valor={inicial.outraParteQualificacao}
                area
              />
            </div>
          </section>

          <section className="grid gap-4">
            <h2 className="text-sm font-medium">3. O negócio</h2>
            <div className="grid gap-1.5">
              <Label htmlFor="objeto">Objeto *</Label>
              <Textarea
                id="objeto"
                name="objeto"
                required
                minLength={10}
                rows={3}
                defaultValue={inicial.objeto ?? ""}
                placeholder="O que está sendo contratado, com o nível de detalhe que importa (quantidades, local, entregas)."
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Campo nome="valor" rotulo="Valor" placeholder="Ex.: R$ 4.500,00 por mês" valor={inicial.valor} />
              <Campo
                nome="pagamento"
                rotulo="Forma e prazo de pagamento"
                placeholder="Ex.: boleto até o dia 10 do mês seguinte, contra nota fiscal"
                valor={inicial.pagamento}
              />
              <Campo nome="vigencia" rotulo="Vigência / prazo" placeholder="Ex.: 12 meses a partir de 01/10/2026" valor={inicial.vigencia} />
              <Campo nome="reajuste" rotulo="Reajuste" placeholder="Ex.: anual pelo IPCA" valor={inicial.reajuste} />
            </div>
            <Campo
              nome="obrigacoes"
              rotulo="Obrigações e cláusulas específicas"
              placeholder="O que cada parte precisa fazer, exigências, garantias, seguro, LGPD, exclusividade…"
              valor={inicial.obrigacoes}
              area
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Campo nome="penalidades" rotulo="Multas e rescisão" placeholder="Ex.: multa de 10% e aviso prévio de 30 dias" valor={inicial.penalidades} />
              <Campo
                nome="foro"
                rotulo="Foro"
                placeholder="Se vazio, a comarca da sede"
                valor={inicial.foro}
              />
            </div>
            <Campo
              nome="instrucoes"
              rotulo="Instruções para a IA"
              placeholder="Ex.: linguagem simples; incluir cláusula de não vínculo empregatício; contrato curto."
              valor={inicial.instrucoes}
              area
            />
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Campo nome="titulo" rotulo="Título da minuta" dica="Se vazio: tipo + outra parte." />
            <div className="grid gap-1.5">
              <Label htmlFor="contrato_id">Contrato vinculado</Label>
              <select id="contrato_id" name="contrato_id" defaultValue={contratoId ?? ""} className={SELECT}>
                <option value="">(nenhum — minuta antes do contrato)</option>
                {contratos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {pendente ? "A IA está redigindo…" : "Redigir minuta com IA"}
            </Button>
            {pendente && (
              <span className="text-muted-foreground text-xs">
                Um contrato completo pode levar até dois minutos. Não feche a página.
              </span>
            )}
          </div>
        </>
      )}
    </form>
  )
}
