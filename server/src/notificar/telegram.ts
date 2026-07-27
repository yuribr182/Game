// Notificações no celular via Telegram (F4c). Opcional: só age se o bot estiver
// configurado em server/.env (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID).
// Como criar: fale com o @BotFather (novo bot ⇒ token); mande um "oi" para o bot
// e pegue seu chat_id em https://api.telegram.org/bot<TOKEN>/getUpdates.

export function telegramConfigurado(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

type FnFetch = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>;

let avisouSemConfig = false;

/**
 * Envia uma mensagem de texto ao dono. Nunca lança: falha vira `false` + log,
 * para nenhuma notificação derrubar o fluxo principal da ponte.
 */
export async function enviarTelegram(
  texto: string,
  fetchFn: FnFetch = fetch as unknown as FnFetch,
): Promise<boolean> {
  if (!telegramConfigurado()) {
    if (!avisouSemConfig) {
      avisouSemConfig = true;
      console.info('[telegram] sem TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID — notificações no celular desligadas.');
    }
    return false;
  }
  try {
    const resposta = await fetchFn(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: texto.slice(0, 4000), // limite do Telegram é 4096
          disable_web_page_preview: true,
        }),
      },
    );
    if (!resposta.ok) console.warn(`[telegram] envio falhou (HTTP ${resposta.status})`);
    return resposta.ok;
  } catch (erro) {
    console.warn(`[telegram] envio falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
    return false;
  }
}

/** Dispara sem esperar (uso normal na ponte: notificação nunca bloqueia nada). */
export function notificarCelular(texto: string): void {
  void enviarTelegram(texto);
}
