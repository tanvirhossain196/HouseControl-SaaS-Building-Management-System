import 'server-only'

/**
 * Whether a resident can pay rent online today.
 *
 * Having store credentials is not the same as being open for business. The
 * sandbox takes a card, shows a success page and moves no money, so a resident
 * pointed at it believes their rent is paid when it is not. That is worse than
 * having no button at all, which is why "configured" is not enough on its own.
 *
 *   live  a real merchant account — the button works and money moves
 *   test  sandbox, switched on deliberately with RENT_ONLINE_PAYMENTS=test,
 *         labelled as a test everywhere it appears
 *   off   anything else: no credentials, or sandbox without the opt-in
 *
 * Subscription payments are separate and unaffected. Those are our own revenue
 * through ZiniPay; this only governs rent, which is the landlord's money and
 * still waiting on a licensed gateway.
 */

export type RentOnlineStatus = 'live' | 'test' | 'off'

export function rentOnlineStatus(): RentOnlineStatus {
  const override = process.env.RENT_ONLINE_PAYMENTS?.trim().toLowerCase()

  if (override === 'off') return 'off'

  /**
   * ZiniPay first, and live when it is configured.
   *
   * It has no sandbox/live split the way SSLCommerz does — a key is a key, and
   * money moves. So an API key present means the button can be shown for real.
   */
  const gateway = process.env.RENT_GATEWAY?.trim().toLowerCase()
  const zinipay = Boolean(process.env.ZINIPAY_API_KEY)

  if (gateway !== 'sslcommerz' && zinipay) return 'live'

  const configured = Boolean(
    process.env.SSLCOMMERZ_STORE_ID && process.env.SSLCOMMERZ_STORE_PASSWORD,
  )

  if (!configured) return 'off'

  // Matches sslConfig(): anything but an explicit 'false' means sandbox.
  const sandbox = process.env.SSLCOMMERZ_SANDBOX !== 'false'

  if (!sandbox) return 'live'

  return override === 'test' ? 'test' : 'off'
}

/** True when a checkout may actually be started. */
export function rentOnlineAvailable(): boolean {
  return rentOnlineStatus() !== 'off'
}
