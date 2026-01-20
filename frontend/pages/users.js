import React, { useState, useEffect, useContext } from "react";
import Layout from "../components/Layout";
import { WebhookContext } from "../context/WebhookContext";
import { buildUrl as apiBuildUrl } from "../lib/api";

export default function UsersPage() {
    const { webhook } = useContext(WebhookContext);
    const [base, setBase] = useState("");
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [viewMode, setViewMode] = useState("card"); // default card view
    const [filter, setFilter] = useState("active"); // all or active
    const [counts, setCounts] = useState({ all: 0, active: 0 });


    // Load webhook
    useEffect(() => {
        if (webhook) setBase(webhook);
        else {
            const saved = localStorage.getItem("webhook");
            if (saved) setBase(saved);
        }
    }, [webhook]);

    // Fetch users from backend

    const [hasFetched, setHasFetched] = useState(false);

    const fetchUsers = async (query, activeOnly = false) => {
        if (!base) return;
        setLoading(true);

        try {
            const url = apiBuildUrl("/users/search", { base, search: query || undefined, active: activeOnly });
            console.log("Fetching users from:", url);
            fetch(url)
                .then(res => res.json())
                .then(console.log)
                .catch(console.error);
            const res = await fetch(url);
            const json = await res.json();

            if (json.success) {
                let results = json.result || [];
                if (query) {
                    const q = query.toLowerCase();
                    results = results.filter(u => {
                        const fullName = `${u.name || ""} ${u.last_name || ""}`.toLowerCase();
                        return fullName.includes(q);
                    });
                }
                setUsers(results);
                // Update counts
                const activeCount = results.filter(u => u.active).length;
                setCounts({ all: results.length, active: activeCount });
            } else {
                setUsers([]);
            }
        } catch (err) {
            console.error(err);
            setUsers([]);
        }
        setLoading(false);
    };


    // Debounced search
    const [filteredUsers, setFilteredUsers] = useState([]);
    useEffect(() => {
        const timeout = setTimeout(() => {
            let results = [...users];
            // Filter active/all
            if (filter === "active") results = results.filter(u => u.active);
            // Search by name / last_name
            if (search) {
                const q = search.toLowerCase();
                results = results.filter(u => `${u.name || ""} ${u.last_name || ""}`.toLowerCase().includes(q));
            }
            setFilteredUsers(results);
        }, 300);
        return () => clearTimeout(timeout);
    }, [users, search, filter]);


    // CSV download
    const downloadCSV = (items, fileName) => {
        if (!items.length) return alert("No users to export");

        const headers = ["ID", "Name", "Last Name", "Email", "Mobile", "Work Phone", "Department", "Active", "Gender"];
        const csvRows = [headers.join(",")];

        items.forEach(u => {
            csvRows.push([
                u.id,
                `"${u.name}"`,
                `"${u.last_name}"`,
                `"${u.email || ""}"`,
                `"${u.mobile || ""}"`,
                `"${u.work_phone || ""}"`,
                `"${(u.department || []).join("; ")}"`,
                u.active ? "Yes" : "No",
                u.gender || ""
            ].join(","));
        });

        const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
    };

    return (
        <Layout>
            <div className="p-6 max-w-6xl mx-auto space-y-6">
                <h1 className="text-2xl font-bold mb-2">Users Manager</h1>

                {/* Top Glass: Base + Fetch */}
                <div className="glass p-4 flex flex-col gap-4 items-start">
                    <div className="flex flex-col md:flex-row gap-3 flex-1 w-full">
                        <input
                            value={base}
                            onChange={e => setBase(e.target.value)}
                            placeholder="Webhook URL / Token"
                            className="p-2 rounded bg-white/5 border border-white/20 flex-1 w-full"
                        />
                        <button
                            onClick={() => {
                                fetchUsers(search);
                                setHasFetched(true); // mark that we have fetched at least once
                            }}
                            className="btn w-full sm:w-auto"
                        >
                            {loading ? "Loading..." : "Fetch Users"}
                        </button>
                    </div>

                </div>


                {/* Main Glass: Search, CSV, View Toggle + Users */}
                <div className="glass p-4 flex flex-col gap-4">
                    {/* Top Row: Search + Download (left), View Toggle (right) */}
                    {users.length > 0 && (
                        <>
                            {/* Top Row: Search + Download CSV + View Toggle */}
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                <div className="flex flex-col md:flex-row gap-3 items-start md:items-center flex-1 w-full">
                                    <input
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        placeholder="Search by Name"
                                        className="p-2 rounded bg-white/5 border border-white/20 min-w-[200px] w-full md:w-1/3"
                                    />
                                    <button
                                        onClick={() => downloadCSV(users, "users.csv")}
                                        className="btn w-full sm:w-auto"
                                    >
                                        ⤓ CSV
                                    </button>
                                </div>

                                {/* View Toggle */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setViewMode("card")}
                                        className={viewMode === "card" ? "btn" : "glass px-4 py-1 text-white/70 hover:text-white transition"}
                                    >
                                        Card
                                    </button>
                                    <button
                                        onClick={() => setViewMode("table")}
                                        className={viewMode === "table" ? "btn" : "glass px-4 py-1 text-white/70 hover:text-white transition"}
                                    >
                                        Table
                                    </button>
                                </div>
                            </div>

                            {/* Filter Buttons */}
                            {filteredUsers.length > 0 && (
                                <div className="flex flex-row gap-3 items-start">
                                    <button
                                        className={`px-4 py-2 rounded transition ${filter === "active" ? "btn" : "glass text-white/70 hover:text-white"}`}
                                        onClick={() => setFilter("active")}
                                    >
                                        Active Users ({counts.active})
                                    </button>
                                    <button
                                        className={`px-4 py-2 rounded transition ${filter === "all" ? "btn" : "glass text-white/70 hover:text-white"}`}
                                        onClick={() => setFilter("all")}
                                    >
                                        All Users ({counts.all})
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {/* No users found */}
                    {filteredUsers.length === 0 && !loading && (
                        <p className="text-sm text-gray-400">No users found</p>
                    )}

                    {/* Users Display */}
                    {filteredUsers.length > 0 && viewMode === "table" && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm table-auto border-collapse border border-white/10">
                                <thead className="sticky top-0 bg-black/30 backdrop-blur">
                                    <tr className="bg-white/10">
                                        <th className="p-2 w-24">Photo</th>
                                        <th className="p-2 w-36">Name</th>
                                        <th className="p-2 w-36">Last Name</th>
                                        <th className="p-2 w-12">ID</th>
                                        <th className="p-2 w-40">Email</th>
                                        <th className="p-2 w-28">Mobile</th>
                                        <th className="p-2 w-28">Work Phone</th>
                                        <th className="p-2 w-36">Department</th>
                                        <th className="p-2 w-16">Active</th>
                                        <th className="p-2 w-16">Gender</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map(u => (
                                        <tr key={u.id} className="border-b border-white/10">
                                            <td className="p-2">{u.photo ? <img src={u.photo} alt={u.name} className="w-10 h-10 rounded-full" /> : ""}</td>
                                            <td className="p-2">{u.name}</td>
                                            <td className="p-2">{u.last_name}</td>
                                            <td className="p-2">{u.id}</td>
                                            <td className="p-2">{u.email || "-"}</td>
                                            <td className="p-2">{u.mobile || "-"}</td>
                                            <td className="p-2">{u.work_phone || "-"}</td>
                                            <td className="p-2">{(u.department || []).join(", ") || "-"}</td>
                                            <td className="p-2">{u.active ? "Yes" : "No"}</td>
                                            <td className="p-2">{u.gender === "M" ? "Male" : u.gender === "F" ? "Female" : "-"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {filteredUsers.length > 0 && viewMode === "card" && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filteredUsers.map(u => (
                                <div key={u.id} className="glass p-4 flex flex-col rounded-lg shadow-md hover:scale-105 transition-transform duration-200">
                                    <div className="flex flex-row mb-4">
                                        <div className="w-1/3">
                                        {u.photo ? (
                                            <img src={u.photo} alt={u.name} className="w-16 h-16 md:w-20 md:h-20 rounded-full mb-2" />
                                        ) : (
                                            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gray-700 mb-2 flex items-center justify-center text-gray-400"></div>
                                        )}
                                        </div>
                                        <div className="w-2/3">
                                            <h2 className="font-bold text-lg text-white mb-2">{u.name} {u.last_name}</h2>
                                            {/* Chips */}
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                <div className="px-3 py-1 rounded-full text-sm bg-white/10 border border-white text-white">ID: {u.id}</div>
                                                <div className={`px-3 py-1 rounded-full text-sm ${u.active ? "bg-green-400/10 border border-green-400 text-green-400" : "bg-red-400/10 border border-red-400 text-red-400"}`}>{u.active ? "Active" : "Inactive"}</div>
                                                {u.gender && (
                                                    <div
                                                        className={`px-3 py-1 rounded-full text-sm ${u.gender === "M"
                                                            ? "bg-blue-400/10 border border-blue-400 text-blue-400"
                                                            : u.gender === "F"
                                                                ? "bg-pink-400/10 border border-pink-400 text-pink-400"
                                                                : ""
                                                            }`}
                                                    >
                                                        {u.gender === "M" ? "Male" : u.gender === "F" ? "Female" : ""}
                                                    </div>
                                                )}

                                            </div>
                                            <div className="flex flex-col gap-1 text-gray-300 text-sm">
                                                {u.email && <div className="flex items-center gap-2">{u.email}</div>}
                                                {u.mobile && <div className="flex items-center gap-2">{u.mobile}</div>}
                                                {u.work_phone && <div className="flex items-center gap-2">{u.work_phone}</div>}
                                                {(u.department || []).length > 0 && <div className="flex items-center gap-2">{u.department.join(", ")}</div>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
}
