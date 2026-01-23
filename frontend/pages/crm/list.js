import { useState, useEffect, useContext, useRef } from 'react';
import Layout from "../../components/Layout";
import { WebhookContext } from "../../context/WebhookContext";
import ExpandableCard from "../../components/ExpandableCard";
import LoadingSpinner from "../../components/LoadingSpinner";
import LoadingButton from "../../components/LoadingButton";
import { API_BASE, buildUrl as apiBuildUrl } from "../../lib/api";
import ShowHideTokenButton from '../../components/ui/ShowHideTokenButton'; // Import the button


// Utility: format Date → YYYY-MM-DD
const formatDate = (date) => {
  const d = new Date(date);
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();
  const year = d.getFullYear();
  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;
  return [year, month, day].join('-');
};

// Format labels: SOURCE_ID → Source Id
const formatLabel = (label) => {
  if (!label) return '';
  let cleaned = label.replace(/[_\-\.]/g, ' ').toLowerCase();
  return cleaned.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

export default function ListPage() {
  const tableRef = useRef(null);
  const { webhook } = useContext(WebhookContext);

  const [base, setBase] = useState('');
  const [entity, setEntity] = useState('lead');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [rows, setRows] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [selectedFields, setSelectedFields] = useState([]);
  const [fieldSearch, setFieldSearch] = useState('');
  const [fieldMap, setFieldMap] = useState({});
  const [enumsMap, setEnumsMap] = useState({}); // code → {id: label}
  const [viewMode, setViewMode] = useState("horizontal"); // default to horizontal view
  const [showFieldModal, setShowFieldModal] = useState(false);



  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Loading...');

  const defaultFieldsMap = {
    lead: ['ID', 'TITLE', 'NAME', 'SOURCE_ID', 'PHONE_VALUE', 'PHONE_TYPE', 'EMAIL_VALUE', 'EMAIL_TYPE', 'ASSIGNED_BY_ID'],
    deal: ['ID', 'TITLE', 'NAME', 'CONTACT_ID', 'SOURCE_ID', 'PHONE_VALUE', 'PHONE_TYPE', 'EMAIL_VALUE', 'EMAIL_TYPE', 'ASSIGNED_BY_ID'],
  };

      const [isMasked, setIsMasked] = useState(true); // State to control visibility
  
      const toggleMask = () => {
          setIsMasked(!isMasked); // Toggle the masking visibility
      };

  // Initialize Dates
  useEffect(() => {
    const today = new Date();
    setToDate(formatDate(today));
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    setFromDate(formatDate(sevenDaysAgo));
  }, []);

  // Load webhook
  useEffect(() => {
    if (webhook) setBase(webhook);
    else {
      const saved = localStorage.getItem("webhook");
      if (saved) setBase(saved);
    }
  }, [webhook]);

  // Fetch fields on entity/base change
  useEffect(() => {
    if (!base) return;
    setAllFields([]);
    setSelectedFields([]);

    fetch(apiBuildUrl(`/fields/${entity}`, { base }))
      .then(r => r.json())
      .then(j => {
        console.log("FIELDS RESPONSE:", j);

        const data = j.result || {};

        const opts = data.code_to_label
          ? Object.entries(data.code_to_label).map(([code, label]) => ({
            code,
            label: label || code
          }))
          : [];

        setAllFields(opts);
        setFieldMap(data.code_to_label || {});
        setEnumsMap(data.enums || {});

        const initialSelected = defaultFieldsMap[entity]
          .map(code => opts.find(f => f.code === code) || { code, label: code })
          .map(f => f.code);

        setSelectedFields(initialSelected);
      })
      .catch(err => console.error("Error loading fields", err));
  }, [entity, base]);

  const handleEntityChange = (newEntity) => {
    if (newEntity !== entity) {
      setRows([]);
      setFieldSearch('');
      setEntity(newEntity);
    }
  };

  const fetchList = async () => {
    if (!base) return alert("Enter base webhook URL");
    if (!selectedFields.length) return alert("Select at least one field");

    const params = {
      base,
      select: selectedFields.join(',')
    };

    if (fromDate) params.from_created = fromDate;
    if (toDate) params.to_created = toDate;

    const url = apiBuildUrl(`/list/${entity}`, params); // ✅ FIX

    try {
      setLoadingMessage("Fetching data...");
      setLoading(true);

      const r = await fetch(url);
      const j = await r.json();

      // extra safety
      setRows(Array.isArray(j.result) ? j.result : []);
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Field toggle
  const toggleField = (code) => {
    setSelectedFields(prev => prev.includes(code) ? prev.filter(f => f !== code) : [...prev, code]);
  };
  const selectAll = () => setSelectedFields(allFields.map(f => f.code));
  const deselectAll = () => setSelectedFields([]);

  const filteredFields = allFields.filter(f => f.label.toLowerCase().includes(fieldSearch.toLowerCase()));

  // CSV download
  const downloadCSV = () => {
    if (!rows.length) return alert('No rows to download');
    const headers = selectedFields.map(h => formatLabel(fieldMap[h] || h));
    const csvLines = [headers.join(',')];

    rows.forEach(r => {
      const line = selectedFields.map(h => {
        let v = r[h];
        if (v !== null && v !== undefined && typeof v !== 'object' && enumsMap[h]) {
          v = enumsMap[h][String(v)] ?? v;
        }
        if (Array.isArray(v)) {
          v = v.map(i => i.VALUE ? `${i.VALUE} (${i.VALUE_TYPE})` : JSON.stringify(i)).join('; ');
        } else if (v && typeof v === 'object' && 'VALUE' in v) v = v.VALUE;
        if (v === null || v === undefined) v = '';
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(',');
      csvLines.push(line);
    });

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${entity}_list.csv`;
    link.click();
  };

      const maskInput = (input) => {
        if (input.length <= 13) {
            return input;
        }

        const maskedPart = '*'.repeat(12);
        const visiblePart = input.slice(0, -13) + maskedPart + input.slice(-1);

        return visiblePart;
    };


  return (
    <>
      {loading && <LoadingSpinner message={loadingMessage} />}
      <Layout>
        {/* 🟢 CHANGE: Responsive Padding (p-4 on mobile, p-10 on desktop) */}
        <div className="min-h-screen p-4 sm:p-6 md:p-10">
          {/* 🟢 CHANGE: Increased Max Width for better table viewing */}
          <div className="max-w-6xl mx-auto grid grid-cols-1 gap-6">

            {/* FILTERS START */}
            <div className="glass p-6">
              <h3 className="font-semibold mb-3">Filters</h3>
              <div className="flex gap-2 mb-3">
                <button
                  className={`py-2 px-4 rounded ${entity === "lead" ? "btn" : "bg-white/10"}`}
                  onClick={() => handleEntityChange("lead")}
                >
                  Lead
                </button>

                <button
                  className={`py-2 px-4 rounded ${entity === "deal" ? "btn" : "bg-white/10"}`}
                  onClick={() => handleEntityChange("deal")}
                >
                  Deal
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-row gap-3 w-full">
                <input
                  value={isMasked ? maskInput(base) : base}
                  onChange={e => setBase(e.target.value)}
                  placeholder="Base webhook URL"
                  className="p-2 rounded bg-white/5 w-full"
                />
                <ShowHideTokenButton isMasked={isMasked} toggleMask={toggleMask} />
                </div>

                {/* 🟢 Responsive Date/Fetch Section */}
                <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center sm:justify-between">

                  {/* Date Inputs */}
                  <div className="flex flex-row gap-3 w-full">
                    <input
                      type="date"
                      value={fromDate}
                      onChange={e => setFromDate(e.target.value)}
                      className="p-2 rounded bg-white/5 border border-white/20 text-white w-1/2 sm:w-auto"
                    />
                    <input
                      type="date"
                      value={toDate}
                      onChange={e => setToDate(e.target.value)}
                      className="p-2 rounded bg-white/5 border border-white/20 text-white w-1/2 sm:w-auto"
                    />
                  </div>

                  {/* Fetch Button */}
                  <LoadingButton
                    loading={loading}
                    onClick={fetchList}
                    className="btn w-full sm:w-auto mt-2 sm:mt-0"
                  >
                    Fetch
                  </LoadingButton>


                </div>

                {/* Select/Download Buttons */}
                <div className="flex flex-wrap gap-2 mt-0 sm:mt-3">
                  <button onClick={() => setShowFieldModal(true)} className="btn w-full sm:w-auto">Select Fields</button>

                  {/* Download CSV */}
                  <button
                    onClick={downloadCSV}
                    className='btn w-full sm:w-auto'
                  >
                    ⤓ CSV
                  </button>
                </div>

              </div>
            </div>
            {/* FILTERS END */}

            {/* RESULTS START */}
            <div className='glass p-6'>
              <div className='flex flex-wrap items-center justify-between mb-3 gap-3'>
                <h3 className='font-semibold'>Results ({rows.length})</h3>
                <div className="flex gap-2">
                  <button onClick={() => setViewMode("horizontal")} className={`px-3 py-1 rounded ${viewMode === "horizontal" ? "btn text-white" : "bg-white/10"}`}>Horizontal</button>
                  <button onClick={() => setViewMode("vertical")} className={`px-3 py-1 rounded ${viewMode === "vertical" ? "btn text-white" : "bg-white/10"}`}>Vertical</button>
                </div>
              </div>

              {/* Selected fields chips */}
              <div className='flex flex-wrap gap-2 mb-3'>
                {selectedFields.map(f => (
                  <div key={f} className='bg-white/10 px-3 py-1 rounded-full text-sm whitespace-nowrap'>
                    {formatLabel(fieldMap[f] || f)}
                  </div>
                ))}
              </div>

              {rows.length === 0 ? (
                <p className='muted'>No rows</p>
              ) : (
                <>
                  {/* Scroll buttons (only for horizontal view) */}
                  {viewMode === "horizontal" && (
                    <div className="flex justify-end mb-2 gap-2">
                      <button
                        onClick={() =>
                          tableRef.current?.scrollBy({ left: -300, behavior: "smooth" })
                        }
                        className="px-3 py-1 text-white rounded bg-white/10 hover:bg-white/20 transition"
                      >
                        ◀
                      </button>

                      <button
                        onClick={() =>
                          tableRef.current?.scrollBy({ left: 300, behavior: "smooth" })
                        }
                        className="px-3 py-1 text-white rounded bg-white/10 hover:bg-white/20 transition"
                      >
                        ▶
                      </button>
                    </div>
                  )}


                  {/* Table container */}
                  <div ref={tableRef} className="overflow-x-auto scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-gray-300/10">
                    {viewMode === 'horizontal' ? (
                      <table className='min-w-full bg-white/5 rounded'>
                        <thead className='bg-white/6'>
                          <tr>
                            <th className='px-3 py-2 text-left whitespace-nowrap text-sm'>Sr. No</th>
                            {selectedFields.map(f => (
                              <th key={f} className='px-3 py-2 text-left whitespace-nowrap text-sm'>
                                {formatLabel(fieldMap[f] || f)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, idx) => (
                            <tr key={idx} className='hover:bg-white/3 text-sm'>
                              <td className='px-3 py-2 align-top whitespace-nowrap'>{idx + 1}</td>
                              {selectedFields.map(f => {
                                let val = r[f];

                                // Decode enum values
                                if (val !== null && val !== undefined && typeof val !== 'object' && enumsMap && enumsMap[f]) {
                                  const decoded = enumsMap[f][String(val)];
                                  if (decoded !== undefined) val = decoded;
                                }

                                // Flatten arrays/objects for display
                                if (Array.isArray(val)) {
                                  val = val.map(i => i.VALUE ? `${i.VALUE} (${i.VALUE_TYPE || ''})` : JSON.stringify(i)).join(', ');
                                } else if (val && typeof val === 'object') {
                                  if ('VALUE' in val) val = val.VALUE;
                                  else val = JSON.stringify(val);
                                }

                                return <td key={f} className='px-3 py-2 align-top whitespace-nowrap'>{val || ''}</td>;
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      /* Vertical Mode (Cards) */
                      <div className="grid gap-3">
                        {rows.map((r, idx) => (
                          <ExpandableCard
                            key={idx}
                            header={
                              <div className="text-sm text-white/70">
                                {idx + 1} — ID: <span className='font-bold'>{r.ID || r.id || ""}</span>
                              </div>
                            }
                          >
                            {/* 🟢 Responsive Grid: 1 column on small screens, 2 on medium+ */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {selectedFields.map(f => {
                                let val = r[f];

                                // Decode enums
                                if (
                                  val !== null &&
                                  val !== undefined &&
                                  typeof val !== "object" &&
                                  enumsMap &&
                                  enumsMap[f]
                                ) {
                                  const decoded = enumsMap[f][String(val)];
                                  if (decoded !== undefined) val = decoded;
                                }

                                // Array / object flattening
                                if (Array.isArray(val)) {
                                  val = val
                                    .map(i =>
                                      i.VALUE
                                        ? `${i.VALUE} (${i.VALUE_TYPE || ""})`
                                        : JSON.stringify(i)
                                    )
                                    .join(", ");
                                } else if (val && typeof val === "object") {
                                  if ("VALUE" in val) val = val.VALUE;
                                  else val = JSON.stringify(val);
                                }

                                // Skip empty
                                if (!val && val !== 0) return null;

                                return (
                                  <div key={f} className="pb-2 border-b border-white/5 last:border-b-0">
                                    <div className="text-xs text-white/50 mb-1">
                                      {formatLabel(fieldMap[f] || f)}
                                    </div>
                                    <div className="text-sm break-words">{val}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </ExpandableCard>
                        ))}
                      </div>

                    )}
                  </div>
                </>
              )}
            </div>
            {/* RESULTS END */}

            {showFieldModal && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"> {/* Added p-4 for modal container */}

                <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 w-full max-w-4xl border border-white/20 shadow-xl max-h-[90vh] overflow-y-auto">

                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">Select Fields</h3>
                    <button
                      onClick={() => setShowFieldModal(false)}
                      className="text-xl text-white/70 hover:text-white transition"
                    >
                      ✖
                    </button>
                  </div>

                  {/* Search */}
                  <input
                    type="text"
                    placeholder="Search fields..."
                    value={fieldSearch}
                    onChange={(e) => setFieldSearch(e.target.value)}
                    className="w-full p-2 rounded-lg bg-white/20 text-white placeholder-white/60 mb-3 outline-none focus:ring-2 focus:ring-purple-400 transition"
                  />

                  {/* Field List */}
                  {/* 🟢 Responsive Grid: 1 column on small, 2 on tablet, 3 on desktop */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-gray-300/10">
                    {filteredFields.map((f) => (
                      <label
                        key={f.code}
                        className="flex items-center gap-2 p-1 rounded hover:bg-white/10 text-white cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedFields.includes(f.code)}
                          onChange={() => toggleField(f.code)}
                          className="accent-purple-500"
                        />
                        <span className="text-sm">{f.label}</span>
                      </label>
                    ))}
                  </div>

                  {/* Footer Buttons */}
                  <div className="flex justify-between items-center mt-5">

                    {/* 🟢 Responsive Buttons */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={selectAll}
                        className="btn w-full sm:w-auto"
                      >
                        Select All
                      </button>

                      <button
                        onClick={deselectAll}
                        className="btn w-full sm:w-auto"
                      >
                        Deselect All
                      </button>
                    </div>

                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </Layout>
    </>

  );
}