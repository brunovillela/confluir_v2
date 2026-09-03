"use client"

import { useActionState, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Copy, Loader2, Save, Sparkles, Wand2 } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import {
  aprenderComPublicadosAction,
  melhorarPoliticaAction,
  regerarTexto,
  salvarPolitica,
  salvarTextoFinal,
  solicitarTexto,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type CanalOpcao = {
  id: string
  nome: string
  limite: number | null
  suportaBusca: boolean
}

export type ObjetivoOpcao = { valor: string; rotulo: string }

// ── Copiar para a área de transferência ──────────────────────────────────────

export function BotaoCopiar({
  texto,
  rotulo = "Copiar texto",
}: {
  texto: string
  rotulo?: string
}) {
  const [copiado, setCopiado] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 2000)
        } catch {
          // clipboard indisponível — o usuário seleciona e copia manualmente
        }
      }}
    >
      {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copiado ? "Copiado" : rotulo}
    </Button>
  )
}

// ── Pedido de texto ──────────────────────────────────────────────────────────

export function SolicitacaoForm({
  canais,
  objetivos,
  temPolitica,
}: {
  canais: CanalOpcao[]
  objetivos: ObjetivoOpcao[]
  temPolitica: boolean
}) {
  const [estado, formAction, pendente] = useActionState(solicitarTexto, {})
  const [canalId, setCanalId] = useState(canais[0]?.id ?? "")
  const [tamanho, setTamanho] = useState(String(canais[0]?.limite ?? 1500))

  const canal = canais.find((c) => c.id === canalId) ?? null

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {!temPolitica && (
        <Alert>
          <AlertDescription>
            A política editorial ainda não foi escrita. O texto sai genérico sem
            ela — vale preencher antes, é uma vez só.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2">
        <Label htmlFor="assunto">Assunto</Label>
        <Input
          id="assunto"
          name="assunto"
          placeholder="Assembleia sobre a proposta de PLR"
        />
        <p className="text-muted-foreground text-xs">
          Só para você reconhecer este pedido na lista depois.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="objetivo">Objetivo</Label>
          <select id="objetivo" name="objetivo" className={SELECT} required>
            {objetivos.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="canal_id">Local de distribuição</Label>
          <select
            id="canal_id"
            name="canal_id"
            className={SELECT}
            value={canalId}
            onChange={(e) => {
              setCanalId(e.target.value)
              const c = canais.find((x) => x.id === e.target.value)
              if (c?.limite) setTamanho(String(c.limite))
            }}
            required
          >
            {canais.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="tamanho">Tamanho (caracteres)</Label>
        <Input
          id="tamanho"
          name="tamanho"
          type="number"
          min={50}
          max={20000}
          value={tamanho}
          onChange={(e) => setTamanho(e.target.value)}
          className="max-w-40"
          required
        />
        <p className="text-muted-foreground text-xs">
          Sugerido pelo canal escolhido. A IA fica a 10% do alvo, e o número real
          aparece no resultado.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="fatos">Fatos</Label>
        <Textarea
          id="fatos"
          name="fatos"
          rows={7}
          required
          placeholder={
            "O que aconteceu, quando, onde, com quem, quantos, quanto.\n\nEx.: Assembleia dia 12/09, 18h, na sede. Pauta: proposta de PLR de 1,2 salário apresentada pela empresa em 05/09. A proposta anterior era de 0,9. A diretoria recomenda rejeição."
          }
        />
        <p className="text-muted-foreground text-xs">
          É o campo mais importante. A IA só escreve o que estiver aqui — o que
          faltar, ela não inventa (e é assim que tem que ser numa denúncia).
        </p>
      </div>

      <GrupoColapsavel
        titulo="Refinar o texto"
        descricao="Opcional. Cada campo preenchido aqui reduz a chance de o texto sair genérico."
      >
        <div className="grid gap-4 pt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="publico">Público</Label>
              <Input
                id="publico"
                name="publico"
                placeholder="Petroleiros da ativa; imprensa; sociedade"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tom">Tom</Label>
              <Input
                id="tom"
                name="tom"
                placeholder="Firme; sóbrio; acolhedor; celebrativo"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="chamada_acao">Chamada para ação</Label>
            <Input
              id="chamada_acao"
              name="chamada_acao"
              placeholder="Comparecer à assembleia; procurar o jurídico; assinar a lista"
            />
            <p className="text-muted-foreground text-xs">
              Sem isso o texto termina no vazio.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="restricoes">O que não mencionar</Label>
            <Textarea
              id="restricoes"
              name="restricoes"
              rows={2}
              placeholder="Processo em andamento; nome do supervisor; valores ainda não homologados"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="palavras_chave">Palavras-chave</Label>
            <Input
              id="palavras_chave"
              name="palavras_chave"
              placeholder="campanha salarial 2026, PLR, Bacia de Campos"
            />
            <p className="text-muted-foreground text-xs">
              Termos que devem aparecer no texto — nome da campanha, sigla,
              expressões pelas quais as pessoas procuram.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-md border p-3">
            <input
              type="checkbox"
              name="otimizar_busca"
              className="mt-0.5 size-4"
              defaultChecked={false}
            />
            <span className="grid gap-1">
              <span className="text-sm font-medium">
                Otimizar para busca e descoberta
              </span>
              <span className="text-muted-foreground text-xs">
                {canal?.suportaBusca === false
                  ? "Neste canal não há busca, então a IA apenas distribui as palavras-chave com naturalidade pelo texto."
                  : /instagram|facebook|linkedin|twitter|tiktok|threads/i.test(
                        canal?.nome ?? ""
                      )
                    ? "Coloca os termos nas primeiras linhas, onde a rede indexa, e sugere hashtags específicas."
                    : "Palavra-chave no título e na abertura, intertítulos, e sugestão de meta descrição e endereço da página."}
              </span>
            </span>
          </label>
        </div>
      </GrupoColapsavel>

      <div>
        <Button type="submit" disabled={pendente || canais.length === 0}>
          {pendente ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {pendente ? "Escrevendo…" : "Gerar texto"}
        </Button>
        {canais.length === 0 && (
          <p className="text-muted-foreground mt-2 text-xs">
            Cadastre ao menos um local de distribuição para começar.
          </p>
        )}
      </div>
    </form>
  )
}

// ── Resultado ────────────────────────────────────────────────────────────────

export function ResultadoTexto({
  id,
  gerado,
  final,
  alvo,
}: {
  id: string
  gerado: string
  final: string | null
  alvo: number | null
}) {
  const [estado, formAction, pendente] = useActionState(salvarTextoFinal, {})
  const [texto, setTexto] = useState(final ?? gerado)

  const distancia = alvo ? Math.round(((texto.length - alvo) / alvo) * 100) : null

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert>
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}

      <Textarea
        name="texto_final"
        rows={16}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="font-normal"
      />

      <div className="flex flex-wrap items-center gap-3">
        <BotaoCopiar texto={texto} />
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar como versão final
        </Button>
        <span className="text-muted-foreground text-xs">
          {texto.length.toLocaleString("pt-BR")} caracteres
          {alvo
            ? ` · alvo ${alvo.toLocaleString("pt-BR")}${
                distancia !== null && Math.abs(distancia) >= 5
                  ? ` (${distancia > 0 ? "+" : ""}${distancia}%)`
                  : ""
              }`
            : ""}
        </span>
      </div>
    </form>
  )
}

export function RegerarForm({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(regerarTexto, {})
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2">
        <Label htmlFor="ajuste">O que mudar</Label>
        <Textarea
          id="ajuste"
          name="ajuste"
          rows={2}
          placeholder="Ficou longo demais, corta pela metade. / Menos formal. / Puxa mais para a convocação."
          required
        />
        <p className="text-muted-foreground text-xs">
          Os fatos e o resto da solicitação são reaproveitados — não precisa
          redigitar nada.
        </p>
      </div>
      <div>
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Wand2 />}
          {pendente ? "Reescrevendo…" : "Gerar nova versão"}
        </Button>
      </div>
    </form>
  )
}

// ── Política editorial ───────────────────────────────────────────────────────

export function PoliticaForm({
  inicial,
}: {
  inicial: {
    politica: string
    publico_padrao: string
    tom_padrao: string
    termos_evitar: string
    assinatura: string
  }
}) {
  const [estado, formAction, pendente] = useActionState(salvarPolitica, {})
  const router = useRouter()
  const politicaRef = useRef<HTMLTextAreaElement>(null)
  const [iaPendente, setIaPendente] = useState<null | "melhorar" | "aprender">(null)
  const [iaErro, setIaErro] = useState<string | null>(null)
  const [urls, setUrls] = useState("")

  async function melhorar() {
    const texto = politicaRef.current?.value.trim() ?? ""
    setIaErro(null)
    setIaPendente("melhorar")
    const { texto: novo, erro } = await melhorarPoliticaAction({ texto })
    setIaPendente(null)
    if (erro) return setIaErro(erro)
    if (novo && politicaRef.current) politicaRef.current.value = novo
    router.refresh()
  }

  async function aprender() {
    setIaErro(null)
    setIaPendente("aprender")
    const { texto: novo, erro } = await aprenderComPublicadosAction({
      urls,
      atual: politicaRef.current?.value ?? "",
    })
    setIaPendente(null)
    if (erro) return setIaErro(erro)
    if (novo && politicaRef.current) politicaRef.current.value = novo
  }

  return (
    <form action={formAction} className="grid gap-5">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert>
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      {iaErro && (
        <Alert variant="destructive">
          <AlertDescription>{iaErro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2">
        <Label htmlFor="politica">Política editorial</Label>
        <Textarea
          id="politica"
          name="politica"
          ref={politicaRef}
          rows={14}
          defaultValue={inicial.politica}
          placeholder="Como a entidade fala: vocabulário, tom, como se refere à categoria e às empresas, o que nunca faz."
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={melhorar}
            disabled={iaPendente !== null}
          >
            {iaPendente === "melhorar" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Sparkles />
            )}
            Melhorar com IA
          </Button>
        </div>
      </div>

      <GrupoColapsavel
        titulo="Aprender com textos já publicados"
        descricao="A IA lê textos que vocês já publicaram e deduz deles a voz da casa."
      >
        <div className="grid gap-2 pt-2">
          <Label htmlFor="urls">Endereços dos textos</Label>
          <Textarea
            id="urls"
            rows={3}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder={"https://sindipetronf.org.br/noticia-1\nhttps://sindipetronf.org.br/noticia-2"}
          />
          <p className="text-muted-foreground text-xs">
            Um por linha, até oito. Escolha textos que representem bem o jeito de
            escrever da entidade — a IA vai descrever o que eles fazem, inclusive
            os vícios.
          </p>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={aprender}
              disabled={iaPendente !== null || urls.trim() === ""}
            >
              {iaPendente === "aprender" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Wand2 />
              )}
              Deduzir a política destes textos
            </Button>
            <p className="text-muted-foreground mt-2 text-xs">
              O resultado substitui o campo acima. Confira antes de salvar.
            </p>
          </div>
        </div>
      </GrupoColapsavel>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="publico_padrao">Público padrão</Label>
          <Input
            id="publico_padrao"
            name="publico_padrao"
            defaultValue={inicial.publico_padrao}
            placeholder="Petroleiros e petroleiras da base"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tom_padrao">Tom padrão</Label>
          <Input
            id="tom_padrao"
            name="tom_padrao"
            defaultValue={inicial.tom_padrao}
            placeholder="Firme, direto, sem formalidade excessiva"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="termos_evitar">Termos que a entidade não usa</Label>
        <Textarea
          id="termos_evitar"
          name="termos_evitar"
          rows={2}
          defaultValue={inicial.termos_evitar}
          placeholder="colaborador (usar trabalhador), capital humano, parceria (quando for negociação)"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="assinatura">Assinatura padrão</Label>
        <Input
          id="assinatura"
          name="assinatura"
          defaultValue={inicial.assinatura}
          placeholder="Diretoria Colegiada"
        />
      </div>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar política
        </Button>
      </div>
    </form>
  )
}
