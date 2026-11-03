import { useState, useEffect } from "react";
import { Search, AlertCircle, Edit, Trash2, X, Plus } from "lucide-react";
import {
    listRooms,
    createRoom,
    updateRoom,
    deleteRoom,
    type Room,
} from "../../lib/rooms";

export function RoomManagement() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const load = () => {
        setLoading(true);
        setLoadError(null);
        listRooms()
            .then((rows) => setRooms(rows))
            .catch((e) => setLoadError(e?.message || 'Failed to load rooms.'))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const [showModal, setShowModal] = useState(false);
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);
    const [form, setForm] = useState({ name: '' });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const openCreateModal = () => {
        setEditingRoom(null);
        setForm({ name: '' });
        setFormError(null);
        setShowModal(true);
    };

    const openEditModal = (room: Room) => {
        setEditingRoom(room);
        setForm({ name: room.name });
        setFormError(null);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            setFormError('Room name is required.');
            return;
        }
        setSaving(true);
        setFormError(null);
        try {
            if (editingRoom) {
                await updateRoom(editingRoom.id, form.name);
            } else {
                await createRoom(form.name);
            }
            setShowModal(false);
            load();
        } catch (e: any) {
            setFormError(e?.message || 'Failed to save room.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (room: Room) => {
        setDeletingId(room.id);
        setDeleteError(null);
        const error = await deleteRoom(room.id, room.name);
        setDeletingId(null);
        if (error) {
            setDeleteError(error);
            return;
        }
        setRooms((prev) => prev.filter((r) => r.id !== room.id));
    };

    const filtered = rooms.filter((r) => {
        if (search.trim() && !r.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
        return true;
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">Room Management</h1>
                    <p className="text-[#6b6456]">Create, update, and delete rooms available to Class Management</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white hover:shadow-lg transition-all"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add Room</span>
                </button>
            </div>

            {deleteError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {deleteError}
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8476]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search rooms..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 focus:border-transparent"
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-[#faf8f5] border-b border-gray-200">
                            <tr>
                                <th className="text-left px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Room</th>
                                <th className="text-center px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr><td colSpan={2} className="px-6 py-8 text-center text-sm text-[#8b8476]">Loading rooms…</td></tr>
                            ) : loadError ? (
                                <tr><td colSpan={2} className="px-6 py-8 text-center text-sm text-red-500">{loadError}</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={2} className="px-6 py-8 text-center text-sm text-[#8b8476]">
                                    {rooms.length === 0 ? 'No rooms yet — click "Add Room" to create one.' : 'No rooms match your search.'}
                                </td></tr>
                            ) : (
                                filtered.map((r) => (
                                    <tr key={r.id} className="hover:bg-[#faf8f5] transition-colors">
                                        <td className="px-6 py-4 font-medium text-[#2c2c2c]">{r.name}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => openEditModal(r)}
                                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                                    title="Edit Room"
                                                >
                                                    <Edit className="w-4 h-4 text-[#8b8476]" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(r)}
                                                    disabled={deletingId === r.id}
                                                    className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                                    title="Delete Room"
                                                >
                                                    <Trash2 className="w-4 h-4 text-red-400" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                        <div className="bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
                            <h3 className="text-lg font-semibold">{editingRoom ? 'Edit Room' : 'Add Room'}</h3>
                            <button onClick={() => setShowModal(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[#6b6456] mb-1">Room Name</label>
                                <input
                                    value={form.name}
                                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g. Room 201"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                                    autoFocus
                                />
                            </div>
                            {formError && <p className="text-sm text-red-500">{formError}</p>}
                        </div>
                        <div className="p-6 pt-0 flex gap-3">
                            <button onClick={() => setShowModal(false)} disabled={saving} className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#2c2c2c] font-medium hover:border-[#c9a961] transition-all disabled:opacity-60">
                                Cancel
                            </button>
                            <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60">
                                {saving ? 'Saving…' : editingRoom ? 'Save Changes' : 'Add Room'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
