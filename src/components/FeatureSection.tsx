import Link from 'next/link';

interface FeatureSectionProps {
    title: string;
    description: string;
    ctaText: string;
    ctaLink: string;
    imagePosition?: 'left' | 'right';
    bgColor?: string;
}

export default function FeatureSection({
    title,
    description,
    ctaText,
    ctaLink,
    imagePosition = 'left',
    bgColor = 'bg-white'
}: FeatureSectionProps) {
    return (
        <section className={`py-24 ${bgColor} overflow-hidden`}>
            <div className="container mx-auto px-4">
                <div className={`flex flex-col lg:flex-row items-center gap-16 ${imagePosition === 'right' ? 'lg:flex-row-reverse' : ''}`}>

                    {/* Image Placeholder */}
                    <div className="w-full lg:w-1/2 group">
                        <div className="relative aspect-[4/3] bg-white rounded-[2rem] shadow-2xl overflow-hidden transform transition-all duration-700 hover:scale-[1.02] hover:rotate-1">
                            <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200" />
                            <div className="absolute inset-0 flex items-center justify-center text-gray-300 font-bold text-2xl group-hover:text-accent transition-colors">
                                Feature Image
                            </div>
                            {/* Shine effect */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                        </div>
                    </div>

                    {/* Content */}
                    <div className="w-full lg:w-1/2 space-y-8">
                        <h2 className="text-5xl font-bold text-primary leading-tight tracking-tight">{title}</h2>
                        <p className="text-xl text-gray-600 leading-relaxed max-w-lg">
                            {description}
                        </p>
                        <Link
                            href={ctaLink}
                            className="inline-flex items-center gap-2 bg-primary hover:bg-accent text-white px-10 py-4 rounded-full font-bold transition-all transform hover:scale-105 shadow-lg hover:shadow-accent/30"
                        >
                            {ctaText}
                            <span className="text-xl">→</span>
                        </Link>
                    </div>

                </div>
            </div>
        </section>
    );
}
