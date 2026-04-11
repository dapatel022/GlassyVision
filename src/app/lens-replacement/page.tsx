'use client';

import { OrderProvider } from '@/context/OrderContext';
import OrderWizard from '@/components/order/OrderWizard';
import OrderSummary from '@/components/order/OrderSummary';

export default function LensReplacementPage() {
    return (
        <OrderProvider>
            <div className="min-h-screen py-12 bg-gradient-to-br from-blue-50 via-white to-purple-50 animate-gradient bg-[length:400%_400%]">
                <div className="container mx-auto px-4">
                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* Main Wizard Area */}
                        <div className="flex-1">
                            <OrderWizard />
                        </div>

                        {/* Sidebar Summary */}
                        <div className="w-full lg:w-80">
                            <OrderSummary />
                        </div>
                    </div>
                </div>
            </div>
        </OrderProvider>
    );
}
