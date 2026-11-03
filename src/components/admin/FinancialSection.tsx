import { useState } from "react";
import {
    PhilippinePeso,
    Download,
    AlertCircle,
    CheckCircle,
    Clock,
    Eye,
    FileCheck,
    X,
    Printer,
} from "lucide-react";
import { TUITION_GRADE_GROUPS, DEFAULT_TUITION_FEES } from "../../lib/tuition";

// Financial Section
export function FinancialSection({
    schoolYear,
    tuitionFees = DEFAULT_TUITION_FEES,
}: {
    schoolYear: string;
    tuitionFees?: Record<string, number>;
}) {
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportType, setReportType] = useState("collection-summary");
    const [dateRange, setDateRange] = useState("current-year");
    const [customStartDate, setCustomStartDate] = useState("");
    const [customEndDate, setCustomEndDate] = useState("");
    const [reportFormat, setReportFormat] = useState("pdf");
    const [showReportPreview, setShowReportPreview] = useState(false);

    const totalRevenue = schoolYear === "2025-2026" ? 45780000 : 43250000;
    const pendingPayments = schoolYear === "2025-2026" ? 3200000 : 3000000;

    const reportTypes = [
        {
            value: "collection-summary",
            label: "Collection Summary Report",
            description: "Overall payment collection summary",
        },
        {
            value: "outstanding-payments",
            label: "Outstanding Payments Report",
            description: "List of pending and overdue payments",
        },
        {
            value: "payment-history",
            label: "Payment History Report",
            description: "Detailed payment transaction history",
        },
    ];

    const handleGenerateReport = () => {
        setShowReportPreview(true);
    };

    const handleDownloadReport = () => {
        // Simulate download
        alert(
            `Downloading ${reportTypes.find((r) => r.value === reportType)?.label} as ${reportFormat.toUpperCase()}...`,
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-2">
                        Financial Overview
                    </h1>
                    <p className="text-[#6b6456]">
                        Track tuition payments and school finances
                    </p>
                </div>
                <button
                    onClick={() => setShowReportModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1a2b4a] text-white rounded-lg hover:bg-[#2d4263] transition-colors"
                >
                    <FileCheck className="w-4 h-4" />
                    Generate Report
                </button>
            </div>

            {/* Tuition Fees by Grade Level — read-only here; edited in System Settings */}
            <div className="bg-white rounded-xl shadow-sm border-2 border-[#c9a961]/40 p-6">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#c9a961]/10 rounded-xl flex items-center justify-center">
                            <PhilippinePeso className="w-5 h-5 text-[#c9a961]" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-[#1a2b4a]">
                                Tuition Fees by Grade Level
                            </h3>
                            <p className="text-sm text-[#6b6456]">
                                Automatically applied to each student's account
                                in the Cashier portal based on grade level
                            </p>
                        </div>
                    </div>
                    <span className="text-xs font-medium text-[#8b8476]">
                        Edit these in System Settings → Tuition Management
                    </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {TUITION_GRADE_GROUPS.map((group) => (
                        <div
                            key={group.label}
                            className="border border-gray-200 rounded-lg overflow-hidden"
                        >
                            <div className="bg-[#faf8f5] px-3 py-2 border-b border-gray-200">
                                <p className="text-xs font-semibold text-[#1a2b4a] uppercase tracking-wide">
                                    {group.label}
                                </p>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {group.grades.map((g) => (
                                    <div
                                        key={g}
                                        className="px-3 py-2 flex items-center justify-between text-sm"
                                    >
                                        <span className="text-[#6b6456]">
                                            {g}
                                        </span>
                                        <span className="font-semibold text-[#2c2c2c]">
                                            ₱
                                            {(
                                                tuitionFees[g] ?? 0
                                            ).toLocaleString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <PhilippinePeso className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-[#2c2c2c]">
                                ₱{totalRevenue.toLocaleString()}
                            </p>
                            <p className="text-xs text-[#8b8476]">
                                Total Collected
                            </p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                            <Clock className="w-5 h-5 text-yellow-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-[#2c2c2c]">
                                ₱{pendingPayments.toLocaleString()}
                            </p>
                            <p className="text-xs text-[#8b8476]">
                                Pending Payments
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">
                    Payment Status Distribution
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                        <p className="text-sm text-green-800 mb-1">
                            Fully Paid
                        </p>
                        <p className="text-2xl font-bold text-green-900">
                            892 students
                        </p>
                    </div>
                    <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p className="text-sm text-yellow-800 mb-1">
                            Partial Payment
                        </p>
                        <p className="text-2xl font-bold text-yellow-900">
                            243 students
                        </p>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                        <p className="text-sm text-red-800 mb-1">Overdue</p>
                        <p className="text-2xl font-bold text-red-900">
                            112 students
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Transactions */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                        <h3 className="font-semibold text-[#1a2b4a]">
                            Recent Transactions
                        </h3>
                        <span className="text-xs text-[#8b8476]">Latest 5</span>
                    </div>
                    <div className="divide-y divide-gray-200">
                        {[
                            {
                                name: "Maria Santos",
                                grade: "Grade 5",
                                amount: 14000,
                                method: "GCash",
                                date: "Today, 9:14 AM",
                            },
                            {
                                name: "John Carlo Rivera",
                                grade: "Grade 4",
                                amount: 25000,
                                method: "Bank Transfer",
                                date: "Today, 8:02 AM",
                            },
                            {
                                name: "Sarah Mae Lopez",
                                grade: "Grade 6",
                                amount: 7000,
                                method: "Cash",
                                date: "Yesterday, 3:47 PM",
                            },
                            {
                                name: "Patricia Dela Cruz",
                                grade: "Grade 3",
                                amount: 14000,
                                method: "GCash",
                                date: "Yesterday, 1:12 PM",
                            },
                            {
                                name: "Jose Miguel Abad",
                                grade: "Grade 6",
                                amount: 20000,
                                method: "Cash",
                                date: "Mar 5, 2026",
                            },
                        ].map((t, i) => (
                            <div
                                key={i}
                                className="px-6 py-3 flex items-center justify-between"
                            >
                                <div>
                                    <p className="text-sm font-medium text-[#2c2c2c]">
                                        {t.name}
                                    </p>
                                    <p className="text-xs text-[#8b8476]">
                                        {t.grade} • {t.method} • {t.date}
                                    </p>
                                </div>
                                <span className="text-sm font-semibold text-green-700">
                                    +₱{t.amount.toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Overdue Accounts */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                        <h3 className="font-semibold text-[#1a2b4a]">
                            Overdue Accounts
                        </h3>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                            <AlertCircle className="w-3.5 h-3.5" /> Needs
                            follow-up
                        </span>
                    </div>
                    <div className="divide-y divide-gray-200">
                        {[
                            {
                                name: "Carlo Bautista",
                                grade: "Grade 2",
                                balance: 42000,
                                daysOverdue: 34,
                            },
                            {
                                name: "Anna Gabrielle Torres",
                                grade: "Grade 4",
                                balance: 18500,
                                daysOverdue: 21,
                            },
                            {
                                name: "Marco Villanueva",
                                grade: "Grade 1",
                                balance: 63000,
                                daysOverdue: 45,
                            },
                            {
                                name: "Diana Reyes",
                                grade: "Grade 5",
                                balance: 9800,
                                daysOverdue: 12,
                            },
                        ].map((t, i) => (
                            <div
                                key={i}
                                className="px-6 py-3 flex items-center justify-between"
                            >
                                <div>
                                    <p className="text-sm font-medium text-[#2c2c2c]">
                                        {t.name}
                                    </p>
                                    <p className="text-xs text-[#8b8476]">
                                        {t.grade} • {t.daysOverdue} days overdue
                                    </p>
                                </div>
                                <span className="text-sm font-semibold text-red-600">
                                    ₱{t.balance.toLocaleString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Expenses Snapshot */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-[#1a2b4a] mb-4">
                    Expense Overview (This Month)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        {
                            label: "Payroll",
                            amount: 2450000,
                            color: "text-[#1a2b4a]",
                        },
                        {
                            label: "Utilities",
                            amount: 185000,
                            color: "text-[#1a2b4a]",
                        },
                        {
                            label: "Supplies & Materials",
                            amount: 96000,
                            color: "text-[#1a2b4a]",
                        },
                        {
                            label: "Maintenance",
                            amount: 62000,
                            color: "text-[#1a2b4a]",
                        },
                    ].map((e) => (
                        <div
                            key={e.label}
                            className="p-4 bg-[#faf8f5] rounded-lg"
                        >
                            <p className="text-xs text-[#8b8476] mb-1">
                                {e.label}
                            </p>
                            <p className={`text-lg font-bold ${e.color}`}>
                                ₱{e.amount.toLocaleString()}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Generate Report Modal */}
            {showReportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="sticky top-0 bg-gradient-to-r from-[#1a2b4a] to-[#7d1935] text-white p-6 rounded-t-2xl">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold">
                                        Generate Financial Report
                                    </h2>
                                    <p className="text-sm text-white/80 mt-1">
                                        Select report parameters and preferences
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowReportModal(false);
                                        setShowReportPreview(false);
                                    }}
                                    className="text-white/80 hover:text-white transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Report Type Selection */}
                            <div>
                                <label className="block text-sm font-semibold text-[#1a2b4a] mb-3">
                                    Report Type
                                </label>
                                <div className="space-y-2">
                                    {reportTypes.map((type) => (
                                        <div
                                            key={type.value}
                                            onClick={() =>
                                                setReportType(type.value)
                                            }
                                            className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                                                reportType === type.value
                                                    ? "border-[#c9a961] bg-[#c9a961]/5"
                                                    : "border-gray-200 hover:border-gray-300"
                                            }`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div
                                                    className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                                                        reportType ===
                                                        type.value
                                                            ? "border-[#c9a961]"
                                                            : "border-gray-300"
                                                    }`}
                                                >
                                                    {reportType ===
                                                        type.value && (
                                                        <div className="w-3 h-3 rounded-full bg-[#c9a961]"></div>
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-semibold text-[#2c2c2c]">
                                                        {type.label}
                                                    </p>
                                                    <p className="text-sm text-[#8b8476] mt-0.5">
                                                        {type.description}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Date Range Selection */}
                            <div>
                                <label className="block text-sm font-semibold text-[#1a2b4a] mb-3">
                                    Date Range
                                </label>
                                <div className="grid grid-cols-2 gap-3 mb-[35px]">
                                    <button
                                        onClick={() =>
                                            setDateRange("current-year")
                                        }
                                        className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                                            dateRange === "current-year"
                                                ? "border-[#c9a961] bg-[#c9a961]/5 text-[#1a2b4a]"
                                                : "border-gray-200 text-[#6b6456] hover:border-gray-300"
                                        }`}
                                    >
                                        Current School Year
                                    </button>
                                    <button
                                        onClick={() =>
                                            setDateRange("last-quarter")
                                        }
                                        className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                                            dateRange === "last-quarter"
                                                ? "border-[#c9a961] bg-[#c9a961]/5 text-[#1a2b4a]"
                                                : "border-gray-200 text-[#6b6456] hover:border-gray-300"
                                        }`}
                                    >
                                        Last Quarter
                                    </button>
                                    <button
                                        onClick={() =>
                                            setDateRange("last-month")
                                        }
                                        className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                                            dateRange === "last-month"
                                                ? "border-[#c9a961] bg-[#c9a961]/5 text-[#1a2b4a]"
                                                : "border-gray-200 text-[#6b6456] hover:border-gray-300"
                                        }`}
                                    >
                                        Last Month
                                    </button>
                                    <button
                                        onClick={() => setDateRange("custom")}
                                        className={`px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                                            dateRange === "custom"
                                                ? "border-[#c9a961] bg-[#c9a961]/5 text-[#1a2b4a]"
                                                : "border-gray-200 text-[#6b6456] hover:border-gray-300"
                                        }`}
                                    >
                                        Custom Range
                                    </button>
                                </div>

                                {dateRange === "custom" && (
                                    <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg">
                                        <div>
                                            <label className="block text-xs font-medium text-[#6b6456] mb-2">
                                                Start Date
                                            </label>
                                            <input
                                                type="date"
                                                value={customStartDate}
                                                onChange={(e) =>
                                                    setCustomStartDate(
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-[#6b6456] mb-2">
                                                End Date
                                            </label>
                                            <input
                                                type="date"
                                                value={customEndDate}
                                                onChange={(e) =>
                                                    setCustomEndDate(
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c9a961]/20"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Report Format */}
                            <div>
                                <label className="block text-sm font-semibold text-[#1a2b4a] mb-3">
                                    Export Format
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setReportFormat("pdf")}
                                        className={`px-4 py-3 rounded-lg border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                                            reportFormat === "pdf"
                                                ? "border-[#c9a961] bg-[#c9a961]/5 text-[#1a2b4a]"
                                                : "border-gray-200 text-[#6b6456] hover:border-gray-300"
                                        }`}
                                    >
                                        <FileCheck className="w-4 h-4" />
                                        PDF Document
                                    </button>
                                    <button
                                        onClick={() => setReportFormat("excel")}
                                        className={`px-4 py-3 rounded-lg border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                                            reportFormat === "excel"
                                                ? "border-[#c9a961] bg-[#c9a961]/5 text-[#1a2b4a]"
                                                : "border-gray-200 text-[#6b6456] hover:border-gray-300"
                                        }`}
                                    >
                                        <Download className="w-4 h-4" />
                                        Excel Spreadsheet
                                    </button>
                                </div>
                            </div>

                            {/* Report Preview (if generated) */}
                            {showReportPreview && (
                                <div className="border-2 border-[#c9a961] rounded-lg p-6 bg-[#c9a961]/5">
                                    <div className="flex items-center gap-3 mb-4">
                                        <CheckCircle className="w-6 h-6 text-green-600" />
                                        <div>
                                            <h3 className="font-semibold text-[#1a2b4a]">
                                                Report Preview
                                            </h3>
                                            <p className="text-sm text-[#6b6456]">
                                                {
                                                    reportTypes.find(
                                                        (r) =>
                                                            r.value ===
                                                            reportType,
                                                    )?.label
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-lg p-4 space-y-3 border border-gray-200">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-[#6b6456]">
                                                Report Type:
                                            </span>
                                            <span className="font-semibold text-[#2c2c2c]">
                                                {
                                                    reportTypes.find(
                                                        (r) =>
                                                            r.value ===
                                                            reportType,
                                                    )?.label
                                                }
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-[#6b6456]">
                                                Date Range:
                                            </span>
                                            <span className="font-semibold text-[#2c2c2c]">
                                                {dateRange === "custom"
                                                    ? `${customStartDate || "N/A"} to ${customEndDate || "N/A"}`
                                                    : dateRange
                                                          .replace("-", " ")
                                                          .split(" ")
                                                          .map(
                                                              (w) =>
                                                                  w
                                                                      .charAt(0)
                                                                      .toUpperCase() +
                                                                  w.slice(1),
                                                          )
                                                          .join(" ")}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-[#6b6456]">
                                                School Year:
                                            </span>
                                            <span className="font-semibold text-[#2c2c2c]">
                                                {schoolYear}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-[#6b6456]">
                                                Format:
                                            </span>
                                            <span className="font-semibold text-[#2c2c2c]">
                                                {reportFormat.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-[#6b6456]">
                                                Generated:
                                            </span>
                                            <span className="font-semibold text-[#2c2c2c]">
                                                {new Date().toLocaleDateString(
                                                    "en-US",
                                                    {
                                                        month: "short",
                                                        day: "numeric",
                                                        year: "numeric",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    },
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 rounded-b-2xl flex items-center justify-end gap-3 border-t border-gray-200">
                            <button
                                onClick={() => {
                                    setShowReportModal(false);
                                    setShowReportPreview(false);
                                }}
                                className="px-6 py-2.5 border border-gray-300 text-[#6b6456] rounded-lg hover:bg-gray-100 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            {!showReportPreview ? (
                                <button
                                    onClick={handleGenerateReport}
                                    className="px-6 py-2.5 bg-[#1a2b4a] text-white rounded-lg hover:bg-[#2d4263] transition-colors font-medium flex items-center gap-2"
                                >
                                    <Eye className="w-4 h-4" />
                                    Preview Report
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() =>
                                            setShowReportPreview(false)
                                        }
                                        className="px-6 py-2.5 border border-gray-300 text-[#6b6456] rounded-lg hover:bg-gray-100 transition-colors font-medium"
                                    >
                                        Edit Parameters
                                    </button>
                                    <button
                                        onClick={handleDownloadReport}
                                        className="px-6 py-2.5 bg-gradient-to-r from-[#7d1935] to-[#9b2847] text-white rounded-lg hover:opacity-90 transition-opacity font-medium flex items-center gap-2"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download {reportFormat.toUpperCase()}
                                    </button>
                                    <button
                                        onClick={() => {
                                            alert("Opening print dialog...");
                                        }}
                                        className="px-6 py-2.5 bg-[#c9a961] text-white rounded-lg hover:bg-[#d4af37] transition-colors font-medium flex items-center gap-2"
                                    >
                                        <Printer className="w-4 h-4" />
                                        Print
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
