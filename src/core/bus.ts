/* ===========================================================
   App Agency Tycoon — EventEmitter tipado (F1 do PRD)
   Substitui o objeto `listeners` do js/game.js por um bus com
   tipos: cada evento carrega um payload conhecido.
   Módulo puro: sem DOM, sem Pixi (fronteira do core, lint).
   =========================================================== */
import type { GameState } from './state';

/** Categorias de "toast"/aviso disparadas pelo motor. */
export type EventKind =
  | 'error'
  | 'info'
  | 'warn'
  | 'accept'
  | 'complete'
  | 'fail'
  | 'upgrade'
  | 'level'
  | 'achieve';

/** Payload do evento `event` (avisos para a UI/áudio). */
export interface GameEvent {
  type: EventKind;
  msg: string;
  /** ganho em dinheiro (usado por alguns SFX/animação de entrega) */
  gain?: number;
}

/** Mapa de evento -> payload. Fonte única da verdade dos tipos do bus. */
export interface BusEvents {
  change: GameState;
  tick: GameState;
  event: GameEvent;
}

type Listener<K extends keyof BusEvents> = (payload: BusEvents[K]) => void;

/** Bus mínimo (on/emit) tipado, equivalente ao antigo `on`/`emit`. */
export class Bus {
  private readonly listeners: { [K in keyof BusEvents]: Listener<K>[] } = {
    change: [],
    tick: [],
    event: [],
  };

  on<K extends keyof BusEvents>(type: K, fn: Listener<K>): void {
    this.listeners[type].push(fn);
  }

  emit<K extends keyof BusEvents>(type: K, payload: BusEvents[K]): void {
    // cópia defensiva não é necessária: listeners não se removem em runtime
    for (const fn of this.listeners[type]) fn(payload);
  }
}
