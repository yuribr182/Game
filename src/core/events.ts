/* ===========================================================
   App Agency Tycoon — eventos aleatórios e conquistas (F1 do PRD)
   Portado 1:1 de js/game.js — NENHUM número foi alterado.
   =========================================================== */
import { EVENTS, ROLES, ACHIEVEMENTS } from './data';
import type { EventoDef } from './data';
import { fmt } from './state';
import type { Ctx, PendingEventData } from './state';
import { generateContract } from './economy';

// ---------- eventos aleatórios ----------
export function triggerRandomEvent(ctx: Ctx): void {
  const state = ctx.state;
  const weighted: EventoDef[] = [];
  EVENTS.forEach((ev) => {
    for (let k = 0; k < Math.round(ev.chance * 10); k++) weighted.push(ev);
  });
  const ev = ctx.pick(weighted);
  if (ev.id === 'vip') {
    const p = generateContract(ctx);
    p.reward = Math.round(p.reward * 2.2);
    p.rep = Math.round(p.rep * 1.5);
    p.deadline = p.daysLeft = Math.max(4, Math.floor(p.deadline * 0.6));
    p.vip = true;
    state.available.unshift(p);
    ctx.emit({ type: 'upgrade', msg: `🤩 Cliente VIP! ${p.name} pagando R$ ${fmt(p.reward)}` });
  } else if (ev.id === 'midia') {
    const gain = 4 + state.level * 2;
    state.rep += gain;
    ctx.emit({ type: 'upgrade', msg: `📰 Sua agência saiu na mídia! +${gain} ⭐` });
  } else if (ev.id === 'blackout') {
    state.effects.push({ id: 'blackout', daysLeft: 2, prod: 0.5, label: '🔌 Sem luz (-50% produção)' });
    ctx.emit({ type: 'warn', msg: '🔌 Queda de energia! Produção reduzida por 2 dias.' });
  } else if (ev.id === 'bug') {
    if (state.employees.some((e) => e.role === 'qa')) {
      state.rep += 3;
      ctx.emit({ type: 'info', msg: '🕵️ Seu QA pegou um bug antes do cliente ver. +3 ⭐' });
      return;
    }
    const cost = Math.round(300 + state.rep * 6 + state.level * 150);
    openChoiceEvent(ctx, ev, { cost }, ev.text + ` Corrigir custa R$ ${fmt(cost)}.`, 'ignore');
  } else if (ev.id === 'raise') {
    const devs = state.employees.filter((e) => (e.salaryMult || 1) < 1.8);
    if (!devs.length) return;
    const emp = ctx.pick(devs);
    const role = ROLES.find((r) => r.id === emp.role);
    openChoiceEvent(
      ctx,
      ev,
      { empUid: emp.uid },
      `${role ? role.emoji : '🧑‍💻'} ${emp.name} (${role ? role.name : ''}) ` + ev.text,
      'deny',
    );
  } else if (ev.id === 'investor') {
    const amount = Math.round(2000 + state.level * 1200 + state.rep * 25);
    openChoiceEvent(ctx, ev, { amount }, ev.text + ` Aporte de R$ ${fmt(amount)}.`, 'deny');
  }
}

export function openChoiceEvent(
  ctx: Ctx,
  ev: EventoDef,
  data: PendingEventData,
  text: string,
  defaultOption: string,
): void {
  ctx.state.pendingEvent = {
    id: ev.id,
    title: ev.title,
    text,
    options: ev.options,
    data,
    defaultOption,
    day: ctx.state.day,
  };
  ctx.emit({ type: 'warn', msg: `${ev.title} — decida no aviso!` });
  ctx.changed();
}

export function resolveEvent(ctx: Ctx, optionId: string): boolean {
  const state = ctx.state;
  const pe = state.pendingEvent;
  if (!pe) return false;
  state.pendingEvent = null;
  if (pe.id === 'bug') {
    if (optionId === 'fix') {
      state.money = Math.max(0, state.money - (pe.data.cost ?? 0));
      ctx.emit({ type: 'info', msg: `🔧 Bug corrigido por R$ ${fmt(pe.data.cost ?? 0)}. Cliente satisfeito.` });
    } else {
      const loss = Math.max(5, Math.round(state.rep * 0.12));
      state.rep = Math.max(0, state.rep - loss);
      ctx.emit({ type: 'fail', msg: `🙈 O bug viralizou nas reviews... -${loss} ⭐` });
    }
  } else if (pe.id === 'raise') {
    const emp = state.employees.find((e) => e.uid === pe.data.empUid);
    if (emp) {
      if (optionId === 'accept') {
        emp.salaryMult = (emp.salaryMult || 1) * 1.2;
        emp.mood = { mult: 1.25, daysLeft: 6 };
        ctx.emit({ type: 'info', msg: `🤝 ${emp.name} está motivado! (+25% produção por 6 dias)` });
      } else if (ctx.random() < 0.25) {
        state.employees = state.employees.filter((e) => e.uid !== emp.uid);
        ctx.emit({ type: 'fail', msg: `😞 ${emp.name} pediu demissão...` });
      } else {
        emp.mood = { mult: 0.7, daysLeft: 4 };
        ctx.emit({ type: 'warn', msg: `😒 ${emp.name} ficou desmotivado. (-30% produção por 4 dias)` });
      }
    }
  } else if (pe.id === 'investor') {
    if (optionId === 'accept') {
      state.money += pe.data.amount ?? 0;
      const loss = Math.max(3, Math.round(state.rep * 0.08));
      state.rep = Math.max(0, state.rep - loss);
      ctx.emit({ type: 'info', msg: `💰 Aporte de R$ ${fmt(pe.data.amount ?? 0)} recebido! (-${loss} ⭐)` });
    } else {
      const gain = Math.max(3, Math.round(state.rep * 0.05) + 2);
      state.rep += gain;
      ctx.emit({ type: 'info', msg: `🚫 Independência mantida. O mercado respeita! +${gain} ⭐` });
    }
  }
  ctx.changed();
  return true;
}

// ---------- conquistas ----------
export function checkAchievements(ctx: Ctx): void {
  const state = ctx.state;
  ACHIEVEMENTS.forEach((a) => {
    if (state.achievements.includes(a.id)) return;
    let ok = false;
    try {
      ok = a.cond(state);
    } catch {
      /* condição defensiva: ignora conquista que falhe ao avaliar */
    }
    if (!ok) return;
    state.achievements.push(a.id);
    const parts: string[] = [];
    if (a.reward) {
      if (a.reward.money) {
        state.money += a.reward.money;
        parts.push(`+R$ ${fmt(a.reward.money)}`);
      }
      if (a.reward.rep) {
        state.rep += a.reward.rep;
        parts.push(`+${a.reward.rep} ⭐`);
      }
    }
    ctx.emit({ type: 'achieve', msg: `🏆 Conquista: ${a.emoji} ${a.name}! ${parts.join(' · ')}` });
  });
}
