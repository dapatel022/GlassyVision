import { useOrder, Prescription } from '@/context/OrderContext';
import { useState } from 'react';

export default function PrescriptionForm() {
    const { state, setPrescription, nextStep } = useOrder();
    const [rx, setRx] = useState<Prescription>(state.prescription);

    const handleChange = (eye: 'od' | 'os', field: keyof Prescription['od'], value: string) => {
        setRx(prev => ({
            ...prev,
            [eye]: { ...prev[eye], [field]: value }
        }));
    };

    const handlePdChange = (value: string) => {
        setRx(prev => ({ ...prev, pd: value }));
    };

    const handleMethodChange = (method: Prescription['method']) => {
        setRx(prev => ({ ...prev, method }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setPrescription(rx);
        nextStep();
    };

    return (
        <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-primary mb-6">Enter Your Prescription</h2>

            <div className="flex gap-4 mb-10 p-1 bg-gray-100/50 rounded-full w-fit mx-auto">
                {(['manual', 'upload', 'email', 'call'] as const).map((m) => (
                    <button
                        key={m}
                        onClick={() => handleMethodChange(m)}
                        className={`px-6 py-3 rounded-full text-sm font-bold transition-all duration-300 ${rx.method === m
                            ? 'bg-white text-accent shadow-lg scale-105 ring-1 ring-black/5'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                            }`}
                    >
                        {m === 'manual' && 'Enter Manually'}
                        {m === 'upload' && 'Upload Photo'}
                        {m === 'email' && 'Email Later'}
                        {m === 'call' && 'Call My Doctor'}
                    </button>
                ))}
            </div>

            {rx.method === 'manual' && (
                <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="grid grid-cols-1 gap-6">
                        {/* OD - Right Eye */}
                        <div className="bg-gray-50 p-6 rounded-xl">
                            <h3 className="font-bold text-primary mb-4">OD (Right Eye)</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Input label="Sphere (SPH)" value={rx.od.sphere} onChange={v => handleChange('od', 'sphere', v)} />
                                <Input label="Cylinder (CYL)" value={rx.od.cylinder} onChange={v => handleChange('od', 'cylinder', v)} />
                                <Input label="Axis" value={rx.od.axis} onChange={v => handleChange('od', 'axis', v)} />
                                <Input label="Add (NV)" value={rx.od.add || ''} onChange={v => handleChange('od', 'add', v)} />
                            </div>
                        </div>

                        {/* OS - Left Eye */}
                        <div className="bg-gray-50 p-6 rounded-xl">
                            <h3 className="font-bold text-primary mb-4">OS (Left Eye)</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <Input label="Sphere (SPH)" value={rx.os.sphere} onChange={v => handleChange('os', 'sphere', v)} />
                                <Input label="Cylinder (CYL)" value={rx.os.cylinder} onChange={v => handleChange('os', 'cylinder', v)} />
                                <Input label="Axis" value={rx.os.axis} onChange={v => handleChange('os', 'axis', v)} />
                                <Input label="Add (NV)" value={rx.os.add || ''} onChange={v => handleChange('os', 'add', v)} />
                            </div>
                        </div>

                        {/* PD */}
                        <div className="bg-gray-50 p-6 rounded-xl">
                            <h3 className="font-bold text-primary mb-4">Pupillary Distance (PD)</h3>
                            <div className="max-w-xs">
                                <Input label="PD" value={rx.pd} onChange={handlePdChange} />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            className="bg-accent hover:bg-blue-600 text-white px-8 py-3 rounded-full font-bold transition-all transform hover:scale-105"
                        >
                            Review Order
                        </button>
                    </div>
                </form>
            )}

            {rx.method !== 'manual' && (
                <div className="text-center py-12 bg-gray-50 rounded-xl">
                    <p className="text-gray-600 mb-6">
                        {rx.method === 'upload' && "Please upload a photo of your prescription."}
                        {rx.method === 'email' && "We'll send you an email to request your prescription later."}
                        {rx.method === 'call' && "We'll contact your doctor to get your prescription."}
                    </p>
                    <button
                        onClick={() => { setPrescription(rx); nextStep(); }}
                        className="bg-accent hover:bg-blue-600 text-white px-8 py-3 rounded-full font-bold transition-all"
                    >
                        Continue
                    </button>
                </div>
            )}
        </div>
    );
}

function Input({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) {
    return (
        <div className="group">
            <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-widest group-focus-within:text-accent transition-colors">{label}</label>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full p-4 bg-white border border-gray-200 rounded-xl font-medium text-lg text-primary shadow-sm focus:border-accent focus:ring-4 focus:ring-accent/10 outline-none transition-all duration-300 placeholder:text-gray-300"
                placeholder="0.00"
            />
        </div>
    );
}
