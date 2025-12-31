// frontend/pages/get.js
import { useState, useEffect, useContext, useRef } from "react";
import Layout from "../components/Layout";
import { WebhookContext } from "../context/WebhookContext";
import ExpandableCard from "../components/ExpandableCard";

// Utility function to format labels (e.g., SOURCE_ID -> Source Id)
const formatLabel = (label) => {
  if (!label) return '';
  let cleaned = label.replace(/[_\-\.]/g, ' ').toLowerCase();
  return cleaned.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

export default function GetPage() {
  const { webhook } = useContext(WebhookContext);

  const [base, setBase] = useState("");
  const [entity, setEntity] = useState("lead"); // 'lead' | 'deal'

  const [method, setMethod] = useState("single"); // 'single' | 'comma' | 'file'
  const [idSingle, setIdSingle] = useState("");
  const [idsComma, setIdsComma] = useState("");
  const [fileName, setFileName] = useState(""); // State for selected file name
  const fileRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("horizontal"); // 'horizontal' | 'vertical'
  const [error, setError] = useState("");

  // field mapping loaded from backend
  const [fieldMap, setFieldMap] = useState({}); // code -> label
  const [enumsMap, setEnumsMap] = useState({}); // code -> {enum_id: enum_value}

  // Load webhook from context/localStorage
  useEffect(() => {
    if (webhook) setBase(webhook);
    else {
      const saved = localStorage.getItem("webhook");
      if (saved) setBase(saved);
    }
  }, [webhook]);

  // load field defs when base or entity changes
  useEffect(() => {
    if (!base) return;

    (async () => {
      try {
        const u = `http://127.0.0.1:8000/fields/${entity}?base=${encodeURIComponent(base)}`;
        const r = await fetch(u);
        if (!r.ok) throw new Error("Failed to load fields");
        const j = await r.json();
        setFieldMap(j.code_to_label || {});
        setEnumsMap(j.enums || {});
      } catch (e) {
        console.error("Field load error", e);
        setFieldMap({});
        setEnumsMap({});
      }
    })();
  }, [entity, base]);

  // helpers
  const buildUrl = (path, qs = {}) => {
    const u = new URL(path, "http://127.0.0.1:8000");
    Object.entries(qs).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
    });
    return u.toString();
  };

  async function doSingleFetch() {
    if (!base || !idSingle) {
      alert("Enter base and ID");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const url = buildUrl("/get/single", { entity, item_id: idSingle, base });
      const res = await fetch(url);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Status ${res.status}`);
      }
      const j = await res.json();
      setRows([j]);
    } catch (e) {
      setError(String(e.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function doCommaFetch() {
    if (!base || !idsComma) {
      alert("Provide comma separated IDs or upload a file");
      return;
    }
    const ids = idsComma.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) {
      alert("No valid IDs found");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const url = buildUrl("/get/multiple", { entity, ids: ids.join(","), base });
      const res = await fetch(url);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Status ${res.status}`);
      }
      const j = await res.json();
      setRows(j.result || []);
    } catch (e) {
      setError(String(e.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function doFileFetch() {
    if (!base) {
      alert("Provide webhook base first");
      return;
    }
    const f = fileRef.current?.files?.[0];
    if (!f) {
      alert("Select a CSV/XLSX file first");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const u = buildUrl("/get/file", { entity, base });
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(u, { method: "POST", body: fd });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Status ${res.status}`);
      }
      const j = await res.json();
      setRows(j.result || []);
    } catch (e) {
      setError(String(e.message || e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // function onFetchClick() is no longer needed since fetch is done per method

  // handleFileSelect logic is now inline

  function downloadCSV() {
    if (!rows || rows.length === 0) {
      alert("No data to download");
      return;
    }
    // create header union (order by first row keys)
    const keys = [];
    rows.forEach((r) => {
      Object.keys(r).forEach((k) => {
        if (!keys.includes(k)) keys.push(k);
      });
    });

    // Replace header keys with readable labels if available
    const headerLabels = keys.map(k => formatLabel(fieldMap[k] || k));
    const lines = [headerLabels.join(",")];

    rows.forEach((r) => {
      const row = keys.map((k) => {
        let v = r[k];
        // If enum field, decode
        if (v !== null && v !== undefined && typeof v !== "object" && enumsMap && enumsMap[k]) {
          // value might be ID string; try decode
          const decoded = enumsMap[k][String(v)];
          if (decoded !== undefined) v = decoded;
        }

        if (Array.isArray(v)) v = v.map((i) => (i.VALUE ? `${i.VALUE} (${i.VALUE_TYPE})` : JSON.stringify(i))).join("; ");
        else if (v && typeof v === "object") v = v.VALUE ? `${v.VALUE} (${v.VALUE_TYPE})` : JSON.stringify(v);
        if (v === null || v === undefined) v = "";
        // escape quotes
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(",");
      lines.push(row);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${entity}_get_results.csv`;
    a.click();
  }

  function copyJSON() {
    if (!rows || rows.length === 0) {
      alert("No data");
      return;
    }
    navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
    alert("Copied JSON to clipboard");
  }

  // Render helper to flatten display values for phone/email or arrays
  function renderCellValue(v, key) {
    // If enum and scalar value, decode
    if (v !== null && v !== undefined && typeof v !== "object" && enumsMap && enumsMap[key]) {
      const decoded = enumsMap[key][String(v)];
      if (decoded !== undefined) return String(decoded);
    }

    if (Array.isArray(v)) {
      return v.map((i) => (i.VALUE ? `${i.VALUE} (${i.VALUE_TYPE})` : JSON.stringify(i))).join(", ");
    }
    if (v && typeof v === "object") {
      return v.VALUE ? `${v.VALUE} (${v.VALUE_TYPE})` : JSON.stringify(v);
    }
    return String(v ?? "");
  }

  const tableRef = useRef();

  return (
    <Layout>
      {/* 🟢 CHANGE: Responsive Padding (p-4 on mobile, p-10 on desktop) */}
      <div className="min-h-screen p-4 sm:p-6 md:p-10">
        {/* 🟢 CHANGE: Increased Max Width for better table viewing */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 gap-6">
          
          {/* Controls */}
          <div className="glass p-6">
            <h3 className="font-semibold mb-3">Get Records</h3>
            
            <div className="flex flex-col lg:flex-row gap-2 justify-between">
              {/* Entity Buttons */}
              <div className="flex gap-2 items-center mb-3">
                <button
                  onClick={() => setEntity("lead")}
                  className={`py-2 px-4 rounded ${entity === "lead" ? "btn text-white" : "bg-white/10"}`}
                >
                  Lead
                </button>
                <button
                  onClick={() => setEntity("deal")}
                  className={`py-2 px-4 rounded ${entity === "deal" ? "btn text-white" : "bg-white/10"}`}
                >
                  Deal
                </button>
              </div>
              
              {/* 2. Method Buttons: Added flex-wrap for responsiveness */}
              <div className="flex flex-wrap gap-2 items-center mb-3">
                <button
                  type="button"
                  onClick={() => setMethod("single")}
                  className={`py-2 px-4 rounded ${method === "single" ? "btn" : "bg-white/10"}`}>
                  Single ID
                </button>

                <button
                  type="button"
                  onClick={() => setMethod("comma")}
                  className={`py-2 px-4 rounded ${method === "comma" ? "btn" : "bg-white/10"}`}>
                  Comma-separated
                </button>

                <button
                  type="button"
                  onClick={() => setMethod("file")}
                  className={`py-2 px-4 rounded ${method === "file" ? "btn" : "bg-white/10"}`}>
                  CSV / XLSX Upload
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <input
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="Base webhook URL"
                className="p-2 rounded bg-white/5 w-full"
              />

              {/* 3. Single Fetch: Stack on mobile (flex-col), side-by-side on tablet/desktop (sm:flex-row) */}
              {method === "single" && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={idSingle}
                    onChange={(e) => setIdSingle(e.target.value)}
                    placeholder="Enter ID"
                    className="p-2 rounded bg-white/5 flex-1"
                  />
                  <button onClick={doSingleFetch} className="btn w-full sm:w-auto" disabled={loading}>
                    {loading ? "Loading..." : "Fetch"}
                  </button>
                </div>
              )}

              {/* 3. Comma Fetch: Stack on mobile, side-by-side on tablet/desktop */}
              {method === "comma" && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={idsComma}
                    onChange={(e) => setIdsComma(e.target.value)}
                    placeholder="e.g. 10,20,30"
                    className="p-2 rounded bg-white/5 flex-1"
                  />
                  <button onClick={doCommaFetch} className="btn w-full sm:w-auto" disabled={loading}>
                    {loading ? "Loading..." : "Fetch"}
                  </button>
                </div>
              )}

              {/* ⭐️ FILE UPLOAD SECTION (Updated for custom styling) ⭐️ */}
              {method === "file" && (
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                  
                  {/* File selector group: takes up most space on larger screens */}
                  <div className="flex gap-3 items-center flex-1 w-full"> 
                    
                    {/* Custom styled file input button */}
                    <label
                      htmlFor="fileInput"
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg cursor-pointer transition whitespace-nowrap text-sm"
                    >
                      Select File
                    </label>

                    {/* HIDDEN FILE INPUT */}
                    <input
                      type="file"
                      id="fileInput"
                      ref={fileRef}
                      className="hidden"
                      accept=".csv, .xlsx, .xls"
                      onChange={(e) => {
                        const f = e.target.files && e.target.files[0];
                        if (f) {
                          setFileName(f.name);
                        } else {
                          setFileName("");
                        }
                      }}
                    />

                    {/* Display File Name */}
                    <span 
                      className={`text-sm ${fileName ? "text-white" : "text-white/50"} truncate`} 
                      title={fileName}
                    >
                      {fileName || "No file chosen (.csv, .xlsx)"}
                    </span>
                  </div>

                  {/* Fetch Button */}
                  <button onClick={doFileFetch} className="btn w-full sm:w-auto" disabled={loading || !fileName}>
                    {loading ? "Uploading..." : "Upload & Fetch"}
                  </button>
                </div>
              )}
              {/* ⭐️ END FILE UPLOAD SECTION ⭐️ */}

              {/* 4. Download/Copy Buttons: Added flex-wrap and w-full/sm:w-auto for responsiveness */}
              <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={downloadCSV} className="btn w-full sm:w-auto">⤓ CSV</button>
                <button onClick={copyJSON} className="btn w-full sm:w-auto">⧉ JSON</button>
              </div>

              {error && <div className="text-sm text-red-400 mt-2">{error}</div>}
            </div>
          </div>

          {/* Preview */}
          <div className="glass p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Preview ({rows.length})</h3>

              {/* View Mode Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("horizontal")}
                  className={`px-3 py-1 rounded ${mode === "horizontal" ? "btn text-white" : "bg-white/10"}`}
                >
                  Horizontal
                </button>

                <button
                  onClick={() => setMode("vertical")}
                  className={`px-3 py-1 rounded ${mode === "vertical" ? "btn text-white" : "bg-white/10"}`}
                >
                  Vertical
                </button>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="muted">No results</p>
            ) : mode === "horizontal" ? (
              <>
                {/* Scroll Buttons */}
                <div className="flex justify-end mb-2 gap-2">
                  <button
                    onClick={() => tableRef.current?.scrollBy({ left: -300, behavior: "smooth" })}
                    className="px-3 py-1 text-white rounded bg-white/10 hover:bg-white/20 transition"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => tableRef.current?.scrollBy({ left: 300, behavior: "smooth" })}
                    className="px-3 py-1 text-white rounded bg-white/10 hover:bg-white/20 transition"
                  >
                    ▶
                  </button>
                </div>

                <div
                  ref={tableRef}
                  className="overflow-x-auto scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-gray-300/10"
                >
                  <table className="min-w-full bg-white/5 rounded">
                    <thead className="bg-white/6">
                      <tr>
                        <th className="px-3 py-2 text-left whitespace-nowrap">Sr. No</th>
                        {rows.length > 0 && Object.keys(rows[0]).map((k) => (
                          <th key={k} className="px-3 py-2 text-left whitespace-nowrap text-sm">
                            {formatLabel(fieldMap[k] || k)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="hover:bg-white/3">
                          <td className="px-3 py-2 align-top whitespace-nowrap">{i + 1}</td>
                          {rows.length > 0 && Object.keys(rows[0]).map((k) => (
                            <td key={k} className="px-3 py-2 align-top whitespace-nowrap text-sm">
                              {renderCellValue(r[k], k)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              /* 5. Vertical Mode: Uses grid-cols-1 on mobile, grid-cols-2 on tablet/desktop */
              <div className="grid gap-3">
                {rows.map((r, i) => (
                  <ExpandableCard
                    key={i}
                    header={
                      <div className="text-sm text-white/70">
                        {i + 1} — ID: <span className='font-bold'>{r.ID || r.id || ""}</span>
                      </div>
                    }
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {Object.entries(r)
                        .filter(([k, v]) => v !== null && v !== undefined && String(v) !== "")
                        .map(([k, v]) => (
                          <div key={k} className="pb-2 border-b border-white/5 last:border-b-0">
                            <div className="text-xs text-white/50 mb-1">
                              {formatLabel(fieldMap[k] || k)}
                            </div>
                            <div className="text-sm break-words">{renderCellValue(v, k)}</div>
                          </div>
                        ))}
                    </div>
                  </ExpandableCard>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}