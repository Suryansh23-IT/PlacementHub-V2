import { Button } from '../../components/ui/Button.jsx'
import { downloadParticipationLetter, uploadParticipationLetter } from '../../services/company.service.js'

export function ParticipationLetter({ token, profile, busy, disabled, onBusyChange, onUploaded, onMessage }) {
  const file = profile.participationLetter

  async function upload(selectedFile) {
    if (!selectedFile) return
    onMessage('', '')
    onBusyChange('upload')
    try {
      const { data } = await uploadParticipationLetter(token, selectedFile)
      onUploaded(data)
      const needsReview = profile.approvalStatus === 'approved' && data.approvalStatus === 'pending'
      onMessage('success', needsReview
        ? 'Participation Letter replaced. Your company profile now requires fresh approval.'
        : `Participation Letter ${file ? 'replaced' : 'uploaded'} successfully.`)
    } catch (error) {
      onMessage('error', error.message)
    } finally {
      onBusyChange('')
    }
  }

  async function openFile(action) {
    onMessage('', '')
    const viewer = action === 'view' ? window.open('', '_blank') : null
    if (action === 'view' && !viewer) {
      onMessage('error', 'Your browser blocked the document viewer. Allow pop-ups for PlacementHub and try again.')
      return
    }
    if (viewer) viewer.opener = null
    onBusyChange(action)
    try {
      const blob = await downloadParticipationLetter(token)
      const url = URL.createObjectURL(blob)
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      if (viewer) {
        viewer.location.href = url
      } else {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = file?.originalName || 'participation-letter.pdf'
        anchor.click()
      }
    } catch (error) {
      if (viewer) viewer.close()
      onMessage('error', error.message)
    } finally {
      onBusyChange('')
    }
  }

  const unavailable = disabled || Boolean(busy)
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-busy={Boolean(busy)}>
      <h2 className="text-xl font-bold">Participation Letter</h2>
      <p className="mt-2 text-sm text-slate-600">Upload a PDF participation letter for Placement Admin approval.</p>
      <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-slate-900">Participation Letter PDF</h3>
            <span className="text-xs font-bold text-violet-700">Required</span>
          </div>
          <p className="mt-1 break-all text-sm text-slate-500">{file?.originalName || 'No PDF uploaded'}</p>
          <p className="mt-1 text-sm font-medium text-slate-600" role="status">{busy === 'upload' ? 'Uploading…' : file ? 'Uploaded' : 'Not uploaded'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 focus-within:ring-2 focus-within:ring-violet-500 ${unavailable ? 'cursor-wait opacity-70' : 'cursor-pointer hover:bg-slate-50'}`}>
            <span>{busy === 'upload' ? 'Uploading…' : file ? 'Replace PDF' : 'Upload PDF'}</span>
            <input className="sr-only" type="file" accept="application/pdf,.pdf" disabled={unavailable} onChange={(event) => {
              const selectedFile = event.target.files?.[0]
              event.target.value = ''
              upload(selectedFile)
            }} />
          </label>
          {file && <>
            <Button variant="secondary" disabled={unavailable} onClick={() => openFile('view')}>{busy === 'view' ? 'Opening…' : 'View'}</Button>
            <Button variant="secondary" disabled={unavailable} onClick={() => openFile('download')}>{busy === 'download' ? 'Downloading…' : 'Download'}</Button>
          </>}
        </div>
      </div>
    </section>
  )
}
