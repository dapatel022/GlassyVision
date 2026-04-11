import Link from 'next/link';

export default function Hero() {
    return (
        <section className="relative min-h-[700px] flex items-center bg-gradient-to-br from-gray-50 via-white to-blue-50 overflow-hidden">
            {/* Animated Background Shapes */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-10 w-64 h-64 bg-blue-200/20 rounded-full blur-3xl animate-float" />
                <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-200/20 rounded-full blur-3xl animate-float-delayed" />
            </div>

            <div className="container mx-auto px-4 relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div className="max-w-xl space-y-8">
                    <h1 className="text-6xl md:text-7xl font-black text-primary leading-tight tracking-tight">
                        New Lenses.<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-purple-500">
                            For Any Frames.
                        </span>
                    </h1>
                    <p className="text-xl text-gray-600 max-w-md leading-relaxed">
                        Replace your lenses for a fraction of the cost.
                        Keep your favorite frames or shop our new collection.
                    </p>
                    <div className="flex flex-wrap gap-4 pt-4">
                        <Link
                            href="/lens-replacement"
                            className="bg-accent hover:bg-blue-600 text-white px-10 py-5 rounded-full font-bold text-lg transition-all transform hover:scale-105 hover:shadow-xl shadow-lg shadow-blue-500/30 ring-4 ring-blue-500/10"
                        >
                            Start My Order
                        </Link>
                        <Link
                            href="#"
                            className="bg-white hover:bg-gray-50 text-primary border-2 border-gray-100 hover:border-accent px-10 py-5 rounded-full font-bold text-lg transition-all transform hover:scale-105 shadow-md hover:shadow-lg"
                        >
                            Shop Frames
                        </Link>
                    </div>
                    <div className="pt-4 flex items-center gap-3 text-sm font-medium text-gray-500">
                        <div className="flex text-warning">
                            {[...Array(5)].map((_, i) => <span key={i} className="text-xl">★</span>)}
                        </div>
                        <span>4.8/5 Rating based on 10,000+ reviews</span>
                    </div>
                </div>

                {/* Hero Image Placeholder with Glassmorphism */}
                <div className="hidden lg:block relative h-[600px] animate-fade-in-up">
                    <div className="relative w-full h-full bg-white/30 backdrop-blur-sm rounded-[3rem] border border-white/50 shadow-2xl flex items-center justify-center overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-tr from-blue-100/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                        <div className="text-center p-12">
                            <div className="w-64 h-64 bg-accent/10 rounded-full mx-auto mb-6 flex items-center justify-center">
                                <span className="text-accent font-bold text-2xl">Hero Image</span>
                            </div>
                            <p className="text-gray-500">Model wearing glasses</p>
                        </div>
                    </div>

                    {/* Floating Badge */}
                    <div className="absolute -bottom-10 -left-10 bg-white p-6 rounded-2xl shadow-xl animate-float-delayed z-20 max-w-xs">
                        <p className="font-bold text-primary text-lg">Save up to 60%</p>
                        <p className="text-gray-500 text-sm">vs. optical retailers</p>
                    </div>
                </div>
            </div>
        </section>
    );
}
