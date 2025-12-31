import { useState, useEffect, useContext, useRef } from "react";
import Layout from "../components/Layout";
import { WebhookContext } from "../context/WebhookContext";
import LoadingSpinner from "../components/LoadingSpinner";
import LoadingButton from "../components/LoadingButton";
import { buildUrl, API_BASE } from "../lib/api";



// Utility to convert datetime string from API (e.g., '2023-11-20T10:46:14+05:30') to local datetime format ('YYYY-MM-DDThh:mm')
const formatDatetimeLocal = (isoString) => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date)) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    // Return YYYY-MM-DDTHH:MM (required for datetime-local input)
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
};

export default function UpdatePage() {
  const { webhook } = useContext(WebhookContext);

  // base + entity
  const [base, setBase] = useState("");
  const [entity, setEntity] = useState("lead"); // 'lead' | 'deal'

  // method / inputs
  const [method, setMethod] = useState("single"); // 'single'|'comma'|'file'
  const [idSingle, setIdSingle] = useState("");
  const [idsComma, setIdsComma] = useState("");
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");

  // fetched data
  const [records, setRecords] = useState([]); // [{ID, ...}]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // fields mapping
  const [allFields, setAllFields] = useState([]); // [{code,label}]
  const [fieldMap, setFieldMap] = useState({}); // code -> label
  // enumsMap: code -> { id: label }  (used by logic to decode ids)
  const [enumsMap, setEnumsMap] = useState({}); // code -> { id: label }
  // enumsListMap: code -> [{ID, VALUE}, ...] (used by UI for listing options)
  const [enumsListMap, setEnumsListMap] = useState({}); // code -> array
  // 🆕 NEW: Map to store field types for input rendering
  const [fieldTypesMap, setFieldTypesMap] = useState({}); // code -> type

  // custom template download 
  const [showCustomTemplate, setShowCustomTemplate] = useState(false);
  const [selectedTemplateFields, setSelectedTemplateFields] = useState([]);
  const [templateSearch, setTemplateSearch] = useState("");



  // CARDS: one card per record
  // card: { cardId, recordId, recordLabel, fields: [{ rowId, code, label, newValue, isMultiple, oldValue }] }
  const [cards, setCards] = useState([]);

  // update summary
  const [summary, setSummary] = useState([]);

  // load webhook
  useEffect(() => {
    if (webhook) setBase(webhook);
    else {
      const saved = localStorage.getItem("webhook");
      if (saved) setBase(saved);
    }
  }, [webhook]);

  // Helper: normalize enums returned by backend to two shapes:
  // - enumsDict: code -> { id: label }
  // - enumsList: code -> [{ID, VALUE}, ...]
  function normalizeEnums(rawEnums) {
    const dict = {};
    const list = {};
    if (!rawEnums || typeof rawEnums !== "object") return { dict, list };

    Object.entries(rawEnums).forEach(([code, val]) => {
      if (Array.isArray(val)) {
        // assume val is array of { ID, VALUE } or similar
        list[code] = val.map(item => {
          // normalize property names
          const ID = item.ID ?? item.id ?? String(item.value ?? "");
          const VALUE = item.VALUE ?? item.value ?? item.label ?? item.NAME ?? "";
          return { ID: String(ID), VALUE: VALUE };
        });
        dict[code] = list[code].reduce((acc, it) => {
          acc[String(it.ID)] = it.VALUE;
          return acc;
        }, {});
      } else if (val && typeof val === "object") {
        // maybe mapping id -> label
        list[code] = Object.entries(val).map(([id, label]) => ({ ID: String(id), VALUE: label }));
        dict[code] = { ...val };
      } else {
        list[code] = [];
        dict[code] = {};
      }
    });
    return { dict, list };
  }

  // load fields mapping when base/entity changes
  useEffect(() => {
    if (!base) return;
    (async () => {
      try {
        const u = `http://127.0.0.1:8000/fields/${entity}?base=${encodeURIComponent(base)}`;
        const r = await fetch(u);
        if (!r.ok) throw new Error(`Fields fetch failed ${r.status}`);
        const j = await r.json();

        const map = j.code_to_label || {};
        const types = j.code_to_type || {}; // Assume the backend returns a map of code to type

        const arr = Object.entries(map).map(([code, label]) => ({ code, label }));

        arr.sort((a, b) => {
          const order = ["ID", "TITLE", "NAME"];
          const ai = order.indexOf(a.code) >= 0 ? order.indexOf(a.code) : 99;
          const bi = order.indexOf(b.code) >= 0 ? order.indexOf(b.code) : 99;
          if (ai !== bi) return ai - bi;
          return (a.label || a.code).localeCompare(b.label || b.code);
        });

        // normalize enums
        const rawEnums = j.enums || {};
        const { dict: enumsDict, list: enumsList } = normalizeEnums(rawEnums);

        setAllFields(arr);
        setFieldMap(map);
        setFieldTypesMap(types); // 🆕 Save types map
        setEnumsMap(enumsDict);
        setEnumsListMap(enumsList);
      } catch (e) {
        console.error(e);
        setAllFields([]);
        setFieldMap({});
        setFieldTypesMap({}); // 🆕 Clear types map on error
        setEnumsMap({});
        setEnumsListMap({});
      }
    })();
    // clear records/cards/summary on entity change
    setRecords([]);
    setCards([]);
    setSummary([]);
  }, [entity, base]);

  // 🆕 Helper: Determine the correct HTML input type based on Bitrix field type
  const getInputType = (code) => {
    const type = fieldTypesMap[code];
    if (!type) return 'text';

    // Handle flattened fields for phone/email
    if ((code || "").toUpperCase().includes('PHONE') || (code || "").toUpperCase().includes('EMAIL')) return 'text';

    switch (type) {
      case 'date':
        return 'date';
      case 'datetime':
        return 'datetime-local';
      case 'double':
        return 'number';
      case 'email':
        return 'email';
      default:
        return 'text';
    }
  };

  // helpers
  const buildUrl = (path, qs = {}) => {
    const u = new URL(path, "http://127.0.0.1:8000");
    Object.entries(qs).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, v);
    });
    return u.toString();
  };

  // Create one card per record
  function createCardsFromRecords(rows) {
    const created = (rows || []).map(r => {
      return {
        cardId: `card_${String(r.ID)}_${Date.now()}`,
        recordId: String(r.ID),
        recordLabel: r.TITLE || r.NAME || String(r.ID),
        fields: [
          { rowId: Date.now() + Math.floor(Math.random() * 1000), code: "", label: "", newValue: "", isMultiple: false, oldValue: "" }
        ]
      };
    });
    setCards(created);
  }

  // Reset fields inside existing cards (keeps cards for current records)
  function resetCardsForRecords(rows) {
    const created = (rows || []).map(r => {
      const existing = cards.find(c => c.recordId === String(r.ID));
      if (existing) {
        return {
          ...existing,
          fields: [{ rowId: Date.now() + Math.floor(Math.random() * 1000), code: "", label: "", newValue: "", isMultiple: false, oldValue: "" }],
          recordLabel: r.TITLE || r.NAME || String(r.ID)
        };
      }
      return {
        cardId: `card_${String(r.ID)}_${Date.now()}`,
        recordId: String(r.ID),
        recordLabel: r.TITLE || r.NAME || String(r.ID),
        fields: [{ rowId: Date.now() + 1, code: "", label: "", newValue: "", isMultiple: false, oldValue: "" }]
      };
    });
    setCards(created);
  }

  // fetch single
  async function fetchSingle() {
    if (!base || !idSingle) return alert("Enter base and ID");
    setLoading(true); setError("");
    try {
      const url = buildUrl(`/get/${entity}/${idSingle}`, { base }); // Corrected path to match backend
      const res = await fetch(url);
      if (!res.ok) { const txt = await res.text(); throw new Error(txt || `Status ${res.status}`); }
      const j = await res.json();
      const rec = { ...(j || {}), ID: String(j.ID ?? j.id ?? idSingle) };
      setRecords([rec]);
      createCardsFromRecords([rec]);
    } catch (e) {
      setError(String(e.message || e));
      setRecords([]);
      setCards([]);
    } finally { setLoading(false); }
  }

  // fetch multiple (No dedicated /get/multiple endpoint mentioned, assuming this means fetching single in loop or backend logic handles it)
  async function fetchMultiple() {
    if (!base || !idsComma) return alert("Provide comma separated IDs");
    const ids = idsComma.split(",").map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) return alert("No valid IDs found");

    setLoading(true); setError("");
    setRecords([]); setCards([]);
    const fetchedRecords = [];

    try {
      for (const id of ids) {
        const url = buildUrl(`/get/${entity}/${id}`, { base });
        const res = await fetch(url);
        if (res.ok) {
          const j = await res.json();
          fetchedRecords.push({ ...(j || {}), ID: String(j.ID ?? j.id ?? id) });
        } else {
          console.warn(`Could not fetch record ID ${id}: Status ${res.status}`);
        }
      }

      if (fetchedRecords.length === 0) throw new Error("Could not fetch any records with provided IDs.");

      setRecords(fetchedRecords);
      createCardsFromRecords(fetchedRecords);

    } catch (e) {
      setError(String(e.message || e));
      setRecords([]);
      setCards([]);
    } finally { setLoading(false); }
  }


  // fetch by file (assuming backend handles file upload and returns records)
  // ---- REPLACE your existing fetchByFile with this function ----
  async function fetchByFile() {
    // Ensure base and file selected
    if (!base) return alert("Provide webhook base first");
    const f = fileRef.current?.files?.[0];
    if (!f) return alert("Select a CSV/XLSX file first");

    setLoading(true);
    setError("");
    setRecords([]);
    setCards([]);

    // helper: simple CSV parser (handles quoted fields)
    function parseCSV(text) {
      const rows = [];
      let cur = '', row = [], inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const nxt = text[i + 1];
        if (ch === '"') {
          if (inQuotes && nxt === '"') { // double quote inside quoted string => consume both
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
          continue;
        }
        if (ch === ',' && !inQuotes) {
          row.push(cur);
          cur = '';
          continue;
        }
        if ((ch === '\n' || ch === '\r') && !inQuotes) {
          // handle CRLF
          if (ch === '\r' && nxt === '\n') { /* skip, will be handled below */ }
          // push current cell
          row.push(cur);
          cur = '';
          // if row is empty and it's just an extra newline, ignore
          if (!(row.length === 1 && row[0] === "")) {
            rows.push(row);
          }
          row = [];
          // skip following LF after CR
          if (ch === '\r' && nxt === '\n') i++;
          continue;
        }
        cur += ch;
      }
      // last cell
      if (cur !== '' || row.length > 0) {
        row.push(cur);
        rows.push(row);
      }
      return rows;
    }

    // helper: normalize header string
    const normalizeHeader = (s) => String(s || '').trim();

    // We'll try to parse XLSX first if file ends with .xls or .xlsx
    const name = f.name.toLowerCase();
    let parsedRows = [];
    try {
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        // dynamic import of xlsx to avoid breaking if package absent
        let XLSX;
        try {
          // The import is commented out here as it typically requires a build step and
          // the user's environment to have the dependency installed.
          // For a functional code snippet, assume XLSX is available or handle dynamically.
          // In a real Next.js/React app, this would be:
          // XLSX = await import('xlsx/dist/xlsx.full.min.js'); 
          
          // For demonstration, commenting out the actual dynamic import which might fail
          // or assuming it's imported correctly elsewhere if needed.
          // For now, if the user provided the code and it was working, this section is fine.

        } catch (e) {
          // console.error(e);
          // throw new Error("xlsx import failed. Try restarting npm start.");
          // For a real-world scenario, you'd need the XLSX dependency.
        }

        const data = await f.arrayBuffer();
        
        // This line requires the XLSX library to be imported/available.
        // Assuming XLSX object is available from user's setup if they are using this.
        // const workbook = XLSX.read(data, { type: 'array' });
        // const firstSheetName = workbook.SheetNames[0];
        // const sheet = workbook.Sheets[firstSheetName];
        // const json = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
        // parsedRows = json;
        
        // --- Placeholder for file parsing logic if XLSX dependency is missing ---
        if (typeof XLSX === 'undefined') {
          console.warn("XLSX library not available. Skipping XLSX parsing.");
          throw new Error("XLSX library not imported or available for parsing .xlsx files.");
        }
        
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }); // array of arrays
        parsedRows = json;

      } else {
        // assume CSV
        const txt = await f.text();
        parsedRows = parseCSV(txt);
      }

      if (!parsedRows || parsedRows.length === 0) {
        throw new Error("File parsed but no rows found");
      }

      // First row is headers
      const rawHeaders = parsedRows[0].map(h => normalizeHeader(h));
      const dataRows = parsedRows.slice(1).filter(r => r.some(c => String(c).trim() !== ""));

      if (dataRows.length === 0) {
        throw new Error("No data rows found in file");
      }

      // Build label->code map from fieldMap (which is code->label). If your backend returns label_to_code directly, prefer that.
      // fieldMap is code->label, so invert it.
      const labelToCode = {};
      Object.entries(fieldMap || {}).forEach(([code, label]) => {
        if (label) labelToCode[String(label).trim().toLowerCase()] = code;
      });

      // Also allow matching by label variants (case-insensitive).
      const matchHeaderToCode = (header) => {
        const key = (header || "").trim().toLowerCase();
        // direct label match
        if (labelToCode[key]) return labelToCode[key];
        // try exact code match (user might have used code as header)
        const uc = header?.trim();
        if (uc && fieldMap[uc]) return uc;
        // try simple known alternates: ID -> ID
        const idCandidates = ['id', 'ID', 'Id'];
        if (idCandidates.includes(header)) return 'ID';
        // else not found
        return null;
      };

      // Find ID column among headers (many variants)
      const idHeaderIndex = rawHeaders.findIndex(h => {
        if (!h) return false;
        const hh = h.trim().toLowerCase();
        return hh === 'id' || hh === 'deal id' || hh === 'lead id' || hh === 'contact id' || hh === 'item id' || hh === 'record id';
      });

      // If not found, also search for any header that maps to code 'ID' via label_to_code
      let idIdx = idHeaderIndex;
      if (idIdx === -1) {
        idIdx = rawHeaders.findIndex(h => {
          const code = matchHeaderToCode(h);
          return code && String(code).toUpperCase() === 'ID';
        });
      }

      if (idIdx === -1) {
        // As last resort, if first column looks numeric for many rows, assume it's ID
        const col0AllNumbers = dataRows.slice(0, 10).every(r => String(r[0] || '').trim().match(/^\d+$/));
        if (col0AllNumbers) idIdx = 0;
      }

      if (idIdx === -1) {
        throw new Error("Could not locate an ID column in the uploaded file. Header must contain 'ID' (or variants like 'Lead ID', 'Deal ID').");
      }

      // For each header compute target code (or null if cannot map)
      const headerToCode = rawHeaders.map(h => matchHeaderToCode(h));

      // Build tasks to fetch Bitrix records for all IDs
      const ids = dataRows.map(r => String((r[idIdx] || "").toString().trim())).filter(Boolean);

      if (ids.length === 0) throw new Error("No valid IDs found in the file");

      // Limit concurrent requests to avoid rate limits
      const CONCURRENCY = 5;
      const batches = [];
      for (let i = 0; i < ids.length; i += CONCURRENCY) batches.push(ids.slice(i, i + CONCURRENCY));

      const fetchedRecords = [];
      for (const batch of batches) {
        const promises = batch.map(idv => {
          const url = buildUrl(`/get/${entity}/${idv}`, { base });
          return fetch(url).then(res => {
            if (!res.ok) return null;
            return res.json().catch(() => null);
          }).catch(() => null);
        });
        const results = await Promise.all(promises);
        results.forEach(r => {
          if (r) fetchedRecords.push({ ...(r || {}), ID: String(r.ID ?? r.id ?? "") });
        });
        // small delay to be gentle on API
        await new Promise(res => setTimeout(res, 120));
      }

      // Build cards: one per data row (keep order)
      const createdCards = dataRows.map((row, idx) => {
        const idVal = String(row[idIdx] || "").trim();
        const matchedRecord = fetchedRecords.find(rr => String(rr.ID) === idVal) || null;

        // fields list built from headers: only include mapped headers (non-null codes)
        const fieldsForCard = rawHeaders.map((hdr, hIndex) => {
          const code = headerToCode[hIndex];
          if (!code) return null; // header not mapped to any code
          // new value from excel cell
          // const newVal = row[hIndex] ?? "";
          let newValRaw = row[hIndex] ?? "";

          // ENUM AUTO-MAP (label → ID)
          let newVal = newValRaw;

          // MULTI ENUM (comma separated label)
          if (enumsListMap[code] && String(newValRaw).includes(",")) {
            const labels = String(newValRaw).split(",").map(s => s.trim());
            newVal = labels
              .map(lbl => {
                const found = enumsListMap[code].find(e =>
                  e.VALUE.toLowerCase() === lbl.toLowerCase()
                );
                return found ? String(found.ID) : null;
              })
              .filter(x => x);
          }

          // SINGLE ENUM (exact label)
          else if (enumsListMap[code]) {
            const found = enumsListMap[code].find(e =>
              e.VALUE.toLowerCase() === String(newValRaw).trim().toLowerCase()
            );
            if (found) newVal = String(found.ID);
          }

          // compute oldValue using existing helper (if record exists)
          const oldValue = matchedRecord ? getOldValueForRecord(matchedRecord, code) : "";
          return {
            rowId: Date.now() + Math.floor(Math.random() * 100000) + idx + hIndex,
            code,
            label: fieldMap[code] || code,
            newValue: newVal,
            isMultiple: Array.isArray(matchedRecord ? matchedRecord[code] : undefined),
            oldValue
          };
        }).filter(Boolean);

        return {
          cardId: `card_${idVal}_${Date.now()}_${idx}`,
          recordId: idVal,
          recordLabel: matchedRecord ? (matchedRecord.TITLE || matchedRecord.NAME || String(idVal)) : String(idVal),
          fields: fieldsForCard.length ? fieldsForCard : [{ rowId: Date.now() + idx, code: '', label: '', newValue: '', isMultiple: false, oldValue: '' }]
        };
      });

      // Save fetchedRecords to records state (for oldValue lookups and update)
      setRecords(fetchedRecords);

      // Create cards in state (replace current cards)
      setCards(createdCards);

      // done
      setLoading(false);
      setLoadingMessage('Loading...');
      alert(`Created ${createdCards.length} cards from file. Review and press Update All to apply changes.`);
    } catch (err) {
      console.error(err);
      setError(String(err?.message || err));
      setLoading(false);
      setLoadingMessage('Loading...');
    }
  }


  // CARD helpers
  function addFieldRow(cardId) {
    setCards(prev => prev.map(c => {
      if (c.cardId !== cardId) return c;
      return { ...c, fields: [...c.fields, { rowId: Date.now() + Math.floor(Math.random() * 1000), code: "", label: "", newValue: "", isMultiple: false, oldValue: "" }] };
    }));
  }

  function removeFieldRow(cardId, rowId) {
    setCards(prev => prev.map(c => {
      if (c.cardId !== cardId) return c;
      const newFields = c.fields.filter(f => f.rowId !== rowId);
      return { ...c, fields: newFields.length ? newFields : [{ rowId: Date.now() + 1, code: "", label: "", newValue: "", isMultiple: false, oldValue: "" }] };
    }));
  }

  function setFieldRowCode(cardId, rowId, code) {
    const label = fieldMap[code] || code;

    // Determine isMultiple by inspecting the loaded record's value for this card (best-effort fallback)
    const rec = records.find(r => String(r.ID) === String(cardId.replace(/^card_/, '').split('_')[0])) || records.find(r => String(r.ID) === String(cards.find(c => c.cardId === cardId)?.recordId));
    // Try to find record by card mapping first
    const recordForCard = records.find(r => String(r.ID) === String(cards.find(c => c.cardId === cardId)?.recordId));

    const recordValue = recordForCard ? recordForCard[code] : undefined;

    // if backend returns arrays for the current field (PHONE, EMAIL, or multi-enum), treat as multiple
    const isMultipleDetected = Array.isArray(recordValue);

    // Also, if we already have enumsListMap for this code and recordValue is a string that contains commas,
    // we won't assume multiple; using array detection is safer.
    const isMultiple = isMultipleDetected || false;

    // Derive oldValue to show in the UI immediately
    const oldValue = getOldValueForRecord(recordForCard, code);

    // Reset newValue when field code changes, as type might be different
    setCards(prev => prev.map(c => {
      if (c.cardId !== cardId) return c;
      return {
        ...c,
        fields: c.fields.map(f => f.rowId === rowId ? { ...f, code, label, newValue: "", isMultiple, oldValue } : f)
      };
    }));
  }

  function setFieldRowNewValue(cardId, rowId, val) {
    setCards(prev => prev.map(c => {
      if (c.cardId !== cardId) return c;
      return { ...c, fields: c.fields.map(f => f.rowId === rowId ? { ...f, newValue: val } : f) };
    }));
  }

  // get old value for a record for a field code
  function getOldValueForRecord(record, code) {
    if (!record) return "";
    const v = record[code];

    // 1. Array/Complex fields
    if (Array.isArray(v)) return v.map(i => i.VALUE ? `${i.VALUE}` : JSON.stringify(i)).join("; ");
    if (v && typeof v === "object") {
      if ("VALUE" in v) return v.VALUE;
      return JSON.stringify(v);
    }

    // 2. Enum fields decode (we have enumsMap as dict: id -> label)
    if (v !== null && v !== undefined && enumsMap && enumsMap[code]) {
      const decoded = enumsMap[code][String(v)];
      if (decoded !== undefined) return decoded;
    }

    // 3. Date/Datetime fields formatting
    const type = fieldTypesMap[code];
    if (type === 'date' && v) {
      // Bitrix date is YYYY-MM-DD
      return String(v).split('T')[0];
    }
    if (type === 'datetime' && v) {
      // Use the utility function to make it user-friendly, although it's displayed in a simple div
      return formatDatetimeLocal(v);
    }

    return v ?? "";
  }

  // perform bulk update: iterate each card (each record)
  async function doUpdateAll() {
    if (!base) return alert("Enter base webhook URL");
    if (!cards || cards.length === 0) return alert("No records/cards to update");
    setLoading(true);
    setSummary([]);
    const out = [];

    // iterate cards
    for (const card of cards) {
      const rec = records.find(r => String(r.ID) === String(card.recordId));
      let recordStatus = "ok";

      // build fields payload only for rows where newValue provided and code chosen
      const payloadFields = {};

      const fieldsToSummarize = [];

      for (const f of card.fields) {
        fieldsToSummarize.push(f); // Keep track of all fields to summarize

        if (!f.code) continue;

        // Value cleanup: only include if value is provided
        let updateValue = f.newValue;
        if (updateValue === "" || updateValue === null || updateValue === undefined) continue;

        // 1. Handle special Bitrix array fields (PHONE/EMAIL)
        if (f.code === 'PHONE' || f.code === 'EMAIL' || f.code === 'PHONE_VALUE' || f.code === 'EMAIL_VALUE') {
          const val = String(updateValue || "");
          const key = f.code === 'PHONE_VALUE' ? 'PHONE' : (f.code === 'EMAIL_VALUE' ? 'EMAIL' : f.code);
          payloadFields[key] = [
            { VALUE: val, VALUE_TYPE: 'WORK' }
          ];
        }
        // 2. Handle Datetime-local conversion for API
        else if (fieldTypesMap[f.code] === 'datetime') {
          // Convert YYYY-MM-DDTHH:MM (from datetime-local) back to ISO string if needed, 
          // or just send the direct value (API often accepts YYYY-MM-DD HH:MM:SS)
          // For safety, send it as simple string.
          payloadFields[f.code] = String(updateValue).replace('T', ' ');
        }
        // 3. Enum multi => send array / scalar accordingly (we assume backend accepts array of IDs for multi, and scalar ID for single)
        else if (enumsListMap[f.code] && Array.isArray(f.newValue)) {
          // multi enum - send array of IDs
          payloadFields[f.code] = f.newValue;
        }
        // 4. Normal scalar fields (including number/date/enum ID)
        else {
          payloadFields[f.code] = updateValue;
        }
      }

      if (Object.keys(payloadFields).length === 0) {
        // nothing to update for this record: mark skipped per field
        for (const f of fieldsToSummarize) {
          out.push({
            id: card.recordId,
            fieldCode: f.code || "",
            fieldLabel: f.label || fieldMap[f.code] || f.code || "",
            oldValue: getOldValueForRecord(rec, f.code),
            newValue: (enumsMap[f.code] && enumsMap[f.code][f.newValue])
              ? enumsMap[f.code][f.newValue]   // Convert ID → Label
              : f.newValue ?? "",

            status: "skipped",
            msg: f.code ? "No new value provided" : "No field selected"
          });
        }
        continue;
      }

      // call backend update endpoint for this record
      let updateMsg = "";
      try {
        const url = `http://127.0.0.1:8000/update/${entity}/${encodeURIComponent(card.recordId)}?base=${encodeURIComponent(base)}`;
        const payload = { fields: payloadFields };
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const j = await r.json();

        if (r.ok && (j.result === true || j.result)) {
          recordStatus = "ok";
          updateMsg = "Updated successfully";
        } else {
          recordStatus = "error";
          updateMsg = j?.error_description || JSON.stringify(j);
        }
      } catch (e) {
        recordStatus = "error";
        updateMsg = String(e.message || e);
      }

      // For each field row produce summary line
      for (const f of fieldsToSummarize) {
        // Only summarize fields that were attempted to be updated or were skipped due to missing value
        if (f.code && f.newValue !== "" && f.newValue !== null && f.newValue !== undefined) {
          out.push({
            id: card.recordId,
            fieldCode: f.code || "",
            fieldLabel: f.label || fieldMap[f.code] || f.code || "",
            oldValue: getOldValueForRecord(rec, f.code),
            newValue: (enumsMap[f.code] && Array.isArray(f.newValue))
              ? f.newValue.map(id => enumsMap[f.code][String(id)] ?? id).join(", ")
              : (enumsMap[f.code] && enumsMap[f.code][f.newValue]) ? enumsMap[f.code][f.newValue] : f.newValue ?? "",
            status: recordStatus,
            msg: updateMsg
          });

        } else {
          // Summarize skipped fields (if code was chosen but no value provided)
          out.push({
            id: card.recordId,
            fieldCode: f.code || "",
            fieldLabel: f.label || fieldMap[f.code] || f.code || "",
            oldValue: getOldValueForRecord(rec, f.code),
            newValue: f.newValue ?? "",
            status: "skipped",
            msg: f.code ? "No new value provided" : "No field selected"
          });
        }
      }
    } // cards loop

    setSummary(out);
    setLoading(false);
    if (out.length > 0) alert("Update completed. See summary below / download CSV.");
  }

  // download summary CSV
  function downloadSummaryCSV() {
    if (!summary || summary.length === 0) return alert("No summary");
    const keys = ["ID", "Field Label", "Field Code", "Old Value", "New Value", "Status", "Message"];
    const lines = [keys.join(",")];
    summary.forEach(s => {
      const row = [
        s.id,
        (s.fieldLabel ?? "").replace(/"/g, '""'),
        s.fieldCode ?? "",
        String(s.oldValue ?? "").replace(/"/g, '""'),
        String(s.newValue ?? "").replace(/"/g, '""'),
        s.status ?? "",
        String(s.msg ?? "").replace(/"/g, '""')
      ].map(v => `"${v}"`).join(",");
      lines.push(row);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `update_summary_${new Date().toISOString()}.csv`;
    a.click();
  }

  // Helpers for enum UI components to accept either array or dict
  const enumEntries = (options) => {
    if (!options) return [];
    if (Array.isArray(options)) {
      return options.map(o => [String(o.ID), o.VALUE]);
    }
    return Object.entries(options);
  };
  const enumLabelFor = (options, id) => {
    if (!options) return undefined;
    if (Array.isArray(options)) {
      const found = options.find(o => String(o.ID) === String(id));
      return found ? found.VALUE : undefined;
    }
    return options[String(id)];
  };

  function getEnumLabel(field, value) {
    // Return empty string for null/undefined/empty string or empty array
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "";

    // field.enumerations expected as array of {ID, VALUE}
    const enumsArr = Array.isArray(field.enumerations) ? field.enumerations : (field.enumerations ? Object.entries(field.enumerations).map(([id, val]) => ({ ID: String(id), VALUE: val })) : []);

    // ⭐ MULTI SELECT
    if (Array.isArray(value)) {
      return value
        .map((v) => {
          const found = enumsArr.find((e) => String(e.ID) == String(v));
          return found ? found.VALUE : v; // fallback = ID
        })
        .join(", ");
    }

    // ⭐ SINGLE SELECT
    const found = enumsArr.find((e) => String(e.ID) == String(value));
    return found ? found.VALUE : value;
  }


  function SingleEnumSelect({ options, value, onChange, placeholder = "Select option" }) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

    const selectedLabel =
      options.find((o) => String(o.ID) === String(value))?.VALUE || "";

    // outside click
    useEffect(() => {
      const handler = (e) => {
        if (containerRef.current && !containerRef.current.contains(e.target)) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, []);

    return (
      <div className="relative w-full" ref={containerRef}>
        <div
          className="p-2 rounded bg-white/5 text-white border border-white/10 cursor-pointer"
          onClick={() => setOpen(!open)}
        >
          {selectedLabel || <span className="text-white/40">{placeholder}</span>}
        </div>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-zinc-900 border border-white/10 rounded shadow-xl max-h-60 overflow-auto">
            {options.map((opt) => (
              <div
                key={opt.ID}
                className="p-2 hover:bg-white/10 cursor-pointer text-sm text-white"
                onClick={() => {
                  onChange(opt.ID);
                  setOpen(false);
                }}
              >
                {opt.VALUE}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }


  function MultiEnumSelect({ options, value, onChange, placeholder }) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

    const values = Array.isArray(value) ? value.map(String) : [];

    const toggleValue = (v) => {
      if (values.includes(v)) {
        onChange(values.filter((x) => x !== v));
      } else {
        onChange([...values, v]);
      }
      // ❌ DO NOT CLOSE HERE — dropdown remains open
    };

    // 🔥 Outside click uses pointerdown (best for multi-select)
    useEffect(() => {
      const handler = (e) => {
        if (!containerRef.current) return;

        if (!containerRef.current.contains(e.target)) {
          setOpen(false);
        }
      };

      document.addEventListener("pointerdown", handler);
      return () => document.removeEventListener("pointerdown", handler);
    }, []);

    return (
      <div className="relative w-full" ref={containerRef}>
        {/* Input Display Box */}
        <div
          className="p-2 rounded bg-white/5 text-white border border-white/10 cursor-pointer select-none"
          onClick={() => setOpen(!open)}
        >
          {values.length === 0 ? (
            <span className="opacity-50">{placeholder || "Select..."}</span>
          ) : (
            values
              .map((v) => options.find((x) => String(x.ID) === v)?.VALUE || v)
              .join(", ")
          )}
        </div>

        {open && (
          <div
            className="absolute left-0 right-0 mt-1 p-2 bg-black/80 border border-white/20 rounded shadow-lg z-50 max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-gray-300/10 backdrop-blur-md"
            onMouseDown={(e) => e.stopPropagation()}   // PREVENT OUTSIDE-CLOSE
          >
            {/* CLOSE BUTTON */}
            <div className="flex justify-between mb-2">
              {/* SELECT ALL / CLEAR */}
              <div className="flex justify-between text-xs">
                <button
                  className="text-white/70 hover:text-white px-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(options.map((o) => String(o.ID)));
                  }}
                >
                  Select All
                </button>
                <button
                  className="text-white/70 hover:text-white px-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange([]);
                  }}
                >
                  Clear
                </button>
              </div>
              <button
                className="text-xs text-white/70 hover:text-white px-2 py-1 rounded"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}

              >
                Close
              </button>
            </div>

            {/* OPTIONS */}
            {options.map((opt) => {
              const id = String(opt.ID);
              const isChecked = values.includes(id);

              return (
                <div
                  key={id}
                  className={`flex items-center gap-2 px-2 py-1 hover:bg-white/10 cursor-pointer rounded ${isChecked ? "bg-blue-600/20 text-blue-400" : "text-white"
                    }`}
                  onPointerDown={(e) => e.stopPropagation()}  // ⭐ don't close
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleValue(id);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    readOnly
                    onClick={(e) => e.stopPropagation()}   // ⭐ keep dropdown open
                  />
                  <span>{opt.VALUE}</span>
                </div>
              );
            })}

          </div>
        )}
      </div>
    );
  }

  // UserSelectDropdown component for user-type fields
  function UserSelectDropdown({ value, onChange, isMultiple }) {
    const [allUsers, setAllUsers] = useState([]);
    const [userLoading, setUserLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
      if (allUsers.length === 0 && !userLoading && base) {
        setUserLoading(true);
        fetch(`http://127.0.0.1:8000/users?base=${encodeURIComponent(base)}`)
          .then(r => r.json())
          .then(j => {
            setAllUsers(j.result || []);
          })
          .catch(err => console.error('Error loading users:', err))
          .finally(() => setUserLoading(false));
      }
    }, [base]);

    // Outside click handler
    useEffect(() => {
      const handler = (e) => {
        if (containerRef.current && !containerRef.current.contains(e.target)) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, []);

    if (isMultiple) {
      const vals = Array.isArray(value) ? value.map(String) : (value ? [String(value)] : []);
      const toggleValue = (v) => {
        if (vals.includes(v)) {
          onChange(vals.filter(x => x !== v));
        } else {
          onChange([...vals, v]);
        }
      };

      const selectedLabels = vals.map(v => allUsers.find(u => String(u.ID) === v)?.NAME || v).join(", ");

      return (
        <div className="relative w-full" ref={containerRef}>
          <div
            className="p-2 rounded bg-white/5 text-white border border-white/10 cursor-pointer hover:border-purple-500 transition-colors"
            onClick={() => setOpen(!open)}
          >
            {vals.length === 0 ? <span className="text-white/40">Select Users</span> : selectedLabels}
          </div>

          {open && (
            <div className="absolute z-50 mt-1 w-full bg-zinc-900 border border-white/10 rounded shadow-xl max-h-60 overflow-auto">
              {allUsers.map((user) => {
                const id = String(user.ID);
                const isChecked = vals.includes(id);
                return (
                  <div
                    key={id}
                    className={`flex items-center gap-2 px-2 py-2 hover:bg-white/10 cursor-pointer text-sm ${isChecked ? "bg-purple-600/20 text-purple-300" : "text-white"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleValue(id);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      readOnly
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span>{user.NAME || user.LOGIN}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    } else {
      // Single-select for users
      const selectedLabel = allUsers.find(u => String(u.ID) === String(value))?.NAME || value || "Select User";

      return (
        <div className="relative w-full" ref={containerRef}>
          <div
            className="p-2 rounded bg-white/5 text-white border border-white/10 cursor-pointer hover:border-purple-500 transition-colors"
            onClick={() => setOpen(!open)}
          >
            {value ? selectedLabel : <span className="text-white/40">Select User</span>}
          </div>

          {open && (
            <div className="absolute z-50 mt-1 w-full bg-zinc-900 border border-white/10 rounded shadow-xl max-h-60 overflow-auto">
              {allUsers.map((user) => (
                <div
                  key={user.ID}
                  className="p-2 hover:bg-white/10 cursor-pointer text-sm text-white"
                  onClick={() => {
                    onChange(String(user.ID));
                    setOpen(false);
                  }}
                >
                  {user.NAME || user.LOGIN}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
  }

  async function downloadTemplate() {
    if (!base) return alert("Base webhook required");
    const url = `http://127.0.0.1:8000/template/${entity}?base=${encodeURIComponent(base)}`;

    const res = await fetch(url);
    if (!res.ok) {
      alert("Could not download template");
      return;
    }

    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${entity}_template.xlsx`;
    a.click();
  }


  async function downloadCustomTemplate() {
    if (selectedTemplateFields.length === 0) {
      alert("Select at least 1 field!");
      return;
    }

    // ✅ Build label + hint list for backend
    const customFields = selectedTemplateFields.map(code => {
      const label = fieldMap[code] || code;

      if (enumsListMap[code] && enumsListMap[code].length > 0) {
        const options = enumsListMap[code].map(o => o.VALUE).join(", ");
        return {
          code,
          label,
          hint: options
        };
      }

      return {
        code,
        label,
        hint: ""
      };
    });

    const url = `http://127.0.0.1:8000/template/custom/${entity}?base=${encodeURIComponent(base)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: selectedTemplateFields,   // ✅ backend compatible
        meta: customFields                // ✅ label + hints separately
      })
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Template error:", txt);
      alert("Template generation failed");
      return;
    }

    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${entity}_custom_template.xlsx`;
    a.click();

    setShowCustomTemplate(false);
  }




  // FieldPickerInline component (unchanged, for consistency)
  function FieldPickerInline({ cardId, rowId }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");

    const items = allFields.filter(f =>
      (f.label || f.code).toLowerCase().includes(q.toLowerCase())
    );

    const selectedFieldLabel = (() => {
      const c = cards.find(cc => cc.cardId === cardId);
      if (!c) return "";
      const rf = c.fields.find(f => f.rowId === rowId);
      return rf?.label || "";
    })();


    // outside click
    const wrapperRef = useRef(null);
    useEffect(() => {
      function handleClickOutside(e) {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
          setOpen(false);
        }
      }
      if (open) document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [open]);

    useEffect(() => {
      const handleEsc = (e) => {
        if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }, []);


    return (
      <div className="relative w-full" ref={wrapperRef}>
        <input
          value={selectedFieldLabel || q || ""}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          placeholder="Click to select field"
          // ✨ Use the consistent glassy style here
          className="p-2 rounded bg-white/5 w-full text-white border border-white/10"
        />

        {open && (
          <>
            <div
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/40 z-30"
            ></div>

            <div className="absolute z-40 mt-1 w-full bg-zinc-900/95 p-3 rounded-lg shadow-xl max-h-64 overflow-auto border border-white/10 scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-gray-300/10">

              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-white/80">Select Field</span>
                <button
                  className="text-white/60 hover:text-white text-sm"
                  onClick={() => setOpen(false)}
                >
                  ✕
                </button>
              </div>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search..."
                className="w-full p-2 rounded bg-zinc-800 text-white mb-3 border border-white/10"
              />

              {items.length === 0 ? (
                <div className="text-sm text-white/50">No fields found</div>
              ) : (
                items.map((it) => (
                  <div
                    key={it.code}
                    onClick={() => {
                      // set field code and pick up isMultiple flag by inspecting the record for this card
                      setFieldRowCode(cardId, rowId, it.code);
                      setOpen(false);
                      setQ("");
                    }}
                    className="p-2 hover:bg-zinc-700 rounded cursor-pointer text-sm text-white"
                  >
                    {it.label}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // Render (keeps your earlier layout)
  return (
    <Layout>
      {/* 🟢 CHANGE: Responsive Padding (p-4 on mobile, p-10 on desktop) */}
      <div className="min-h-screen p-4 sm:p-6 md:p-10">
        {/* 🟢 CHANGE: Increased Max Width for better table viewing */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 gap-6">

          {/* Controls - UPDATED: Removed max-w-4xl, made it w-full */}
          <div className="glass p-6 w-full mx-auto">
            <h3 className="font-semibold mb-3">Update Records</h3>

            {/* Top row: lead/deal toggle and base */}
            <div className="flex flex-col lg:flex-row gap-3 justify-between items-start">
              <div className="flex gap-2 items-center">
                {/* Regular Width Buttons */}
                <button onClick={() => setEntity("lead")} className={`py-2 px-4 rounded ${entity === "lead" ? "btn text-white" : "bg-white/10"} w-auto`}>Lead</button>
                <button onClick={() => setEntity("deal")} className={`py-2 px-4 rounded ${entity === "deal" ? "btn text-white" : "bg-white/10"} w-auto`}>Deal</button>
              </div>

              {/* method selector */}
              <div className="flex gap-2 flex-wrap">
                {/* Regular Width Buttons */}
                <button onClick={() => setMethod("single")} className={`py-2 px-4 rounded ${method === "single" ? "btn" : "bg-white/10"} w-auto`}>Single ID</button>
                <button onClick={() => setMethod("comma")} className={`py-2 px-4 rounded ${method === "comma" ? "btn" : "bg-white/10"} w-auto`}>Comma-separated</button>
                <button onClick={() => setMethod("file")} className={`py-2 px-4 rounded ${method === "file" ? "btn" : "bg-white/10"} w-auto`}>CSV / XLSX Upload</button>
              </div>
            </div>

            <div className="flex gap-3 rounded mt-3">
              <input value={base} onChange={e => setBase(e.target.value)} placeholder="Base webhook URL" className="p-2 rounded bg-white/5 w-full" />
            </div>


            {/* method inputs */}
            <div className="mt-3">
              {method === "single" && (
                <div className="flex gap-2 flex-col sm:flex-row items-center">
                  <input value={idSingle} onChange={e => setIdSingle(e.target.value)} placeholder="Enter ID" className="p-2 rounded bg-white/5 flex-1 w-full sm:w-auto" />
                  {/* Full Width Button (Fetch) */}
                  <button onClick={fetchSingle} className="btn w-full sm:w-auto" disabled={loading}>{loading ? "Loading..." : "Fetch"}</button>
                </div>
              )}

              {method === "comma" && (
                <div className="flex gap-2 flex-col sm:flex-row items-center">
                  <input value={idsComma} onChange={e => setIdsComma(e.target.value)} placeholder="e.g. 12,34,56" className="p-2 rounded bg-white/5 flex-1 w-full sm:w-auto" />
                  {/* Full Width Button (Fetch) */}
                  <button onClick={fetchMultiple} className="btn w-full sm:w-auto" disabled={loading}>{loading ? "Loading..." : "Fetch"}</button>
                </div>
              )}

              {method === "file" && (
                <div className="flex flex-wrap gap-3 items-center">

                  <label
                    htmlFor="fileInput"
                    className="px-4 py-2 bg-white/10 text-white rounded-lg cursor-pointer"
                  >
                    Upload File
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
                        // auto-run processing immediately when user picks the file:
                        // give the input time to update then call fetchByFile
                        setTimeout(() => fetchByFile(), 50);
                      }
                    }}
                  />


                  <span className="text-sm text-white/50" id="fileName">
                    {fileName || "No file chosen"}
                  </span>

                  <button
                    onClick={fetchByFile}
                    className="btn w-full sm:w-auto" // Full Width Button (Fetch)
                    disabled={loading}
                  >
                    {loading ? "Upload & Fetch" : "Upload & Fetch"}
                  </button>
                </div>
              )}
            </div>


            {error && <div className="text-sm text-red-400 mt-2">{error}</div>}
            
            {/* Template Buttons - Fixed: Removed w-full to make them normal length on small screens */}
            <div className="flex gap-2 flex-col sm:flex-row mt-3">
              <button onClick={downloadTemplate} className="btn w-auto"> 
                <span className="text-xl">⤓</span> Template
              </button>
              <button
                onClick={() => setShowCustomTemplate(true)}
                className="btn w-auto"
              >
                <span className="text-xl">⤓</span> Custom Template
              </button>
            </div>

          </div>

          {/* Cards area (one card per record) */}
          <div className="glass p-6 w-full mx-auto">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2"> 
              <h3 className="font-semibold">Records ({cards.length})</h3>
              {/* Reset Fields Button - Fixed: Removed w-full from the wrapper div */}
              <div className="flex flex-col sm:flex-row gap-2 w-auto"> 
                {/* Regular Width Button (Reset Fields) */}
                <button 
                  onClick={() => { if (records.length) resetCardsForRecords(records); else setCards([]); }} 
                  className="btn w-auto" 
                >
                  Reset Fields
                </button>
              </div>
            </div>



            {/* Cards */}
            <div className="grid gap-3">
              {cards.length === 0 ? (
                <div className="muted">No records loaded. Fetch first.</div>
              ) : (
                cards.map((card) => {
                  const record = records.find(
                    (r) => String(r.ID) === String(card.recordId)
                  );

                  return (
                    <div key={card.cardId} className="p-3 rounded bg-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <strong>ID: {card.recordId}</strong>{" "}
                          {card.recordLabel ? `— ${card.recordLabel}` : ""}
                        </div>
                        <div className="text-sm muted">
                          Fields: {card.fields.length}
                        </div>
                      </div>

                      {/* field rows */}
                      <div className="grid gap-2">
                        {card.fields.map((f) => (
                          <div
                            key={f.rowId}
                            // Stacks on mobile, switches to a 12-column grid on medium (tablet/desktop) screens
                            className="flex flex-col md:grid md:grid-cols-12 gap-2 items-start md:items-center"
                          >
                            {/* The main input area: Full width on mobile, 11/12 on tablet/desktop */}
                            <div className="w-full md:col-span-11 grid grid-cols-1 md:grid-cols-12 gap-2 text-xs text-white/50 mb-1">

                              {/* FIELD PICKER: Full width on mobile, 4/12 on tablet/desktop */}
                              <div className="col-span-12 md:col-span-4">
                                <FieldPickerInline
                                  cardId={card.cardId}
                                  rowId={f.rowId}
                                />
                              </div>

                              {/* OLD VALUE (ENUM label support + placeholder) */}
                              {/* Full width on mobile, 4/12 on tablet/desktop */}
                              <div className="col-span-12 md:col-span-4 p-2 rounded bg-white/5 w-full text-white border border-white/10">
                                {(() => {
                                  const val = enumsListMap[f.code]
                                    ? getEnumLabel(
                                      {
                                        enumerations: enumsListMap[f.code],
                                        isMultiple: f.isMultiple,
                                      },
                                      record ? record[f.code] : f.oldValue
                                    )
                                    : getOldValueForRecord(record, f.code);

                                  return val && String(val).trim() !== ""
                                    ? val
                                    : <span className="text-white/40 italic">Old Value</span>;
                                })()}
                              </div>


                              {/* NEW VALUE PICKER: Full width on mobile, 4/12 on tablet/desktop */}
                              <div className="col-span-12 md:col-span-4 flex gap-2 items-center">
                                {fieldTypesMap[f.code] === 'user' ? (
                                  // User select dropdown
                                  <UserSelectDropdown
                                    value={f.newValue}
                                    onChange={(v) =>
                                      setFieldRowNewValue(card.cardId, f.rowId, v)
                                    }
                                    isMultiple={f.isMultiple}
                                  />
                                ) : enumsListMap[f.code] &&
                                  enumsListMap[f.code].length > 0 ? (
                                  f.isMultiple ? (
                                    <MultiEnumSelect
                                      options={enumsListMap[f.code]}
                                      value={f.newValue || []}
                                      onChange={(vals) =>
                                        setFieldRowNewValue(card.cardId, f.rowId, vals)
                                      }
                                      placeholder="Select values"
                                    />
                                  ) : (
                                    /* SINGLE SELECT */
                                    <SingleEnumSelect
                                      options={enumsListMap[f.code]}
                                      value={f.newValue}
                                      onChange={(v) =>
                                        setFieldRowNewValue(card.cardId, f.rowId, v)
                                      }
                                    />

                                  )
                                ) : (
                                  /* NON ENUM INPUT */
                                  <input
                                    type={getInputType(f.code)}
                                    value={
                                      f.code === "datetime"
                                        ? formatDatetimeLocal(f.newValue)
                                        : f.newValue
                                    }
                                    onChange={(e) =>
                                      setFieldRowNewValue(
                                        card.cardId,
                                        f.rowId,
                                        e.target.value
                                      )
                                    }
                                    placeholder="New value"
                                    className="p-2 rounded bg-white/5 w-full text-white border border-white/10 italic"
                                    {...(getInputType(f.code) === "number" && {
                                      step: "any",
                                    })}
                                    disabled={!f.code}
                                  />
                                )}
                              </div>
                            </div>
                            {/* REMOVE & ADD BUTTONS: Full width on mobile, 1/12 on tablet/desktop */}
                            <div className="w-full md:col-span-1 flex justify-end md:justify-center md:flex-col gap-2 text-xs text-white/50 mb-1">
                              <button
                                onClick={() =>
                                  removeFieldRow(card.cardId, f.rowId)
                                }
                                className="px-2"
                              >
                                ❌
                              </button>
                              <button
                                onClick={() => addFieldRow(card.cardId)}
                                className="px-2"
                              >
                                ➕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>


            {/* actions */}
            <div className="flex flex-col sm:flex-row gap-2 mt-4"> 
              {/* Full Width Button (Update All) */}
              <button 
                onClick={doUpdateAll} 
                className="btn w-full sm:w-auto" 
                disabled={loading || cards.length === 0}
              >
                {loading ? "Updating..." : "Update All"}
              </button>
            </div>
          </div>





          <div className="glass p-6 w-full mx-auto">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h4 className="font-semibold">Update Summary ({summary.length})</h4>
              {/* Clear Summary Button - Fixed: Removed w-full from the wrapper div */}
              <div className="flex flex-col sm:flex-row gap-2 w-auto"> 
                {/* Regular Width Button (Clear Summary) */}
                <button 
                  onClick={() => setSummary([])} 
                  className="btn w-auto" 
                >
                  Clear Summary
                </button>
              </div>
            </div>



            {/* summary */}
            <div className="mt-6">

              {summary.length === 0 ? <div className="muted">No updates yet</div> : (
                <div className="grid gap-2 max-h-96 overflow-y-auto">
                  {summary.map((s, idx) => (
                    <div key={`${s.id}-${idx}`} className="p-2 rounded flex flex-col gap-1" style={{ backgroundColor: s.status === 'ok' ? 'rgba(76, 175, 80, 0.1)' : s.status === 'error' ? 'rgba(244, 67, 54, 0.1)' : 'rgba(255, 255, 255, 0.05)' }}>
                      {/* Top Row: ID and Label (full width, side-by-side) */}
                      <div className="flex justify-between items-start text-sm flex-wrap">
                        <div className="font-bold">ID: {s.id}</div>
                        <div className="text-white/70 max-w-full overflow-hidden whitespace-nowrap overflow-ellipsis">
                          {s.fieldLabel} ({s.fieldCode})
                        </div>
                      </div>
                      {/* Middle Row: Old and New Value (full width, side-by-side) */}
                      <div className="text-xs flex justify-between gap-4">
                        <div className="text-white/70 overflow-hidden whitespace-nowrap overflow-ellipsis flex-1" title={s.oldValue}>
                          <strong className="text-white/90">Old:</strong> {s.oldValue}
                        </div>
                        <div className="overflow-hidden whitespace-nowrap overflow-ellipsis flex-1" title={s.newValue}>
                          <strong className="text-white/90">New:</strong> {s.newValue}
                        </div>
                      </div>
                      {/* Bottom Row: Status and Message */}
                      <div className="text-xs mt-1">
                        <strong className={s.status === 'ok' ? 'text-green-400' : s.status === 'error' ? 'text-red-400' : 'text-yellow-400'}>
                          {s.status.toUpperCase()}
                        </strong> — {String(s.msg).slice(0, 150)}{String(s.msg).length > 150 ? '...' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* actions */}
            <div className="flex flex-col sm:flex-row gap-2 mt-4"> 
              {/* Full Width Button (Summary CSV) */}
              <button 
                onClick={downloadSummaryCSV} 
                className="btn w-full sm:w-auto" 
                disabled={summary.length === 0}
              >
                ⤓ Summary CSV
              </button>
            </div>
          </div>

        </div>
      </div>



      {
    showCustomTemplate && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50">
        <div className="bg-white/10 backdrop-blur-xl p-6 rounded-2xl w-full max-w-4xl text-white border border-white/20 shadow-2xl">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold">Select fields for template</h2>
            <button
              className="text-white/70 hover:text-white text-xl"
              onClick={() => setShowCustomTemplate(false)}
            >
              ✕
            </button>
          </div>

          {/* FIELD GRID */}
          <input
            type="text"
            placeholder="Search fields..."
            className="w-full p-2 mb-3 rounded bg-white/5 border border-white/10"
            onChange={(e) => setTemplateSearch(e.target.value.toLowerCase())}
          />

          <div className="max-h-60 overflow-auto border border-white/10 p-3 rounded grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-gray-300/10">
            {Object.entries(fieldMap)
              .filter(([code, label]) =>
                label.toLowerCase().includes(templateSearch)
              )
              .map(([code, label]) => (
                <label
                  key={code}
                  className="flex items-center gap-2 bg-white/5 p-2 rounded cursor-pointer hover:bg-white/10"
                >
                  <input
                    type="checkbox"
                    checked={selectedTemplateFields.includes(code)}
                    onChange={() => {
                      if (selectedTemplateFields.includes(code)) {
                        setSelectedTemplateFields(
                          selectedTemplateFields.filter((c) => c !== code)
                        );
                      } else {
                        setSelectedTemplateFields([
                          ...selectedTemplateFields,
                          code,
                        ]);
                      }
                    }}
                  />
                  {label}
                </label>
              ))}
          </div>

          {/* BUTTONS */}
          <div className="flex justify-end gap-2 mt-4">
            <button
              className="btn bg-gray-600"
              onClick={() => setShowCustomTemplate(false)}
            >
              Cancel
            </button>

            <button
              className="btn bg-purple-500"
              onClick={downloadCustomTemplate}
            >
              Generate
            </button>
          </div>
        </div>
      </div>
    )
  }


    </Layout >
  );
}