"use client"

import Link from "next/link"
import { useActionState, useMemo, useState, type ReactNode } from "react"
import { Check, ExternalLink, Loader2, Merge, MessageCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SelectNativo } from "@/components/ui/select-nativo"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { type EstadoForm } from "@/lib/contas"
import { formatarCpf } from "@/lib/cpf"
import { ROTULOS_FORMA_RECEBIMENTO, formaRecebimento } from "@/lib/filiacao"
import { formatarCep, formatarData, formatarMoeda, formatarTelefone } from "@/lib/formato"
import {
  CAMPOS_ENDERECO,
  CAMPOS_ESCOLHA,
  alinharVinculos,
  camposDivergem,
  contasDosCadastros,
  emailsDosCadastros,
  emergenciaDosCadastros,
  enderecosDosCadastros,
  fonteDoCampo,
  chaveEndereco,
  linhaEndereco,
  papeisPadraoEmails,
  papeisPadraoTelefones,
  telefonesDosCadastros,
  trocarPapel,
  type Decisao,
  type DecisaoVinculo,
  type FichaMesclagem,
  type GrupoCampo,
  type PapelEmail,
  type PapelTelefone,
  type VinculoFicha,
} from "@/lib/mesclagem-cadastros"
import { cn } from "@/lib/utils"

import { mesclarAction } from "../actions"

const CLASSE_ROTULO = "bg-card sticky left-0 z-10 border-b border-r px-3 py-2 text-left align-top text-xs font-medium text-muted-foreground"
const CLASSE_CELULA = "border-b border-r px-2 py-1.5 align-top text-sm"
const CLASSE_RESULTADO = "bg-primary/5 border-b px-3 py-2 align-top text-sm"

function exibir(campo: string, valor: string | null): string {
  if (valor === null || valor === "") return "—"
  if (campo === "cpf") return formatarCpf(valor)
  if (campo === "nascimento_data") return formatarData(valor)
  if (campo === "endereco_cep") return formatarCep(valor)
  if (campo === "contribuicao_valor") return formatarMoeda(valor)
  if (campo === "foto") return "Tem foto"
  if (campo === "forma_recebimento") {
    const forma = formaRecebimento(valor)
    return forma ? ROTULOS_FORMA_RECEBIMENTO[forma] : valor
  }
  return valor
}

/** Termo: o que importa é a data do aceite, que vai junto. */
function exibirCampo(f: FichaMesclagem, campo: string): string {
  if (campo === "tl_lgpd_id" || campo === "tl_desconto_id") {
    const data = f.valores[campo === "tl_lgpd_id" ? "tl_lgpd_data" : "tl_desconto_data"]
    if (!f.valores[campo] && !data) return "—"
    return data ? `Aceito em ${formatarData(data)}` : "Aceito"
  }
  return exibir(campo, f.valores[campo] ?? null)
}

function Secao({ titulo, descricao, colunas, children }: { titulo: string; descricao?: string; colunas: number; children?: ReactNode }) {
  return (
    <tr>
      <th className="bg-muted sticky left-0 z-10 border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">
        {titulo}
      </th>
      {children ?? (
        <td colSpan={colunas + 1} className="bg-muted border-b px-3 py-2 text-xs text-muted-foreground">
          {descricao}
        </td>
      )}
    </tr>
  )
}

function Vinculo({ v }: { v: VinculoFicha }) {
  return (
    <div className="grid gap-0.5 text-xs">
      <p className="text-sm font-medium">{v.fonte ?? "Sem fonte"}</p>
      <p className="text-muted-foreground">
        {[v.cargo, v.lotacao, v.matricula && `mat. ${v.matricula}`].filter(Boolean).join(" · ") || "—"}
      </p>
      <p className="text-muted-foreground">
        Filiação {formatarData(v.filiacao)}
        {v.desfiliacao ? ` a ${formatarData(v.desfiliacao)}` : " · aberto"}
      </p>
      {(v.admissao || v.demissao) && (
        <p className="text-muted-foreground">
          Admissão {formatarData(v.admissao)}
          {v.demissao && ` · demissão ${formatarData(v.demissao)}`}
        </p>
      )}
      <span className="flex flex-wrap gap-1 pt-0.5">
        {v.fichaUrl && (
          <a href={v.fichaUrl} target="_blank" rel="noreferrer">
            <Badge variant="success" className="hover:underline">ficha</Badge>
          </a>
        )}
        {v.cartaUrl && (
          <a href={v.cartaUrl} target="_blank" rel="noreferrer">
            <Badge variant="success" className="hover:underline">carta</Badge>
          </a>
        )}
      </span>
    </div>
  )
}

/**
 * Os cadastros inteiros, um ao lado do outro, com a última coluna mostrando como
 * o cadastro vai ficar. Valor único: clica-se no que fica. O que dá para somar
 * (telefones, e-mails, endereços, contatos, contas, vínculos) tem uma linha por
 * valor, alinhada entre os cadastros, e a decisão fica na última coluna.
 */
export function MesclarForm({ fichas, sugerido }: { fichas: FichaMesclagem[]; sugerido: string }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(mesclarAction, {})
  const envio = useEnvioFormulario(formAction, estado)

  const [principal, setPrincipal] = useState(sugerido)
  const [campos, setCampos] = useState<Record<string, string>>({})
  const [telefonesEditados, setTelefones] = useState<Record<string, PapelTelefone> | null>(null)
  const [emailsEditados, setEmails] = useState<Record<string, PapelEmail> | null>(null)
  const [enderecosDescartados, setEnderecosDescartados] = useState<string[]>([])
  const [emergenciaDescartados, setEmergenciaDescartados] = useState<string[]>([])
  const [vinculos, setVinculos] = useState<Record<string, DecisaoVinculo>>({})
  const [contaFavorita, setContaFavorita] = useState<string | null>(null)

  const numero = (id: string) => fichas.findIndex((f) => f.id === id) + 1
  const outros = fichas.filter((f) => f.id !== principal)

  const telefones = useMemo(() => telefonesDosCadastros(fichas), [fichas])
  const emails = useMemo(() => emailsDosCadastros(fichas), [fichas])
  const enderecos = useMemo(() => enderecosDosCadastros(fichas), [fichas])
  const emergencia = useMemo(() => emergenciaDosCadastros(fichas, principal), [fichas, principal])
  const contas = useMemo(() => contasDosCadastros(fichas, principal), [fichas, principal])
  const linhasVinculo = useMemo(() => alinharVinculos(fichas, principal), [fichas, principal])

  const papeisTelefone = telefonesEditados ?? papeisPadraoTelefones(fichas, principal)
  const papeisEmail = emailsEditados ?? papeisPadraoEmails(fichas, principal)

  const fonte = (campo: string) => campos[campo] ?? fonteDoCampo(fichas, principal, campo)
  const fichaDe = (id: string) => fichas.find((f) => f.id === id)!

  const decisao: Decisao = {
    principal,
    campos,
    telefones: papeisTelefone,
    emails: papeisEmail,
    enderecosDescartados,
    emergenciaDescartados,
    vinculos,
    contaFavorita,
  }

  const decisaoVinculo = (l: (typeof linhasVinculo)[number]): DecisaoVinculo =>
    vinculos[l.chave] ?? { unir: l.sugerirUnir, fica: l.ficaSugerido }

  // O endereço que ficará no cadastro, para não oferecer descartá-lo.
  const fichaEndereco = (campo: string) => fichaDe(fonte(campo)).valores[campo] ?? null
  const chaveEnderecoFinal = chaveEndereco({
    cep: fichaEndereco("endereco_cep"),
    logradouro: fichaEndereco("endereco_logradouro"),
    numero: fichaEndereco("endereco_numero"),
  })

  const contaPrincipal =
    contas.find((c) => c.chave === contaFavorita) ?? contas.find((c) => c.conta.favorito) ?? contas[0]

  // Resumo do que sai da mesclagem.
  const quantosTelefones = Object.values(papeisTelefone).filter((p) => p !== "descartar").length
  const quantosEmails = Object.values(papeisEmail).filter((p) => p !== "descartar").length
  const vinculosFinais = linhasVinculo.reduce((s, l) => {
    const n = Object.keys(l.porCadastro).length
    return s + (n > 1 && decisaoVinculo(l).unir ? 1 : n)
  }, 0)

  const colunas = fichas.length
  const linhaCampos = (grupo: GrupoCampo) =>
    CAMPOS_ESCOLHA.filter((c) => c.grupo === grupo).map(({ campo, rotulo }) => {
      const valores = new Set(fichas.map((f) => f.valores[campo] ?? null))
      const temEscolha = valores.size > 1
      const diverge = camposDivergem(fichas, campo)
      return (
        <tr key={campo}>
          <th scope="row" className={CLASSE_ROTULO}>
            {rotulo}
            {diverge && <span className="bg-warning-fg ml-1.5 inline-block size-1.5 rounded-full align-middle" title="Os cadastros divergem" />}
          </th>
          {fichas.map((f) => {
            const texto = exibirCampo(f, campo)
            const selecionado = fonte(campo) === f.id
            return (
              <td key={f.id} className={CLASSE_CELULA}>
                {temEscolha ? (
                  <button
                    type="button"
                    aria-pressed={selecionado}
                    aria-label={`${rotulo}: ${texto}, do cadastro ${numero(f.id)}`}
                    onClick={() => setCampos((c) => ({ ...c, [campo]: f.id }))}
                    className={cn(
                      "flex w-full items-start justify-between gap-2 rounded-md border px-2 py-1 text-left break-words transition-colors",
                      selecionado ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted border-transparent",
                      texto === "—" && "text-muted-foreground"
                    )}
                  >
                    <span className="min-w-0">{texto}</span>
                    {selecionado && <Check className="text-primary mt-0.5 size-3.5 shrink-0" aria-hidden />}
                  </button>
                ) : (
                  <span className={cn("block px-2 py-1 break-words", texto === "—" && "text-muted-foreground")}>{texto}</span>
                )}
              </td>
            )
          })}
          <td className={CLASSE_RESULTADO}>
            <span className="break-words">{exibirCampo(fichaDe(fonte(campo)), campo)}</span>
          </td>
        </tr>
      )
    })

  const origemNaCelula = (texto: string | undefined, conteudo: ReactNode) =>
    texto ? (
      <span className="block px-2 py-1">
        <span className="block break-words">{conteudo}</span>
        <span className="text-muted-foreground block text-xs">{texto}</span>
      </span>
    ) : (
      <span className="text-muted-foreground block px-2 py-1">—</span>
    )


  return (
    <form action={formAction} {...envio} className="grid gap-4">
      <input type="hidden" name="principal" value={principal} />
      <input type="hidden" name="secundarios" value={outros.map((f) => f.id).join(",")} />
      <input type="hidden" name="decisao" value={JSON.stringify(decisao)} />

      <div className="bg-card max-h-[calc(100dvh-14rem)] min-h-96 overflow-auto rounded-lg border">
        <table className="w-full min-w-max border-separate border-spacing-0">
          <colgroup>
            <col className="w-36" />
            {fichas.map((f) => (
              <col key={f.id} className="w-72 min-w-64" />
            ))}
            <col className="w-80 min-w-72" />
          </colgroup>
          <thead>
            <tr>
              <th className="bg-card sticky top-0 left-0 z-30 border-b border-r px-3 py-2 text-left text-xs font-medium">
                <span className="sr-only">Campo</span>
              </th>
              {fichas.map((f) => (
                <th key={f.id} className={cn("sticky top-0 z-20 border-b border-r px-3 py-2 text-left align-top font-normal bg-card", principal === f.id && "shadow-[inset_0_0_0_999px_color-mix(in_srgb,var(--primary)_10%,transparent)]")}>
                  <span className="block text-sm font-semibold">
                    Cadastro {numero(f.id)}
                    {f.id === sugerido && <Badge variant="outline" className="ml-2 align-middle">sugerido</Badge>}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    Criado em {formatarData(f.criadoEm)} · atualizado em {formatarData(f.atualizadoEm)}
                  </span>
                  <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="escolha_principal"
                      checked={principal === f.id}
                      onChange={() => {
                        setPrincipal(f.id)
                        setTelefones(null)
                        setEmails(null)
                      }}
                    />
                    Este é o cadastro que fica
                  </label>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setCampos(Object.fromEntries(CAMPOS_ESCOLHA.filter((c) => f.valores[c.campo]).map((c) => [c.campo, f.id])))}
                    >
                      Usar tudo deste
                    </button>
                    <Link href={`/painel/filiados/${f.id}`} target="_blank" className="text-primary inline-flex items-center gap-1 hover:underline">
                      Abrir
                      <ExternalLink className="size-3" aria-hidden />
                    </Link>
                  </span>
                </th>
              ))}
              <th className="bg-card shadow-[inset_0_0_0_999px_color-mix(in_srgb,var(--primary)_10%,transparent)] sticky top-0 z-20 border-b px-3 py-2 text-left align-top font-normal">
                <span className="block text-sm font-semibold">Como fica</span>
                <span className="text-muted-foreground block text-xs">
                  No cadastro {numero(principal)}, depois de mesclar
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <Secao titulo="Identificação" colunas={colunas} descricao="Clique no valor certo. O ponto laranja marca o que diverge." />
            {linhaCampos("identificacao")}

            <Secao titulo="Telefones" colunas={colunas} descricao="Cada número uma vez. Nada se perde: o que não couber em Telefone 1 e 2 vai para Outros contatos." />
            {telefones.length === 0 && (
              <tr>
                <td colSpan={colunas + 2} className="text-muted-foreground border-b px-3 py-2 text-sm">Nenhum telefone nestes cadastros.</td>
              </tr>
            )}
            {telefones.map((t) => (
              <tr key={t.chave}>
                <th scope="row" className={CLASSE_ROTULO}>Telefone</th>
                {fichas.map((f) => (
                  <td key={f.id} className={CLASSE_CELULA}>
                    {origemNaCelula(
                      t.origens[f.id],
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        {formatarTelefone(t.valor)}
                        {t.whatsapp && <MessageCircle className="text-success-fg size-3.5" aria-label="WhatsApp" />}
                      </span>
                    )}
                  </td>
                ))}
                <td className={CLASSE_RESULTADO}>
                  <SelectNativo
                    aria-label={`Lugar do telefone ${formatarTelefone(t.valor)}`}
                    value={papeisTelefone[t.chave] ?? "outros"}
                    onChange={(e) =>
                      setTelefones(trocarPapel(papeisTelefone, t.chave, e.target.value as PapelTelefone, ["telefone_1", "telefone_2"], "outros"))
                    }
                  >
                    <option value="telefone_1">Telefone 1</option>
                    <option value="telefone_2">Telefone 2</option>
                    <option value="outros">Outros contatos</option>
                    <option value="descartar">Não guardar</option>
                  </SelectNativo>
                </td>
              </tr>
            ))}

            <Secao titulo="E-mails" colunas={colunas} descricao="Cada e-mail uma vez, com o mesmo cuidado dos telefones." />
            {emails.length === 0 && (
              <tr>
                <td colSpan={colunas + 2} className="text-muted-foreground border-b px-3 py-2 text-sm">Nenhum e-mail nestes cadastros.</td>
              </tr>
            )}
            {emails.map((e) => (
              <tr key={e.chave}>
                <th scope="row" className={CLASSE_ROTULO}>E-mail</th>
                {fichas.map((f) => (
                  <td key={f.id} className={CLASSE_CELULA}>
                    {origemNaCelula(e.origens[f.id], e.valor)}
                  </td>
                ))}
                <td className={CLASSE_RESULTADO}>
                  <SelectNativo
                    aria-label={`Lugar do e-mail ${e.valor}`}
                    value={papeisEmail[e.chave] ?? "outros"}
                    onChange={(ev) =>
                      setEmails(trocarPapel(papeisEmail, e.chave, ev.target.value as PapelEmail, ["email_pessoal", "email_corporativo"], "outros"))
                    }
                  >
                    <option value="email_pessoal">E-mail pessoal</option>
                    <option value="email_corporativo">E-mail corporativo</option>
                    <option value="outros">Outros contatos</option>
                    <option value="descartar">Não guardar</option>
                  </SelectNativo>
                </td>
              </tr>
            ))}

            <Secao titulo="Endereço" colunas={colunas}>
              {fichas.map((f) => (
                <td key={f.id} className="bg-muted border-b px-3 py-2 text-xs">
                  {f.valores.endereco_logradouro || f.valores.endereco_cep ? (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setCampos((c) => ({ ...c, ...Object.fromEntries(CAMPOS_ENDERECO.map((k) => [k, f.id])) }))}
                    >
                      Usar o endereço inteiro deste
                    </button>
                  ) : (
                    <span className="text-muted-foreground">Sem endereço</span>
                  )}
                </td>
              ))}
              <td className="bg-muted border-b" />
            </Secao>
            {linhaCampos("endereco")}
            {enderecos
              .filter((e) => e.chave !== chaveEnderecoFinal)
              .map((e) => {
                const descartado = enderecosDescartados.includes(e.chave)
                return (
                  <tr key={e.chave}>
                    <th scope="row" className={CLASSE_ROTULO}>Outro endereço</th>
                    {fichas.map((f) => (
                      <td key={f.id} className={CLASSE_CELULA}>
                        {origemNaCelula(e.origens[f.id], linhaEndereco(e.endereco))}
                      </td>
                    ))}
                    <td className={CLASSE_RESULTADO}>
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4"
                          checked={!descartado}
                          onChange={(ev) =>
                            setEnderecosDescartados((l) => (ev.target.checked ? l.filter((k) => k !== e.chave) : [...l, e.chave]))
                          }
                        />
                        Guardar em Outros contatos
                      </label>
                    </td>
                  </tr>
                )
              })}

            <Secao
              titulo="Vínculos"
              colunas={colunas}
              descricao="Todos passam para o cadastro que fica. Vínculos da mesma fonte ficam na mesma linha: una se forem o mesmo emprego."
            />
            {linhasVinculo.length === 0 && (
              <tr>
                <td colSpan={colunas + 2} className="text-muted-foreground border-b px-3 py-2 text-sm">Nenhum vínculo nestes cadastros.</td>
              </tr>
            )}
            {linhasVinculo.map((l) => {
              const membros = Object.values(l.porCadastro)
              const d = decisaoVinculo(l)
              return (
                <tr key={l.chave}>
                  <th scope="row" className={CLASSE_ROTULO}>{l.fonte ?? "Vínculo"}</th>
                  {fichas.map((f) => {
                    const v = l.porCadastro[f.id]
                    const fica = membros.length > 1 && d.unir && d.fica === v?.id
                    return (
                      <td key={f.id} className={CLASSE_CELULA}>
                        {v ? (
                          <div className={cn("grid gap-1.5 rounded-md border px-2 py-1.5", fica ? "border-primary bg-primary/10" : "border-transparent")}>
                            <Vinculo v={v} />
                            {membros.length > 1 && d.unir && (
                              <label className="flex cursor-pointer items-center gap-2 text-xs">
                                <input
                                  type="radio"
                                  name={`fica_${l.chave}`}
                                  checked={d.fica === v.id}
                                  onChange={() => setVinculos((m) => ({ ...m, [l.chave]: { ...d, fica: v.id } }))}
                                />
                                Valem os dados deste
                              </label>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground block px-2 py-1">—</span>
                        )}
                      </td>
                    )
                  })}
                  <td className={CLASSE_RESULTADO}>
                    {membros.length > 1 ? (
                      <div className="grid gap-1.5">
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4"
                            checked={d.unir}
                            onChange={(e) => setVinculos((m) => ({ ...m, [l.chave]: { ...d, unir: e.target.checked } }))}
                          />
                          Unir num vínculo só
                        </label>
                        <p className="text-muted-foreground text-xs">
                          {d.unir
                            ? "Fica um vínculo: vazios completados pelo outro, com a filiação mais antiga. Uma cópia do que sair fica no prontuário."
                            : `Ficam ${membros.length} vínculos separados.`}
                        </p>
                        {d.unir && l.periodosSeparados && (
                          <p className="text-warning-fg text-xs">Os períodos não se sobrepõem: pode ser uma refiliação, que conta outra história.</p>
                        )}
                        {!d.unir && l.sugerirUnir && (
                          <p className="text-warning-fg text-xs">Mesma fonte, mesma matrícula e períodos juntos: parece o mesmo emprego.</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">Passa para o cadastro que fica.</span>
                    )}
                  </td>
                </tr>
              )
            })}

            {contas.length > 0 && (
              <>
                <Secao titulo="Dados bancários" colunas={colunas} descricao="Todas as contas passam (ordens de pagamento apontam para elas). A mesma conta nos dois cadastros vira uma." />
                {contas.map((c) => {
                  const texto = [
                    c.conta.banco,
                    c.conta.agencia && `ag. ${c.conta.agencia}`,
                    c.conta.conta && `cc. ${c.conta.conta}`,
                    c.conta.pix && `Pix ${c.conta.pix}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                  return (
                    <tr key={c.chave}>
                      <th scope="row" className={CLASSE_ROTULO}>Conta</th>
                      {fichas.map((f) => (
                        <td key={f.id} className={CLASSE_CELULA}>
                          {origemNaCelula(c.porCadastro[f.id] ? (c.conta.favorecido ?? "Titular não informado") : undefined, texto || "—")}
                        </td>
                      ))}
                      <td className={CLASSE_RESULTADO}>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input
                            type="radio"
                            name="conta_favorita"
                            checked={contaPrincipal?.chave === c.chave}
                            onChange={() => setContaFavorita(c.chave)}
                          />
                          Conta principal
                        </label>
                      </td>
                    </tr>
                  )
                })}
              </>
            )}

            {emergencia.length > 0 && (
              <>
                <Secao titulo="Emergência" colunas={colunas} descricao="O mesmo contato nos dois cadastros fica uma vez só." />
                {emergencia.map((c) => (
                  <tr key={c.chave}>
                    <th scope="row" className={CLASSE_ROTULO}>Contato</th>
                    {fichas.map((f) => (
                      <td key={f.id} className={CLASSE_CELULA}>
                        {origemNaCelula(c.porCadastro[f.id] ? (c.contato.vinculo ?? "Contato de emergência") : undefined, `${c.contato.nome} · ${formatarTelefone(c.contato.telefone)}`)}
                      </td>
                    ))}
                    <td className={CLASSE_RESULTADO}>
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4"
                          checked={!emergenciaDescartados.includes(c.chave)}
                          onChange={(e) =>
                            setEmergenciaDescartados((l) => (e.target.checked ? l.filter((k) => k !== c.chave) : [...l, c.chave]))
                          }
                        />
                        Guardar
                      </label>
                    </td>
                  </tr>
                ))}
              </>
            )}

            <Secao titulo="Consentimentos" colunas={colunas} descricao="Quem pediu para não receber a mala direta em qualquer dos cadastros continua sem receber." />
            {linhaCampos("consentimentos")}
            <tr>
              <th scope="row" className={CLASSE_ROTULO}>Mala direta</th>
              {fichas.map((f) => (
                <td key={f.id} className={CLASSE_CELULA}>
                  <span className="block px-2 py-1">{f.optoutEm ? `Pediu para parar em ${formatarData(f.optoutEm)}` : "Recebe"}</span>
                </td>
              ))}
              <td className={CLASSE_RESULTADO}>{fichas.some((f) => f.optoutEm) ? "Não recebe" : "Recebe"}</td>
            </tr>

            <Secao titulo="Histórico" colunas={colunas} descricao="Passa inteiro para o cadastro que fica, junto com hospedagens, atendimentos, processos e o que mais estiver ligado a estes cadastros." />
            {(
              [
                ["Contribuições", (f: FichaMesclagem) => f.contagens.contribuicoes],
                ["Prontuário", (f: FichaMesclagem) => f.contagens.prontuario],
                ["Reembolsos", (f: FichaMesclagem) => f.contagens.reembolsos],
                ["Eventos", (f: FichaMesclagem) => f.contagens.eventos],
              ] as const
            ).map(([rotulo, conta]) => (
              <tr key={rotulo}>
                <th scope="row" className={CLASSE_ROTULO}>{rotulo}</th>
                {fichas.map((f) => (
                  <td key={f.id} className={CLASSE_CELULA}>
                    <span className="block px-2 py-1 tabular-nums">
                      {conta(f)}
                      {rotulo === "Contribuições" && conta(f) > 0 && ` · ${formatarMoeda(f.contagens.valorContribuicoes)}`}
                    </span>
                  </td>
                ))}
                <td className={cn(CLASSE_RESULTADO, "tabular-nums")}>{fichas.reduce((s, f) => s + conta(f), 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-card grid gap-3 rounded-lg border p-4">
        <p className="text-sm">
          Fica o <strong>cadastro {numero(principal)}</strong>, com {quantosTelefones} telefone(s), {quantosEmails} e-mail(s) e{" "}
          {vinculosFinais} vínculo(s). {outros.length === 1 ? "O outro cadastro fica excluído" : `Os outros ${outros.length} cadastros ficam excluídos`},
          apontando para ele, e a mesclagem fica registrada no prontuário.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirmar" className="mt-1 size-4" />
          Conferi que os {fichas.length} cadastros são da mesma pessoa.
        </label>
        {estado.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link href="/painel/filiados/duplicidades">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <Merge />}
            Mesclar cadastros
          </Button>
        </div>
      </div>
    </form>
  )
}
