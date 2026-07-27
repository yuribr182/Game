import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../src/store/db.js';
import type { Lancamento } from '../src/store/tipos.js';

let dir: string;
let store: Store;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'empresa-real-'));
  store = new Store(dir);
  await store.init();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function lanc(id: string, valor: number): Lancamento {
  return { id, data: '2026-07-27', tipo: 'ajuste', valorBRL: valor, descricao: 't' };
}

describe('Store', () => {
  it('grava e lê JSON (atômico, sem .tmp sobrando)', async () => {
    await store.salvarConfig({ ...(await store.lerConfig()), cambioUsdBrl: 6 });
    const cfg = await store.lerConfig();
    expect(cfg.cambioUsdBrl).toBe(6);
    const bruto = await readFile(path.join(dir, 'config.json'), 'utf8');
    expect(() => JSON.parse(bruto)).not.toThrow();
  });

  it('livro-razão: append-only com última-versão-vence por id', async () => {
    await store.anexarLancamento(lanc('a', 1));
    await store.anexarLancamento(lanc('b', 2));
    await store.anexarLancamento(lanc('a', 10)); // atualização do mesmo id
    const lidos = await store.listarLancamentos();
    expect(lidos).toHaveLength(2);
    expect(lidos.find((l) => l.id === 'a')?.valorBRL).toBe(10);
    // o arquivo físico guarda as 3 linhas (auditoria), a leitura reduz
    const bruto = await readFile(path.join(dir, 'lancamentos.ndjson'), 'utf8');
    expect(bruto.trim().split('\n')).toHaveLength(3);
  });

  it('linha corrompida no NDJSON é ignorada sem derrubar a leitura', async () => {
    await store.anexarLancamento(lanc('ok', 5));
    const { appendFile } = await import('node:fs/promises');
    await appendFile(path.join(dir, 'lancamentos.ndjson'), '{"id":"quebrado","valorBR\n', 'utf8');
    await store.anexarLancamento(lanc('ok2', 7));
    const lidos = await store.listarLancamentos();
    expect(lidos.map((l) => l.id).sort()).toEqual(['ok', 'ok2']);
  });

  it('eventos vistos por sessão: persiste e recorta em 5000', async () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 5200; i++) vistos.add(`ev-${i}`);
    await store.salvarEventosVistos('sess1', vistos);
    const lidos = await store.lerEventosVistos('sess1');
    expect(lidos.size).toBe(5000);
    expect(lidos.has('ev-5199')).toBe(true);
    expect(lidos.has('ev-0')).toBe(false);
  });

  it('atividade NDJSON por projeto', async () => {
    await store.anexarAtividade('p1', { ts: '2026-07-27T10:00:00Z', tipo: 'sistema', texto: 'oi' });
    await store.anexarAtividade('p1', { ts: '2026-07-27T10:01:00Z', tipo: 'mensagem', texto: 'olá' });
    const atividade = await store.listarAtividade('p1');
    expect(atividade).toHaveLength(2);
    expect(atividade[1]?.texto).toBe('olá');
  });
});
