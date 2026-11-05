import { chaveMatricula } from "@/lib/casamento"

/**
 * Regras puras da mesclagem lado a lado (04/11/2026): dos cadastros abertos,
 * o que é a mesma informação, como os vínculos se alinham e o que vai para o
 * banco. A tela e os testes usam estas funções; a gravação é a função SQL
 * `mesclar_filiacoes`.
 */

// ── O que a tela recebe de cada cadastro ────────────────────────────────────

export type EnderecoFicha = {
  id: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
}

export type VinculoFicha = {
  id: string
  fonteId: string | null
  fonte: string | null
  matricula: string | null
  cargo: string | null
  lotacao: string | null
  admissao: string | null
  demissao: string | null
  filiacao: string | null
  desfiliacao: string | null
  fichaUrl: string | null
  cartaUrl: string | null
}

export type ContaFicha = {
  id: string
  banco: string | null
  agencia: string | null
  conta: string | null
  pix: string | null
  favorecido: string | null
  favorito: boolean
}

export type EmergenciaFicha = { id: string; nome: string; telefone: string; vinculo: string | null }

export type FichaMesclagem = {
  id: string
  /** Colunas de `filiacoes` que têm escolha (CAMPOS_ESCOLHA + agregados). */
  valores: Record<string, string | null>
  whatsapp1: boolean
  whatsapp2: boolean
  criadoEm: string | null
  atualizadoEm: string | null
  optoutEm: string | null
  emails: { email: string; tipo: string | null }[]
  telefones: { numero: string; whatsapp: boolean; tipo: string | null }[]
  enderecos: EnderecoFicha[]
  emergencia: EmergenciaFicha[]
  contas: ContaFicha[]
  vinculos: VinculoFicha[]
  contagens: { contribuicoes: number; valorContribuicoes: number; prontuario: number; reembolsos: number; eventos: number }
}

// ── Campos de um valor só ───────────────────────────────────────────────────

export type GrupoCampo = "identificacao" | "endereco" | "consentimentos"

/**
 * Campos de escolha única, na ordem da ficha. `leva`: colunas que vão junto com
 * a escolhida (a data do aceite com o termo, os marcos com a condição).
 */
export const CAMPOS_ESCOLHA: {
  campo: string
  rotulo: string
  grupo: GrupoCampo
  leva?: string[]
}[] = [
  { campo: "nome_completo", rotulo: "Nome completo", grupo: "identificacao" },
  { campo: "nome_social", rotulo: "Nome social", grupo: "identificacao" },
  { campo: "cpf", rotulo: "CPF", grupo: "identificacao" },
  { campo: "matricula_sindical", rotulo: "Matrícula sindical", grupo: "identificacao" },
  {
    campo: "filiacao_condicao",
    rotulo: "Condição",
    grupo: "identificacao",
    leva: [
      "condicao_desde",
      "ficha_assinada_em",
      "filiacao_informada_fonte_em",
      "ativo_em",
      "desfiliacao_informada_fonte_em",
      "inativo_em",
    ],
  },
  { campo: "nascimento_data", rotulo: "Nascimento", grupo: "identificacao" },
  { campo: "sexo", rotulo: "Sexo", grupo: "identificacao" },
  { campo: "forma_recebimento", rotulo: "Forma de recebimento", grupo: "identificacao", leva: ["forma_recebimento_ordem"] },
  { campo: "contribuicao_valor", rotulo: "Contribuição própria", grupo: "identificacao" },
  { campo: "foto", rotulo: "Foto", grupo: "identificacao" },
  { campo: "endereco_cep", rotulo: "CEP", grupo: "endereco" },
  { campo: "endereco_logradouro", rotulo: "Logradouro", grupo: "endereco" },
  { campo: "endereco_numero", rotulo: "Número", grupo: "endereco" },
  { campo: "endereco_complemento", rotulo: "Complemento", grupo: "endereco" },
  { campo: "endereco_bairro", rotulo: "Bairro", grupo: "endereco" },
  { campo: "endereco_cidade", rotulo: "Cidade", grupo: "endereco" },
  { campo: "endereco_estado", rotulo: "UF", grupo: "endereco" },
  { campo: "tl_lgpd_id", rotulo: "Termo LGPD", grupo: "consentimentos", leva: ["tl_lgpd_data"] },
  { campo: "tl_desconto_id", rotulo: "Termo de desconto", grupo: "consentimentos", leva: ["tl_desconto_data"] },
]

/** Toda coluna de `filiacoes` que a ficha precisa ler para escolher. */
export const COLUNAS_ESCOLHA: string[] = [
  ...CAMPOS_ESCOLHA.map((c) => c.campo),
  ...CAMPOS_ESCOLHA.flatMap((c) => c.leva ?? []),
  "email_pessoal",
  "email_corporativo",
  "telefone_1",
  "telefone_2",
]

const CAMPOS_ENDERECO = CAMPOS_ESCOLHA.filter((c) => c.grupo === "endereco").map((c) => c.campo)

const preenchido = (v: string | null | undefined) => v !== null && v !== undefined && v !== ""

/** De qual cadastro vem cada campo: o principal; vazio nele, o primeiro preenchido (a condição Ativo vence). */
export function fonteDoCampo(fichas: FichaMesclagem[], principal: string, campo: string): string {
  const ordem = [...fichas.filter((f) => f.id === principal), ...fichas.filter((f) => f.id !== principal)]
  // Quem está Ativo em algum dos cadastros é, salvo escolha em contrário, Ativo.
  if (campo === "filiacao_condicao") {
    const ativo = ordem.find((f) => f.valores[campo] === "Ativo")
    if (ativo) return ativo.id
  }
  return ordem.find((f) => preenchido(f.valores[campo]))?.id ?? principal
}

/** Os valores dos campos escolhidos não divergem? */
export function camposDivergem(fichas: FichaMesclagem[], campo: string): boolean {
  return new Set(fichas.map((f) => f.valores[campo]).filter(preenchido)).size > 1
}

// ── E-mails e telefones: a mesma informação uma vez só ──────────────────────

const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "")
const emailNorm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase()

/** "21 98877-6655", "(21) 98877-6655" e "+55 21 98877-6655" são o mesmo número. */
export function chaveTelefone(v: string | null | undefined): string {
  const d = digitos(v)
  return (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d
}

export type PapelTelefone = "telefone_1" | "telefone_2" | "outros" | "descartar"
export type PapelEmail = "email_pessoal" | "email_corporativo" | "outros" | "descartar"

export type ItemContato = {
  chave: string
  valor: string
  whatsapp: boolean
  tipo: string | null
  /** Em cada cadastro: onde este valor está nele. */
  origens: Record<string, string>
}

export function telefonesDosCadastros(fichas: FichaMesclagem[]): ItemContato[] {
  const itens = new Map<string, ItemContato>()
  const somar = (ficha: string, numero: string | null, onde: string, whatsapp: boolean, tipo: string | null) => {
    const chave = chaveTelefone(numero)
    if (!chave) return
    const item = itens.get(chave) ?? { chave, valor: chave, whatsapp: false, tipo, origens: {} }
    item.whatsapp ||= whatsapp
    item.origens[ficha] ??= onde
    itens.set(chave, item)
  }
  for (const f of fichas) {
    somar(f.id, f.valores.telefone_1, "Telefone 1", f.whatsapp1, null)
    somar(f.id, f.valores.telefone_2, "Telefone 2", f.whatsapp2, null)
    for (const t of f.telefones) somar(f.id, t.numero, "Outros contatos", t.whatsapp, t.tipo)
  }
  return [...itens.values()]
}

export function emailsDosCadastros(fichas: FichaMesclagem[]): ItemContato[] {
  const itens = new Map<string, ItemContato>()
  const somar = (ficha: string, email: string | null, onde: string, tipo: string | null) => {
    const chave = emailNorm(email)
    if (!chave) return
    const item = itens.get(chave) ?? { chave, valor: chave, whatsapp: false, tipo, origens: {} }
    item.origens[ficha] ??= onde
    itens.set(chave, item)
  }
  for (const f of fichas) {
    somar(f.id, f.valores.email_pessoal, "E-mail pessoal", null)
    somar(f.id, f.valores.email_corporativo, "E-mail corporativo", null)
    for (const e of f.emails) somar(f.id, e.email, "Outros contatos", e.tipo)
  }
  return [...itens.values()]
}

/**
 * Lugar de cada telefone: nada se perde. Os do principal ficam onde estão; os
 * dos outros completam o que estiver vazio; o que não couber vai para Outros.
 */
export function papeisPadraoTelefones(fichas: FichaMesclagem[], principal: string): Record<string, PapelTelefone> {
  const papeis: Record<string, PapelTelefone> = {}
  const ordem = [...fichas.filter((f) => f.id === principal), ...fichas.filter((f) => f.id !== principal)]
  const ocupados = new Set<PapelTelefone>()
  const dar = (chave: string, papel: "telefone_1" | "telefone_2") => {
    if (!chave || papeis[chave] || ocupados.has(papel)) return
    papeis[chave] = papel
    ocupados.add(papel)
  }
  // Primeiro o lugar de cada um no próprio cadastro; depois qualquer lugar vago.
  for (const f of ordem) {
    dar(chaveTelefone(f.valores.telefone_1), "telefone_1")
    dar(chaveTelefone(f.valores.telefone_2), "telefone_2")
    for (const n of [f.valores.telefone_1, f.valores.telefone_2]) {
      dar(chaveTelefone(n), "telefone_1")
      dar(chaveTelefone(n), "telefone_2")
    }
  }
  for (const item of telefonesDosCadastros(fichas)) papeis[item.chave] ??= "outros"
  return papeis
}

export function papeisPadraoEmails(fichas: FichaMesclagem[], principal: string): Record<string, PapelEmail> {
  const papeis: Record<string, PapelEmail> = {}
  const ordem = [...fichas.filter((f) => f.id === principal), ...fichas.filter((f) => f.id !== principal)]
  const ocupados = new Set<PapelEmail>()
  const dar = (chave: string, papel: "email_pessoal" | "email_corporativo") => {
    if (!chave || papeis[chave] || ocupados.has(papel)) return
    papeis[chave] = papel
    ocupados.add(papel)
  }
  for (const f of ordem) {
    dar(emailNorm(f.valores.email_pessoal), "email_pessoal")
    dar(emailNorm(f.valores.email_corporativo), "email_corporativo")
  }
  for (const item of emailsDosCadastros(fichas)) papeis[item.chave] ??= "outros"
  return papeis
}

/** Dar um lugar único a um valor manda quem estava nele para Outros contatos. */
export function trocarPapel<P extends string>(papeis: Record<string, P>, chave: string, papel: P, unicos: P[], outros: P) {
  const novo: Record<string, P> = { ...papeis, [chave]: papel }
  if (unicos.includes(papel)) {
    for (const [k, p] of Object.entries(novo)) if (k !== chave && p === papel) novo[k] = outros
  }
  return novo
}

// ── Endereços ───────────────────────────────────────────────────────────────

export function enderecoDoCadastro(f: FichaMesclagem): EnderecoFicha | null {
  const e: EnderecoFicha = {
    id: null,
    cep: f.valores.endereco_cep ?? null,
    logradouro: f.valores.endereco_logradouro ?? null,
    numero: f.valores.endereco_numero ?? null,
    complemento: f.valores.endereco_complemento ?? null,
    bairro: f.valores.endereco_bairro ?? null,
    cidade: f.valores.endereco_cidade ?? null,
    estado: f.valores.endereco_estado ?? null,
  }
  return e.logradouro || e.cep ? e : null
}

const textoNorm = (v: string | null | undefined) =>
  (v ?? "").normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase().replace(/\s+/g, " ")

/** O mesmo lugar: CEP (ou logradouro, se faltar o CEP) e número. */
export function chaveEndereco(e: Pick<EnderecoFicha, "cep" | "logradouro" | "numero">): string {
  const lugar = digitos(e.cep) || textoNorm(e.logradouro)
  return lugar ? `${lugar}|${digitos(e.numero) || textoNorm(e.numero)}` : ""
}

export function linhaEndereco(e: EnderecoFicha): string {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(", ")
  const cidade = [e.cidade, e.estado].filter(Boolean).join("/")
  return [rua, e.complemento, e.bairro, cidade, e.cep ? `CEP ${e.cep}` : null].filter(Boolean).join(" · ") || "—"
}

export type ItemEndereco = {
  chave: string
  endereco: EnderecoFicha
  /** Linhas de `enderecos` com este lugar (o que dá para descartar). */
  ids: string[]
  /** Em cada cadastro: de onde vem. */
  origens: Record<string, string>
}

/** Todos os endereços dos cadastros, um por lugar. */
export function enderecosDosCadastros(fichas: FichaMesclagem[]): ItemEndereco[] {
  const itens = new Map<string, ItemEndereco>()
  const somar = (ficha: string, e: EnderecoFicha, onde: string) => {
    const chave = chaveEndereco(e)
    if (!chave) return
    const item = itens.get(chave) ?? { chave, endereco: e, ids: [], origens: {} }
    if (e.id) item.ids.push(e.id)
    item.origens[ficha] ??= onde
    itens.set(chave, item)
  }
  for (const f of fichas) {
    const doCadastro = enderecoDoCadastro(f)
    if (doCadastro) somar(f.id, doCadastro, "No cadastro")
    for (const e of f.enderecos) somar(f.id, e, "Outros contatos")
  }
  return [...itens.values()]
}

// ── Contatos de emergência e contas ─────────────────────────────────────────

export type ItemEmergencia = { chave: string; contato: EmergenciaFicha; ids: string[]; porCadastro: Record<string, true> }

/** O mesmo telefone (ou, sem ele, o mesmo nome) é o mesmo contato. */
export function emergenciaDosCadastros(fichas: FichaMesclagem[], principal: string): ItemEmergencia[] {
  const itens = new Map<string, ItemEmergencia>()
  const ordem = [...fichas.filter((f) => f.id === principal), ...fichas.filter((f) => f.id !== principal)]
  for (const f of ordem) {
    for (const c of f.emergencia) {
      const chave = chaveTelefone(c.telefone) || textoNorm(c.nome)
      if (!chave) continue
      const item = itens.get(chave) ?? { chave, contato: c, ids: [], porCadastro: {} }
      item.ids.push(c.id)
      item.porCadastro[f.id] = true
      itens.set(chave, item)
    }
  }
  return [...itens.values()]
}

export const chaveConta = (c: ContaFicha): string => {
  const conta = [digitos(c.banco), digitos(c.agencia), digitos(c.conta)].join("/")
  return conta !== "//" ? conta : `pix:${textoNorm(c.pix)}`
}

export type ItemConta = { chave: string; conta: ContaFicha; ids: string[]; porCadastro: Record<string, true> }

export function contasDosCadastros(fichas: FichaMesclagem[], principal: string): ItemConta[] {
  const itens = new Map<string, ItemConta>()
  const ordem = [...fichas.filter((f) => f.id === principal), ...fichas.filter((f) => f.id !== principal)]
  for (const f of ordem) {
    for (const c of f.contas) {
      const chave = chaveConta(c)
      const item = itens.get(chave) ?? { chave, conta: c, ids: [], porCadastro: {} }
      item.ids.push(c.id)
      item.porCadastro[f.id] = true
      itens.set(chave, item)
    }
  }
  return [...itens.values()]
}

// ── Vínculos ────────────────────────────────────────────────────────────────

/** Os períodos de filiação dos dois se sobrepõem (vazio = sem limite)? */
export function periodosSobrepoem(a: VinculoFicha, b: VinculoFicha): boolean {
  return (a.filiacao ?? "0000") <= (b.desfiliacao ?? "9999") && (b.filiacao ?? "0000") <= (a.desfiliacao ?? "9999")
}

/** A mesma regra da mesclagem automática: mesma fonte, mesma matrícula, períodos juntos. */
export function mesmoEmprego(a: VinculoFicha, b: VinculoFicha): boolean {
  if (!a.fonteId || a.fonteId !== b.fonteId) return false
  const m = chaveMatricula(a.matricula)
  return m !== "" && m === chaveMatricula(b.matricula) && periodosSobrepoem(a, b)
}

export type LinhaVinculo = {
  chave: string
  fonte: string | null
  /** Em cada cadastro, o vínculo que cai nesta linha (no máximo um). */
  porCadastro: Record<string, VinculoFicha>
  /** Todos são o mesmo emprego: a tela já sugere unir. */
  sugerirUnir: boolean
  /** Unir aqui junta períodos separados: pode ser refiliação. */
  periodosSeparados: boolean
  /** Sugestão de qual fica: o que tem documento; depois o do principal. */
  ficaSugerido: string
}

/**
 * Alinha os vínculos: cada linha tem no máximo um de cada cadastro. Só vínculos
 * da mesma fonte dividem linha (só eles podem ser unidos), e os do mesmo emprego
 * se encontram primeiro. Dois vínculos no MESMO cadastro são legítimos: ficam em
 * linhas separadas.
 */
export function alinharVinculos(fichas: FichaMesclagem[], principal: string): LinhaVinculo[] {
  const ordem = [...fichas.filter((f) => f.id === principal), ...fichas.filter((f) => f.id !== principal)]
  const restantes = new Map(ordem.map((f) => [f.id, [...f.vinculos]]))
  const linhas: LinhaVinculo[] = []

  const fechar = (ancora: VinculoFicha, porCadastro: Record<string, VinculoFicha>) => {
    const membros = Object.values(porCadastro)
    const comDocumento = (v: VinculoFicha) => Boolean(v.fichaUrl || v.cartaUrl)
    linhas.push({
      // Pelos vínculos, não pela âncora: não muda ao trocar o principal.
      chave: membros.map((v) => v.id).sort().join("+"),
      fonte: ancora.fonte,
      porCadastro,
      sugerirUnir: membros.length > 1 && membros.every((v) => v === ancora || mesmoEmprego(ancora, v)),
      periodosSeparados: membros.some((v) => !periodosSobrepoem(ancora, v)),
      ficaSugerido: (membros.find(comDocumento) ?? ancora).id,
    })
  }

  // 1ª volta: o mesmo emprego se encontra antes de tudo, senão um vínculo antigo
  // da mesma fonte tomaria o lugar ao lado do par verdadeiro.
  for (const f of ordem) {
    const meus = restantes.get(f.id)!
    for (const ancora of [...meus]) {
      const porCadastro: Record<string, VinculoFicha> = { [f.id]: ancora }
      for (const outro of ordem) {
        if (outro.id === f.id) continue
        const lista = restantes.get(outro.id)!
        const achado = lista.find((v) => mesmoEmprego(ancora, v))
        if (achado) porCadastro[outro.id] = achado
      }
      if (Object.keys(porCadastro).length < 2) continue
      for (const [id, v] of Object.entries(porCadastro)) {
        const lista = restantes.get(id)!
        lista.splice(lista.indexOf(v), 1)
      }
      fechar(ancora, porCadastro)
    }
  }

  // 2ª volta: o que sobrou, da mesma fonte, divide linha (só eles podem ser unidos).
  for (const f of ordem) {
    const meus = restantes.get(f.id)!
    while (meus.length) {
      const ancora = meus.shift()!
      const porCadastro: Record<string, VinculoFicha> = { [f.id]: ancora }
      for (const outro of ordem) {
        if (outro.id === f.id) continue
        const lista = restantes.get(outro.id)!
        const achado = lista.find((v) => ancora.fonteId && v.fonteId === ancora.fonteId)
        if (achado) {
          porCadastro[outro.id] = achado
          lista.splice(lista.indexOf(achado), 1)
        }
      }
      fechar(ancora, porCadastro)
    }
  }
  return linhas.sort((a, b) => (a.fonte ?? "").localeCompare(b.fonte ?? ""))
}

export type DecisaoVinculo = { unir: boolean; fica: string }

/** Os pares {fica, sai} a unir, das linhas marcadas. */
export function paresDeVinculos(linhas: LinhaVinculo[], decisoes: Record<string, DecisaoVinculo>) {
  const pares: { fica: string; sai: string }[] = []
  for (const l of linhas) {
    const membros = Object.values(l.porCadastro)
    if (membros.length < 2) continue
    const d = decisoes[l.chave] ?? { unir: l.sugerirUnir, fica: l.ficaSugerido }
    if (!d.unir) continue
    for (const v of membros) if (v.id !== d.fica) pares.push({ fica: d.fica, sai: v.id })
  }
  return pares
}

// ── A decisão inteira ───────────────────────────────────────────────────────

export type Decisao = {
  principal: string
  /** Campo → cadastro de onde vem, só o que a pessoa mudou. */
  campos: Record<string, string>
  telefones: Record<string, PapelTelefone>
  emails: Record<string, PapelEmail>
  /** Endereços (por chave) que NÃO devem ser guardados. */
  enderecosDescartados: string[]
  /** Contatos de emergência (por chave) que NÃO devem ser guardados. */
  emergenciaDescartados: string[]
  vinculos: Record<string, DecisaoVinculo>
  /** Chave da conta principal. */
  contaFavorita: string | null
}

export type EnvioMesclagem = {
  campos: Record<string, string | boolean | null>
  vinculos: { fica: string; sai: string }[]
  contatos: {
    emails_outros: { email: string; tipo: string | null }[]
    emails_descartar: string[]
    telefones_outros: { numero: string; whatsapp: boolean }[]
    telefones_descartar: string[]
    enderecos_outros: Omit<EnderecoFicha, "id">[]
    enderecos_descartar: string[]
    emergencia_descartar: string[]
    contas_unir: { fica: string; sai: string }[]
    conta_favorita: string | null
    rotulos_descartados: string[]
  }
}

/** Da decisão da pessoa ao que a função SQL recebe. */
export function montarEnvio(fichas: FichaMesclagem[], d: Decisao): EnvioMesclagem {
  const campos: EnvioMesclagem["campos"] = {}
  const deFonte = (campo: string) => {
    const id = d.campos[campo] ?? fonteDoCampo(fichas, d.principal, campo)
    return fichas.find((f) => f.id === id)!
  }
  for (const c of CAMPOS_ESCOLHA) {
    const fonte = deFonte(c.campo)
    campos[c.campo] = fonte.valores[c.campo] ?? null
    for (const extra of c.leva ?? []) campos[extra] = fonte.valores[extra] ?? null
  }

  const rotulos: string[] = []

  // Telefones
  const telefones = telefonesDosCadastros(fichas)
  campos.telefone_1 = null
  campos.telefone_2 = null
  campos.telefone_1_whatsapp = false
  campos.telefone_2_whatsapp = false
  const telefones_outros: EnvioMesclagem["contatos"]["telefones_outros"] = []
  const telefones_descartar: string[] = []
  for (const t of telefones) {
    const papel = d.telefones[t.chave] ?? "outros"
    if (papel === "telefone_1" || papel === "telefone_2") {
      campos[papel] = t.valor
      campos[`${papel}_whatsapp`] = t.whatsapp
    } else if (papel === "descartar") {
      telefones_descartar.push(t.chave)
      rotulos.push(t.valor)
    } else if (!Object.values(t.origens).includes("Outros contatos")) {
      telefones_outros.push({ numero: t.valor, whatsapp: t.whatsapp })
    }
  }

  // E-mails
  const emails = emailsDosCadastros(fichas)
  campos.email_pessoal = null
  campos.email_corporativo = null
  const emails_outros: EnvioMesclagem["contatos"]["emails_outros"] = []
  const emails_descartar: string[] = []
  for (const e of emails) {
    const papel = d.emails[e.chave] ?? "outros"
    if (papel === "email_pessoal" || papel === "email_corporativo") {
      campos[papel] = e.valor
    } else if (papel === "descartar") {
      emails_descartar.push(e.chave)
      rotulos.push(e.valor)
    } else if (!Object.values(e.origens).includes("Outros contatos")) {
      emails_outros.push({ email: e.valor, tipo: e.tipo })
    }
  }

  // Endereços: o escolhido fica no cadastro; o resto, em Outros (ou descartado).
  const noCadastro: EnderecoFicha = {
    id: null,
    cep: (campos.endereco_cep as string | null) ?? null,
    logradouro: (campos.endereco_logradouro as string | null) ?? null,
    numero: (campos.endereco_numero as string | null) ?? null,
    complemento: (campos.endereco_complemento as string | null) ?? null,
    bairro: (campos.endereco_bairro as string | null) ?? null,
    cidade: (campos.endereco_cidade as string | null) ?? null,
    estado: (campos.endereco_estado as string | null) ?? null,
  }
  const chaveFinal = chaveEndereco(noCadastro)
  const enderecos_outros: EnvioMesclagem["contatos"]["enderecos_outros"] = []
  const enderecos_descartar: string[] = []
  for (const item of enderecosDosCadastros(fichas)) {
    if (d.enderecosDescartados.includes(item.chave) && item.chave !== chaveFinal) {
      enderecos_descartar.push(...item.ids)
      rotulos.push(linhaEndereco(item.endereco))
    } else if (item.chave !== chaveFinal && item.ids.length === 0) {
      // Só existia nos campos de um cadastro: sem isto, se perderia.
      const { cep, logradouro, numero, complemento, bairro, cidade, estado } = item.endereco
      enderecos_outros.push({ cep, logradouro, numero, complemento, bairro, cidade, estado })
    }
  }

  // Emergência
  const emergencia_descartar: string[] = []
  for (const item of emergenciaDosCadastros(fichas, d.principal)) {
    if (d.emergenciaDescartados.includes(item.chave)) {
      emergencia_descartar.push(...item.ids)
      rotulos.push(`${item.contato.nome} (emergência)`)
    } else {
      // O mesmo contato nos dois cadastros fica uma vez só: o do principal.
      emergencia_descartar.push(...item.ids.slice(1))
    }
  }

  // Contas: nunca descartadas (ordens de pagamento apontam para elas); as
  // iguais viram uma.
  const contas = contasDosCadastros(fichas, d.principal)
  const contas_unir = contas.flatMap((c) => c.ids.slice(1).map((sai) => ({ fica: c.ids[0], sai })))
  const favorita =
    contas.find((c) => c.chave === d.contaFavorita) ??
    contas.find((c) => c.conta.favorito) ??
    contas[0]

  return {
    campos,
    vinculos: paresDeVinculos(alinharVinculos(fichas, d.principal), d.vinculos),
    contatos: {
      emails_outros,
      emails_descartar,
      telefones_outros,
      telefones_descartar,
      enderecos_outros,
      enderecos_descartar,
      emergencia_descartar,
      contas_unir,
      conta_favorita: favorita?.ids[0] ?? null,
      rotulos_descartados: rotulos,
    },
  }
}

export { CAMPOS_ENDERECO }
