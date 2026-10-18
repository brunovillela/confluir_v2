# RIPD 1: Saúde do trabalhador e uso de IA

> **Relatório de Impacto à Proteção de Dados Pessoais** (LGPD, arts. 5º XVII, 10 §3º e 38), no modelo da ANPD. **Rascunho técnico** da Onda B3 (`docs/plano-documentacao.md`), de 18/10/2026. As evidências citam o código (`arquivo:linha`). As bases legais e a aceitação dos riscos residuais **precisam ser validadas** pelo encarregado e pelo jurídico da entidade.

## 1. Identificação

| | |
|---|---|
| Controladora | Cada entidade sindical (tenant) que usa o módulo Saúde |
| Operador | Confluir |
| Suboperadores envolvidos | Supabase (banco/arquivos, São Paulo), Vercel (funções em São Paulo), Sentry, **OpenAI (EUA)** (ver `suboperadores.md`) |
| Encarregado | _a indicar pela entidade_ |
| Processo do ROPA | P08 (saúde do trabalhador) e parte de P10 (ASO e atestados do quadro próprio) |

## 2. Por que este RIPD é necessário

- O tratamento é de **dado pessoal sensível de saúde** (art. 5º, II), somado ao dado sindical, porque o titular é filiado.
- O volume é grande: **13.722 CATs**, cada uma com nome, CPF, nascimento, CID-10, diagnóstico, lesão, afastamento e óbito.
- Há **tecnologia nova**: a CAT é lida por IA de um fornecedor nos EUA, uma transferência internacional de dado sensível.
- O acervo é retido por décadas (NR-07).

## 3. Descrição do tratamento

| Elemento | Situação em 18/10/2026 |
|---|---|
| **Dados** | CAT: identificação do acidentado, empregador, ocupação, data/hora, tipo, parte do corpo, natureza, agente, CID-10, diagnóstico, afastamento, internação, óbito, médico/CRM. Atendimentos de saúde: assistido, profissional, observação, relatório clínico **cifrado**. CIPA: representantes e atas. Quadro próprio: ASO (68) e atestados (179) com CID. |
| **Volume** | `saude_cat` 13.722; `saude_assistidos` 2; `saude_atendimentos` 3; `pes_atestados_medicos` 179; `aso` 68. O módulo de atendimentos está começando; o grosso é a CAT migrada do Bubble. |
| **Origem** | Digitação; importação de CSV; leitura de PDF por IA; migração do Bubble (`scripts/migrar-cat-bubble.mjs`). |
| **Quem acessa** | Permissões `saude_cat`, `saude_atendimento` e `saude_gestao` (`src/lib/permissoes-catalogo.ts:94-96`). O relatório clínico depende do cadastro de profissional (`src/lib/saude-sigilo.ts:158-189`), não da permissão. |
| **Finalidade** | Acompanhar acidentes de trabalho, inclusive a CAT emitida pela entidade (Lei 8.213/91, art. 22 §2º), dar assistência e produzir indicadores para a ação sindical. |
| **Retenção** | 20 anos após o fim da exposição ou do vínculo (NR-07), com `retencao_ate` por assistido; a CAT não tem campo de retenção. |

### Fluxo da leitura de CAT por IA
1. Quem tem `saude_cat` ou `saude_gestao` envia o PDF (`src/app/painel/saude/cat/importar-pdf-actions.ts:28-43`).
2. O servidor extrai o texto. Se houver texto, **todo o texto do formulário** vai à OpenAI; se não, o **PDF inteiro em base64**, com até 20 MB (`src/lib/cat-leitura-ia.ts:164-199`).
3. A chamada usa `store: false` (`src/lib/ia.ts:189`). Volta um JSON com 50 campos, que preenche o formulário; nada é gravado até a pessoa salvar. O PDF não é guardado.
4. Há caminhos sem IA: CSV e digitação (`src/app/painel/saude/cat/nova/page.tsx:41-98`).

## 4. Necessidade e proporcionalidade

| Princípio | Avaliação |
|---|---|
| **Base legal** | Art. 11, II, a (obrigação legal: Lei 8.213/91 art. 22 §2º; NR-07). Art. 11, II, f (tutela da saúde, só nos atendimentos feitos por profissional). Art. 16, I (conservação). _Proposta._ |
| **Finalidade e adequação** | Adequada. A entidade tem papel legal na emissão e no acompanhamento da CAT. |
| **Necessidade (minimização)** | **Parcial.** A IA recebe o documento inteiro, com nome, CPF, nascimento e médico, quando só os campos do acidente seriam necessários. O painel analítico manda ao navegador microdados, uma linha por CAT. |
| **Qualidade** | Leitura por IA conferida por pessoa antes de salvar; detecção de duplicidades. |
| **Transparência** | **Insuficiente.** Nenhuma tela avisa que o PDF vai a um fornecedor nos EUA. O portal mostra ao filiado o histórico de atendimentos e as CATs ligadas a ele. |
| **Direitos do titular** | A exportação "meus dados" **exclui saúde** e só remete à equipe (`src/lib/db/lgpd.ts:262-300`). A anonimização preserva o acervo de saúde por obrigação legal (art. 16, I), o que está correto, mas cobre pouco (ver R7). |
| **Segurança** | Ver os riscos. |

## 5. Riscos

Escala: probabilidade (P) e impacto (I) em B (baixo), M (médio) ou A (alto). Nível = combinação dos dois. **Residual** = depois das medidas recomendadas.

| # | Risco | P | I | Nível | Medidas existentes | Medidas recomendadas | Residual | Dono |
|---|---|---|---|---|---|---|---|---|
| R1 | **Transferência de dado de saúde identificado à OpenAI (EUA)** sem DPA confirmado e com retenção de até 30 dias para monitoramento de abuso | A | A | **Alto** | `store: false` (`src/lib/ia.ts:189`); IA opcional; sem upload de arquivo | (a) DPA + retenção zero com a OpenAI; (b) **pseudonimizar**: enviar só o texto sem nome, CPF, nascimento e médico; (c) aviso na tela antes do envio; (d) registrar quem usou a IA, quando e em qual CAT | Baixo | Titular das contas (a); dev (b–d) |
| R2 | **Pedido de "Saúde" no portal vaza para equipe não clínica**: vira Demanda com CPF completo e é avisado por sino, e-mail, **Telegram** e push a quem tem `ferramentas_demandas` (`src/lib/db/portal-atendimentos.ts:315-341`; `src/lib/db/avisos.ts:20-31,383-396`); o título clínico vai pré-preenchido pela URL (`src/app/portal/saude/page.tsx:43-46`) | A | A | **Alto** | Nenhuma específica | Rotear `assunto=saude` só para a equipe de saúde; aviso sem título nem CPF ("novo pedido de saúde"); não pré-preencher título clínico pela URL | Baixo | Dev |
| R3 | **CAT nominal visível a perfil não clínico**: quem tem só `saude_atendimento` vê CPF, CID e diagnóstico e exporta CSV nominal sem registro (`src/app/painel/saude/cat/exportar/route.ts:28-115`) | M | A | **Alto** | Permissões do módulo | Perfil clínico para CAT nominal e exportação; registrar leitura e exportação de CAT | Médio | Dev + entidade (perfis) |
| R4 | **Reidentificação no painel analítico**: microdados com 11 dimensões e cruzamento no cliente, sem contagem mínima (`src/lib/db/saude-painel.ts:204-279`) | M | A | **Alto** | Sem nome, CPF ou texto livre | Agregar no servidor e suprimir células com menos de 5 (k ≥ 5) | Baixo | Dev |
| R5 | **Trilha de acesso incompleta e alterável**: a leitura de CAT não é registrada; não há auditoria em `saude_*`, `aso` e `pes_atestados_medicos`; o registro de acesso ao relatório ignora erro de gravação (`src/lib/db/atendimentos.ts:449-462`) e a tabela aceita UPDATE/DELETE | M | M | Médio | `saude_atendimentos_acessos` registra leitura e gravação do relatório clínico | Registrar leitura de CAT; trigger de auditoria nas tabelas de saúde; falha do log bloqueia a leitura; `saude_atendimentos_acessos` só INSERT (revoke) | Baixo | Dev |
| R6 | **Brecha no sigilo do relatório clínico**: o motivo "autor" vale para o `atendente_id`, isto é, quem registrou o atendimento, mesmo sem ser profissional (`src/lib/saude-sigilo.ts:164-169`) | B | A | Médio | AES-256-GCM com AAD (`src/lib/saude-sigilo.ts:70-101`); só `lerRelatorio` decifra | "Autor" só se for profissional cadastrado | Baixo | Dev |
| R7 | **Anonimização incompleta**: não alcança `saude_cat` (nome, CPF e nascimento em claro), `saude_assistidos.nome`, `observacao_aberta`, prontuário e atestados (`anonimizar_filiacao`, linha de base `:1086-1191`) | M | M | Médio | Cópia cifrada de nome/CPF no assistido e corte do `filiado_id` (`src/lib/db/lgpd.ts:71-94`) | Estender a anonimização (ou o regime de retenção) à CAT e aos demais campos; decifragem controlada e registrada da cópia retida | Baixo | Dev + jurídico |
| R8 | **Retenção sem execução**: a view `lgpd_retencoes_vencidas` não é usada; não há ação de descarte; a CAT e os PDFs no bucket `saude` não têm prazo | M | M | Médio | Campos de retenção e alertas visuais (`src/app/painel/saude/assistidos/[id]/page.tsx:125-135`) | Fluxo de descarte (tela, ação, registro) e prazo para CAT e PDFs (B4) | Baixo | Dev + entidade |
| R9 | **Chave única e sem rotação** (`SAUDE_RELATORIO_CHAVE`, `src/lib/saude-sigilo.ts:39-53`): vazamento expõe todos os tenants; perda torna os relatórios ilegíveis | B | A | Médio | `chave_versao` existe | Chave por tenant ou envelope; rotina de rotação; backup da chave documentado (Onda E) | Baixo | Dev + operação |
| R10 | **Cópias fora do controle**: cache do Bubble em disco local (`.auditoria-bubble*/saudecat.json`, ~24 MB cada, sem prazo); CATs, ASO e atestados legados ainda em URL **pública** da CDN do Bubble; texto clínico livre em `observacao_aberta` sem cifragem | M | A | **Alto** | Diretórios fora do git (`.gitignore`) | Apagar os caches locais após a conferência; migrar arquivos legados para o bucket privado e eliminar no Bubble; cifrar `observacao_aberta` ou proibir conteúdo clínico nela | Baixo | Usuário (caches, Bubble) + dev |
| R11 | **CID do atestado do quadro próprio lido por permissão administrativa** (`pessoal_gestao`, `src/lib/db/pessoal-saude.ts:13-56`) | M | M | Médio | Permissão do módulo Pessoal | Separar a visualização do CID numa permissão própria ou ocultá-lo | Baixo | Dev |

## 6. Plano de ação (prioridade)

1. **R2**: rotear pedidos de saúde do portal só para a equipe de saúde e tirar dado sensível dos avisos. É o único risco ativo que manda dado de saúde a quem não deveria.
2. **R1**: DPA + retenção zero com a OpenAI (usuário); pseudonimização, aviso e registro (dev).
3. **R10**: apagar os caches locais e tirar os arquivos da CDN pública do Bubble.
4. **R3, R4**: perfil clínico para a CAT nominal; agregar o painel com k ≥ 5.
5. **R5, R6, R7, R8, R9, R11**: trilha, sigilo, anonimização, descarte, chave e atestado.

## 7. Conclusão

O módulo tem bases sólidas: cifragem do relatório clínico, regras de quem lê, acervo retido separado do cadastro e IA sem armazenamento. Quatro riscos altos (R1, R2, R4, R10), porém, permanecem até as medidas acima. **Recomendação:** continuar o tratamento, mas suspender a leitura de CAT por IA até cumprir R1 (a) e (b), ou deixá-la só para documentos já sem identificação, e corrigir R2 antes do próximo ciclo de uso do portal.

## 8. Aprovação

| Papel | Nome | Data | Decisão |
|---|---|---|---|
| Encarregado da entidade | | | |
| Representante legal | | | |
| Operador (Confluir) | | | |
