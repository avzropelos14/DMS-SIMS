import { useState } from "react";
import { Search, Trash2, Shield, X } from "lucide-react";

// Manage Accounts modal — lists real login accounts (public.profiles) and lets an
// admin reassign a user's role or revoke their access (deletes their profile row,
// which removes their app role/login without touching the underlying auth user or
// employee record).
export function ManageAccountsModal({
    accounts,
    loading,
    error,
    roleDefs,
    onClose,
    onChangeRole,
    onRevoke,
    onRetry,
    unauthorizedAccounts,
    unauthorizedLoading,
    unauthorizedError,
    onRevokeUnauthorized,
    onRetryUnauthorized,
}: {
    accounts: {
        id: string;
        name: string;
        email: string;
        role: string;
        employeeId: string | null;
        position: string | null;
        department: string | null;
        createdAt: string;
    }[];
    loading: boolean;
    error: string | null;
    roleDefs: { role: string; label: string; access_note: string }[];
    onClose: () => void;
    onChangeRole: (id: string, role: string) => Promise<void>;
    onRevoke: (id: string) => Promise<void>;
    onRetry: () => void;
    unauthorizedAccounts: {
        id: string;
        email: string | null;
        createdAt: string;
        lastSignInAt: string | null;
    }[];
    unauthorizedLoading: boolean;
    unauthorizedError: string | null;
    onRevokeUnauthorized: (id: string) => Promise<void>;
    onRetryUnauthorized: () => void;
}) {
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("All");
    const [savingId, setSavingId] = useState<string | null>(null);
    const [rowError, setRowError] = useState<string | null>(null);
    const [pendingRevoke, setPendingRevoke] = useState<{
        id: string;
        name: string;
    } | null>(null);
    const [revoking, setRevoking] = useState(false);
    const [pendingRevokeUnauthorized, setPendingRevokeUnauthorized] = useState<{
        id: string;
        email: string | null;
    } | null>(null);
    const [revokingUnauthorized, setRevokingUnauthorized] = useState(false);
    const [unauthorizedRowError, setUnauthorizedRowError] = useState<
        string | null
    >(null);

    const labelForRole = (role: string) =>
        roleDefs.find((r) => r.role === role)?.label ?? role;

    const filtered = accounts
        .filter((a) => roleFilter === "All" || a.role === roleFilter)
        .filter(
            (a) =>
                !search ||
                a.name.toLowerCase().includes(search.toLowerCase()) ||
                a.email.toLowerCase().includes(search.toLowerCase()),
        );

    const handleRoleChange = async (id: string, role: string) => {
        setSavingId(id);
        setRowError(null);
        try {
            await onChangeRole(id, role);
        } catch (e: any) {
            setRowError(e?.message || "Failed to update role.");
        } finally {
            setSavingId(null);
        }
    };

    const confirmRevoke = async () => {
        if (!pendingRevoke) return;
        setRevoking(true);
        try {
            await onRevoke(pendingRevoke.id);
            setPendingRevoke(null);
        } catch (e: any) {
            setRowError(e?.message || "Failed to revoke access.");
        } finally {
            setRevoking(false);
        }
    };

    const confirmRevokeUnauthorized = async () => {
        if (!pendingRevokeUnauthorized) return;
        setRevokingUnauthorized(true);
        try {
            await onRevokeUnauthorized(pendingRevokeUnauthorized.id);
            setPendingRevokeUnauthorized(null);
        } catch (e: any) {
            setUnauthorizedRowError(e?.message || "Failed to remove account.");
        } finally {
            setRevokingUnauthorized(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-none">
                <div className="sticky top-0 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white px-6 py-4 rounded-t-2xl flex items-center justify-between z-10 ">
                    <div className="flex items-center gap-3">
                        <Shield className="w-5 h-5" />
                        <div>
                            <h2 className="text-lg font-semibold">
                                Manage Accounts
                            </h2>
                            <p className="text-xs text-white/70">
                                Staff login accounts and their system roles
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/20 rounded-lg"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by name or email..."
                                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-[#000000]"
                            />
                        </div>
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-[#000000]"
                        >
                            <option value="All">All Roles</option>
                            {roleDefs.map((rd) => (
                                <option key={rd.role} value={rd.role}>
                                    {rd.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {rowError && (
                        <p className="text-sm text-red-500">{rowError}</p>
                    )}

                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-[#faf8f5] border-b border-gray-200">
                                    <tr>
                                        {[
                                            "Name",
                                            "Email",
                                            "Position",
                                            "Role",
                                            "",
                                        ].map((h) => (
                                            <th
                                                key={h}
                                                className="px-4 py-2.5 text-xs font-semibold text-[#1a2b4a] text-left"
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {loading ? (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-4 py-10 text-center text-[#8b8476] text-sm"
                                            >
                                                Loading accounts…
                                            </td>
                                        </tr>
                                    ) : error ? (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-4 py-10 text-center text-sm"
                                            >
                                                <p className="text-red-500 mb-2">
                                                    {error}
                                                </p>
                                                <button
                                                    onClick={onRetry}
                                                    className="text-[#1a2b4a] underline text-xs"
                                                >
                                                    Try again
                                                </button>
                                            </td>
                                        </tr>
                                    ) : filtered.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={5}
                                                className="px-4 py-10 text-center text-[#8b8476] text-sm"
                                            >
                                                No accounts found.
                                            </td>
                                        </tr>
                                    ) : (
                                        filtered.map((a) => (
                                            <tr
                                                key={a.id}
                                                className="hover:bg-[#faf8f5] transition-colors"
                                            >
                                                <td className="px-4 py-2.5 text-sm font-medium text-[#2c2c2c]">
                                                    {a.name}
                                                </td>
                                                <td className="px-4 py-2.5 text-sm text-[#6b6456]">
                                                    {a.email}
                                                </td>
                                                <td className="px-4 py-2.5 text-sm text-[#6b6456]">
                                                    {a.position || "—"}
                                                    {a.department
                                                        ? ` · ${a.department}`
                                                        : ""}
                                                </td>
                                                <td className="px-4 py-2.5 text-sm">
                                                    <select
                                                        value={a.role}
                                                        disabled={
                                                            savingId === a.id
                                                        }
                                                        onChange={(e) =>
                                                            handleRoleChange(
                                                                a.id,
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-[#000000] disabled:opacity-50"
                                                    >
                                                        {roleDefs.map((rd) => (
                                                            <option
                                                                key={rd.role}
                                                                value={rd.role}
                                                            >
                                                                {rd.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {savingId === a.id && (
                                                        <span className="ml-2 text-[10px] text-[#8b8476]">
                                                            Saving…
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <button
                                                        onClick={() =>
                                                            setPendingRevoke({
                                                                id: a.id,
                                                                name: a.name,
                                                            })
                                                        }
                                                        className="text-xs font-medium text-red-600 hover:text-red-700 flex items-center gap-1 ml-auto"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />{" "}
                                                        Revoke
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <p className="text-xs text-[#8b8476]">
                        Changing a role updates what the account can access the
                        next time they sign in. Revoking access removes the
                        account's system role and login access, but keeps their
                        employee record on file.
                    </p>

                    <div className="pt-4 border-t border-gray-200">
                        <h3 className="text-sm font-semibold text-[#1a2b4a] mb-1">
                            Unauthorized Accounts
                        </h3>
                        <p className="text-xs text-[#8b8476] mb-3">
                            These accounts can sign in but have no profile,
                            guardian, or student record linked — they're
                            rejected at login with "Email is unauthorized."
                            Remove any that shouldn't exist.
                        </p>

                        {unauthorizedRowError && (
                            <p className="text-sm text-red-500 mb-2">
                                {unauthorizedRowError}
                            </p>
                        )}

                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-[#faf8f5] border-b border-gray-200">
                                        <tr>
                                            {[
                                                "Email",
                                                "Created",
                                                "Last Sign-in",
                                                "",
                                            ].map((h) => (
                                                <th
                                                    key={h}
                                                    className="px-4 py-2.5 text-xs font-semibold text-[#1a2b4a] text-left"
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {unauthorizedLoading ? (
                                            <tr>
                                                <td
                                                    colSpan={4}
                                                    className="px-4 py-8 text-center text-[#8b8476] text-sm"
                                                >
                                                    Loading…
                                                </td>
                                            </tr>
                                        ) : unauthorizedError ? (
                                            <tr>
                                                <td
                                                    colSpan={4}
                                                    className="px-4 py-8 text-center text-sm"
                                                >
                                                    <p className="text-red-500 mb-2">
                                                        {unauthorizedError}
                                                    </p>
                                                    <button
                                                        onClick={
                                                            onRetryUnauthorized
                                                        }
                                                        className="text-[#1a2b4a] underline text-xs"
                                                    >
                                                        Try again
                                                    </button>
                                                </td>
                                            </tr>
                                        ) : unauthorizedAccounts.length ===
                                          0 ? (
                                            <tr>
                                                <td
                                                    colSpan={4}
                                                    className="px-4 py-8 text-center text-[#8b8476] text-sm"
                                                >
                                                    No unauthorized accounts
                                                    found.
                                                </td>
                                            </tr>
                                        ) : (
                                            unauthorizedAccounts.map((a) => (
                                                <tr
                                                    key={a.id}
                                                    className="hover:bg-[#faf8f5] transition-colors"
                                                >
                                                    <td className="px-4 py-2.5 text-sm text-[#2c2c2c]">
                                                        {a.email ||
                                                            "(no email)"}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-sm text-[#6b6456]">
                                                        {a.createdAt}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-sm text-[#6b6456]">
                                                        {a.lastSignInAt ||
                                                            "Never"}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right">
                                                        <button
                                                            onClick={() =>
                                                                setPendingRevokeUnauthorized(
                                                                    {
                                                                        id: a.id,
                                                                        email: a.email,
                                                                    },
                                                                )
                                                            }
                                                            className="text-xs font-medium text-red-600 hover:text-red-700 flex items-center gap-1 ml-auto"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />{" "}
                                                            Remove
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {pendingRevokeUnauthorized && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                                <Trash2 className="w-7 h-7 text-red-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-[#1a2b4a] mb-1">
                                    Remove Unauthorized Account
                                </h3>
                                <p className="text-sm text-[#6b6456]">
                                    Permanently delete the login account for{" "}
                                    <strong>
                                        {pendingRevokeUnauthorized.email ||
                                            "this user"}
                                    </strong>{" "}
                                    ? This action cannot be undone.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() =>
                                        setPendingRevokeUnauthorized(null)
                                    }
                                    disabled={revokingUnauthorized}
                                    className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmRevokeUnauthorized}
                                    disabled={revokingUnauthorized}
                                    className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-all disabled:opacity-60"
                                >
                                    {revokingUnauthorized
                                        ? "Removing…"
                                        : "Remove"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {pendingRevoke && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                                <Trash2 className="w-7 h-7 text-red-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-[#1a2b4a] mb-1">
                                    Revoke Access
                                </h3>
                                <p className="text-sm text-[#6b6456]">
                                    Remove the login account for{" "}
                                    <strong>{pendingRevoke.name}</strong>? They
                                    will no longer be able to sign in. Their
                                    employee record stays, and you can give them
                                    a new login later with Restore login in
                                    Staff & Teachers.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setPendingRevoke(null)}
                                    disabled={revoking}
                                    className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl text-[#6b6456] font-medium hover:bg-[#faf8f5] transition-all disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmRevoke}
                                    disabled={revoking}
                                    className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-all disabled:opacity-60"
                                >
                                    {revoking ? "Revoking…" : "Revoke"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
