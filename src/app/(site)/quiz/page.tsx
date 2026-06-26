'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface QuizStep {
  question: string;
  sub: string;
  field: 'shape' | 'size' | 'style' | 'intent';
  options: Array<{
    value: string;
    label: string;
    description: string;
    icon?: string;
  }>;
}

const QUIZ_STEPS: QuizStep[] = [
  {
    question: "What shape is your face?",
    sub: "This helps us identify which frame geometries will balance your features.",
    field: "shape",
    options: [
      { value: "oval", label: "Oval / Round Face", description: "Soft cheeks, curved chin. Recommends: Structured Square or Geometric frames." },
      { value: "square", label: "Square / Rectangular Face", description: "Strong jawline, broad forehead. Recommends: Round, Oval, or Curved frames." },
      { value: "heart", label: "Heart / Triangle Face", description: "Broad forehead, narrow chin. Recommends: Bottom-heavy, Aviator, or Rounded frames." },
      { value: "diamond", label: "Diamond / Angular Face", description: "Wide cheekbones, narrow forehead and jaw. Recommends: Cat-eye or Rimless frames." },
    ],
  },
  {
    question: "How do standard sunglasses fit your face?",
    sub: "Frame width is the key metric to ensure your glasses do not pinch or slip.",
    field: "size",
    options: [
      { value: "S", label: "Narrow Fit", description: "Standard glasses feel loose or slip down my nose. (Ideal width: < 130mm)" },
      { value: "M", label: "Medium Fit", description: "Standard glasses fit comfortably without pinching. (Ideal width: 130mm - 139mm)" },
      { value: "L", label: "Wide Fit", description: "Standard glasses feel tight or pinch the sides of my temples. (Ideal width: > 140mm)" },
    ],
  },
  {
    question: "Choose your style archetype:",
    sub: "We'll filter the materials and colors that fit your daily aesthetic.",
    field: "style",
    options: [
      { value: "editorial", label: "Bold Editorial", description: "Thick hand-polished acetate, tortoise details, statement pieces." },
      { value: "minimalist", label: "Tech Minimalist", description: "Sleek metal profiles, thin lines, industrial gray and black tones." },
      { value: "classic", label: "Warm Classic", description: "Timeless wire-rims, soft amber shades, retro shapes." },
    ],
  },
  {
    question: "What is your prescription intent?",
    sub: "Different lenses (progressive vs. single-vision) match better with certain frame sizes.",
    field: "intent",
    options: [
      { value: "rx_clear", label: "Prescription Glasses", description: "Clear lenses for distance, reading, or everyday screen work." },
      { value: "rx_sun", label: "Prescription Sunglasses", description: "Darkened lenses with UV filter tailored to your prescription." },
      { value: "plano_sun", label: "Non-Rx Sunglasses", description: "Plano sunglasses for style, no prescription values required." },
      { value: "demo_only", label: "Frame Only", description: "Clear non-prescription demo lenses. Fits any standard Rx fit." },
    ],
  },
];

function QuizOptionGraphic({ field, value, active }: { field: string; value: string; active: boolean }) {
  const strokeColor = active ? 'stroke-accent' : 'stroke-muted';
  const fillColor = active ? 'fill-accent/10' : 'fill-none';

  if (field === 'shape') {
    switch (value) {
      case 'oval':
        return (
          <svg width="50" height="50" viewBox="0 0 60 60" className="flex-none transition-all duration-300">
            {/* Oval Face Outline */}
            <ellipse cx="30" cy="30" rx="16" ry="22" className={`${strokeColor} ${fillColor} transition-colors`} strokeWidth="1.5" />
            {/* Suggested Square Frame Silhouette */}
            <g className={`${active ? 'stroke-accent-light' : 'stroke-muted-soft'} transition-colors`} strokeWidth="1.2" strokeDasharray="2,2" fill="none">
              <rect x="18" y="24" width="10" height="8" rx="1" />
              <rect x="32" y="24" width="10" height="8" rx="1" />
              <line x1="28" y1="26" x2="32" y2="26" />
            </g>
          </svg>
        );
      case 'square':
        return (
          <svg width="50" height="50" viewBox="0 0 60 60" className="flex-none transition-all duration-300">
            {/* Square Face Outline */}
            <path
              d="M 16,10 C 24,10 36,10 44,10 C 44,10 46,36 44,44 C 42,48 38,50 30,50 C 22,50 18,48 16,44 C 14,36 16,10 16,10 Z"
              className={`${strokeColor} ${fillColor} transition-colors`}
              strokeWidth="1.5"
              fill="none"
            />
            {/* Suggested Round Frame Silhouette */}
            <g className={`${active ? 'stroke-accent-light' : 'stroke-muted-soft'} transition-colors`} strokeWidth="1.2" strokeDasharray="2,2" fill="none">
              <circle cx="22" cy="26" r="4.5" />
              <circle cx="38" cy="26" r="4.5" />
              <line x1="26.5" y1="26" x2="33.5" y2="26" />
            </g>
          </svg>
        );
      case 'heart':
        return (
          <svg width="50" height="50" viewBox="0 0 60 60" className="flex-none transition-all duration-300">
            {/* Heart/Triangle Face Outline */}
            <path
              d="M 30,50 C 18,38 14,30 14,20 C 14,12 21,8 30,14 C 39,8 46,12 46,20 C 46,30 42,38 30,50 Z"
              className={`${strokeColor} ${fillColor} transition-colors`}
              strokeWidth="1.5"
              fill="none"
            />
            {/* Suggested Aviator/Bottom-heavy Frame Silhouette */}
            <g className={`${active ? 'stroke-accent-light' : 'stroke-muted-soft'} transition-colors`} strokeWidth="1.2" strokeDasharray="2,2" fill="none">
              <path d="M 18,22 C 18,22 21,21 26,22 C 26,25 25,29 22,29 C 19,29 18,26 18,22 Z" />
              <path d="M 42,22 C 42,22 39,21 34,22 C 34,25 35,29 38,29 C 41,29 42,26 42,22 Z" />
              <line x1="26" y1="23" x2="34" y2="23" />
            </g>
          </svg>
        );
      case 'diamond':
        return (
          <svg width="50" height="50" viewBox="0 0 60 60" className="flex-none transition-all duration-300">
            {/* Diamond Face Outline */}
            <path
              d="M 30,8 L 47,30 L 30,52 L 13,30 Z"
              className={`${strokeColor} ${fillColor} transition-colors`}
              strokeWidth="1.5"
              fill="none"
            />
            {/* Suggested Cat-Eye Frame Silhouette */}
            <g className={`${active ? 'stroke-accent-light' : 'stroke-muted-soft'} transition-colors`} strokeWidth="1.2" strokeDasharray="2,2" fill="none">
              <path d="M 16,24 C 20,22 27,24 27,26 C 27,28 24,30 20,30 C 16,30 16,26 16,24 Z" />
              <path d="M 44,24 C 40,22 33,24 33,26 C 33,28 36,30 40,30 C 44,30 44,26 44,24 Z" />
              <line x1="27" y1="26" x2="33" y2="26" />
            </g>
          </svg>
        );
      default:
        return null;
    }
  }

  if (field === 'size') {
    // Width guide sizes
    let widthVal = 20;
    if (value === 'M') widthVal = 30;
    if (value === 'L') widthVal = 40;

    return (
      <svg width="50" height="50" viewBox="0 0 60 60" className="flex-none transition-all duration-300">
        {/* Frame Width line */}
        <line x1="10" y1="25" x2="50" y2="25" className={`${strokeColor} transition-colors`} strokeWidth="1.2" strokeDasharray="2,2" />
        <circle cx="10" cy="25" r="1.5" className={active ? 'fill-accent' : 'fill-muted'} />
        <circle cx="50" cy="25" r="1.5" className={active ? 'fill-accent' : 'fill-muted'} />
        
        {/* Glasses rendering scale */}
        <g className={`${strokeColor} transition-colors`} strokeWidth="1.2" fill="none">
          <rect x={30 - widthVal/2} y="20" width={widthVal/2 - 2} height="10" rx="1.5" />
          <rect x="32" y="20" width={widthVal/2 - 2} height="10" rx="1.5" />
          <line x1={30 - 2} y1="23" x2="32" y2="23" />
        </g>
        
        {/* Caliper guide arrows */}
        <path d="M 8,37 L 4,37 L 4,43 M 52,37 L 56,37 L 56,43" className="stroke-muted-soft" strokeWidth="1" fill="none" />
        <line x1="4" y1="40" x2="56" y2="40" className="stroke-muted-soft" strokeWidth="1" strokeDasharray="1,2" />
        <text x="30" y="48" textAnchor="middle" className="fill-muted-soft font-mono text-[7px] uppercase font-bold">
          {value === 'S' ? '<130mm' : value === 'M' ? '130-139mm' : '>140mm'}
        </text>
      </svg>
    );
  }

  if (field === 'style') {
    switch (value) {
      case 'editorial':
        return (
          <svg width="50" height="50" viewBox="0 0 60 60" className="flex-none transition-all duration-300">
            {/* Bold chunky acetate frame */}
            <g className={`${strokeColor} transition-colors`} strokeWidth="2.5" fill="none">
              <circle cx="20" cy="30" r="8" />
              <circle cx="40" cy="30" r="8" />
              <line x1="28" y1="28" x2="32" y2="28" />
            </g>
            <circle cx="10" cy="27" r="1.2" className={active ? 'fill-accent' : 'fill-muted'} />
            <circle cx="50" cy="27" r="1.2" className={active ? 'fill-accent' : 'fill-muted'} />
          </svg>
        );
      case 'minimalist':
        return (
          <svg width="50" height="50" viewBox="0 0 60 60" className="flex-none transition-all duration-300">
            {/* Ultra thin square metal frame */}
            <g className={`${strokeColor} transition-colors`} strokeWidth="1" fill="none">
              <rect x="13" y="24" width="12" height="12" rx="1.5" />
              <rect x="35" y="24" width="12" height="12" rx="1.5" />
              <line x1="25" y1="28" x2="35" y2="28" />
            </g>
          </svg>
        );
      case 'classic':
        return (
          <svg width="50" height="50" viewBox="0 0 60 60" className="flex-none transition-all duration-300">
            {/* Aviator wire frame */}
            <g className={`${strokeColor} transition-colors`} strokeWidth="1.2" fill="none">
              <path d="M 14,24 C 14,24 18,22 25,24 C 25,28 23,34 19,34 C 15,34 14,30 14,24 Z" />
              <path d="M 46,24 C 46,24 42,22 35,24 C 35,28 37,34 41,34 C 45,34 46,30 46,24 Z" />
              {/* Double bridge */}
              <line x1="25" y1="25" x2="35" y2="25" />
              <line x1="25" y1="28" x2="35" y2="28" />
            </g>
          </svg>
        );
      default:
        return null;
    }
  }

  if (field === 'intent') {
    const strokeValue = active ? 'stroke-accent' : 'stroke-muted';
    const glassReflect = (
      <path d="M 17,20 L 23,14" className={active ? 'stroke-accent/30' : 'stroke-muted-soft/20'} strokeWidth="1.5" />
    );
    switch (value) {
      case 'rx_clear':
        return (
          <svg width="50" height="50" viewBox="0 0 40 40" className="flex-none transition-all duration-300">
            {/* Clear prescription lens */}
            <circle cx="20" cy="20" r="14" className={`${strokeValue} transition-colors`} strokeWidth="1.2" fill="none" />
            {glassReflect}
            <path d="M 15,20 L 19,24 L 27,16" className="stroke-accent" strokeWidth="1.2" fill="none" strokeDasharray="1,1" style={{ opacity: active ? 1 : 0.3 }} />
          </svg>
        );
      case 'rx_sun':
      case 'plano_sun':
        return (
          <svg width="50" height="50" viewBox="0 0 40 40" className="flex-none transition-all duration-300">
            {/* Dark tinted sunglasses lens */}
            <circle cx="20" cy="20" r="14" className={`${strokeValue} ${active ? 'fill-accent/25' : 'fill-neutral-900/10'} transition-all`} strokeWidth="1.2" />
            {glassReflect}
            <circle cx="20" cy="20" r="4" className="stroke-accent" strokeWidth="1" fill="none" />
            <path d="M 20,13 L 20,14.5 M 20,25.5 L 20,27 M 13,20 L 14.5,20 M 25.5,20 L 27,20" className="stroke-accent" strokeWidth="1" />
          </svg>
        );
      case 'demo_only':
        return (
          <svg width="50" height="50" viewBox="0 0 40 40" className="flex-none transition-all duration-300">
            {/* Demo/Frame only empty wire circle */}
            <circle cx="20" cy="20" r="14" className={`${strokeValue} transition-colors`} strokeWidth="1" strokeDasharray="3,3" fill="none" />
            <path d="M 16,20 L 24,20 M 20,16 L 20,24" className="stroke-muted-soft" strokeWidth="1" />
          </svg>
        );
      default:
        return null;
    }
  }

  return null;
}

export default function QuizPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const currentStep = QUIZ_STEPS[stepIndex];
  const progress = ((stepIndex + 1) / QUIZ_STEPS.length) * 100;

  function selectOption(val: string) {
    const nextAnswers = { ...answers, [currentStep.field]: val };
    setAnswers(nextAnswers);

    if (stepIndex < QUIZ_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      // Map answers to query parameters for /shop
      let frameShape = 'any';
      if (nextAnswers.shape === 'oval') frameShape = 'square,rectangular';
      if (nextAnswers.shape === 'square') frameShape = 'round,oval';
      if (nextAnswers.shape === 'heart') frameShape = 'round,aviator';
      if (nextAnswers.shape === 'diamond') frameShape = 'oval';

      const size = nextAnswers.size;
      const style = nextAnswers.style;
      const isSun = nextAnswers.intent === 'rx_sun' || nextAnswers.intent === 'plano_sun' ? 'true' : 'false';

      router.push(`/shop?shape=${frameShape}&size=${size}&style=${style}&sun=${isSun}&quiz=true`);
    }
  }

  function goBack() {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    }
  }

  return (
    <div className="min-h-screen bg-base py-16 px-4 flex flex-col justify-between max-w-2xl mx-auto">
      {/* Top Header */}
      <header className="flex justify-between items-center mb-8">
        <button
          onClick={goBack}
          disabled={stepIndex === 0}
          className={`font-mono text-xs uppercase tracking-wider ${
            stepIndex === 0 ? 'text-muted-soft cursor-not-allowed' : 'text-accent hover:text-accent-light'
          }`}
        >
          ← Back
        </button>
        <span className="font-mono text-xs font-bold text-tortoise">
          STEP {stepIndex + 1} OF {QUIZ_STEPS.length}
        </span>
      </header>

      {/* Progress Bar */}
      <div className="w-full bg-line h-1 rounded-full overflow-hidden mb-12">
        <div
          className="bg-accent h-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Main Card */}
      <main className="flex-1 flex flex-col justify-center">
        <div className="animate-fade-in-up">
          <h1 className="font-sans text-3xl sm:text-4xl font-black uppercase text-ink tracking-tight leading-none mb-3">
            {currentStep.question}
          </h1>
          <p className="font-serif italic text-muted text-base mb-8">
            {currentStep.sub}
          </p>

          <div className="space-y-3">
            {currentStep.options.map((opt) => {
              const isSelected = answers[currentStep.field] === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => selectOption(opt.value)}
                  aria-pressed={isSelected}
                  className={`w-full p-4 border text-left rounded-xl transition-all duration-300 bg-white shadow-sm flex items-center gap-5 hover:border-accent hover:shadow-md hover:scale-[1.01] ${
                    isSelected ? 'border-accent ring-1 ring-accent bg-accent/[0.02]' : 'border-line'
                  }`}
                >
                  <QuizOptionGraphic field={currentStep.field} value={opt.value} active={isSelected} />
                  <div className="flex-1">
                    <span className="font-sans font-bold text-base text-ink tracking-wide block">
                      {opt.label}
                    </span>
                    <span className="text-xs text-muted-soft mt-1 leading-relaxed block">
                      {opt.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </main>

      {/* Bottom info banner */}
      <footer className="mt-12 text-center">
        <p className="text-[10px] font-mono tracking-widest text-muted-soft uppercase">
          GlassyVision Frame Finder Quiz · Hand-finished in India
        </p>
      </footer>
    </div>
  );
}
