import { loadTokenRow } from '../_whoop.js'

/** Whether Whoop is connected. Never returns token material. */
export default async function handler(req, res) {
  try {
    const row = await loadTokenRow()
    if (!row) return res.status(200).json({ connected: false })
    return res.status(200).json({
      connected: true,
      scope: row.scope ?? null,
      connected_at: row.connected_at,
      expires_at: row.expires_at,
      has_refresh_token: !!row.refresh_token,
    })
  } catch (err) {
    return res.status(500).json({ connected: false, error: String(err?.message ?? err) })
  }
}
