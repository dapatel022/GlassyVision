import { useOrder, type FrameType, type LensType, type LensOption, type Material } from '@/context/OrderContext';
import SelectionStep from './SelectionStep';
import PrescriptionForm from './PrescriptionForm';

export default function OrderWizard() {
    const { state, setFrameType, setLensType, setLensOption, setMaterial, nextStep } = useOrder();

    const renderStep = () => {
        switch (state.currentStep) {
            case 1:
                return (
                    <SelectionStep
                        title="What type of frames are you sending?"
                        options={[
                            { id: 'Full Rim', label: 'Full Rim', description: 'Plastic, Acetate, or Metal frames with a full rim.' },
                            { id: 'Semi-Rimless', label: 'Semi-Rimless', description: 'Frames with a half rim on top or bottom.' },
                            { id: 'Rimless', label: 'Rimless', description: 'Lenses are mounted directly to temples and bridge.' },
                        ]}
                        selectedId={state.frameType}
                        onSelect={(id) => setFrameType(id as FrameType)}
                        onNext={nextStep}
                    />
                );
            case 2:
                return (
                    <SelectionStep
                        title="Choose your lens type"
                        options={[
                            { id: 'Single Vision', label: 'Single Vision', description: 'For distance or reading only.', price: 77 },
                            { id: 'Progressive', label: 'Progressive', description: 'Multifocal lenses for distance and reading.', price: 157, recommended: true },
                            { id: 'Reading', label: 'Reading', description: 'Magnification for reading only.', price: 77 },
                            { id: 'Non-Prescription', label: 'Non-Prescription', description: 'Fashion or protection only.', price: 77 },
                        ]}
                        selectedId={state.lensType}
                        onSelect={(id) => setLensType(id as LensType)}
                        onNext={nextStep}
                    />
                );
            case 3:
                return (
                    <SelectionStep
                        title="Select lens options"
                        options={[
                            { id: 'Clear', label: 'Clear', description: 'Standard clear lenses.' },
                            { id: 'Blue Light Blocking', label: 'Blue Light Blocking', description: 'Filters harmful blue light from screens.', price: 30, recommended: true },
                            { id: 'Transitions', label: 'Transitions®', description: 'Adapts to light conditions.', price: 50 },
                            { id: 'Sunglasses', label: 'Sunglasses', description: 'Tinted or polarized lenses.', price: 40 },
                        ]}
                        selectedId={state.lensOption}
                        onSelect={(id) => setLensOption(id as LensOption)}
                        onNext={nextStep}
                    />
                );
            case 4:
                return (
                    <SelectionStep
                        title="Choose lens material"
                        options={[
                            { id: 'CR39 (Standard)', label: 'CR39 (Standard)', description: 'Basic plastic lenses.' },
                            { id: 'Polycarbonate', label: 'Polycarbonate', description: 'Impact resistant and thinner.', price: 20 },
                            { id: 'High Index 1.67', label: 'High Index 1.67', description: 'Thinner and lighter for strong Rx.', price: 40 },
                            { id: 'High Index 1.74', label: 'High Index 1.74', description: 'Thinnest and lightest available.', price: 80 },
                        ]}
                        selectedId={state.material}
                        onSelect={(id) => setMaterial(id as Material)}
                        onNext={nextStep}
                    />
                );
            case 5:
                return <PrescriptionForm />;
            case 6:
                return (
                    <div className="text-center py-20">
                        <h2 className="text-4xl font-bold text-primary mb-4">Order Complete!</h2>
                        <p className="text-xl text-gray-600">Thank you for your order.</p>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="py-8">
            {renderStep()}
        </div>
    );
}
