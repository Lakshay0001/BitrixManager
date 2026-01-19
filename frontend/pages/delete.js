// frontend/pages/delete.js
import { useState, useEffect, useContext, useRef } from "react";
import Layout from "../components/Layout";
import { WebhookContext } from "../context/WebhookContext";
import ExpandableCard from "../components/ExpandableCard";
import LoadingSpinner from "../components/LoadingSpinner";
import LoadingButton from "../components/LoadingButton";
import { API_BASE, buildUrl as apiBuildUrl } from "../lib/api";


// Utility function to format labels (e.g., SOURCE_ID -> Source Id)
const formatLabel = (label) => {
  if (!label) return '';
  let cleaned = label.replace(/[_\-\.]/g, ' ').toLowerCase();
  return cleaned.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

/*
 DeletePage
 Glass 1:
   - Lead/Deal toggle
   - method selector: single | comma | file
   - webhook input + fetch button
 Glass 2:
   - Show fetched records in horizontal / vertical view
   - Per-row delete button
   - Delete All button -> opens modal with disclaimer, offers "Download & Delete" / "Delete Anyway"
 Glass 3:
   - Status summary of deletes with Clear Summary button
*/

export default function DeletePage() {
  const { webhook } = useContext(WebhookContext);

  // Glass 1 state
  const [base, setBase] = useState("");
  const [entity, setEntity] = useState("lead");
  const [method, setMethod] = useState("single");
  const [idSingle, setIdSingle] = useState("");
  const [idsComma, setIdsComma] = useState("");
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");

  // fetched records
  const [rows, setRows] = useState([]); // array of record objects
  const [mode, setMode] = useState("horizontal"); // 'horizontal' | 'vertical'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // selection for deletion (ids)
  const [selectedIds, setSelectedIds] = useState(new Set());

  // modal for delete all
  const [showModal, setShowModal] = useState(false);

  // delete summary
  const [summary, setSummary] = useState([]);

  // field map (for header labels) - loaded from backend
  const [fieldMap, setFieldMap] = useState({});
  const [enumsMap, setEnumsMap] = useState({});

  // delete confirmation text
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const [pendingDeleteIds, setPendingDeleteIds] = useState([]);



  // load webhook from context/localstorage
  useEffect(() => {
    if (webhook) setBase(webhook);
    else {
      const saved = localStorage.getItem("webhook");
      if (saved) setBase(saved);
    }
  }, [webhook]);

  // load field defs for labels (same as get/update)
  useEffect(() => {
    if (!base) return;
    (async () => {
      try {
        const u = buildUrl(`/fields/${entity}`, { base });
        const r = await fetch(u);
        const j = await r.json();

        setFieldMap(j.result?.code_to_label || {});
        setEnumsMap(j.result?.enums || {});

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

  // fetch helpers (mirror get.js usage)
  async function fetchSingle() {
    if (!base || !idSingle) return alert("Enter base and ID");

    setLoading(true);
    setError("");

    try {
      const url = buildUrl("/get/single", {
        entity,
        item_id: idSingle,
        base,
      });

      const r = await fetch(url);
      if (!r.ok) throw new Error(await r.text());

      const j = await r.json();
      setRows(j.result || []);
      setSelectedIds(new Set());
    } catch (e) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }


  async function fetchComma() {
    if (!base || !idsComma) {
      alert("Provide comma separated IDs");
      return;
    }

    const ids = idsComma
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      alert("No valid IDs found");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // ✅ USE get/multiple (NO LOOP)
      const url = apiBuildUrl("/get/multiple", {
        entity,
        ids: ids.join(","), // backend expects comma string
        base,
      });

      const res = await fetch(url);

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Status ${res.status}`);
      }

      const j = await res.json();

      const records = (j.result || []).map((r) => ({
        ...(r || {}),
        ID: String(r.ID ?? r.id ?? ""),
      }));

      if (records.length === 0) {
        throw new Error("No records found for provided IDs");
      }

      setRows(records);
      setSelectedIds(new Set());
    } catch (e) {
      setError(String(e.message || e));
      setRows([]);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  }


  async function fetchFile() {
    if (!base) return alert("Provide webhook base");

    const f = fileRef.current?.files?.[0];
    if (!f) return alert("Select file");

    setLoading(true);
    setError("");

    try {
      const url = buildUrl("/get/file", { entity, base });
      const fd = new FormData();
      fd.append("file", f);

      const r = await fetch(url, { method: "POST", body: fd });
      if (!r.ok) throw new Error(await r.text());

      const j = await r.json();
      setRows(j.result || []);
      setSelectedIds(new Set());
    } catch (e) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }


  async function onFetchClick() {
    if (method === "single") return await fetchSingle();
    if (method === "comma") return await fetchComma();
    if (method === "file") return await fetchFile();
  }

  function handleFileSelect(e) {
    const f = e.target.files?.[0];
    if (!f) { setFileName(""); return; }
    setFileName(f.name);
    // setMethod("file"); // This is redundant as button is only visible when method is file
  }

  // render helper similar to get.js
  function renderCellValue(v, key) {
    if (v !== null && v !== undefined && typeof v !== "object" && enumsMap && enumsMap[key]) {
      const decoded = enumsMap[key][String(v)];
      if (decoded !== undefined) return String(decoded);
    }
    if (Array.isArray(v)) {
      return v.map(i => (i.VALUE ? `${i.VALUE} (${i.VALUE_TYPE})` : JSON.stringify(i))).join(", ");
    }
    if (v && typeof v === "object") {
      return v.VALUE ? `${v.VALUE} (${v.VALUE_TYPE})` : JSON.stringify(v);
    }
    return String(v ?? "");
  }

  // download selected rows as CSV (backup before delete)
  function downloadSelectedCSV(selectedIdList = null) {
    const useRows = (selectedIdList ? rows.filter(r => selectedIdList.includes(String(r.ID))) : rows);
    if (!useRows || useRows.length === 0) return alert("No rows selected for download");
    // header union
    const keys = [];
    useRows.forEach(r => {
      Object.keys(r).forEach(k => { if (!keys.includes(k)) keys.push(k); });
    });
    // Replace header keys with readable labels if available (using formatLabel)
    const headerLabels = keys.map(k => formatLabel(fieldMap[k] || k));
    const lines = [headerLabels.join(",")];
    useRows.forEach(r => {
      const row = keys.map(k => {
        let v = r[k];
        if (v !== null && v !== undefined && typeof v !== "object" && enumsMap && enumsMap[k]) {
          const dec = enumsMap[k][String(v)]; if (dec !== undefined) v = dec;
        }
        if (Array.isArray(v)) v = v.map(i => i.VALUE ? `${i.VALUE}` : JSON.stringify(i)).join("; ");
        else if (v && typeof v === "object") v = v.VALUE ? `${v.VALUE}` : JSON.stringify(v);
        if (v === null || v === undefined) v = "";
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(",");
      lines.push(row);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${entity}_delete_backup_${new Date().toISOString()}.csv`;
    a.click();
  }

  // single-row delete
  // This logic is simplified since we now use the modal for both single and batch delete.
  async function deleteSingleRow(recordId) {
    if (!base || !recordId) return alert("Missing base or id");
    // This function is no longer called directly, it's replaced by modal
    // logic in handleDownloadAndDelete/handleDeleteWithoutDownload.
    // However, if we must keep it for consistency with old code flow:
    if (!confirm(`Delete ${entity} ${recordId}? This action cannot be undone.`)) return;
    await deleteBatch([String(recordId)]);
  }

  // batch delete (calls backend batch endpoint if available; else calls delete per id)
  async function deleteBatch(idList) {
    if (!base) {
      alert("Base required");
      return;
    }
    if (!idList || idList.length === 0) {
      alert("No IDs to delete");
      return;
    }

    setLoading(true);
    const out = [];

    try {
      for (const id of idList) {
        try {
          const url = apiBuildUrl(`/delete/${entity}/${id}`, { base });

          const res = await fetch(url, {
            method: "POST",
          });

          const j = await res.json();

          const ok = j?.result === true || j?.result?.get("deleted") > 0;


          out.push({
            id: String(id),
            status: ok ? "ok" : "error",
            msg: ok ? "Deleted successfully" : JSON.stringify(j),
          });

          // ⏱ small delay (Bitrix safe)
          await new Promise((r) => setTimeout(r, 80));
        } catch (err) {
          out.push({
            id: String(id),
            status: "error",
            msg: String(err.message || err),
          });
        }
      }
    } finally {
      // ✅ remove deleted rows from UI
      const deletedIds = out
        .filter((o) => o.status === "ok")
        .map((o) => String(o.id));

      setRows((prev) =>
        prev.filter((r) => !deletedIds.includes(String(r.ID)))
      );

      // ✅ update summary
      setSummary((prev) => [...out, ...prev]);

      setSelectedIds(new Set());
      setLoading(false);
    }
  }

  // Modal actions:
  async function handleDownloadAndDelete(idsToUse) {
    if (!idsToUse || idsToUse.length === 0) return alert("No IDs found for deletion.");
    if (deleteConfirmText !== "deleterecord") return;

    downloadSelectedCSV(idsToUse);
    await deleteBatch(idsToUse);
    resetDeleteModal();
  }

  async function handleDeleteWithoutDownload(idsToUse) {
    if (!idsToUse || idsToUse.length === 0) return alert("No IDs found for deletion.");
    if (deleteConfirmText !== "deleterecord") return;

    // Check again, as confirmation text is met, but a final prompt is good practice for "Delete Anyway"
    if (!window.confirm(`Are you sure you want to delete ${idsToUse.length} records NOW without a backup? This cannot be undone.`)) return;

    await deleteBatch(idsToUse);
    resetDeleteModal();
  }

  // toggle selection
  function toggleSelect(id) {
    setSelectedIds(prev => {
      const s = new Set(prev);
      if (s.has(String(id))) s.delete(String(id));
      else s.add(String(id));
      return s;
    });
  }

  // clear summary
  function clearSummary() {
    setSummary([]);
  }

  function resetDeleteModal() {
    setDeleteConfirmText("");
    setPendingDeleteIds([]);
    setShowModal(false);
  }

  // Render
  const tableRef = useRef();

  return (
    <Layout>
      {loading && <LoadingSpinner message="Processing delete..." />}
      {/* 🟢 CHANGE: Responsive Padding (p-4 on mobile, p-10 on desktop) */}
      <div className="min-h-screen p-4 sm:p-6 md:p-10">
        {/* 🟢 CHANGE: Increased Max Width for better table viewing */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 gap-6">

          {/* Glass 1 - Controls */}
          <div className="glass p-6">
            <h3 className="font-semibold mb-3">Delete Records</h3>

            <div className="flex flex-col lg:flex-row gap-2 justify-between">
              {/* Entity Buttons */}
              <div className="flex gap-2 items-center mb-3">
                <button onClick={() => setEntity("lead")} className={`py-2 px-4 rounded ${entity === "lead" ? "btn text-white" : "bg-white/10"}`}>Lead</button>
                <button onClick={() => setEntity("deal")} className={`py-2 px-4 rounded ${entity === "deal" ? "btn text-white" : "bg-white/10"}`}>Deal</button>
              </div>

              {/* Method Buttons - Added flex-wrap for responsiveness */}
              <div className="flex flex-wrap gap-2 items-center mb-3">
                <button type="button" onClick={() => setMethod("single")} className={`py-2 px-4 rounded ${method === "single" ? "btn" : "bg-white/10"}`}>Single ID</button>
                <button type="button" onClick={() => setMethod("comma")} className={`py-2 px-4 rounded ${method === "comma" ? "btn" : "bg-white/10"}`}>Comma-separated</button>
                <button type="button" onClick={() => setMethod("file")} className={`py-2 px-4 rounded ${method === "file" ? "btn" : "bg-white/10"}`}>CSV / XLSX Upload</button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <input value={base} onChange={e => setBase(e.target.value)} placeholder="Base webhook URL" className="p-2 rounded bg-white/5 w-full" />

              {/* Single Fetch: Stack on mobile, side-by-side on tablet/desktop */}
              {method === "single" && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={idSingle} onChange={e => setIdSingle(e.target.value)} placeholder="Enter ID" className="p-2 rounded bg-white/5 flex-1" />
                  <LoadingButton
                    loading={loading}
                    onClick={fetchSingle}
                    className="btn w-full sm:w-auto"
                  >
                    Fetch
                  </LoadingButton>

                </div>
              )}

              {/* Comma Fetch: Stack on mobile, side-by-side on tablet/desktop */}
              {method === "comma" && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <input value={idsComma} onChange={e => setIdsComma(e.target.value)} placeholder="e.g. 10,20,30" className="p-2 rounded bg-white/5 flex-1" />
                  <LoadingButton
                    loading={loading}
                    onClick={fetchComma}
                    className="w-full sm:w-auto"
                  >
                    Fetch
                  </LoadingButton>

                </div>
              )}

              {/* ⭐️ FILE UPLOAD SECTION (Responsive Custom Input) ⭐️ */}
              {method === "file" && (
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">

                  {/* File selector group */}
                  <div className="flex gap-3 items-center flex-1 w-full">

                    {/* Custom styled file input button */}
                    <label
                      htmlFor="deleteFileInput"
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg cursor-pointer transition whitespace-nowrap text-sm"
                    >
                      Select File
                    </label>

                    {/* HIDDEN FILE INPUT */}
                    <input
                      type="file"
                      id="deleteFileInput"
                      ref={fileRef}
                      className="hidden"
                      accept=".csv, .xlsx, .xls"
                      onChange={handleFileSelect}
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
                  <LoadingButton
                    loading={loading}
                    onClick={fetchFile}
                    disabled={!fileName}
                    className="w-full sm:w-auto"
                  >
                    Upload & Fetch
                  </LoadingButton>

                </div>
              )}
              {/* ⭐️ END FILE UPLOAD SECTION ⭐️ */}


              <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={() => { if (rows.length) setRows([]); setSelectedIds(new Set()); }} className="btn w-full sm:w-auto">Clear Preview</button>
              </div>

              {error && <div className="text-sm text-red-400 mt-2">{error}</div>}
            </div>
          </div>

          {/* Glass 2 - Preview and Delete controls */}
          <div className="glass p-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-semibold">Preview ({rows.length})</h3>
              <div className="flex gap-2 items-center">
                <button onClick={() => setMode("horizontal")} className={`px-3 py-1 rounded ${mode === "horizontal" ? "btn text-white" : "bg-white/10"}`}>Horizontal</button>
                <button onClick={() => setMode("vertical")} className={`px-3 py-1 rounded ${mode === "vertical" ? "btn text-white" : "bg-white/10"}`}>Vertical</button>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="muted">No results</p>
            ) : mode === "horizontal" ? (
              <>
                <div className="flex justify-end mb-2 gap-2">
                  <button onClick={() => tableRef.current?.scrollBy({ left: -300, behavior: "smooth" })} className="px-3 py-1 text-white rounded bg-white/10 hover:bg-white/20 transition">◀</button>
                  <button onClick={() => tableRef.current?.scrollBy({ left: 300, behavior: "smooth" })} className="px-3 py-1 text-white rounded bg-white/10 hover:bg-white/20 transition">▶</button>
                </div>

                <div ref={tableRef} className="overflow-x-auto scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-gray-300/10">
                  <table className="min-w-full bg-white/5 rounded">
                    <thead className="bg-white/6">
                      <tr>
                        <th className="px-3 py-2 text-left whitespace-nowrap text-sm">Select</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap text-sm">Actions</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap text-sm">Sr. No</th>
                        {/* Use formatLabel here for better readability */}
                        {Object.keys(rows[0]).map(k => <th key={k} className="px-3 py-2 text-left whitespace-nowrap text-sm">{formatLabel(fieldMap[k] || k)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="hover:bg-white/3">
                          <td className="px-3 py-2 align-top whitespace-nowrap">
                            <input type="checkbox" checked={selectedIds.has(String(r.ID))} onChange={() => toggleSelect(r.ID)} />
                          </td>
                          <td className="px-3 py-2 align-top whitespace-nowrap">
                            <button className="btn text-xs px-2 py-1 mr-2" onClick={() => {
                              setPendingDeleteIds([String(r.ID)]);
                              setShowModal(true);
                            }} >Delete</button>
                          </td>
                          <td className="px-3 py-2 align-top whitespace-nowrap text-sm">{i + 1}</td>
                          {Object.keys(rows[0]).map(k => (
                            <td key={k} className="px-3 py-2 align-top whitespace-nowrap text-sm">{renderCellValue(r[k], k)}</td>
                          ))}

                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              // Vertical View: Updated to be responsive (grid-cols-1 on mobile, grid-cols-2 on sm)
              <div className="grid gap-3">
                {rows.map((r, i) => (
                  <ExpandableCard
                    key={i}
                    header={
                      <div className="flex justify-between items-center w-full">
                        <div className="text-sm text-white/70">{i + 1} — ID: <span className='font-bold'>{r.ID || ""}</span></div>
                        <div className="flex gap-2 items-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(String(r.ID))}
                            onChange={() => toggleSelect(r.ID)}
                          />
                          <button
                            className="btn text-xs px-2 py-1"
                            onClick={() => {
                              setPendingDeleteIds([String(r.ID)]);
                              setShowModal(true);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    }
                  >
                    {/* Inner grid updated to be responsive */}
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

            {/* Action Buttons - Added flex-wrap and w-full/sm:w-auto */}
            <div className="flex flex-wrap gap-2 items-center mt-3">
              <button onClick={() => { setSelectedIds(new Set(rows.map(r => String(r.ID)))) }} className="btn w-full sm:w-auto">Select All</button>
              <button onClick={() => setSelectedIds(new Set())} className="btn w-full sm:w-auto">Clear Selection</button>
              <button onClick={() => {
                const ids =
                  selectedIds.size > 0
                    ? Array.from(selectedIds)
                    : rows.map((r) => String(r.ID));

                setPendingDeleteIds(ids);
                setShowModal(true);
              }}
                className="btn bg-red-600 hover:bg-red-700 w-full sm:w-auto">
                Delete {selectedIds.size > 0 ? `${selectedIds.size} Selected` : `All (${rows.length})`}
              </button>
            </div>
          </div>

          {/* Glass 3 - Summary */}
          <div className="glass p-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-semibold">Deletion Summary ({summary.length})</h3>
              <div className="flex gap-2">
                <button onClick={clearSummary} className="btn">Clear Summary</button>
              </div>
            </div>

            {summary.length === 0 ? <div className="muted">No actions yet.</div> : (
              <div className="grid gap-2">
                {summary.map((s, i) => (
                  <div key={i} className={`p-2 rounded ${s.status === "ok" ? "bg-emerald-800/20" : s.status === "error" ? "bg-red-800/20" : "bg-white/10"}`}>
                    <div className="text-sm"><strong>{s.id}</strong> — {s.status}</div>
                    <div className="text-xs muted break-words">{String(s.msg)}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button onClick={() => {
                // download summary CSV
                if (!summary || summary.length === 0) return alert("No summary");
                const keys = ["ID", "Status", "Message"];
                const lines = [keys.join(",")];
                summary.forEach(s => {
                  const row = [s.id, s.status, (s.msg ?? "").toString().replace(/"/g, '""')].map(v => `"${v}"`).join(",");
                  lines.push(row);
                });
                const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `delete_summary_${new Date().toISOString()}.csv`; a.click();
              }} className="btn w-full sm:w-auto">⤓ Summary</button>
            </div>
          </div>

        </div>
      </div>

      {/* Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"> {/* Added p-4 for mobile margin */}

          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={resetDeleteModal}
          ></div>

          {/* Modal */}
          <div className="relative z-60 bg-white/10 backdrop-blur-lg
                    border border-white/20 shadow-2xl rounded-2xl 
                    p-6 w-full max-w-lg sm:w-[90%]"> {/* Changed w-[90%] to w-full max-w-lg for better mobile fit */}

            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-lg">Delete Confirmation</h3>
              <button
                onClick={resetDeleteModal}
                className="text-white text-xl hover:opacity-70"
              >
                &times; {/* Changed ❌ to &times; (x) for cleaner look */}
              </button>
            </div>

            <p className="mb-4 text-sm text-yellow-300">
              <strong>⚠️ Warning:</strong> This action is permanent and cannot be undone. You are about to delete <strong>{pendingDeleteIds.length}</strong> record(s).
            </p>
            <p className="mb-4 text-sm text-red-300">
              To proceed, type <i>"deleterecord"</i> in the box below.
            </p>

            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type: deleterecord"
              className="w-full p-2 rounded bg-white/5 border border-white/20
                    focus:border-purple-400 outline-none mb-4 italic"
            />

            {/* Buttons: Added flex-wrap for responsiveness */}
            <div className="flex flex-wrap gap-3">
              <button
                className={`btn flex-1 min-w-[150px] ${deleteConfirmText === "deleterecord" ? "" : "opacity-40 cursor-not-allowed"}`}
                disabled={deleteConfirmText !== "deleterecord"}
                onClick={() => handleDownloadAndDelete(pendingDeleteIds)}
              >
                Download & Delete
              </button>

              <button
                className={`btn flex-1 min-w-[150px] bg-red-600 hover:bg-red-700 
                  ${deleteConfirmText === "deleterecord" ? "" : "opacity-40 cursor-not-allowed"}`}
                disabled={deleteConfirmText !== "deleterecord"}
                onClick={() => handleDeleteWithoutDownload(pendingDeleteIds)}
              >
                Delete Without Backup
              </button>
            </div>

            {/* Removed redundant count text from bottom */}
          </div>
        </div>
      )}



    </Layout>
  );
}