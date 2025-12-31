import { useState, useEffect, useContext, useRef } from "react";
import Layout from "../components/Layout";
import { WebhookContext } from "../context/WebhookContext";

export default function FieldsPage() {
    const { webhook } = useContext(WebhookContext);

    const [base, setBase] = useState("");
    const [entity, setEntity] = useState("lead");

    const [fields, setFields] = useState([]);
    const [duplicates, setDuplicates] = useState([]);
    const [loading, setLoading] = useState(false);

    const duplicatesRef = useRef(null);

    // DELETE STATES
    const [selectedIds, setSelectedIds] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [pendingDeleteIds, setPendingDeleteIds] = useState([]);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");

    // Load webhook
    useEffect(() => {
        if (webhook) setBase(webhook);
        else {
            const saved = localStorage.getItem("webhook");
            if (saved) setBase(saved);
        }
    }, [webhook]);

    // --------------------------------------
    // FETCH FIELDS
    // --------------------------------------
    const fetchFields = async () => {
        if (!base) return alert("Please enter webhook URL");

        setLoading(true);
        setFields([]);
        setDuplicates([]);

        try {
            const res = await fetch(
                `http://127.0.0.1:8000/fields/${entity}?base=${encodeURIComponent(base)}`
            );
            const data = await res.json();

            let rows = [];

            Object.keys(data.code_to_label || {}).forEach((code) => {
                rows.push({
                    code,
                    label: data.code_to_label[code] || "",
                    type: data.code_to_type[code] || "",
                    id: data.code_to_id?.[code] || ""
                });
            });

            setFields(rows);
        } catch (err) {
            console.error(err);
            alert("Error fetching fields");
        }

        setLoading(false);
    };

    // --------------------------------------
    // DOWNLOAD CSV
    // --------------------------------------
    const downloadCSV = (items, fileName) => {
        if (!items.length) return alert("Nothing to export");

        const headers = ["Label", "Field Code", "Title", "Type", "ID"];
        const csvRows = [];
        csvRows.push(headers.join(","));

        items.forEach((f) => {
            csvRows.push(
                [
                    `"${f.label}"`,
                    `"${f.code}"`,
                    `"${f.label}"`,
                    `"${f.type}"`,
                    `"${f.id}"`
                ].join(",")
            );
        });

        const blob = new Blob([csvRows.join("\n")], {
            type: "text/csv;charset=utf-8",
        });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
    };

    // --------------------------------------
    // FIND DUPLICATES
    // --------------------------------------
    const findDuplicates = async () => {
        if (!base) return alert("Please enter webhook URL");

        setLoading(true);

        try {
            const res = await fetch(
                `http://127.0.0.1:8000/fields/${entity}/duplicates?base=${encodeURIComponent(base)}`
            );
            const data = await res.json();

            let dups = [];

            Object.keys(data.duplicates || {}).forEach((label) => {
                data.duplicates[label].forEach((f) => {
                    dups.push({
                        label,
                        code: f.code,
                        type: f.type,
                        id: f.id || "",
                        list: f.list || []
                    });
                });
            });

            setDuplicates(dups);
        } catch (err) {
            console.error(err);
            alert("Could not get duplicates");
        }

        setLoading(false);
    };

    // --------------------------------------
    // DELETE FUNCTION
    // --------------------------------------
    const handleDelete = async (ids) => {
        try {
            await fetch("http://127.0.0.1:8000/delete-fields", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ base, ids }),
            });

            alert("Deleted!");

            findDuplicates();
            setSelectedIds([]);

        } catch (err) {
            console.error(err);
            alert("Delete failed");
        }
    };

    return (
        <Layout>
            <div className="p-6 max-w-6xl mx-auto">

                <h1 className="text-2xl font-bold mb-4">Fields & Duplicate Manager</h1>

                {/* ENTITY + WEBHOOK */}
                <div className="glass p-4 mb-6">
                    <div className="flex gap-2 mb-3">
                        <button
                            onClick={() => setEntity("lead")}
                            className={`px-4 py-2 rounded ${entity === "lead" ? "btn" : "bg-white/10"}`}
                        >
                            Lead
                        </button>
                        <button
                            onClick={() => setEntity("deal")}
                            className={`px-4 py-2 rounded ${entity === "deal" ? "btn" : "bg-white/10"}`}
                        >
                            Deal
                        </button>
                    </div>

                    <input
                        value={base}
                        onChange={(e) => setBase(e.target.value)}
                        placeholder="Webhook URL"
                        className="p-2 rounded bg-white/5 w-full mb-3"
                    />

                    <button onClick={fetchFields} className="btn">
                        {loading ? "Loading..." : "Fetch Fields"}
                    </button>
                </div>

                {/* FIELDS TABLE */}
                {fields.length > 0 && (
                    <div className="glass p-4 mb-6">

                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-xl font-semibold">All Fields ({fields.length})</h2>

                            <button
                                onClick={() => downloadCSV(fields, `all_fields_${entity}.csv`)}
                                className="btn"
                            >
                                Download CSV
                            </button>
                            <button
                                onClick={() => duplicatesRef.current?.scrollIntoView({ behavior: "smooth" })}
                                className="btn"
                            >
                                Go to Duplicates
                            </button>
                        </div>

                        <table className="w-full text-sm table-fixed">
                            <thead className="sticky top-0 bg-black/30 backdrop-blur">
                                <tr className="bg-white/10">
                                    <th className="p-2 w-1/4">Label</th>
                                    <th className="p-2 w-1/4">Field Code</th>
                                    <th className="p-2 w-1/6">Type</th>
                                    <th className="p-2 w-12">ID</th>
                                </tr>
                            </thead>

                            <tbody>
                                {fields.map((f) => (
                                    <tr key={f.code} className="border-b border-white/10">
                                        <td className="p-2 break-words">{f.label}</td>
                                        <td className="p-2 break-words">{f.code}</td>
                                        <td className="p-2 break-words">{f.type}</td>
                                        <td className="p-2">{f.id}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* DUPLICATES TABLE */}
                <div className="glass p-4" ref={duplicatesRef}>

                    {/* FIND DUPLICATES button */}
                    {fields.length > 0 && (
                        <button onClick={findDuplicates} className="btn mb-6">
                            Find Duplicate Fields
                        </button>
                    )}

                    {/* MULTIPLE DELETE BUTTON */}
                    {selectedIds.length > 0 && (
                        <button
                            className="btn bg-red-600 mb-4"
                            onClick={() => {
                                setPendingDeleteIds(selectedIds);
                                setShowModal(true);
                            }}
                        >
                            Delete Selected ({selectedIds.length})
                        </button>
                    )}

                    {duplicates.length > 0 ? (
                        <>
                            <div className="flex justify-between items-center mb-3">
                                <h2 className="text-xl font-semibold">
                                    Duplicate Fields ({duplicates.length})
                                </h2>

                                <button
                                    className="btn"
                                    onClick={() => downloadCSV(duplicates, `duplicates_${entity}.csv`)}
                                >
                                    Download Duplicates CSV
                                </button>
                            </div>

                            <table className="w-full text-sm table-fixed">
                                <thead className="sticky top-0 bg-black/30 backdrop-blur">
                                    <tr className="bg-white/10">
                                        <th className="p-2 w-12">Select</th>
                                        <th className="p-2 w-20">Action</th>
                                        <th className="p-2 w-1/4">Label</th>
                                        <th className="p-2 w-1/6">Field Code</th>
                                        <th className="p-2 w-1/6">Type</th>
                                        <th className="p-2 w-1/4">Enum Values</th>
                                        <th className="p-2 w-12">ID</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {duplicates.map((f, i) => (
                                        <tr key={i} className="border-b border-white/10">

                                            {/* Checkbox */}
                                            <td className="p-2">
                                                {f.id ? (
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.includes(f.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedIds([...selectedIds, f.id]);
                                                            } else {
                                                                setSelectedIds(
                                                                    selectedIds.filter(x => x !== f.id)
                                                                );
                                                            }
                                                        }}
                                                    />
                                                ) : null}
                                            </td>

                                            {/* Delete single */}
                                            <td className="p-2">
                                                {f.id && (
                                                    <button
                                                        className="bg-red-600 px-3 py-1 rounded"
                                                        onClick={() => {
                                                            setPendingDeleteIds([f.id]);
                                                            setShowModal(true);
                                                        }}
                                                    >
                                                        Delete
                                                    </button>
                                                )}
                                            </td>

                                            <td className="p-2 break-words">{f.label}</td>
                                            <td className="p-2 break-words">{f.code}</td>
                                            <td className="p-2 break-words">{f.type}</td>

                                            <td className="p-2 whitespace-pre-line break-words">
                                                {f.type === "enumeration"
                                                    ? (f.list || []).map(v =>
                                                        v.VALUE || v.value || ""
                                                    ).join("\n")
                                                    : "-"}
                                            </td>

                                            <td className="p-2">{f.id || ""}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Delete Selected under table */}
                            {selectedIds.length > 0 && (
                                <div className="mt-4">
                                    <button
                                        className="btn bg-red-600"
                                        onClick={() => {
                                            setPendingDeleteIds(selectedIds);
                                            setShowModal(true);
                                        }}
                                    >
                                        Delete Selected ({selectedIds.length})
                                    </button>
                                </div>
                            )}

                        </>
                    ) : (
                        <p className="text-sm text-gray-400">No duplicates yet</p>
                    )}
                </div>

                {/* DELETE MODAL */}
                {showModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">

                        <div
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => {
                                setShowModal(false);
                                setDeleteConfirmText("");
                                setPendingDeleteIds([]);
                            }}
                        />

                        <div className="relative bg-white/10 backdrop-blur-lg border border-white/20 
                            shadow-2xl rounded-2xl p-6 w-full max-w-lg">

                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-semibold text-lg">Delete Confirmation</h3>
                                <button
                                    onClick={() => {
                                        setShowModal(false);
                                        setDeleteConfirmText("");
                                        setPendingDeleteIds([]);
                                    }}
                                    className="text-white text-xl hover:opacity-70"
                                >
                                    &times;
                                </button>
                            </div>

                            <p className="mb-3 text-sm text-yellow-300">
                                ⚠️ This action is permanent!
                                <br /> You are about to delete{" "}
                                <strong>{pendingDeleteIds.length}</strong> field(s).
                            </p>

                            <p className="mb-3 text-sm text-red-300">
                                Type <i>deletefield</i> to confirm.
                            </p>

                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="Type: deletefield"
                                className="w-full p-2 rounded bg-white/5 border border-white/20 mb-4"
                            />

                            <div className="flex gap-3">
                                <button
                                    disabled={deleteConfirmText !== "deletefield"}
                                    className={`btn flex-1 ${
                                        deleteConfirmText !== "deletefield"
                                            ? "opacity-40 cursor-not-allowed"
                                            : ""
                                    }`}
                                    onClick={() => {
                                        handleDelete(pendingDeleteIds);
                                        setShowModal(false);
                                        setDeleteConfirmText("");
                                        setPendingDeleteIds([]);
                                        setSelectedIds([]);
                                    }}
                                >
                                    Confirm Delete
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
