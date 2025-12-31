import Sidebar from "./Sidebar";

export default function Layout({ children }) {
  return (
    <div className="bg-gradient-to-br from-slate-900 to-black min-h-screen text-white">
      <Sidebar />

      {/* 🟢 FIX: ml-64 is now only applied on 'md' screens and larger. */}
      {/* On mobile, the margin is 0 by default. */}
      <main className="md:ml-64 pt-4 md:pt-0">
        {children}
      </main>
    </div>
  );
}