import { useState } from "react";

export default function ExpandableCard({ header, children, initialHeight = 180 }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="p-3 rounded bg-white/5 relative">

      {/* Header (ID, buttons, etc.) */}
      <div className="flex justify-between items-start gap-2">
        {header}
      </div>

      {/* COLLAPSABLE BODY */}
      <div
        className="overflow-hidden transition-all duration-300"
        style={{
          maxHeight: expanded ? "1000px" : `${initialHeight}px`,
        }}
      >
        <div className="mt-2 pb-10">
          {children}
        </div>
      </div>

      {/* FOOTER TOGGLE BUTTON */}
      {!expanded ? (
        <div
          className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/40 to-transparent 
                     text-center py-2 cursor-pointer"
          onClick={() => setExpanded(true)}
        >
          <span className="text-xl opacity-80">⬇️</span>
        </div>
      ) : (
        <div
          className="text-center py-2 cursor-pointer mt-2"
          onClick={() => setExpanded(false)}
        >
          <span className="text-xl opacity-80">⬆️</span>
        </div>
      )}
    </div>
  );
}
    