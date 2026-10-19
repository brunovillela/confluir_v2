# Resposta a incidentes de segurança com dados pessoais

> **Onda B7** (`docs/plano-documentacao.md`), 18/10/2026. Procedimento do Confluir (operador) e roteiro para as entidades (controladoras), conforme a LGPD art. 48 e o Regulamento de Comunicação de Incidente de Segurança (Resolução CD/ANPD nº 15/2024). Os prazos e papéis repetem o contrato de operação (`contrato-operacao.md`, cláusula 9). **Revisar com o jurídico.**

## 1. O que é incidente

Qualquer evento, confirmado ou suspeito, que afete a **confidencialidade, a integridade ou a disponibilidade** de dados pessoais. Exemplos no Confluir:

| Tipo | Exemplos concretos |
|---|---|
| Acesso indevido | Dados de uma entidade vistos por outra; conta de funcionário usada por terceiro; chave da API pública vazada; uso indevido de "Ver como filiado" |
| Vazamento de segredo | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SAUDE_RELATORIO_CHAVE`, `OPENAI_API_KEY`, token do bot do Telegram, `CRON_SECRET` expostos (repositório, log, print, chat) |
| Divulgação errada | Comunicado ou e-mail em massa para destinatários errados; planilha de filiados enviada a quem não devia; arquivo público no Storage |
| Sigilo do voto | Qualquer forma de ligar voto e eleitor |
| Integridade | Alteração ou exclusão não autorizada (deriva de schema, auditoria mostrando mudança em massa) |
| Disponibilidade | Perda de dados, falha de restauração, indisponibilidade prolongada em período de votação |
| Fornecedor | Incidente comunicado por um suboperador (Supabase, Vercel, OpenAI, Brevo…) |

## 2. Prazos

| Quem | Para quem | Prazo | Fundamento |
|---|---|---|---|
| Confluir (operador) | Entidade afetada | **até 24 h** após tomar conhecimento, com o que se sabe | Contrato de operação, cl. 9.1 |
| Entidade (controladora) | ANPD | **3 dias úteis** a partir do conhecimento, se o incidente puder trazer **risco ou dano relevante** | Res. CD/ANPD 15/2024 |
| Entidade | Titulares afetados | **3 dias úteis**, no mesmo critério, em linguagem simples e por canal direto | Res. CD/ANPD 15/2024 |
| Ambos | Registro interno | Todo incidente, comunicado ou não, guardado por **5 anos** | Res. CD/ANPD 15/2024 |

**Risco ou dano relevante** = afeta direitos ou interesses do titular de forma significativa. Presume-se quando envolve **dado sensível (filiação sindical, saúde, voto)**, dado financeiro, dado de menores, documentos de identificação, credenciais, ou grande volume de titulares. No Confluir, quase todo vazamento de dado de filiado se enquadra.

## 3. Papéis

| Papel | Quem | Faz |
|---|---|---|
| Coordenador do incidente (Confluir) | _a definir_ | Abre o registro, conduz a contenção, decide a escalada, avisa as entidades |
| Técnico de plantão (Confluir) | _a definir_ | Investiga, contém, corrige, coleta evidências |
| Encarregado da entidade | Campo em Institucional › Organização (`/privacidade`) | Avalia o risco para os titulares, comunica a ANPD e os titulares |
| Representante legal da entidade | Diretoria | Aprova a comunicação externa |
| Jurídico | Da entidade e do Confluir | Apoia a avaliação de risco e as comunicações |

## 4. Fontes de detecção já existentes

- **Sentry:** erros da aplicação, alerta semanal de **deriva do schema** (`/api/schema/deriva/tick`) e relatórios de CSP (`/api/csp-relatorio`).
- **Trilha `auditoria`:** alterações em filiações, dados bancários, usuários, permissões, ordens… (Institucional › Auditoria).
- **Livro de exportações e log da API** (Auditoria › Exportações / API): saídas em massa fora do padrão.
- **Bloqueio de login** (`login_tentativas`): picos de tentativas.
- **Acessos ao relatório clínico** (`saude_atendimentos_acessos`).
- **Livro de retenção** (`lgpd_retencao_execucoes`): execução real inesperada.
- **Avisos dos fornecedores** (e-mails de segurança do Supabase, Vercel, OpenAI, GitHub).
- **Relato** de usuário, filiado, entidade ou terceiro: qualquer canal vale, inclusive o e-mail do encarregado.

## 5. Procedimento

### Passo 1: Registrar (na primeira hora)
Abrir o registro (modelo na seção 8) com data e hora do conhecimento, quem relatou, o que se sabe. **O relógio dos prazos começa aqui.**

### Passo 2: Conter (imediato)
Parar o vazamento antes de investigar a fundo: revogar a chave, suspender a conta, tirar o arquivo do ar, desligar o recurso, suspender o tenant (`/admin`), pausar o cron. Ver os roteiros da seção 6.

### Passo 3: Avaliar (até 24 h)
- Quais dados, de quais entidades, quantos titulares, quais categorias (sensível? saúde? voto? menores?).
- Desde quando, como e por quem.
- Houve acesso efetivo ou só exposição? Os dados estavam cifrados?
- Risco provável para os titulares (discriminação no emprego, fraude, constrangimento).

Fontes: `auditoria`, livro de exportações, log da API, logs da Vercel e do Supabase, Sentry.

### Passo 4: Avisar a entidade (até 24 h, pelo Confluir)
E-mail ao encarregado e ao representante legal de cada entidade afetada (modelo A), mesmo com informação incompleta. Atualizar a cada novidade.

### Passo 5: Comunicar a ANPD e os titulares (até 3 dias úteis, pela entidade)
Se houver risco ou dano relevante:
- **ANPD:** pelo formulário de comunicação de incidente no site da ANPD, com o conteúdo mínimo do regulamento (natureza dos dados, titulares, medidas de segurança, riscos, motivos de eventual demora, medidas para reverter ou mitigar). Comunicação preliminar é aceita, com complemento posterior.
- **Titulares:** modelo B, por e-mail e aviso no portal; linguagem simples; o que aconteceu, quais dados, o que foi feito, o que a pessoa pode fazer e o contato do encarregado.

### Passo 6: Recuperar
Corrigir a causa, restaurar dados se necessário (`npm run db:restaurar` comprova o schema; dados vêm do backup do Supabase), girar todas as credenciais tocadas, confirmar que o vazamento parou.

### Passo 7: Aprender (até 15 dias)
Análise pós-incidente sem culpados: linha do tempo, causa raiz, o que funcionou, o que falhou. Ações com dono e prazo. Atualizar este documento, as RIPDs e, se for o caso, o `AGENTS.md`.

## 6. Roteiros de contenção

| Situação | Ação imediata | Atenção |
|---|---|---|
| **`SUPABASE_SERVICE_ROLE_KEY` exposta** | Gerar nova chave no Supabase; atualizar na Vercel; redeploy | Ignora o RLS: tratar como acesso total a todas as entidades até prova em contrário |
| **`SUPABASE_JWT_SECRET` exposto** | Girar o segredo JWT no Supabase; atualizar `.env.local` e Vercel; redeploy | Esse segredo também assina o tenant (`src/lib/tenant-assinatura.ts`), os **links pessoais de votação** (`src/lib/acesso-eleitor.ts`), carteirinhas, descadastro de comunicados e "ver como". Girar **invalida todos esses links**: em período de votação, reenviar os links aos aptos |
| **`SAUDE_RELATORIO_CHAVE` exposta** | Gerar chave nova (versão 2) e recifrar os relatórios com `chave_versao`; nunca apagar a chave antiga antes de recifrar | Perder a chave antiga sem recifrar torna os relatórios ilegíveis; não há rotina pronta (risco R9 da RIPD de saúde) |
| **Chave da API pública vazada** | Revogar em Institucional › API; ver no log da API o que foi baixado e de onde | `/api/v1/filiados` com escopo de CPF expõe a base inteira |
| **Conta de usuário comprometida** | Trocar a senha, encerrar as sessões (Supabase Auth), revisar as permissões, ver a `auditoria` e o livro de exportações dessa pessoa | Exigir MFA (`MFA_OBRIGATORIO=1`) |
| **E-mail ou comunicado ao destinatário errado** | Pausar o cron de comunicação; pedir exclusão aos destinatários; conferir no Brevo quantos abriram | Conta como divulgação de dado sindical se revelar filiação |
| **Arquivo exposto no Storage** | Mover para bucket privado ou apagar; checar os 3 buckets públicos (`comunicacao`, `noticias`, `organizacao`) | URLs assinadas expiram; públicas não |
| **Acesso entre entidades** | Suspender a função suspeita (deploy de correção ou flag); levantar no banco quais linhas cruzaram | Avisar **as duas** entidades |
| **Sigilo do voto** | Congelar a apuração; corrigir por migração (como as de 18/10/2026); avaliar a validade da assembleia com a comissão eleitoral | Reidentificar votos é incidente mesmo sem vazamento externo |
| **Incidente em suboperador** | Pedir ao fornecedor o escopo; aplicar as recomendações dele; avaliar se dados do Confluir foram afetados | Prazos começam quando o Confluir sabe |
| **Outros segredos** (`OPENAI_API_KEY`, `BREVO_API_KEY`, `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `SUPABASE_DB_URL`) | Gerar novo no painel do fornecedor; atualizar na Vercel e no `.env.local`; redeploy | Trocar a `VAPID_PRIVATE_KEY` invalida as assinaturas de push existentes |

Regra para todos os segredos: nunca colar em chat, print, issue ou commit. Se aconteceu, é incidente: girar. Há uma pendência registrada de girar a `ANTHROPIC_API_KEY`.

## 7. Modelos de comunicação

**Modelo A: Confluir → entidade (até 24 h)**

> Assunto: [Confluir] Incidente de segurança em análise — [entidade]
>
> Em [data e hora] tomamos conhecimento de [descrição curta]. Até agora sabemos que [dados e titulares possivelmente afetados, período]. Já fizemos [contenção]. Ainda estamos apurando [pontos em aberto] e enviaremos atualização até [data e hora].
>
> Pela LGPD, cabe à entidade avaliar a comunicação à ANPD e aos titulares em até 3 dias úteis, se houver risco relevante. Estamos à disposição para fornecer as informações necessárias.
>
> Contato do coordenador: [nome, e-mail, telefone].

**Modelo B: entidade → titular**

> Assunto: Aviso importante sobre os seus dados — [entidade]
>
> Em [data], identificamos [o que aconteceu, em linguagem simples]. Os dados envolvidos foram [lista]. Já [o que foi feito]. Recomendamos que você [ações práticas: trocar senha, desconfiar de contatos que peçam dados…].
>
> Se tiver dúvidas, fale com o nosso encarregado: [nome, e-mail]. Você também pode procurar a Autoridade Nacional de Proteção de Dados (ANPD).

## 8. Registro de incidentes

Todo incidente, inclusive os não comunicados, é registrado e guardado por **5 anos**. Por enquanto, o registro é um documento por incidente (fora do repositório, porque pode conter dado pessoal), com:

| Campo | Conteúdo |
|---|---|
| Identificador | INC-AAAA-NN |
| Datas | ocorrência (estimada), conhecimento, contenção, aviso à entidade, comunicação à ANPD e aos titulares, encerramento |
| Descrição | o que aconteceu, como foi detectado |
| Dados e titulares | categorias, quantidade, entidades afetadas, se havia cifragem |
| Avaliação de risco | relevante ou não, com a justificativa (inclusive quando **não** comunicar) |
| Medidas | contenção, correção, credenciais giradas |
| Comunicações | cópias dos avisos (modelos A e B) e o protocolo da ANPD |
| Lições | causa raiz, ações com dono e prazo |

**Próximo passo técnico:** levar esse registro para o sistema (tabela de incidentes no painel da plataforma, com os prazos contados automaticamente). Fica junto das demais melhorias das RIPDs.

## 9. Preparação contínua

- **Simulado anual:** escolher um roteiro da seção 6 (ex.: vazamento do `SUPABASE_JWT_SECRET` em período de votação) e executar no ambiente de demo, medindo os tempos.
- **Contatos atualizados:** encarregado de cada entidade (campo no sistema) e coordenador e técnico do Confluir (seção 3).
- **Restauração testada:** `npm run db:restaurar` comprovou o schema em 18/10/2026. O ensaio com dados (backup do Supabase) fica na Onda E.
- **Revisão** deste documento a cada incidente e a cada mudança de suboperador.
