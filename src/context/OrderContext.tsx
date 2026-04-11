'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

// --- Types ---

export type FrameType = 'Full Rim' | 'Semi-Rimless' | 'Rimless';

export type LensType = 'Single Vision' | 'Progressive' | 'Reading' | 'Non-Prescription';

export type LensOption = 'Clear' | 'Blue Light Blocking' | 'Transitions' | 'Sunglasses';

export type Material = 'CR39 (Standard)' | 'Polycarbonate' | 'High Index 1.67' | 'High Index 1.74';

export interface Prescription {
    od: { sphere: string; cylinder: string; axis: string; add?: string };
    os: { sphere: string; cylinder: string; axis: string; add?: string };
    pd: string;
    file?: File | null;
    method: 'upload' | 'manual' | 'email' | 'call';
}

export interface OrderState {
    frameType: FrameType | null;
    lensType: LensType | null;
    lensOption: LensOption | null;
    material: Material | null;
    prescription: Prescription;
    currentStep: number;
}

interface OrderContextType {
    state: OrderState;
    setFrameType: (type: FrameType) => void;
    setLensType: (type: LensType) => void;
    setLensOption: (option: LensOption) => void;
    setMaterial: (material: Material) => void;
    setPrescription: (rx: Prescription) => void;
    nextStep: () => void;
    prevStep: () => void;
    goToStep: (step: number) => void;
    totalPrice: number;
}

// --- Initial State ---

const INITIAL_STATE: OrderState = {
    frameType: null,
    lensType: null,
    lensOption: null,
    material: null,
    prescription: {
        od: { sphere: '', cylinder: '', axis: '' },
        os: { sphere: '', cylinder: '', axis: '' },
        pd: '',
        method: 'manual',
    },
    currentStep: 1,
};

// --- Context ---

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export function OrderProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<OrderState>(INITIAL_STATE);

    const setFrameType = (frameType: FrameType) => setState(prev => ({ ...prev, frameType }));
    const setLensType = (lensType: LensType) => setState(prev => ({ ...prev, lensType }));
    const setLensOption = (lensOption: LensOption) => setState(prev => ({ ...prev, lensOption }));
    const setMaterial = (material: Material) => setState(prev => ({ ...prev, material }));
    const setPrescription = (prescription: Prescription) => setState(prev => ({ ...prev, prescription }));

    const nextStep = () => setState(prev => ({ ...prev, currentStep: prev.currentStep + 1 }));
    const prevStep = () => setState(prev => ({ ...prev, currentStep: Math.max(1, prev.currentStep - 1) }));
    const goToStep = (step: number) => setState(prev => ({ ...prev, currentStep: step }));

    // Basic pricing logic (mock)
    const totalPrice = React.useMemo(() => {
        let price = 77; // Base price
        if (state.lensType === 'Progressive') price += 80;
        if (state.lensOption === 'Transitions') price += 50;
        if (state.lensOption === 'Blue Light Blocking') price += 30;
        if (state.material === 'High Index 1.67') price += 40;
        if (state.material === 'High Index 1.74') price += 80;
        return price;
    }, [state]);

    return (
        <OrderContext.Provider value={{
            state,
            setFrameType,
            setLensType,
            setLensOption,
            setMaterial,
            setPrescription,
            nextStep,
            prevStep,
            goToStep,
            totalPrice
        }}>
            {children}
        </OrderContext.Provider>
    );
}

export function useOrder() {
    const context = useContext(OrderContext);
    if (context === undefined) {
        throw new Error('useOrder must be used within an OrderProvider');
    }
    return context;
}
