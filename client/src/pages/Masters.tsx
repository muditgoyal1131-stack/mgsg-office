import React, { useEffect, useState } from 'react';
import {
  getProfitCentres, createProfitCentre, updateProfitCentre, deleteProfitCentre,
  getCategories, createCategory, updateCategory, deleteCategory,
  getBillingEntities, createBillingEntity, updateBillingEntity, deleteBillingEntity,
  getAllExpenseCategories, createExpenseCategory, updateExpenseCategory, deleteExpenseCategory,
} from '../api';

interface MasterItem { id: number; name: string; isActive?: boolean; }

type MasterType = 'profitCentre' | 'category' | 'billingEntity' | 'expenseCategory';

interface MasterSection {
  type: MasterType;
  label: string;
  description: string;
  items: MasterItem[];
}

const MasterTable: React.FC<{
  section: MasterSection;
  onAdd: (type: MasterType, name: string) => Promise<void>;
  onEdit: (type: MasterType, id: number, name: string) => Promise<void>;
  onDelete: (type: MasterType, id: number) => Promise<void>;
}> = ({ section, onAdd, onEdit, onDelete }) => {
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(''); setSaving(true);
    try {
      await onAdd(section.type, newName.trim());
      setNewName('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error adding item');
    } finally { setSaving(false); }
  };

  const startEdit = (item: MasterItem) => { setEditId(item.id); setEditName(item.name); setError(''); };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || editId === null) return;
    setError(''); setSaving(true);
    try {
      await onEdit(section.type, editId, editName.trim());
      setEditId(null); setEditName('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error updating item');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this item? It cannot be deleted if used by any task.')) return;
    setError('');
    try { await onDelete(section.type, id); }
    catch (err: any) { setError(err.response?.data?.message || 'Error deleting item'); }
  };

  return (
    <div className="card">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900">{section.label}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{section.description}</p>
      </div>

      {/* Add form */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-4">
        <input
          className="input-field flex-1"
          placeholder={`Add new ${section.label.toLowerCase()}...`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn-primary text-sm whitespace-nowrap" disabled={saving}>
          + Add
        </button>
      </form>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {section.items.length === 0 ? (
        <p className="text-gray-400 text-sm">No items yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header">Name</th>
              <th className="table-header">Actions</th>
            </tr>
          </thead>
          <tbody>
            {section.items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="table-cell">
                  {editId === item.id ? (
                    <form onSubmit={handleEdit} className="flex gap-2">
                      <input
                        className="input-field flex-1"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                      />
                      <button type="submit" className="btn-primary text-xs" disabled={saving}>Save</button>
                      <button type="button" className="btn-secondary text-xs" onClick={() => setEditId(null)}>Cancel</button>
                    </form>
                  ) : (
                    <span className="font-medium text-gray-800">{item.name}</span>
                  )}
                </td>
                <td className="table-cell">
                  {editId !== item.id && (
                    <div className="flex gap-3">
                      <button className="text-blue-600 hover:text-blue-800 text-xs font-medium" onClick={() => startEdit(item)}>Edit</button>
                      <button className="text-red-600 hover:text-red-800 text-xs font-medium" onClick={() => handleDelete(item.id)}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// ─── Masters Page ──────────────────────────────────────────────────────────────

const Masters: React.FC = () => {
  const [profitCentres, setProfitCentres] = useState<MasterItem[]>([]);
  const [categories, setCategories] = useState<MasterItem[]>([]);
  const [billingEntities, setBillingEntities] = useState<MasterItem[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<MasterItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    const [pcRes, catRes, beRes, ecRes] = await Promise.all([
      getProfitCentres(), getCategories(), getBillingEntities(), getAllExpenseCategories(),
    ]);
    setProfitCentres(pcRes.data);
    setCategories(catRes.data);
    setBillingEntities(beRes.data);
    setExpenseCategories(ecRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleAdd = async (type: MasterType, name: string) => {
    if (type === 'profitCentre') await createProfitCentre({ name });
    else if (type === 'category') await createCategory({ name });
    else if (type === 'expenseCategory') await createExpenseCategory({ name });
    else await createBillingEntity({ name });
    await fetchAll();
  };

  const handleEdit = async (type: MasterType, id: number, name: string) => {
    if (type === 'profitCentre') await updateProfitCentre(id, { name });
    else if (type === 'category') await updateCategory(id, { name });
    else if (type === 'expenseCategory') await updateExpenseCategory(id, { name });
    else await updateBillingEntity(id, { name });
    await fetchAll();
  };

  const handleDelete = async (type: MasterType, id: number) => {
    if (type === 'profitCentre') await deleteProfitCentre(id);
    else if (type === 'category') await deleteCategory(id);
    else if (type === 'expenseCategory') await deleteExpenseCategory(id);
    else await deleteBillingEntity(id);
    await fetchAll();
  };

  const sections: MasterSection[] = [
    {
      type: 'profitCentre',
      label: 'Profit Centres',
      description: 'Profit centres for grouping and reporting tasks',
      items: profitCentres,
    },
    {
      type: 'category',
      label: 'Task Categories',
      description: 'Task categories (e.g. Audit, Tax, Advisory)',
      items: categories,
    },
    {
      type: 'billingEntity',
      label: 'Billing Entities',
      description: 'Entities under which invoices are raised',
      items: billingEntities,
    },
    {
      type: 'expenseCategory',
      label: 'Expense Categories',
      description: 'Categories for reimbursement line items (e.g. Travel, Courier)',
      items: expenseCategories,
    },
  ];

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Masters</h2>
          <p className="text-sm text-gray-500 mt-1">Manage reference data used across tasks</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
        {sections.map((section) => (
          <MasterTable
            key={section.type}
            section={section}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>

    </div>
  );
};

export default Masters;
