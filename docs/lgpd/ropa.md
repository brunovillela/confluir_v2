<!-- GERADO por scripts/gerar-ropa.mjs (npm run lgpd:ropa). Texto: docs/lgpd/processos.mjs. Tabelas e categorias: docs/dados/dados-pessoais.csv. Não editar à mão. -->

# Registro das operações de tratamento (ROPA)

> **Rascunho técnico (Onda B1).** As bases legais, os prazos de retenção e a análise de transferência internacional são **propostas** a validar pelo jurídico e pelo encarregado de cada entidade.

## Papéis

- **Controladora:** cada entidade sindical (tenant) que usa o Confluir decide sobre o tratamento dos dados dos seus filiados, funcionários e demais titulares.
- **Operador:** o Confluir trata os dados em nome da entidade, conforme as instruções dela (art. 39). Ambos mantêm registro das operações (art. 37).
- **Suboperadores:** contratados pelo Confluir para a infraestrutura (seção ao final; detalhes em `suboperadores.md`, B2).
- **Natureza dos dados:** a base inteira é **dado pessoal sensível**, porque a filiação a sindicato está no art. 5º, II. Há também saúde (CAT, ASO, atendimentos) e dados de menores (dependentes).

## Visão geral

| # | Processo | Tabelas | Categorias de dados | Transferência internacional |
|---|---|---|---|---|
| P01 | [Filiação e cadastro do associado](#p01) | 16 | identificação, **sensível: filiação/posição sindical**, **sensível: saúde**, financeiro, trabalhista, credencial (segredo de acesso, nunca exportar) | sim |
| P02 | [Contribuições, receitas e cobranças](#p02) | 3 | identificação, **sensível: filiação/posição sindical**, financeiro, trabalhista | sim |
| P03 | [Atendimento ao filiado no portal](#p03) | 6 | identificação, **sensível: filiação/posição sindical**, credencial (segredo de acesso, nunca exportar) | sim |
| P04 | [Oposição à contribuição assistencial](#p04) | 3 | identificação, **sensível: filiação/posição sindical**, trabalhista | sim |
| P05 | [Assembleias e votações](#p05) | 13 | identificação, **sensível: filiação/posição sindical**, trabalhista, credencial (segredo de acesso, nunca exportar) | sim |
| P06 | [Representação, reuniões e agenda](#p06) | 7 | identificação, **sensível: filiação/posição sindical**, trabalhista | sim |
| P07 | [Diretoria, mandatos e ofícios](#p07) | 8 | identificação, **sensível: filiação/posição sindical**, **sensível: saúde**, financeiro, trabalhista | sim |
| P08 | [Saúde do trabalhador (CAT, atendimentos, CIPA)](#p08) | 11 | identificação, **sensível: filiação/posição sindical**, **sensível: saúde**, trabalhista | sim |
| P09 | [Jurídico](#p09) | 4 | identificação, **sensível: filiação/posição sindical**, financeiro, trabalhista | sim |
| P10 | [Pessoal: RH dos funcionários da entidade](#p10) | 32 | identificação, **sensível: saúde**, financeiro, trabalhista | sim |
| P11 | [Financeiro, compras, fornecedores e contratos](#p11) | 28 | identificação, financeiro, trabalhista, credencial (segredo de acesso, nunca exportar) | sim |
| P12 | [Institucional: custeios, viagens, linhas e patrimônio](#p12) | 8 | identificação, **sensível: filiação/posição sindical**, **sensível: saúde**, financeiro, trabalhista | sim |
| P13 | [Hospedagem conveniada e cessão de espaços](#p13) | 12 | identificação, **sensível: filiação/posição sindical**, financeiro, credencial (segredo de acesso, nunca exportar) | sim |
| P14 | [Frota: veículos e condutores](#p14) | 12 | identificação, financeiro | sim |
| P15 | [Comunicação, eventos e avisos](#p15) | 9 | identificação, **sensível: filiação/posição sindical**, financeiro, trabalhista, credencial (segredo de acesso, nunca exportar) | sim |
| P16 | [Contas de acesso, segurança, auditoria e gestão interna](#p16) | 20 | identificação, **sensível: filiação/posição sindical**, financeiro, trabalhista, credencial (segredo de acesso, nunca exportar) | sim |

<a id="p01"></a>
## P01. Filiação e cadastro do associado

**Finalidade.** Admitir, manter e encerrar a filiação: ficha (inclusive a pública, com assinatura gov.br), vínculos com a fonte pagadora, prontuário administrativo, contatos e dados bancários para reembolsos.

**Titulares.** Filiados, ex-filiados, interessados em se filiar; contatos de emergência (terceiros).

**Categorias de dados.** identificação; **sensível: filiação/posição sindical**; **sensível: saúde**; financeiro; trabalhista; credencial (segredo de acesso, nunca exportar).

**Base legal (proposta).**

- Art. 11, I: consentimento específico no ato da filiação (termo LGPD com versão, data, IP e navegador em `filiacao_tl_aceites`).
- Art. 11, II, a: obrigação legal/regulatória ligada à representação sindical (CF art. 8º; CLT).
- Art. 11, II, d: exercício regular de direitos, para manter o histórico após a desfiliação.

**Compartilhamento com terceiros.** Fonte pagadora/empregador (desconto em folha, mediante autorização do filiado). Nenhum compartilhamento automático externo em uso (webhook `filiacao.aprovada` existe, mas o único destino cadastrado é de teste).

**Suboperadores.** Supabase, Vercel, Sentry, Brevo / Resend, gov.br / ITI (ICP-Brasil), OpenAI, Bubble (sistema legado).

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); Brevo / Resend: Brevo: União Europeia (França); Resend: EUA; OpenAI: EUA; Bubble (sistema legado): EUA. Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** Enquanto filiado. Após a desfiliação, 5 anos (prescrição de cobranças, CC art. 206 §5º, I); depois, anonimização com `anonimizar_filiacao` (já implementada). Códigos RT01–RT03 em retencao.md (proposta a validar).

**Medidas de segurança.** RLS por tenant; trilha `auditoria` em filiacoes, filiacao_vinculos e dados_bancarios; anonimização que corta o vínculo com o acervo de saúde; permissão própria `filiacao_lgpd`.

<details><summary>Tabelas (16) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [dados_bancarios](../dados/dicionario/filiacao.md#dados_bancarios) | identificacao, financeiro | `banco` (financeiro), `agencia` (financeiro), `conta` (financeiro), `tipo_conta` (financeiro), `pix` (financeiro), `favorecido` (identificacao), `banco_codigo` (financeiro), `pix_tipo` (financeiro), `pix_beneficiario` (identificacao) |
| [emails](../dados/dicionario/filiacao.md#emails) | identificacao | `email` (identificacao), `pessoa_contato` (identificacao) |
| [enderecos](../dados/dicionario/filiacao.md#enderecos) | identificacao | `cep` (identificacao), `logradouro` (identificacao), `numero` (identificacao), `complemento` (identificacao), `complemento_correios` (identificacao), `bairro` (identificacao), `cidade` (identificacao), `estado` (identificacao) |
| [filiacao_coletiva_itens](../dados/dicionario/filiacao.md#filiacao_coletiva_itens) | identificacao, sens. sindical, trabalhista | `cpf` (identificacao), `nome_completo` (identificacao), `matricula` (trabalhista), `email` (identificacao), `resultado` (sens. sindical), `condicao_anterior` (sens. sindical), `observacao` (sens. sindical), `desistencia_em` (sens. sindical) |
| [filiacao_contatos_emergencia](../dados/dicionario/filiacao.md#filiacao_contatos_emergencia) | identificacao, sens. sindical | `cpf` (identificacao), `nome` (identificacao), `telefone` (identificacao), `vinculo` (identificacao) |
| [filiacao_duplicidades_ignoradas](../dados/dicionario/filiacao.md#filiacao_duplicidades_ignoradas) | identificacao | `chave` (identificacao), `motivo` (identificacao) |
| [filiacao_prontuario](../dados/dicionario/filiacao.md#filiacao_prontuario) | sens. sindical, sens. saude | `descricao` (sens. saude), `tipo` (sens. sindical), `atendimento_raw` (sens. saude) |
| [filiacao_registro](../dados/dicionario/filiacao.md#filiacao_registro) | identificacao, sens. sindical | `cpf` (identificacao), `nome` (identificacao), `nome_social` (identificacao), `sexo` (identificacao), `matricula_sindical` (sens. sindical), `matricula_sindical_n` (sens. sindical), `condicao_sindical` (sens. sindical) |
| [filiacao_solicitacao_eventos](../dados/dicionario/filiacao.md#filiacao_solicitacao_eventos) | identificacao, sens. sindical | `evento` (sens. sindical), `detalhe` (sens. sindical), `ip` (identificacao), `user_agent` (identificacao) |
| [filiacao_solicitacoes](../dados/dicionario/filiacao.md#filiacao_solicitacoes) | identificacao, sens. sindical, trabalhista, credencial | `token` (credencial), `nome_completo` (identificacao), `nome_completo_norm` (identificacao), `cpf` (identificacao), `nascimento_data` (identificacao), `sexo` (identificacao), `email` (identificacao), `telefone_1` (identificacao), `telefone_2` (identificacao), `endereco_cep` (identificacao), `endereco_logradouro` (identificacao), `endereco_numero` (identificacao), `endereco_complemento` (identificacao), `endereco_bairro` (identificacao), `endereco_cidade` (identificacao), `endereco_estado` (identificacao), `empregador_id` (trabalhista), `matricula` (trabalhista), `cargo` (trabalhista), `lotacao` (trabalhista), `aceite_lgpd_data` (sens. sindical), `aceite_desconto_data` (sens. sindical), `codigo_hash` (credencial), `situacao` (sens. sindical), `documento_assinado_url` (sens. sindical), `reprovacao_motivo` (sens. sindical), `ip` (identificacao), `user_agent` (identificacao), `nome_social` (identificacao), `assinatura_validacao` (identificacao) |
| [filiacao_suspensoes](../dados/dicionario/filiacao.md#filiacao_suspensoes) | identificacao, sens. sindical, financeiro | `cpf` (identificacao), `escopo` (financeiro), `motivo` (financeiro) |
| [filiacao_tl_aceites](../dados/dicionario/filiacao.md#filiacao_tl_aceites) | identificacao, sens. sindical | `cpf` (identificacao), `tipo` (sens. sindical), `ip` (identificacao), `user_agent` (identificacao) |
| [filiacao_vinculos](../dados/dicionario/filiacao.md#filiacao_vinculos) | identificacao, sens. sindical, trabalhista | `cargo` (trabalhista), `lotacao` (trabalhista), `matricula` (trabalhista), `data_entrada_admissao` (trabalhista), `data_saida_demissao` (trabalhista), `data_filiacao` (sens. sindical), `data_desfiliacao` (sens. sindical), `ficha_filiacao` (sens. sindical), `ficha_filiacao_aceita` (sens. sindical), `carta_desfiliacao` (sens. sindical), `carta_desfiliacao_aceita` (sens. sindical), `filiacao_data_adesao` (sens. sindical), `filiacao_data_saida` (sens. sindical), `filiacao_desfiliacao_carta` (sens. sindical), `filiacao_desfiliacao_comprovante` (sens. sindical), `filiacao_ficha` (sens. sindical), `filiacao_coletiva` (sens. sindical), `fonte_pg_cargo` (trabalhista), `fonte_pg_matricula` (trabalhista), `fonte_pg_admissao` (trabalhista), `fonte_pg_demissao` (trabalhista), `fonte_pg_lotacao` (trabalhista), `fonte_pg_regime` (trabalhista), `regime_trabalho` (trabalhista), `lotacao_offshore` (trabalhista), `condicao_na_fonte` (trabalhista) |
| [filiacoes](../dados/dicionario/filiacao.md#filiacoes) | identificacao, sens. sindical, financeiro, trabalhista, credencial | `cpf` (identificacao), `nome_completo` (identificacao), `nome_social` (identificacao), `foto` (identificacao), `sexo` (identificacao), `nascimento_data` (identificacao), `nascimento_dia` (identificacao), `nascimento_mes` (identificacao), `telefone_1` (identificacao), `telefone_2` (identificacao), `email_pessoal` (identificacao), `email_corporativo` (identificacao), `endereco_cep` (identificacao), `endereco_logradouro` (identificacao), `endereco_numero` (identificacao), `endereco_complemento` (identificacao), `endereco_bairro` (identificacao), `endereco_cidade` (identificacao), `endereco_estado` (identificacao), `matricula_sindical` (sens. sindical), `matricula_sindical_numero` (sens. sindical), `filiacao_excluida` (sens. sindical), `valido` (sens. sindical), `filiacao_lotacao` (trabalhista), `filiacao_fonte_pg_admissao` (trabalhista), `outra_filiacao_entidade` (sens. sindical), `outra_filiacao_desfiliar` (sens. sindical), `tl_desconto_data` (sens. sindical), `codigo_verificacao` (credencial), `outra_filiacao_desfiliada` (sens. sindical), `outra_filiacao_solicitacao` (sens. sindical), `slug` (identificacao), `votoonline2026` (sens. sindical), `filiacao_condicao` (sens. sindical), `nome_completo_norm` (identificacao), `condicao_desde` (sens. sindical), `ficha_assinada_em` (sens. sindical), `filiacao_informada_fonte_em` (sens. sindical), `ativo_em` (sens. sindical), `desfiliacao_informada_fonte_em` (sens. sindical), `inativo_em` (sens. sindical), `filiacao_coletiva_prazo` (sens. sindical), `filiacao_coletiva_em` (sens. sindical), `condicao_na_fonte` (trabalhista), `fonte_pg_offshore` (trabalhista), `forma_recebimento` (financeiro), `forma_recebimento_ordem` (financeiro), `desfiliacao_motivo` (sens. sindical), `desfiliacao_motivo_detalhe` (sens. sindical), `contribuicao_valor` (financeiro) |
| [telefones](../dados/dicionario/filiacao.md#telefones) | identificacao | `numero` (identificacao) |
| [vinculos_trabalhistas](../dados/dicionario/filiacao.md#vinculos_trabalhistas) | identificacao, trabalhista | `cbo_numero` (trabalhista), `cargo` (trabalhista), `lotacao` (trabalhista), `matricula` (trabalhista), `email_corporativo` (identificacao), `regime_trabalho` (trabalhista), `regime_trabalho_os` (trabalhista), `contrato_trabalho` (trabalhista), `contrato_admissao` (trabalhista), `contrato_demissao` (trabalhista), `cipa_ou_ciplat` (trabalhista) |

</details>

<sub>Titulares registrados no banco para estas tabelas: diretores; eleitores; filiados; fornecedores pf; funcionários; público externo (candidatos à filiação); terceiros indicados (familiares); usuários do sistema.</sub>

<a id="p02"></a>
## P02. Contribuições, receitas e cobranças

**Finalidade.** Conciliar as relações de desconto enviadas pelas fontes pagadoras, cobrar contribuições (Pix/boleto), controlar inadimplência e reembolsos ao filiado.

**Titulares.** Filiados e trabalhadores da base listados nas relações das fontes pagadoras.

**Categorias de dados.** identificação; **sensível: filiação/posição sindical**; financeiro; trabalhista.

**Base legal (proposta).**

- Art. 7º, V e art. 11, II, a: relação associativa e desconto em folha autorizado (CLT arts. 545 e 582).
- Art. 7º, II: obrigações contábeis e fiscais.

**Compartilhamento com terceiros.** Fontes pagadoras (envio e retorno das relações); banco (cobrança).

**Suboperadores.** Supabase, Vercel, Sentry, Brevo / Resend, OpenAI.

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); Brevo / Resend: Brevo: União Europeia (França); Resend: EUA; OpenAI: EUA. Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** 5 anos após o exercício (CTN arts. 173 e 174), ou enquanto houver cobrança ou discussão judicial. Códigos RT04 em retencao.md (proposta a validar).

**Medidas de segurança.** RLS por tenant; leitura da relação por IA em blocos, sem guardar o arquivo na IA (store: false).

**Observações.** A `filiacao_recebe` tem ~795 mil linhas com CPF, nome e valor: maior volume de dado sindical do sistema.

<details><summary>Tabelas (3) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [filiacao_cobrancas](../dados/dicionario/filiacao.md#filiacao_cobrancas) | identificacao, sens. sindical, financeiro | `cpf` (identificacao), `valor` (financeiro), `situacao` (financeiro), `pago_em` (financeiro), `valor_pago` (financeiro) |
| [filiacao_recebe](../dados/dicionario/filiacao.md#filiacao_recebe) | identificacao, sens. sindical, financeiro, trabalhista | `cpf` (identificacao), `valor` (financeiro), `matricula_sindical` (sens. sindical), `fonte_pg_matricula` (trabalhista), `filiado_raw` (sens. sindical), `forma_recebimento` (financeiro), `nome` (identificacao) |
| [filiacao_reembolsos](../dados/dicionario/filiacao.md#filiacao_reembolsos) | sens. sindical, financeiro | `justificativa` (sens. sindical), `valor` (financeiro) |

</details>

<sub>Titulares registrados no banco para estas tabelas: filiados.</sub>

<a id="p03"></a>
## P03. Atendimento ao filiado no portal

**Finalidade.** Atender solicitações do filiado pelo portal, avisá-lo (e-mail, push) conforme as preferências dele e registrar quem não é filiado e usa o portal.

**Titulares.** Filiados e não filiados que acessam o portal.

**Categorias de dados.** identificação; **sensível: filiação/posição sindical**; credencial (segredo de acesso, nunca exportar).

**Base legal (proposta).**

- Art. 7º, V: execução da relação associativa.
- Art. 7º, I: consentimento para avisos opcionais (opt-in em `portal_avisos_preferencias`).

**Compartilhamento com terceiros.** Nenhum.

**Suboperadores.** Supabase, Vercel, Sentry, Brevo / Resend, Serviços de push dos navegadores (Google, Apple, Mozilla).

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); Brevo / Resend: Brevo: União Europeia (França); Resend: EUA; Serviços de push dos navegadores (Google, Apple, Mozilla): EUA. Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** Atendimentos: 5 anos após o encerramento. Assinaturas de push: até o cancelamento ou falha de entrega. Códigos RT05, RT06 em retencao.md (proposta a validar).

**Medidas de segurança.** RLS por tenant; anexos em bucket privado; preferências de aviso por categoria.

<details><summary>Tabelas (6) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [portal_atendimentos](../dados/dicionario/filiacao.md#portal_atendimentos) | identificacao, sens. sindical | `cpf` (identificacao), `nome` (identificacao), `email` (identificacao), `titulo` (identificacao) |
| [portal_atendimentos_mensagens](../dados/dicionario/filiacao.md#portal_atendimentos_mensagens) | identificacao, sens. sindical | `autor_nome` (identificacao), `texto` (identificacao), `anexo_caminho` (identificacao), `anexo_nome` (identificacao) |
| [portal_avisos](../dados/dicionario/filiacao.md#portal_avisos) | identificacao, sens. sindical | `cpf` (identificacao), `texto` (sens. sindical) |
| [portal_avisos_preferencias](../dados/dicionario/filiacao.md#portal_avisos_preferencias) | identificacao | `cpf` (identificacao) |
| [portal_nao_filiado](../dados/dicionario/filiacao.md#portal_nao_filiado) | identificacao | `cpf` (identificacao), `nome` (identificacao), `email` (identificacao), `telefone` (identificacao), `nascimento` (identificacao) |
| [portal_push_assinaturas](../dados/dicionario/filiacao.md#portal_push_assinaturas) | identificacao, credencial | `cpf` (identificacao), `endpoint` (credencial), `p256dh` (credencial), `auth` (credencial), `user_agent` (identificacao) |

</details>

<sub>Titulares registrados no banco para estas tabelas: filiados; funcionários; público externo (trabalhadores não filiados).</sub>

<a id="p04"></a>
## P04. Oposição à contribuição assistencial

**Finalidade.** Receber e processar a oposição do trabalhador à contribuição assistencial e informar o empregador.

**Titulares.** Trabalhadores da base (filiados ou não).

**Categorias de dados.** identificação; **sensível: filiação/posição sindical**; trabalhista.

**Base legal (proposta).**

- Art. 11, II, a e d: cumprimento do direito de oposição (decisões do STF/TST e convenções coletivas) e exercício regular de direitos.

**Compartilhamento com terceiros.** Empregador da base (lista de opositores, para não descontar).

**Suboperadores.** Supabase, Vercel, Sentry, Brevo / Resend, Cloudflare Turnstile.

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); Brevo / Resend: Brevo: União Europeia (França); Resend: EUA; Cloudflare Turnstile: EUA (rede global). Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** Vigência do instrumento coletivo + 5 anos. Códigos RT07 em retencao.md (proposta a validar).

**Medidas de segurança.** Confirmação por código no e-mail do cadastro; mensagens que não revelam se um CPF existe; RLS por tenant.

**Observações.** Revela posição do trabalhador sobre a contribuição: tratado como sensível sindical.

<details><summary>Tabelas (3) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [oposicao_eventos](../dados/dicionario/filiacao.md#oposicao_eventos) | identificacao, sens. sindical | `evento` (sens. sindical), `detalhe` (sens. sindical), `ip` (identificacao), `user_agent` (identificacao) |
| [oposicao_opositor](../dados/dicionario/filiacao.md#oposicao_opositor) | identificacao, sens. sindical, trabalhista | `cpf` (identificacao), `nome_completo` (identificacao), `nome_social` (identificacao), `sexo` (identificacao), `email` (identificacao), `telefone` (identificacao), `empresa` (trabalhista), `lotacao` (trabalhista), `matricula` (trabalhista), `nascimento` (identificacao), `carta` (sens. sindical), `avaliacao` (sens. sindical), `desistente` (sens. sindical), `situacao` (sens. sindical), `documento_assinado_url` (sens. sindical), `reprovacao_motivo` (sens. sindical), `ip` (identificacao), `user_agent` (identificacao), `assinatura_validacao` (identificacao) |
| [oposicao_resposta](../dados/dicionario/filiacao.md#oposicao_resposta) | sens. sindical | `resposta` (sens. sindical) |

</details>

<sub>Titulares registrados no banco para estas tabelas: trabalhadores opositores (filiados ou não).</sub>

<a id="p05"></a>
## P05. Assembleias e votações

**Finalidade.** Organizar assembleias, verificar aptidão dos eleitores, colher votos (online, link pessoal, urna, mesário, em separado), apurar e emitir comprovantes e atas.

**Titulares.** Eleitores (filiados e trabalhadores da base), mesários, apuradores.

**Categorias de dados.** identificação; **sensível: filiação/posição sindical**; trabalhista; credencial (segredo de acesso, nunca exportar).

**Base legal (proposta).**

- Art. 11, II, a: obrigação legal e estatutária (CLT art. 612 e estatuto da entidade).
- Art. 11, II, d: exercício regular de direitos (prova da regularidade da votação).

**Compartilhamento com terceiros.** Resultado agregado é público (ata). Nenhum dado individual compartilhado.

**Suboperadores.** Supabase, Vercel, Sentry, Brevo / Resend, Telegram, Cloudflare Turnstile.

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); Brevo / Resend: Brevo: União Europeia (França); Resend: EUA; Telegram: Exterior; Cloudflare Turnstile: EUA (rede global). Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** Voto anônimo e atas: permanente (memória institucional). Participação (quem votou): 5 anos após a assembleia. Dados de contato dos aptos: apagados automaticamente 90 dias (ajustável por rodada) após a apuração de todas as assembleias da rodada (cron /api/votacao/tick, migração 20261018181729); contatos do voto em separado: no encerramento da apuração. Códigos RT08–RT11 em retencao.md (proposta a validar).

**Medidas de segurança.** **Sigilo do voto garantido no banco**: `voto_online` não guarda eleitor (CHECK `voto_online_sem_eleitor`), hora truncada; participação separada (`voto_assembleias_aptos`, `voto_participacao_legado`); reserva da participação antes do voto (uma por eleitor); comprovante sem o voto.

<details><summary>Tabelas (13) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [votacao_email_verificado](../dados/dicionario/votacao.md#votacao_email_verificado) | identificacao, credencial | `cpf` (identificacao), `email` (identificacao), `pend_email` (identificacao), `pend_codigo_hash` (credencial), `pend_codigo_token` (credencial) |
| [votacao_telegram_confirmacoes](../dados/dicionario/votacao.md#votacao_telegram_confirmacoes) | identificacao, credencial | `token` (credencial), `chat_id` (identificacao), `telefone` (identificacao), `nome_telegram` (identificacao) |
| [voto_apuradores](../dados/dicionario/votacao.md#voto_apuradores) | identificacao | `nome_completo` (identificacao), `cpf` (identificacao), `email` (identificacao) |
| [voto_assembleias](../dados/dicionario/votacao.md#voto_assembleias) | identificacao | `ata` (identificacao) |
| [voto_assembleias_aptos](../dados/dicionario/votacao.md#voto_assembleias_aptos) | identificacao, sens. sindical, trabalhista, credencial | `cpf` (identificacao), `email_corporativo` (identificacao), `hora_voto` (sens. sindical), `matricula` (trabalhista), `nome_completo` (identificacao), `nome_completo_norm` (identificacao), `presenca_em` (sens. sindical), `presenca_mesario_id` (sens. sindical), `presenca_urna_id` (sens. sindical), `nome_informado` (identificacao), `nascimento_informado` (identificacao), `cpf_conflito` (identificacao), `conflito_motivo` (identificacao), `aviso_email_para` (identificacao), `comprovante_codigo` (sens. sindical), `comprovante_hash` (sens. sindical), `comprovante_canal` (sens. sindical), `telefone` (identificacao), `telegram_chat_id` (identificacao), `email_contato` (identificacao), `cadastro_canal` (sens. sindical), `acesso_canal` (sens. sindical) |
| [voto_em_separado](../dados/dicionario/votacao.md#voto_em_separado) | identificacao, sens. sindical | `nome_completo` (identificacao), `cpf` (identificacao), `data_nascimento` (identificacao), `telefone` (identificacao), `email` (identificacao), `status` (sens. sindical), `votou_em` (sens. sindical), `observacao` (sens. sindical) |
| [voto_mesarios](../dados/dicionario/votacao.md#voto_mesarios) | identificacao | `nome_completo` (identificacao), `cpf` (identificacao), `email` (identificacao) |
| [voto_online](../dados/dicionario/votacao.md#voto_online) | sens. sindical | `ip_codigo` (identificacao), `ip_localidade` (identificacao), `resposta_id` (sens. sindical), `em_separado_id` (sens. sindical) |
| [voto_participacao_legado](../dados/dicionario/votacao.md#voto_participacao_legado) | identificacao, sens. sindical | `eleitor_id` (sens. sindical) |
| [voto_rod_assembleias](../dados/dicionario/votacao.md#voto_rod_assembleias) | identificacao | `funcionarios_raw` (identificacao) |
| [voto_urna_eventos](../dados/dicionario/votacao.md#voto_urna_eventos) | identificacao, sens. sindical | `primeiro_eleitor_nome` (sens. sindical), `descricao` (identificacao) |
| [voto_urna_terminais](../dados/dicionario/votacao.md#voto_urna_terminais) | sens. sindical, credencial | `sessao_token` (credencial), `apto_liberado_id` (sens. sindical), `em_separado_liberado_id` (sens. sindical) |
| [voto_votacao_respostas](../dados/dicionario/votacao.md#voto_votacao_respostas) | identificacao, sens. sindical | `eleitor_id` (sens. sindical), `resposta` (sens. sindical), `ip_codigo` (identificacao), `ip_localidade` (identificacao), `votou` (sens. sindical), `resposta_opcao` (sens. sindical) |

</details>

<sub>Titulares registrados no banco para estas tabelas: apuradores (filiados ou diretores); eleitores; eleitores (ids legados); mesários; mesários (filiados ou diretores).</sub>

<a id="p06"></a>
## P06. Representação, reuniões e agenda

**Finalidade.** Registrar reuniões com empregadores, atos e mobilizações, participantes, atas e a agenda dos representantes.

**Titulares.** Dirigentes, representantes, trabalhadores participantes, interlocutores dos empregadores.

**Categorias de dados.** identificação; **sensível: filiação/posição sindical**; trabalhista.

**Base legal (proposta).**

- Art. 11, II, a e d: representação sindical e exercício regular de direitos.

**Compartilhamento com terceiros.** Atas podem ser compartilhadas com o empregador da reunião.

**Suboperadores.** Supabase, Vercel, Sentry, OpenAI.

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); OpenAI: EUA. Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** Atas: permanente. Listas de participantes: 5 anos. Códigos RT12 em retencao.md (proposta a validar).

**Medidas de segurança.** RLS por tenant.

<details><summary>Tabelas (7) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [agenda](../dados/dicionario/representacao.md#agenda) | identificacao, sens. sindical | `atividade` (identificacao), `informacoes_gerais` (identificacao), `filiacao_id` (sens. sindical) |
| [agenda_representantes](../dados/dicionario/representacao.md#agenda_representantes) | identificacao | _pela existência do registro_ |
| [ato_eventos](../dados/dicionario/representacao.md#ato_eventos) | identificacao | `fotos` (identificacao) |
| [ato_eventos_participantes](../dados/dicionario/representacao.md#ato_eventos_participantes) | sens. sindical | `usuario_id` (sens. sindical) |
| [representacao_reuniao_participantes](../dados/dicionario/representacao.md#representacao_reuniao_participantes) | identificacao, sens. sindical, trabalhista | `lado` (sens. sindical), `nome` (identificacao), `cargo` (trabalhista) |
| [representacao_reunioes](../dados/dicionario/representacao.md#representacao_reunioes) | identificacao | `resumo` (identificacao), `encaminhamentos` (identificacao), `ata_caminho` (identificacao) |
| [reuniao_ata](../dados/dicionario/representacao.md#reuniao_ata) | identificacao, sens. sindical | `deliberacoes` (identificacao), `presentes` (sens. sindical), `observacoes` (identificacao), `documento_url` (identificacao) |

</details>

<sub>Titulares registrados no banco para estas tabelas: diretores; filiados; participantes; público externo (pessoas em fotos de atos); representantes citados; representantes de empresa; trabalhadores; usuários do sistema.</sub>

<a id="p07"></a>
## P07. Diretoria, mandatos e ofícios

**Finalidade.** Manter a composição da diretoria e instâncias, fichas dos diretores, liberações para o mandato e ofícios (inclusive de filiação e desfiliação enviados aos empregadores).

**Titulares.** Diretores e dirigentes; filiados citados em ofícios.

**Categorias de dados.** identificação; **sensível: filiação/posição sindical**; **sensível: saúde**; financeiro; trabalhista.

**Base legal (proposta).**

- Art. 7º, II e art. 11, II, a: obrigações estatutárias e legais (registro sindical, liberação de dirigente).
- Art. 7º, V: relação com o dirigente.

**Compartilhamento com terceiros.** Empregadores (ofícios de liberação, filiação e desfiliação).

**Suboperadores.** Supabase, Vercel, Sentry, Brevo / Resend, Telegram, OpenAI, gov.br / ITI (ICP-Brasil).

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); Brevo / Resend: Brevo: União Europeia (França); Resend: EUA; Telegram: Exterior; OpenAI: EUA. Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** Composição e atos da diretoria: permanente. Ficha do diretor (dados bancários, saúde): fim do mandato + 5 anos. Códigos RT13, RT14 em retencao.md (proposta a validar).

**Medidas de segurança.** RLS por tenant; assinatura eletrônica de ofícios com trilha de eventos.

**Observações.** A `diretoria_ficha` guarda tipo sanguíneo e restrições físicas (dado de saúde).

<details><summary>Tabelas (8) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [dir_liberacao_historico](../dados/dicionario/diretoria.md#dir_liberacao_historico) | sens. sindical, trabalhista | `periodo_inicio` (trabalhista), `periodo_termino` (trabalhista), `filiado_id` (sens. sindical) |
| [diretoria_ficha](../dados/dicionario/diretoria.md#diretoria_ficha) | identificacao, sens. saude, financeiro, trabalhista | `data_nascimento` (identificacao), `email_particular` (identificacao), `telefone_particular` (identificacao), `tamanho_camisa` (identificacao), `tipo_sanguineo` (sens. saude), `cep` (identificacao), `logradouro` (identificacao), `numero` (identificacao), `complemento` (identificacao), `bairro` (identificacao), `cidade` (identificacao), `estado` (identificacao), `tipo_vinculo` (trabalhista), `empregador_id` (trabalhista), `matricula_empregador` (identificacao), `base_operacional` (trabalhista), `banco` (financeiro), `agencia` (financeiro), `conta_corrente` (financeiro), `pix` (financeiro), `tipo_chave_pix` (financeiro), `tem_restricao` (sens. saude), `restricao_descricao` (sens. saude), `contato_emergencia` (identificacao), `telefone_emergencia` (identificacao) |
| [diretoria_instancia_assentos](../dados/dicionario/diretoria.md#diretoria_instancia_assentos) | identificacao, sens. sindical | `cargo` (sens. sindical), `documento_url` (identificacao) |
| [diretoria_integrantes](../dados/dicionario/diretoria.md#diretoria_integrantes) | identificacao, sens. sindical | `nome` (identificacao), `cargo` (sens. sindical), `filiacao_id` (sens. sindical), `cpf` (identificacao), `email` (identificacao), `situacao` (sens. sindical), `situacao_motivo` (sens. sindical) |
| [diretoria_liberacoes](../dados/dicionario/diretoria.md#diretoria_liberacoes) | identificacao, sens. sindical, trabalhista | `empresa_id` (trabalhista), `tipo` (trabalhista), `inicio` (trabalhista), `fim` (trabalhista), `documento_url` (sens. sindical), `observacao` (trabalhista), `filiacao_id` (sens. sindical), `nome` (identificacao), `cpf` (identificacao) |
| [diretoria_mandatos](../dados/dicionario/diretoria.md#diretoria_mandatos) | identificacao | `arquivo_ata_posse` (identificacao) |
| [oficios](../dados/dicionario/diretoria.md#oficios) | identificacao, sens. sindical | `destinatario_texto` (identificacao), `corpo` (sens. sindical), `assinante_nome` (identificacao), `assinante_cargo` (sens. sindical), `aos_cuidados` (identificacao), `arquivo_assinado` (sens. sindical), `arquivos_resposta` (identificacao) |
| [oficios_filiados](../dados/dicionario/diretoria.md#oficios_filiados) | identificacao, sens. sindical | `filiacao_id` (sens. sindical), `vinculo_id` (sens. sindical), `nome` (identificacao), `matricula` (identificacao) |

</details>

<sub>Titulares registrados no banco para estas tabelas: diretores; diretores (signatários); filiados; filiados citados.</sub>

<a id="p08"></a>
## P08. Saúde do trabalhador (CAT, atendimentos, CIPA)

**Finalidade.** Registrar e acompanhar acidentes de trabalho (CAT, inclusive a emitida pela entidade), atendimentos de saúde do trabalhador, exposição a agentes nocivos e representação na CIPA.

**Titulares.** Filiados e trabalhadores acidentados ou atendidos; profissionais de saúde; representantes da CIPA.

**Categorias de dados.** identificação; **sensível: filiação/posição sindical**; **sensível: saúde**; trabalhista.

**Base legal (proposta).**

- Art. 11, II, a: obrigação legal (Lei 8.213/91, art. 22 §2º: a entidade sindical pode emitir a CAT; NR-07).
- Art. 11, II, f: tutela da saúde, nos atendimentos feitos por profissional de saúde.
- Art. 16, I: conservação do acervo após o fim do tratamento.

**Compartilhamento com terceiros.** INSS e empregador (CAT, quando a entidade a emite).

**Suboperadores.** Supabase, Vercel, Sentry, OpenAI.

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); OpenAI: EUA. Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** 20 anos após o fim da exposição ou do vínculo (NR-07), controlado por `retencao_ate` e pela view `lgpd_retencoes_vencidas`. Parte já implementada. Códigos RT15, RT16 em retencao.md (proposta a validar).

**Medidas de segurança.** Relatório clínico cifrado (`saude_atendimentos_relatorio`); acesso registrado (`saude_atendimentos_acessos`); acervo retido separado do cadastro com identificadores cifrados; leitura de CAT por IA sem armazenamento (store: false).

**Observações.** Pendências: `saude_atendimentos.observacao_aberta` fica em claro; `saude_cat` (13,7 mil) guarda CPF, CID e diagnóstico sem cifragem; `saude_cat_import` (vazia) deve ser removida.

<details><summary>Tabelas (11) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [saude_acompanhamento](../dados/dicionario/saude.md#saude_acompanhamento) | sens. saude | `tipo_id` (sens. saude) |
| [saude_agenda_atendimentos](../dados/dicionario/saude.md#saude_agenda_atendimentos) | sens. saude | `assistido_id` (sens. saude) |
| [saude_assistidos](../dados/dicionario/saude.md#saude_assistidos) | identificacao, sens. saude, trabalhista | `nome` (identificacao), `observacoes` (sens. saude), `empresa_id` (trabalhista), `nome_retido_cifrado` (identificacao), `cpf_retido_cifrado` (identificacao), `retencao_regime` (sens. saude), `retencao_observacao` (sens. saude), `exposicao_cancerigeno_quimico` (sens. saude), `exposicao_radiacao_ionizante` (sens. saude) |
| [saude_atendimentos](../dados/dicionario/saude.md#saude_atendimentos) | sens. saude | `data_atendimento` (sens. saude), `observacao_aberta` (sens. saude), `tipo_id` (sens. saude) |
| [saude_atendimentos_acessos](../dados/dicionario/saude.md#saude_atendimentos_acessos) | sens. saude | _pela existência do registro_ |
| [saude_atendimentos_relatorio](../dados/dicionario/saude.md#saude_atendimentos_relatorio) | sens. saude | `relatorio_cifrado` (sens. saude) |
| [saude_cat](../dados/dicionario/saude.md#saude_cat) | identificacao, sens. saude, trabalhista | `empregador_inscricao` (trabalhista), `trabalhador_nome` (identificacao), `trabalhador_cpf` (identificacao), `trabalhador_nascimento` (identificacao), `trabalhador_sexo` (identificacao), `trabalhador_estado_civil` (identificacao), `trabalhador_cbo_codigo` (trabalhista), `trabalhador_cbo` (trabalhista), `filiacao_previdencia` (trabalhista), `areas` (trabalhista), `data_acidente` (sens. saude), `horas_trabalhadas_antes` (trabalhista), `tipo_acidente` (sens. saude), `houve_afastamento` (sens. saude), `ultimo_dia_trabalhado` (trabalhista), `parte_atingida_codigo` (sens. saude), `parte_atingida` (sens. saude), `agente_causador_codigo` (sens. saude), `agente_causador` (sens. saude), `lateralidade` (sens. saude), `situacao_geradora` (sens. saude), `houve_registro_policial` (sens. saude), `houve_morte` (sens. saude), `data_obito` (sens. saude), `observacoes_acidente` (sens. saude), `data_atendimento` (sens. saude), `hora_atendimento` (sens. saude), `houve_internacao` (sens. saude), `duracao_tratamento_dias` (sens. saude), `afastamento_durante_tratamento` (sens. saude), `natureza_lesao_codigo` (sens. saude), `natureza_lesao` (sens. saude), `diagnostico_provavel` (sens. saude), `cid10` (sens. saude), `cid10_descricao` (sens. saude), `local_e_data` (sens. saude), `medico_nome_crm_uf` (identificacao), `observacoes_atestado` (sens. saude), `arquivo_url` (sens. saude) |
| [saude_cat_import](../dados/dicionario/saude.md#saude_cat_import) | identificacao, sens. saude, trabalhista | `11 - ACIDENTADO Nome` (identificacao), `12 - ACIDENTADO CPF` (identificacao), `13 - ACIDENTADO Data de Nascimento` (identificacao), `14 - ACIDENTADO Sexo` (identificacao), `15 - ACIDENTADO Estado Civil` (identificacao), `16 - ACIDENTADO CBO` (trabalhista), `17 - ACIDENTADO Filiação à PS` (trabalhista), `18 - ACIDENTADO Áreas` (trabalhista), `19 - ACIDENTE Data do acidente` (sens. saude), `21 - ACIDENTE Após quantas horas de trabalho?` (trabalhista), `22 - ACIDENTE Tipo` (sens. saude), `23 - ACIDENTE Houve afastamento?` (sens. saude), `24 - ACIDENTE Último dia trabalhado` (trabalhista), `31 - ACIDENTE Parte do corpo atingida` (sens. saude), `32 - ACIDENTE Agente causador` (sens. saude), `33 - ACIDENTE Lateralidade` (sens. saude), `34 - ACIDENTE Situação geradora` (sens. saude), `35 - ACIDENTE Houve registro policial?` (sens. saude), `36 - ACIDENTE Houve morte?` (sens. saude), `37 - ACIDENTE Data do óbito` (sens. saude), `38 - ACIDENTE Observações` (sens. saude), `40 - ATENDIMENTO Data` (sens. saude), `41 - ATENDIMENTO Hora` (sens. saude), `42 - ATENDIMENTO Houve internação?` (sens. saude), `43 - ATENDIMENTO Provável Duração do tratamento (dias)` (sens. saude), `44 - ATENDIMENTO Afastar-se durante tratamento` (sens. saude), `45 - LESÃO Descrição e natureza da lesão` (sens. saude), `46 - DIAGNÓSTICO Diagnóstico provável` (sens. saude), `47 - DIAGNÓSTICO CID` (sens. saude), `48 - DIAGNÓSTICO Local e Data` (sens. saude), `49 - DIAGNÓSTICO Nome do médico, CRM e UF` (identificacao), `50 - DIAGNÓSTICO Observações` (sens. saude) |
| [saude_cipa_agenda](../dados/dicionario/saude.md#saude_cipa_agenda) | identificacao | `representantes_sind_raw` (identificacao) |
| [saude_cipa_representantes](../dados/dicionario/saude.md#saude_cipa_representantes) | identificacao, sens. sindical | `filiado_id` (sens. sindical), `nome` (identificacao) |
| [saude_profissionais](../dados/dicionario/saude.md#saude_profissionais) | identificacao, trabalhista | `profissao` (trabalhista), `conselho_classe` (trabalhista), `registro_conselho` (identificacao) |

</details>

<sub>Titulares registrados no banco para estas tabelas: assistidos; diretores; filiados; funcionários; trabalhadores acidentados; trabalhadores atendidos; usuários do sistema.</sub>

<a id="p09"></a>
## P09. Jurídico

**Finalidade.** Acompanhar processos judiciais e homologações de rescisão em favor dos representados e reembolsar custas.

**Titulares.** Filiados e trabalhadores da base (inclusive não filiados nas homologações).

**Categorias de dados.** identificação; **sensível: filiação/posição sindical**; financeiro; trabalhista.

**Base legal (proposta).**

- Art. 7º, VI e art. 11, II, d: exercício regular de direitos em processo judicial ou administrativo.

**Compartilhamento com terceiros.** Escritórios e advogados contratados; Poder Judiciário.

**Suboperadores.** Supabase, Vercel, Sentry.

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha). Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** Fim do processo + 5 anos. Códigos RT17 em retencao.md (proposta a validar).

**Medidas de segurança.** RLS por tenant.

<details><summary>Tabelas (4) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [juridico_homologacoes](../dados/dicionario/juridico.md#juridico_homologacoes) | identificacao, sens. sindical, trabalhista | `data_demissao` (trabalhista), `motivo` (trabalhista), `parecer_url` (trabalhista), `trabalhador_nao_filiado` (identificacao), `filiado_id` (sens. sindical), `trabalhador_nome` (identificacao), `trabalhador_cpf` (identificacao), `observacoes` (trabalhista) |
| [juridico_processos](../dados/dicionario/juridico.md#juridico_processos) | identificacao, sens. sindical | `numero_processo` (identificacao), `parte_assessorada` (identificacao), `partes_assessoradas` (identificacao), `outras_partes` (identificacao), `filiados_raw` (sens. sindical), `observacoes` (identificacao) |
| [juridico_processos_filiados](../dados/dicionario/juridico.md#juridico_processos_filiados) | sens. sindical | _pela existência do registro_ |
| [juridico_reembolsos](../dados/dicionario/juridico.md#juridico_reembolsos) | financeiro | `valor` (financeiro), `descricao_despesa` (financeiro), `comprovante_despesa` (financeiro) |

</details>

<sub>Titulares registrados no banco para estas tabelas: filiados; trabalhadores não filiados; usuários do sistema.</sub>

<a id="p10"></a>
## P10. Pessoal: RH dos funcionários da entidade

**Finalidade.** Gestão dos funcionários da própria entidade: cadastro, ponto, férias, folha e contracheques, diárias, benefícios, SST (ASO, atestados, treinamentos) e envio do movimento à contabilidade.

**Titulares.** Funcionários da entidade, dependentes (inclusive menores), prestadores autônomos.

**Categorias de dados.** identificação; **sensível: saúde**; financeiro; trabalhista.

**Base legal (proposta).**

- Art. 7º, II e V: obrigações trabalhistas, previdenciárias e fiscais; contrato de trabalho.
- Art. 11, II, a: obrigação legal para dados de saúde (NR-07: ASO; atestados).

**Compartilhamento com terceiros.** Escritório de contabilidade (movimento da folha), eSocial/órgãos públicos, plano de saúde.

**Suboperadores.** Supabase, Vercel, Sentry, Brevo / Resend, OpenAI, Bubble (sistema legado).

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); Brevo / Resend: Brevo: União Europeia (França); Resend: EUA; OpenAI: EUA; Bubble (sistema legado): EUA. Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** Documentos trabalhistas: prazo legal de cada um (FGTS e ponto: 5 anos; ASO e exposição: 20 anos, NR-07; informes de rendimentos: 5 anos). Códigos RT18–RT21 em retencao.md (proposta a validar).

**Medidas de segurança.** RLS por tenant; acesso por permissão do módulo Pessoal; contracheque liberado individualmente ao funcionário.

**Observações.** Pendências: a resenha do ponto envia à IA até 30 funcionários por nome; `pessoal_folha_competencias.snapshot` guarda cópia de dados pessoais; documentos ainda no CDN do Bubble.

<details><summary>Tabelas (32) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [aso](../dados/dicionario/pessoal.md#aso) | sens. saude, trabalhista | `data` (sens. saude), `tipo` (sens. saude), `arquivo` (sens. saude), `vencimento` (sens. saude), `realizado` (sens. saude) |
| [empresa_departamentos_integrantes](../dados/dicionario/plataforma.md#empresa_departamentos_integrantes) | trabalhista | `usuario_id` (trabalhista) |
| [pes_atestados_medicos](../dados/dicionario/pessoal.md#pes_atestados_medicos) | identificacao, sens. saude, trabalhista | `cid10` (sens. saude), `atestado` (sens. saude), `consideracao` (sens. saude), `inicio` (sens. saude), `termino` (sens. saude), `quantidade_dias` (sens. saude), `nome_acompanhado` (sens. saude), `filho_menor_6_anos` (sens. saude), `atestado_acompanhamento` (sens. saude), `pericias_retorno` (sens. saude), `aso_retorno_raw` (sens. saude) |
| [pessoal_anuenio](../dados/dicionario/pessoal.md#pessoal_anuenio) | financeiro, trabalhista | `nivel_atual_data` (trabalhista), `proximo_nivel_data` (trabalhista), `nivel_atual_id` (financeiro) |
| [pessoal_atividades](../dados/dicionario/pessoal.md#pessoal_atividades) | trabalhista | `funcionarios_raw` (trabalhista), `executores_raw` (trabalhista) |
| [pessoal_atividades_executores](../dados/dicionario/pessoal.md#pessoal_atividades_executores) | trabalhista | `horas_execucao_semanal` (trabalhista), `tempo_min_mes` (trabalhista) |
| [pessoal_atividades_perigos](../dados/dicionario/pessoal.md#pessoal_atividades_perigos) | trabalhista | `funcionarios_raw` (trabalhista) |
| [pessoal_ausencias](../dados/dicionario/pessoal.md#pessoal_ausencias) | sens. saude, trabalhista | `inicio` (trabalhista), `termino` (trabalhista), `motivo` (sens. saude), `periodo_raw` (trabalhista), `atestado_id` (sens. saude), `observacao` (sens. saude) |
| [pessoal_contracheques](../dados/dicionario/pessoal.md#pessoal_contracheques) | financeiro, trabalhista | `arquivo` (financeiro), `valor_liquido` (financeiro) |
| [pessoal_dependentes](../dados/dicionario/pessoal.md#pessoal_dependentes) | identificacao | `cpf` (identificacao), `nascimento` (identificacao), `nome_completo` (identificacao), `grau_parentesco` (identificacao) |
| [pessoal_diarias_descontos](../dados/dicionario/pessoal.md#pessoal_diarias_descontos) | financeiro | `infracao_id` (financeiro), `valor` (financeiro) |
| [pessoal_diarias_despesas](../dados/dicionario/pessoal.md#pessoal_diarias_despesas) | financeiro | `custo` (financeiro), `comprovante` (financeiro) |
| [pessoal_diarias_lancamentos](../dados/dicionario/pessoal.md#pessoal_diarias_lancamentos) | financeiro, trabalhista | `atividade` (trabalhista), `local` (trabalhista), `valor_diaria` (financeiro), `valor_despesas` (financeiro), `valor_total` (financeiro) |
| [pessoal_diarias_remessas](../dados/dicionario/pessoal.md#pessoal_diarias_remessas) | financeiro | `valor_total` (financeiro), `avaliacao_observacao` (financeiro), `forma_pagamento` (financeiro), `devolucao_observacao` (financeiro), `historico` (financeiro) |
| [pessoal_diarias_solicitacao_despesas](../dados/dicionario/pessoal.md#pessoal_diarias_solicitacao_despesas) | financeiro | `descricao` (financeiro), `valor` (financeiro), `comprovante` (financeiro) |
| [pessoal_diarias_solicitacoes](../dados/dicionario/pessoal.md#pessoal_diarias_solicitacoes) | financeiro, trabalhista | `motivo` (trabalhista), `valor_unitario` (financeiro), `valor_total` (financeiro), `avaliacao_observacao` (financeiro), `valor_despesas` (financeiro), `valor_descontos` (financeiro) |
| [pessoal_faltas_justificadas](../dados/dicionario/pessoal.md#pessoal_faltas_justificadas) | sens. saude, trabalhista | `data_falta` (trabalhista), `justificativa_tipo` (trabalhista), `comprovacao` (sens. saude), `motivo_recusa` (trabalhista), `observacao` (trabalhista) |
| [pessoal_ferias](../dados/dicionario/pessoal.md#pessoal_ferias) | trabalhista | `concessivo_inicio` (trabalhista), `concessivo_termino` (trabalhista), `aquisitivo_inicio` (trabalhista), `aquisitivo_termino` (trabalhista), `dias_disponiveis` (trabalhista), `abono_pecuniario` (trabalhista) |
| [pessoal_ferias_gozo](../dados/dicionario/pessoal.md#pessoal_ferias_gozo) | trabalhista | `dias` (trabalhista), `inicio` (trabalhista), `termino` (trabalhista), `aviso_ferias_url` (trabalhista), `autorizador_observacoes` (trabalhista), `abono_solicitado` (trabalhista) |
| [pessoal_folha_competencias](../dados/dicionario/pessoal.md#pessoal_folha_competencias) | identificacao, financeiro, trabalhista | `observacao` (trabalhista), `snapshot` (financeiro) |
| [pessoal_funcionario_funcao](../dados/dicionario/pessoal.md#pessoal_funcionario_funcao) | trabalhista | _pela existência do registro_ |
| [pessoal_funcionario_jornada](../dados/dicionario/pessoal.md#pessoal_funcionario_jornada) | trabalhista | `dia_semana` (trabalhista), `hora_inicio` (trabalhista), `hora_fim` (trabalhista) |
| [pessoal_ghe_membros](../dados/dicionario/pessoal.md#pessoal_ghe_membros) | trabalhista | _pela existência do registro_ |
| [pessoal_informes_rendimentos](../dados/dicionario/pessoal.md#pessoal_informes_rendimentos) | financeiro | `arquivo_url` (financeiro) |
| [pessoal_nivel_salarial](../dados/dicionario/pessoal.md#pessoal_nivel_salarial) | financeiro, trabalhista | `proximo_nivel_texto` (trabalhista), `tipo_avanco` (trabalhista), `proximo_nivel_data` (trabalhista), `nivel_atual_data` (trabalhista), `nivel_atual_id` (financeiro) |
| [pessoal_plano_saude](../dados/dicionario/pessoal.md#pessoal_plano_saude) | identificacao, sens. saude, trabalhista | `aposentado` (trabalhista), `nome_beneficiario` (identificacao), `situacao_dependente` (sens. saude) |
| [pessoal_ponto_resenhas](../dados/dicionario/pessoal.md#pessoal_ponto_resenhas) | identificacao, trabalhista | `conteudo` (trabalhista), `indicadores` (trabalhista) |
| [pessoal_reembolsos_act](../dados/dicionario/pessoal.md#pessoal_reembolsos_act) | sens. saude, financeiro | `valor_solicitado` (financeiro), `valor_aprovado` (financeiro), `descricao` (sens. saude), `comprovante_url` (sens. saude), `avaliacao_observacao` (financeiro) |
| [pessoal_registro_ponto](../dados/dicionario/pessoal.md#pessoal_registro_ponto) | financeiro, trabalhista | `horas_realizadas_70` (trabalhista), `horas_pagas_70` (financeiro), `saldo_remanescente_70` (trabalhista), `saldo_remessa_anterior_70` (trabalhista), `horas_realizadas_100` (trabalhista), `horas_pagas_100` (financeiro), `saldo_remanescente_100` (trabalhista), `saldo_remessa_anterior_100` (trabalhista), `arquivo` (trabalhista), `marcacoes` (trabalhista) |
| [pessoal_treinamentos_alunos](../dados/dicionario/pessoal.md#pessoal_treinamentos_alunos) | trabalhista | `data_inicio` (trabalhista), `data_termino` (trabalhista), `certificado_url` (trabalhista) |
| [prestadores_servico](../dados/dicionario/pessoal.md#prestadores_servico) | identificacao | `cpf` (identificacao), `nome_completo` (identificacao), `nome_fantasia` (identificacao) |
| [prestcont_remessa](../dados/dicionario/pessoal.md#prestcont_remessa) | financeiro | `planilha` (financeiro), `valor_total` (financeiro) |

</details>

<sub>Titulares registrados no banco para estas tabelas: dependentes; dependentes (menores!); dependentes (menores!) de funcionários; diretores; familiares acompanhados (inclusive filhos menores de 6 anos); fornecedores pf; funcionários.</sub>

<a id="p11"></a>
## P11. Financeiro, compras, fornecedores e contratos

**Finalidade.** Pagar e receber: ordens de pagamento, caixa, conciliação bancária e remessas CNAB, compras, fornecedores (inclusive pessoa física), contratos, RPA de autônomos e assinatura eletrônica de documentos.

**Titulares.** Fornecedores e prestadores pessoa física, beneficiários de pagamentos, funcionários e diretores (reembolsos), signatários externos.

**Categorias de dados.** identificação; financeiro; trabalhista; credencial (segredo de acesso, nunca exportar).

**Base legal (proposta).**

- Art. 7º, II: obrigações contábeis, fiscais e tributárias (RPA: INSS e IRRF).
- Art. 7º, V: contratos com o fornecedor/prestador.

**Compartilhamento com terceiros.** Bancos (remessas e retornos CNAB), contabilidade, Receita Federal.

**Suboperadores.** Supabase, Vercel, Sentry, Brevo / Resend, Telegram, OpenAI, gov.br / ITI (ICP-Brasil).

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); Brevo / Resend: Brevo: União Europeia (França); Resend: EUA; Telegram: Exterior; OpenAI: EUA. Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** 10 anos para documentos contábeis (CC art. 1.194, prática de mercado) ou 5 anos após o exercício para fins tributários; o maior prevalece. Códigos RT22, RT23 em retencao.md (proposta a validar).

**Medidas de segurança.** RLS por tenant; alçadas e MFA para quem paga (com `MFA_OBRIGATORIO`); trilha `auditoria` em ordens e fornecedores; regras de auditoria das ordens.

**Observações.** Pendência: `financeiro_remessas.conteudo` guarda o arquivo CNAB inteiro (nome, CPF e conta de cada favorecido).

<details><summary>Tabelas (28) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [banco_extratos](../dados/dicionario/financeiro.md#banco_extratos) | identificacao | `importado_por` (identificacao) |
| [banco_lancamentos](../dados/dicionario/financeiro.md#banco_lancamentos) | identificacao, financeiro | `descricao` (financeiro), `observacao` (identificacao), `conciliado_por` (identificacao) |
| [caixa_contas](../dados/dicionario/financeiro.md#caixa_contas) | identificacao | `responsavel_usuario_id` (identificacao) |
| [caixa_movimentacoes](../dados/dicionario/financeiro.md#caixa_movimentacoes) | identificacao, financeiro | `descricao` (identificacao), `reconhecimento_motivo` (identificacao) |
| [caixa_ocorrencias](../dados/dicionario/financeiro.md#caixa_ocorrencias) | identificacao | `descricao` (identificacao), `resolucao` (identificacao) |
| [caixa_prestacoes](../dados/dicionario/financeiro.md#caixa_prestacoes) | identificacao | `observacao` (identificacao), `observacao_financeiro` (identificacao) |
| [compras_departamentos_acesso](../dados/dicionario/compras.md#compras_departamentos_acesso) | identificacao | `usuario_id` (identificacao) |
| [compras_fornecimentos](../dados/dicionario/compras.md#compras_fornecimentos) | identificacao | `comprador_id` (identificacao), `recebimento_recebido_por_id` (identificacao), `recebimento_observacao` (identificacao), `oc_enviada_para` (identificacao) |
| [compras_pedido](../dados/dicionario/compras.md#compras_pedido) | identificacao | `autorizador` (identificacao) |
| [compras_propostas](../dados/dicionario/compras.md#compras_propostas) | identificacao | `proposta_arquivo_url` (identificacao), `escolhida_por_id` (identificacao) |
| [compras_rpa](../dados/dicionario/compras.md#compras_rpa) | identificacao, financeiro | `fornecedor_id` (identificacao), `valor_informado` (financeiro), `valor_bruto` (financeiro), `inss` (financeiro), `irrf` (financeiro), `iss` (financeiro), `dependentes` (identificacao), `valor_liquido` (financeiro), `arquivo_assinado` (identificacao), `assinatura_validacao` (identificacao) |
| [compras_solicitacoes](../dados/dicionario/compras.md#compras_solicitacoes) | identificacao | `solicitacao_observacao` (identificacao), `recebedor_id` (identificacao), `cotacao_responsavel_id` (identificacao), `avaliacao_avaliador_id` (identificacao), `avaliacao_observacao` (identificacao), `comprado_por_id` (identificacao), `recebimento_observacao` (identificacao), `solicitante_id` (identificacao) |
| [contratos](../dados/dicionario/compras.md#contratos) | identificacao, financeiro | `responsavel_id` (identificacao), `arquivo_contrato` (identificacao), `valor` (financeiro) |
| [contratos_minutas](../dados/dicionario/compras.md#contratos_minutas) | identificacao, financeiro | `parametros` (identificacao), `texto` (identificacao), `arquivo_assinado` (identificacao), `assinatura_validacao` (identificacao) |
| [contratos_minutas_versoes](../dados/dicionario/compras.md#contratos_minutas_versoes) | identificacao | `texto` (identificacao) |
| [danfes_recibos](../dados/dicionario/financeiro.md#danfes_recibos) | identificacao | `arquivo` (identificacao) |
| [despesas](../dados/dicionario/financeiro.md#despesas) | identificacao, financeiro | `valor` (financeiro), `favorecido` (identificacao), `comprovante_pagamento_url` (financeiro) |
| [documento_assinatura_eventos](../dados/dicionario/compras.md#documento_assinatura_eventos) | identificacao | `detalhe` (identificacao), `ip` (identificacao), `user_agent` (identificacao) |
| [documento_assinaturas](../dados/dicionario/compras.md#documento_assinaturas) | identificacao, trabalhista, credencial | `nome` (identificacao), `cargo` (trabalhista), `email` (identificacao), `token` (credencial), `certificado` (identificacao), `codigo_hash` (credencial), `motivo_recusa` (identificacao), `ip` (identificacao), `user_agent` (identificacao), `telegram_chat_id` (identificacao), `telegram_telefone` (identificacao), `cpf` (identificacao), `nome_declarado` (identificacao) |
| [empresa](../dados/dicionario/plataforma.md#empresa) | identificacao | `cnpj_cpf` (identificacao), `nome_fantasia` (identificacao), `nome_razao` (identificacao), `foto` (identificacao), `email_contato` (identificacao) |
| [empresa_contatos](../dados/dicionario/plataforma.md#empresa_contatos) | identificacao, trabalhista | `nome` (identificacao), `cargo` (trabalhista), `telefone` (identificacao), `email` (identificacao), `observacao` (identificacao) |
| [financeiro_caixa](../dados/dicionario/financeiro.md#financeiro_caixa) | identificacao, financeiro | `dono_conta_id` (identificacao), `transf_aportador_id` (identificacao), `transf_recebedor_id` (identificacao) |
| [financeiro_despesas](../dados/dicionario/financeiro.md#financeiro_despesas) | identificacao, financeiro | `favorecido` (identificacao), `comprovante_despesa` (financeiro), `comprovante_pagamento` (financeiro) |
| [financeiro_remessa_itens](../dados/dicionario/financeiro.md#financeiro_remessa_itens) | identificacao, financeiro | `favorecido_nome` (identificacao), `favorecido_documento` (identificacao), `banco_codigo` (financeiro), `agencia` (financeiro), `conta` (financeiro), `pix_chave` (financeiro), `valor` (financeiro) |
| [financeiro_remessas](../dados/dicionario/financeiro.md#financeiro_remessas) | identificacao, financeiro | `conteudo` (financeiro), `retorno_conteudo` (financeiro) |
| [ordens_pagamento](../dados/dicionario/financeiro.md#ordens_pagamento) | identificacao, financeiro, trabalhista | `descricao` (financeiro), `valor` (financeiro), `arquivo_nota_fiscal` (financeiro), `arquivo_orcamento` (financeiro), `arquivo_pagamento` (financeiro), `arquivo_boleto` (financeiro), `autorizacao_observacao` (identificacao), `pix_codigo` (financeiro), `reembolso_pagamento` (financeiro), `tipo` (trabalhista), `valor_pago` (financeiro), `beneficiario_usuario_id` (identificacao), `pagador_id` (identificacao), `beneficiario_nome_avulso` (identificacao), `beneficiario_doc_avulso` (identificacao), `dados_bancarios_id` (financeiro), `forma_detalhe` (financeiro), `cancelamento_motivo` (identificacao), `boleto_linha_digitavel` (financeiro) |
| [ordens_pagamento_estornos](../dados/dicionario/financeiro.md#ordens_pagamento_estornos) | identificacao, financeiro | `motivo` (identificacao), `arquivo_comunicado` (financeiro), `pagamento` (financeiro), `resolucao` (identificacao), `correcao` (financeiro) |
| [ordens_pagamento_eventos](../dados/dicionario/financeiro.md#ordens_pagamento_eventos) | identificacao, financeiro | `usuario_id` (identificacao), `descricao` (identificacao), `dados` (financeiro) |

</details>

<sub>Titulares registrados no banco para estas tabelas: autônomos contratados; beneficiários das ordens; contatos de fornecedores; convidados (beneficiários); diretores; diretores (favorecidos); empregadores (público externo); favorecidos pessoa física; filiados; filiados (favorecidos); fornecedores pf; fornecedores pf (autônomos); funcionários; funcionários (contrapartes de pix; público externo (assinantes); público externo (cessionários; signatários); transferências); usuários do sistema.</sub>

<a id="p12"></a>
## P12. Institucional: custeios, viagens, linhas e patrimônio

**Finalidade.** Custear diretores e convidados, organizar viagens, controlar linhas de celular e a responsabilidade por bens do patrimônio.

**Titulares.** Diretores, convidados, viajantes, responsáveis por bens e linhas.

**Categorias de dados.** identificação; **sensível: filiação/posição sindical**; **sensível: saúde**; financeiro; trabalhista.

**Base legal (proposta).**

- Art. 7º, II e V: prestação de contas e obrigações contábeis; relação com o beneficiário.
- Art. 11, II, a: necessidades especiais do viajante (acessibilidade).

**Compartilhamento com terceiros.** Agências, companhias aéreas e hotéis (reservas).

**Suboperadores.** Supabase, Vercel, Sentry, Brevo / Resend, OpenAI.

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); Brevo / Resend: Brevo: União Europeia (França); Resend: EUA; OpenAI: EUA. Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** Como P11 (documentos contábeis). Códigos RT24 em retencao.md (proposta a validar).

**Medidas de segurança.** RLS por tenant.

**Observações.** CPF e dados bancários do beneficiário são repetidos em cada custeio.

<details><summary>Tabelas (8) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [institucional_custeio_convidados](../dados/dicionario/institucional.md#institucional_custeio_convidados) | identificacao, financeiro | `nome` (identificacao), `cpf` (identificacao), `email` (identificacao), `telefone` (identificacao), `banco` (financeiro), `agencia` (financeiro), `conta` (financeiro), `tipo_conta` (financeiro), `pix` (financeiro), `tipo_chave_pix` (financeiro), `observacoes` (identificacao) |
| [institucional_custeios](../dados/dicionario/institucional.md#institucional_custeios) | identificacao, sens. sindical, financeiro | `filiacao_id` (sens. sindical), `beneficiario_nome` (identificacao), `beneficiario_cpf` (identificacao), `banco` (financeiro), `agencia` (financeiro), `conta` (financeiro), `tipo_conta` (financeiro), `pix` (financeiro), `tipo_chave_pix` (financeiro), `descricao` (identificacao), `valor_parcela` (financeiro), `pix_codigo` (financeiro), `arquivo_boleto` (financeiro), `conta_favorecido` (financeiro) |
| [linhas_institucionais](../dados/dicionario/institucional.md#linhas_institucionais) | identificacao | `numero` (identificacao), `observacao` (identificacao) |
| [patrimonio_item_responsavel](../dados/dicionario/institucional.md#patrimonio_item_responsavel) | identificacao | `arquivo_cautela` (identificacao) |
| [patrimonio_recinto_responsavel](../dados/dicionario/institucional.md#patrimonio_recinto_responsavel) | trabalhista | `funcionario_id` (trabalhista) |
| [viagens_config](../dados/dicionario/institucional.md#viagens_config) | identificacao | `emails_aviso` (identificacao) |
| [viagens_itens](../dados/dicionario/institucional.md#viagens_itens) | identificacao, sens. saude | `origem` (identificacao), `destino` (identificacao), `data_viagem` (identificacao), `necessidades_especiais` (sens. saude), `observacoes` (identificacao), `localizador` (identificacao), `voucher` (identificacao) |
| [viagens_solicitacoes](../dados/dicionario/institucional.md#viagens_solicitacoes) | identificacao | `convidado_nome` (identificacao), `convidado_cpf` (identificacao), `convidado_nascimento` (identificacao), `convidado_email` (identificacao), `convidado_telefone` (identificacao), `motivo` (identificacao) |

</details>

<sub>Titulares registrados no banco para estas tabelas: convidados; convidados); diretores; filiados; fornecedores pf; funcionários; viajantes (diretores.</sub>

<a id="p13"></a>
## P13. Hospedagem conveniada e cessão de espaços

**Finalidade.** Conceder benefício de hospedagem em hotéis conveniados (cupons, alocação, faturamento, avaliações) e ceder espaços da entidade a filiados e ao público.

**Titulares.** Filiados e beneficiários, hóspedes, solicitantes externos, usuários dos hotéis.

**Categorias de dados.** identificação; **sensível: filiação/posição sindical**; financeiro; credencial (segredo de acesso, nunca exportar).

**Base legal (proposta).**

- Art. 7º, V: execução do benefício ou da cessão solicitada.
- Art. 11, II, d: o registro revela a filiação, que é mantida pelo vínculo associativo.

**Compartilhamento com terceiros.** Hotéis conveniados (nome e período do hóspede).

**Suboperadores.** Supabase, Vercel, Sentry, Brevo / Resend, OpenAI, Bubble (sistema legado).

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); Brevo / Resend: Brevo: União Europeia (França); Resend: EUA; OpenAI: EUA; Bubble (sistema legado): EUA. Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** Reservas: 5 anos após a estada (faturamento). Lista de espera: até o atendimento. Códigos RT25 em retencao.md (proposta a validar).

**Medidas de segurança.** RLS por tenant; acesso do hotel restrito às suas reservas; links por token.

<details><summary>Tabelas (12) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [cessao_solicitacao_eventos](../dados/dicionario/cessao.md#cessao_solicitacao_eventos) | identificacao | `detalhe` (identificacao) |
| [cessao_solicitacoes](../dados/dicionario/cessao.md#cessao_solicitacoes) | identificacao, sens. sindical, financeiro, credencial | `solicitante_nome` (identificacao), `solicitante_cpf` (identificacao), `solicitante_email` (identificacao), `solicitante_telefone` (identificacao), `representante_nome` (identificacao), `representante_telefone` (identificacao), `identificacao` (identificacao), `filiacao_id` (sens. sindical), `observacoes` (identificacao), `token` (credencial), `codigo_hash` (credencial), `custeio_comprovante` (financeiro), `termo_texto` (identificacao), `termo_pdf` (identificacao), `visita_participante` (identificacao) |
| [fil_reemb_hospedagem](../dados/dicionario/hospedagem.md#fil_reemb_hospedagem) | sens. sindical | _pela existência do registro_ |
| [hospedagem_alocacoes](../dados/dicionario/hospedagem.md#hospedagem_alocacoes) | identificacao | `sexo` (identificacao) |
| [hospedagem_avaliacoes](../dados/dicionario/hospedagem.md#hospedagem_avaliacoes) | identificacao, sens. sindical, credencial | `filiado_id` (sens. sindical), `token` (credencial), `comentario` (identificacao) |
| [hospedagem_beneficiarios](../dados/dicionario/hospedagem.md#hospedagem_beneficiarios) | identificacao | `cpf` (identificacao), `nome` (identificacao), `observacao` (identificacao) |
| [hospedagem_cupom](../dados/dicionario/hospedagem.md#hospedagem_cupom) | identificacao, sens. sindical, financeiro, credencial | `check_in` (identificacao), `sexo` (identificacao), `tarifa_hospede` (financeiro), `filiado_id` (sens. sindical), `check_out` (identificacao), `token` (credencial), `nao_comparecimento_abono_motivo` (identificacao), `emergencial_motivo` (identificacao) |
| [hospedagem_espera](../dados/dicionario/hospedagem.md#hospedagem_espera) | identificacao, sens. sindical, credencial | `filiado_id` (sens. sindical), `cpf` (identificacao), `sexo` (identificacao), `token` (credencial) |
| [hospedagem_hotel_contas](../dados/dicionario/hospedagem.md#hospedagem_hotel_contas) | identificacao, financeiro | `titular` (identificacao), `documento` (identificacao), `banco` (financeiro), `agencia` (financeiro), `conta` (financeiro), `chave_pix` (financeiro) |
| [hospedagem_hotel_usuarios](../dados/dicionario/hospedagem.md#hospedagem_hotel_usuarios) | identificacao | `email` (identificacao), `nome` (identificacao) |
| [hospedagem_penalidade_liberacoes](../dados/dicionario/hospedagem.md#hospedagem_penalidade_liberacoes) | identificacao | `cpf` (identificacao), `motivo` (identificacao) |
| [hospedagem_servico](../dados/dicionario/hospedagem.md#hospedagem_servico) | identificacao | `sexo` (identificacao), `relatorio` (identificacao) |

</details>

<sub>Titulares registrados no banco para estas tabelas: filiados; hóspedes (filiados); hóspedes/beneficiários; público externo); representantes; solicitantes de cessão (filiados; titulares de conta do hotel (podem ser pessoa física); usuários do sistema (funcionários do hotel).</sub>

<a id="p14"></a>
## P14. Frota: veículos e condutores

**Finalidade.** Reservar e usar veículos da entidade, controlar condutores habilitados, abastecimentos, quilometragem, manutenções e infrações (indicação de condutor).

**Titulares.** Condutores (funcionários, diretores, terceiros autorizados).

**Categorias de dados.** identificação; financeiro.

**Base legal (proposta).**

- Art. 7º, II: obrigação legal (CTB: indicação do condutor infrator).
- Art. 7º, V: uso do veículo pelo condutor.

**Compartilhamento com terceiros.** Órgãos de trânsito (indicação de condutor); locadoras.

**Suboperadores.** Supabase, Vercel, Sentry, Telegram, OpenAI.

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); Telegram: Exterior; OpenAI: EUA. Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** Infrações: 5 anos. CNH: enquanto o condutor estiver habilitado no sistema. Códigos RT26, RT27 em retencao.md (proposta a validar).

**Medidas de segurança.** RLS por tenant.

**Observações.** Pendência: cópias da CNH em jsonb de unificação de condutores.

<details><summary>Tabelas (12) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [cnh](../dados/dicionario/veiculos.md#cnh) | identificacao | `numero` (identificacao), `categoria` (identificacao), `registro` (identificacao), `vencimento` (identificacao), `arquivo` (identificacao) |
| [ferramentas_anomalias](../dados/dicionario/ferramentas.md#ferramentas_anomalias) | identificacao | `descricao_detalhada` (identificacao), `envolvidos_raw` (identificacao), `fato` (identificacao) |
| [veiculos](../dados/dicionario/veiculos.md#veiculos) | identificacao | `condutor` (identificacao) |
| [veiculos_abastecimentos](../dados/dicionario/veiculos.md#veiculos_abastecimentos) | identificacao | `condutor_informado` (identificacao) |
| [veiculos_agendamentos](../dados/dicionario/veiculos.md#veiculos_agendamentos) | identificacao | `motivo` (identificacao), `destino` (identificacao) |
| [veiculos_condutores](../dados/dicionario/veiculos.md#veiculos_condutores) | identificacao | `cnh_numero` (identificacao), `cnh_categoria` (identificacao), `cnh_validade` (identificacao), `cnh_arquivo_url` (identificacao), `observacao` (identificacao) |
| [veiculos_condutores_cnh](../dados/dicionario/veiculos.md#veiculos_condutores_cnh) | identificacao | `cnh_numero` (identificacao), `cnh_categoria` (identificacao), `cnh_validade` (identificacao), `cnh_arquivo_url` (identificacao) |
| [veiculos_condutores_unificacoes](../dados/dicionario/veiculos.md#veiculos_condutores_unificacoes) | identificacao | `cadastro_removido` (identificacao), `cadastro_principal_antes` (identificacao) |
| [veiculos_disponibilidade](../dados/dicionario/veiculos.md#veiculos_disponibilidade) | identificacao | `motivo` (identificacao), `destino` (identificacao), `observacao_retorno` (identificacao) |
| [veiculos_infracoes](../dados/dicionario/veiculos.md#veiculos_infracoes) | identificacao, financeiro | `infracao_local` (identificacao), `reembolso_obs_financeiro` (financeiro), `justificativa_descricao` (identificacao), `reembolso_infrator` (financeiro), `identificacao_real_infrator` (identificacao), `formaliz_real_infrator` (identificacao), `cobranca_forma` (financeiro), `cobranca_situacao` (financeiro), `cobranca_valor` (financeiro), `baixa_observacao` (financeiro), `baixa_comprovante_url` (financeiro) |
| [veiculos_infracoes_config](../dados/dicionario/veiculos.md#veiculos_infracoes_config) | identificacao | `emails_copia` (identificacao) |
| [veiculos_infracoes_historico](../dados/dicionario/veiculos.md#veiculos_infracoes_historico) | identificacao | `detalhe` (identificacao) |

</details>

<sub>Titulares registrados no banco para estas tabelas: condutores; diretores; envolvidos; funcionários.</sub>

<a id="p15"></a>
## P15. Comunicação, eventos e avisos

**Finalidade.** Enviar comunicados e mensagens (inclusive de aniversário), notificações internas e push, e gerenciar inscrições, presença e termos de imagem em eventos.

**Titulares.** Filiados, convidados de eventos, funcionários.

**Categorias de dados.** identificação; **sensível: filiação/posição sindical**; financeiro; trabalhista; credencial (segredo de acesso, nunca exportar).

**Base legal (proposta).**

- Art. 7º, IX: legítimo interesse para comunicados da entidade, com opt-out.
- Art. 7º, I: consentimento para uso de imagem em eventos (termo com foto) e avisos opcionais.

**Compartilhamento com terceiros.** Nenhum.

**Suboperadores.** Supabase, Vercel, Sentry, Brevo / Resend, Serviços de push dos navegadores (Google, Apple, Mozilla), OpenAI.

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); Brevo / Resend: Brevo: União Europeia (França); Resend: EUA; Serviços de push dos navegadores (Google, Apple, Mozilla): EUA; OpenAI: EUA. Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** Envios: 2 anos. Inscrições de evento: 1 ano após o evento, com anonimização e expurgo da foto (já implementados). Códigos RT28–RT30 em retencao.md (proposta a validar).

**Medidas de segurança.** RLS por tenant; anonimização e expurgo de foto dos inscritos já implementados.

**Observações.** `comunicacao_envios` copia nome, CPF, e-mail e telefone a cada envio.

<details><summary>Tabelas (9) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [comunicacao_aniversario_config](../dados/dicionario/comunicacao.md#comunicacao_aniversario_config) | identificacao | `aviso_equipe_emails` (identificacao) |
| [comunicacao_envios](../dados/dicionario/comunicacao.md#comunicacao_envios) | identificacao, sens. sindical | `cpf` (identificacao), `nome` (identificacao), `email` (identificacao), `telefone` (identificacao), `assunto` (identificacao), `corpo` (identificacao), `texto_whatsapp` (identificacao) |
| [comunicacao_textos](../dados/dicionario/comunicacao.md#comunicacao_textos) | identificacao | `fatos` (identificacao), `texto_gerado` (identificacao), `texto_final` (identificacao) |
| [eventos_inscricao_respostas](../dados/dicionario/comunicacao.md#eventos_inscricao_respostas) | identificacao | `valor` (identificacao) |
| [eventos_inscricoes](../dados/dicionario/comunicacao.md#eventos_inscricoes) | identificacao, sens. sindical, credencial | `nome` (identificacao), `cpf` (identificacao), `email` (identificacao), `telefone` (identificacao), `filiacao_id` (sens. sindical), `foto_url` (identificacao), `consentimento_ip` (identificacao), `rsvp_token` (credencial), `acesso_observacao` (identificacao), `token` (credencial), `codigo_hash` (credencial), `convidado_por` (identificacao) |
| [eventos_presencas](../dados/dicionario/comunicacao.md#eventos_presencas) | identificacao | _pela existência do registro_ |
| [eventos_titular_sessao](../dados/dicionario/comunicacao.md#eventos_titular_sessao) | identificacao, credencial | `email` (identificacao), `codigo_hash` (credencial), `token` (credencial) |
| [notificacoes](../dados/dicionario/comunicacao.md#notificacoes) | financeiro, trabalhista | `notificacao` (trabalhista), `registro_ponto_id` (trabalhista), `contracheque_id` (financeiro), `contracheque_id_fk` (financeiro) |
| [push_assinaturas](../dados/dicionario/comunicacao.md#push_assinaturas) | identificacao, credencial | `endpoint` (credencial), `p256dh` (credencial), `auth` (credencial), `user_agent` (identificacao) |

</details>

<sub>Titulares registrados no banco para estas tabelas: convidados; filiados; funcionários; público externo; usuários do sistema.</sub>

<a id="p16"></a>
## P16. Contas de acesso, segurança, auditoria e gestão interna

**Finalidade.** Autenticar usuários, controlar perfis e permissões, registrar a trilha de auditoria e as tentativas de acesso, registrar as saídas de dados (livro de exportações `lgpd_exportacoes` e log da API `api_requisicoes`), atender pedidos de titulares, integrar sistemas (API/webhooks) e organizar demandas internas.

**Titulares.** Usuários do sistema (funcionários, diretores, filiados no portal), administradores da plataforma.

**Categorias de dados.** identificação; **sensível: filiação/posição sindical**; financeiro; trabalhista; credencial (segredo de acesso, nunca exportar).

**Base legal (proposta).**

- Art. 7º, IX e art. 46: legítimo interesse e dever de segurança.
- Art. 7º, II: guarda de registros de acesso (Marco Civil, art. 15).

**Compartilhamento com terceiros.** Destinos de webhook cadastrados pela entidade (hoje só um de teste).

**Suboperadores.** Supabase, Vercel, Sentry, Brevo / Resend, Telegram, Cloudflare Turnstile.

**Transferência internacional.** Vercel: Funções em São Paulo (gru1); empresa e rede de borda nos EUA; Sentry: União Europeia (Alemanha); Brevo / Resend: Brevo: União Europeia (França); Resend: EUA; Telegram: Exterior; Cloudflare Turnstile: EUA (rede global). Mecanismo do art. 33: cláusulas contratuais (Resolução CD/ANPD 19/2024), a verificar na B2.

**Retenção.** Registros de acesso e log da API: 6 meses (Marco Civil). Auditoria e livro de exportações: 5 anos. Contas: enquanto ativas. Códigos RT31–RT35 em retencao.md (proposta a validar).

**Medidas de segurança.** Turnstile e cadência de códigos; MFA; identidade separada do metadata (`auth_identidades`); auditoria sem colunas cifradas; API com escopo por endpoint (CPF só com `filiados_cpf`) e chave só no cabeçalho; livro de exportações e log da API gravados só pelo service_role (a entidade só lê).

**Observações.** Pendência: a `auditoria` copia em claro códigos e tokens com nomes fora da lista de ocultos.

<details><summary>Tabelas (20) e colunas com dado pessoal</summary>

| Tabela | Categorias | Colunas com dado pessoal |
|---|---|---|
| [api_chaves](../dados/dicionario/plataforma.md#api_chaves) | credencial | `prefixo` (credencial), `hash` (credencial) |
| [api_requisicoes](../dados/dicionario/plataforma.md#api_requisicoes) | identificacao | `parametros` (identificacao), `origem_ip` (identificacao) |
| [assinaturas](../dados/dicionario/ferramentas.md#assinaturas) | identificacao | _pela existência do registro_ |
| [auditoria](../dados/dicionario/plataforma.md#auditoria) | identificacao, sens. sindical, financeiro, trabalhista, credencial | `antes` (sens. sindical), `depois` (sens. sindical), `usuario_id` (identificacao) |
| [auth_codigos_envios](../dados/dicionario/plataforma.md#auth_codigos_envios) | identificacao | `email` (identificacao) |
| [auth_identidades](../dados/dicionario/plataforma.md#auth_identidades) | identificacao | `cpf` (identificacao), `nome` (identificacao) |
| [auth_vinculos_pendentes](../dados/dicionario/plataforma.md#auth_vinculos_pendentes) | identificacao | `email` (identificacao), `cpf` (identificacao), `nome` (identificacao) |
| [demandas](../dados/dicionario/ferramentas.md#demandas) | identificacao | `descricao` (identificacao), `membros_raw` (identificacao) |
| [demandas_check_tarefas](../dados/dicionario/ferramentas.md#demandas_check_tarefas) | identificacao | `demandado_documentos` (identificacao), `demandante_documentos` (identificacao) |
| [demandas_comentarios](../dados/dicionario/ferramentas.md#demandas_comentarios) | identificacao | `descricao` (identificacao) |
| [emails_institucionais](../dados/dicionario/filiacao.md#emails_institucionais) | identificacao | `endereco` (identificacao) |
| [lgpd_exportacoes](../dados/dicionario/plataforma.md#lgpd_exportacoes) | identificacao | `usuario_id` (identificacao), `filtros` (identificacao) |
| [lgpd_solicitacoes](../dados/dicionario/plataforma.md#lgpd_solicitacoes) | identificacao, sens. sindical | `filiacao_id` (sens. sindical), `observacao` (identificacao), `email_titular` (identificacao), `cpf_titular` (identificacao) |
| [login_tentativas](../dados/dicionario/plataforma.md#login_tentativas) | identificacao | `chave` (identificacao) |
| [plataforma_admins](../dados/dicionario/plataforma.md#plataforma_admins) | identificacao | `nome` (identificacao), `email` (identificacao) |
| [usuarios](../dados/dicionario/plataforma.md#usuarios) | identificacao, sens. sindical, trabalhista, credencial | `nome_completo` (identificacao), `nome_guerra` (identificacao), `cpf` (identificacao), `cpf_arquivo` (identificacao), `foto` (identificacao), `data_nascimento` (identificacao), `nascimento_dia` (identificacao), `nascimento_mes` (identificacao), `sexo` (identificacao), `estado_civil` (identificacao), `escolaridade` (identificacao), `whatsapp` (identificacao), `email_empresa` (identificacao), `empresa_matricula` (trabalhista), `vinculo_instituicao` (trabalhista), `filiado` (sens. sindical), `email` (identificacao), `vinculo_instituicao_os` (trabalhista), `nascimento_data` (identificacao), `telegram_chat_id` (identificacao), `telegram_vinculo_codigo` (credencial), `telegram_telefone` (identificacao), `telegram_tel_pendente` (identificacao), `telegram_tel_codigo` (credencial) |
| [usuarios_ocupacoes](../dados/dicionario/plataforma.md#usuarios_ocupacoes) | trabalhista | `pessoa_id` (trabalhista), `motivo` (trabalhista), `observacao` (trabalhista) |
| [usuarios_unificacoes](../dados/dicionario/plataforma.md#usuarios_unificacoes) | identificacao, sens. sindical | `principal_antes` (sens. sindical), `secundario_antes` (sens. sindical), `contatos_removidos` (identificacao) |
| [webhooks](../dados/dicionario/plataforma.md#webhooks) | credencial | `segredo` (credencial) |
| [webhooks_entregas](../dados/dicionario/plataforma.md#webhooks_entregas) | identificacao, sens. sindical, financeiro | `payload` (sens. sindical) |

</details>

<sub>Titulares registrados no banco para estas tabelas: beneficiários de ordens; condutores; diretores; eleitores; filiados; fornecedores pf; funcionários; pessoas que usam a chave de api da entidade; público externo; sistemas; trabalhadores não filiados; usuários do sistema; usuários do sistema (operadores da plataforma).</sub>

## Fluxos transversais

### Recursos de IA

O conteúdo vai à OpenAI (EUA) com `store: false`, só no momento do uso. Isso vale para: leitura de PDF/imagem (CAT, relações de desconto, notas, acordos, abastecimentos), redação (ofícios, atas, minutas, comunicados) e resenhas (ponto, relatórios da diretoria). A base legal é a do processo de origem. É transferência internacional (art. 33): exige cláusulas contratuais (DPA) com a OpenAI, a verificar na B2. A RIPD de saúde (B3) avalia se a CAT deve ser pseudonimizada antes do envio.

### Sistema legado (Bubble)

Até o desligamento, o Bubble ainda grava hospedagem, portal e anuênio, e guarda o histórico anterior à migração, inclusive votos com o eleitor. É preciso definir a data de desligamento e a eliminação dos dados lá. Os documentos do Pessoal continuam no CDN do Bubble.

## Suboperadores

| Suboperador | Papel | Localização | Processos |
|---|---|---|---|
| Supabase | Banco de dados, autenticação e arquivos | Dados no Brasil (AWS São Paulo, sa-east-1); empresa nos EUA | P01, P02, P03, P04, P05, P06, P07, P08, P09, P10, P11, P12, P13, P14, P15, P16 |
| Vercel | Hospedagem da aplicação e execução das funções | Funções em São Paulo (gru1); empresa e rede de borda nos EUA | P01, P02, P03, P04, P05, P06, P07, P08, P09, P10, P11, P12, P13, P14, P15, P16 |
| Sentry | Registro de erros (CPF mascarado, sem corpo de requisição) | União Europeia (Alemanha) | P01, P02, P03, P04, P05, P06, P07, P08, P09, P10, P11, P12, P13, P14, P15, P16 |
| OpenAI | Recursos de IA: leitura de PDF/imagem e redação (store: false) | EUA | P01, P02, P06, P07, P08, P10, P11, P12, P13, P14, P15 |
| Brevo / Resend | Envio de e-mails transacionais | Brevo: União Europeia (França); Resend: EUA | P01, P02, P03, P04, P05, P07, P10, P11, P12, P13, P15, P16 |
| Telegram | Bot de avisos, aprovações e votação | Exterior | P05, P07, P11, P14, P16 |
| Cloudflare Turnstile | Verificação anti-robô nos formulários de acesso | EUA (rede global) | P04, P05, P16 |
| Serviços de push dos navegadores (Google, Apple, Mozilla) | Entrega de notificações push | EUA | P03, P15 |
| Bubble (sistema legado) | Sistema anterior; ainda grava hospedagem/portal/anuênio até o desligamento | EUA | P01, P10, P13 |
| gov.br / ITI (ICP-Brasil) | Assinatura e validação de documentos | Brasil | P01, P07, P11 |

---

Cobertura: 192 de 192 tabelas com dado pessoal atribuídas a 16 processos.
