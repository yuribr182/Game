/* Modo Empresa Real — painéis reais (F3):
   - Projetos: cards com etapas/custo de API ao vivo + wizard de cadastro em 4 passos
   - Equipe: cards de funcionário-agente + contratar/editar/arquivar
   - Financeiro: substitui a aba Empresa (visão, vendas, contas, custos, relatórios, livro)
   - Atividade: log ao vivo da sessão + chat com o funcionário (user.message)
   Só ativa quando window.Game.modoReal (importado por último em src/main.ts). */

import * as api from './api';
import type {
  ClienteCRMReal,
  EntradaAtividadeReal,
  EstagioFluxoReal,
  ExecucaoFluxoReal,
  FluxoReal,
  FuncionarioReal,
  OportunidadeCRMReal,
  ProjetoRealFront,
  RotinaReal,
  SnapshotReal,
  TimeReal,
} from './tipos';
import { ehResponsavelTime, idDoTime, PREFIXO_TIME } from './tipos';

const G = window.Game;

// ---------- utilitários ----------

const $ = (sel: string): HTMLElement => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`elemento não encontrado: ${sel}`);
  return el as HTMLElement;
};

function esc(texto: unknown): string {
  return String(texto ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function brl(n: number): string {
  return `R$ ${G.fmt(n)}`;
}

function brlCentavos(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toast(msg: string, tipo = ''): void {
  const UI = (window as unknown as { UI?: { toast: (m: string, t?: string) => void } }).UI;
  UI?.toast(msg, tipo);
}

function cambio(): number {
  return G.real?.snapshot()?.config.cambioUsdBrl ?? 5.4;
}

function snap(): SnapshotReal | null {
  return G.real?.snapshot() ?? null;
}

function timesAtivos(): TimeReal[] {
  return (snap()?.times ?? []).filter((t) => t.status === 'ativo');
}

const CARGOS: Record<string, string> = {
  junior: '🧑‍💻 Júnior',
  pleno: '👨‍💻 Pleno',
  senior: '🧙 Sênior',
  designer: '🎨 Designer',
  qa: '🔍 QA',
  manager: '📋 Manager',
};

const SKILLS_BLOCO: Record<string, string> = {
  web: 'Desenvolvimento Web',
  mobile: 'Mobile / PWA',
  backend: 'Backend / APIs',
  design: 'Design UI/UX',
  copy: 'Copy / Conteúdo',
  pesquisa: 'Pesquisa / Análise',
  planilhas: 'Planilhas / Financeiro',
  qa: 'QA / Testes',
};

const SKILLS_ANTHROPIC: Record<string, string> = {
  xlsx: 'Excel (.xlsx)',
  docx: 'Word (.docx)',
  pptx: 'PowerPoint (.pptx)',
  pdf: 'PDF',
};

const MODELOS = [
  { id: 'claude-opus-5', rotulo: 'Claude Opus 5 — o melhor (US$ 5/25 por MTok)' },
  { id: 'claude-sonnet-5', rotulo: 'Claude Sonnet 5 — equilíbrio (US$ 3/15)' },
  { id: 'claude-haiku-4-5', rotulo: 'Claude Haiku 4.5 — econômico (US$ 1/5)' },
];

const BADGE_STATUS: Record<string, { classe: string; rotulo: string }> = {
  em_andamento: { classe: 'andamento', rotulo: '💼 trabalhando' },
  pausado: { classe: 'pausado', rotulo: '⏸ pausado' },
  aguardando_revisao: { classe: 'revisao', rotulo: '👀 aguardando revisão' },
  entregue: { classe: 'entregue', rotulo: '✅ entregue' },
  falhou: { classe: 'falhou', rotulo: '❌ falhou' },
  rascunho: { classe: 'entregue', rotulo: '📝 rascunho' },
};

const QA_ROTULO: Record<string, string> = {
  avaliando: '🔎 QA avaliando',
  revisar: '🔧 ajustes do QA',
  aprovado: '✅ QA aprovou',
  max_iteracoes: '⚠️ QA no limite de rodadas',
  reprovado: '⚠️ QA reprovou a rubrica',
  interrompido: '⏸ QA interrompido',
};

function hojeLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Pontes com o legado (áudio procedural e cena isométrica). */
function sfx(nome: string): void {
  (window as unknown as { Sfx?: { play: (n: string) => void } }).Sfx?.play(nome);
}

function cena(): { popMoney?: (t: string) => void; spawnClient?: () => void } {
  return (window as unknown as { IsoOffice?: { popMoney?: (t: string) => void; spawnClient?: () => void } }).IsoOffice ?? {};
}

/** Confete em DOM sobre a tela inteira (meta do mês batida). */
function soltarConfete(): void {
  const caixa = document.createElement('div');
  caixa.className = 'confete';
  const cores = ['#ffca4b', '#43c56e', '#7db4e8', '#e08a8a', '#c8aef0'];
  for (let i = 0; i < 90; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = cores[i % cores.length]!;
    p.style.animationDelay = `${Math.random() * 0.9}s`;
    p.style.animationDuration = `${2.2 + Math.random() * 1.6}s`;
    caixa.appendChild(p);
  }
  document.body.appendChild(caixa);
  setTimeout(() => caixa.remove(), 4800);
}

/** Senioridade real: nível derivado dos projetos ENTREGUES de verdade. */
const NIVEIS: [number, string][] = [
  [10, '🏆 Lenda da agência'],
  [6, '🥇 Veterano'],
  [3, '🥈 Referência'],
  [1, '🥉 Batalhador'],
  [0, '🌱 Novato'],
];

function nivelDe(entregues: number): { rotulo: string; proximoEm: number | null } {
  for (const [minimo, rotulo] of NIVEIS) {
    if (entregues >= minimo) {
      const acima = NIVEIS.filter(([m]) => m > entregues).map(([m]) => m);
      return { rotulo, proximoEm: acima.length ? Math.min(...acima) : null };
    }
  }
  return { rotulo: NIVEIS[NIVEIS.length - 1]![1], proximoEm: 1 };
}

/** Linha do tempo do projeto (backlog 9): etapas reportadas em horários reais + previsão. */
function montarLinhaTempo(entradas: EntradaAtividadeReal[], projeto: ProjetoRealFront): string {
  const pontos: { etapa: number; total: number; ts: number; resumo: string }[] = [];
  for (const e of entradas) {
    if (e.tipo !== 'progresso') continue;
    const m = /^Etapa (\d+)\/(\d+)\s*(?:—\s*)?(.*)$/.exec(e.texto);
    if (!m) continue;
    const ts = Date.parse(e.ts);
    if (Number.isFinite(ts)) pontos.push({ etapa: Number(m[1]), total: Number(m[2]), ts, resumo: m[3] ?? '' });
  }
  if (!pontos.length) return '';
  const inicio = projeto.iniciadoEm ? Date.parse(projeto.iniciadoEm) : pontos[0]!.ts;
  const duracoes = pontos.map((p, i) => Math.max(0, p.ts - (i === 0 ? inicio : pontos[i - 1]!.ts)));
  const maior = Math.max(1, ...duracoes);
  const fmtHora = (ts: number) =>
    new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fmtDur = (ms: number): string => {
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    return h < 48 ? `${h}h${String(min % 60).padStart(2, '0')}` : `${Math.round(h / 24)}d`;
  };
  const linhas = pontos
    .map(
      (p, i) => `<div class="lt-linha">
        <span class="lt-etapa">${p.etapa}/${p.total}</span>
        <div class="lt-bar"><div style="width:${Math.max(4, Math.round((duracoes[i]! / maior) * 100))}%"></div></div>
        <span class="lt-info">${fmtHora(p.ts)} · ${fmtDur(duracoes[i]!)}${p.resumo ? ` · ${esc(p.resumo.slice(0, 60))}` : ''}</span>
      </div>`,
    )
    .join('');
  const ultimo = pontos[pontos.length - 1]!;
  let previsao = '';
  if (ultimo.etapa >= ultimo.total) {
    previsao = '✅ Todas as etapas concluídas.';
  } else if (ultimo.etapa > 0) {
    const mediaPorEtapa = (ultimo.ts - inicio) / ultimo.etapa;
    const eta = ultimo.ts + mediaPorEtapa * (ultimo.total - ultimo.etapa);
    const prazoMs = projeto.iniciadoEm ? Date.parse(projeto.iniciadoEm) + projeto.prazoDias * 86400000 : null;
    const situacao =
      prazoMs == null
        ? ''
        : eta <= prazoMs
          ? ' — ✅ dentro do prazo'
          : ` — ⚠️ estoura o prazo em ~${Math.ceil((eta - prazoMs) / 86400000)}d`;
    previsao = `🔮 No ritmo atual, conclui ~ ${fmtHora(eta)}${situacao}`;
  }
  return `<details class="linha-tempo" open>
    <summary>📈 Linha do tempo (${ultimo.etapa}/${ultimo.total} etapas)</summary>
    ${linhas}${previsao ? `<div class="lt-eta">${previsao}</div>` : ''}
  </details>`;
}

// ---------- projetos ----------

function nomeFuncionario(id: string): string {
  if (id === 'equipe') return '👥 Equipe (Gerente de IA)';
  if (ehResponsavelTime(id)) {
    const time = snap()?.times?.find((t) => t.id === idDoTime(id));
    return time ? `${time.emoji} Time ${time.nome}` : '👥 Time';
  }
  return snap()?.funcionarios.find((f) => f.id === id)?.nome ?? '?';
}

function cardProjeto(p: ProjetoRealFront): string {
  const badge = BADGE_STATUS[p.status] ?? BADGE_STATUS.rascunho!;
  const custoBRL = p.custoUSD * cambio();
  const tokensK = Math.round(
    (p.tokens.input + p.tokens.output + p.tokens.cacheRead + p.tokens.cacheWrite) / 1000,
  );
  const pct = p.etapasTotais > 0 ? Math.round((p.etapasConcluidas / p.etapasTotais) * 100) : 0;
  const prazo = (() => {
    if (!p.iniciadoEm) return `${p.prazoDias}d de prazo`;
    const corridos = Math.floor((Date.now() - Date.parse(p.iniciadoEm)) / 86400000);
    const resta = p.prazoDias - corridos;
    return resta >= 0 ? `${resta}d restantes` : `${-resta}d atrasado ⚠️`;
  })();

  const acoes: string[] = [];
  const b = (acao: string, rotulo: string, classe = 'btn') =>
    `<button class="btn ${classe}" data-acao="${acao}" data-id="${p.id}">${rotulo}</button>`;
  if (p.status === 'rascunho') {
    acoes.push(b('iniciar', '🚀 Iniciar', 'btn-primary'), b('editar', '✏️ Editar'));
  } else if (p.status === 'em_andamento') {
    acoes.push(b('pausar', '⏸ Pausar'), b('atividade', '📡 Atividade'));
  } else if (p.status === 'pausado' || p.status === 'aguardando_revisao') {
    acoes.push(
      b('atividade', '📡 Atividade / Retomar'),
      b('entregar', '📦 Entregar', 'btn-accent'),
    );
  } else {
    acoes.push(b('atividade', '📜 Histórico'));
  }

  const barra =
    p.status === 'rascunho'
      ? ''
      : `<div class="pr-etapa">${p.etapasTotais ? `Etapa ${p.etapasConcluidas}/${p.etapasTotais}` : 'planejando…'}${
          p.resumoAtual ? ` — ${esc(p.resumoAtual)}` : ''
        }</div>
         <div class="pr-barra"><div style="width:${pct}%"></div></div>`;

  const chipQa = p.qaResultado
    ? `<span class="pr-chip qa" title="${esc((p.qaFeedback ?? '').slice(0, 400))}">${QA_ROTULO[p.qaResultado] ?? ''}${p.qaIteracao ? ` (rodada ${p.qaIteracao})` : ''}</span>`
    : p.qaAtivo && p.status !== 'rascunho'
      ? '<span class="pr-chip qa">🧪 QA automático ligado</span>'
      : '';
  const linkPr = p.prUrl
    ? `<a class="pr-link" href="${esc(p.prUrl)}" target="_blank" rel="noopener">🔀 Pull Request</a>`
    : '';

  return `<div class="pr-card">
    <h4>${esc(p.emoji)} ${esc(p.nome)} <span class="pr-badge ${badge.classe}">${badge.rotulo}</span></h4>
    <div class="pr-sub">${esc(p.cliente)} · ${p.tipo === 'codigo' ? '💻 código' : '📦 entrega'} · 👤 ${esc(nomeFuncionario(p.funcionarioId))} · 📅 ${prazo}</div>
    ${barra}
    <div class="pr-metricas">
      <span>💰 contrato <b>${brl(p.valorContratoBRL)}</b></span>
      <span>🔌 API <b>${brlCentavos(custoBRL)}</b> (US$ ${p.custoUSD.toFixed(2)})</span>
      <span>🧮 <b>${G.fmt(tokensK)}k</b> tokens</span>
      ${chipQa}${linkPr}
    </div>
    <div class="pr-acoes">${acoes.join('')}</div>
  </div>`;
}

/** Relatório matinal (F4b) — card no topo do painel de Projetos. */
function cardStandup(): string {
  const s = snap();
  const ultimo = s?.standups?.[0];
  const ativo = s?.config.standupAtivo !== false;
  const hora = s?.config.standupHora ?? '09:00';
  const corpo = ultimo
    ? `<details class="standup" ${ultimo.data === hojeLocalISO() ? 'open' : ''}>
        <summary>📋 Relatório matinal — ${ultimo.data.split('-').reverse().join('/')}</summary>
        <div class="standup-texto">${esc(ultimo.texto)}</div>
      </details>`
    : `<p class="pr-sub">📋 Sem relatório matinal ainda${ativo ? ` — o gerente publica todo dia às ${esc(hora)}` : ' (standup desativado na config)'}.</p>`;
  return `<div class="pr-card standup-card">${corpo}
    <div class="pr-acoes"><button class="btn" data-acao="standup-agora">▶️ Rodar standup agora</button></div>
  </div>`;
}

function renderProjetos(): void {
  const s = snap();
  const alvo = $('#realProjetos');
  if (!s) {
    alvo.innerHTML = '<p class="pr-sub">Conectando à ponte…</p>';
    return;
  }
  const abertos = s.projetos.filter((p) =>
    ['em_andamento', 'pausado', 'aguardando_revisao'].includes(p.status),
  );
  const rascunhos = s.projetos.filter((p) => p.status === 'rascunho');
  const passados = s.projetos.filter((p) => ['entregue', 'falhou'].includes(p.status));

  alvo.innerHTML = `
    <div class="pr-topo"><h3>📋 Projetos</h3>
      <button class="btn btn-primary" data-acao="novo">+ Novo Projeto</button></div>
    ${cardStandup()}
    ${abertos.length ? `<div class="pr-secao">Em produção</div>${abertos.map(cardProjeto).join('')}` : ''}
    ${rascunhos.length ? `<div class="pr-secao">Rascunhos</div>${rascunhos.map(cardProjeto).join('')}` : ''}
    ${!abertos.length && !rascunhos.length ? '<p class="pr-sub">Nenhum projeto ainda — cadastre o primeiro!</p>' : ''}
    ${blocoRotinas()}
    ${blocoFluxos()}
    ${passados.length ? `<div class="pr-secao">Histórico</div>${passados.map(cardProjeto).join('')}` : ''}`;
}

// ---------- fluxos (T3): esteiras ligando agentes/times ----------

let fluxoFormAberto = false;
let fluxoEmEdicao: FluxoReal | null = null;
let fluxoEstagiosDraft: Omit<EstagioFluxoReal, 'id'>[] = [];

const STATUS_EXEC_FLUXO: Record<string, string> = {
  em_andamento: '<span class="pr-badge andamento">⚙️ rodando</span>',
  aguardando_aprovacao: '<span class="pr-badge revisao">👀 aguardando sua aprovação</span>',
  concluida: '<span class="pr-badge entregue">✅ concluída</span>',
  cancelada: '<span class="pr-badge pausado">🚫 cancelada</span>',
  falhou: '<span class="pr-badge falhou">❌ falhou</span>',
};

function opcoesResponsavel(selecionado: string): string {
  const funcionarios = snap()?.funcionarios.filter((f) => f.status === 'ativo') ?? [];
  const times = timesAtivos();
  return `<option value="">— responsável —</option>
    ${funcionarios.map((f) => `<option value="funcionario:${f.id}" ${selecionado === `funcionario:${f.id}` ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}
    ${times.map((t) => `<option value="time:${t.id}" ${selecionado === `time:${t.id}` ? 'selected' : ''}>${esc(t.emoji)} Time ${esc(t.nome)}</option>`).join('')}`;
}

function formFluxo(): string {
  const f = fluxoEmEdicao;
  const estagios = fluxoEstagiosDraft
    .map(
      (e, i) => `<div class="pr-card" data-estagio="${i}">
      <div class="wizard-linha">
        <div><label>Estágio ${i + 1} — nome</label>
          <input type="text" data-fx-nome="${i}" maxlength="60" value="${esc(e.nome)}" placeholder="ex.: Proposta" /></div>
        <div><label>Responsável</label>
          <select data-fx-resp="${i}">${opcoesResponsavel(`${e.responsavelTipo}:${e.responsavelId}`)}</select></div>
        <div><label>Passa adiante</label>
          <select data-fx-aprov="${i}">
            <option value="manual" ${e.aprovacao === 'manual' ? 'selected' : ''}>👀 Com minha aprovação</option>
            <option value="automatica" ${e.aprovacao === 'automatica' ? 'selected' : ''}>⚡ Automático</option>
          </select></div>
      </div>
      <label>Instrução deste estágio</label>
      <textarea data-fx-instrucao="${i}" placeholder="O que fazer neste estágio (a carga do anterior chega junto)">${esc(e.instrucao)}</textarea>
      ${fluxoEstagiosDraft.length > 1 ? `<div class="pr-acoes"><button class="btn" data-acao-fluxo="remover-estagio" data-id="${i}">🗑 Remover estágio</button></div>` : ''}
    </div>`,
    )
    .join('');
  return `<div class="pr-card">
    <h4>${f ? `✏️ Editar fluxo ${esc(f.nome)}` : '🔗 Novo fluxo'}</h4>
    <p class="pr-sub">A saída de cada estágio (resumo + arquivos) vira a entrada do próximo — a ponte é o correio entre os agentes.</p>
    <div class="wizard-linha">
      <div><label>Nome do fluxo</label>
        <input type="text" id="fxNome" maxlength="80" value="${esc(f?.nome ?? '')}" placeholder="ex.: Comercial completo" /></div>
      <div><label>Emoji</label>
        <input type="text" id="fxEmoji" maxlength="8" value="${esc(f?.emoji ?? '🔗')}" /></div>
    </div>
    ${estagios}
    <div class="pr-acoes" style="margin-top:8px">
      <button class="btn" data-acao-fluxo="add-estagio">+ Adicionar estágio</button>
      <button class="btn btn-primary" data-acao-fluxo="salvar">${f ? 'Salvar fluxo' : 'Criar fluxo'}</button>
      <button class="btn" data-acao-fluxo="cancelar">Cancelar</button>
    </div>
  </div>`;
}

function cardFluxo(f: FluxoReal): string {
  const cadeia = f.estagios
    .map((e) => `${esc(e.nome)}${e.aprovacao === 'manual' ? ' 👀' : ''}`)
    .join(' → ');
  return `<div class="pr-card">
    <h4>${esc(f.emoji)} ${esc(f.nome)}</h4>
    <div class="pr-sub">${cadeia} <small>(👀 = passa com sua aprovação)</small></div>
    <div class="pr-acoes">
      <button class="btn btn-primary" data-acao-fluxo="disparar" data-id="${f.id}">🚀 Disparar</button>
      <button class="btn" data-acao-fluxo="editar" data-id="${f.id}">✏️ Editar</button>
      <button class="btn" data-acao-fluxo="excluir" data-id="${f.id}">🗑 Excluir</button>
    </div>
  </div>`;
}

function cardExecucaoFluxo(e: ExecucaoFluxoReal): string {
  const fluxo = snap()?.fluxos?.find((f) => f.id === e.fluxoId);
  const total = fluxo?.estagios.length ?? 0;
  const nomeEstagio = fluxo?.estagios[e.estagioAtual]?.nome ?? '?';
  const cargas = e.carga
    .map(
      (c, i) => `<details><summary><b>${i + 1}. ${esc(c.estagioNome)}</b> · ${brlCentavos(c.custoUSD * cambio())}${c.arquivos.length ? ` · 📎 ${c.arquivos.length}` : ''}</summary>
        <div class="standup-texto">${esc(c.resumo)}</div>
      </details>`,
    )
    .join('');
  const acoes =
    e.status === 'aguardando_aprovacao'
      ? `<div class="pr-acoes">
          <button class="btn btn-primary" data-acao-fluxo="aprovar" data-id="${e.id}">✅ Aprovar e passar adiante</button>
          <button class="btn" data-acao-fluxo="refazer" data-id="${e.id}">🔧 Refazer com feedback</button>
          <button class="btn" data-acao-fluxo="cancelar-exec" data-id="${e.id}">🚫 Cancelar</button>
        </div>`
      : e.status === 'em_andamento'
        ? `<div class="pr-acoes"><button class="btn" data-acao-fluxo="cancelar-exec" data-id="${e.id}">🚫 Cancelar</button></div>`
        : '';
  return `<div class="pr-card">
    <h4>${esc(fluxo?.emoji ?? '🔗')} ${esc(e.titulo)} ${STATUS_EXEC_FLUXO[e.status] ?? ''}</h4>
    <div class="pr-sub">${esc(fluxo?.nome ?? 'Fluxo')} · estágio ${Math.min(e.estagioAtual + 1, total)}/${total} (${esc(nomeEstagio)})${e.erro ? ` · <b>${esc(e.erro)}</b>` : ''}</div>
    ${cargas}
    ${acoes}
  </div>`;
}

function blocoFluxos(): string {
  const s = snap();
  const fluxos = s?.fluxos ?? [];
  const execucoes = (s?.execucoesFluxos ?? []).filter(
    (e) => ['em_andamento', 'aguardando_aprovacao'].includes(e.status) || Date.now() - Date.parse(e.atualizadoEm) < 3 * 86400000,
  );
  return `
    <div class="pr-topo" style="margin-top:16px"><h3>🔗 Fluxos (${fluxos.length})</h3>
      <button class="btn" data-acao-fluxo="novo">+ Novo fluxo</button></div>
    ${fluxoFormAberto ? formFluxo() : ''}
    ${
      fluxos.length
        ? fluxos.map(cardFluxo).join('')
        : fluxoFormAberto
          ? ''
          : '<p class="pr-sub">Ligue agentes e times numa esteira: captação → proposta → execução → entrega. Cada estágio roda com o responsável que você escolher, e você aprova entre estágios.</p>'
    }
    ${execucoes.length ? `<div class="pr-secao">Execuções</div>${execucoes.map(cardExecucaoFluxo).join('')}` : ''}`;
}

/** Lê o formulário do fluxo do DOM para o draft (preserva valores em re-render). */
function colherFluxoDraft(): void {
  fluxoEstagiosDraft = fluxoEstagiosDraft.map((e, i) => {
    const valor = (attr: string): string =>
      (document.querySelector(`[data-fx-${attr}="${i}"]`) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
    const resp = valor('resp').split(':');
    return {
      nome: valor('nome') || e.nome,
      responsavelTipo: (resp[0] as 'funcionario' | 'time') || e.responsavelTipo,
      responsavelId: resp.slice(1).join(':') || e.responsavelId,
      instrucao: valor('instrucao') || e.instrucao,
      aprovacao: (valor('aprov') as 'manual' | 'automatica') || e.aprovacao,
    };
  });
}

async function agirFluxo(acao: string, id: string): Promise<void> {
  const s = snap();
  try {
    if (acao === 'novo') {
      fluxoFormAberto = true;
      fluxoEmEdicao = null;
      fluxoEstagiosDraft = [{ nome: '', responsavelTipo: 'funcionario', responsavelId: '', instrucao: '', aprovacao: 'manual' }];
      renderProjetos();
    } else if (acao === 'editar') {
      const f = s?.fluxos?.find((x) => x.id === id) ?? null;
      if (!f) return;
      fluxoFormAberto = true;
      fluxoEmEdicao = f;
      fluxoEstagiosDraft = f.estagios.map((e) => ({
        nome: e.nome,
        responsavelTipo: e.responsavelTipo,
        responsavelId: e.responsavelId,
        instrucao: e.instrucao,
        aprovacao: e.aprovacao,
      }));
      renderProjetos();
    } else if (acao === 'cancelar') {
      fluxoFormAberto = false;
      fluxoEmEdicao = null;
      renderProjetos();
    } else if (acao === 'add-estagio') {
      colherFluxoDraft();
      fluxoEstagiosDraft.push({ nome: '', responsavelTipo: 'funcionario', responsavelId: '', instrucao: '', aprovacao: 'manual' });
      renderProjetos();
    } else if (acao === 'remover-estagio') {
      colherFluxoDraft();
      fluxoEstagiosDraft.splice(Number(id), 1);
      renderProjetos();
    } else if (acao === 'salvar') {
      colherFluxoDraft();
      const nome = (document.getElementById('fxNome') as HTMLInputElement | null)?.value.trim() ?? '';
      const emoji = (document.getElementById('fxEmoji') as HTMLInputElement | null)?.value.trim() || '🔗';
      if (!nome) return toast('⚠️ Dê um nome ao fluxo.', 'bad');
      for (const [i, e] of fluxoEstagiosDraft.entries()) {
        if (!e.nome.trim()) return toast(`⚠️ Estágio ${i + 1}: falta o nome.`, 'bad');
        if (!e.responsavelId) return toast(`⚠️ Estágio ${i + 1}: escolha o responsável.`, 'bad');
        if (e.instrucao.trim().length < 10) return toast(`⚠️ Estágio ${i + 1}: escreva a instrução.`, 'bad');
      }
      const dados = { nome, emoji, estagios: fluxoEstagiosDraft };
      if (fluxoEmEdicao) {
        await api.atualizarFluxo(fluxoEmEdicao.id, dados);
        toast(`✅ Fluxo ${nome} atualizado.`);
      } else {
        await api.criarFluxo(dados);
        toast(`🔗 Fluxo ${nome} criado! Dispare quando quiser.`);
      }
      fluxoFormAberto = false;
      fluxoEmEdicao = null;
    } else if (acao === 'disparar') {
      const f = s?.fluxos?.find((x) => x.id === id);
      if (!f) return;
      const titulo = prompt(`Disparar "${f.nome}" — dê um título a esta execução:`, '');
      if (!titulo?.trim()) return;
      const entrada = prompt('Entrada para o 1º estágio (contexto inicial):', '') ?? '';
      toast('🚀 Fluxo disparado — o 1º estágio começou…');
      await api.dispararFluxo(id, titulo.trim(), entrada);
    } else if (acao === 'excluir') {
      const f = s?.fluxos?.find((x) => x.id === id);
      if (!f || !confirm(`Excluir o fluxo ${f.nome}?`)) return;
      await api.excluirFluxo(id);
      toast(`🗑 Fluxo ${f.nome} excluído.`);
    } else if (acao === 'aprovar') {
      await api.aprovarExecucaoFluxo(id);
      toast('✅ Aprovado — seguindo para o próximo estágio.', 'good');
    } else if (acao === 'refazer') {
      const feedback = prompt('O que deve mudar? (vira o feedback do estágio)');
      if (!feedback?.trim()) return;
      await api.refazerExecucaoFluxo(id, feedback.trim());
      toast('🔧 Refazendo o estágio com o seu feedback…');
    } else if (acao === 'cancelar-exec') {
      if (!confirm('Cancelar esta execução do fluxo?')) return;
      await api.cancelarExecucaoFluxo(id);
      toast('🚫 Execução cancelada.');
    }
  } catch (erro) {
    toast(`⚠️ ${(erro as Error).message}`, 'bad');
  }
}

// ---------- rotinas 24/7 (T2) ----------

let rotinaFormAberto = false;
let rotinaEmEdicao: RotinaReal | null = null;

const CONTEXTOS_ROTINA: Record<string, string> = {
  crm: '🧲 CRM (clientes + funil)',
  projetos: '📋 Projetos (status real)',
  financeiro: '💰 Financeiro (resumo)',
};

const ACOES_ROTINA_ROTULO: Record<string, string> = {
  criar_oportunidade: '🧲 Criar oportunidade no CRM',
  registrar_nota_cliente: '📝 Anotar em cliente',
  criar_rascunho_projeto: '📋 Criar rascunho de projeto',
};

function nomeResponsavelRotina(r: RotinaReal): string {
  if (r.responsavelTipo === 'time') {
    const t = snap()?.times?.find((x) => x.id === r.responsavelId);
    return t ? `${t.emoji} Time ${t.nome}` : '👥 Time';
  }
  return snap()?.funcionarios.find((f) => f.id === r.responsavelId)?.nome ?? '?';
}

function cardRotina(r: RotinaReal): string {
  const ultima = r.ultimaExecucao
    ? new Date(r.ultimaExecucao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'nunca';
  return `<div class="pr-card">
    <h4>${esc(r.emoji)} ${esc(r.nome)} ${r.ativa ? '<span class="pr-badge andamento">⏰ agendada</span>' : '<span class="pr-badge pausado">⏸ pausada</span>'}</h4>
    <div class="pr-sub">👤 ${esc(nomeResponsavelRotina(r))} · ⏰ ${esc(r.hora)} ${r.dias === 'uteis' ? '(seg–sex)' : '(todo dia)'} · última: ${ultima}</div>
    <div>${r.acoes.map((a) => `<span class="pr-chip">${ACOES_ROTINA_ROTULO[a] ?? a}</span>`).join('') || '<span class="pr-sub">só análise (sem ações no sistema)</span>'}</div>
    <div class="pr-acoes">
      <button class="btn" data-acao-rotina="rodar" data-id="${r.id}">▶️ Rodar agora</button>
      <button class="btn" data-acao-rotina="alternar" data-id="${r.id}">${r.ativa ? '⏸ Pausar' : '▶️ Reativar'}</button>
      <button class="btn" data-acao-rotina="editar" data-id="${r.id}">✏️ Editar</button>
      <button class="btn" data-acao-rotina="excluir" data-id="${r.id}">🗑 Excluir</button>
    </div>
  </div>`;
}

function formRotina(): string {
  const s = snap();
  const r = rotinaEmEdicao;
  const funcionarios = s?.funcionarios.filter((f) => f.status === 'ativo') ?? [];
  const times = timesAtivos();
  const respValor = r ? `${r.responsavelTipo}:${r.responsavelId}` : '';
  const marcadoCtx = (k: string) => (r?.contexto.includes(k as RotinaReal['contexto'][number]) ? 'checked' : '');
  const marcadoAcao = (k: string) => (r?.acoes.includes(k as RotinaReal['acoes'][number]) ? 'checked' : '');
  return `<div class="pr-card">
    <h4>${r ? `✏️ Editar rotina ${esc(r.nome)}` : '🔁 Nova rotina'}</h4>
    <div class="wizard-linha">
      <div><label>Nome</label>
        <input type="text" id="rNome" maxlength="80" value="${esc(r?.nome ?? '')}" placeholder="ex.: Caçador de leads" /></div>
      <div><label>Emoji</label>
        <input type="text" id="rEmoji" maxlength="8" value="${esc(r?.emoji ?? '🔁')}" /></div>
    </div>
    <div class="wizard-linha">
      <div><label>Responsável</label>
        <select id="rResp">
          <option value="">— escolha —</option>
          ${funcionarios.map((f) => `<option value="funcionario:${f.id}" ${respValor === `funcionario:${f.id}` ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}
          ${times.map((t) => `<option value="time:${t.id}" ${respValor === `time:${t.id}` ? 'selected' : ''}>${esc(t.emoji)} Time ${esc(t.nome)}</option>`).join('')}
        </select></div>
      <div><label>Horário</label>
        <input type="time" id="rHora" value="${esc(r?.hora ?? '08:00')}" /></div>
      <div><label>Dias</label>
        <select id="rDias">
          <option value="uteis" ${(r?.dias ?? 'uteis') === 'uteis' ? 'selected' : ''}>Seg–sex</option>
          <option value="todos" ${r?.dias === 'todos' ? 'selected' : ''}>Todo dia</option>
        </select></div>
    </div>
    <label>Briefing — o que fazer em cada execução</label>
    <textarea id="rBriefing" placeholder="ex.: Analise os leads e oportunidades do CRM. Qualifique cada um (quente/morno/frio), anote o racional no cliente e crie oportunidades para os quentes.">${esc(r?.briefing ?? '')}</textarea>
    <label>Contexto real fornecido ao agente</label>
    <div class="wizard-checks">${Object.entries(CONTEXTOS_ROTINA)
      .map(([k, rot]) => `<label><input type="checkbox" data-ctx-rotina="${k}" ${marcadoCtx(k)} /> ${rot}</label>`)
      .join('')}</div>
    <label>Ações que o agente PODE executar (criar/anotar apenas — iniciar projeto e dinheiro são sempre seus)</label>
    <div class="wizard-checks">${Object.entries(ACOES_ROTINA_ROTULO)
      .map(([k, rot]) => `<label><input type="checkbox" data-acao-check-rotina="${k}" ${marcadoAcao(k)} /> ${rot}</label>`)
      .join('')}</div>
    <div class="pr-acoes" style="margin-top:8px">
      <button class="btn btn-primary" data-acao-rotina="salvar">${r ? 'Salvar rotina' : 'Criar rotina'}</button>
      <button class="btn" data-acao-rotina="cancelar">Cancelar</button>
    </div>
  </div>`;
}

function blocoRotinas(): string {
  const s = snap();
  const rotinas = s?.rotinas ?? [];
  const feed = s?.execucoesRotinas ?? [];
  const itensFeed = feed
    .slice(0, 6)
    .map((e) => {
      const rotina = rotinas.find((r) => r.id === e.rotinaId);
      const quando = new Date(e.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      return `<details class="standup-card pr-card"><summary>${esc(rotina?.emoji ?? '🔁')} <b>${esc(rotina?.nome ?? 'Rotina')}</b> · ${quando}${e.acoesFeitas.length ? ` · ⚡ ${e.acoesFeitas.length} ação(ões)` : ''}</summary>
        <div class="standup-texto">${esc(e.texto)}</div>
        ${e.acoesFeitas.length ? `<div class="pr-sub">⚡ ${e.acoesFeitas.map(esc).join(' · ')}</div>` : ''}
      </details>`;
    })
    .join('');
  return `
    <div class="pr-topo" style="margin-top:16px"><h3>🔁 Rotinas (${rotinas.length})</h3>
      <button class="btn" data-acao-rotina="nova">+ Nova rotina</button></div>
    ${rotinaFormAberto ? formRotina() : ''}
    ${
      rotinas.length
        ? rotinas.map(cardRotina).join('')
        : rotinaFormAberto
          ? ''
          : '<p class="pr-sub">Trabalhos recorrentes 24/7: qualificar leads toda manhã, relatório semanal… O agente roda sozinho no horário (na nuvem) e publica o resultado aqui.</p>'
    }
    ${itensFeed ? `<div class="pr-secao">Feed das rotinas</div>${itensFeed}` : ''}`;
}

async function agirRotina(acao: string, id: string): Promise<void> {
  const r = snap()?.rotinas?.find((x) => x.id === id) ?? null;
  try {
    if (acao === 'nova') {
      rotinaFormAberto = true;
      rotinaEmEdicao = null;
      renderProjetos();
    } else if (acao === 'editar' && r) {
      rotinaFormAberto = true;
      rotinaEmEdicao = r;
      renderProjetos();
    } else if (acao === 'cancelar') {
      rotinaFormAberto = false;
      rotinaEmEdicao = null;
      renderProjetos();
    } else if (acao === 'salvar') {
      const valor = (sel: string) => (document.getElementById(sel) as HTMLInputElement | null)?.value ?? '';
      const resp = valor('rResp').split(':');
      const dados = {
        nome: valor('rNome').trim(),
        emoji: valor('rEmoji').trim() || '🔁',
        responsavelTipo: resp[0] as 'funcionario' | 'time',
        responsavelId: resp.slice(1).join(':'),
        hora: valor('rHora') || '08:00',
        dias: valor('rDias') as 'todos' | 'uteis',
        briefing: (document.getElementById('rBriefing') as HTMLTextAreaElement | null)?.value.trim() ?? '',
        contexto: [...document.querySelectorAll('[data-ctx-rotina]:checked')].map(
          (el) => (el as HTMLElement).dataset.ctxRotina!,
        ),
        acoes: [...document.querySelectorAll('[data-acao-check-rotina]:checked')].map(
          (el) => (el as HTMLElement).dataset.acaoCheckRotina!,
        ),
      };
      if (!dados.nome) return toast('⚠️ Dê um nome à rotina.', 'bad');
      if (!dados.responsavelId) return toast('⚠️ Escolha o responsável.', 'bad');
      if (dados.briefing.length < 10) return toast('⚠️ Escreva o briefing (o que fazer).', 'bad');
      if (rotinaEmEdicao) {
        await api.atualizarRotina(rotinaEmEdicao.id, dados);
        toast(`✅ Rotina ${dados.nome} atualizada.`);
      } else {
        await api.criarRotina(dados);
        toast(`🔁 Rotina ${dados.nome} criada! O cron é agendado na nuvem em instantes.`);
      }
      rotinaFormAberto = false;
      rotinaEmEdicao = null;
    } else if (acao === 'alternar' && r) {
      await api.atualizarRotina(id, { ativa: !r.ativa });
      toast(r.ativa ? '⏸ Rotina pausada.' : '▶️ Rotina reativada.');
    } else if (acao === 'rodar') {
      toast('▶️ Rodando a rotina agora — o resultado chega no feed em 1–3 minutos…');
      await api.rodarRotinaAgora(id);
      toast('✅ Rotina executada — veja o feed.', 'good');
    } else if (acao === 'excluir' && r) {
      if (!confirm(`Excluir a rotina ${r.nome}? O cron na nuvem é arquivado.`)) return;
      await api.excluirRotina(id);
      toast(`🗑 Rotina ${r.nome} excluída.`);
    }
  } catch (erro) {
    toast(`⚠️ ${(erro as Error).message}`, 'bad');
  }
}

async function agirProjeto(acao: string, id: string): Promise<void> {
  const projeto = snap()?.projetos.find((p) => p.id === id);
  try {
    if (acao === 'novo') abrirWizard(null);
    else if (acao === 'editar' && projeto) abrirWizard(projeto);
    else if (acao === 'iniciar') {
      toast('🚀 Iniciando o projeto…');
      await api.iniciarProjeto(id);
      toast('💼 Funcionário assumiu o projeto!', 'good');
    } else if (acao === 'pausar') {
      await api.pausarProjeto(id);
      toast('⏸ Projeto pausado.');
    } else if (acao === 'entregar') {
      if (!confirm('Marcar como ENTREGUE? Isso gera as contas a receber e encerra a sessão.')) return;
      const r = (await api.entregarProjeto(id)) as { contasGeradas: number; arquivosBaixados: string[] };
      toast(`📦 Entregue! ${r.contasGeradas} conta(s) a receber; ${r.arquivosBaixados.length} arquivo(s) baixado(s).`, 'good');
    } else if (acao === 'standup-agora') {
      toast('📋 Chamando o gerente para o standup — leva 1–2 minutos…');
      await api.rodarStandupAgora();
      toast('📋 Standup publicado!', 'good');
    } else if (acao === 'atividade' && projeto) abrirAtividade(projeto.id);
  } catch (erro) {
    toast(`⚠️ ${(erro as Error).message}`, 'bad');
  }
}

// ---------- equipe ----------

function cardFuncionario(f: FuncionarioReal): string {
  const s = snap();
  const projetoAtivo = s?.projetos.find(
    (p) => p.funcionarioId === f.id && p.status === 'em_andamento',
  );
  const entreguesDele = s?.projetos.filter((p) => p.funcionarioId === f.id && p.status === 'entregue') ?? [];
  const entregues = entreguesDele.length;
  const chips = f.skills
    .map((k) => SKILLS_BLOCO[k] ?? SKILLS_ANTHROPIC[k] ?? k)
    .map((r) => `<span class="pr-chip">${esc(r)}</span>`)
    .join('');
  const status = projetoAtivo
    ? `<span class="pr-badge andamento">💼 em ${esc(projetoAtivo.emoji)} ${esc(projetoAtivo.nome)}</span>`
    : '<span class="pr-badge entregue">☕ disponível</span>';

  // senioridade REAL (backlog 2): nível por entregas, aprovação no QA e custo médio
  const nivel = nivelDe(entregues);
  const comQa = entreguesDele.filter((p) => p.qaAtivo);
  const aprovados = comQa.filter((p) => p.qaResultado === 'aprovado').length;
  const taxaQa = comQa.length ? `${Math.round((aprovados / comQa.length) * 100)}%` : '—';
  const custoMedio = entregues ? (entreguesDele.reduce((soma, p) => soma + p.custoUSD, 0) / entregues) * cambio() : 0;
  const senioridade = `<div class="pr-metricas senioridade">
      <span class="pr-chip qa" title="${nivel.proximoEm != null ? `próximo nível com ${nivel.proximoEm} entregas` : 'nível máximo!'}">${nivel.rotulo}</span>
      <span>🔎 aprovação no QA <b>${taxaQa}</b></span>
      ${entregues ? `<span>💵 custo médio <b>${brlCentavos(custoMedio)}</b>/projeto</span>` : ''}
    </div>`;

  return `<div class="pr-card">
    <h4>${esc(f.nome)} ${status}</h4>
    <div class="pr-sub">${CARGOS[f.cargoVisual] ?? f.cargoVisual} · ${esc(f.modelo)}</div>
    <div>${chips || '<span class="pr-sub">sem skills marcadas</span>'}</div>
    ${senioridade}
    <div class="pr-metricas">
      <span>📆 salário do dia <b>${brlCentavos(f.custoHojeUSD * cambio())}</b></span>
      <span>Σ API <b>${brlCentavos(f.custoTotalUSD * cambio())}</b></span>
      <span>✅ entregues <b>${entregues}</b></span>
    </div>
    <div class="pr-acoes">
      <button class="btn" data-acao-func="editar" data-id="${f.id}">✏️ Editar</button>
      <button class="btn" data-acao-func="arquivar" data-id="${f.id}">🗄 Arquivar</button>
    </div>
  </div>`;
}

function renderEquipe(): void {
  const s = snap();
  const alvo = $('#realEquipe');
  const ativos = s?.funcionarios.filter((f) => f.status === 'ativo') ?? [];

  // 🏆 conquistas reais (backlog 5): desbloqueadas com data; bloqueadas viram metas
  const conquistas = s?.conquistas ?? [];
  const desbloqueadas = conquistas.filter((c) => c.quando).length;
  const blocoConquistas = conquistas.length
    ? `<div class="pr-secao" style="margin-top:16px">🏆 Conquistas da agência (${desbloqueadas}/${conquistas.length})</div>
       <div class="conq-grid">${conquistas
         .map(
           (c) => `<div class="conq ${c.quando ? 'ok' : 'trancada'}" title="${esc(c.descricao)}">
             <span class="conq-emoji">${c.quando ? c.emoji : '🔒'}</span>
             <div><b>${esc(c.titulo)}</b><br /><small>${
               c.quando ? `em ${new Date(c.quando).toLocaleDateString('pt-BR')}` : esc(c.descricao)
             }</small></div>
           </div>`,
         )
         .join('')}</div>`
    : '';

  // 🧩 times dinâmicos (T1): squads por demanda com coordenador próprio
  const times = timesAtivos();
  const blocoTimes = `
    <div class="pr-topo" style="margin-top:16px"><h3>🧩 Times (${times.length})</h3>
      <button class="btn" data-acao-time="novo">+ Novo time</button></div>
    ${timeFormAberto ? formTime() : ''}
    ${
      times.length
        ? times.map(cardTime).join('')
        : timeFormAberto
          ? ''
          : '<p class="pr-sub">Monte times por demanda: um para cada projeto grande, um para a operação de Mercado Livre… O coordenador do time delega o trabalho entre os membros.</p>'
    }`;

  alvo.innerHTML = `
    <div class="pr-topo"><h3>👥 Equipe (${ativos.length})</h3>
      <button class="btn btn-primary" data-acao-func="contratar">+ Contratar</button></div>
    ${ativos.length ? ativos.map(cardFuncionario).join('') : '<p class="pr-sub">Ninguém contratado ainda. Seu primeiro funcionário-agente está a um clique.</p>'}
    ${blocoTimes}
    ${blocoConquistas}`;
}

async function agirFuncionario(acao: string, id: string): Promise<void> {
  const f = snap()?.funcionarios.find((x) => x.id === id) ?? null;
  try {
    if (acao === 'contratar') abrirFuncionario(null);
    else if (acao === 'editar' && f) abrirFuncionario(f);
    else if (acao === 'arquivar' && f) {
      if (!confirm(`Arquivar ${f.nome}? O boneco sai da cena (o histórico fica).`)) return;
      await api.arquivarFuncionario(id);
      toast(`🗄 ${f.nome} arquivado.`);
    }
  } catch (erro) {
    toast(`⚠️ ${(erro as Error).message}`, 'bad');
  }
}

// ---------- times dinâmicos (T1) ----------

let timeFormAberto = false;
let timeEmEdicao: TimeReal | null = null;

function cardTime(t: TimeReal): string {
  const s = snap();
  const membros = t.membros
    .map((id) => s?.funcionarios.find((f) => f.id === id))
    .filter((f): f is FuncionarioReal => Boolean(f && f.status === 'ativo'));
  const emAberto =
    s?.projetos.filter(
      (p) => p.funcionarioId === `${PREFIXO_TIME}${t.id}` && !['entregue', 'falhou', 'rascunho'].includes(p.status),
    ) ?? [];
  const entregues =
    s?.projetos.filter((p) => p.funcionarioId === `${PREFIXO_TIME}${t.id}` && p.status === 'entregue') ?? [];
  return `<div class="pr-card">
    <h4>${esc(t.emoji)} Time ${esc(t.nome)} ${emAberto.length ? '<span class="pr-badge andamento">💼 em projeto</span>' : '<span class="pr-badge entregue">☕ disponível</span>'}</h4>
    ${t.missao ? `<div class="pr-sub">${esc(t.missao)}</div>` : ''}
    <div>${membros.map((m) => `<span class="pr-chip">${esc(m.nome)}</span>`).join('') || '<span class="pr-sub">sem membros ativos</span>'}</div>
    <div class="pr-metricas">
      <span>👥 <b>${membros.length}</b> membro${membros.length === 1 ? '' : 's'}</span>
      <span>💼 em aberto <b>${emAberto.length}</b></span>
      <span>✅ entregues <b>${entregues.length}</b></span>
    </div>
    <div class="pr-acoes">
      <button class="btn" data-acao-time="editar" data-id="${t.id}">✏️ Editar</button>
      <button class="btn" data-acao-time="arquivar" data-id="${t.id}">🗄 Arquivar</button>
    </div>
  </div>`;
}

function formTime(): string {
  const s = snap();
  const ativos = s?.funcionarios.filter((f) => f.status === 'ativo') ?? [];
  const t = timeEmEdicao;
  const marcado = (id: string) => (t?.membros.includes(id) ? 'checked' : '');
  return `<div class="pr-card">
    <h4>${t ? `✏️ Editar time ${esc(t.nome)}` : '🧩 Novo time'}</h4>
    <div class="wizard-linha">
      <div><label>Nome do time</label>
        <input type="text" id="tNome" maxlength="80" value="${esc(t?.nome ?? '')}" placeholder="ex.: Mercado Livre, App do Cliente X" /></div>
      <div><label>Emoji</label>
        <input type="text" id="tEmoji" maxlength="8" value="${esc(t?.emoji ?? '🧩')}" /></div>
    </div>
    <label>Missão — o que esse time faz (vira o contexto do coordenador)</label>
    <textarea id="tMissao" placeholder="ex.: Operar a conta do Mercado Livre: anúncios, preços e atendimento.">${esc(t?.missao ?? '')}</textarea>
    <label>Membros (o coordenador delega só entre eles)</label>
    <div class="wizard-checks">${
      ativos.length
        ? ativos
            .map(
              (f) =>
                `<label><input type="checkbox" data-membro="${f.id}" ${marcado(f.id)} /> ${esc(f.nome)} (${CARGOS[f.cargoVisual] ?? f.cargoVisual})</label>`,
            )
            .join('')
        : '<span class="pr-sub">Contrate funcionários antes de montar um time.</span>'
    }</div>
    <div class="pr-acoes" style="margin-top:8px">
      <button class="btn btn-primary" data-acao-time="salvar">${t ? 'Salvar time' : 'Criar time'}</button>
      <button class="btn" data-acao-time="cancelar">Cancelar</button>
    </div>
  </div>`;
}

async function agirTime(acao: string, id: string): Promise<void> {
  const t = timesAtivos().find((x) => x.id === id) ?? null;
  try {
    if (acao === 'novo') {
      timeFormAberto = true;
      timeEmEdicao = null;
      renderEquipe();
    } else if (acao === 'editar' && t) {
      timeFormAberto = true;
      timeEmEdicao = t;
      renderEquipe();
    } else if (acao === 'cancelar') {
      timeFormAberto = false;
      timeEmEdicao = null;
      renderEquipe();
    } else if (acao === 'salvar') {
      const nome = (document.getElementById('tNome') as HTMLInputElement | null)?.value.trim() ?? '';
      const emoji = (document.getElementById('tEmoji') as HTMLInputElement | null)?.value.trim() || '🧩';
      const missao = (document.getElementById('tMissao') as HTMLTextAreaElement | null)?.value.trim() ?? '';
      const membros = [...document.querySelectorAll('[data-membro]:checked')].map(
        (el) => (el as HTMLElement).dataset.membro!,
      );
      if (!nome) return toast('⚠️ Dê um nome ao time.', 'bad');
      if (!membros.length) return toast('⚠️ Escolha pelo menos 1 membro.', 'bad');
      if (timeEmEdicao) {
        await api.atualizarTime(timeEmEdicao.id, { nome, emoji, missao, membros });
        toast(`✅ Time ${nome} atualizado.`);
      } else {
        await api.criarTime({ nome, emoji, missao, membros });
        toast(`🧩 Time ${nome} criado! Escolha-o como responsável no próximo projeto.`);
      }
      timeFormAberto = false;
      timeEmEdicao = null;
    } else if (acao === 'arquivar' && t) {
      if (!confirm(`Arquivar o time ${t.nome}? (os funcionários continuam na equipe)`)) return;
      await api.arquivarTime(id);
      toast(`🗄 Time ${t.nome} arquivado.`);
    }
  } catch (erro) {
    toast(`⚠️ ${(erro as Error).message}`, 'bad');
  }
}

// ---------- modal de funcionário ----------

let funcionarioEmEdicao: FuncionarioReal | null = null;

function abrirFuncionario(f: FuncionarioReal | null): void {
  funcionarioEmEdicao = f;
  $('#funcTitulo').textContent = f ? `✏️ Editar ${f.nome}` : '👥 Contratar funcionário';
  $('#funcErro').textContent = '';
  const marcada = (k: string) => (f?.skills.includes(k) ? 'checked' : '');
  $('#funcCorpo').innerHTML = `
    <label>Nome (aparece sobre o boneco na cena)</label>
    <input type="text" id="fNome" maxlength="40" value="${esc(f?.nome ?? '')}" placeholder="ex.: Rafa" />
    <div class="wizard-linha">
      <div><label>Cargo visual (roupa/acessório do avatar)</label>
        <select id="fCargo">${Object.entries(CARGOS)
          .map(([id, r]) => `<option value="${id}" ${f?.cargoVisual === id ? 'selected' : ''}>${r}</option>`)
          .join('')}</select></div>
      <div><label>Modelo (custo real ao lado)</label>
        <select id="fModelo">${MODELOS.map(
          (m) => `<option value="${m.id}" ${f?.modelo === m.id ? 'selected' : ''}>${m.rotulo}</option>`,
        ).join('')}</select></div>
    </div>
    <label>Especialidades (viram o system prompt do agente)</label>
    <div class="wizard-checks">${Object.entries(SKILLS_BLOCO)
      .map(([k, r]) => `<label><input type="checkbox" data-skill="${k}" ${marcada(k)} /> ${r}</label>`)
      .join('')}</div>
    <label>Skills de documento (hospedadas pela Anthropic)</label>
    <div class="wizard-checks">${Object.entries(SKILLS_ANTHROPIC)
      .map(([k, r]) => `<label><input type="checkbox" data-skill="${k}" ${marcada(k)} /> ${r}</label>`)
      .join('')}</div>
    <label>Persona — como esse funcionário trabalha (livre)</label>
    <textarea id="fPersona" maxlength="4000" placeholder="ex.: Direto, entrega rápido, comenta o código em pt-BR…">${esc(f?.persona ?? '')}</textarea>`;
  $('#modalFuncionario').classList.remove('hidden');
}

async function salvarFuncionario(): Promise<void> {
  const nome = ($('#fNome') as HTMLInputElement).value.trim();
  if (!nome) {
    $('#funcErro').textContent = 'Dê um nome ao funcionário.';
    return;
  }
  const skills = [...document.querySelectorAll('#funcCorpo [data-skill]:checked')].map(
    (el) => (el as HTMLElement).dataset.skill!,
  );
  const dados = {
    nome,
    cargoVisual: ($('#fCargo') as HTMLSelectElement).value,
    modelo: ($('#fModelo') as HTMLSelectElement).value,
    skills,
    persona: ($('#fPersona') as HTMLTextAreaElement).value.trim(),
  };
  $('#funcErro').textContent = 'Criando o agente na Anthropic…';
  try {
    if (funcionarioEmEdicao) await api.atualizarFuncionario(funcionarioEmEdicao.id, dados);
    else await api.criarFuncionario(dados);
    $('#modalFuncionario').classList.add('hidden');
    toast(funcionarioEmEdicao ? `✏️ ${nome} atualizado (nova versão do agente).` : `🎉 ${nome} contratado! O boneco já está na cena.`, 'good');
  } catch (erro) {
    $('#funcErro').textContent = `⚠️ ${(erro as Error).message}`;
  }
}

// ---------- wizard de projeto (4 passos) ----------

interface DadosWizard {
  nome: string;
  cliente: string;
  emoji: string;
  tipo: 'codigo' | 'entrega';
  valorContratoBRL: number;
  forma: 'avista' | 'parcelado';
  parcelas: number;
  entradaBRL: number;
  prazoDias: number;
  funcionarioId: string;
  objetivo: string;
  escopo: string;
  foraDoEscopo: string;
  requisitosTecnicos: string;
  designReferencias: string;
  entregaveis: string;
  criteriosAceite: string;
  observacoes: string;
  repoUrl: string;
  branch: string;
  qaAtivo: boolean;
  abrirPR: boolean;
}

let wizardPasso = 1;
let wizardDados: DadosWizard;
let wizardEditandoId: string | null = null;

const PASSOS = ['1. Contrato', '2. Especificação', '3. Entrega', '4. Revisão'];

function abrirWizard(
  projeto: ProjetoRealFront | null,
  prefill?: { nome?: string; cliente?: string; valor?: number }, // vindo do CRM (oportunidade fechada)
): void {
  wizardEditandoId = projeto?.id ?? null;
  const spec = (projeto as unknown as { spec?: Record<string, string> })?.spec ?? {};
  wizardDados = {
    nome: projeto?.nome ?? prefill?.nome ?? '',
    cliente: projeto?.cliente ?? prefill?.cliente ?? '',
    emoji: projeto?.emoji ?? '📦',
    tipo: projeto?.tipo ?? 'entrega',
    valorContratoBRL: projeto?.valorContratoBRL ?? prefill?.valor ?? 0,
    forma: (projeto as unknown as { pagamento?: { forma: 'avista' | 'parcelado' } })?.pagamento?.forma ?? 'avista',
    parcelas: (projeto as unknown as { pagamento?: { parcelas?: number } })?.pagamento?.parcelas ?? 2,
    entradaBRL: (projeto as unknown as { pagamento?: { entradaBRL?: number } })?.pagamento?.entradaBRL ?? 0,
    prazoDias: projeto?.prazoDias ?? 7,
    funcionarioId: projeto?.funcionarioId ?? '',
    objetivo: spec.objetivo ?? '',
    escopo: spec.escopo ?? '',
    foraDoEscopo: spec.foraDoEscopo ?? '',
    requisitosTecnicos: spec.requisitosTecnicos ?? '',
    designReferencias: spec.designReferencias ?? '',
    entregaveis: spec.entregaveis ?? '',
    criteriosAceite: spec.criteriosAceite ?? '',
    observacoes: spec.observacoes ?? '',
    repoUrl: (projeto as unknown as { repoUrl?: string })?.repoUrl ?? '',
    branch: (projeto as unknown as { branch?: string })?.branch ?? '',
    qaAtivo: projeto?.qaAtivo ?? true,
    abrirPR: projeto?.abrirPR ?? true,
  };
  wizardPasso = 1;
  $('#wizardTitulo').textContent = projeto ? `✏️ Editar ${projeto.nome}` : '📋 Novo projeto';
  renderWizard();
  $('#modalWizard').classList.remove('hidden');
}

function renderWizard(): void {
  $('#wizardPassos').innerHTML = PASSOS.map(
    (r, i) => `<span class="${i + 1 === wizardPasso ? 'ativo' : ''}">${r}</span>`,
  ).join('');
  $('#wizardErro').textContent = '';
  ($('#wizardVoltar') as HTMLButtonElement).style.visibility = wizardPasso === 1 ? 'hidden' : 'visible';
  $('#wizardAvancar').textContent = wizardPasso === 4 ? '✅ Salvar rascunho' : 'Avançar →';

  const d = wizardDados;
  const corpo = $('#wizardCorpo');
  if (wizardPasso === 1) {
    const funcionarios = snap()?.funcionarios.filter((f) => f.status === 'ativo') ?? [];
    corpo.innerHTML = `
      <div class="wizard-linha">
        <div><label>Nome do projeto</label><input type="text" id="wNome" maxlength="80" value="${esc(d.nome)}" /></div>
        <div><label>Cliente</label><input type="text" id="wCliente" maxlength="80" value="${esc(d.cliente)}" /></div>
      </div>
      <div class="wizard-linha">
        <div><label>Emoji</label><input type="text" id="wEmoji" maxlength="4" value="${esc(d.emoji)}" /></div>
        <div><label>Tipo</label><select id="wTipo">
          <option value="entrega" ${d.tipo === 'entrega' ? 'selected' : ''}>📦 Entrega (arquivos/documentos)</option>
          <option value="codigo" ${d.tipo === 'codigo' ? 'selected' : ''}>💻 Código (repositório GitHub)</option>
        </select></div>
      </div>
      <div class="wizard-linha">
        <div><label>Valor do contrato (R$)</label><input type="number" id="wValor" min="1" value="${d.valorContratoBRL || ''}" /></div>
        <div><label>Prazo (dias)</label><input type="number" id="wPrazo" min="1" max="365" value="${d.prazoDias}" /></div>
      </div>
      <div class="wizard-linha">
        <div><label>Forma de pagamento</label><select id="wForma">
          <option value="avista" ${d.forma === 'avista' ? 'selected' : ''}>À vista (na entrega)</option>
          <option value="parcelado" ${d.forma === 'parcelado' ? 'selected' : ''}>Entrada + parcelas mensais</option>
        </select></div>
        <div id="wParcelasCampo" style="${d.forma === 'parcelado' ? '' : 'display:none'}">
          <label>Parcelas / entrada (R$)</label>
          <div class="wizard-linha">
            <input type="number" id="wParcelas" min="1" max="48" value="${d.parcelas}" />
            <input type="number" id="wEntrada" min="0" value="${d.entradaBRL}" />
          </div>
        </div>
      </div>
      <label>Responsável (funcionário ou time)</label>
      <select id="wFuncionario">
        <option value="">— escolha —</option>
        ${funcionarios.map((f) => `<option value="${f.id}" ${d.funcionarioId === f.id ? 'selected' : ''}>${esc(f.nome)} (${CARGOS[f.cargoVisual] ?? f.cargoVisual})</option>`).join('')}
        ${
          timesAtivos().length
            ? `<optgroup label="Times (o coordenador do time delega)">${timesAtivos()
                .map(
                  (t) =>
                    `<option value="${PREFIXO_TIME}${t.id}" ${d.funcionarioId === `${PREFIXO_TIME}${t.id}` ? 'selected' : ''}>${esc(t.emoji)} Time ${esc(t.nome)} (${t.membros.length} membro${t.membros.length > 1 ? 's' : ''})</option>`,
                )
                .join('')}</optgroup>`
            : ''
        }
        ${funcionarios.length ? `<option value="equipe" ${d.funcionarioId === 'equipe' ? 'selected' : ''}>👥 Equipe toda — o Gerente de IA delega as tarefas</option>` : ''}
      </select>
      ${funcionarios.length ? '' : '<p class="modal-hint">⚠️ Contrate um funcionário na aba Equipe antes.</p>'}`;
    $('#wForma').addEventListener('change', () => {
      $('#wParcelasCampo').style.display =
        ($('#wForma') as HTMLSelectElement).value === 'parcelado' ? '' : 'none';
    });
  } else if (wizardPasso === 2) {
    corpo.innerHTML = `
      <label>Objetivo — o que o projeto resolve e para quem</label>
      <textarea id="wObjetivo">${esc(d.objetivo)}</textarea>
      <label>Escopo / funcionalidades (uma por linha)</label>
      <textarea id="wEscopo">${esc(d.escopo)}</textarea>
      <label>Fora do escopo (opcional)</label>
      <textarea id="wFora">${esc(d.foraDoEscopo)}</textarea>
      <label>Requisitos técnicos — stack, integrações, restrições (opcional)</label>
      <textarea id="wReq">${esc(d.requisitosTecnicos)}</textarea>
      <label>Design / referências — identidade visual, links (opcional)</label>
      <textarea id="wDesign">${esc(d.designReferencias)}</textarea>`;
  } else if (wizardPasso === 3) {
    corpo.innerHTML = `
      <label>Entregáveis exatos</label>
      <textarea id="wEntregaveis">${esc(d.entregaveis)}</textarea>
      <label>Critérios de aceite (um por linha — viram o checklist da revisão e a rubrica do QA)</label>
      <textarea id="wCriterios">${esc(d.criteriosAceite)}</textarea>
      <label>Observações (opcional)</label>
      <textarea id="wObs">${esc(d.observacoes)}</textarea>
      <div class="wizard-checks solo" style="margin-top:6px">
        <label><input type="checkbox" id="wQa" ${d.qaAtivo ? 'checked' : ''} /> 🔎 QA automático — um revisor independente avalia contra os critérios de aceite (até 3 rodadas) antes de te entregar. Consome um pouco mais de API.</label>
      </div>
      <div id="wRepoCampos" style="${d.tipo === 'codigo' ? '' : 'display:none'}">
        <label>Repositório GitHub (https://github.com/…)</label>
        <input type="text" id="wRepo" value="${esc(d.repoUrl)}" placeholder="https://github.com/voce/projeto" />
        <label>Branch de trabalho</label>
        <input type="text" id="wBranch" value="${esc(d.branch)}" placeholder="main" />
        <div class="wizard-checks solo">
          <label><input type="checkbox" id="wPr" ${d.abrirPR ? 'checked' : ''} /> 🔀 Abrir Pull Request real ao final (em vez de só dar push na branch)</label>
        </div>
      </div>`;
  } else {
    const custoEstimado = estimarCusto(d.tipo);
    corpo.innerHTML = `
      <p class="pr-sub">É exatamente isso que o funcionário vai receber:</p>
      <div class="wizard-preview">${esc(montarPreview(d))}</div>
      <div class="pr-metricas" style="margin-top:10px">
        <span>💰 contrato <b>${brl(d.valorContratoBRL)}</b></span>
        <span>👤 <b>${esc(nomeFuncionario(d.funcionarioId))}</b></span>
        <span>🔌 custo de API estimado <b>${custoEstimado}</b></span>
        <span>${d.qaAtivo ? '🔎 <b>com QA automático</b>' : 'sem QA automático'}</span>
        ${d.tipo === 'codigo' && d.abrirPR ? '<span>🔀 <b>abre Pull Request</b></span>' : ''}
      </div>`;
  }
}

function montarPreview(d: DadosWizard): string {
  const linhas = [
    `# Projeto: ${d.emoji} ${d.nome}`,
    `Cliente: ${d.cliente} · Tipo: ${d.tipo === 'codigo' ? 'CÓDIGO' : 'ENTREGA'} · Prazo: ${d.prazoDias} dias`,
    `\n## Objetivo\n${d.objetivo}`,
    `\n## Escopo / funcionalidades\n${d.escopo}`,
  ];
  if (d.foraDoEscopo) linhas.push(`\n## Fora do escopo\n${d.foraDoEscopo}`);
  if (d.requisitosTecnicos) linhas.push(`\n## Requisitos técnicos\n${d.requisitosTecnicos}`);
  if (d.designReferencias) linhas.push(`\n## Design / referências\n${d.designReferencias}`);
  linhas.push(`\n## Entregáveis\n${d.entregaveis}`);
  linhas.push(`\n## Critérios de aceite\n${d.criteriosAceite}`);
  if (d.observacoes) linhas.push(`\n## Observações\n${d.observacoes}`);
  if (d.tipo === 'codigo') linhas.push(`\n## Repositório\n${d.repoUrl} (branch ${d.branch || 'main'})`);
  return linhas.join('\n');
}

function estimarCusto(tipo: 'codigo' | 'entrega'): string {
  const historico = snap()?.projetos.filter((p) => p.status === 'entregue' && p.tipo === tipo && p.custoUSD > 0) ?? [];
  if (!historico.length) return 'sem histórico ainda';
  const media = historico.reduce((s, p) => s + p.custoUSD, 0) / historico.length;
  const c = cambio();
  return `${brlCentavos(media * 0.6 * c)} – ${brlCentavos(media * 1.6 * c)}`;
}

function colherPasso(): string | null {
  const d = wizardDados;
  const v = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
  if (wizardPasso === 1) {
    d.nome = v('wNome').trim();
    d.cliente = v('wCliente').trim();
    d.emoji = v('wEmoji').trim() || '📦';
    d.tipo = v('wTipo') as 'codigo' | 'entrega';
    d.valorContratoBRL = Number(v('wValor'));
    d.prazoDias = Number(v('wPrazo'));
    d.forma = v('wForma') as 'avista' | 'parcelado';
    d.parcelas = Number(v('wParcelas')) || 2;
    d.entradaBRL = Number(v('wEntrada')) || 0;
    d.funcionarioId = v('wFuncionario');
    if (!d.nome || !d.cliente) return 'Preencha nome e cliente.';
    if (!(d.valorContratoBRL > 0)) return 'Informe o valor do contrato.';
    if (!(d.prazoDias >= 1)) return 'Informe o prazo em dias.';
    if (!d.funcionarioId) return 'Escolha o funcionário responsável.';
    if (d.forma === 'parcelado' && d.entradaBRL >= d.valorContratoBRL) return 'A entrada precisa ser menor que o contrato.';
  } else if (wizardPasso === 2) {
    d.objetivo = v('wObjetivo').trim();
    d.escopo = v('wEscopo').trim();
    d.foraDoEscopo = v('wFora').trim();
    d.requisitosTecnicos = v('wReq').trim();
    d.designReferencias = v('wDesign').trim();
    if (!d.objetivo || !d.escopo) return 'Objetivo e escopo são obrigatórios — é a spec que o agente recebe.';
  } else if (wizardPasso === 3) {
    d.entregaveis = v('wEntregaveis').trim();
    d.criteriosAceite = v('wCriterios').trim();
    d.observacoes = v('wObs').trim();
    d.repoUrl = v('wRepo').trim();
    d.branch = v('wBranch').trim();
    d.qaAtivo = (document.getElementById('wQa') as HTMLInputElement | null)?.checked ?? true;
    d.abrirPR = (document.getElementById('wPr') as HTMLInputElement | null)?.checked ?? true;
    if (!d.entregaveis || !d.criteriosAceite) return 'Entregáveis e critérios de aceite são obrigatórios.';
    if (d.tipo === 'codigo' && !d.repoUrl.startsWith('https://github.com/')) return 'Projeto de código exige o repositório do GitHub.';
  }
  return null;
}

async function avancarWizard(): Promise<void> {
  const erro = colherPasso();
  if (erro) {
    $('#wizardErro').textContent = `⚠️ ${erro}`;
    return;
  }
  if (wizardPasso < 4) {
    wizardPasso += 1;
    renderWizard();
    return;
  }
  const d = wizardDados;
  const corpo = {
    nome: d.nome,
    cliente: d.cliente,
    emoji: d.emoji,
    tipo: d.tipo,
    valorContratoBRL: d.valorContratoBRL,
    prazoDias: d.prazoDias,
    funcionarioId: d.funcionarioId,
    pagamento:
      d.forma === 'avista'
        ? { forma: 'avista' as const }
        : { forma: 'parcelado' as const, parcelas: d.parcelas, ...(d.entradaBRL > 0 ? { entradaBRL: d.entradaBRL } : {}) },
    spec: {
      objetivo: d.objetivo,
      escopo: d.escopo,
      ...(d.foraDoEscopo ? { foraDoEscopo: d.foraDoEscopo } : {}),
      ...(d.requisitosTecnicos ? { requisitosTecnicos: d.requisitosTecnicos } : {}),
      ...(d.designReferencias ? { designReferencias: d.designReferencias } : {}),
      entregaveis: d.entregaveis,
      criteriosAceite: d.criteriosAceite,
      ...(d.observacoes ? { observacoes: d.observacoes } : {}),
    },
    qaAtivo: d.qaAtivo,
    ...(d.tipo === 'codigo' ? { repoUrl: d.repoUrl, branch: d.branch || 'main', abrirPR: d.abrirPR } : {}),
  };
  $('#wizardErro').textContent = 'Salvando…';
  try {
    if (wizardEditandoId) await api.atualizarProjeto(wizardEditandoId, corpo);
    else await api.criarProjeto(corpo);
    $('#modalWizard').classList.add('hidden');
    toast(`📋 ${d.nome} salvo como rascunho — é só Iniciar quando quiser.`, 'good');
  } catch (erroSalvar) {
    $('#wizardErro').textContent = `⚠️ ${(erroSalvar as Error).message}`;
  }
}

// ---------- modal de atividade + chat ----------

let atividadeAberta: string | null = null;

function linhaAtividade(e: EntradaAtividadeReal): string {
  const hora = new Date(e.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `<div class="atv-linha tipo-${e.tipo}"><span class="hora">${hora}</span>${esc(e.texto)}</div>`;
}

async function abrirAtividade(projetoId: string): Promise<void> {
  const projeto = snap()?.projetos.find((p) => p.id === projetoId);
  if (!projeto) return;
  atividadeAberta = projetoId;
  $('#atvTitulo').textContent = `📡 ${projeto.emoji} ${projeto.nome} — ${nomeFuncionario(projeto.funcionarioId)}`;
  $('#atvRetomar').classList.toggle(
    'hidden',
    !['pausado', 'aguardando_revisao'].includes(projeto.status),
  );
  $('#atvLog').innerHTML = '<div class="atv-linha">carregando…</div>';
  $('#atvLinhaTempo').innerHTML = '';
  $('#modalAtividade').classList.remove('hidden');
  try {
    const entradas = await api.obterAtividade(projetoId, 300);
    $('#atvLinhaTempo').innerHTML = montarLinhaTempo(entradas, projeto); // backlog 9
    $('#atvLog').innerHTML = entradas.map(linhaAtividade).join('') || '<div class="atv-linha">sem atividade ainda.</div>';
    $('#atvLog').scrollTop = $('#atvLog').scrollHeight;
  } catch (erro) {
    $('#atvLog').innerHTML = `<div class="atv-linha tipo-sistema">⚠️ ${esc((erro as Error).message)}</div>`;
  }
}

async function enviarMensagemAtividade(comoRetomar: boolean): Promise<void> {
  if (!atividadeAberta) return;
  const campo = $('#atvMensagem') as HTMLInputElement;
  const texto = campo.value.trim();
  try {
    if (comoRetomar) {
      await api.retomarProjeto(atividadeAberta, texto || undefined);
      toast('▶️ Projeto retomado.', 'good');
      $('#atvRetomar').classList.add('hidden');
    } else {
      if (!texto) return;
      await api.enviarMensagemProjeto(atividadeAberta, texto);
    }
    campo.value = '';
  } catch (erro) {
    toast(`⚠️ ${(erro as Error).message}`, 'bad');
  }
}

// ---------- financeiro (substitui a aba Empresa) ----------

type SubAba = 'visao' | 'vendas' | 'crm' | 'contas' | 'custos' | 'relatorios' | 'livro';
let subAbaAtual: SubAba = 'visao';

const SUB_ABAS: { id: SubAba; rotulo: string }[] = [
  { id: 'visao', rotulo: '📊 Visão geral' },
  { id: 'vendas', rotulo: '🧾 Vendas' },
  { id: 'crm', rotulo: '🧲 CRM' },
  { id: 'contas', rotulo: '💳 A receber' },
  { id: 'custos', rotulo: '📉 Custos' },
  { id: 'relatorios', rotulo: '📈 Relatórios' },
  { id: 'livro', rotulo: '📚 Livro-razão' },
];

function moldeFinanceiro(): void {
  $('#realFinanceiro').innerHTML = `
    <div class="pr-topo"><h3>💰 Financeiro</h3>
      <button class="btn" id="btnModoTv" title="Dashboard de parede — KPIs ao vivo em tela cheia">📺 Modo TV</button></div>
    <div class="fin-abas">${SUB_ABAS.map(
      (a) => `<button class="fin-aba ${a.id === subAbaAtual ? 'ativa' : ''}" data-fin="${a.id}">${a.rotulo}<span data-badge="${a.id}"></span></button>`,
    ).join('')}</div>
    <div id="finCorpo"><p class="pr-sub">carregando…</p></div>`;
}

// ---------- Modo TV (backlog 8): dashboard de parede em tela cheia ----------

let tvAberto = false;
let tvRelogio: number | null = null;

function tvKpi(rotulo: string, valor: string, classe = ''): string {
  return `<div class="tv-kpi"><div class="rotulo">${rotulo}</div><div class="valor ${classe}">${valor}</div></div>`;
}

function renderTv(): void {
  if (!tvAberto) return;
  const alvo = document.getElementById('tvConteudo');
  if (!alvo) return;
  const s = snap();
  if (!s) {
    alvo.innerHTML = '<p class="pr-sub">conectando à ponte…</p>';
    return;
  }
  const f = s.financeiro;
  const meta = s.config.metaMensalBRL ?? 0;
  const pctMeta = meta > 0 ? Math.min(100, Math.round((f.vendasMesBRL / meta) * 100)) : 0;
  const custoHoje =
    s.funcionarios.filter((x) => x.status === 'ativo').reduce((soma, x) => soma + x.custoHojeUSD, 0) *
    (s.config.cambioUsdBrl ?? 5.4);
  const abertos = s.projetos.filter((p) => ['em_andamento', 'pausado', 'aguardando_revisao'].includes(p.status));
  const agora = new Date();
  const manchete = s.standups?.[0]?.texto.split('\n').find((l) => l.trim()) ?? '';
  alvo.innerHTML = `
    <div class="tv-topo">
      <span class="tv-hora">${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      <span class="tv-titulo">🏢 Empresa Real</span>
      <span class="tv-data">${agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
    </div>
    <div class="tv-kpis">
      ${tvKpi('Caixa', brlCentavos(f.caixaBRL), f.caixaBRL >= 0 ? 'pos' : 'neg')}
      ${tvKpi('A receber', brlCentavos(f.totalAReceberBRL), f.atrasadasBRL > 0 ? 'neg' : '')}
      ${tvKpi('Vendas no mês', brlCentavos(f.vendasMesBRL), 'pos')}
      ${tvKpi('API hoje', brlCentavos(custoHoje), custoHoje > 0 ? 'neg' : '')}
    </div>
    ${
      meta > 0
        ? `<div class="tv-meta"><span>🎯 Meta do mês</span><div class="pr-barra"><div style="width:${pctMeta}%"></div></div><b>${pctMeta}%</b></div>`
        : ''
    }
    <div class="tv-projetos">
      ${
        abertos
          .map((p) => {
            const pct = p.etapasTotais ? Math.round((p.etapasConcluidas / p.etapasTotais) * 100) : 0;
            return `<div class="tv-projeto">
              <div class="tv-projeto-nome">${esc(p.emoji)} ${esc(p.nome)} <small>👤 ${esc(nomeFuncionario(p.funcionarioId))}</small></div>
              <div class="pr-barra"><div style="width:${pct}%"></div></div>
              <div class="tv-projeto-sub">${p.etapasTotais ? `${p.etapasConcluidas}/${p.etapasTotais}` : 'planejando'} — ${esc((p.resumoAtual || '…').slice(0, 80))}</div>
            </div>`;
          })
          .join('') || '<p class="pr-sub">nenhum projeto em produção agora</p>'
      }
    </div>
    ${manchete ? `<div class="tv-standup">📋 ${esc(manchete.slice(0, 160))}</div>` : ''}`;
}

function abrirTv(): void {
  tvAberto = true;
  $('#modoTv').classList.remove('hidden');
  renderTv();
  tvRelogio = window.setInterval(renderTv, 30_000); // relógio e prazos se mantêm vivos
}

function fecharTv(): void {
  tvAberto = false;
  $('#modoTv').classList.add('hidden');
  if (tvRelogio != null) {
    clearInterval(tvRelogio);
    tvRelogio = null;
  }
}

async function renderFinanceiro(): Promise<void> {
  const corpo = document.getElementById('finCorpo');
  if (!corpo) return;
  try {
    if (subAbaAtual === 'visao') {
      const r = (await api.financeiroResumo()) as Record<string, number>;
      const card = (rotulo: string, valor: number, classe = '') =>
        `<div class="fin-card"><div class="rotulo">${rotulo}</div><div class="valor ${classe}">${brlCentavos(valor)}</div></div>`;
      // 🎯 meta de vendas do mês (backlog 6) — barra + sino/comemoração ao bater
      const meta = snap()?.config.metaMensalBRL ?? 0;
      const vendasMes = r.vendasMesBRL ?? 0;
      const pctMeta = meta > 0 ? Math.min(100, Math.round((vendasMes / meta) * 100)) : 0;
      const cardMeta = `<div class="fin-card fin-meta">
        <div class="rotulo">🎯 Meta de vendas do mês${meta > 0 && vendasMes >= meta ? ' — BATIDA! 🎉' : ''}</div>
        ${
          meta > 0
            ? `<div class="fin-meta-linha"><div class="pr-barra"><div style="width:${pctMeta}%"></div></div><b>${pctMeta}%</b></div>
               <div class="fin-meta-numeros">${brlCentavos(vendasMes)} de ${brlCentavos(meta)}</div>`
            : '<div class="fin-meta-numeros">sem meta definida — defina uma e o escritório comemora quando bater 🎉</div>'
        }
        <button class="btn" data-meta-editar style="margin-top:6px;padding:4px 9px;font-size:.75rem">🎯 ${meta > 0 ? 'Ajustar' : 'Definir'} meta</button>
      </div>`;
      corpo.innerHTML = `<div class="fin-cards">
        ${cardMeta}
        ${card('Caixa', r.caixaBRL!, r.caixaBRL! >= 0 ? 'pos' : 'neg')}
        ${card('A receber', r.totalAReceberBRL!)}
        ${card('Atrasadas', r.atrasadasBRL!, r.atrasadasBRL! > 0 ? 'neg' : '')}
        ${card('Vencendo em 7 dias', r.vencendo7DiasBRL!)}
        ${card('Vendas no mês', r.vendasMesBRL!)}
        ${card('Recebido no mês', r.recebidoMesBRL!, 'pos')}
        ${card('Custo de API no mês', r.custoApiMesBRL!, r.custoApiMesBRL! > 0 ? 'neg' : '')}
        ${card('Custos fixos no mês', r.custosFixosMesBRL!, r.custosFixosMesBRL! > 0 ? 'neg' : '')}
        ${card('Lucro do mês', r.lucroMesBRL!, r.lucroMesBRL! >= 0 ? 'pos' : 'neg')}
      </div>`;
    } else if (subAbaAtual === 'vendas') {
      const r = (await api.relatorioVendas()) as {
        totalBRL: number;
        quantidade: number;
        ticketMedioBRL: number;
        porCliente: { cliente: string; totalBRL: number; quantidade: number }[];
      };
      corpo.innerHTML = `<div class="fin-cards">
          <div class="fin-card"><div class="rotulo">Total vendido</div><div class="valor pos">${brlCentavos(r.totalBRL)}</div></div>
          <div class="fin-card"><div class="rotulo">Contratos</div><div class="valor">${r.quantidade}</div></div>
          <div class="fin-card"><div class="rotulo">Ticket médio</div><div class="valor">${brlCentavos(r.ticketMedioBRL)}</div></div>
        </div>
        <table class="fin-tabela" style="margin-top:10px"><tr><th>Cliente</th><th class="num">Contratos</th><th class="num">Total</th></tr>
        ${r.porCliente.map((c) => `<tr><td>${esc(c.cliente)}</td><td class="num">${c.quantidade}</td><td class="num">${brlCentavos(c.totalBRL)}</td></tr>`).join('') || '<tr><td colspan="3">sem vendas ainda</td></tr>'}
        </table>`;
    } else if (subAbaAtual === 'crm') {
      // CRM leve (backlog 7): funil lead → proposta → fechado + clientes com LTV real
      const s = snap();
      const clientes = s?.crm?.clientes ?? [];
      const oportunidades = s?.crm?.oportunidades ?? [];
      const projetos = s?.projetos ?? [];
      const nomeCliente = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '?';
      const ETAPAS: { id: OportunidadeCRMReal['etapa']; rotulo: string }[] = [
        { id: 'lead', rotulo: '🧲 Leads' },
        { id: 'proposta', rotulo: '📄 Proposta enviada' },
        { id: 'fechado', rotulo: '✅ Fechados' },
        { id: 'perdido', rotulo: '❌ Perdidos' },
      ];
      const emAberto = oportunidades.filter((o) => o.etapa === 'lead' || o.etapa === 'proposta');
      const totalFunil = emAberto.reduce((soma, o) => soma + o.valorEstimadoBRL, 0);

      const cardOpp = (o: OportunidadeCRMReal): string => {
        const b = (rotulo: string, attrs: string, classe = 'btn') =>
          `<button class="btn ${classe}" style="padding:4px 9px;font-size:.75rem" ${attrs}>${rotulo}</button>`;
        const acoes: string[] = [];
        // proposta em PDF pelo agente comercial (backlog 3)
        if (o.etapa === 'lead' || o.etapa === 'proposta') {
          if (o.proposta?.status === 'gerando') {
            acoes.push('<span class="pr-chip qa">🤖 gerando proposta…</span>');
          } else {
            acoes.push(b(o.proposta?.status === 'pronta' ? '🔁 Regerar proposta' : '🤖 Gerar proposta (PDF)', `data-opp-gerar="${o.id}"`));
          }
        }
        if (o.etapa === 'lead') acoes.push(b('📄 Mandei proposta', `data-opp-etapa="proposta" data-id="${o.id}"`));
        if (o.etapa === 'proposta') acoes.push(b('✅ Fechou!', `data-opp-etapa="fechado" data-id="${o.id}"`, 'btn-primary'));
        if (o.etapa === 'lead' || o.etapa === 'proposta') acoes.push(b('❌ Perdi', `data-opp-etapa="perdido" data-id="${o.id}"`));
        if (o.etapa === 'fechado') acoes.push(b('📋 Virar projeto', `data-opp-projeto="${o.id}"`, 'btn-accent'));
        if (o.etapa === 'perdido') {
          acoes.push(b('🔁 Reabrir', `data-opp-etapa="lead" data-id="${o.id}"`), b('🗑', `data-opp-excluir="${o.id}"`));
        }
        const arquivosProposta =
          o.proposta?.status === 'pronta' && o.proposta.arquivos.length
            ? `<div class="crm-proposta">📎 ${o.proposta.arquivos
                .map((n) => `<a class="pr-link" href="/api/crm/oportunidades/${o.id}/proposta/${encodeURIComponent(n)}">${esc(n)}</a>`)
                .join(' · ')}</div>`
            : o.proposta?.status === 'falhou'
              ? `<div class="crm-proposta pr-sub-inline">⚠️ proposta falhou: ${esc(o.proposta.erro ?? 'erro')}</div>`
              : '';
        return `<div class="crm-opp">
          <div><b>${esc(o.titulo)}</b> <span class="pr-sub-inline">· ${esc(nomeCliente(o.clienteId))} · ${brlCentavos(o.valorEstimadoBRL)}</span>${arquivosProposta}</div>
          <div class="pr-acoes">${acoes.join('')}</div>
        </div>`;
      };

      const linhaCliente = (c: ClienteCRMReal): string => {
        const dele = projetos.filter((p) => p.cliente.trim().toLowerCase() === c.nome.trim().toLowerCase());
        const vendidos = dele.filter((p) => p.status !== 'rascunho');
        const ltv = vendidos.reduce((soma, p) => soma + p.valorContratoBRL, 0);
        const entregues = dele.filter((p) => p.status === 'entregue').length;
        const noFunil = oportunidades.filter(
          (o) => o.clienteId === c.id && (o.etapa === 'lead' || o.etapa === 'proposta'),
        ).length;
        return `<tr><td>${esc(c.nome)}${c.origem ? `<br /><small class="pr-sub-inline">via ${esc(c.origem)}</small>` : ''}</td>
          <td>${esc(c.contato ?? '—')}</td>
          <td class="num">${vendidos.length}${entregues ? ` (${entregues}✅)` : ''}</td>
          <td class="num">${brlCentavos(ltv)}</td>
          <td class="num">${noFunil || '—'}</td></tr>`;
      };

      corpo.innerHTML = `
        <div class="fin-cards">
          <div class="fin-card"><div class="rotulo">💼 No funil (em aberto)</div><div class="valor">${brlCentavos(totalFunil)}</div></div>
          <div class="fin-card"><div class="rotulo">Oportunidades / clientes</div><div class="valor">${emAberto.length} / ${clientes.length}</div></div>
        </div>
        ${ETAPAS.map((e) => {
          const da = oportunidades.filter((o) => o.etapa === e.id);
          return `<div class="pr-secao">${e.rotulo} (${da.length})</div>${da.map(cardOpp).join('') || '<p class="pr-sub">vazio</p>'}`;
        }).join('')}
        <div class="pr-secao" style="margin-top:14px">Nova oportunidade</div>
        ${
          clientes.length
            ? `<div class="wizard-corpo"><div class="wizard-linha">
                <div><label>Cliente</label><select id="oppCliente">${clientes.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
                <div><label>Valor estimado (R$)</label><input type="number" id="oppValor" min="0" /></div>
              </div>
              <label>O que é (ex.: "Site institucional + blog")</label><input type="text" id="oppTitulo" maxlength="120" />
              <div class="pr-acoes" style="margin-top:8px"><button class="btn btn-primary" id="oppSalvar">➕ Entrar no funil</button></div></div>`
            : '<p class="pr-sub">cadastre um cliente primeiro 👇</p>'
        }
        <div class="pr-secao" style="margin-top:14px">Clientes (${clientes.length})</div>
        <table class="fin-tabela"><tr><th>Cliente</th><th>Contato</th><th class="num">Projetos</th><th class="num">LTV</th><th class="num">Funil</th></tr>
        ${clientes.map(linhaCliente).join('') || '<tr><td colspan="5">nenhum cliente ainda</td></tr>'}</table>
        <div class="pr-secao" style="margin-top:14px">Novo cliente</div>
        <div class="wizard-corpo"><div class="wizard-linha">
          <div><label>Nome</label><input type="text" id="cliNome" maxlength="80" /></div>
          <div><label>Contato (e-mail / whats)</label><input type="text" id="cliContato" maxlength="160" /></div>
        </div>
        <label>Origem (indicação, site, instagram…)</label><input type="text" id="cliOrigem" maxlength="80" />
        <div class="pr-acoes" style="margin-top:8px"><button class="btn btn-primary" id="cliSalvar">➕ Cadastrar cliente</button></div></div>`;

      document.getElementById('cliSalvar')?.addEventListener('click', () => {
        void (async () => {
          try {
            const nome = (document.getElementById('cliNome') as HTMLInputElement).value.trim();
            if (!nome) {
              toast('⚠️ Dê um nome ao cliente.', 'bad');
              return;
            }
            const contato = (document.getElementById('cliContato') as HTMLInputElement).value.trim();
            const origem = (document.getElementById('cliOrigem') as HTMLInputElement).value.trim();
            await api.criarClienteCrm({ nome, ...(contato ? { contato } : {}), ...(origem ? { origem } : {}) });
            toast(`🤝 ${nome} no CRM!`, 'good');
            void renderFinanceiro();
          } catch (erro) {
            toast(`⚠️ ${(erro as Error).message}`, 'bad');
          }
        })();
      });
      document.getElementById('oppSalvar')?.addEventListener('click', () => {
        void (async () => {
          try {
            const titulo = (document.getElementById('oppTitulo') as HTMLInputElement).value.trim();
            const valor = Number((document.getElementById('oppValor') as HTMLInputElement).value);
            if (!titulo || !(valor >= 0)) {
              toast('⚠️ Preencha o título e o valor estimado.', 'bad');
              return;
            }
            await api.criarOportunidade({
              clienteId: (document.getElementById('oppCliente') as HTMLSelectElement).value,
              titulo,
              valorEstimadoBRL: valor,
            });
            toast('🧲 Oportunidade no funil!', 'good');
            void renderFinanceiro();
          } catch (erro) {
            toast(`⚠️ ${(erro as Error).message}`, 'bad');
          }
        })();
      });
    } else if (subAbaAtual === 'contas') {
      const contas = (await api.listarContas()) as {
        id: string; descricao: string; valorBRL: number; vencimento: string; status: string;
      }[];
      const abertas = contas.filter((c) => c.status !== 'recebida');
      const recebidas = contas.filter((c) => c.status === 'recebida');
      const linha = (c: (typeof contas)[0]) => `<tr>
        <td>${esc(c.descricao)} ${c.status === 'atrasada' ? '<span class="pr-badge atrasada">atrasada</span>' : ''}</td>
        <td class="num">${c.vencimento.split('-').reverse().join('/')}</td>
        <td class="num">${brlCentavos(c.valorBRL)}</td>
        <td class="num">${c.status === 'recebida' ? '✅' : `<button class="btn btn-primary" style="padding:4px 9px;font-size:.75rem" data-receber="${c.id}">Receber</button>`}</td></tr>`;
      corpo.innerHTML = `<table class="fin-tabela"><tr><th>Conta</th><th class="num">Vencimento</th><th class="num">Valor</th><th class="num"></th></tr>
        ${abertas.map(linha).join('') || '<tr><td colspan="4">nada em aberto 🎉</td></tr>'}
        ${recebidas.length ? `<tr><th colspan="4" style="padding-top:12px">Recebidas</th></tr>${recebidas.map(linha).join('')}` : ''}</table>`;
    } else if (subAbaAtual === 'custos') {
      const custos = (await api.listarCustosFixos()) as {
        id: string; nome: string; categoria: string; valorBRL: number; recorrencia: string; diaVencimento: number; ativo: boolean;
      }[];
      const porFuncionario = (await api.relatorioFuncionarios()) as { nome: string; custoApiBRL: number }[];
      corpo.innerHTML = `
        <div class="pr-secao">Custos fixos (lançados no vencimento, automático)</div>
        <table class="fin-tabela"><tr><th>Nome</th><th>Recorrência</th><th class="num">Valor</th><th class="num"></th></tr>
        ${custos.map((c) => `<tr><td>${esc(c.nome)} ${c.ativo ? '' : '<span class="pr-badge entregue">inativo</span>'}</td>
          <td>${c.recorrencia} (dia ${c.diaVencimento})</td><td class="num">${brlCentavos(c.valorBRL)}</td>
          <td class="num"><button class="btn" style="padding:4px 8px;font-size:.72rem" data-custo-toggle="${c.id}" data-ativo="${c.ativo}">${c.ativo ? '⏸' : '▶️'}</button>
          <button class="btn" style="padding:4px 8px;font-size:.72rem" data-custo-excluir="${c.id}">🗑</button></td></tr>`).join('') || '<tr><td colspan="4">nenhum custo fixo</td></tr>'}
        </table>
        <div class="pr-secao" style="margin-top:14px">Novo custo fixo</div>
        <div class="wizard-corpo"><div class="wizard-linha">
          <div><label>Nome</label><input type="text" id="cfNome" placeholder="ex.: VPS Hetzner" /></div>
          <div><label>Categoria</label><select id="cfCategoria">
            <option value="servidor">Servidor</option><option value="ferramenta">Ferramenta</option>
            <option value="imposto">Imposto</option><option value="outro">Outro</option></select></div>
        </div><div class="wizard-linha">
          <div><label>Valor (R$)</label><input type="number" id="cfValor" min="1" /></div>
          <div><label>Recorrência / dia do vencimento</label><div class="wizard-linha">
            <select id="cfRecorrencia"><option value="mensal">Mensal</option><option value="anual">Anual</option></select>
            <input type="number" id="cfDia" min="1" max="28" value="5" /></div></div>
        </div>
        <div class="pr-acoes" style="margin-top:8px"><button class="btn btn-primary" id="cfSalvar">➕ Adicionar</button></div></div>
        <div class="pr-secao" style="margin-top:14px">Custo de API por funcionário</div>
        <table class="fin-tabela"><tr><th>Funcionário</th><th class="num">Total em R$</th></tr>
        ${porFuncionario.map((f) => `<tr><td>${esc(f.nome)}</td><td class="num">${brlCentavos(f.custoApiBRL)}</td></tr>`).join('')}</table>`;
      document.getElementById('cfSalvar')?.addEventListener('click', () => {
        void (async () => {
          try {
            await api.criarCustoFixo({
              nome: (document.getElementById('cfNome') as HTMLInputElement).value.trim(),
              categoria: (document.getElementById('cfCategoria') as HTMLSelectElement).value,
              valorBRL: Number((document.getElementById('cfValor') as HTMLInputElement).value),
              recorrencia: (document.getElementById('cfRecorrencia') as HTMLSelectElement).value,
              diaVencimento: Number((document.getElementById('cfDia') as HTMLInputElement).value),
              ativo: true,
            });
            toast('➕ Custo fixo cadastrado.', 'good');
            void renderFinanceiro();
          } catch (erro) {
            toast(`⚠️ ${(erro as Error).message}`, 'bad');
          }
        })();
      });
    } else if (subAbaAtual === 'relatorios') {
      const [fluxo, dre, margem] = await Promise.all([
        api.relatorioFluxo() as Promise<{ mes: string; entradasBRL: number; saidasBRL: number; saldoBRL: number }[]>,
        api.relatorioDre() as Promise<{ mes: string; receitaBRL: number; custoApiBRL: number; custosFixosBRL: number; lucroBRL: number }>,
        api.relatorioMargem() as Promise<{ nome: string; valorContratoBRL: number; custoApiBRL: number; margemBRL: number; margemPct: number }[]>,
      ]);
      const maior = Math.max(1, ...fluxo.map((m) => Math.max(m.entradasBRL, m.saidasBRL)));
      corpo.innerHTML = `
        <div class="pr-secao">Fluxo de caixa mensal</div>
        ${fluxo.map((m) => `<div class="fin-fluxo-linha"><span>${m.mes.slice(2).replace('-', '/')}</span>
          <div class="fin-fluxo-barra entrada" style="width:${(m.entradasBRL / maior) * 100}%" title="entradas ${brlCentavos(m.entradasBRL)}"></div>
          <div class="fin-fluxo-barra saida" style="width:${(m.saidasBRL / maior) * 100}%" title="saídas ${brlCentavos(m.saidasBRL)}"></div></div>`).join('') || '<p class="pr-sub">sem movimento ainda</p>'}
        <div class="pr-secao" style="margin-top:14px">DRE de ${dre.mes}</div>
        <table class="fin-tabela">
          <tr><td>Receita recebida</td><td class="num">${brlCentavos(dre.receitaBRL)}</td></tr>
          <tr><td>(−) Custo de API</td><td class="num">${brlCentavos(dre.custoApiBRL)}</td></tr>
          <tr><td>(−) Custos fixos</td><td class="num">${brlCentavos(dre.custosFixosBRL)}</td></tr>
          <tr><th>= Lucro</th><th class="num">${brlCentavos(dre.lucroBRL)}</th></tr></table>
        <div class="pr-secao" style="margin-top:14px">Margem por projeto (contrato − API)</div>
        <table class="fin-tabela"><tr><th>Projeto</th><th class="num">Contrato</th><th class="num">API</th><th class="num">Margem</th></tr>
        ${margem.map((m) => `<tr><td>${esc(m.nome)}</td><td class="num">${brlCentavos(m.valorContratoBRL)}</td>
          <td class="num">${brlCentavos(m.custoApiBRL)}</td><td class="num">${brlCentavos(m.margemBRL)} (${m.margemPct}%)</td></tr>`).join('') || '<tr><td colspan="4">sem projetos iniciados</td></tr>'}
        </table>`;
    } else {
      const lancamentos = (await api.financeiroLancamentos()) as {
        data: string; tipo: string; descricao: string; valorBRL: number;
      }[];
      corpo.innerHTML = `
        <div class="pr-acoes" style="margin-bottom:8px"><button class="btn" id="livroCsv">⬇️ Exportar CSV</button></div>
        <table class="fin-tabela"><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="num">Valor</th></tr>
        ${lancamentos.map((l) => `<tr><td>${l.data.split('-').reverse().join('/')}</td><td>${l.tipo}</td>
          <td>${esc(l.descricao)}</td><td class="num" style="color:${l.valorBRL < 0 ? '#e08a8a' : '#7fd4a0'}">${brlCentavos(l.valorBRL)}</td></tr>`).join('') || '<tr><td colspan="4">livro vazio</td></tr>'}
        </table>`;
      document.getElementById('livroCsv')?.addEventListener('click', () => {
        const csv = ['data;tipo;descricao;valorBRL']
          .concat(lancamentos.map((l) => `${l.data};${l.tipo};"${l.descricao.replace(/"/g, "'")}";${l.valorBRL.toFixed(2).replace('.', ',')}`))
          .join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
        a.download = 'livro-razao.csv';
        a.click();
      });
    }
    void atualizarBadgeAtrasadas();
  } catch (erro) {
    corpo.innerHTML = `<p class="pr-sub">⚠️ ${esc((erro as Error).message)}</p>`;
  }
}

async function atualizarBadgeAtrasadas(): Promise<void> {
  try {
    const contas = (await api.listarContas()) as { status: string }[];
    const atrasadas = contas.filter((c) => c.status === 'atrasada').length;
    const badge = document.querySelector('[data-badge="contas"]');
    if (badge) badge.textContent = atrasadas ? ` (${atrasadas}!)` : '';
  } catch {
    /* sem ponte, sem badge */
  }
}

// ---------- montagem e eventos ----------

let renderAgendado = false;

function agendarRender(): void {
  if (renderAgendado) return;
  renderAgendado = true;
  setTimeout(() => {
    renderAgendado = false;
    renderProjetos();
    renderEquipe();
    renderTv(); // no-op se o Modo TV estiver fechado
    const abaEmpresaAtiva = document.querySelector('.tab[data-tab="company"]')?.classList.contains('active');
    if (abaEmpresaAtiva && subAbaAtual === 'visao') void renderFinanceiro();
  }, 300);
}

function iniciarPaineis(): void {
  const abaEmpresa = document.querySelector('.tab[data-tab="company"]');
  if (abaEmpresa) abaEmpresa.textContent = '💰 Financeiro';

  renderProjetos();
  renderEquipe();
  moldeFinanceiro();
  void renderFinanceiro();

  // delegação de cliques nos painéis
  $('#realProjetos').addEventListener('click', (ev) => {
    const alvoRotina = (ev.target as HTMLElement).closest('[data-acao-rotina]') as HTMLElement | null;
    if (alvoRotina) return void agirRotina(alvoRotina.dataset.acaoRotina!, alvoRotina.dataset.id ?? '');
    const alvoFluxo = (ev.target as HTMLElement).closest('[data-acao-fluxo]') as HTMLElement | null;
    if (alvoFluxo) return void agirFluxo(alvoFluxo.dataset.acaoFluxo!, alvoFluxo.dataset.id ?? '');
    const alvo = (ev.target as HTMLElement).closest('[data-acao]') as HTMLElement | null;
    if (alvo) void agirProjeto(alvo.dataset.acao!, alvo.dataset.id ?? '');
  });
  $('#realEquipe').addEventListener('click', (ev) => {
    const alvo = (ev.target as HTMLElement).closest('[data-acao-func]') as HTMLElement | null;
    if (alvo) void agirFuncionario(alvo.dataset.acaoFunc!, alvo.dataset.id ?? '');
    const alvoTime = (ev.target as HTMLElement).closest('[data-acao-time]') as HTMLElement | null;
    if (alvoTime) void agirTime(alvoTime.dataset.acaoTime!, alvoTime.dataset.id ?? '');
  });
  $('#realFinanceiro').addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('#btnModoTv')) {
      abrirTv();
      return;
    }
    const metaBtn = (ev.target as HTMLElement).closest('[data-meta-editar]');
    if (metaBtn) {
      const atual = snap()?.config.metaMensalBRL ?? 0;
      const resposta = prompt('🎯 Meta de faturamento do mês (R$) — 0 desliga:', atual ? String(atual) : '');
      if (resposta === null) return;
      const valor = Number(resposta.replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(valor) || valor < 0) {
        toast('⚠️ Valor inválido.', 'bad');
        return;
      }
      void api
        .atualizarConfig({ metaMensalBRL: valor })
        .then(() => {
          toast(valor > 0 ? `🎯 Meta do mês: ${brlCentavos(valor)}.` : '🎯 Meta desligada.', 'good');
          void renderFinanceiro();
        })
        .catch((erro: Error) => toast(`⚠️ ${erro.message}`, 'bad'));
      return;
    }
    const oppGerar = (ev.target as HTMLElement).closest('[data-opp-gerar]') as HTMLElement | null;
    if (oppGerar) {
      toast('🤖 Chamando o Comercial — a proposta leva 1–3 min…');
      void api
        .gerarProposta(oppGerar.dataset.oppGerar!)
        .then(() => void renderFinanceiro())
        .catch((erro: Error) => toast(`⚠️ ${erro.message}`, 'bad'));
      return;
    }
    const oppEtapa = (ev.target as HTMLElement).closest('[data-opp-etapa]') as HTMLElement | null;
    if (oppEtapa) {
      const etapa = oppEtapa.dataset.oppEtapa!;
      void api
        .atualizarOportunidade(oppEtapa.dataset.id!, { etapa })
        .then(() => {
          if (etapa === 'fechado') toast('✅ Contrato fechado — agora é só "Virar projeto"!', 'good');
          void renderFinanceiro();
        })
        .catch((erro: Error) => toast(`⚠️ ${erro.message}`, 'bad'));
      return;
    }
    const oppExcluir = (ev.target as HTMLElement).closest('[data-opp-excluir]') as HTMLElement | null;
    if (oppExcluir) {
      void api
        .excluirOportunidade(oppExcluir.dataset.oppExcluir!)
        .then(() => void renderFinanceiro())
        .catch((erro: Error) => toast(`⚠️ ${erro.message}`, 'bad'));
      return;
    }
    const oppProjeto = (ev.target as HTMLElement).closest('[data-opp-projeto]') as HTMLElement | null;
    if (oppProjeto) {
      const o = snap()?.crm?.oportunidades.find((x) => x.id === oppProjeto.dataset.oppProjeto);
      const clienteNome = snap()?.crm?.clientes.find((c) => c.id === o?.clienteId)?.nome ?? '';
      abrirWizard(null, { nome: o?.titulo, cliente: clienteNome, valor: o?.valorEstimadoBRL });
      return;
    }
    const aba = (ev.target as HTMLElement).closest('[data-fin]') as HTMLElement | null;
    if (aba) {
      subAbaAtual = aba.dataset.fin as SubAba;
      moldeFinanceiro();
      void renderFinanceiro();
      return;
    }
    const receber = (ev.target as HTMLElement).closest('[data-receber]') as HTMLElement | null;
    if (receber) {
      void api
        .receberConta(receber.dataset.receber!)
        .then(() => {
          toast('💵 Recebido — o caixa subiu!', 'good');
          void renderFinanceiro();
        })
        .catch((erro: Error) => toast(`⚠️ ${erro.message}`, 'bad'));
      return;
    }
    const toggle = (ev.target as HTMLElement).closest('[data-custo-toggle]') as HTMLElement | null;
    if (toggle) {
      void api
        .atualizarCustoFixo(toggle.dataset.custoToggle!, { ativo: toggle.dataset.ativo !== 'true' })
        .then(() => void renderFinanceiro())
        .catch((erro: Error) => toast(`⚠️ ${erro.message}`, 'bad'));
      return;
    }
    const excluir = (ev.target as HTMLElement).closest('[data-custo-excluir]') as HTMLElement | null;
    if (excluir && confirm('Excluir este custo fixo? (lançamentos já feitos ficam no livro)')) {
      void api
        .excluirCustoFixo(excluir.dataset.custoExcluir!)
        .then(() => void renderFinanceiro())
        .catch((erro: Error) => toast(`⚠️ ${erro.message}`, 'bad'));
    }
  });

  // wizard
  $('#wizardAvancar').addEventListener('click', () => void avancarWizard());
  $('#wizardVoltar').addEventListener('click', () => {
    if (wizardPasso > 1) {
      colherPasso();
      wizardPasso -= 1;
      renderWizard();
    }
  });
  $('#wizardCancelar').addEventListener('click', () => $('#modalWizard').classList.add('hidden'));

  // funcionário
  $('#funcSalvar').addEventListener('click', () => void salvarFuncionario());
  $('#funcCancelar').addEventListener('click', () => $('#modalFuncionario').classList.add('hidden'));

  // atividade / chat
  $('#atvEnviar').addEventListener('click', () => void enviarMensagemAtividade(false));
  $('#atvRetomar').addEventListener('click', () => void enviarMensagemAtividade(true));
  $('#atvMensagem').addEventListener('keydown', (ev) => {
    if ((ev as KeyboardEvent).key === 'Enter') void enviarMensagemAtividade(false);
  });
  $('#atvFechar').addEventListener('click', () => {
    atividadeAberta = null;
    $('#modalAtividade').classList.add('hidden');
  });

  // aba Financeiro recarrega ao abrir
  document.querySelector('.tab[data-tab="company"]')?.addEventListener('click', () => {
    moldeFinanceiro();
    void renderFinanceiro();
  });

  // Modo TV: fechar (✕/Esc) e abrir direto com ?tv=1 (monitor dedicado)
  document.getElementById('tvFechar')?.addEventListener('click', fecharTv);
  document.addEventListener('keydown', (ev) => {
    if (tvAberto && ev.key === 'Escape') fecharTv();
  });
  if (new URLSearchParams(location.search).get('tv') === '1') abrirTv();

  // eventos da ponte
  G.real!.on('snapshot', agendarRender);
  G.real!.on('progresso', agendarRender);
  G.real!.on('custo', agendarRender);
  G.real!.on('alerta', (dados) => {
    const ev = dados as { tipo: string };
    if (ev.tipo === 'venda') {
      // 🔔 sino de vendas: som + o cliente entra na cena fechar negócio
      sfx('bell');
      cena().spawnClient?.();
    } else if (ev.tipo === 'meta_batida') {
      // 🎉 meta do mês: fanfarra + confete + equipe comemora
      sfx('fanfare');
      soltarConfete();
      cena().popMoney?.('🎯 META!');
    }
    agendarRender();
  });
  G.real!.on('atividade', (dados) => {
    const ev = dados as { projetoId: string; entrada: EntradaAtividadeReal };
    if (ev.projetoId !== atividadeAberta) return;
    const log = document.getElementById('atvLog');
    if (!log) return;
    log.insertAdjacentHTML('beforeend', linhaAtividade(ev.entrada));
    log.scrollTop = log.scrollHeight;
  });
  void atualizarBadgeAtrasadas();
}

// gancho para o clique no boneco (js/main.js)
declare global {
  interface Window {
    UIReal?: { abrirAtividadePorFuncionario: (indice: number) => void };
  }
}

if (G.modoReal && G.real) {
  window.UIReal = {
    abrirAtividadePorFuncionario(indice: number) {
      const funcionario = snap()?.funcionarios.filter((f) => f.status === 'ativo')[indice];
      if (!funcionario) return;
      const projeto = snap()?.projetos.find(
        (p) =>
          p.funcionarioId === funcionario.id &&
          ['em_andamento', 'pausado', 'aguardando_revisao'].includes(p.status),
      );
      if (projeto) void abrirAtividade(projeto.id);
      else toast(`☕ ${funcionario.nome} está disponível — cadastre um projeto para ele!`);
    },
  };
  iniciarPaineis();
}
