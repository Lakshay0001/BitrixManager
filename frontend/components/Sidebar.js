import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react"; // 👈 useState import किया गया

export default function Sidebar() {
  const router = useRouter();
  const active = router.pathname;
  const [isOpen, setIsOpen] = useState(false); // 👈 Hamburger state वापस जोड़ा गया

  // 💡 Note: Removed the unused useEffect for scroll handling.

  const links = [
    { name: "Home", href: "/" },
    { name: "List", href: "/list" },
    { name: "Get", href: "/get" },
    { name: "Update", href: "/update" },
    { name: "Delete", href: "/delete" },
    { name: "List, Get & Update", href: "/list-get-update" },
    { name: "Fields", href: "/fields" },
    { name: "Users", href: "/users" },
    // { name: "Settings", href: "/settings" },
  ];

  // Original Link Classes
  const commonLinkClasses = "px-4 py-2 rounded-xl transition";
  const activeLinkClasses = "bg-white/30 text-white font-semibold shadow-md";
  const inactiveLinkClasses = "text-gray-200 hover:bg-white/20";

  return (
    <>
      {/* 1. DESKTOP/LAPTOP SIDEBAR (Original Style) */}
      <div className="hidden md:block fixed left-0 top-0 h-screen w-64 bg-white/10
        backdrop-blur-xl border-r border-white/20 shadow-xl p-6 z-50">
        
        <h1 className="text-2xl font-bold text-white mb-6">
          Bitrix Manager
        </h1>

        <nav className="flex flex-col gap-2">
          {links.map((l) => (
            <Link 
              key={l.href}
              href={l.href}
              className={`
                ${commonLinkClasses}
                ${active === l.href 
                  ? activeLinkClasses
                  : inactiveLinkClasses
                }
              `}
            >
              {l.name}
            </Link>
          ))}
        </nav>
      </div>

      {/* 2. TABLET & MOBILE TOP NAVBAR (With Hamburger) */}
      <header className="md:hidden sticky top-0 w-full bg-white/10
        backdrop-blur-xl border-b border-white/20 shadow-lg p-4 z-50">
        
        <div className="flex justify-between items-center">
          {/* Title */}
          <h1 className="text-xl font-bold text-white">
            Bitrix Manager
          </h1>
          
          {/* 🟢 HAMBURGER BUTTON */}
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 text-white hover:bg-white/10 rounded-lg transition"
            aria-label="Toggle Menu"
          >
            {/* Hamburger Icon (X or Bars) */}
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}></path>
            </svg>
          </button>
        </div>

        {/* 3. MOBILE COLLAPSIBLE MENU */}
        <nav className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 mt-4' : 'max-h-0 mt-0'}`}>
          <div className="flex flex-col gap-2"> {/* Note: Changed from flex-wrap to flex-col for mobile stack */}
            {links.map((l) => (
              <Link 
                key={l.href}
                href={l.href}
                // Link click par menu close hoga
                onClick={() => setIsOpen(false)} 
                className={`
                  ${commonLinkClasses}
                  ${active === l.href 
                    ? activeLinkClasses
                    : inactiveLinkClasses
                  }
                `}
              >
                {l.name}
              </Link>
            ))}
          </div>
        </nav>
      </header>
    </>
  );
}