// 浏览器持久化授权：首次启动请求 navigator.storage.persist()
// EXPORTS: requestPersist, estimateUsage

export async function requestPersist(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && 'persist' in navigator.storage) {
      await navigator.storage.persist();
    }
  } catch {
    /* 不支持则忽略，不影响使用 */
  }
}

export async function estimateUsage(): Promise<{ usage: number; quota: number }> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && 'estimate' in navigator.storage) {
      const est = await navigator.storage.estimate();
      return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
    }
  } catch {
    /* 忽略 */
  }
  return { usage: 0, quota: 0 };
}
