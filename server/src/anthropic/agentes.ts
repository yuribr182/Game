// Agents na Anthropic: 1 Agent por funcionário (criado 1x; edição via update, nunca recriar)
// e 1 Environment global. O `system` é montado da persona + blocos de skill + instruções fixas.

import type Anthropic from '@anthropic-ai/sdk';
import type { ConfigPonte, FuncionarioAgente, ProjetoReal } from '../store/tipos.js';
import type { Store } from '../store/db.js';

export const CARGO_ROTULO: Record<string, string> = {
  junior: 'Desenvolvedor(a) Júnior',
  pleno: 'Desenvolvedor(a) Pleno',
  senior: 'Desenvolvedor(a) Sênior',
  designer: 'Designer',
  qa: 'Analista de QA',
  manager: 'Gerente de Projetos',
};

/** Blocos prontos de especialidade — a chave é o que o cadastro envia em `skills[]`. */
export const BLOCOS_SKILL: Record<string, string> = {
  web: 'Desenvolvimento Web: HTML/CSS/JS e frameworks modernos; páginas responsivas, acessíveis e rápidas.',
  mobile: 'Desenvolvimento Mobile: apps e PWAs; pensa em telas pequenas, toque e offline primeiro.',
  backend: 'Backend/APIs: modelagem de dados, APIs REST, autenticação, testes e deploy.',
  design: 'Design UI/UX: hierarquia visual, identidade consistente, protótipos e handoff claro.',
  copy: 'Copywriting/Conteúdo: textos claros e persuasivos em pt-BR, adaptados ao público do cliente.',
  pesquisa: 'Pesquisa/Análise: levanta referências e dados na web, compara opções e resume com fontes.',
  planilhas: 'Planilhas/Financeiro: organiza dados, fórmulas e relatórios prontos para decisão.',
  qa: 'QA/Testes: casos de teste a partir dos critérios de aceite; caça bugs antes do cliente.',
};

/** Skills hospedadas pela Anthropic que o cadastro pode marcar diretamente. */
export const SKILLS_ANTHROPIC = new Set(['xlsx', 'docx', 'pptx', 'pdf']);

export const FERRAMENTA_PROGRESSO = 'reportar_progresso';

const INSTRUCOES_FIXAS = `## Como trabalhar (obrigatório)
- Comunique-se SEMPRE em português do Brasil.
- Ao receber a especificação de um projeto, PRIMEIRO quebre o trabalho em etapas claras (entre 4 e 12) e chame a ferramenta \`${FERRAMENTA_PROGRESSO}\` imediatamente com { etapasConcluidas: 0, etapasTotais: N, resumo: "plano em uma frase" }.
- A cada etapa concluída, chame \`${FERRAMENTA_PROGRESSO}\` de novo com o total já concluído e um resumo de UMA frase do que está fazendo agora.
- Nunca invente progresso: só reporte etapas realmente concluídas.
- Entregáveis:
  - Projeto de ENTREGA: escreva os arquivos finais em /mnt/session/outputs/ — essa pasta é o que o cliente recebe.
  - Projeto de CÓDIGO: trabalhe no repositório montado, faça commits pequenos e descritivos em pt-BR e push na branch de trabalho indicada.
- Ao terminar tudo: chame \`${FERRAMENTA_PROGRESSO}\` com etapasConcluidas = etapasTotais e encerre com um resumo do que foi entregue e como conferir cada critério de aceite.

## Memória profissional
- Se houver uma pasta de memória montada (procure em /mnt/memory/), LEIA suas notas no início de cada projeto — elas são suas lições de projetos anteriores.
- Ao concluir (ou falhar) um projeto, registre lá um arquivo curto de lições aprendidas: o que funcionou, o que evitar, padrões do dono da agência. Muitos arquivos pequenos, nomes claros.`;

export function montarSystem(f: FuncionarioAgente): string {
  const partes: string[] = [];
  partes.push(
    `Você é ${f.nome}, ${CARGO_ROTULO[f.cargoVisual] ?? f.cargoVisual} de uma agência digital real. Você executa projetos de clientes de verdade, do início à entrega.`,
  );
  if (f.persona.trim()) partes.push(`## Persona\n${f.persona.trim()}`);
  const blocos = f.skills
    .map((s) => BLOCOS_SKILL[s])
    .filter((b): b is string => Boolean(b));
  if (blocos.length) partes.push(`## Especialidades\n${blocos.map((b) => `- ${b}`).join('\n')}`);
  partes.push(INSTRUCOES_FIXAS);
  return partes.join('\n\n');
}

export function ferramentasAgente(): unknown[] {
  return [
    { type: 'agent_toolset_20260401' },
    {
      type: 'custom',
      name: FERRAMENTA_PROGRESSO,
      description:
        'Reporta o progresso do projeto ao painel da agência. Chame no início (com o plano de etapas) e a cada etapa concluída.',
      input_schema: {
        type: 'object',
        properties: {
          etapasConcluidas: { type: 'integer', description: 'Etapas já concluídas (0 no início)' },
          etapasTotais: { type: 'integer', description: 'Total de etapas planejadas' },
          resumo: { type: 'string', description: 'Uma frase: o que está fazendo agora' },
        },
        required: ['etapasConcluidas', 'etapasTotais', 'resumo'],
      },
    },
  ];
}

export function skillsAgente(f: FuncionarioAgente): { type: string; skill_id: string }[] {
  const skills: { type: string; skill_id: string }[] = [];
  for (const s of f.skills) {
    if (SKILLS_ANTHROPIC.has(s)) skills.push({ type: 'anthropic', skill_id: s });
    else if (s.startsWith('skill_')) skills.push({ type: 'custom', skill_id: s });
  }
  return skills.slice(0, 20);
}

function parametrosAgente(f: FuncionarioAgente) {
  const skills = skillsAgente(f);
  return {
    name: `${f.nome} — ${CARGO_ROTULO[f.cargoVisual] ?? f.cargoVisual}`,
    model: f.modelo,
    system: montarSystem(f),
    tools: ferramentasAgente(),
    ...(skills.length ? { skills } : {}),
  };
}

/** Cria o Agent na Anthropic (1x, no cadastro). Devolve id + versão para persistir. */
export async function criarAgenteAnthropic(
  cliente: Anthropic,
  f: FuncionarioAgente,
): Promise<{ agentId: string; agentVersion: number }> {
  const agente = await cliente.beta.agents.create(
    parametrosAgente(f) as Parameters<typeof cliente.beta.agents.create>[0],
  );
  return { agentId: agente.id, agentVersion: Number(agente.version) };
}

/** Atualiza o Agent existente (nova versão; sessões em andamento não quebram). */
export async function atualizarAgenteAnthropic(
  cliente: Anthropic,
  f: FuncionarioAgente,
): Promise<{ agentVersion: number }> {
  if (!f.agentId) throw new Error(`Funcionário ${f.nome} não tem agentId — recadastre.`);
  const agente = await cliente.beta.agents.update(
    f.agentId,
    // sem `version`: a ponte é dona do agente, atualização incondicional
    parametrosAgente(f) as Parameters<typeof cliente.beta.agents.update>[1],
  );
  return { agentVersion: Number(agente.version) };
}

/**
 * Memory store por funcionário (F4e) — criado no 1º projeto dele e montado em
 * toda sessão: o agente lê lições passadas e registra novas ao concluir.
 */
export async function garantirMemoria(
  cliente: Anthropic,
  store: Store,
  funcionario: FuncionarioAgente,
): Promise<string> {
  if (funcionario.memoryStoreId) return funcionario.memoryStoreId;
  const memoria = await cliente.beta.memoryStores.create({
    name: `Memória — ${funcionario.nome}`,
    description:
      `Memória profissional de ${funcionario.nome} (${CARGO_ROTULO[funcionario.cargoVisual] ?? funcionario.cargoVisual}): ` +
      'lições aprendidas, padrões que funcionaram e preferências do dono da agência, acumuladas entre projetos. ' +
      'Leia no início de cada projeto; registre aprendizados ao concluir.',
  } as Parameters<typeof cliente.beta.memoryStores.create>[0]);
  const todos = await store.listarFuncionarios();
  const alvo = todos.find((f) => f.id === funcionario.id);
  if (alvo) {
    alvo.memoryStoreId = memoria.id;
    await store.salvarFuncionarios(todos);
  }
  funcionario.memoryStoreId = memoria.id;
  return memoria.id;
}

// ---------- Gerente de IA multiagente (backlog 1) ----------

const SYSTEM_GERENTE_PROJETOS = `Você é o Gerente de Projetos (IA) de uma agência digital real. Você NÃO executa o trabalho braçal: você coordena os funcionários do seu roster — cada um é um agente com nome e especialidades próprias.

## Como coordenar (obrigatório)
- Comunique-se SEMPRE em português do Brasil.
- Ao receber a especificação: quebre em tarefas claras, decida QUEM faz o quê pela especialidade de cada funcionário e delegue com instruções completas (eles não veem sua conversa — inclua todo o contexto necessário na mensagem; o sistema de arquivos é compartilhado, então indique caminhos).
- Chame \`${FERRAMENTA_PROGRESSO}\` imediatamente com o plano ({ etapasConcluidas: 0, etapasTotais: N, resumo }) e a cada etapa realmente concluída pela equipe.
- Revise o que a equipe entregar antes de dar a etapa por concluída; peça ajustes quando preciso.
- Entrega final: projeto de ENTREGA em /mnt/session/outputs/; projeto de CÓDIGO no repositório montado (commits pt-BR, push na branch indicada).
- Ao terminar: \`${FERRAMENTA_PROGRESSO}\` com tudo concluído + resumo final de quem fez o quê e como conferir cada critério de aceite.`;

/** O roster mudou desde a última atualização do coordenador? (pura, testável) */
export function rosterMudou(ativosAgentIds: string[], salvo: string[] | undefined): boolean {
  const a = [...ativosAgentIds].sort();
  const b = [...(salvo ?? [])].sort();
  return a.length !== b.length || a.some((id, i) => id !== b[i]);
}

/**
 * Agent coordenador (1x; roster = funcionários ativos). Sempre que a equipe
 * muda, agents.update grava um roster novo — sessões em andamento não quebram.
 */
export async function garantirGerente(cliente: Anthropic, store: Store): Promise<string> {
  const cfg = await store.lerConfig();
  const ativos = (await store.listarFuncionarios()).filter((f) => f.status === 'ativo' && f.agentId);
  if (!ativos.length) throw new Error('O Gerente de IA precisa de pelo menos 1 funcionário ativo no roster.');
  const roster = ativos.slice(0, 20).map((f) => f.agentId!);
  const parametros = {
    name: 'Gerente de Projetos (IA) — Empresa Real',
    model: 'claude-opus-5',
    system: SYSTEM_GERENTE_PROJETOS,
    tools: ferramentasAgente(),
    multiagent: { type: 'coordinator', agents: roster },
  };
  if (!cfg.gerenteAgentId) {
    const agente = await cliente.beta.agents.create(
      parametros as Parameters<typeof cliente.beta.agents.create>[0],
    );
    cfg.gerenteAgentId = agente.id;
    cfg.gerenteRoster = roster;
    await store.salvarConfig(cfg);
  } else if (rosterMudou(roster, cfg.gerenteRoster)) {
    await cliente.beta.agents.update(
      cfg.gerenteAgentId,
      parametros as Parameters<typeof cliente.beta.agents.update>[1],
    );
    cfg.gerenteRoster = roster;
    await store.salvarConfig(cfg);
  }
  return cfg.gerenteAgentId;
}

// ---------- Agente comercial: propostas em PDF (backlog 3) ----------

const SYSTEM_COMERCIAL = `Você é o(a) Comercial de uma agência digital real. Você escreve PROPOSTAS comerciais que fecham negócio: claras, bonitas e honestas.

## Como trabalhar (obrigatório)
- Tudo em português do Brasil.
- Gere a proposta em PDF usando a skill de PDF e salve em /mnt/session/outputs/proposta.pdf (só esse arquivo importa).
- Estrutura: capa (cliente + projeto), entendimento da necessidade, escopo proposto (itens objetivos), investimento (valor + forma de pagamento sugerida), prazo estimado, próximos passos.
- Use o histórico de projetos entregues do briefing para calibrar preço e prazo realistas; se o valor estimado do briefing parecer fora, proponha um valor e JUSTIFIQUE em uma linha.
- Sem enrolação: 2 a 4 páginas.`;

/** Agent comercial (criado 1x; skills pdf+docx). */
export async function garantirComercial(cliente: Anthropic, store: Store): Promise<string> {
  const cfg = await store.lerConfig();
  if (cfg.comercialAgentId) return cfg.comercialAgentId;
  const agente = await cliente.beta.agents.create({
    name: 'Comercial (propostas) — Empresa Real',
    model: 'claude-opus-5',
    system: SYSTEM_COMERCIAL,
    tools: [{ type: 'agent_toolset_20260401' }],
    skills: [
      { type: 'anthropic', skill_id: 'pdf' },
      { type: 'anthropic', skill_id: 'docx' },
    ],
  } as Parameters<typeof cliente.beta.agents.create>[0]);
  cfg.comercialAgentId = agente.id;
  await store.salvarConfig(cfg);
  return agente.id;
}

/** Briefing que o agente comercial recebe (pura, testável). */
export function montarBriefingProposta(dados: {
  titulo: string;
  valorEstimadoBRL: number;
  observacoes?: string;
  cliente: { nome: string; contato?: string; origem?: string; observacoes?: string };
  historico: { nome: string; tipo: string; valorContratoBRL: number; custoUSD: number; prazoDias: number }[];
}): string {
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const linhas = [
    `# Briefing de proposta: ${dados.titulo}`,
    `## Cliente\nNome: ${dados.cliente.nome}${dados.cliente.contato ? `\nContato: ${dados.cliente.contato}` : ''}${dados.cliente.origem ? `\nOrigem: ${dados.cliente.origem}` : ''}${dados.cliente.observacoes ? `\nNotas: ${dados.cliente.observacoes}` : ''}`,
    `## O que ele quer\n${dados.titulo}${dados.observacoes ? `\n${dados.observacoes}` : ''}`,
    `## Valor estimado na conversa\n${dados.valorEstimadoBRL > 0 ? brl(dados.valorEstimadoBRL) : 'não conversado ainda — sugira você'}`,
  ];
  if (dados.historico.length) {
    linhas.push(
      `## Histórico real da agência (para calibrar preço/prazo)\n${dados.historico
        .slice(0, 8)
        .map((p) => `- ${p.nome} (${p.tipo}): contrato ${brl(p.valorContratoBRL)}, ${p.prazoDias} dias, custo interno US$ ${p.custoUSD.toFixed(2)}`)
        .join('\n')}`,
    );
  }
  linhas.push('\nGere agora a proposta em PDF em /mnt/session/outputs/proposta.pdf.');
  return linhas.join('\n\n');
}

/** Environment global (criado 1x e persistido na config). */
export async function garantirEnvironment(cliente: Anthropic, store: Store): Promise<string> {
  const cfg: ConfigPonte = await store.lerConfig();
  if (cfg.environmentId) return cfg.environmentId;
  const env = await cliente.beta.environments.create({
    name: `empresa-real-${Date.now()}`,
    config: { type: 'cloud', networking: { type: 'unrestricted' } },
  } as Parameters<typeof cliente.beta.environments.create>[0]);
  cfg.environmentId = env.id;
  await store.salvarConfig(cfg);
  return env.id;
}

/** Mensagem de kickoff: a spec formatada em seções, exatamente como o wizard prometeu. */
export function montarKickoff(projeto: ProjetoReal): string {
  const s = projeto.spec;
  const linhas: string[] = [
    `# Projeto: ${projeto.emoji} ${projeto.nome}`,
    `Cliente: ${projeto.cliente} · Tipo: ${projeto.tipo === 'codigo' ? 'CÓDIGO' : 'ENTREGA'} · Prazo: ${projeto.prazoDias} dias`,
    '',
    `## Objetivo\n${s.objetivo}`,
    `## Escopo / funcionalidades\n${s.escopo}`,
  ];
  if (s.foraDoEscopo) linhas.push(`## Fora do escopo\n${s.foraDoEscopo}`);
  if (s.requisitosTecnicos) linhas.push(`## Requisitos técnicos\n${s.requisitosTecnicos}`);
  if (s.designReferencias) linhas.push(`## Design / referências\n${s.designReferencias}`);
  linhas.push(`## Entregáveis\n${s.entregaveis}`);
  linhas.push(`## Critérios de aceite\n${s.criteriosAceite}`);
  if (s.observacoes) linhas.push(`## Observações\n${s.observacoes}`);
  if (projeto.tipo === 'codigo') {
    linhas.push(
      `## Repositório\nO repositório já está montado no seu workspace. Trabalhe na branch \`${projeto.branch ?? 'main'}\` e faça push dos commits nela.`,
    );
    if (projeto.abrirPR) {
      const alvo = ownerRepoDe(projeto.repoUrl);
      linhas.push(
        [
          '## Pull Request (obrigatório ao final)',
          `Com todas as etapas concluídas e o push feito, abra um Pull Request REAL da branch de trabalho para a branch padrão do repositório usando a API REST do GitHub via curl${alvo ? ` (POST https://api.github.com/repos/${alvo}/pulls)` : ''}. A autenticação já é injetada automaticamente pelo proxy do repositório — NÃO peça token nem tente configurar credenciais.`,
          `Se a branch de trabalho for a própria branch padrão, crie antes uma branch nova (ex.: \`entrega/${slugDe(projeto.nome)}\`), faça push nela e abra o PR a partir dela.`,
          'Título e descrição do PR em pt-BR (o que foi feito + como testar). Ao encerrar, escreva o LINK COMPLETO do PR (https://github.com/…/pull/N) na sua mensagem final.',
        ].join('\n'),
      );
    }
  } else {
    linhas.push('## Onde entregar\nEscreva os arquivos finais em /mnt/session/outputs/.');
  }
  if (s.anexos?.length) {
    linhas.push(`## Anexos\nHá ${s.anexos.length} anexo(s) montado(s) em /workspace/anexos/.`);
  }
  if (projeto.funcionarioId === 'equipe') {
    linhas.push(
      '## Trabalho em equipe\nVocê é o GERENTE: distribua as tarefas entre os funcionários do seu roster pela especialidade de cada um, acompanhe e revise o que entregarem. Não faça tudo sozinho.',
    );
  }
  linhas.push(
    `\nComece agora: quebre este projeto em etapas e chame \`${FERRAMENTA_PROGRESSO}\` com o plano antes de qualquer outra coisa.`,
  );
  return linhas.join('\n\n');
}

/**
 * Rubrica do QA automático (F4a): os critérios de aceite do wizard viram itens
 * graduáveis pelo revisor independente (grader de outcomes, contexto separado).
 */
export function montarRubric(projeto: ProjetoReal): string {
  const criterios = projeto.spec.criteriosAceite
    .split('\n')
    .map((l) => l.trim().replace(/^[-*•]\s*/, ''))
    .filter(Boolean);
  return [
    `# Rubrica de aceite — ${projeto.nome}`,
    'O trabalho SÓ está pronto quando TODOS os critérios abaixo forem verificáveis no resultado entregue' +
      (projeto.tipo === 'codigo'
        ? ' (commits com push feito na branch de trabalho do repositório).'
        : ' (arquivos escritos em /mnt/session/outputs/).'),
    '',
    '## Critérios de aceite do cliente',
    ...criterios.map((c) => `- ${c}`),
    '',
    '## Critérios gerais (sempre valem)',
    `- Todos os entregáveis combinados existem de fato: ${umaLinha(projeto.spec.entregaveis)}`,
    '- Todo texto voltado ao cliente está em português do Brasil.',
    '- Nada do que foi pedido ficou pela metade ou apenas descrito sem ser produzido.',
  ].join('\n');
}

/** Extrai "owner/repo" de uma URL do GitHub (instruções de PR). */
export function ownerRepoDe(repoUrl: string | undefined): string | null {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/.exec(repoUrl ?? '');
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Acha o primeiro link de Pull Request do GitHub num texto (F4d — captura para o card). */
export function extrairLinkPR(texto: string): string | null {
  const m = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/.exec(texto);
  return m ? m[0] : null;
}

function slugDe(nome: string): string {
  return (
    nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'projeto'
  );
}

function umaLinha(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, 300);
}
