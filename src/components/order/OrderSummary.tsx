import { useOrder } from '@/context/OrderContext';

export default function OrderSummary() {
    const { state, totalPrice } = useOrder();

    return (
        <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl border border-white/50 sticky top-24 transition-all duration-300 hover:shadow-[0_20px_50px_rgba(8,_112,_184,_0.1)]">
            <h3 className="text-2xl font-bold text-primary mb-8 flex items-center gap-2">
                Order Summary
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
            </h3>

            <div className="space-y-6 mb-8">
                <SummaryItem label="Frame Type" value={state.frameType} />
                <SummaryItem label="Lens Type" value={state.lensType} />
                <SummaryItem label="Lens Options" value={state.lensOption} />
                <SummaryItem label="Material" value={state.material} />
            </div>

            <div className="border-t border-gray-200/50 pt-6 mb-6">
                <div className="flex justify-between items-end">
                    <span className="font-bold text-lg text-gray-600">Total</span>
                    <div className="text-right">
                        <span className="block text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
                            ${totalPrice}
                        </span>
                    </div>
                </div>
            </div>

            <div className="text-xs font-medium text-gray-500 text-center bg-gray-50/50 rounded-lg py-3">
                ✨ Free Shipping & Returns included
            </div>
        </div>
    );
}

function SummaryItem({ label, value }: { label: string, value: string | null }) {
    if (!value) return null;
    return (
        <div className="flex justify-between text-sm">
            <span className="text-gray-500">{label}</span>
            <span className="font-medium text-primary">{value}</span>
        </div>
    );
}
