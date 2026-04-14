import React from 'react';
import { Check } from 'lucide-react';

interface Option {
    id: string;
    label: string;
    description?: string;
    price?: number;
    recommended?: boolean;
}

interface SelectionStepProps {
    title: string;
    description?: string;
    options: Option[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onNext: () => void;
}

export default function SelectionStep({
    title,
    description,
    options,
    selectedId,
    onSelect,
    onNext
}: SelectionStepProps) {
    return (
        <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-primary mb-2">{title}</h2>
            {description && <p className="text-gray-600 mb-8">{description}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {options.map((option) => (
                    <button
                        key={option.id}
                        onClick={() => onSelect(option.id)}
                        className={`
              relative p-8 rounded-2xl text-left transition-all duration-300 group
              ${selectedId === option.id
                                ? 'bg-white ring-4 ring-accent/20 shadow-2xl scale-[1.02] -translate-y-1 z-10'
                                : 'bg-white shadow-lg hover:shadow-2xl hover:-translate-y-1 hover:scale-[1.01] border border-transparent hover:border-blue-100'
                            }
            `}
                    >
                        {selectedId === option.id && (
                            <div className="absolute top-4 right-4 bg-accent text-white rounded-full p-1 shadow-lg animate-in fade-in zoom-in duration-300">
                                <Check className="w-4 h-4" />
                            </div>
                        )}

                        {option.recommended && (
                            <span className="inline-block bg-gradient-to-r from-warning to-orange-400 text-white text-[10px] font-bold px-3 py-1 rounded-full mb-3 shadow-md uppercase tracking-wider">
                                Recommended
                            </span>
                        )}

                        <h3 className={`font-bold text-xl mb-2 transition-colors ${selectedId === option.id ? 'text-accent' : 'text-primary group-hover:text-accent'}`}>
                            {option.label}
                        </h3>

                        {option.description && (
                            <p className="text-sm text-gray-500 mb-4 leading-relaxed">{option.description}</p>
                        )}

                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-100">
                            {option.price && option.price > 0 ? (
                                <span className="text-lg font-bold text-primary">+${option.price}</span>
                            ) : (
                                <span className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full">Included</span>
                            )}
                        </div>
                    </button>
                ))}
            </div>

            <div className="flex justify-end">
                <button
                    onClick={onNext}
                    disabled={!selectedId}
                    className={`
            px-8 py-3 rounded-full font-bold text-white transition-all
            ${selectedId
                            ? 'bg-accent hover:bg-blue-600 transform hover:scale-105'
                            : 'bg-gray-300 cursor-not-allowed'
                        }
          `}
                >
                    Next Step
                </button>
            </div>
        </div>
    );
}
