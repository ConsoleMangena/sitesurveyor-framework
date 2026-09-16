/**
 * Wipes all locally-stored data for this origin so the next page load starts
 * completely fresh (like a brand-new install). Useful after a buggy PWA cache,
 schema drift, or stale IndexedDB state.
 */
export async function clearSiteData(options: { reload?: boolean } = {}): Promise<void> {
  const reloadUrl = options.reload === false ? null : window.location.origin

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((r) => r.unregister()))
    }
  } catch (e) {
    console.warn('[clearSiteData] failed to unregister service worker:', e)
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch (e) {
    console.warn('[clearSiteData] failed to clear caches:', e)
  }

  try {
    const idbFactory = window.indexedDB ?? (window as unknown as { webkitIndexedDB?: IDBFactory }).webkitIndexedDB
    if (idbFactory && 'databases' in idbFactory && typeof idbFactory.databases === 'function') {
      const dbs = await idbFactory.databases()
      await Promise.all(
        dbs
          .filter((db): db is IDBDatabaseInfo & { name: string } => typeof db.name === 'string')
          .map((db) => new Promise<void>((resolve, reject) => {
            const req = idbFactory.deleteDatabase(db.name)
            req.onsuccess = () => resolve()
            req.onerror = () => reject(req.error)
            req.onblocked = () => {
              console.warn('[clearSiteData] blocked deleting IndexedDB database:', db.name)
              resolve()
            }
          })),
      )
    }
  } catch (e) {
    console.warn('[clearSiteData] failed to clear IndexedDB:', e)
  }

  try {
    localStorage.clear()
    sessionStorage.clear()
  } catch (e) {
    console.warn('[clearSiteData] failed to clear storage:', e)
  }

  console.info('[clearSiteData] site data cleared. Reloading to login…')

  if (reloadUrl) {
    window.location.href = reloadUrl
  }
}
