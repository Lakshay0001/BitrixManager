// frontend/pages/list-get-update.js
import { useState, useEffect, useContext, useRef } from "react";
import Layout from "../../components/Layout";
import { WebhookContext } from "../../context/WebhookContext";
import ExpandableCard from "../../components/ExpandableCard";
import LoadingSpinner from "../../components/LoadingSpinner";
import LoadingButton from "../../components/LoadingButton";
import { API_BASE, buildUrl as apiBuildUrl } from "../../lib/api";
import ShowHideTokenButton from "@/components/ui/ShowHideTokenButton";

// =================================================================
// 1. UTILITY FUNCTIONS (Added/Consolidated)
// =================================================================

// Utility function to format labels from CODE_ID -> Code Id
const formatLabel = (label) => {
  if (!label) return '';
  let cleaned = label.replace(/[_\-\.]/g, ' ').toLowerCase();
  return cleaned.split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

// Utility function to format Date object into YYYY-MM-DD string
const formatDate = (date) => {
  const d = new Date(date);
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();
  const year = d.getFullYear();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  return [year, month, day].join('-');
};

// Utility to convert datetime string from API to local datetime format
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

// Helper: normalize enums returned by backend
function normalizeEnums(rawEnums) {
  const dict = {}; // {code: {id: label}}
  const list = {}; // {code: [{ID: id, VALUE: label}]}
  if (!rawEnums || typeof rawEnums !== "object") return { dict, list };

  Object.entries(rawEnums).forEach(([code, val]) => {
    if (Array.isArray(val)) {
      list[code] = val.map(item => {
        const ID = item.ID ?? item.id ?? String(item.value ?? "");
        const VALUE = item.VALUE ?? item.value ?? item.label ?? item.NAME ?? "";
        return { ID: String(ID), VALUE: VALUE };
      });
      dict[code] = list[code].reduce((acc, it) => {
        acc[String(it.ID)] = it.VALUE;
        return acc;
      }, {});
    } else if (val && typeof val === "object") {
      list[code] = Object.entries(val).map(([id, label]) => ({ ID: String(id), VALUE: label }));
      dict[code] = { ...val };
    } else {
      list[code] = [];
      dict[code] = {};
    }
  });
  return { dict, list };
}


// =================================================================
// 2. MAIN COMPONENT
// =================================================================
export default function ManagePage() {
  const { webhook } = useContext(WebhookContext);

  const [base, setBase] = useState("");
  const [entity, setEntity] = useState("lead"); // 'lead' | 'deal'

  // --- List/Filter States ---
  const today = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);
  const [filterType, setFilterType] = useState("created");
  const [filterDateFrom, setFilterDateFrom] = useState(formatDate(sevenDaysAgo));
  const [filterDateTo, setFilterDateTo] = useState(formatDate(today));
  const [listRows, setListRows] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const listTableRef = useRef();

  // --- Field Selection States (copied from list.js) ---
  const [allFields, setAllFields] = useState([]); // [{code,label}]
  const [selectedFields, setSelectedFields] = useState([]);
  const [fieldSearch, setFieldSearch] = useState('');
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [fieldMap, setFieldMap] = useState({}); // code -> label
  const [enumsMap, setEnumsMap] = useState({}); // code -> {id: label}
  const defaultFieldsMap = {
    lead: ['ID', 'TITLE', 'NAME', 'PHONE', 'EMAIL'],
    deal: ['ID', 'TITLE', 'NAME', 'PHONE', 'EMAIL']
  };

  // --- Get/Update States ---
  const [getRows, setGetRows] = useState([]);
  const [getLoading, setGetLoading] = useState(false);
  const [horizontalView, setHorizontalView] = useState(true);

  // 🔥 UPDATE STATES 🔥
  const [cards, setCards] = useState([]); // Array of {cardId, recordId, fields: []}
  const [updateLoading, setUpdateLoading] = useState(false);
  const [summary, setSummary] = useState([]); // Array for update results

  // FIELD MAPPING STATES
  const [enumsListMap, setEnumsListMap] = useState({}); // code -> array
  const [fieldTypesMap, setFieldTypesMap] = useState({}); // code -> type
  const tableRef = useRef(null);

  // Loading spinner message
  const [loadingMessage, setLoadingMessage] = useState('Loading...');

      const [isMasked, setIsMasked] = useState(true); // State to control visibility

    const toggleMask = () => {
        setIsMasked(!isMasked); // Toggle the masking visibility
    };

  // ---- Load webhook ----
  useEffect(() => {
    if (webhook) setBase(webhook);
    else {
      const saved = localStorage.getItem("webhook");
      if (saved) setBase(saved);
    }
  }, [webhook]);

  // ---- Fetch fields on entity/base change (from list.js) ----
  useEffect(() => {
    if (!base) return;

    setAllFields([]);
    setSelectedFields([]);
    setListRows([]); // Clear list on entity change

    fetch(`http://127.0.0.1:8000/fields/${entity}?base=${encodeURIComponent(base)}`)
      .then(r => r.json())
      .then(j => {
        const opts = Object.entries(j.code_to_label || {})
          .map(([code, label]) => ({ code, label }));

        const types = j.code_to_type || {};
        const rawEnums = j.enums || {};
        const { dict: enumsDict, list: enumsList } = normalizeEnums(rawEnums);

        setAllFields(opts);
        setFieldMap(j.code_to_label || {});
        setFieldTypesMap(types);
        setEnumsMap(enumsDict);
        setEnumsListMap(enumsList);

        const initialSelected = defaultFieldsMap[entity]
          .map(code => opts.find(f => f.code === code) || { code, label: code })
          .map(f => f.code)
          .filter(code => opts.some(f => f.code === code));

        setSelectedFields(initialSelected);
      })
      .catch(err => console.error("Error loading fields", err));

    // Clear Get/Update records too on entity change
    setGetRows([]);
    setCards([]);
    setSummary([]);

  }, [entity, base]);

  // =================================================================
  // 3. CORE LOGIC FUNCTIONS
  // =================================================================

  // ---- Utility functions (Cont.) ----
  const buildUrl = (path, qs = {}) => {
    const u = new URL(path, "http://127.0.0.1:8000");
    Object.entries(qs).forEach(([k, v]) => { if (v) u.searchParams.set(k, v); });
    return u.toString();
  };

  // Helper: Determine the correct HTML input type
  const getInputType = (code) => {
    const type = fieldTypesMap[code];
    if (!type) return 'text';

    if ((code || "").toUpperCase().includes('PHONE') || (code || "").toUpperCase().includes('EMAIL')) return 'text';

    switch (type) {
      case 'date':
        return 'date';
      case 'datetime':
        return 'datetime-local';
      case 'double':
      case 'integer':
        return 'number';
      case 'email':
        return 'email';
      default:
        return 'text';
    }
  };


  // get old value for a record for a field code
  function getOldValueForRecord(record, code) {
    if (!record) return "";
    const v = record[code];

    // Handle arrays: could be array of ids, objects, or mixed
    if (Array.isArray(v)) {
      // If enums exist for this code, map ids -> labels
      if (enumsListMap && enumsListMap[code]) {
        const enumArr = enumsListMap[code];
        const mapped = v.map(item => {
          // item may be primitive id or object {ID, VALUE}
          const id = (item && typeof item === 'object') ? (item.ID ?? item.id ?? item.VALUE ?? item.value) : item;
          const found = enumArr.find(e => String(e.ID) === String(id));
          if (found) return found.VALUE;
          // if item is object with VALUE field
          if (item && typeof item === 'object' && (item.VALUE || item.value)) return item.VALUE || item.value;
          return String(id);
        });
        return mapped.join(', ');
      }

      // Fallback: if array of objects with VALUE
      const mappedVals = v.map(i => i && i.VALUE ? String(i.VALUE) : (i && typeof i === 'object' ? JSON.stringify(i) : String(i)));
      return mappedVals.join(', ');
    }

    if (v && typeof v === "object") {
      if ("VALUE" in v) return v.VALUE;
      return JSON.stringify(v);
    }

    // Enum fields decode for scalar values
    if (v !== null && v !== undefined && enumsMap && enumsMap[code]) {
      const decoded = enumsMap[code][String(v)];
      if (decoded !== undefined) return decoded;
    }

    // Date/Datetime fields formatting
    const type = fieldTypesMap[code];
    if (type === 'date' && v) {
      return String(v).split('T')[0];
    }
    if (type === 'datetime' && v) {
      // Return the value formatted for display, not for input control
      return formatDatetimeLocal(v);
    }

    return v ?? "";
  }

  // Gets the label for enum value (used in the UI)
  const getEnumLabel = ({ enumerations, isMultiple }, value) => {
    if (!enumerations || !value) return "";

    if (isMultiple) {
      if (Array.isArray(value) && typeof value[0] === 'string' && !enumerations.find(e => String(e.ID) === value[0])) {
        return value.join(", ");
      }

      const ids = Array.isArray(value) ? value : String(value).split(',').map(s => s.trim()).filter(s => s);

      return ids.map(id => {
        const item = enumerations.find(e => String(e.ID) === String(id));
        return item ? item.VALUE : String(id);
      }).join(", ");
    }

    const item = enumerations.find(e => String(e.ID) === String(value));
    return item ? item.VALUE : String(value || "");
  };


  // Logic to render cell value (used in Get Records Cards)
  function renderGetCellValue(v, key) {
    if (v === null || v === undefined) return "";
    // Check if it's an enum
    if (enumsMap && enumsMap[key] && enumsMap[key][String(v)] !== undefined) return enumsMap[key][String(v)];
    // Check if it's a multi-field (like Phone/Email array)
    if (Array.isArray(v)) return v.map(i => i.VALUE ? `${i.VALUE} (${i.VALUE_TYPE || ''})` : JSON.stringify(i)).join(", ");
    // Check if it's an object with a VALUE (like some other complex fields)
    if (typeof v === "object" && v !== null) return v.VALUE ? `${v.VALUE} (${v.VALUE_TYPE || ''})` : JSON.stringify(v);
    return String(v);
  }

  // Logic to render cell value for the LIST table (optimized for table cell)
  function renderListCellValue(val, f) {
    if (val === null || val === undefined) return "";

    // Decode enum values (This is where SOURCE_ID/STAGE_ID is decoded)
    if (typeof val !== 'object' && enumsMap && enumsMap[f]) {
      const decoded = enumsMap[f][String(val)];
      if (decoded !== undefined) val = decoded;
    }

    // Array / object flattening (Your previous fix for phone/email)
    if (Array.isArray(val)) {
      val = val.map(i => i.VALUE ? i.VALUE : JSON.stringify(i)).join(', ');
    } else if (val && typeof val === 'object' && 'VALUE' in val) {
      val = val.VALUE;
    } else if (val && typeof val === 'object') {
      val = JSON.stringify(val);
    }

    return String(val || '');
  }

  function downloadCSV(rows, filename = "results.csv") {
    if (!rows || rows.length === 0) {
      alert("No data to download");
      return;
    }

    // Create a union of all keys from all rows to define the header
    const keys = [];
    rows.forEach((r) => {
      Object.keys(r).forEach((k) => {
        if (!keys.includes(k)) keys.push(k);
      });
    });

    if (keys.length === 0) return alert("No fields found in data to download.");

    const headerLabels = keys.map(k => formatLabel(fieldMap[k] || k));
    const lines = [headerLabels.join(",")];

    rows.forEach((r) => {
      const row = keys.map((k) => {
        let v = r[k];

        // Decode value using renderCellValue logic
        if (v !== null && v !== undefined) {
          const decoded = renderGetCellValue(v, k);
          v = decoded;
        }

        if (v === null || v === undefined) v = "";

        // CSV escaping: wrap in quotes and escape internal quotes
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(",");
      lines.push(row);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename; // Use the provided filename
    a.click();
  }

  // Field selection/toggle functions for the List section
  const toggleField = (code) => {
    if (selectedFields.includes(code)) {
      setSelectedFields(selectedFields.filter(f => f !== code));
    } else {
      setSelectedFields([...selectedFields, code]);
    }
  };
  const selectAll = () => setSelectedFields(allFields.map(f => f.code));
  const deselectAll = () => setSelectedFields([]);
  const filteredFields = allFields.filter(f =>
    f.label.toLowerCase().includes(fieldSearch.toLowerCase())
  );

  const handleEntityChange = (newEntity) => {
    if (newEntity !== entity) {
      setListRows([]);
      setFieldSearch('');
      setEntity(newEntity);
      setGetRows([]);
      setCards([]); // Clear Update records
    }
  };

  // ✅ fetchList to use 'select' parameter
  async function fetchList() {
    if (!base) return alert("Enter base webhook");
    if (selectedFields.length === 0) return alert("Select at least one field");

    setListLoading(true);
    setLoadingMessage("Fetching list records...");
    setListRows([]);
    try {
      const qs = {
        base,
        select: selectedFields.join(','),
      };
      if (filterType === "created") {
        qs.from_created = filterDateFrom;
        qs.to_created = filterDateTo;
      } else if (filterType === "modified") {
        qs.from_modified = filterDateFrom;
        qs.to_modified = filterDateTo;
      }

      const url = buildUrl(`/list/${entity}`, qs);
      console.log("🚩 List Fetch URL:", url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const j = await res.json();

      setListRows(j.result || []);
      console.log("🚩 List Fetch Raw Data:", j.result || []);

    } catch (e) {
      alert(String(e));
      setListRows([]);
    } finally {
      setListLoading(false);
      setLoadingMessage('Loading...');
    }
  }


  // ✅ fetchGetRow
  async function fetchGetRow(row) {
    if (!base || !row.ID) return alert("No ID");
    setGetLoading(true);
    setLoadingMessage("Fetching record details...");
    try {
      const url = buildUrl("/get/single", { entity, item_id: row.ID, base });
      console.log("🚩 Single Item Fetch URL:", url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Status ${res.status}`);

      const jsonResponse = await res.json();
      let data = jsonResponse.result || jsonResponse;

      setGetRows(prev => {
        // Replace if already exists, otherwise append
        const existingIndex = prev.findIndex(r => String(r.ID) === String(data.ID));
        if (existingIndex > -1) {
          return prev.map((item, idx) => idx === existingIndex ? data : item);
        }
        return [...prev, data];
      });
    } catch (e) {
      alert(String(e));
    } finally {
      setGetLoading(false);
      setLoadingMessage('Loading...');
    }
  }

  // ✅ fetchGetAll
  async function fetchGetAll() {
    if (!base || listRows.length === 0) return alert("No records in list to fetch all");
    setGetLoading(true);
    setLoadingMessage(`Fetching ${listRows.length} records...`);
    setGetRows([]); // Clear previous fetched items

    try {
      const ids = listRows.map(r => r.ID);
      console.log("🚩 Get All IDs to Fetch:", ids);
      const detailedResults = [];

      for (const id of ids) {
        const url = buildUrl("/get/single", { entity, item_id: id, base });

        const res = await fetch(url);
        if (res.ok) {
          const jsonResponse = await res.json();
          let data = jsonResponse.result || jsonResponse;
          detailedResults.push(data);
        } else {
          console.error(`Failed to fetch ID ${id}: Status ${res.status}`);
        }
      }

      setGetRows(detailedResults);
      console.log("🚩 Get All Final Processed Data:", detailedResults);
    } catch (e) {
      alert("Error in Get All operation: " + String(e));
    } finally {
      setGetLoading(false);
      setLoadingMessage('Loading...');
    }
  }

  // =================================================================
  // 4. CARD-BASED UPDATE FUNCTIONS
  // =================================================================

  // Function to add a record to update queue (called by the UI buttons)
  function addToUpdate(row) {
    const cardId = `card_${row.ID}`;

    const card = {
      cardId,
      recordId: String(row.ID),
      recordLabel: row.TITLE || row.NAME || String(row.ID),
      fields: [
        {
          rowId: `${cardId}_0`,
          code: "",
          label: "",
          newValue: "",
          isMultiple: false,
          oldValue: ""
        }
      ]
    };

    setCards(prev => {
      if (prev.some(c => c.cardId === cardId)) return prev;
      return [...prev, card];
    });
  }


  async function handleUpdateFromList(row) {
    if (!base || !row.ID) return alert("Invalid record");

    setGetLoading(true);

    try {
      const url = buildUrl("/get/single", {
        entity,
        item_id: row.ID,
        base,
      });

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Status ${res.status}`);

      const json = await res.json();
      const record = json.result || json;

      // 1️⃣ ensure record is in getRows
      setGetRows((prev) => {
        const exists = prev.some((r) => String(r.ID) === String(record.ID));
        if (exists) return prev.map(r => String(r.ID) === String(record.ID) ? record : r);
        return [...prev, record];
      });

      // 2️⃣ now safely add to update
      addToUpdate(record);

    } catch (e) {
      alert("Failed to fetch record before update: " + e.message);
    } finally {
      setGetLoading(false);
    }
  }


  // Send all fetched records to the update queue
  function sendAllToUpdate() {
    if (getRows.length === 0) return alert("No records fetched to send for update. Please use 'Get All' or 'Get' first.");
    getRows.forEach(row => {
      addToUpdate(row);
    });
  }

  // CARD helpers: For adding/removing fields in the UI
  function addFieldRow(cardId) {
    setCards(prev =>
      prev.map(c => {
        if (c.cardId !== cardId) return c;

        const nextIndex = c.fields.length;

        return {
          ...c,
          fields: [
            ...c.fields,
            {
              rowId: `${cardId}_${nextIndex}`,
              code: "",
              label: "",
              newValue: "",
              isMultiple: false,
              oldValue: ""
            }
          ]
        };
      })
    );
  }


  function removeFieldRow(cardId, rowId) {
    setCards(prev =>
      prev.map(c => {
        if (c.cardId !== cardId) return c;

        const newFields = c.fields.filter(f => f.rowId !== rowId);

        return {
          ...c,
          fields: newFields.length
            ? newFields
            : [
              {
                rowId: `${cardId}_0`,
                code: "",
                label: "",
                newValue: "",
                isMultiple: false,
                oldValue: ""
              }
            ]
        };
      })
    );
  }


  function setFieldRowCode(cardId, rowId, code) {
    const label = fieldMap[code] || code;

    // Find the original record from getRows
    const recordForCard = getRows.find(r => String(r.ID) === String(cards.find(c => c.cardId === cardId)?.recordId));
    const recordValue = recordForCard ? recordForCard[code] : undefined;
    const isMultiple = Array.isArray(recordValue) || false;
    const oldValue = getOldValueForRecord(recordForCard, code);

    setCards(prev => prev.map(c => {
      if (c.cardId !== cardId) return c;
      return {
        ...c,
        fields: c.fields.map(f => f.rowId === rowId ? { ...f, code, label, newValue: "", isMultiple, oldValue } : f)
      };
    }));
  }

  function setFieldRowNewValue(cardId, rowId, val) {
    setCards(prev =>
      prev.map(c =>
        c.cardId !== cardId
          ? c
          : {
            ...c,
            fields: c.fields.map(f =>
              f.rowId === rowId
                ? { ...f, newValue: val }
                : f
            )
          }
      )
    );
  }


  // perform bulk update
  async function doUpdateAll() {
    if (!base || cards.length === 0) return alert("No records selected for update.");
    setUpdateLoading(true);
    setLoadingMessage(`Updating ${cards.length} records...`);

    const results = [];
    try {
      for (const card of cards) {
        const payload = {};
        // Filter fields with both code and non-empty newValue
        card.fields
          .filter(f => f.code && f.newValue !== "" && f.newValue !== null && f.newValue !== undefined)
          .forEach(f => {
            if (f.isMultiple && Array.isArray(f.newValue)) {
              payload[f.code] = f.newValue;
            } else if (f.isMultiple && typeof f.newValue === 'string' && f.newValue.includes(',')) {
              payload[f.code] = f.newValue.split(',').map(s => s.trim());
            } else {
              payload[f.code] = f.newValue;
            }
          });

        if (Object.keys(payload).length === 0) {
          results.push({ id: card.recordId, fieldCode: '', fieldLabel: 'All', status: 'info', oldValue: '', newValue: '', msg: 'No fields to update for this record.' });
          continue;
        }

        // Use path-style update URL to match backend route
        const url = buildUrl(`/update/${entity}/${encodeURIComponent(card.recordId)}`, { base });

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const j = await res.json();

        // Normalize and pretty-print result for summary
        const pretty = (x) => {
          if (x === null || x === undefined) return "";
          if (typeof x === 'object') {
            try { return JSON.stringify(x); } catch (e) { return String(x); }
          }
          return String(x);
        };

        const hasError = j && typeof j === 'object' && j.error;
        const hasResult = j && ((typeof j === 'object' && j.result !== undefined) || j === true);
        const summaryMsg = hasError ? (j.error_description || j.error) : (j && j.result !== undefined ? pretty(j.result) : pretty(j));

        // Log the result for each field update in the summary
        card.fields
          .filter(f => f.code && f.newValue !== "" && f.newValue !== null && f.newValue !== undefined)
          .forEach(f => {
            // Format old/new values for enums and multi-selects
            const formatForSummary = (code, val, isMulti) => {
              if (val === null || val === undefined || val === '') return '';
              // Enums: map ids -> labels
              if (enumsListMap && enumsListMap[code]) {
                // Use getEnumLabel helper which accepts arrays and objects
                try {
                  return getEnumLabel({ enumerations: enumsListMap[code], isMultiple: isMulti }, val);
                } catch (e) {
                  // fallback to string
                }
              }
              // Arrays -> join
              if (Array.isArray(val)) return val.join(', ');
              return String(val);
            };

            const displayOld = formatForSummary(f.code, f.oldValue, f.isMultiple);
            const displayNew = formatForSummary(f.code, f.newValue, f.isMultiple);

            results.push({
              id: card.recordId,
              fieldCode: f.code,
              fieldLabel: f.label,
              oldValue: displayOld,
              newValue: displayNew,
              status: hasError ? 'error' : hasResult ? 'ok' : 'info',
              msg: summaryMsg || 'Update response missing result/error'
            });
          });
      }

      setSummary(prev => [...results, ...prev]); // Add new results to the top
      setCards([]); // Clear the cards after successful/attempted update

    } catch (e) {
      alert("Error during bulk update: " + String(e));
    } finally {
      setUpdateLoading(false);
      setLoadingMessage('Loading...');
    }
  }

  // download summary csv
  function downloadSummaryCSV() {
    if (!summary || summary.length === 0) {
      alert("No summary data to download");
      return;
    }

    const keys = ["id", "fieldLabel", "fieldCode", "status", "oldValue", "newValue", "msg"];
    const headerLabels = keys.map(k => formatLabel(k));
    const lines = [headerLabels.join(",")];

    summary.forEach((r) => {
      const row = keys.map((k) => {
        let v = r[k];
        if (v === null || v === undefined) v = "";
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(",");
      lines.push(row);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "update_summary.csv";
    a.click();
  }


  // =================================================================
  // 5. PLACEHOLDER/DYNAMIC COMPONENTS
  // =================================================================

  // Unified dropdown component matching update.js style
  const DropdownSelect = ({ options, value, onChange, placeholder = "Select option", isMultiple = false, displayField = "VALUE" }) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

    // Get selected label(s)
    const getSelectedLabel = () => {
      if (isMultiple) {
        const vals = Array.isArray(value) ? value : (value ? [String(value)] : []);
        return vals.map(v => options.find(o => String(o.ID) === String(v))?.[displayField] || v).join(", ") || placeholder;
      } else {
        return options.find(o => String(o.ID) === String(value))?.[displayField] || placeholder;
      }
    };

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
      const vals = Array.isArray(value) ? value.map(String) : [];
      const toggleValue = (v) => {
        if (vals.includes(v)) {
          onChange(vals.filter(x => x !== v));
        } else {
          onChange([...vals, v]);
        }
      };

      return (
        <div className="relative w-full" ref={containerRef}>
          <div
            className="p-2 rounded bg-white/5 text-white border border-white/10 cursor-pointer hover:border-purple-500 transition-colors"
            onClick={() => setOpen(!open)}
          >
            {vals.length === 0 ? <span className="text-white/40">{placeholder}</span> : getSelectedLabel()}
          </div>

          {open && (
            <div className="absolute z-50 mt-1 w-full bg-zinc-900 border border-white/10 rounded shadow-xl max-h-60 overflow-auto">
              {options.map((opt) => {
                const id = String(opt.ID);
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
                    <span>{opt[displayField]}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    } else {
      // Single select
      return (
        <div className="relative w-full" ref={containerRef}>
          <div
            className="p-2 rounded bg-white/5 text-white border border-white/10 cursor-pointer hover:border-purple-500 transition-colors"
            onClick={() => setOpen(!open)}
          >
            {value ? getSelectedLabel() : <span className="text-white/40">{placeholder}</span>}
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
                  {opt[displayField]}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
  };

  const SingleEnumSelect = ({ options, value, onChange }) => (
    <DropdownSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Select Value"
      displayField="VALUE"
    />
  );

  const MultiEnumSelect = ({ options, value, onChange }) => (
    <DropdownSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Select Values"
      isMultiple={true}
      displayField="VALUE"
    />
  );


  // 🔥 UPDATED COMPONENT: Field Select with Dropdown Style 🔥
  const FieldSelectWithSearch = ({ cardId, rowId, allFields, currentCode, setFieldRowCode }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef(null);

    const currentLabel = allFields.find(f => f.code === currentCode)?.label || "Select Field";

    const filtered = allFields.filter(f =>
      f.label.toLowerCase().includes(search.toLowerCase()) ||
      f.code.toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
      function handleClickOutside(event) {
        if (ref.current && !ref.current.contains(event.target)) {
          setIsOpen(false);
        }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [ref]);

    const handleSelect = (code) => {
      setFieldRowCode(cardId, rowId, code);
      setIsOpen(false);
      setSearch('');
    };

    return (
      <div className="relative" ref={ref}>
        {/* Display Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded bg-white/5 w-full text-white/90 border border-white/10 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all italic text-left flex justify-between items-center"
        >
          {currentCode ? formatLabel(currentLabel) : <span className="text-white/50">Select Field</span>}
          <span className="text-xs text-white/50">{isOpen ? "▲" : "▼"}</span>
        </button>

        {/* Dropdown/Popup Panel - Unified Style */}
        {isOpen && (
          <div
            className="absolute z-50 mt-1 w-full bg-zinc-900 border border-white/10 rounded shadow-xl max-h-60 overflow-auto"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="sticky top-0 bg-zinc-900 p-2 border-b border-white/10">
              <input
                type="text"
                placeholder="Search field..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full p-2 rounded bg-white/5 text-white placeholder-white/50 focus:ring-1 focus:ring-purple-500 outline-none border border-white/10"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Field List */}
            <div>
              {filtered.map(f => (
                <div
                  key={f.code}
                  onClick={() => handleSelect(f.code)}
                  className={`p-2 hover:bg-white/10 cursor-pointer text-sm transition-colors ${f.code === currentCode ? 'bg-purple-600/20 text-purple-300' : 'text-white'}`}
                >
                  {formatLabel(f.label)}
                  <span className="text-xs text-white/50 ml-2">({f.code})</span>
                </div>
              ))}
              {filtered.length === 0 && <div className="p-2 text-white/50 text-center text-sm">No fields found</div>}
            </div>
          </div>
        )}
      </div>
    );
  };


  // 🔥 UPDATED Dynamic Input for New Value (CSS matched) 🔥
  const DynamicNewValueInput = ({ fieldCode, currentValue, onChange, isMultiple = false }) => {
    const type = fieldTypesMap[fieldCode];
    const enumerations = enumsListMap[fieldCode];
    const isEnum = enumerations && enumerations.length > 0;
    const inputType = getInputType(fieldCode);
    const isUserType = type === 'user';

    // prefer explicit flag passed from card row
    const isMulti = Boolean(isMultiple) || fieldTypesMap[fieldCode] === 'crm_multifield' || (fieldCode in enumsListMap && fieldCode.includes('UF_MULTI'));

    // Default input class for ALL non-select/non-multi-select inputs
    const defaultInputClass = "p-2 rounded w-full bg-white/10 text-white/90 border border-white/10 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all italic";

    // User-type fields: show a dropdown select
    if (isUserType) {
      const [allUsers, setAllUsers] = useState([]);
      const [userLoading, setUserLoading] = useState(false);

      useEffect(() => {
        if (allUsers.length === 0 && !userLoading) {
          setUserLoading(true);
          fetch(`http://127.0.0.1:8000/users?base=${encodeURIComponent(base)}`)
            .then(r => r.json())
            .then(j => {
              setAllUsers((j.result || []).map(u => ({ ID: String(u.ID), VALUE: u.NAME || u.LOGIN })));
            })
            .catch(err => console.error('Error loading users:', err))
            .finally(() => setUserLoading(false));
        }
      }, []);

      // Check if field allows multiple selection
      const isMultiUser = isMulti;

      return (
        <DropdownSelect
          options={allUsers}
          value={currentValue}
          onChange={onChange}
          placeholder="Select User"
          isMultiple={isMultiUser}
          displayField="VALUE"
        />
      );
    }

    // Fallback for complex types that should be text
    if (type === 'file' || type === 'crm_multifield') {
      if (fieldCode === 'PHONE' || fieldCode === 'EMAIL') {
        return (
          <input
            type="text"
            value={currentValue ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Example: [value, value_type]`}
            className={defaultInputClass}
          />
        );
      }
    }

    // For long text values, show textarea with dynamic rows
    const asString = currentValue === null || currentValue === undefined ? "" : (Array.isArray(currentValue) ? currentValue.join(', ') : String(currentValue));
    if (asString.length > 80 && !isEnum && inputType === 'text') {
      const rows = Math.min(10, Math.max(2, Math.ceil(asString.length / 60)));
      return (
        <textarea
          rows={rows}
          value={asString}
          onChange={(e) => onChange(e.target.value)}
          className="p-2 rounded w-full bg-white/10 text-white/90 border border-white/10 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
        />
      );
    }

    if (isEnum) {
      if (isMulti) {
        // Multi-Enum Select 
        const valueArray = Array.isArray(currentValue) ? currentValue : (currentValue ? String(currentValue).split(',').map(s => s.trim()) : []);
        return (
          <MultiEnumSelect
            options={enumerations}
            value={valueArray}
            onChange={(vals) => onChange(vals)}
            placeholder="Select values"
          />
        );
      } else {
        // Single Enum Select 
        return (
          <SingleEnumSelect
            options={enumerations}
            value={currentValue ?? ""}
            onChange={(v) => onChange(v)}
          />
        );
      }
    }

    // Handle Date/Datetime with local state + onBlur
    if (inputType === 'date' || inputType === 'datetime-local') {
      const [localValue, setLocalValue] = useState(inputType === 'datetime-local' ? formatDatetimeLocal(currentValue) : currentValue);

      useEffect(() => {
        setLocalValue(inputType === 'datetime-local' ? formatDatetimeLocal(currentValue) : currentValue);
      }, [currentValue, inputType]);

      return (
        <input
          type={inputType}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => onChange(localValue)}
          className={defaultInputClass}
        />
      );
    }

    // Handle Number with local state + onBlur
    if (inputType === 'number') {
      const [localValue, setLocalValue] = useState(currentValue ?? "");

      useEffect(() => {
        setLocalValue(currentValue ?? "");
      }, [currentValue]);

      return (
        <input
          type="number"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => onChange(localValue)}
          placeholder="Enter number"
          className={defaultInputClass}
          step="any"
        />
      );
    }

    // For free-text inputs use local state to avoid keystroke re-render issues.
    // We sync from `currentValue` and only push changes up onBlur.
    const [localValue, setLocalValue] = useState(currentValue ?? "");

    useEffect(() => {
      setLocalValue(currentValue ?? "");
    }, [currentValue]);

    return (
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => onChange(localValue)}
        placeholder="New value"
        className={defaultInputClass}
      />
    );
  };

      const maskInput = (input) => {
        if (input.length <= 13) {
            return input;
        }

        const maskedPart = '*'.repeat(12);
        const visiblePart = input.slice(0, -13) + maskedPart + input.slice(-1);

        return visiblePart;
    };


  // =================================================================
  // 6. JSX RENDER (Main Component Return)
  // =================================================================

  return (
    <>
      {(listLoading || getLoading || updateLoading) && <LoadingSpinner message={loadingMessage} />}
      <Layout>
        <div className="minp-6 max-w-6xl mx-auto space-y-6 -h-screen p-4 sm:p-6 md:p-10 space-y-6">
          {/* ---- List Glass ---- */}
          {/* ... (List Glass component remains mostly unchanged) ... */}
          <div className="glass p-6">
            <h3 className="font-semibold mb-3">List Records</h3>

            {/* Base URL Input */}
            <div className="flex flex-row gap-3 w-full">
                <input
                  value={isMasked ? maskInput(base) : base}
                  onChange={e => setBase(e.target.value)}
                  placeholder="Base webhook URL"
                  className="p-2 rounded bg-white/5 w-full"
                />
                <ShowHideTokenButton isMasked={isMasked} toggleMask={toggleMask} />
                </div>

            <div className="flex flex-row gap-2 my-3">
              <button
                onClick={() => handleEntityChange("lead")}
                className={`py-2 px-4 rounded ${entity === "lead" ? "btn" : "bg-white/10"}`}
              >
                Lead
              </button>
              <button
                onClick={() => handleEntityChange("deal")}
                className={`py-2 px-4 rounded ${entity === "deal" ? "btn" : "bg-white/10"}`}
              >
                Deal
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mb-3 w-full">
              <div className="flex gap-2 items-center">
                <button
                  onClick={() => setFilterType("created")}
                  className={`px-3 py-1 rounded ${filterType === "created" ? "btn" : "bg-white/10"}`}
                >
                  Created
                </button>
                <button
                  onClick={() => setFilterType("modified")}
                  className={`px-3 py-1 rounded ${filterType === "modified" ? "btn" : "bg-white/10"}`}
                >
                  Modified
                </button>
              </div>
              <div className="flex flex-row gap-3 w-full">
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="p-2 rounded bg-white/5 w-1/2 sm:w-auto"
                />
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="p-2 rounded bg-white/5 w-1/2 sm:w-auto"
                />
              </div>
            </div>

            {/* New Field Select/Download Buttons */}
            <div className="flex flex-wrap gap-2 mt-3 mb-3">
              <button onClick={fetchList} className="btn w-full sm:w-auto" disabled={listLoading}>
                {listLoading ? "Fetching..." : "Fetch List"}
              </button>
              <button onClick={() => setShowFieldModal(true)} className="btn w-full sm:w-auto">Select Fields</button>
              <button
                onClick={() => downloadCSV(listRows, "list.csv")}
                className='btn w-full sm:w-auto'
              >
                ⤓ CSV
              </button>
            </div>


            {listRows.length > 0 && (
              <>
                {/* Selected fields chips */}
                <div className='flex flex-wrap gap-2 mb-3'>
                  {selectedFields.map(f => (
                    <div key={f} className='bg-white/10 px-3 py-1 rounded-full text-sm whitespace-nowrap'>
                      {formatLabel(fieldMap[f] || f)}
                    </div>
                  ))}
                </div>

                <div ref={listTableRef} className="overflow-x-auto scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-gray-300/10">
                  <table className="min-w-full bg-white/5 rounded">
                    <thead className="bg-white/6">
                      <tr>
                        <th className="px-3 py-2 text-left whitespace-nowrap text-sm">Sr. No</th>
                        <th className="px-3 py-2 text-left whitespace-nowrap text-sm">Actions</th>
                        {selectedFields.map(f => (
                          <th key={f} className='px-3 py-2 text-left whitespace-nowrap text-sm'>
                            {formatLabel(fieldMap[f] || f)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {listRows.map((r, i) => (
                        <tr key={i} className="hover:bg-white/3 text-sm">
                          <td className="px-3 py-2 align-top whitespace-nowrap">{i + 1}</td>
                          <td className="px-3 py-2 flex gap-2 align-top whitespace-nowrap">
                            <button onClick={() => fetchGetRow(r)} className="btn text-xs">Get</button>
                            <button
                              onClick={() => handleUpdateFromList(r)}
                              disabled={getLoading}
                              className="btn text-xs"
                            >
                              {getLoading ? "Loading..." : "Update"}
                            </button>

                          </td>
                          {selectedFields.map(f => (
                            <td key={f} className='px-3 py-2 align-top whitespace-nowrap'>
                              {renderListCellValue(r[f], f) || '-'}
                            </td>
                          ))}
                        </tr>
                      )
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-2 mt-2">
                  <button onClick={fetchGetAll} className="btn" disabled={getLoading}>
                    {getLoading ? "Fetching..." : "Get All"}
                  </button>
                </div>
              </>
            )}


          </div>

          {/* ---- Get Glass ---- */}
          {/* ... (Get Glass component remains unchanged) ... */}
          <div className="glass p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Get Records ({getRows.length})</h3>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setHorizontalView(true)}
                  className={`px-3 py-1 rounded text-sm ${horizontalView ? "btn" : "bg-white/10 hover:bg-white/20"}`}
                >
                  Horizontal
                </button>
                <button
                  onClick={() => setHorizontalView(false)}
                  className={`px-3 py-1 rounded text-sm ${!horizontalView ? "btn" : "bg-white/10 hover:bg-white/20"}`}
                >
                  Vertical
                </button>
              </div>
            </div>

            {getRows.length === 0 ? (
              <p className="text-white/50">Use the Filter/Search section to fetch records first.</p>
            ) : horizontalView ? (
              // Horizontal View (Table structure)
              <>
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
                        {getRows.length > 0 && Object.keys(getRows[0]).map((k) => (
                          <th key={k} className="px-3 py-2 text-left whitespace-nowrap text-sm">
                            {formatLabel(fieldMap[k] || k)}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-left whitespace-nowrap text-sm">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getRows.map((r, i) => (
                        <tr key={r.ID || i} className="hover:bg-white/3">
                          <td className="px-3 py-2 align-top whitespace-nowrap">{i + 1}</td>
                          {getRows.length > 0 && Object.keys(getRows[0]).map((k) => (
                            <td key={k} className="px-3 py-2 align-top whitespace-nowrap text-sm">
                              {renderGetCellValue(r[k], k)}
                            </td>
                          ))}
                          <td className="px-3 py-2 align-top whitespace-nowrap">
                            <button
                              onClick={() => handleUpdateFromList(r)}
                              disabled={getLoading}
                              className="btn text-xs"
                            >
                              {getLoading ? "Loading..." : "Update"}
                            </button>

                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              // Vertical View (Expandable Cards)
              <div className="grid gap-3">
                {getRows.map((r, i) => (
                  <ExpandableCard
                    key={r.ID || i}
                    header={
                      <div className="text-sm text-white/70">
                        {i + 1} — ID: <span className='font-bold'>{r.ID || ""}</span>
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
                            <div className="text-sm break-words">
                              {renderGetCellValue(v, k)}
                            </div>
                          </div>
                        ))}
                    </div>
                    {/* UPDATE BUTTON IN VERTICAL VIEW */}
                    <button
                      onClick={() => handleUpdateFromList(r)}
                      disabled={getLoading}
                      className="btn text-xs"
                    >
                      {getLoading ? "Loading..." : "Update"}
                    </button>

                  </ExpandableCard>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2 flex-col md:flex-row">

              <button onClick={() => downloadCSV(getRows, "get.csv")} className="btn">
                ⤓ CSV
              </button>

              {/* NEW BUTTON: Send All to Update */}
              <button
                onClick={sendAllToUpdate}
                className="btn"
                disabled={getRows.length === 0}
              >
                Send All to Update
              </button>
            </div>
          </div>


          {/* ---- Update Glass ---- */}
          <div className="glass p-6 w-full mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Records to Update ({cards.length})</h3>
            </div>

            {/* Cards */}
            <div className="grid gap-3">
              {cards.length === 0 ? (
                <div className="text-white/50 italic">No records loaded. Add records from the Get Records section.</div>
              ) : (
                cards.map((card) => {
                  const record = getRows.find(
                    (r) => String(r.ID) === String(card.recordId)
                  );

                  return (
                    <div key={card.cardId} className="p-3 rounded bg-white/5 border border-white/10 shadow-lg">
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
                        <div>
                          <strong>ID: {card.recordId}</strong>{" "}
                          {card.recordLabel ? `— ${card.recordLabel}` : ""}
                        </div>
                        <div className="text-sm text-white/50">
                          Fields: {card.fields.length}
                        </div>
                      </div>

                      {/* New Header Row for Desktop View */}
                      <div className="hidden md:grid md:grid-cols-12 gap-2 mb-2 text-xs text-white/50 font-medium pb-1">
                        {/* 🔥 Width matched: 3-4-4-1 🔥 */}
                        <div className="col-span-3">Field</div>
                        <div className="col-span-4">Current Value</div>
                        <div className="col-span-4">New Value</div>
                        <div className="col-span-1 text-center">Actions</div>
                      </div>


                      {/* field rows */}
                      <div className="grid gap-3">
                        {(card.fields || []).map((f) => (
                          <div
                            key={f.rowId}
                            className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start md:items-center text-sm border-b border-white/5 pb-3 last:border-b-0 last:pb-0"
                          >
                            {/* The main input area: Full width on mobile, 11/12 on tablet/desktop */}
                            <div className="w-full md:col-span-11 grid grid-cols-1 md:grid-cols-12 gap-2 text-xs text-white/50 mb-1">
                              {/* 1. FIELD PICKER (3/12) */}
                              <div className="col-span-12 md:col-span-4">
                                <div className="text-xs text-white/50 mb-1 md:hidden">Field</div> {/* Mobile Label */}
                                <FieldSelectWithSearch
                                  cardId={card.cardId}
                                  rowId={f.rowId}
                                  allFields={allFields}
                                  currentCode={f.code}
                                  setFieldRowCode={setFieldRowCode}
                                />
                              </div>

                              {/* 2. OLD VALUE (4/12) */}
                              <div className="col-span-12 md:col-span-4">
                                <div className="text-xs text-white/50 mb-1 md:hidden">Current Value</div> {/* Mobile Label */}
                                <div className="w-full">
                                  {(() => {
                                    const rawOld = record ? record[f.code] : f.oldValue;
                                    // Prefer enum labels when possible
                                    const oldLabel = (enumsListMap && enumsListMap[f.code])
                                      ? getEnumLabel({ enumerations: enumsListMap[f.code], isMultiple: f.isMultiple }, rawOld)
                                      : getOldValueForRecord(record, f.code);

                                    const display = (oldLabel && String(oldLabel).trim() !== "") ? oldLabel : "";

                                    // compute rows for textarea: min 1, up to 8
                                    const len = String(display || "").length;
                                    const rows = Math.min(8, Math.max(1, Math.ceil(len / 60)));

                                    return (
                                      display
                                        ? <textarea readOnly rows={rows} className="p-2 rounded bg-white/10 w-full text-white/70 text-sm resize-y" value={display} />
                                        : <div className="p-2 rounded bg-white/10 w-full text-white/70 text-sm"><span className="text-white/40 italic">Old Value</span></div>
                                    );
                                  })()}
                                </div>
                              </div>


                              {/* 3. NEW VALUE PICKER (4/12) */}
                              <div className="col-span-12 md:col-span-4 flex gap-2 items-center">
                                <div className="text-xs text-white/50 mb-1 md:hidden">New Value</div> {/* Mobile Label */}

                                {f.code ? (
                                  <DynamicNewValueInput
                                    fieldCode={f.code}
                                    currentValue={f.newValue}
                                    onChange={(val) => setFieldRowNewValue(card.cardId, f.rowId, val)}
                                    isMultiple={f.isMultiple}
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    disabled={true}
                                    value=""
                                    placeholder="Select Field First"
                                    className="p-2 rounded bg-white/10 w-full text-white/50 border border-white/10 italic"
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
                disabled={updateLoading || cards.length === 0}
              >
                {updateLoading ? "Updating..." : "Update All"}
              </button>
            </div>
          </div>

          {/* ---- Update Summary Glass ---- */}
          {/* ... (Summary Glass component remains unchanged) ... */}
          <div className="glass p-6 w-full mx-auto">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h4 className="font-semibold">Update Summary ({summary.length})</h4>
              {/* Clear Summary Button */}
              <div className="flex flex-col sm:flex-row gap-2 w-auto">
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

              {summary.length === 0 ? <div className="text-white/50 italic">No updates yet</div> : (
                <div className="grid gap-2 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-500 scrollbar-track-gray-300/10">
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

          {/* Field Select Modal (Copied from list.js) */}
          {showFieldModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">

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
      </Layout>
    </>
  );
}