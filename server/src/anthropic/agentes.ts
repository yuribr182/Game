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
- Ao terminar tudo: chame \`${FERRAMENTA_PROGRESSO}\` com etapasConcluidas = etapasTotais e encerre com um resumo do que foi entregue e como conferir cada critério de aceite.`;

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
  } else {
    linhas.push('## Onde entregar\nEscreva os arquivos finais em /mnt/session/outputs/.');
  }
  if (s.anexos?.length) {
    linhas.push(`## Anexos\nHá ${s.anexos.length} anexo(s) montado(s) em /workspace/anexos/.`);
  }
  linhas.push(
    `\nComece agora: quebre este projeto em etapas e chame \`${FERRAMENTA_PROGRESSO}\` com o plano antes de qualquer outra coisa.`,
  );
  return linhas.join('\n\n');
}
