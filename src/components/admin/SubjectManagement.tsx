import { useState, useEffect } from "react";
import {
    Search,
    AlertCircle,
    Edit,
    Trash2,
    X,
    Plus,
    RotateCcw,
} from "lucide-react";
import {
    CURRICULA,
    listSubjects,
    createSubject,
    updateSubject,
    deleteSubject,
    setSubjectHidden,
    type Subject,
} from "../../lib/subjects";

// Subject Management — create, update, and delete the subject catalog that
// Class Management picks from when assigning subjects to a class section.
const ALL_GRADE_LEVELS = 'All Grade Levels';

export function SubjectManagement() {
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [curriculumFilter, setCurriculumFilter] = useState<string>('All');
    const [search, setSearch] = useState('');

    const load = () => {
        setLoading(true);
        setLoadError(null);
        listSubjects(undefined, true)
            .then((rows) => setSubjects(rows))
            .catch((e) => setLoadError(e?.message || 'Failed to load subjects.'))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const [showModal, setShowModal] = useState(false);
    const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
    const [form, setForm] = useState<{ name: string; curriculum: string }>({ name: '', curriculum: ALL_GRADE_LEVELS });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const openCreateModal = () => {
        setEditingSubject(null);
        setForm({ name: '', curriculum: ALL_GRADE_LEVELS });
        setFormError(null);
        setShowModal(true);
    };

    const openEditModal = (subject: Subject) => {
        setEditingSubject(subject);
        setForm({ name: subject.name, curriculum: subject.curriculum || ALL_GRADE_LEVELS });
        setFormError(null);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            setFormError('Subject name is required.');
            return;
        }
        setSaving(true);
        setFormError(null);
        const curriculum = form.curriculum === ALL_GRADE_LEVELS ? null : form.curriculum;
        try {
            if (editingSubject) {
                await updateSubject(editingSubject.id, form.name, curriculum);
            } else {
                await createSubject(form.name, curriculum);
            }
            setShowModal(false);
            load();
        } catch (e: any) {
            setFormError(e?.message || 'Failed to save subject.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (subject: Subject) => {
        setDeletingId(subject.id);
        setDeleteError(null);
        setDeleteNotice(null);
        const { error, hidden } = await deleteSubject(subject.id);
        setDeletingId(null);
        if (error) {
            setDeleteError(error);
            return;
        }
        if (hidden) {
            setDeleteNotice(`"${subject.name}" is still used by a class from a past school year, so it was hidden instead of deleted — it won't appear when assigning subjects to classes anymore.`);
            setSubjects((prev) => prev.map((s) => (s.id === subject.id ? { ...s, hidden: true } : s)));
            return;
        }
        setSubjects((prev) => prev.filter((s) => s.id !== subject.id));
    };

    const handleToggleHidden = async (subject: Subject) => {
        setTogglingId(subject.id);
        setDeleteError(null);
        setDeleteNotice(null);
        const error = await setSubjectHidden(subject.id, !subject.hidden);
        setTogglingId(null);
        if (error) {
            setDeleteError(error);
            return;
        }
        setSubjects((prev) => prev.map((s) => (s.id === subject.id ? { ...s, hidden: !s.hidden } : s)));
    };

    const filtered = subjects.filter((s) => {
        if (curriculumFilter !== 'All' && s.curriculum !== curriculumFilter) return false;
        if (search.trim() && !s.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
        return true;
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-3xl font-bold text-[#1a2b4a] mb-1">Subject Management</h1>
                    <p className="text-[#6b6456]">Create, update, and delete subjects offered across the curriculum</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white hover:shadow-lg transition-all"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add Subject</span>
                </button>
            </div>

            {deleteError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {deleteError}
                </div>
            )}
            {deleteNotice && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {deleteNotice}
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
                            placeholder="Search subjects..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 focus:border-transparent"
                        />
                    </div>
                    <select
                        value={curriculumFilter}
                        onChange={(e) => setCurriculumFilter(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-[#2c2c2c] focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20"
                    >
                        <option value="All">All Curricula</option>
                        {CURRICULA.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-[#faf8f5] border-b border-gray-200">
                            <tr>
                                <th className="text-left px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Subject</th>
                                <th className="text-left px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Curriculum</th>
                                <th className="text-center px-6 py-3 text-sm font-semibold text-[#1a2b4a]">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-[#8b8476]">Loading subjects…</td></tr>
                            ) : loadError ? (
                                <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-red-500">{loadError}</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-[#8b8476]">
                                    {subjects.length === 0 ? 'No subjects yet — click "Add Subject" to create one.' : 'No subjects match your search.'}
                                </td></tr>
                            ) : (
                                filtered.map((s) => (
                                    <tr key={s.id} className={`hover:bg-[#faf8f5] transition-colors ${s.hidden ? 'opacity-60' : ''}`}>
                                        <td className="px-6 py-4 font-medium text-[#2c2c2c]">
                                            {s.name}
                                            {s.hidden && (
                                                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-[#6b6456] border border-gray-200">
                                                    Hidden
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-[#6b6456]">{s.curriculum || ALL_GRADE_LEVELS}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => openEditModal(s)}
                                                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                                                    title="Edit Subject"
                                                >
                                                    <Edit className="w-4 h-4 text-[#8b8476]" />
                                                </button>
                                                {s.hidden ? (
                                                    <button
                                                        onClick={() => handleToggleHidden(s)}
                                                        disabled={togglingId === s.id}
                                                        className="p-2 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                                                        title="Unhide Subject"
                                                    >
                                                        <RotateCcw className="w-4 h-4 text-emerald-500" />
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleDelete(s)}
                                                        disabled={deletingId === s.id}
                                                        className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                                        title="Delete Subject"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-400" />
                                                    </button>
                                                )}
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
                            <h3 className="text-lg font-semibold">{editingSubject ? 'Edit Subject' : 'Add Subject'}</h3>
                            <button onClick={() => setShowModal(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[#6b6456] mb-1">Subject Name</label>
                                <input
                                    value={form.name}
                                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g. Mathematics"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20 text-black"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#6b6456] mb-1">Curriculum</label>
                                <select
                                    value={form.curriculum}
                                    onChange={(e) => setForm((f) => ({ ...f, curriculum: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-black focus:outline-none focus:ring-2 focus:ring-[#1a2b4a]/20"
                                >
                                    {CURRICULA.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                    <option value={ALL_GRADE_LEVELS}>{ALL_GRADE_LEVELS}</option>
                                </select>
                            </div>
                            {formError && <p className="text-sm text-red-500">{formError}</p>}
                        </div>
                        <div className="p-6 pt-0 flex gap-3">
                            <button onClick={() => setShowModal(false)} disabled={saving} className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-lg text-[#2c2c2c] font-medium hover:border-[#c9a961] transition-all disabled:opacity-60">
                                Cancel
                            </button>
                            <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#1a2b4a] to-[#2d4263] text-white rounded-lg font-medium hover:shadow-lg transition-all disabled:opacity-60">
                                {saving ? 'Saving…' : editingSubject ? 'Save Changes' : 'Add Subject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
