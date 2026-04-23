export const metadata = {
  title: 'Lookbook',
};

export default function LookbookPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
      <p className="text-xs font-mono font-bold uppercase tracking-widest text-muted-soft mb-2">Lookbook</p>
      <h1 className="font-sans text-5xl font-black tracking-tight uppercase text-ink mb-10">
        Drop Nº 01
      </h1>

      {/* COPY + IMAGES: pending photo shoot */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="aspect-[3/4] bg-base-deeper rounded-xl flex items-center justify-center">
            <p className="text-muted-soft font-serif italic text-sm">Look {i}</p>
          </div>
        ))}
      </div>

      <p className="text-center mt-10 font-serif italic text-muted">
        Photography from Drop Nº 01 lands here.
      </p>
    </div>
  );
}
