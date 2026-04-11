import { Star } from 'lucide-react';

const REVIEWS = [
    {
        id: 1,
        name: 'Sarah M.',
        rating: 5,
        text: "I saved over $200 by replacing my lenses with Lensabl instead of buying new glasses. The process was so easy!",
        date: '2 days ago'
    },
    {
        id: 2,
        name: 'Michael R.',
        rating: 5,
        text: "Great quality lenses. I was skeptical at first but the prescription is perfect. Highly recommend.",
        date: '1 week ago'
    },
    {
        id: 3,
        name: 'Jessica T.',
        rating: 4,
        text: "Fast shipping and great customer service. The frames fit perfectly.",
        date: '2 weeks ago'
    }
];

export default function Reviews() {
    return (
        <section className="py-24 bg-gradient-to-b from-white to-blue-50">
            <div className="container mx-auto px-4">
                <h2 className="text-5xl font-bold text-primary text-center mb-16">What People Are Saying</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {REVIEWS.map((review) => (
                        <div key={review.id} className="bg-white/60 backdrop-blur-xl p-10 rounded-[2rem] shadow-xl border border-white/50 hover:shadow-2xl transition-all duration-500 hover:-translate-y-2">
                            <div className="flex gap-1 mb-6">
                                {[...Array(5)].map((_, i) => (
                                    <Star
                                        key={i}
                                        className={`w-5 h-5 ${i < review.rating ? 'text-warning fill-warning' : 'text-gray-300'}`}
                                    />
                                ))}
                            </div>
                            <p className="text-gray-700 mb-8 italic text-lg leading-relaxed">"{review.text}"</p>
                            <div className="flex justify-between items-center pt-6 border-t border-gray-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center text-white font-bold">
                                        {review.name.charAt(0)}
                                    </div>
                                    <span className="font-bold text-primary">{review.name}</span>
                                </div>
                                <span className="text-sm text-gray-400 font-medium">{review.date}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
