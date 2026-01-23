import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

export default function Sidebar() {
  const router = useRouter();
  const active = router.pathname;

  // 🔹 Mobile hamburger
  const [isOpen, setIsOpen] = useState(false);

  // 🔹 Accordion open state
  const [openSection, setOpenSection] = useState(null);

  const links = [
    {
      title: "CRM",
      children: [
        { name: "List", href: "/crm/list" },
        { name: "Get", href: "/crm/get" },
        { name: "Update", href: "/crm/update" },
        { name: "Delete", href: "/crm/delete" },
        { name: "List, Get & Update", href: "/crm/list-get-update" },
      ],
    },
    {
      title: "Fields",
      children: [{ name: "Duplicates", href: "/fields/duplicates" }],
    },
    {
      title: "Users",
      children: [{ name: "Users", href: "/users/list" }],
    },
  ];

  // 🎨 Styles
  const mainBtn =
    "flex items-center justify-between gap-3 px-5 py-2 rounded-xl text-white transition hover:bg-white/20";
  const activeMain =
    "bg-white/20 font-semibold";
  const subLink =
    "ml-4 px-4 py-2 rounded-lg text-sm transition";
  const subActive =
    "bg-white/30 text-white font-semibold";
  const subInactive =
    "text-gray-200 hover:bg-white/20";

  const toggleSection = (title) => {
    setOpenSection(openSection === title ? null : title);
  };

  return (
    <>
      {/* ================= DESKTOP SIDEBAR ================= */}
      <aside className="hidden md:block fixed left-0 top-0 h-screen w-64 bg-white/10
        backdrop-blur-xl border-r border-white/20 shadow-xl p-6 z-50">

        <h1 className="text-2xl font-bold text-white mb-8">
          Bitrix Manager
        </h1>

        <nav className="flex flex-col gap-2">
          {links.map((group) => (
            <div key={group.title}>

              {/* MAIN CATEGORY */}
              <button
                onClick={() => toggleSection(group.title)}
                className={`${mainBtn} ${openSection === group.title ? activeMain : ""
                  }`}
              >
                <span>{group.title}</span>

                {/* Arrow */}
                <svg
                  className={`w-4 h-4 transition-transform ${openSection === group.title ? "rotate-90" : ""
                    }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>

              {/* SUB CATEGORIES */}
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out
                  ${openSection === group.title
                    ? "max-h-96 mt-2"
                    : "max-h-0"
                  }`}
              >
                <div className="flex flex-col gap-1">
                  {group.children.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`
                        ${subLink}
                        ${active === l.href
                          ? subActive
                          : subInactive
                        }
                      `}
                    >
                      {l.name}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* ================= MOBILE TOP BAR ================= */}
      <header className="md:hidden sticky top-0 w-full bg-white/10
        backdrop-blur-xl border-b border-white/20 shadow-lg p-4 z-50">

        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold text-white">
            Bitrix Manager
          </h1>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 text-white hover:bg-white/10 rounded-lg"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d={
                  isOpen
                    ? "M6 18L18 6M6 6l12 12"
                    : "M4 6h16M4 12h16M4 18h16"
                }
              />
            </svg>
          </button>
        </div>

        {/* ================= MOBILE MENU ================= */}
        <nav
          className={`overflow-hidden transition-all duration-300
            ${isOpen ? "max-h-[600px] mt-4" : "max-h-0"}`}
        >
          <div className="flex flex-col gap-2">
            {links.map((group) => (
              <div key={group.title}>
                <button
                  onClick={() => toggleSection(group.title)}
                  className={`${mainBtn} ${openSection === group.title ? activeMain : ""
                    }`}
                >
                  {group.title}
                </button>

                <div
                  className={`overflow-hidden transition-all duration-300
    ${openSection === group.title ? "max-h-96 mt-2" : "max-h-0"}
  `}
                >
                  <div className="flex flex-col gap-1">
                    {group.children.map((l) => (
                      <Link
                        key={l.href}
                        href={l.href}
                        onClick={() => setIsOpen(false)}
                        className={`${subLink} ${active === l.href ? subActive : subInactive
                          }`}
                      >
                        {l.name}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
              </div>
        </nav>
      </header>
    </>
  );
}
