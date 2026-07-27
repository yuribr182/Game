// Configuração da ponte: carga do .env (sem dependência externa), porta e datas.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** Raiz do projeto server/ (um nível acima de src/). */
export const RAIZ_SERVER = path.resolve(AQUI, '..');

/** Diretório de dados (gitignored). Sobrescrevível p/ testes via EMPRESA_DADOS_DIR. */
export function dirDados(): string {
  return process.env.EMPRESA_DADOS_DIR ?? path.join(RAIZ_SERVER, 'data');
}

/** Carrega server/.env para process.env (linhas CHAVE=VALOR; não sobrescreve o que já existe). */
export function carregarEnv(): void {
  const arq = path.join(RAIZ_SERVER, '.env');
  if (!existsSync(arq)) return;
  for (const linha of readFileSync(arq, 'utf8').split('\n')) {
    const l = linha.trim();
    if (!l || l.startsWith('#')) continue;
    const igual = l.indexOf('=');
    if (igual <= 0) continue;
    const chave = l.slice(0, igual).trim();
    const valor = l.slice(igual + 1).trim();
    if (!(chave in process.env)) process.env[chave] = valor;
  }
}

export function porta(): number {
  const p = Number(process.env.PORTA ?? 3777);
  return Number.isFinite(p) && p > 0 ? p : 3777;
}

export const MODELO_PADRAO = 'claude-opus-5';

// ---- datas (hora local da máquina — a agência vive no fuso do dono) ----

export function hojeISO(agora: Date = new Date()): string {
  const a = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

export function agoraISO(): string {
  return new Date().toISOString();
}

/** Soma meses a uma data yyyy-mm-dd, ancorando no fim do mês quando preciso (31/01 + 1m = 28/02). */
export function somarMeses(dataISO: string, meses: number): string {
  const [a, m, d] = dataISO.split('-').map(Number) as [number, number, number];
  const totalMeses = (a * 12 + (m - 1)) + meses;
  const ano = Math.floor(totalMeses / 12);
  const mes = totalMeses % 12; // 0-11
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  const dia = Math.min(d, ultimoDia);
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Soma dias a uma data yyyy-mm-dd. */
export function somarDias(dataISO: string, dias: number): string {
  const [a, m, d] = dataISO.split('-').map(Number) as [number, number, number];
  const data = new Date(a, m - 1, d + dias);
  return hojeISO(data);
}

/** yyyy-mm de uma data yyyy-mm-dd. */
export function mesDe(dataISO: string): string {
  return dataISO.slice(0, 7);
}

export function arredondarBRL(v: number): number {
  return Math.round(v * 100) / 100;
}
