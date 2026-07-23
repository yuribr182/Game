/* ===========================================================
   App Agency Tycoon — dados / balanceamento do jogo
   Expostos em window.DATA
   =========================================================== */
(function () {
  'use strict';

  // ---- Tiers do escritório (crescimento) ----
  // maxDesks: mesas máximas; slots: projetos simultâneos; cost: para expandir PARA este tier
  const TIERS = [
    { id: 0, name: 'Escritório inicial', icon: '🏢', maxDesks: 6,  slots: 2, cost: 0,       repReq: 0 },
    { id: 1, name: 'Escritório ampliado', icon: '🏬', maxDesks: 10, slots: 3, cost: 7000,    repReq: 25 },
    { id: 2, name: 'Andar próprio',  icon: '🏙️', maxDesks: 16, slots: 4, cost: 26000,   repReq: 90 },
    { id: 3, name: 'Dois andares',   icon: '🏙️', maxDesks: 24, slots: 5, cost: 95000,   repReq: 250 },
    { id: 4, name: 'Sede corporativa', icon: '🏰', maxDesks: 34, slots: 7, cost: 330000,  repReq: 650 },
    { id: 5, name: 'Campus Tech',    icon: '🌆', maxDesks: 48, slots: 10, cost: 1200000, repReq: 1600 },
  ];

  // ---- Tipos de funcionário ----
  // speed: pontos de trabalho por DIA de jogo; salary: custo por dia; hire: custo único
  const ROLES = [
    { id: 'junior',   name: 'Dev Júnior',   emoji: '🧑‍💻', speed: 8,   hire: 300,    salary: 40,   repReq: 0,   quality: 0.9, desc: 'Barato e disposto. Produção modesta.' },
    { id: 'pleno',    name: 'Dev Pleno',    emoji: '👨‍💻', speed: 20,  hire: 1200,   salary: 130,  repReq: 25,  quality: 1.0, desc: 'Bom equilíbrio entre custo e produção.' },
    { id: 'senior',   name: 'Dev Sênior',   emoji: '👩‍💻', speed: 42,  hire: 4500,   salary: 380,  repReq: 90,  quality: 1.15, desc: 'Produção alta e código de qualidade.' },
    { id: 'designer', name: 'Designer UX',  emoji: '🎨', speed: 15,  hire: 2000,   salary: 180,  repReq: 60,  quality: 1.3,  boost: { quality: 0.06 }, desc: 'Melhora a qualidade e reputação de tudo.' },
    { id: 'qa',       name: 'QA / Tester',  emoji: '🕵️', speed: 13,  hire: 1800,   salary: 150,  repReq: 70,  quality: 1.2,  boost: { rep: 0.08 }, desc: 'Reduz bugs e aumenta a reputação ganha.' },
    { id: 'manager',  name: 'Gerente',      emoji: '🧑‍💼', speed: 4,   hire: 8000,   salary: 600,  repReq: 200, quality: 1.0, boost: { team: 0.10 }, desc: 'Aumenta a produção de toda a equipe em 10%.' },
  ];

  // ---- Upgrades permanentes ----
  const UPGRADES = [
    { id: 'pc1',   name: 'PCs melhores',        emoji: '🖥️', cost: 1500,   effect: { prodMult: 0.15 }, desc: '+15% de produção da equipe.' },
    { id: 'coffee',name: 'Máquina de café',     emoji: '☕', cost: 2500,   effect: { prodMult: 0.12 }, desc: '+12% de produção. Cafeína é tudo.' },
    { id: 'chairs',name: 'Cadeiras ergonômicas',emoji: '🪑', cost: 5000,   effect: { prodMult: 0.15 }, desc: '+15% de produção. Coluna agradece.' },
    { id: 'mkt1',  name: 'Marketing básico',    emoji: '📣', cost: 3500,   effect: { contractFlow: 0.5, contractValue: 0.15 }, desc: 'Mais contratos e +15% de valor.' },
    { id: 'ci',    name: 'CI/CD automatizado',  emoji: '⚙️', cost: 9000,   effect: { prodMult: 0.25 }, desc: '+25% de produção com automação.' },
    { id: 'brand', name: 'Marca reconhecida',   emoji: '🌟', cost: 22000,  effect: { repMult: 0.30, contractValue: 0.20 }, desc: '+30% reputação e +20% de valor.' },
    { id: 'ai',    name: 'Copilot de IA',       emoji: '🤖', cost: 45000,  effect: { prodMult: 0.40 }, desc: '+40% de produção. O futuro é agora.' },
    { id: 'cloud', name: 'Infra em nuvem',       emoji: '☁️', cost: 80000,  effect: { prodMult: 0.35, contractValue: 0.25 }, desc: '+35% produção e contratos maiores.' },
    // decorações: aparecem na cena e dão bônus de "moral"
    { id: 'pufes',  name: 'Pufes coloridos',     emoji: '🛋️', cost: 4000,   decor: true, effect: { prodMult: 0.06 }, desc: 'Decora o lounge. +6% de produção (moral).' },
    { id: 'arcade', name: 'Fliperama retrô',     emoji: '🕹️', cost: 12000,  decor: true, effect: { prodMult: 0.10 }, desc: 'Fliperama no lounge. +10% de produção.' },
    { id: 'sinuca', name: 'Mesa de sinuca',      emoji: '🎱', cost: 30000,  decor: true, effect: { prodMult: 0.12, repMult: 0.05 }, desc: 'Sinuca no lounge. +12% produção, +5% reputação.' },
  ];

  // ---- Geração de contratos ----
  // Cada contrato: work (pontos), reward (R$), rep, deadline (dias), quality alvo
  const CLIENTS = ['Padaria do Zé', 'PetShop Amigo', 'Studio Fitness', 'Loja da Ana', 'Clínica Vida',
    'Delivery Rápido', 'Imobiliária Lar', 'EscolaTech', 'Banco Nova', 'StartupX', 'MegaVarejo',
    'Turismo Sol', 'AgroData', 'Games Br', 'FinPay', 'HealthPlus', 'EduMais', 'CityGov'];

  const PROJECT_TYPES = [
    { id: 'landing',  name: 'Landing page de app', emoji: '📱', tier: 0, workBase: 12,   rewardBase: 350,   repBase: 3 },
    { id: 'mvp',      name: 'MVP de aplicativo',   emoji: '🚀', tier: 0, workBase: 30,   rewardBase: 900,   repBase: 6 },
    { id: 'ecommerce',name: 'App de e-commerce',   emoji: '🛍️', tier: 1, workBase: 80,   rewardBase: 2600,  repBase: 12 },
    { id: 'delivery', name: 'App de delivery',     emoji: '🛵', tier: 1, workBase: 140,  rewardBase: 4800,  repBase: 18 },
    { id: 'saas',     name: 'Plataforma SaaS',     emoji: '☁️', tier: 2, workBase: 260,  rewardBase: 9500,  repBase: 30 },
    { id: 'fintech',  name: 'App fintech',         emoji: '💳', tier: 2, workBase: 420,  rewardBase: 17000, repBase: 45 },
    { id: 'social',   name: 'Rede social',         emoji: '🌐', tier: 3, workBase: 700,  rewardBase: 32000, repBase: 70 },
    { id: 'enterprise',name: 'Sistema enterprise', emoji: '🏦', tier: 3, workBase: 1200, rewardBase: 60000, repBase: 110 },
    { id: 'ai',       name: 'Produto com IA',      emoji: '🤖', tier: 4, workBase: 2200, rewardBase: 130000,repBase: 200 },
    { id: 'megaapp',  name: 'Super App',           emoji: '🦄', tier: 4, workBase: 4000, rewardBase: 260000,repBase: 340 },
  ];

  // XP necessário para subir de nível (índice = nível atual - 1)
  function xpForLevel(level) {
    return Math.floor(50 * Math.pow(1.55, level - 1));
  }

  // ---- Nomes de funcionários ----
  const FIRST_NAMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabi', 'Hugo',
    'Iara', 'João', 'Karen', 'Lucas', 'Marina', 'Nando', 'Olívia', 'Pedro', 'Quésia', 'Rafa',
    'Sofia', 'Thiago', 'Úrsula', 'Vitor', 'Wesley', 'Yasmin', 'Zeca', 'Bia', 'Caio', 'Duda',
    'Enzo', 'Flávia', 'Gustavo', 'Helena', 'Igor', 'Júlia', 'Kléber', 'Larissa'];

  // ---- Fases de projeto (design -> código -> testes) ----
  // até: fração do trabalho onde a fase termina; weights: multiplicador por cargo
  const PHASES = [
    { id: 'design', name: 'Design', emoji: '🎨', ate: 0.2,
      weights: { designer: 3.0, junior: 0.7, pleno: 0.7, senior: 0.7, qa: 0.4, manager: 0.5 } },
    { id: 'code', name: 'Código', emoji: '⌨️', ate: 0.8,
      weights: { designer: 0.4, junior: 1.15, pleno: 1.15, senior: 1.15, qa: 0.5, manager: 0.5 } },
    { id: 'tests', name: 'Testes', emoji: '🧪', ate: 1.0,
      weights: { designer: 0.3, junior: 0.6, pleno: 0.6, senior: 0.6, qa: 3.0, manager: 0.5 } },
  ];
  function phaseFor(frac) {
    return PHASES.find((f) => frac < f.ate) || PHASES[PHASES.length - 1];
  }

  // ---- Evolução de carreira (trilha dev) ----
  // xp em DIAS de jogo trabalhando; custo é a taxa de promoção
  const PROMOTIONS = {
    junior: { to: 'pleno', xp: 8, cost: 900 },
    pleno: { to: 'senior', xp: 20, cost: 3300 },
  };

  // ---- Eventos aleatórios ----
  // instant: aplica direto; choice: abre modal com opções
  const EVENTS = [
    { id: 'vip', kind: 'instant', chance: 1.0,
      title: '🤩 Cliente VIP!', text: 'Um cliente famoso quer um app com urgência. Contrato premium disponível!' },
    { id: 'midia', kind: 'instant', chance: 0.8,
      title: '📰 Saiu na mídia!', text: 'Sua agência foi destaque num portal de tecnologia.' },
    { id: 'blackout', kind: 'instant', chance: 0.5,
      title: '🔌 Queda de energia!', text: 'Ficaram sem luz por um tempo. Produção reduzida hoje.' },
    { id: 'bug', kind: 'choice', chance: 0.7,
      title: '🐛 Bug em produção!', text: 'Um app entregue apresentou um bug grave. O cliente está furioso.',
      options: [
        { id: 'fix', label: '🔧 Corrigir agora', hint: 'Custa dinheiro, preserva a reputação' },
        { id: 'ignore', label: '🙈 Ignorar', hint: 'Grátis, mas a reputação sofre' },
      ] },
    { id: 'raise', kind: 'choice', chance: 0.35,
      title: '💼 Pedido de aumento', text: 'pede um aumento de 20% no salário.',
      options: [
        { id: 'accept', label: '🤝 Dar o aumento', hint: 'Salário sobe, funcionário motivado' },
        { id: 'deny', label: '❌ Recusar', hint: 'Risco de desmotivação (ou pedir demissão)' },
      ] },
    { id: 'investor', kind: 'choice', chance: 0.5,
      title: '🦈 Proposta de investidor', text: 'Um investidor oferece um aporte em troca de exposição da marca dele nos seus apps.',
      options: [
        { id: 'accept', label: '💰 Aceitar o aporte', hint: 'Dinheiro agora, um pouco de reputação depois' },
        { id: 'deny', label: '🚫 Recusar', hint: 'Independência valoriza sua marca (+reputação)' },
      ] },
  ];

  // ---- Produtos próprios (renda passiva) ----
  const PRODUCT_NAMES = ['TaskZen', 'FitTrack', 'NotaFácil', 'PetCare+', 'Receitou', 'Grana App',
    'FocusTime', 'MapaAí', 'TreinoPro', 'MeuMercado', 'AgendaLivre', 'FotoMix', 'SomZone', 'VagaCerta'];

  // ---- Agências rivais (ranking) ----
  // rep inicial e crescimento diário; o jogador sobe o ranking entregando apps
  const RIVALS = [
    { id: 'bytejr',   name: 'ByteJunior',      rep: 12,  growth: 0.7 },
    { id: 'codecat',  name: 'CodeCat Studio',  rep: 45,  growth: 1.1 },
    { id: 'devhouse', name: 'DevHouse',        rep: 110, growth: 1.7 },
    { id: 'pixelpro', name: 'PixelPro Apps',   rep: 240, growth: 2.4 },
    { id: 'technova', name: 'TechNova Group',  rep: 480, growth: 3.2 },
  ];

  // ---- Conquistas ----
  // cond recebe o estado e devolve true quando desbloqueia
  const ACHIEVEMENTS = [
    { id: 'first_project', emoji: '🚀', name: 'Primeira entrega', desc: 'Complete seu primeiro projeto.', reward: { money: 500 }, cond: (s) => s.stats.completed >= 1 },
    { id: 'ten_projects', emoji: '📦', name: 'Linha de produção', desc: 'Complete 10 projetos.', reward: { money: 3000 }, cond: (s) => s.stats.completed >= 10 },
    { id: 'fifty_projects', emoji: '🏭', name: 'Fábrica de apps', desc: 'Complete 50 projetos.', reward: { money: 20000 }, cond: (s) => s.stats.completed >= 50 },
    { id: 'first_hire', emoji: '🤝', name: 'Primeiro contratado', desc: 'Contrate um funcionário.', reward: { rep: 5 }, cond: (s) => (s.stats.hires || 0) >= 1 },
    { id: 'team_five', emoji: '👥', name: 'Squad completo', desc: 'Tenha 5 funcionários ao mesmo tempo.', reward: { money: 2000 }, cond: (s) => s.employees.length >= 5 },
    { id: 'team_ten', emoji: '🏟️', name: 'Agência de verdade', desc: 'Tenha 10 funcionários ao mesmo tempo.', reward: { money: 8000 }, cond: (s) => s.employees.length >= 10 },
    { id: 'first_promo', emoji: '🎓', name: 'Plano de carreira', desc: 'Promova um funcionário.', reward: { rep: 8 }, cond: (s) => (s.stats.promotions || 0) >= 1 },
    { id: 'first_product', emoji: '💡', name: 'Empreendedor nato', desc: 'Lance um produto próprio.', reward: { rep: 10 }, cond: (s) => (s.products || []).length >= 1 },
    { id: 'three_products', emoji: '🧪', name: 'Portfólio diversificado', desc: 'Tenha 3 produtos no mercado.', reward: { money: 15000 }, cond: (s) => (s.products || []).length >= 3 },
    { id: 'rep_100', emoji: '⭐', name: 'Conhecidos na cidade', desc: 'Alcance 100 de reputação.', reward: { money: 5000 }, cond: (s) => s.rep >= 100 },
    { id: 'rep_500', emoji: '🌟', name: 'Referência nacional', desc: 'Alcance 500 de reputação.', reward: { money: 30000 }, cond: (s) => s.rep >= 500 },
    { id: 'earned_100k', emoji: '💰', name: 'Primeiros 100 mil', desc: 'Fature R$ 100.000 acumulados.', reward: { rep: 20 }, cond: (s) => s.stats.earned >= 100000 },
    { id: 'tier_2', emoji: '🏢', name: 'Subindo na vida', desc: 'Expanda até o Andar próprio.', reward: { money: 5000 }, cond: (s) => s.tier >= 2 },
    { id: 'tier_5', emoji: '🌆', name: 'Campus Tech', desc: 'Alcance o maior escritório do jogo.', reward: { rep: 100 }, cond: (s) => s.tier >= 5 },
    { id: 'level_5', emoji: '🎯', name: 'Empresa nível 5', desc: 'Alcance o nível 5 da empresa.', reward: { money: 4000 }, cond: (s) => s.level >= 5 },
    { id: 'rank_first', emoji: '🥇', name: 'Líder de mercado', desc: 'Seja a agência nº 1 do ranking.', reward: { money: 25000 }, cond: (s) => s.day > 3 && (s.rivals || []).length > 0 && s.rivals.every((r) => r.rep < s.rep) },
  ];

  window.DATA = { TIERS, ROLES, UPGRADES, CLIENTS, PROJECT_TYPES, xpForLevel,
    FIRST_NAMES, PHASES, phaseFor, PROMOTIONS, EVENTS, PRODUCT_NAMES, ACHIEVEMENTS, RIVALS };
})();
