import './style.css'
import { Capacitor } from '@capacitor/core'
import {
  completeFollowUp, deleteWindow, dueLabel, formatInterval, getSnapshot, importBackup,
  localDay, logsToCsv, logWindow, saveWindow, scheduledAt, uid, undoFollowUp, undoGroup,
  type Backup, type DoseStatus, type DoseWindow, type FollowUp,
} from './data'
import { captureLicenseFromUrl, checkoutUrl, hasOptimisticUnlock, removeLicense, storeLicense, verifyLicense } from './license'

type View = 'today' | 'history' | 'setup' | 'more'

const app = document.querySelector<HTMLDivElement>('#app')!
let snapshot: Backup = { version: 1, exportedAt: '', windows: [], logs: [], followUps: [] }
let view: View = 'today'
let unlocked = false
let previousFocus: HTMLElement | null = null
let undoAction: (() => Promise<void>) | undefined
let toastTimer = 0
let reminderTimers: number[] = []
let nativeNotificationsEnabled = false

captureLicenseFromUrl()
unlocked = hasOptimisticUnlock()

const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!)

const formatTime = (value: string | Date): string => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(typeof value === 'string' ? new Date(value) : value)
const formatDateTime = (value: string): string => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

function statusIcon(status: string): string {
  return status === 'taken' ? '■' : status === 'late' ? '▲' : status === 'skipped' ? '—' : '□'
}

function currentLogs(window: DoseWindow) {
  const day = localDay()
  return snapshot.logs.filter(log => log.windowId === window.id && localDay(new Date(log.scheduledFor)) === day && !log.sourceFollowUpId)
}

function nextPending(): FollowUp[] {
  return snapshot.followUps.filter(item => item.status === 'pending').sort((a, b) => a.dueAt.localeCompare(b.dueAt))
}

function render(): void {
  const offline = !navigator.onLine
  app.innerHTML = `
    <header class="app-header">
      <a class="brand" href="#today" data-nav="today" aria-label="Dose Chain Log, today">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <span>Dose Chain Log</span>
      </a>
      <span class="network ${offline ? 'is-offline' : ''}" role="status">${offline ? 'Offline · logging locally' : 'On device'}</span>
    </header>
    <nav class="tab-bar" aria-label="Primary">
      ${navButton('today', 'Today', '⌁')}
      ${navButton('history', 'History', '▤')}
      ${navButton('setup', 'Windows', '▦')}
      ${navButton('more', 'More', '•••')}
    </nav>
    <main id="main" tabindex="-1">
      ${renderView()}
    </main>
    <footer class="footer">
      <span>Private by default. Your dose data stays on this device.</span>
      <span><a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a> · Artwork generated for Dose Chain Log.</span>
    </footer>
    <div id="live" class="sr-only" aria-live="polite"></div>
    <div id="toast" class="toast" hidden role="status"><span></span><button type="button" data-act="undo">Undo</button></div>
    <dialog id="window-dialog" aria-labelledby="dialog-title">${windowForm()}</dialog>
    <dialog id="confirm-dialog" aria-labelledby="confirm-title"></dialog>
  `
  bindEvents()
}

function navButton(target: View, label: string, icon: string): string {
  return `<button type="button" data-nav="${target}" ${view === target ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${label}</button>`
}

function renderView(): string {
  if (view === 'history') return renderHistory()
  if (view === 'setup') return renderSetup()
  if (view === 'more') return renderMore()
  return renderToday()
}

function pageHeading(kicker: string, title: string, description: string): string {
  return `<section class="page-heading"><p class="kicker">${kicker}</p><h1>${title}</h1><p>${description}</p></section>`
}

function renderToday(): string {
  const pending = nextPending()
  if (!snapshot.windows.length) {
    return `${pageHeading('Actual time → next time', 'Your dose chain, without the tap marathon.', 'Group medicines that happen together. One confirmation records the actual time and starts every follow-up chain.')}
      <section class="onboarding" aria-labelledby="start-title">
        <picture><source media="(min-width: 700px)" srcset="/assets/dose-sequencer-1080.webp"><img src="/assets/dose-sequencer-720.webp" width="720" height="480" alt="Pixel-art modules joining into one stepped time chain" fetchpriority="high" decoding="async"></picture>
        <div><p class="tracker-label">NO WINDOWS YET</p><h2 id="start-title">Set the first shared time</h2><p>Add the medicine labels you already use and optional intervals from when they are actually taken.</p><button class="primary" type="button" data-act="add-window">Create first window <span aria-hidden="true">→</span></button></div>
      </section>
      ${safetyStrip()}`
  }
  const nextWindow = [...snapshot.windows].sort((a, b) => a.time.localeCompare(b.time))[0]
  return `${pageHeading(`TODAY / ${new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date()).toUpperCase()}`, 'Ready when you are.', nextWindow ? `${nextWindow.label} is scheduled ${formatTime(scheduledAt(nextWindow.time))}. Confirm from what actually happened.` : '')}
    ${pending.length ? `<section class="follow-section" aria-labelledby="follow-title"><div class="section-title"><p class="kicker">LIVE CHAINS</p><h2 id="follow-title">Follow-ups</h2></div>${pending.map(renderFollowUp).join('')}</section>` : ''}
    <section class="window-list" aria-label="Today’s medicine windows">${[...snapshot.windows].sort((a, b) => a.time.localeCompare(b.time)).map(renderWindow).join('')}</section>
    ${safetyStrip()}`
}

function renderWindow(window: DoseWindow): string {
  const logs = currentLogs(window)
  const complete = logs.length >= window.medicines.length
  const time = scheduledAt(window.time)
  return `<article class="dose-window ${complete ? 'is-complete' : ''}">
    <div class="window-time"><span>${formatTime(time)}</span><small>${complete ? `${statusIcon(logs[0]?.status ?? 'taken')} Logged` : dueLabel(time)}</small></div>
    <div class="window-body">
      <div class="window-head"><div><p class="tracker-label">${complete ? 'SET COMPLETE' : 'GROUP WINDOW'}</p><h2>${escapeHtml(window.label)}</h2></div><span class="count">${window.medicines.length} ${window.medicines.length === 1 ? 'medicine' : 'medicines'}</span></div>
      <ul class="medicine-list">${window.medicines.map(medicine => `<li><span>${escapeHtml(medicine.label)}</span>${medicine.followUpMinutes ? `<small>↳ every ${formatInterval(medicine.followUpMinutes)} after taken</small>` : '<small>No follow-up</small>'}</li>`).join('')}</ul>
      ${complete ? `<div class="logged-stamp"><span aria-hidden="true">✓</span><div><strong>${logs[0]?.status === 'late' ? 'Logged late' : logs[0]?.status === 'skipped' ? 'Skipped' : 'Taken'}</strong><small>${logs[0] ? `Recorded ${formatTime(logs[0].recordedAt)}` : ''}</small></div></div>` : `<div class="group-actions"><button class="primary group-primary" type="button" data-act="log-window" data-id="${window.id}" data-status="taken"><span aria-hidden="true">✓</span> Mark all taken now</button><div class="secondary-actions"><button type="button" data-act="log-window" data-id="${window.id}" data-status="late">Log all late</button><button type="button" data-act="log-window" data-id="${window.id}" data-status="skipped">Skip all</button></div></div>`}
    </div>
  </article>`
}

function renderFollowUp(item: FollowUp): string {
  const due = new Date(item.dueAt)
  return `<article class="follow-up"><div class="chain-pixel" aria-hidden="true"></div><div class="follow-copy"><p class="tracker-label">NEXT LINK · ${dueLabel(due).toUpperCase()}</p><h3>${escapeHtml(item.medicineLabel)}</h3><p>${formatTime(due)} · ${formatInterval(item.intervalMinutes)} from actual taken time</p></div><div class="follow-actions"><button class="primary small" type="button" data-act="complete-follow" data-id="${item.id}" data-status="taken">Mark taken</button><button type="button" data-act="complete-follow" data-id="${item.id}" data-status="skipped">Skip</button></div></article>`
}

function renderHistory(): string {
  const logs = [...snapshot.logs].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
  return `${pageHeading('LOCAL EVENT LOG', 'What you recorded.', 'A factual history of taken, late, and skipped events. It is not a medical record or adherence score.')}
    ${logs.length ? `<ol class="history-list">${logs.map(log => `<li><time datetime="${log.recordedAt}">${formatDateTime(log.recordedAt)}</time><span class="status-glyph status-${log.status}" aria-hidden="true">${statusIcon(log.status)}</span><div><strong>${escapeHtml(log.medicineLabel)}</strong><span>${escapeHtml(log.windowLabel)} · ${log.status}${log.sourceFollowUpId ? ' follow-up' : ''}</span></div></li>`).join('')}</ol>` : `<section class="plain-empty"><span class="empty-glyph" aria-hidden="true">□</span><h2>No events recorded</h2><p>When you confirm or skip a window, its events will appear here.</p><button type="button" class="primary" data-nav="today">Go to today</button></section>`}`
}

function renderSetup(): string {
  return `${pageHeading('WINDOW SETUP', 'Group what happens together.', 'Labels are for identification only. Follow-up intervals start from a recorded taken time, never the planned window time.')}
    <div class="setup-toolbar"><p>${snapshot.windows.length} ${snapshot.windows.length === 1 ? 'window' : 'windows'} · stored locally</p><button class="primary" type="button" data-act="add-window">Add window</button></div>
    ${snapshot.windows.length ? `<div class="setup-list">${[...snapshot.windows].sort((a, b) => a.time.localeCompare(b.time)).map(window => `<article><div class="setup-time">${formatTime(scheduledAt(window.time))}</div><div><h2>${escapeHtml(window.label)}</h2><p>${window.medicines.map(medicine => escapeHtml(medicine.label)).join(' · ')}</p></div><div class="row-actions"><button type="button" data-act="edit-window" data-id="${window.id}">Edit</button><button class="danger-button" type="button" data-act="delete-window" data-id="${window.id}">Delete</button></div></article>`).join('')}</div>` : `<section class="plain-empty"><span class="empty-glyph" aria-hidden="true">▦</span><h2>No shared windows</h2><p>Create a window such as “Morning” and add the medicine labels that belong together.</p><button class="primary" type="button" data-act="add-window">Create first window</button></section>`}
    ${!unlocked ? `<aside class="limit-note"><span class="pixel-lock" aria-hidden="true">◆</span><div><strong>Free plan: one complete window</strong><p>Unlimited logs, follow-up chains, notifications, and exports are included. Full unlock adds unlimited windows.</p></div><button type="button" data-nav="more">See full unlock</button></aside>` : ''}`
}

function renderMore(): string {
  return `${pageHeading('CONTROL PANEL', 'Your log. Your device.', 'Manage reminders, exports and the optional one-time unlock. Core logging never needs an account.')}
    <div class="control-grid">
      <section class="control-section" aria-labelledby="notify-title"><p class="kicker">REMINDERS</p><h2 id="notify-title">Device notifications</h2><p>Allow notifications so due follow-ups can alert you. The Android app uses scheduled local notifications; the browser version can alert while the installed app is active. Android battery settings may still delay delivery.</p><button type="button" data-act="notifications">${nativeNotificationsEnabled || ('Notification' in window && Notification.permission === 'granted') ? 'Notifications enabled' : 'Enable notifications'}</button><p class="fine-print">Dose Chain Log always shows pending follow-ups in the app. Notification permission is optional.</p></section>
      <section class="control-section" aria-labelledby="data-title"><p class="kicker">DATA OWNERSHIP</p><h2 id="data-title">Export or restore</h2><p>Download a complete JSON backup or a spreadsheet-friendly CSV event log. Import replaces this device’s current data after confirmation.</p><div class="button-row"><button type="button" data-act="export-json">Export JSON</button><button type="button" data-act="export-csv">Export CSV</button><label class="button-like" for="import-file">Import JSON</label><input class="sr-only" id="import-file" type="file" accept="application/json,.json"></div></section>
      <section class="control-section unlock" aria-labelledby="unlock-title"><p class="kicker">ONE-TIME UNLOCK</p><h2 id="unlock-title">${unlocked ? 'Full version active' : 'More windows, once.'}</h2>${unlocked ? `<p>Your cached license unlock is active. Verification happens at most once per day and never blocks logging.</p><button type="button" data-act="remove-license">Remove license from this device</button>` : `<p>₹399 one time. Add unlimited shared windows. Core logging, one window, follow-up chains, notifications, safety and all exports stay free.</p><a class="primary button-link" href="${checkoutUrl}">Buy full unlock</a><details><summary>Have a license? Restore it</summary><form id="license-form"><label for="license-token">License token</label><input id="license-token" name="token" autocomplete="off" required><button type="submit">Verify and restore</button></form></details><p class="fine-print">Checkout is hosted by Sociobot; Dodo is merchant of record. Refunds are handled there and revoke the license. See <a href="/terms/">terms</a>.</p>`}</section>
    </div>
    <section class="safety-panel" aria-labelledby="boundary-title"><p class="kicker">SAFETY BOUNDARY</p><h2 id="boundary-title">A log, not medical advice</h2><p>Use this app only to record medicines already prescribed or chosen with a qualified professional. It does not check doses, timing safety, interactions, or whether you should take a medicine.</p><p><strong>Urgent symptoms, overdose, or emergency?</strong> Contact local emergency services or poison control now. Do not wait for an app reminder.</p></section>`
}

function safetyStrip(): string {
  return `<aside class="safety-strip"><span aria-hidden="true">!</span><p><strong>This is a timing log, not medical advice.</strong> Follow your prescribed instructions. For urgent symptoms, overdose, or an emergency, contact local emergency services or poison control.</p></aside>`
}

function windowForm(window?: DoseWindow): string {
  const medicines = window?.medicines.length ? window.medicines : [{ id: uid(), label: '', followUpMinutes: null }]
  return `<form method="dialog" id="window-form" data-id="${window?.id ?? ''}">
    <div class="dialog-head"><div><p class="kicker">${window ? 'EDIT WINDOW' : 'NEW WINDOW'}</p><h2 id="dialog-title">${window ? 'Update shared time' : 'Create a shared time'}</h2></div><button class="icon-button" type="button" data-act="close-dialog" aria-label="Close">×</button></div>
    <div class="form-grid"><label>Window name<span>For example, Morning</span><input name="label" maxlength="40" required value="${escapeHtml(window?.label ?? '')}"></label><label>Planned time<span>Used to organise today</span><input name="time" type="time" required value="${window?.time ?? '08:00'}"></label></div>
    <fieldset><legend>Medicine labels</legend><p class="field-help">Add the names you already recognise. An interval is optional and starts whenever you mark that medicine taken.</p><div id="medicine-rows">${medicines.map(medicineRow).join('')}</div><button type="button" data-act="add-medicine">+ Add another medicine</button></fieldset>
    <p id="form-error" class="form-error" aria-live="assertive"></p>
    <div class="dialog-actions"><button type="button" data-act="close-dialog">Cancel</button><button class="primary" type="submit">Save window</button></div>
  </form>`
}

function medicineRow(medicine: { id: string; label: string; followUpMinutes: number | null }): string {
  return `<div class="medicine-row" data-medicine-id="${medicine.id}"><label>Medicine name<input name="medicine-label" maxlength="60" required value="${escapeHtml(medicine.label)}"></label><label>Follow-up after taken<select name="follow-up"><option value="">None</option>${[15, 30, 60, 120, 240, 360, 480, 720, 1440].map(minutes => `<option value="${minutes}" ${medicine.followUpMinutes === minutes ? 'selected' : ''}>${formatInterval(minutes)}</option>`).join('')}</select></label><button class="icon-button remove-medicine" type="button" data-act="remove-medicine" aria-label="Remove medicine">×</button></div>`
}

function bindEvents(): void {
  app.querySelectorAll<HTMLElement>('[data-nav]').forEach(element => element.addEventListener('click', event => {
    event.preventDefault(); view = element.dataset.nav as View; history.replaceState({}, '', `#${view}`); render(); app.querySelector<HTMLElement>('#main')?.focus()
  }))
  app.querySelector<HTMLFormElement>('#window-form')?.addEventListener('submit', saveWindowForm)
  app.querySelector<HTMLFormElement>('#license-form')?.addEventListener('submit', restoreLicense)
  app.querySelector<HTMLInputElement>('#import-file')?.addEventListener('change', importFile)
}

async function handleAction(event: MouseEvent): Promise<void> {
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act]')
  if (!target) return
  const action = target.dataset.act
  if (action === 'add-window') return openWindowDialog()
  if (action === 'edit-window') return openWindowDialog(snapshot.windows.find(window => window.id === target.dataset.id))
  if (action === 'close-dialog') return closeDialog(target.closest('dialog'))
  if (action === 'add-medicine') return addMedicineRow()
  if (action === 'remove-medicine') return removeMedicineRow(target)
  if (action === 'log-window') return logGroup(target.dataset.id!, target.dataset.status as DoseStatus)
  if (action === 'complete-follow') return logFollowUp(target.dataset.id!, target.dataset.status as 'taken' | 'skipped')
  if (action === 'delete-window') return confirmDelete(target.dataset.id!)
  if (action === 'undo') return performUndo()
  if (action === 'notifications') return requestNotifications()
  if (action === 'export-json') return download('dose-chain-backup.json', JSON.stringify(snapshot, null, 2), 'application/json')
  if (action === 'export-csv') return download('dose-chain-events.csv', logsToCsv(snapshot.logs), 'text/csv')
  if (action === 'remove-license') { removeLicense(); unlocked = false; render(); announce('License removed from this device.') }
}

function openWindowDialog(window?: DoseWindow): void {
  if (!window && snapshot.windows.length >= 1 && !unlocked) { view = 'more'; render(); announce('Full unlock is needed to add another window.'); return }
  previousFocus = document.activeElement as HTMLElement
  const dialog = app.querySelector<HTMLDialogElement>('#window-dialog')!
  dialog.innerHTML = windowForm(window)
  dialog.querySelector<HTMLFormElement>('form')!.addEventListener('submit', saveWindowForm)
  dialog.showModal()
  dialog.querySelector<HTMLInputElement>('input')?.focus()
}

function closeDialog(dialog: HTMLDialogElement | null): void {
  dialog?.close(); previousFocus?.focus()
}

function addMedicineRow(): void {
  const rows = app.querySelector('#medicine-rows')
  rows?.insertAdjacentHTML('beforeend', medicineRow({ id: uid(), label: '', followUpMinutes: null }))
  rows?.querySelector<HTMLInputElement>('.medicine-row:last-child input')?.focus()
}

function removeMedicineRow(button: HTMLElement): void {
  const rows = app.querySelectorAll('.medicine-row')
  if (rows.length === 1) { showFormError('A window needs at least one medicine label.'); return }
  button.closest('.medicine-row')?.remove()
}

function showFormError(message: string): void {
  const error = app.querySelector('#form-error'); if (error) error.textContent = message
}

async function saveWindowForm(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  const form = event.currentTarget as HTMLFormElement
  const rows = [...form.querySelectorAll<HTMLElement>('.medicine-row')]
  const labels = rows.map(row => row.querySelector<HTMLInputElement>('[name="medicine-label"]')!.value.trim())
  if (!labels.every(Boolean)) return showFormError('Give every medicine a label or remove its row.')
  const duplicate = labels.find((label, index) => labels.findIndex(item => item.toLowerCase() === label.toLowerCase()) !== index)
  if (duplicate) return showFormError(`“${duplicate}” appears twice. Use each label once in a window.`)
  const data = new FormData(form)
  const existing = snapshot.windows.find(window => window.id === form.dataset.id)
  const window: DoseWindow = {
    id: existing?.id ?? uid(), label: String(data.get('label')).trim(), time: String(data.get('time')),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    medicines: rows.map((row, index) => ({ id: row.dataset.medicineId!, label: labels[index]!, followUpMinutes: Number(row.querySelector<HTMLSelectElement>('[name="follow-up"]')!.value) || null })),
  }
  await saveWindow(window)
  closeDialog(form.closest('dialog'))
  await refresh()
  announce(`${window.label} saved with ${window.medicines.length} medicines.`)
}

async function logGroup(id: string, status: DoseStatus): Promise<void> {
  const window = snapshot.windows.find(item => item.id === id)
  if (!window) return
  const result = await logWindow(window, status)
  await refresh()
  const wording = status === 'taken' ? 'taken now' : status
  showToast(`${window.medicines.length} ${window.medicines.length === 1 ? 'medicine' : 'medicines'} logged ${wording}.`, async () => { await undoGroup(result.logs.map(log => log.id), result.followUps.map(followUp => followUp.id)); await refresh() })
}

async function logFollowUp(id: string, status: 'taken' | 'skipped'): Promise<void> {
  const followUp = snapshot.followUps.find(item => item.id === id)
  if (!followUp) return
  const result = await completeFollowUp(followUp, status)
  await refresh()
  showToast(`${followUp.medicineLabel} follow-up ${status}.`, async () => { await undoFollowUp(followUp, result.log.id, result.next?.id); await refresh() })
}

function confirmDelete(id: string): void {
  const window = snapshot.windows.find(item => item.id === id)
  if (!window) return
  previousFocus = document.activeElement as HTMLElement
  const dialog = app.querySelector<HTMLDialogElement>('#confirm-dialog')!
  dialog.innerHTML = `<form method="dialog"><div class="dialog-head"><div><p class="kicker">DELETE WINDOW</p><h2 id="confirm-title">Delete ${escapeHtml(window.label)}?</h2></div></div><p>Its past event history stays in your log. Pending follow-ups also stay visible until handled.</p><div class="dialog-actions"><button type="button" data-act="close-dialog">Keep window</button><button class="danger-fill" type="button" id="confirm-delete">Delete window</button></div></form>`
  dialog.querySelector('#confirm-delete')?.addEventListener('click', async () => { const deleted = await deleteWindow(id); closeDialog(dialog); await refresh(); showToast(`${window.label} deleted.`, async () => { if (deleted) await saveWindow(deleted); await refresh() }) })
  dialog.showModal(); dialog.querySelector<HTMLElement>('button')?.focus()
}

function showToast(message: string, undo?: () => Promise<void>): void {
  const toast = app.querySelector<HTMLDivElement>('#toast')!
  toast.querySelector('span')!.textContent = message
  toast.querySelector('button')!.hidden = !undo
  toast.hidden = false; undoAction = undo
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.hidden = true; undoAction = undefined }, 7000)
  announce(message)
}

async function performUndo(): Promise<void> {
  const action = undoAction; undoAction = undefined
  if (action) await action()
  const toast = app.querySelector<HTMLDivElement>('#toast'); if (toast) toast.hidden = true
  announce('Last change undone.')
}

function announce(message: string): void {
  const live = app.querySelector('#live'); if (live) live.textContent = message
}

async function requestNotifications(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const permission = await LocalNotifications.requestPermissions()
    nativeNotificationsEnabled = permission.display === 'granted'
    if (nativeNotificationsEnabled) { scheduleNotifications(); render(); announce('Notifications enabled.') }
    else showToast('Notifications were not enabled. Follow-ups still appear in the app.')
    return
  }
  if (!('Notification' in window)) return showToast('Notifications are not supported in this browser.')
  const permission = await Notification.requestPermission()
  if (permission === 'granted') { scheduleNotifications(); render(); announce('Notifications enabled.') }
  else showToast('Notifications were not enabled. Follow-ups still appear in the app.')
}

function scheduleNotifications(): void {
  reminderTimers.forEach(timer => clearTimeout(timer)); reminderTimers = []
  if (Capacitor.isNativePlatform()) {
    void scheduleNativeNotifications()
    return
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  for (const item of nextPending()) {
    const delay = new Date(item.dueAt).getTime() - Date.now()
    if (delay < 0 || delay > 2_147_000_000) continue
    reminderTimers.push(window.setTimeout(async () => {
      const registration = await navigator.serviceWorker?.ready
      await registration?.showNotification(`Follow-up: ${item.medicineLabel}`, { body: 'Due from the time you recorded it taken. Open Dose Chain Log to log what happened.', icon: '/icons/icon-192.png', tag: item.id })
    }, delay))
  }
}

async function scheduleNativeNotifications(): Promise<void> {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const permission = await LocalNotifications.checkPermissions()
  nativeNotificationsEnabled = permission.display === 'granted'
  if (!nativeNotificationsEnabled) return
  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map(item => ({ id: item.id })) })
  const notifications = nextPending().filter(item => new Date(item.dueAt).getTime() > Date.now()).map(item => ({
    id: notificationId(item.id), title: `Follow-up: ${item.medicineLabel}`,
    body: 'Due from the time you recorded it taken. Open Dose Chain Log to log what happened.',
    schedule: { at: new Date(item.dueAt), allowWhileIdle: true }, extra: { followUpId: item.id },
  }))
  if (notifications.length) await LocalNotifications.schedule({ notifications })
}

function notificationId(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  return Math.abs(hash) || 1
}

function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000); announce(`${name} downloaded.`)
}

async function importFile(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement
  const file = input.files?.[0]; if (!file) return
  const dialog = app.querySelector<HTMLDialogElement>('#confirm-dialog')!
  previousFocus = input
  dialog.innerHTML = `<form method="dialog"><div class="dialog-head"><div><p class="kicker">RESTORE BACKUP</p><h2 id="confirm-title">Replace this device’s log?</h2></div></div><p>Importing <strong>${escapeHtml(file.name)}</strong> replaces all current windows, events and pending follow-ups. Export first if you may need them.</p><p id="import-error" class="form-error" aria-live="assertive"></p><div class="dialog-actions"><button type="button" data-act="close-dialog">Cancel</button><button class="danger-fill" type="button" id="confirm-import">Replace and import</button></div></form>`
  dialog.querySelector('#confirm-import')?.addEventListener('click', async () => {
    try { await importBackup(JSON.parse(await file.text())); closeDialog(dialog); await refresh(); showToast('Backup imported.') }
    catch (error) { dialog.querySelector('#import-error')!.textContent = error instanceof Error ? error.message : 'Could not read that backup.' }
  })
  dialog.showModal(); dialog.querySelector<HTMLElement>('button')?.focus(); input.value = ''
}

async function restoreLicense(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  const form = event.currentTarget as HTMLFormElement
  const token = new FormData(form).get('token')?.toString().trim()
  if (!token) return
  storeLicense(token); const result = await verifyLicense(true)
  if (result.valid) { unlocked = true; render(); showToast(result.offline ? 'License saved. It will be checked when online.' : 'Full version restored.') }
  else { removeLicense(); unlocked = false; showToast('That license is not active. Check the token and try again.') }
}

async function refresh(): Promise<void> {
  try { snapshot = await getSnapshot(); render(); scheduleNotifications() }
  catch { app.innerHTML = `<main id="main"><section class="fatal"><p class="kicker">LOCAL STORAGE ERROR</p><h1>Your log could not open.</h1><p>The browser blocked its local database. Check site storage permissions, then reload. No data was sent anywhere.</p><button onclick="location.reload()">Reload app</button></section></main>` }
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').then(registration => {
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showToast('An app update is ready. Reload to use it.')
      })
    })
  }).catch(() => undefined)
}

window.addEventListener('online', () => { render(); verifyLicense().then(result => { if (!result.offline && !result.valid && unlocked) { unlocked = false; render(); showToast('License no longer active. The free window and all data remain available.') } }) })
window.addEventListener('offline', render)
window.addEventListener('hashchange', () => { const next = location.hash.slice(1) as View; if (['today', 'history', 'setup', 'more'].includes(next)) { view = next; render() } })

const initialView = location.hash.slice(1) as View
if (['today', 'history', 'setup', 'more'].includes(initialView)) view = initialView
app.addEventListener('click', handleAction)
if (Capacitor.isNativePlatform()) {
  import('@capacitor/local-notifications').then(async ({ LocalNotifications }) => {
    nativeNotificationsEnabled = (await LocalNotifications.checkPermissions()).display === 'granted'
  })
}
await refresh()
registerServiceWorker()
verifyLicense().then(result => { if (!result.offline && result.valid !== unlocked) { unlocked = result.valid; render() } })
