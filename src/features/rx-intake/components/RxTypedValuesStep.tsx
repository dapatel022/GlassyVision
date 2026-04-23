'use client';

import { useState } from 'react';
import type { RxTypedValues } from '../actions/auto-checks';

interface RxTypedValuesStepProps {
  initialValues: RxTypedValues | null;
  onSubmit: (values: RxTypedValues) => void;
  onSkip: () => void;
}

const EMPTY_VALUES: RxTypedValues = {
  odSphere: '', odCylinder: '', odAxis: '', odAdd: '',
  osSphere: '', osCylinder: '', osAxis: '', osAdd: '',
  pd: '', pdType: 'binocular', pdOd: '', pdOs: '',
};

const FIELD_TIPS: Record<string, string> = {
  sphere: 'SPH — the lens power for nearsightedness (-) or farsightedness (+)',
  cylinder: 'CYL — correction for astigmatism (often blank if none)',
  axis: 'AXIS — angle of astigmatism correction (0-180)',
  add: 'ADD — additional magnification for reading (multifocal only)',
  pd: 'PD — pupillary distance in millimeters',
};

function Field({
  label, value, onChange, tip,
}: {
  label: string; value: string; onChange: (v: string) => void; tip: string;
}) {
  return (
    <div>
      <label className="block text-xs font-sans font-bold text-muted-soft uppercase tracking-wider mb-1">
        {label}
        <span className="ml-1 text-muted-soft cursor-help" title={tip}>?</span>
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="w-full px-3 py-2 border border-line rounded-lg text-sm font-mono bg-white focus:outline-none focus:border-accent"
      />
    </div>
  );
}

export default function RxTypedValuesStep({ initialValues, onSubmit, onSkip }: RxTypedValuesStepProps) {
  const [values, setValues] = useState<RxTypedValues>(initialValues || EMPTY_VALUES);

  function update(field: keyof RxTypedValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div>
      <h2 className="font-sans text-2xl font-black tracking-tight uppercase text-ink mb-1">
        Enter Prescription Values
      </h2>
      <p className="text-muted mb-6">
        Optional — enter the values from your prescription for a double-check. You can skip this step.
      </p>

      <div className="bg-base-deeper border border-line rounded-lg p-4 mb-6">
        <p className="text-xs text-muted-soft font-sans font-bold uppercase tracking-wider mb-2">
          Where to find these values on your prescription
        </p>
        <p className="text-sm text-muted">
          Look for a table with OD (right eye) and OS (left eye) rows. SPH, CYL, and AXIS are usually in the first three columns.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <h3 className="font-sans font-bold text-sm text-ink mb-3">OD — Right Eye</h3>
          <div className="space-y-3">
            <Field label="SPH" value={values.odSphere} onChange={(v) => update('odSphere', v)} tip={FIELD_TIPS.sphere} />
            <Field label="CYL" value={values.odCylinder} onChange={(v) => update('odCylinder', v)} tip={FIELD_TIPS.cylinder} />
            <Field label="AXIS" value={values.odAxis} onChange={(v) => update('odAxis', v)} tip={FIELD_TIPS.axis} />
            <Field label="ADD" value={values.odAdd || ''} onChange={(v) => update('odAdd', v)} tip={FIELD_TIPS.add} />
          </div>
        </div>

        <div>
          <h3 className="font-sans font-bold text-sm text-ink mb-3">OS — Left Eye</h3>
          <div className="space-y-3">
            <Field label="SPH" value={values.osSphere} onChange={(v) => update('osSphere', v)} tip={FIELD_TIPS.sphere} />
            <Field label="CYL" value={values.osCylinder} onChange={(v) => update('osCylinder', v)} tip={FIELD_TIPS.cylinder} />
            <Field label="AXIS" value={values.osAxis} onChange={(v) => update('osAxis', v)} tip={FIELD_TIPS.axis} />
            <Field label="ADD" value={values.osAdd || ''} onChange={(v) => update('osAdd', v)} tip={FIELD_TIPS.add} />
          </div>
        </div>
      </div>

      <div className="border-t border-line pt-4 mb-6">
        <div className="flex items-center gap-4 mb-3">
          <h3 className="font-sans font-bold text-sm text-ink">PD — Pupillary Distance</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => update('pdType', 'binocular')}
              className={`text-xs px-3 py-1 rounded-full ${values.pdType === 'binocular' ? 'bg-accent text-white' : 'bg-base-deeper text-muted'}`}
            >
              Single
            </button>
            <button
              onClick={() => update('pdType', 'mono')}
              className={`text-xs px-3 py-1 rounded-full ${values.pdType === 'mono' ? 'bg-accent text-white' : 'bg-base-deeper text-muted'}`}
            >
              Per Eye
            </button>
          </div>
        </div>
        {values.pdType === 'binocular' ? (
          <div className="max-w-xs">
            <Field label="PD (mm)" value={values.pd} onChange={(v) => update('pd', v)} tip={FIELD_TIPS.pd} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <Field label="OD PD" value={values.pdOd || ''} onChange={(v) => update('pdOd', v)} tip={FIELD_TIPS.pd} />
            <Field label="OS PD" value={values.pdOs || ''} onChange={(v) => update('pdOs', v)} tip={FIELD_TIPS.pd} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onSkip} className="text-sm text-muted hover:text-ink underline">
          Skip this step
        </button>
        <button
          onClick={() => onSubmit(values)}
          className="px-6 py-3 bg-accent text-white font-sans font-bold text-sm uppercase tracking-wider rounded-lg hover:bg-accent-light transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
