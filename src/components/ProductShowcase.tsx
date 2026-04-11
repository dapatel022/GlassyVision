import Link from 'next/link';

const PRODUCTS = [
    { id: 1, name: 'Classic Round', price: '$77', color: 'Tortoise' },
    { id: 2, name: 'Modern Square', price: '$85', color: 'Black' },
    { id: 3, name: 'Aviator Pro', price: '$99', color: 'Gold' },
    { id: 4, name: 'Cat Eye Chic', price: '$89', color: 'Red' },
];

export default function ProductShowcase() {
    return (
        <section className="py-24 bg-secondary relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-50">
                <div className="absolute top-20 right-20 w-96 h-96 bg-blue-100 rounded-full blur-3xl" />
                <div className="absolute bottom-20 left-20 w-80 h-80 bg-purple-100 rounded-full blur-3xl" />
            </div>

            <div className="container mx-auto px-4 relative z-10">
                <div className="text-center mb-16">
                    <h2 className="text-5xl font-bold text-primary mb-6">Our Most Popular Frames</h2>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                        Choose from our curated collection of premium frames.
                        All frames include single vision lenses.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {PRODUCTS.map((product) => (
                        <div key={product.id} className="bg-white rounded-3xl p-6 shadow-xl hover:shadow-2xl transition-all duration-500 group hover:-translate-y-2">
                            {/* Product Image Placeholder */}
                            <div className="aspect-square bg-gray-50 rounded-2xl mb-6 flex items-center justify-center text-gray-300 group-hover:bg-blue-50 transition-colors relative overflow-hidden">
                                <span className="relative z-10 font-bold">Frame Image</span>

                                {/* Quick View Overlay */}
                                <div className="absolute inset-0 bg-black/5 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                    <button className="bg-white text-primary px-6 py-2 rounded-full font-bold shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                        Quick View
                                    </button>
                                </div>
                            </div>

                            <h3 className="font-bold text-xl text-primary mb-1">{product.name}</h3>
                            <p className="text-gray-500 text-sm mb-4">{product.color}</p>
                            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                                <span className="font-bold text-2xl text-accent">{product.price}</span>
                                <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-primary group-hover:bg-accent group-hover:text-white transition-colors">
                                    +
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="text-center mt-16">
                    <Link
                        href="#"
                        className="inline-block border-2 border-primary text-primary hover:bg-primary hover:text-white px-10 py-4 rounded-full font-bold text-lg transition-colors"
                    >
                        Shop All Frames
                    </Link>
                </div>
            </div>
        </section>
    );
}
