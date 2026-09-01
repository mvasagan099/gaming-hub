import { useEffect, useState } from 'react';
import { adminApi } from '../../services/api/enterprise';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import type { Coupon, CouponStatus, CouponDiscountType } from '@gaming-hub/shared';

const STATUS_STYLES: Record<CouponStatus, string> = {
  ACTIVE: 'bg-green-500/10 text-green-600',
  INACTIVE: 'bg-gray-500/10 text-gray-600',
  EXPIRED: 'bg-red-500/10 text-red-600',
};

const EMPTY_FORM = {
  code: '',
  title: '',
  description: '',
  discountType: 'PERCENT' as CouponDiscountType,
  discountValue: 10,
  maxUses: 100,
  minWager: 0,
  maxRedeemValue: null as number | null,
  gameId: '' as string,
  validFrom: '',
  validUntil: '',
};

export function AdminCouponsPage() {
  const [items, setItems] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.coupons(1, 100);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coupons');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const flash = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      validFrom: new Date().toISOString().slice(0, 16),
      validUntil: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
    });
    setShowModal(true);
  };

  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code,
      title: c.title,
      description: c.description ?? '',
      discountType: c.discountType,
      discountValue: c.discountValue,
      maxUses: c.maxUses,
      minWager: c.minWager,
      maxRedeemValue: c.maxRedeemValue,
      gameId: c.gameId ?? '',
      validFrom: c.validFrom.slice(0, 16),
      validUntil: c.validUntil.slice(0, 16),
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.title || !form.discountValue || !form.validFrom || !form.validUntil) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...form,
        gameId: form.gameId || null,
        validFrom: new Date(form.validFrom).toISOString(),
        validUntil: new Date(form.validUntil).toISOString(),
      };
      if (editing) {
        await adminApi.updateCoupon(editing.id, payload);
        flash('Coupon updated');
      } else {
        await adminApi.createCoupon(payload);
        flash('Coupon created');
      }
      setShowModal(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save coupon');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatus = async (id: string, status: CouponStatus) => {
    setError(null);
    try {
      await adminApi.setCouponStatus(id, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this coupon?')) return;
    setError(null);
    try {
      await adminApi.deleteCoupon(id);
      await load();
      flash('Coupon deleted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete coupon');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Coupons</h1>
        <button
          onClick={openCreate}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
        >
          Create Coupon
        </button>
      </div>

      {successMessage && (
        <div className="mb-4 rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-600">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr className="text-left text-sm text-muted-foreground">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Discount</th>
              <th className="px-4 py-3">Uses</th>
              <th className="px-4 py-3">Game</th>
              <th className="px-4 py-3">Valid Until</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b border-border">
                <td className="px-4 py-3">
                  <code className="rounded bg-muted px-2 py-0.5 text-sm font-semibold">{c.code}</code>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{c.title}</div>
                  <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                    {c.description || 'No description'}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">
                  {c.discountType === 'PERCENT' ? `${c.discountValue}%` : c.discountValue.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm">
                  {c.usedCount}/{c.maxUses}
                </td>
                <td className="px-4 py-3 text-sm">
                  {c.gameId ? (GAME_DEFINITIONS.find((g) => g.id === c.gameId)?.name ?? c.gameId) : 'All games'}
                </td>
                <td className="px-4 py-3 text-sm">{new Date(c.validUntil).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs ${STATUS_STYLES[c.status]}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openEdit(c)}
                      className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      Edit
                    </button>
                    {c.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleStatus(c.id, 'INACTIVE')}
                        className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        Deactivate
                      </button>
                    )}
                    {c.status === 'INACTIVE' && (
                      <button
                        onClick={() => handleStatus(c.id, 'ACTIVE')}
                        className="rounded bg-green-500 px-2 py-1 text-xs text-white hover:bg-green-600"
                      >
                        Activate
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="rounded bg-red-500 px-2 py-1 text-xs text-white hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No coupons yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50">
          <div className="max-h-[90vh] w-[560px] overflow-y-auto rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold">{editing ? 'Edit Coupon' : 'Create Coupon'}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Code</label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="SUMMER50"
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Title</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Discount Type</label>
                  <select
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value as CouponDiscountType })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    <option value="PERCENT">Percentage</option>
                    <option value="FIXED">Fixed amount</option>
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Discount Value</label>
                  <input
                    type="number"
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: e.target.valueAsNumber })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Max Uses</label>
                  <input
                    type="number"
                    value={form.maxUses}
                    onChange={(e) => setForm({ ...form, maxUses: e.target.valueAsNumber })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Min Wager</label>
                  <input
                    type="number"
                    value={form.minWager}
                    onChange={(e) => setForm({ ...form, minWager: e.target.valueAsNumber })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Max Redeem Value (optional)</label>
                  <input
                    type="number"
                    value={form.maxRedeemValue ?? ''}
                    onChange={(e) => setForm({ ...form, maxRedeemValue: e.target.value ? e.target.valueAsNumber : null })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Game (optional)</label>
                  <select
                    value={form.gameId}
                    onChange={(e) => setForm({ ...form, gameId: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  >
                    <option value="">All games</option>
                    {GAME_DEFINITIONS.map((game) => (
                      <option key={game.id} value={game.id}>
                        {game.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Valid From</label>
                  <input
                    type="datetime-local"
                    value={form.validFrom}
                    onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Valid Until</label>
                  <input
                    type="datetime-local"
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-2"
                  />
                </div>
              </div>
              {error && (
                <div className="rounded-md border border-red-500/50 bg-red-500/10 p-2 text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowModal(false);
                  setError(null);
                }}
                disabled={isSubmitting}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSubmitting || !form.code || !form.title || !form.validUntil}
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : editing ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
