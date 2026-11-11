'use client';

import React, { useState, useMemo } from 'react';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  db,
  auth,
  OperationType,
  handleFirestoreError,
  generateSafeId,
  recordActivityLog,
} from '@/lib/firebase';
import {
  OrderRecord,
  ORDER_WORKFLOW_STAGES,
  OrderWorkflowStatus,
  ClientRecord,
  WebsiteRecord,
  SupplierRecord,
  OutreachRecord,
  OutreachTemplateCategory,
  DeliveryRecord,
  SettingRecord,
  calculatePricingMetrics,
  formatCurrency,
} from '@/lib/types';
import { generateDeliveryReportPdf } from '@/lib/pdf-generator';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Copy,
  Mail,
  Send,
  ShieldCheck,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';

/* ============================================================================
 * ORDER MANAGEMENT MODULE (SECTION 10)
 * ============================================================================ */

interface OrderModuleProps {
  orders: OrderRecord[];
  clients: ClientRecord[];
  websites: WebsiteRecord[];
  suppliers: SupplierRecord[];
  currency: string;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const INITIAL_ORDER_FORM = {
  clientId: '',
  clientName: '',
  websiteId: '',
  websiteDomain: '',
  supplierId: '',
  supplierName: '',
  articleTitle: '',
  articleContentUrl: '',
  targetUrl: '',
  anchorText: '',
  clientPrice: '250',
  supplierCost: '90',
  additionalExpenses: '15',
  paymentStatus: 'Unpaid' as OrderRecord['paymentStatus'],
  supplierPaymentStatus: 'Unpaid' as OrderRecord['supplierPaymentStatus'],
  status: 'NEW LEAD' as OrderWorkflowStatus,
  publicationUrl: '',
  backlinkVerificationStatus: 'Unverified' as OrderRecord['backlinkVerificationStatus'],
  backlinkRelAttribute: 'none',
  lastVerifiedAt: 'Not verified',
  deliveryDate: '',
  notes: '',
};

export function OrderManagementModule({
  orders,
  clients,
  websites,
  suppliers,
  currency,
  onNotify,
}: OrderModuleProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderRecord | null>(null);
  const [formData, setFormData] = useState(INITIAL_ORDER_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (stageFilter !== 'ALL' && o.status !== stageFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          o.orderNumber.toLowerCase().includes(q) ||
          o.clientName.toLowerCase().includes(q) ||
          o.websiteDomain.toLowerCase().includes(q) ||
          o.anchorText.toLowerCase().includes(q) ||
          o.targetUrl.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [orders, stageFilter, searchQuery]);

  const openAddModal = () => {
    setEditingOrder(null);
    setFormData(INITIAL_ORDER_FORM);
    setIsModalOpen(true);
  };

  const openEditModal = (ord: OrderRecord) => {
    setEditingOrder(ord);
    setFormData({
      clientId: ord.clientId,
      clientName: ord.clientName,
      websiteId: ord.websiteId,
      websiteDomain: ord.websiteDomain,
      supplierId: ord.supplierId,
      supplierName: ord.supplierName,
      articleTitle: ord.articleTitle,
      articleContentUrl: ord.articleContentUrl,
      targetUrl: ord.targetUrl,
      anchorText: ord.anchorText,
      clientPrice: String(ord.clientPrice),
      supplierCost: String(ord.supplierCost),
      additionalExpenses: String(ord.additionalExpenses),
      paymentStatus: ord.paymentStatus,
      supplierPaymentStatus: ord.supplierPaymentStatus,
      status: ord.status,
      publicationUrl: ord.publicationUrl,
      backlinkVerificationStatus: ord.backlinkVerificationStatus,
      backlinkRelAttribute: ord.backlinkRelAttribute,
      lastVerifiedAt: ord.lastVerifiedAt,
      deliveryDate: ord.deliveryDate,
      notes: ord.notes,
    });
    setIsModalOpen(true);
  };

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;

    if (!formData.clientName.trim() || !formData.websiteDomain.trim()) {
      onNotify('Client Name and Publisher Website Domain are required.', 'error');
      return;
    }

    const cPrice = Math.min(1000000, Math.max(0, Number(formData.clientPrice) || 0));
    const sCost = Math.min(1000000, Math.max(0, Number(formData.supplierCost) || 0));
    const addExp = Math.min(1000000, Math.max(0, Number(formData.additionalExpenses) || 0));
    const { netProfit, profitMargin } = calculatePricingMetrics(cPrice, sCost, addExp);

    const orderNum =
      editingOrder?.orderNumber || `ORD-${Date.now().toString().slice(-6)}`;

    const payload = {
      ownerId: user.uid,
      orderNumber: orderNum.slice(0, 50),
      clientId: formData.clientId.slice(0, 128),
      clientName: formData.clientName.trim().slice(0, 150),
      websiteId: formData.websiteId.slice(0, 128),
      websiteDomain: formData.websiteDomain.trim().slice(0, 253),
      supplierId: formData.supplierId.slice(0, 128),
      supplierName: formData.supplierName.trim().slice(0, 150),
      articleTitle: formData.articleTitle.trim().slice(0, 300),
      articleContentUrl: formData.articleContentUrl.trim().slice(0, 500),
      targetUrl: formData.targetUrl.trim().slice(0, 500),
      anchorText: formData.anchorText.trim().slice(0, 250),
      clientPrice: cPrice,
      supplierCost: sCost,
      additionalExpenses: addExp,
      netProfit,
      profitMargin,
      paymentStatus: formData.paymentStatus,
      supplierPaymentStatus: formData.supplierPaymentStatus,
      status: formData.status,
      publicationUrl: formData.publicationUrl.trim().slice(0, 500),
      backlinkVerificationStatus: formData.backlinkVerificationStatus,
      backlinkRelAttribute: formData.backlinkRelAttribute.trim().slice(0, 100),
      lastVerifiedAt: formData.lastVerifiedAt.trim().slice(0, 50),
      deliveryDate:
        formData.status === 'DELIVERED' && !formData.deliveryDate
          ? new Date().toISOString().slice(0, 10)
          : formData.deliveryDate.trim().slice(0, 50),
      notes: formData.notes.trim().slice(0, 2000),
    };

    setIsSaving(true);
    try {
      if (editingOrder) {
        await updateDoc(doc(db, 'orders', editingOrder.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        await recordActivityLog(
          'Orders',
          'Updated Order',
          editingOrder.id,
          `Updated ${orderNum} (${payload.websiteDomain}) — Stage: ${payload.status}`
        );
        onNotify(`Updated order ${orderNum}.`, 'success');
      } else {
        const newId = generateSafeId('ord');
        await setDoc(doc(collection(db, 'orders'), newId), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await recordActivityLog(
          'Orders',
          'Created Order',
          newId,
          `Created ${orderNum} for ${payload.clientName} on ${payload.websiteDomain}`
        );
        onNotify(`Created order ${orderNum}.`, 'success');
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(
        error,
        editingOrder ? OperationType.UPDATE : OperationType.CREATE,
        'orders'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleStageChange = async (order: OrderRecord, newStage: OrderWorkflowStatus) => {
    const newDeliveryDate =
      newStage === 'DELIVERED' && !order.deliveryDate
        ? new Date().toISOString().slice(0, 10)
        : order.deliveryDate;

    try {
      await updateDoc(doc(db, 'orders', order.id), {
        status: newStage,
        deliveryDate: newDeliveryDate,
        updatedAt: serverTimestamp(),
      });
      await recordActivityLog(
        'Orders',
        'Workflow Stage Changed',
        order.id,
        `${order.orderNumber} transitioned from "${order.status}" → "${newStage}"`
      );
      onNotify(`${order.orderNumber} moved to ${newStage}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    }
  };

  const handleDeleteOrder = async (id: string) => {
    const target = orders.find((o) => o.id === id);
    try {
      await deleteDoc(doc(db, 'orders', id));
      await recordActivityLog(
        'Orders',
        'Deleted Order',
        id,
        `Deleted order ${target?.orderNumber || id}`
      );
      setDeleteConfirmId(null);
      onNotify('Order deleted.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `orders/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
            11-Stage Order Workflow Pipeline
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Track every placement from NEW LEAD through BACKLINK VERIFIED and DELIVERED with full audit timestamps.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors inline-flex items-center gap-2 self-start sm:self-auto whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Order
        </button>
      </div>

      {/* Stage Summary Strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <button
          type="button"
          onClick={() => setStageFilter('ALL')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
            stageFilter === 'ALL'
              ? 'bg-emerald-500 text-zinc-950 border-emerald-500'
              : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
          }`}
        >
          All Orders ({orders.length})
        </button>
        {ORDER_WORKFLOW_STAGES.map((stage) => {
          const count = orders.filter((o) => o.status === stage).length;
          return (
            <button
              key={stage}
              type="button"
              onClick={() => setStageFilter(stage)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                stageFilter === stage
                  ? 'bg-emerald-500 text-zinc-950 border-emerald-500'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
            >
              {stage} ({count})
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order #, client, publisher domain, target URL, or anchor text..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-zinc-300">No orders found</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
              Create an order to track client approvals, supplier outreach, article submission, live publication URLs, and backlink verification.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create First Order
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-medium text-zinc-400 bg-zinc-950/60">
                  <th className="py-3 px-4">Order # · Client</th>
                  <th className="py-3 px-3">Publisher · Supplier</th>
                  <th className="py-3 px-3">Target URL & Anchor</th>
                  <th className="py-3 px-3 text-right">Price / Profit</th>
                  <th className="py-3 px-3">Payment</th>
                  <th className="py-3 px-3">Workflow Stage (11 Steps)</th>
                  <th className="py-3 px-3">Backlink Check</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 text-xs">
                {filteredOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-mono font-medium text-zinc-100">
                        {ord.orderNumber}
                      </div>
                      <div className="text-[11px] text-zinc-400">{ord.clientName}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-zinc-200 font-medium">{ord.websiteDomain}</div>
                      <div className="text-[11px] text-zinc-500">
                        {ord.supplierName || 'Direct Publisher'}
                      </div>
                    </td>
                    <td className="py-3 px-3 max-w-[200px]">
                      <div className="truncate text-zinc-300" title={ord.targetUrl}>
                        {ord.targetUrl || '—'}
                      </div>
                      <div className="text-[11px] text-zinc-500 truncate">
                        Anchor: {ord.anchorText || '—'}
                      </div>
                      {ord.publicationUrl && (
                        <a
                          href={ord.publicationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-emerald-400 hover:underline inline-flex items-center gap-1 mt-0.5"
                        >
                          Live Post <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      <div className="text-zinc-100">
                        {formatCurrency(ord.clientPrice, currency)}
                      </div>
                      <div
                        className={`text-[11px] ${
                          ord.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        Net: {formatCurrency(ord.netProfit, currency)}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div
                        className={
                          ord.paymentStatus === 'Paid'
                            ? 'text-emerald-400 font-medium'
                            : 'text-amber-400 font-medium'
                        }
                      >
                        Client: {ord.paymentStatus}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        Supplier: {ord.supplierPaymentStatus}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={ord.status}
                        onChange={(e) =>
                          handleStageChange(ord, e.target.value as OrderWorkflowStatus)
                        }
                        className="px-2.5 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-emerald-400 font-medium focus:outline-none focus:border-emerald-500"
                      >
                        {ORDER_WORKFLOW_STAGES.map((stage) => (
                          <option key={stage} value={stage}>
                            {stage}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-3">
                      <div
                        className={
                          ord.backlinkVerificationStatus === 'Verified'
                            ? 'text-emerald-400 font-medium'
                            : ord.backlinkVerificationStatus === 'Unverified'
                            ? 'text-zinc-500'
                            : 'text-amber-400 font-medium'
                        }
                      >
                        {ord.backlinkVerificationStatus}
                      </div>
                      {ord.deliveryDate && (
                        <div className="text-[11px] text-zinc-500 font-mono">
                          Delivered: {ord.deliveryDate}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {deleteConfirmId === ord.id ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(ord.id)}
                            className="px-2 py-1 text-[11px] bg-red-600 text-white rounded"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-2 py-1 text-[11px] text-zinc-400"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(ord)}
                            className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800"
                            title="Edit Order"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(ord.id)}
                            className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-zinc-800"
                            title="Delete Order"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Order Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-semibold text-zinc-100">
                {editingOrder
                  ? `Edit Order — ${editingOrder.orderNumber}`
                  : 'Create New Guest Post Order'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveOrder} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Select Client (CRM)
                  </label>
                  <select
                    value={formData.clientId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const found = clients.find((c) => c.id === id);
                      setFormData({
                        ...formData,
                        clientId: id,
                        clientName: found ? found.clientName : formData.clientName,
                        targetUrl:
                          found && !formData.targetUrl ? found.website : formData.targetUrl,
                      });
                    }}
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200"
                  >
                    <option value="">-- Select or Enter Below --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.clientName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Select Website (Catalog)
                  </label>
                  <select
                    value={formData.websiteId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const found = websites.find((w) => w.id === id);
                      setFormData({
                        ...formData,
                        websiteId: id,
                        websiteDomain: found ? found.domain : formData.websiteDomain,
                        supplierCost:
                          found && found.guestPostPrice > 0
                            ? String(found.guestPostPrice)
                            : formData.supplierCost,
                      });
                    }}
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200"
                  >
                    <option value="">-- Select or Enter Below --</option>
                    {websites.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.domain}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Select Supplier
                  </label>
                  <select
                    value={formData.supplierId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const found = suppliers.find((s) => s.id === id);
                      setFormData({
                        ...formData,
                        supplierId: id,
                        supplierName: found ? found.supplierName : formData.supplierName,
                      });
                    }}
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200"
                  >
                    <option value="">-- Select or Enter Below --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.supplierName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.clientName}
                    onChange={(e) =>
                      setFormData({ ...formData, clientName: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Publisher Domain *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.websiteDomain}
                    onChange={(e) =>
                      setFormData({ ...formData, websiteDomain: e.target.value })
                    }
                    placeholder="publisher.com"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Supplier Name
                  </label>
                  <input
                    type="text"
                    value={formData.supplierName}
                    onChange={(e) =>
                      setFormData({ ...formData, supplierName: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Client Target URL
                  </label>
                  <input
                    type="text"
                    value={formData.targetUrl}
                    onChange={(e) =>
                      setFormData({ ...formData, targetUrl: e.target.value })
                    }
                    placeholder="https://client.com/landing-page"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Expected Anchor Text
                  </label>
                  <input
                    type="text"
                    value={formData.anchorText}
                    onChange={(e) =>
                      setFormData({ ...formData, anchorText: e.target.value })
                    }
                    placeholder="cloud security platform"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Article Title
                  </label>
                  <input
                    type="text"
                    value={formData.articleTitle}
                    onChange={(e) =>
                      setFormData({ ...formData, articleTitle: e.target.value })
                    }
                    placeholder="How Modern Teams Scale Cloud Security"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Draft / Google Doc URL
                  </label>
                  <input
                    type="text"
                    value={formData.articleContentUrl}
                    onChange={(e) =>
                      setFormData({ ...formData, articleContentUrl: e.target.value })
                    }
                    placeholder="https://docs.google.com/..."
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Client Price ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.clientPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, clientPrice: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Supplier Cost ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.supplierCost}
                    onChange={(e) =>
                      setFormData({ ...formData, supplierCost: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Additional Expenses ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.additionalExpenses}
                    onChange={(e) =>
                      setFormData({ ...formData, additionalExpenses: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Workflow Stage
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as OrderWorkflowStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  >
                    {ORDER_WORKFLOW_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Client Payment Status
                  </label>
                  <select
                    value={formData.paymentStatus}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        paymentStatus: e.target.value as OrderRecord['paymentStatus'],
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  >
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partial">Partial</option>
                    <option value="Paid">Paid</option>
                    <option value="Refunded">Refunded</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Supplier Payment
                  </label>
                  <select
                    value={formData.supplierPaymentStatus}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        supplierPaymentStatus: e.target
                          .value as OrderRecord['supplierPaymentStatus'],
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  >
                    <option value="Unpaid">Unpaid</option>
                    <option value="Paid">Paid</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Live Publication URL (Once Published)
                  </label>
                  <input
                    type="text"
                    value={formData.publicationUrl}
                    onChange={(e) =>
                      setFormData({ ...formData, publicationUrl: e.target.value })
                    }
                    placeholder="https://publisher.com/published-post"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Delivery Date
                  </label>
                  <input
                    type="date"
                    value={formData.deliveryDate}
                    onChange={(e) =>
                      setFormData({ ...formData, deliveryDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg"
                >
                  {isSaving ? 'Saving...' : editingOrder ? 'Update Order' : 'Create Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * EMAIL ASSISTANT MODULE (SECTION 11)
 * ============================================================================ */

interface EmailAssistantProps {
  outreachList: OutreachRecord[];
  websites: WebsiteRecord[];
  clients: ClientRecord[];
  orders: OrderRecord[];
  businessName: string;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const EMAIL_TEMPLATES: Record<
  OutreachTemplateCategory,
  { subject: string; body: string }
> = {
  'Publisher Outreach': {
    subject: 'Editorial Guest Post Inquiry — {{domain}}',
    body: `Hi {{recipientName}},\n\nI hope your week is going well. We manage content placements for several B2B and SaaS brands and would love to contribute an original, well-researched article to {{domain}}.\n\nCould you please share:\n1. Your current rate for a permanent Dofollow editorial guest post\n2. Word count & editorial guidelines\n3. Typical turnaround time\n\nLooking forward to collaborating.\n\nBest regards,\n{{businessName}}`,
  },
  'Price Negotiation': {
    subject: 'Long-Term Volume Partnership Rate — {{domain}}',
    body: `Hi {{recipientName}},\n\nThank you for sharing the editorial details for {{domain}}. Because we place regular monthly orders across our client roster, would you be open to a wholesale agency rate of $[Proposed Rate] per placement for ongoing volume?\n\nWe provide clean, publication-ready articles that require zero editing on your side.\n\nLet me know if that works for your team.\n\nBest regards,\n{{businessName}}`,
  },
  'Guest Post Request': {
    subject: 'Article Submission for Review — {{domain}} ({{orderRef}})',
    body: `Hi {{recipientName}},\n\nPlease find our article draft ready for publication on {{domain}}:\n\nArticle Draft: [Insert Google Doc / Draft Link]\nTarget URL: {{targetUrl}}\nAnchor Text: {{anchorText}}\n\nPlease confirm once scheduled and share the live URL upon publication.\n\nBest regards,\n{{businessName}}`,
  },
  'Client Quotation': {
    subject: 'Guest Post Placement Quotation — {{domain}}',
    body: `Hi {{recipientName}},\n\nFollowing up on your link building requirements, we have confirmed availability on {{domain}}.\n\nPlacement Details:\n- Publisher Domain: {{domain}}\n- Link Type: Permanent Dofollow Editorial Link\n- Turnaround: 2–4 Business Days\n- Total Investment: $[Quoted Price]\n\nPlease reply with your approval, target URL, and preferred anchor text to initiate the order.\n\nBest regards,\n{{businessName}}`,
  },
  'Payment Confirmation': {
    subject: 'Payment Received & Order Initiated — {{orderRef}}',
    body: `Hi {{recipientName}},\n\nWe confirm receipt of your payment for Order {{orderRef}} ({{domain}}).\n\nOur editorial team has initiated the placement workflow with the publisher. We will notify you with a verified backlink delivery report as soon as the article goes live.\n\nBest regards,\n{{businessName}}`,
  },
  'Follow-up Email': {
    subject: 'Quick Follow-Up — Guest Post Status on {{domain}}',
    body: `Hi {{recipientName}},\n\nJust checking in on the status of our pending guest post submission for {{domain}}. Do you have an estimated publication date we can share with our client?\n\nThanks so much for your help!\n\nBest regards,\n{{businessName}}`,
  },
  'Delivery Notification': {
    subject: 'Order Delivered & Backlink Verified — {{domain}} ({{orderRef}})',
    body: `Hi {{recipientName}},\n\nGreat news! Your guest post on {{domain}} is now live and our system has verified the target backlink.\n\n- Published Article URL: {{publishedUrl}}\n- Target URL: {{targetUrl}}\n- Anchor Text: {{anchorText}}\n\nWe have also prepared your PDF Delivery Report. Thank you for partnering with us!\n\nBest regards,\n{{businessName}}`,
  },
};

export function EmailAssistantModule({
  outreachList,
  websites,
  clients,
  orders,
  businessName,
  onNotify,
}: EmailAssistantProps) {
  const [category, setCategory] = useState<OutreachTemplateCategory>('Publisher Outreach');
  const [recipientName, setRecipientName] = useState('Editorial Team');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [relatedDomainOrOrder, setRelatedDomainOrOrder] = useState('example.com');
  const [subject, setSubject] = useState(
    EMAIL_TEMPLATES['Publisher Outreach'].subject.replace('{{domain}}', 'example.com')
  );
  const [body, setBody] = useState(
    EMAIL_TEMPLATES['Publisher Outreach'].body
      .replace(/\{\{recipientName\}\}/g, 'Editorial Team')
      .replace(/\{\{domain\}\}/g, 'example.com')
      .replace(/\{\{businessName\}\}/g, businessName)
  );
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const applyTemplate = (
    cat: OutreachTemplateCategory,
    rName = recipientName,
    dom = relatedDomainOrOrder,
    ord?: OrderRecord
  ) => {
    setCategory(cat);
    const raw = EMAIL_TEMPLATES[cat];
    const replacedSubject = raw.subject
      .replace(/\{\{domain\}\}/g, dom || 'Publisher Site')
      .replace(/\{\{orderRef\}\}/g, ord?.orderNumber || 'ORD-REF');
    const replacedBody = raw.body
      .replace(/\{\{recipientName\}\}/g, rName || 'there')
      .replace(/\{\{domain\}\}/g, dom || 'Publisher Site')
      .replace(/\{\{businessName\}\}/g, businessName || 'GuestPilot AI')
      .replace(/\{\{orderRef\}\}/g, ord?.orderNumber || 'ORD-REF')
      .replace(/\{\{targetUrl\}\}/g, ord?.targetUrl || '[Target URL]')
      .replace(/\{\{anchorText\}\}/g, ord?.anchorText || '[Anchor Text]')
      .replace(/\{\{publishedUrl\}\}/g, ord?.publicationUrl || '[Published URL]');
    setSubject(replacedSubject);
    setBody(replacedBody);
  };

  const handleCopyEmail = async () => {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    onNotify('Copied subject and email body to clipboard.', 'success');
  };

  const handleSaveDraft = async (
    statusOverride: OutreachRecord['status'] = 'Draft Saved'
  ) => {
    const user = auth.currentUser;
    if (!user) return;

    if (!subject.trim() || !body.trim()) {
      onNotify('Subject and email body are required.', 'error');
      return;
    }

    const payload = {
      ownerId: user.uid,
      templateCategory: category,
      recipientName: recipientName.trim().slice(0, 150),
      recipientEmail: recipientEmail.trim().slice(0, 254),
      relatedWebsiteOrOrder: relatedDomainOrOrder.trim().slice(0, 253),
      subject: subject.trim().slice(0, 300),
      body: body.trim().slice(0, 5000),
      status: statusOverride,
    };

    setIsSaving(true);
    try {
      if (editingDraftId) {
        await updateDoc(doc(db, 'outreach', editingDraftId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        await recordActivityLog(
          'Email Assistant',
          `Updated Outreach (${statusOverride})`,
          editingDraftId,
          `${category} to ${payload.recipientEmail || payload.recipientName}`
        );
        onNotify(`Updated outreach draft (${statusOverride}).`, 'success');
      } else {
        const newId = generateSafeId('out');
        await setDoc(doc(collection(db, 'outreach'), newId), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setEditingDraftId(newId);
        await recordActivityLog(
          'Email Assistant',
          `Saved Outreach (${statusOverride})`,
          newId,
          `${category} to ${payload.recipientEmail || payload.recipientName}`
        );
        onNotify(`Saved outreach record as "${statusOverride}".`, 'success');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'outreach');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenMailto = async () => {
    await handleSaveDraft('Opened in Mail Client');
    const mailtoUrl = `mailto:${encodeURIComponent(
      recipientEmail.trim()
    )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
    onNotify(
      'Opened default email client. Click "Mark Confirmed Sent" only after you send the email.',
      'info'
    );
  };

  const handleDeleteOutreach = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'outreach', id));
      if (editingDraftId === id) setEditingDraftId(null);
      onNotify('Deleted outreach draft.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `outreach/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-5">
        <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
          Outreach & Client Email Assistant
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Generate individual, context-aware drafts for publishers and clients. Never marks an email as sent until you explicitly confirm sending.
        </p>
      </div>

      {/* Template Selector */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(EMAIL_TEMPLATES) as OutreachTemplateCategory[]).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => applyTemplate(cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              category === cat
                ? 'bg-emerald-500 text-zinc-950 border-emerald-500'
                : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Composer */}
        <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Quick-Fill from Website or Order
              </label>
              <select
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith('web:')) {
                    const site = websites.find((w) => w.id === val.slice(4));
                    if (site) {
                      setRecipientName(site.publisherName || 'Editorial Team');
                      setRecipientEmail(site.contactEmail || '');
                      setRelatedDomainOrOrder(site.domain);
                      applyTemplate(
                        category,
                        site.publisherName || 'Editorial Team',
                        site.domain
                      );
                    }
                  } else if (val.startsWith('ord:')) {
                    const ord = orders.find((o) => o.id === val.slice(4));
                    if (ord) {
                      const client = clients.find((c) => c.id === ord.clientId);
                      setRecipientName(ord.clientName);
                      setRecipientEmail(client?.email || '');
                      setRelatedDomainOrOrder(ord.websiteDomain);
                      applyTemplate(category, ord.clientName, ord.websiteDomain, ord);
                    }
                  }
                }}
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200"
              >
                <option value="">-- Select Website or Order to Auto-Fill --</option>
                <optgroup label="Publisher Websites">
                  {websites.map((w) => (
                    <option key={w.id} value={`web:${w.id}`}>
                      Website: {w.domain} ({w.contactEmail || 'No email'})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Active Orders">
                  {orders.map((o) => (
                    <option key={o.id} value={`ord:${o.id}`}>
                      Order {o.orderNumber}: {o.clientName} → {o.websiteDomain}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Related Domain or Order Ref
              </label>
              <input
                type="text"
                value={relatedDomainOrOrder}
                onChange={(e) => setRelatedDomainOrOrder(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Recipient Name
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Recipient Email
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="editor@publisher.com"
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Email Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Email Draft Body
            </label>
            <textarea
              rows={9}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2.5 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono leading-relaxed"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyEmail}
                className="px-3.5 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg inline-flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5 text-emerald-400" />
                Copy Email
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveDraft('Draft Saved')}
                className="px-3.5 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={handleOpenMailto}
                className="px-4 py-2 text-xs font-medium bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg inline-flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" />
                Open in Email Client (mailto)
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleSaveDraft('Confirmed Sent')}
              className="px-3 py-2 text-xs font-medium text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Mark Confirmed Sent
            </button>
          </div>
        </div>

        {/* Saved Outreach History */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-3">
            <h3 className="text-sm font-semibold text-zinc-100">
              Saved Drafts & Outreach Log ({outreachList.length})
            </h3>
            {editingDraftId && (
              <button
                type="button"
                onClick={() => setEditingDraftId(null)}
                className="text-[11px] text-emerald-400 hover:underline"
              >
                + New Draft
              </button>
            )}
          </div>

          {outreachList.length === 0 ? (
            <p className="text-xs text-zinc-500 py-8 text-center">
              No outreach drafts saved yet.
            </p>
          ) : (
            <div className="space-y-2.5 overflow-y-auto max-h-[420px] pr-1">
              {outreachList.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-200 truncate">
                      {item.subject}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteOutreach(item.id)}
                      className="text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {item.templateCategory} · To: {item.recipientEmail || item.recipientName}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span
                      className={`text-[11px] font-medium ${
                        item.status === 'Confirmed Sent'
                          ? 'text-emerald-400'
                          : item.status === 'Opened in Mail Client'
                          ? 'text-amber-400'
                          : 'text-zinc-400'
                      }`}
                    >
                      {item.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDraftId(item.id);
                        setCategory(item.templateCategory);
                        setRecipientName(item.recipientName);
                        setRecipientEmail(item.recipientEmail);
                        setRelatedDomainOrOrder(item.relatedWebsiteOrOrder);
                        setSubject(item.subject);
                        setBody(item.body);
                      }}
                      className="text-[11px] text-emerald-400 hover:underline"
                    >
                      Load Draft
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 * BACKLINK VERIFICATION & DELIVERY REPORTS MODULE (SECTIONS 12 & 13)
 * ============================================================================ */

interface VerificationAndDeliveriesProps {
  deliveries: DeliveryRecord[];
  orders: OrderRecord[];
  clients: ClientRecord[];
  settings: SettingRecord | null;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function BacklinkVerificationAndReportsModule({
  deliveries,
  orders,
  clients,
  settings,
  onNotify,
}: VerificationAndDeliveriesProps) {
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [publisherWebsite, setPublisherWebsite] = useState('');
  const [publishedUrl, setPublishedUrl] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [expectedAnchorText, setExpectedAnchorText] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const [isVerifying, setIsVerifying] = useState(false);
  const [lastResult, setLastResult] = useState<{
    pageAccessible: boolean;
    httpStatus: number;
    targetLinkFound: boolean;
    anchorMatched: boolean;
    relAttribute: string;
    backlinkType: string;
    verificationStatus: DeliveryRecord['verificationStatus'];
    verifiedAt: string;
    message: string;
  } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    const ord = orders.find((o) => o.id === orderId);
    if (ord) {
      const client = clients.find((c) => c.id === ord.clientId);
      setClientName(ord.clientName);
      setClientEmail(client?.email || '');
      setPublisherWebsite(ord.websiteDomain);
      setPublishedUrl(ord.publicationUrl || '');
      setTargetUrl(ord.targetUrl || '');
      setExpectedAnchorText(ord.anchorText || '');
      if (ord.deliveryDate) setDeliveryDate(ord.deliveryDate);
    }
  };

  const handleRunVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publishedUrl.trim() || !targetUrl.trim()) {
      onNotify('Both Published Article URL and Target Website URL are required.', 'error');
      return;
    }

    setIsVerifying(true);
    try {
      const res = await fetch('/api/verify-backlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publishedUrl: publishedUrl.trim(),
          targetUrl: targetUrl.trim(),
          expectedAnchorText: expectedAnchorText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data.error || 'Verification request failed.', 'error');
        return;
      }

      const verifiedTimestamp = data.verifiedAt || new Date().toISOString();
      const resultObj = {
        pageAccessible: Boolean(data.pageAccessible),
        httpStatus: Number(data.httpStatus) || 0,
        targetLinkFound: Boolean(data.targetLinkFound),
        anchorMatched: Boolean(data.anchorMatched),
        relAttribute: String(data.relAttribute || 'Unknown'),
        backlinkType: String(data.backlinkType || 'Unknown'),
        verificationStatus: (data.verificationStatus ||
          'Verification Inconclusive') as DeliveryRecord['verificationStatus'],
        verifiedAt: verifiedTimestamp,
        message: String(data.message || ''),
      };
      setLastResult(resultObj);

      // Save to Firestore deliveries collection and update linked order if selected
      const user = auth.currentUser;
      if (user) {
        const linkedOrder = orders.find((o) => o.id === selectedOrderId);
        const delivId = generateSafeId('del');
        await setDoc(doc(collection(db, 'deliveries'), delivId), {
          ownerId: user.uid,
          orderId: selectedOrderId || '',
          orderNumber: linkedOrder?.orderNumber || `VER-${Date.now().toString().slice(-5)}`,
          clientName: (clientName.trim() || linkedOrder?.clientName || 'Direct Check').slice(
            0,
            150
          ),
          clientEmail: clientEmail.trim().slice(0, 254),
          publisherWebsite: (
            publisherWebsite.trim() ||
            linkedOrder?.websiteDomain ||
            publishedUrl.trim()
          ).slice(0, 253),
          publishedArticleUrl: publishedUrl.trim().slice(0, 500),
          targetUrl: targetUrl.trim().slice(0, 500),
          anchorText: expectedAnchorText.trim().slice(0, 250),
          backlinkType: resultObj.backlinkType.slice(0, 60),
          relAttribute: resultObj.relAttribute.slice(0, 100),
          httpStatus: resultObj.httpStatus,
          pageAccessible: resultObj.pageAccessible,
          targetLinkFound: resultObj.targetLinkFound,
          anchorMatched: resultObj.anchorMatched,
          verificationStatus: resultObj.verificationStatus,
          verifiedAt: verifiedTimestamp.slice(0, 50),
          orderDate: orderDate.slice(0, 50),
          deliveryDate: deliveryDate.slice(0, 50),
          notes: (notes.trim() || resultObj.message).slice(0, 2000),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (linkedOrder) {
          const mappedOrderVerification: OrderRecord['backlinkVerificationStatus'] =
            resultObj.verificationStatus === 'Verified'
              ? 'Verified'
              : resultObj.verificationStatus === 'Link Missing'
              ? 'Link Missing'
              : 'Verification Inconclusive';
          await updateDoc(doc(db, 'orders', linkedOrder.id), {
            publicationUrl: publishedUrl.trim().slice(0, 500),
            backlinkVerificationStatus: mappedOrderVerification,
            backlinkRelAttribute: resultObj.relAttribute.slice(0, 100),
            lastVerifiedAt: verifiedTimestamp.slice(0, 50),
            status:
              resultObj.verificationStatus === 'Verified'
                ? 'BACKLINK VERIFIED'
                : linkedOrder.status,
            updatedAt: serverTimestamp(),
          });
        }

        await recordActivityLog(
          'Backlink Verification',
          `Verification: ${resultObj.verificationStatus}`,
          delivId,
          `Checked ${publishedUrl.trim()} → ${targetUrl.trim()} (${resultObj.verificationStatus})`
        );
      }

      onNotify(
        `Verification result: ${resultObj.verificationStatus}. Delivery record saved.`,
        resultObj.verificationStatus === 'Verified' ? 'success' : 'info'
      );
    } catch (error) {
      onNotify(
        error instanceof Error ? error.message : 'Backlink verification failed.',
        'error'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDeleteDelivery = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'deliveries', id));
      setDeleteConfirmId(null);
      onNotify('Deleted delivery report.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `deliveries/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-5">
        <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
          Live Backlink Verification & PDF Delivery Reports
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          SSRF-hardened server-side HTML inspector that verifies live accessibility, target link presence, anchor text, and rel attributes (dofollow, nofollow, sponsored, ugc).
        </p>
      </div>

      {/* Verification Form */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Run Live Backlink Verification & Generate Delivery Record</span>
        </div>

        <form onSubmit={handleRunVerification} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Link to Existing Order (Optional)
              </label>
              <select
                value={selectedOrderId}
                onChange={(e) => handleSelectOrder(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200"
              >
                <option value="">-- Standalone Check or Select Order --</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} — {o.clientName} ({o.websiteDomain})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Client Name (For PDF Report)
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client or Agency Name"
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Publisher Domain
              </label>
              <input
                type="text"
                value={publisherWebsite}
                onChange={(e) => setPublisherWebsite(e.target.value)}
                placeholder="publisher.com"
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Published Article URL *
              </label>
              <input
                type="url"
                required
                value={publishedUrl}
                onChange={(e) => setPublishedUrl(e.target.value)}
                placeholder="https://publisher.com/blog/article-slug"
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Target Website URL *
              </label>
              <input
                type="text"
                required
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://clientdomain.com/target-page"
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Expected Anchor Text
              </label>
              <input
                type="text"
                value={expectedAnchorText}
                onChange={(e) => setExpectedAnchorText(e.target.value)}
                placeholder="e.g. enterprise SEO software"
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Order Date
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Delivery Date
              </label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={isVerifying}
                className="w-full px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors disabled:opacity-50"
              >
                {isVerifying
                  ? 'Inspecting Live HTML & Verifying...'
                  : 'Verify Live Backlink & Save Report'}
              </button>
            </div>
          </div>
        </form>

        {/* Live Verification Outcome Banner */}
        {lastResult && (
          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {lastResult.verificationStatus === 'Verified' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                )}
                <span className="text-sm font-semibold text-zinc-100">
                  Outcome: {lastResult.verificationStatus}
                </span>
              </div>
              <span className="text-xs font-mono text-zinc-400">
                Checked at: {lastResult.verifiedAt.slice(0, 19).replace('T', ' ')} UTC
              </span>
            </div>
            <p className="text-xs text-zinc-300">{lastResult.message}</p>
            <div className="flex flex-wrap gap-4 pt-1 text-xs font-mono text-zinc-400">
              <span>HTTP Status: {lastResult.httpStatus || 'N/A'}</span>
              <span>·</span>
              <span>Accessible: {lastResult.pageAccessible ? 'Yes' : 'No'}</span>
              <span>·</span>
              <span>Target Link Found: {lastResult.targetLinkFound ? 'Yes' : 'No'}</span>
              <span>·</span>
              <span>Anchor Match: {lastResult.anchorMatched ? 'Yes' : 'No'}</span>
              <span>·</span>
              <span>rel Attribute: {lastResult.relAttribute}</span>
              <span>·</span>
              <span>Link Type: {lastResult.backlinkType}</span>
            </div>
          </div>
        )}
      </div>

      {/* Saved Delivery Reports Table */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">
            Verified Delivery Reports ({deliveries.length})
          </h3>
          <span className="text-xs text-zinc-500">
            Export professional client PDF reports
          </span>
        </div>

        {deliveries.length === 0 ? (
          <div className="p-10 text-center text-xs text-zinc-500">
            No delivery reports recorded yet. Run a backlink verification above to create a report.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-medium text-zinc-400 bg-zinc-950/60">
                  <th className="py-3 px-4">Order Ref · Client</th>
                  <th className="py-3 px-3">Published URL</th>
                  <th className="py-3 px-3">Target URL · Anchor</th>
                  <th className="py-3 px-3">Type · rel Attr</th>
                  <th className="py-3 px-3">Verification Status</th>
                  <th className="py-3 px-3">Verified Time</th>
                  <th className="py-3 px-4 text-right">PDF Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 text-xs">
                {deliveries.map((del) => (
                  <tr key={del.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-mono font-medium text-zinc-100">
                        {del.orderNumber}
                      </div>
                      <div className="text-[11px] text-zinc-400">{del.clientName}</div>
                    </td>
                    <td className="py-3 px-3 max-w-[200px]">
                      <a
                        href={del.publishedArticleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400 hover:underline truncate block"
                        title={del.publishedArticleUrl}
                      >
                        {del.publisherWebsite}
                      </a>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        HTTP {del.httpStatus || 'N/A'}
                      </div>
                    </td>
                    <td className="py-3 px-3 max-w-[200px]">
                      <div className="truncate text-zinc-300" title={del.targetUrl}>
                        {del.targetUrl}
                      </div>
                      <div className="text-[11px] text-zinc-500 truncate">
                        Anchor: {del.anchorText || '—'}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-zinc-200">{del.backlinkType}</div>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        rel: {del.relAttribute}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={
                          del.verificationStatus === 'Verified'
                            ? 'text-emerald-400 font-medium'
                            : del.verificationStatus === 'Verification Inconclusive'
                            ? 'text-amber-400 font-medium'
                            : 'text-red-400 font-medium'
                        }
                      >
                        {del.verificationStatus}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-zinc-400">
                      {del.verifiedAt ? del.verifiedAt.slice(0, 16).replace('T', ' ') : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            generateDeliveryReportPdf(
                              del,
                              settings?.businessName || 'GuestPilot AI'
                            )
                          }
                          className="px-2.5 py-1 text-[11px] font-medium bg-emerald-500 text-zinc-950 hover:bg-emerald-400 rounded inline-flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          PDF Report
                        </button>
                        {deleteConfirmId === del.id ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteDelivery(del.id)}
                            className="px-2 py-1 text-[11px] bg-red-600 text-white rounded"
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(del.id)}
                            className="p-1.5 text-zinc-400 hover:text-red-400 rounded hover:bg-zinc-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
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
