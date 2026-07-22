/* ===========================================================
   App Agency Tycoon — dados / balanceamento do jogo
   Expostos em window.DATA
   =========================================================== */
(function () {
  'use strict';

  // ---- Tiers do escritório (crescimento) ----
  // maxDesks: mesas máximas; slots: projetos simultâneos; cost: para expandir PARA este tier
  const TIERS = [
    { id: 0, name: 'Garagem',        icon: '🏚️', maxDesks: 2,  slots: 1, cost: 0,       repReq: 0 },
    { id: 1, name: 'Sala compartilhada', icon: '🏬', maxDesks: 4,  slots: 2, cost: 4000,    repReq: 20 },
    { id: 2, name: 'Escritório',     icon: '🏢', maxDesks: 8,  slots: 3, cost: 18000,   repReq: 80 },
    { id: 3, name: 'Andar próprio',  icon: '🏙️', maxDesks: 14, slots: 4, cost: 70000,   repReq: 220 },
    { id: 4, name: 'Sede corporativa', icon: '🏰', maxDesks: 24, slots: 6, cost: 260000,  repReq: 550 },
    { id: 5, name: 'Campus Tech',    icon: '🌆', maxDesks: 40, slots: 9, cost: 1000000, repReq: 1400 },
  ];

  // ---- Tipos de funcionário ----
  // speed: pontos de trabalho por segundo; salary: custo por dia; hire: custo único
  const ROLES = [
    { id: 'junior',   name: 'Dev Júnior',   emoji: '🧑‍💻', speed: 1.0,  hire: 300,    salary: 40,   repReq: 0,   quality: 0.9, desc: 'Barato e disposto. Produção modesta.' },
    { id: 'pleno',    name: 'Dev Pleno',    emoji: '👨‍💻', speed: 2.4,  hire: 1200,   salary: 130,  repReq: 25,  quality: 1.0, desc: 'Bom equilíbrio entre custo e produção.' },
    { id: 'senior',   name: 'Dev Sênior',   emoji: '👩‍💻', speed: 5.0,  hire: 4500,   salary: 380,  repReq: 90,  quality: 1.15, desc: 'Produção alta e código de qualidade.' },
    { id: 'designer', name: 'Designer UX',  emoji: '🎨', speed: 1.8,  hire: 2000,   salary: 180,  repReq: 60,  quality: 1.3,  boost: { quality: 0.06 }, desc: 'Melhora a qualidade e reputação de tudo.' },
    { id: 'qa',       name: 'QA / Tester',  emoji: '🕵️', speed: 1.5,  hire: 1800,   salary: 150,  repReq: 70,  quality: 1.2,  boost: { rep: 0.08 }, desc: 'Reduz bugs e aumenta a reputação ganha.' },
    { id: 'manager',  name: 'Gerente',      emoji: '🧑‍💼', speed: 0.5,  hire: 8000,   salary: 600,  repReq: 200, quality: 1.0, boost: { team: 0.10 }, desc: 'Aumenta a produção de toda a equipe em 10%.' },
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

  window.DATA = { TIERS, ROLES, UPGRADES, CLIENTS, PROJECT_TYPES, xpForLevel };
})();
