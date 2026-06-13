'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { moveJob } from '../actions/move-job';
import { addQcPhoto } from '../actions/add-qc-photo';
import type { Database } from '@/lib/supabase/types';

type KanbanColumn = Database['public']['Enums']['kanban_column'];

interface WorkOrder {
  id: string;
  work_order_number: string;
  frame_sku: string;
  frame_shape: string | null;
  frame_color: string | null;
  frame_size: string | null;
  lens_type: string;
  lens_material: string;
  tint: string | null;
  monocular_pd_od: number | null;
  monocular_pd_os: number | null;
  released_to_lab_at: string | null;
}

interface OrderSummary {
  shopify_order_number: string;
  customer_name: string;
  customer_email: string;
}

interface RxValues {
  typed_od_sphere: string | null;
  typed_od_cylinder: string | null;
  typed_od_axis: string | null;
  typed_os_sphere: string | null;
  typed_os_cylinder: string | null;
  typed_os_axis: string | null;
  typed_pd: string | null;
  rxImageUrl: string;
}

interface Props {
  workOrder: WorkOrder;
  order: OrderSummary;
  rx: RxValues;
  jobId: string;
  initialColumn: KanbanColumn;
  qcPhotos: string[];
}

const STAGES: { column: KanbanColumn; label: string; actionText: string; description: string }[] = [
  { column: 'inbox', label: 'Inbox', actionText: 'Move to Inbox', description: 'Pending release' },
  { column: 'ready_to_cut', label: 'Ready to Cut', actionText: 'Start Lens Prep & Move to Cut', description: 'Align blocker to axis & tape lens' },
  { column: 'on_edger', label: 'On Edger', actionText: 'Lock Lens in Edger & Start Milling', description: 'Edger machine milling frame profile' },
  { column: 'on_bench', label: 'On Bench', actionText: 'Finish Milling & Begin Frame Assembly', description: 'Assemble lenses into frame & adjust alignment' },
  { column: 'qc', label: 'Quality Control', actionText: 'Send to QC Inspection', description: 'Inspect optical centers, axis alignment & scratch check' },
  { column: 'ship', label: 'Ready to Ship', actionText: 'Approve QC & Send to Shipping Dispatch', description: 'Clean, wrap, place in case, and transfer to shipping queue' },
];

export default function LabWorkOrderDetail({ workOrder, order, rx, jobId, initialColumn, qcPhotos: initialQcPhotos }: Props) {
  const router = useRouter();
  const [column, setColumn] = useState<KanbanColumn>(initialColumn);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // QC Photo Upload State
  const [uploading, setUploading] = useState(false);
  const [qcPhotos, setQcPhotos] = useState<string[]>(initialQcPhotos);

  // Bench Checklist State
  const [checklist, setChecklist] = useState({
    warmFrame: false,
    verifyPd: false,
    blockerAlign: false,
    edgeMilling: false,
    bevelEdges: false,
    verifyLensometer: false,
    screwTension: false,
    polishLint: false,
  });

  const odAxis = parseInt(rx.typed_od_axis || '0') || 0;
  const osAxis = parseInt(rx.typed_os_axis || '0') || 0;
  // PD is required to center lenses. If none was supplied, do NOT silently render
  // a fabricated 63mm/31.5mm as if real — flag it and fall back to a neutral
  // centered position purely so the guide draws, with a visible warning.
  const pdMissing = !rx.typed_pd && workOrder.monocular_pd_od == null && workOrder.monocular_pd_os == null;
  const pdOffset = parseFloat(rx.typed_pd || '') || 63;
  const monocularOd = workOrder.monocular_pd_od ?? (rx.typed_pd ? pdOffset / 2 : 32);
  const monocularOs = workOrder.monocular_pd_os ?? (rx.typed_pd ? pdOffset / 2 : 32);

  // Active stage index
  const activeIdx = STAGES.findIndex((s) => s.column === column);
  const nextStage = activeIdx < STAGES.length - 1 ? STAGES[activeIdx + 1] : null;

  async function handleMoveToStage(targetStage: KanbanColumn) {
    if (targetStage === 'ship' && qcPhotos.length === 0) {
      setError('Please upload at least 1 QC validation photo before sending to shipping.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await moveJob(jobId, targetStage);
    if (res.success) {
      setColumn(targetStage);
      router.refresh();
    } else {
      setError(res.error ?? 'Failed to move stage');
    }
    setSubmitting(false);
  }

  async function handleQcUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const urlRes = await fetch('/api/lab/qc-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, filename: file.name, mimeType: file.type || 'image/jpeg' }),
      });
      if (!urlRes.ok) throw new Error('Failed to generate upload signed URL');
      const { signedUrl, storagePath } = await urlRes.json();
      
      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'true' },
        body: file,
      });
      if (!putRes.ok) throw new Error('Failed to upload file to storage');

      const save = await addQcPhoto(jobId, storagePath);
      if (save.success) {
        // Fetch a signed read URL to render the preview.
        const { signedUrl } = await fetch('/api/lab/qc-preview-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: storagePath }),
        }).then((r) => r.json());

        setQcPhotos((prev) => [...prev, signedUrl || '']);
      } else {
        throw new Error(save.error ?? 'Failed to link photo to database');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <Link href="/lab" className="text-xs font-mono text-accent hover:underline uppercase tracking-wider font-bold">
            ← Back to Lab Workbench
          </Link>
          <h1 className="font-sans text-3xl font-black tracking-tight uppercase text-ink mt-2">
            Work Job Sheet: {workOrder.work_order_number}
          </h1>
          <p className="text-xs text-muted-soft font-mono">Job ID: {jobId} · Column: <span className="text-accent uppercase font-bold">{column.replace(/_/g, ' ')}</span></p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/api/work-orders/${workOrder.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-line text-ink font-sans font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-base-deeper transition"
          >
            🖨️ Print Job Sheet PDF
          </a>
        </div>
      </div>

      {/* STAGES TIMELINE NAVIGATOR */}
      <div className="bg-white border border-line rounded-2xl p-6 shadow-sm">
        <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-soft mb-4">Assembly Stage Navigator</p>
        <div className="grid grid-cols-6 gap-2">
          {STAGES.map((s, idx) => {
            const isCompleted = idx < activeIdx;
            const isActive = idx === activeIdx;
            return (
              <button
                key={s.column}
                onClick={() => handleMoveToStage(s.column)}
                disabled={submitting}
                className={`p-3 border rounded-xl text-left transition-all ${
                  isActive
                    ? 'border-accent bg-accent/5 ring-1 ring-accent font-bold'
                    : isCompleted
                    ? 'border-success bg-success/[0.02] text-success hover:border-accent'
                    : 'border-line bg-white hover:border-muted'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider">
                    {s.label}
                  </span>
                  {isCompleted && <span className="text-xs">✓</span>}
                </div>
                <p className="text-[9px] text-muted-soft mt-1 leading-normal truncate">{s.description}</p>
              </button>
            );
          })}
        </div>

        {nextStage && (
          <div className="mt-6 flex flex-col md:flex-row items-center justify-between border-t border-line/50 pt-4 gap-4">
            <div className="text-left">
              <p className="text-[10px] font-mono font-bold text-muted-soft uppercase">Next Action Requirement:</p>
              <p className="text-sm font-sans font-semibold text-ink mt-0.5">{nextStage.description}</p>
            </div>
            <button
              onClick={() => handleMoveToStage(nextStage.column)}
              disabled={submitting}
              className="px-6 py-3 bg-accent hover:bg-accent-light text-white text-xs font-sans font-bold uppercase tracking-wider rounded-lg transition disabled:opacity-50"
            >
              {submitting ? 'Updating Stage...' : nextStage.actionText} →
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-error/20 rounded-lg text-sm text-error font-mono">
            ⚠️ {error}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Job parameters, Blocker, Checklist */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* DIGITAL LENS BLOCKER / AXIS DIAGRAM */}
          <div className="bg-white border border-line rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <h2 className="font-sans font-black text-lg text-ink uppercase tracking-tight">Digital Lens Blocker alignment guide</h2>
              <p className="text-xs text-muted-soft font-serif italic">Use this visual guide to calibrate lens axes and PD offsets on the blocker.</p>
            </div>

            {pdMissing && (
              <div className="bg-error/10 border border-error/30 rounded-lg p-3 text-sm text-error font-bold">
                ⚠ No PD on file — the pupil markers below are shown centered as a placeholder only.
                Confirm the patient&apos;s PD before cutting; do not rely on these positions.
              </div>
            )}

            <div className="bg-base rounded-2xl p-6 border border-line flex flex-col md:flex-row items-center justify-center gap-12">
              
              {/* RIGHT LENS (OD) */}
              <div className="flex flex-col items-center gap-3">
                <span className="font-mono text-xs uppercase font-bold text-accent">Right Lens (OD)</span>
                <div className="relative w-44 h-44 bg-white border-2 border-line rounded-full flex items-center justify-center shadow-inner">
                  {/* Visual Curvatures / Guides */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
                    {/* Ring grids */}
                    <circle cx="50" cy="50" r="35" stroke="#dde3ea" strokeWidth="0.5" fill="none" strokeDasharray="2 2" />
                    <circle cx="50" cy="50" r="20" stroke="#dde3ea" strokeWidth="0.5" fill="none" strokeDasharray="2 2" />
                    {/* Center crosshair */}
                    <line x1="10" y1="50" x2="90" y2="50" stroke="#cbd5e1" strokeWidth="0.75" />
                    <line x1="50" y1="10" x2="50" y2="90" stroke="#cbd5e1" strokeWidth="0.75" />
                    {/* Cylinder Axis Angle Rotated Line */}
                    <line
                      x1="10"
                      y1="50"
                      x2="90"
                      y2="50"
                      stroke="#1a3a8a"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      transform={`rotate(${-odAxis}, 50, 50)`}
                    />
                  </svg>
                  {/* Pupil indicator centered or offset by monocular PD */}
                  <div
                    className="absolute w-3.5 h-3.5 rounded-full bg-success/80 border-2 border-white flex items-center justify-center text-[7px] text-white font-mono font-bold shadow animate-pulse"
                    style={{ transform: `translateX(${(monocularOd - 32) * 2}px)` }}
                    title={`Pupil Center (Monocular PD: ${monocularOd}mm)`}
                  >
                    +
                  </div>
                  {/* Degree indicator badge */}
                  <span className="absolute bottom-2 font-mono text-[9px] font-bold bg-accent text-white px-2 py-0.5 rounded">
                    Axis: {odAxis}°
                  </span>
                </div>
                <div className="text-center font-mono text-xs">
                  <p className="text-muted-soft">SPH: <span className="font-bold text-ink">{rx.typed_od_sphere || '0.00'}</span></p>
                  <p className="text-muted-soft">CYL: <span className="font-bold text-ink">{rx.typed_od_cylinder || '0.00'}</span></p>
                </div>
              </div>

              {/* CENTER BRIDGE OFFSET */}
              <div className="text-center font-mono text-xs border-y border-line py-3 px-4 bg-white rounded-lg shadow-sm">
                <p className="text-muted-soft uppercase font-bold text-[9px] tracking-wider">Bridge Reference</p>
                <p className="font-bold text-accent text-lg mt-0.5">{pdOffset}mm</p>
                <p className="text-[9px] text-muted font-serif italic mt-0.5">Total Binocular PD</p>
                <div className="flex gap-4 mt-2 border-t border-line/60 pt-2 text-[10px] text-muted-soft">
                  <span>OD: {monocularOd}mm</span>
                  <span>OS: {monocularOs}mm</span>
                </div>
              </div>

              {/* LEFT LENS (OS) */}
              <div className="flex flex-col items-center gap-3">
                <span className="font-mono text-xs uppercase font-bold text-accent">Left Lens (OS)</span>
                <div className="relative w-44 h-44 bg-white border-2 border-line rounded-full flex items-center justify-center shadow-inner">
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="35" stroke="#dde3ea" strokeWidth="0.5" fill="none" strokeDasharray="2 2" />
                    <circle cx="50" cy="50" r="20" stroke="#dde3ea" strokeWidth="0.5" fill="none" strokeDasharray="2 2" />
                    <line x1="10" y1="50" x2="90" y2="50" stroke="#cbd5e1" strokeWidth="0.75" />
                    <line x1="50" y1="10" x2="50" y2="90" stroke="#cbd5e1" strokeWidth="0.75" />
                    <line
                      x1="10"
                      y1="50"
                      x2="90"
                      y2="50"
                      stroke="#1a3a8a"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      transform={`rotate(${-osAxis}, 50, 50)`}
                    />
                  </svg>
                  <div
                    className="absolute w-3.5 h-3.5 rounded-full bg-success/80 border-2 border-white flex items-center justify-center text-[7px] text-white font-mono font-bold shadow animate-pulse"
                    style={{ transform: `translateX(${-(monocularOs - 32) * 2}px)` }}
                    title={`Pupil Center (Monocular PD: ${monocularOs}mm)`}
                  >
                    +
                  </div>
                  <span className="absolute bottom-2 font-mono text-[9px] font-bold bg-accent text-white px-2 py-0.5 rounded">
                    Axis: {osAxis}°
                  </span>
                </div>
                <div className="text-center font-mono text-xs">
                  <p className="text-muted-soft">SPH: <span className="font-bold text-ink">{rx.typed_os_sphere || '0.00'}</span></p>
                  <p className="text-muted-soft">CYL: <span className="font-bold text-ink">{rx.typed_os_cylinder || '0.00'}</span></p>
                </div>
              </div>

            </div>
          </div>

          {/* TECHNICIAN BENCH CHECKLIST */}
          <div className="bg-white border border-line rounded-2xl p-6 shadow-sm space-y-4">
            <div>
              <h2 className="font-sans font-black text-lg text-ink uppercase tracking-tight">Optometrist Bench Checklist</h2>
              <p className="text-xs text-muted-soft font-serif italic">Complete every calibration checkpoint at the workbench before QC signoff.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-start gap-3 p-4 border border-line rounded-xl hover:bg-base/30 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checklist.warmFrame}
                  onChange={(e) => setChecklist(prev => ({ ...prev, warmFrame: e.target.checked }))}
                  className="mt-1 rounded border-line text-accent focus:ring-accent"
                />
                <div>
                  <p className="font-sans font-bold text-xs uppercase text-ink">Acetate Heating</p>
                  <p className="text-[10px] text-muted-soft mt-0.5">Warmed frame acetate slightly to avoid cracks during lens snap insertion.</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border border-line rounded-xl hover:bg-base/30 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checklist.verifyPd}
                  onChange={(e) => setChecklist(prev => ({ ...prev, verifyPd: e.target.checked }))}
                  className="mt-1 rounded border-line text-accent focus:ring-accent"
                />
                <div>
                  <p className="font-sans font-bold text-xs uppercase text-ink">PD Centering Verified</p>
                  <p className="text-[10px] text-muted-soft mt-0.5">Monocular values ({monocularOd} / {monocularOs} mm) confirmed on layout blocker.</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border border-line rounded-xl hover:bg-base/30 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checklist.blockerAlign}
                  onChange={(e) => setChecklist(prev => ({ ...prev, blockerAlign: e.target.checked }))}
                  className="mt-1 rounded border-line text-accent focus:ring-accent"
                />
                <div>
                  <p className="font-sans font-bold text-xs uppercase text-ink">Blocker Taped</p>
                  <p className="text-[10px] text-muted-soft mt-0.5">Tape pad placed and locked on center to prevent rotational slippage.</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border border-line rounded-xl hover:bg-base/30 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checklist.edgeMilling}
                  onChange={(e) => setChecklist(prev => ({ ...prev, edgeMilling: e.target.checked }))}
                  className="mt-1 rounded border-line text-accent focus:ring-accent"
                />
                <div>
                  <p className="font-sans font-bold text-xs uppercase text-ink">Edger Sizing Calibrated</p>
                  <p className="text-[10px] text-muted-soft mt-0.5">Milling parameters set to match frame model size ({workOrder.frame_size || 'M'}).</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border border-line rounded-xl hover:bg-base/30 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checklist.bevelEdges}
                  onChange={(e) => setChecklist(prev => ({ ...prev, bevelEdges: e.target.checked }))}
                  className="mt-1 rounded border-line text-accent focus:ring-accent"
                />
                <div>
                  <p className="font-sans font-bold text-xs uppercase text-ink">Safety Bevel Polished</p>
                  <p className="text-[10px] text-muted-soft mt-0.5">Hand-ground safety bevel on the inner rim to avoid micro-fractures.</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border border-line rounded-xl hover:bg-base/30 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checklist.verifyLensometer}
                  onChange={(e) => setChecklist(prev => ({ ...prev, verifyLensometer: e.target.checked }))}
                  className="mt-1 rounded border-line text-accent focus:ring-accent"
                />
                <div>
                  <p className="font-sans font-bold text-xs uppercase text-ink">Lensometer Verification</p>
                  <p className="text-[10px] text-muted-soft mt-0.5">Confirmed finished sphere power matches SPH: {rx.typed_od_sphere}/{rx.typed_os_sphere}.</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border border-line rounded-xl hover:bg-base/30 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checklist.screwTension}
                  onChange={(e) => setChecklist(prev => ({ ...prev, screwTension: e.target.checked }))}
                  className="mt-1 rounded border-line text-accent focus:ring-accent"
                />
                <div>
                  <p className="font-sans font-bold text-xs uppercase text-ink">Hinge Tension & Balance</p>
                  <p className="text-[10px] text-muted-soft mt-0.5">Tightened double pins/screws and checked 4-point temple alignment.</p>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border border-line rounded-xl hover:bg-base/30 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checklist.polishLint}
                  onChange={(e) => setChecklist(prev => ({ ...prev, polishLint: e.target.checked }))}
                  className="mt-1 rounded border-line text-accent focus:ring-accent"
                />
                <div>
                  <p className="font-sans font-bold text-xs uppercase text-ink">Microfiber Final Polish</p>
                  <p className="text-[10px] text-muted-soft mt-0.5">Lenses wiped clear of benchmark markings, fingerprints, and lint.</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Right Column: Spec card & QC Upload */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* BUILD SPECS SUMMARY CARD */}
          <div className="bg-white border border-line rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-sans font-black text-sm uppercase tracking-wider text-muted-soft">Build Parameters</h3>
            <div className="space-y-3.5 text-xs font-mono">
              <div className="flex justify-between border-b border-line pb-1.5"><span className="text-muted-soft">CUSTOMER</span><span className="text-ink font-bold">{order.customer_name}</span></div>
              <div className="flex justify-between border-b border-line pb-1.5"><span className="text-muted-soft">ORDER NO</span><span className="text-ink font-bold">{order.shopify_order_number}</span></div>
              <div className="flex justify-between border-b border-line pb-1.5"><span className="text-muted-soft">FRAME SKU</span><span className="text-ink font-bold">{workOrder.frame_sku}</span></div>
              <div className="flex justify-between border-b border-line pb-1.5"><span className="text-muted-soft">MATERIAL</span><span className="text-ink font-bold capitalize">{workOrder.frame_color} {workOrder.frame_shape}</span></div>
              <div className="flex justify-between border-b border-line pb-1.5"><span className="text-muted-soft">LENS TYPE</span><span className="text-accent font-bold uppercase">{workOrder.lens_type.replace(/_/g, ' ')}</span></div>
              <div className="flex justify-between border-b border-line pb-1.5"><span className="text-muted-soft">MATERIAL</span><span className="text-ink font-bold uppercase">{workOrder.lens_material}</span></div>
              <div className="flex justify-between border-b border-line pb-1.5"><span className="text-muted-soft">TINT</span><span className="text-ink font-bold uppercase">{workOrder.tint || 'none'}</span></div>
            </div>
            
            <div className="pt-2 text-center">
              <Link
                href={rx.rxImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-accent underline font-bold uppercase tracking-wider"
              >
                👁️ View Customer Uploaded Rx Image
              </Link>
            </div>
          </div>

          {/* QC IMAGE UPLOADER */}
          <div className="bg-white border border-line rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="font-sans font-black text-sm uppercase tracking-wider text-muted-soft">QC Photo Verification</h3>
            <p className="text-xs text-muted leading-relaxed">Ensure a high-resolution bench photo is uploaded to confirm physical alignment and cosmetics before release.</p>

            <div className="space-y-4">
              {qcPhotos.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {qcPhotos.map((url, i) => (
                    <div key={i} className="aspect-square rounded-lg border border-line overflow-hidden bg-base relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`QC Photo ${i+1}`} className="w-full h-full object-cover" />
                      <span className="absolute bottom-1 right-1 bg-black/60 text-white font-mono text-[8px] px-1 rounded">
                        Photo #{i+1}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-line rounded-xl p-8 text-center bg-base/50">
                  <p className="text-xs text-muted-soft font-serif italic">No verification photos uploaded yet.</p>
                </div>
              )}

              <label className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-line rounded-lg text-xs font-sans font-bold uppercase tracking-wider cursor-pointer hover:bg-base-deeper transition">
                {uploading ? 'Uploading Photo…' : '📷 Take/Upload QC Photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/heic,image/heif"
                  capture="environment"
                  className="hidden"
                  onChange={handleQcUpload}
                  disabled={uploading}
                />
              </label>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
