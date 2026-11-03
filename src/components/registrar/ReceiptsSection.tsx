import { useState, useEffect } from "react";
import { Search, Filter, AlertCircle } from "lucide-react";
import { supabase } from "../../supabase";

// Receipts Section (Registrar) — a single read-only view into cashier-recorded payments,
// with a category filter (All / Enrollment / Tuition Payment) instead of separate tabs,
// searchable by last name or receipt number.
export function ReceiptsSection({ schoolYear }: { schoolYear: string }) {
    type ReceiptRow = {
        id: string;
        receiptNumber: string;
        amount: number;
        method: string;
        paidAt: string;
        studentName: string;
        grade: string;
        category: string;
    };

    const CATEGORY_FILTERS = [
        { id: "all" as const, label: "All Receipts" },
        { id: "enrollment_fee" as const, label: "Enrollment" },
        { id: "tuition" as const, label: "Tuition Payment" },
    ];

    const [categoryFilter, setCategoryFilter] = useState<
        "all" | "enrollment_fee" | "tuition"
    >("all");
    const [search, setSearch] = useState("");
    const [rows, setRows] = useState<ReceiptRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        (async () => {
            setLoading(true);
            setLoadError(null);
            let query = supabase
                .from("payments")
                .select(
                    "id, receipt_number, amount, method, paid_at, category, students(first_name, last_name, grade_level, section), school_years!inner(label)",
                )
                .eq("school_years.label", schoolYear)
                .order("paid_at", { ascending: false });
            if (categoryFilter !== "all")
                query = query.eq("category", categoryFilter);
            const { data, error } = await query;
            if (!active) return;
            if (error) {
                setLoadError(error.message);
                setLoading(false);
                return;
            }
            setRows(
                (data ?? []).map((r: any) => ({
                    id: r.id,
                    receiptNumber: r.receipt_number || "—",
                    amount: Number(r.amount),
                    method: r.method,
                    paidAt: r.paid_at,
                    studentName: r.students
                        ? `${r.students.last_name}, ${r.students.first_name}`
                        : "Unknown Student",
                    grade: r.students?.section
                        ? `${r.students.grade_level}, ${r.students.section}`
                        : r.students?.grade_level || "",
                    category: r.category,
                })),
            );
            setLoading(false);
        })();
        return () => {
            active = false;
        };
    }, [categoryFilter, schoolYear]);

    const filtered = rows.filter(
        (r) =>
            !search ||
            r.studentName.toLowerCase().includes(search.toLowerCase()) ||
            r.receiptNumber.toLowerCase().includes(search.toLowerCase()),
    );

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">
                    Receipts
                </h1>
                <p className="text-[#6b6456]">
                    Cashier-recorded payments • {schoolYear}
                </p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3 sm:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by last name or receipt number…"
                            className="w-full pl-11 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a4a4a]/20 text-black"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476] pointer-events-none" />
                        <select
                            value={categoryFilter}
                            onChange={(e) =>
                                setCategoryFilter(
                                    e.target.value as typeof categoryFilter,
                                )
                            }
                            className="pl-9 pr-8 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-[#1a2b4a] focus:outline-none focus:ring-2 focus:ring-[#1a4a4a]/20 appearance-none bg-white"
                        >
                            {CATEGORY_FILTERS.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {f.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {loadError && (
                    <div className="flex items-center gap-2 p-4 bg-red-50 border-b border-red-200 text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {loadError}
                    </div>
                )}

                {loading ? (
                    <div className="px-6 py-14 text-center text-sm text-[#8b8476]">
                        Loading receipts…
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="px-6 py-14 text-center text-sm text-[#8b8476]">
                        No receipts found.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200 bg-[#faf8f5]">
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                        Receipt No.
                                    </th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                        Student
                                    </th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                        Grade
                                    </th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                        Type
                                    </th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                        Amount
                                    </th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                        Date
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filtered.map((r) => (
                                    <tr
                                        key={r.id}
                                        className="hover:bg-[#faf8f5] transition-colors"
                                    >
                                        <td className="px-6 py-3 font-mono text-sm text-[#1a2b4a]">
                                            {r.receiptNumber}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-[#2c2c2c]">
                                            {r.studentName}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-[#6b6456]">
                                            {r.grade}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-[#6b6456]">
                                            {r.category === "enrollment_fee"
                                                ? "Enrollment"
                                                : "Tuition Payment"}
                                        </td>
                                        <td className="px-6 py-3 text-sm font-semibold text-[#1a2b4a]">
                                            ₱{r.amount.toLocaleString()}
                                        </td>
                                        <td className="px-6 py-3 text-sm text-[#6b6456]">
                                            {new Date(
                                                r.paidAt,
                                            ).toLocaleDateString("en-US", {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                            })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
