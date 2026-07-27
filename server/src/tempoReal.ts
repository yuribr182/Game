// Tempo real front ↔ ponte: SSE simples (event: nome / data: json).

import type { ServerResponse } from 'node:http';

export type NomeEvento = 'estado' | 'progresso' | 'atividade' | 'custo' | 'alerta';

export class TempoReal {
  private clientes = new Set<ServerResponse>();
  private heartbeat: NodeJS.Timeout | null = null;

  adicionar(res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write(': conectado\n\n');
    this.clientes.add(res);
    res.on('close', () => this.clientes.delete(res));
    if (!this.heartbeat) {
      this.heartbeat = setInterval(() => {
        for (const c of this.clientes) c.write(': ping\n\n');
      }, 25_000);
      this.heartbeat.unref();
    }
  }

  enviar(evento: NomeEvento, dados: unknown): void {
    const quadro = `event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`;
    for (const c of this.clientes) {
      try {
        c.write(quadro);
      } catch {
        this.clientes.delete(c);
      }
    }
  }

  get conectados(): number {
    return this.clientes.size;
  }
}
