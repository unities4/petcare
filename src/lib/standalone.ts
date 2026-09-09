/**
 * Приложение запущено с домашнего экрана, а не во вкладке браузера.
 * На iOS это единственный режим, в котором вообще возможны пуши (docs/ios-pwa.md).
 */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
