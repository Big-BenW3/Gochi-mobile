/**
 * Helius adapter — same IngestionAdapter interface as the RPC adapter, behind a
 * key check, so swapping in a real key later is a one-line env change. Until
 * HELIUS_API_KEY is set the adapter is inert by design.
 */
import type { IngestionAdapter, RawWalletEvent } from './types.js'

export class HeliusAdapter implements IngestionAdapter {
  name = 'helius'

  constructor(private readonly apiKey: string | undefined) {}

  async fetchRecent(
    _wallet: string,
    _cursor: number | null,
    _limit: number,
  ): Promise<RawWalletEvent[]> {
    if (!this.apiKey) {
      throw new Error(
        'HELIUS_API_KEY is not set — use the RPC history adapter instead of Helius',
      )
    }
    // Parsing of Helius webhook / enhanced-transactions payloads lands here
    // when the key is available. The shape is intentionally identical to
    // RpcHistoryAdapter so the pipeline never diverges.
    return []
  }
}
