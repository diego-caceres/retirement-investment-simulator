// Cross-site scenario sync via the Storage Access API (unpartitioned storage).
//
// When the simulator runs inside a cross-origin iframe, browsers partition its
// localStorage by the *embedding* site, so scenarios saved on one host don't
// show up on another (or on a direct visit). The Storage Access API lets the
// framed document request access to this origin's own *unpartitioned*
// (first-party) localStorage — a single bucket shared by every embed and by
// direct visits alike. Everything here is best-effort and degrades silently to
// ordinary (partitioned) localStorage when the browser doesn't support it.
//
// Browser support for the non-cookie (localStorage) variant is recent and
// uneven (Chromium-based browsers lead; Safari/Firefox may grant only cookie
// access). The caller must treat a `null` result as "not available" and keep
// using its partitioned store.

/** True when running inside an iframe whose top frame is a different origin. */
export function inCrossOriginIframe(): boolean {
  try {
    return window.self !== window.top
  } catch {
    // Reading window.top threw a cross-origin SecurityError → we're framed.
    return true
  }
}

interface StorageAccessHandle {
  localStorage?: Storage
}

type RequestStorageAccess = (types?: { localStorage?: boolean }) => Promise<StorageAccessHandle | undefined>

function rsa(): RequestStorageAccess | null {
  const fn = (document as unknown as { requestStorageAccess?: RequestStorageAccess })
    .requestStorageAccess
  return typeof fn === 'function' ? fn.bind(document) : null
}

/**
 * Try to obtain this origin's unpartitioned localStorage.
 *
 * When `interactive` is false this only resolves if the permission was already
 * granted (so it can be probed silently on load without a prompt); otherwise it
 * rejects and we return null. When called from a user gesture (`interactive`),
 * the browser may show a prompt. Returns the shared Storage, or null when the
 * browser can't provide unpartitioned localStorage.
 */
export async function getSharedLocalStorage(): Promise<Storage | null> {
  const request = rsa()
  if (!request) return null
  try {
    const handle = await request({ localStorage: true })
    const shared = handle?.localStorage
    return shared && typeof shared.getItem === 'function' ? shared : null
  } catch {
    // No prior grant (silent call) or the user dismissed the prompt.
    return null
  }
}
