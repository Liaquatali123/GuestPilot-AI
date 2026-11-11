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
  getActiveAdminUser,
  OperationType,
  handleFirestoreError,
  generateSafeId,
  recordActivityLog,
} from '@/lib/firebase';
import { getStoredCollection, saveStoredCollection } from '@/lib/local-db';
import {
  ClientRecord,
  LeadRecord,
  OrderRecord,
  PaymentRecord,
  WebsiteRecord,
  SupplierRecord,
  SettingRecord,
  calculatePricingMetrics,
  formatCurrency,
} from '@/lib/types';
import { generateFinancialDocumentPdf } from '@/lib/pdf-generator';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  UserCheck,
  History,
  FileText,
  Calculator,
  Download,
  CheckCircle2,
  X,
} from 'lucide-react';

interface CrmModuleProps {
  clients: ClientRecord[];
  leads: LeadRecord[];
  orders: OrderRecord[];
  payments: PaymentRecord[];
  currency: string;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const INITIAL_CLIENT_FORM = {
  clientName: '',
  email: '',
  company: '',
  country: 'United States',
  website: '',
  requiredNiche: '',
  budget: '',
  requirements: '',
  leadStatus: 'Active Client' as ClientRecord['leadStatus'],
  notes: '',
};

const INITIAL_LEAD_FORM = {
  prospectName: '',
  email: '',
  company: '',
  country: 'United States',
  website: '',
  requiredNiche: '',
  estimatedBudget: '',
  source: 'Direct Inbound',
  status: 'New' as LeadRecord['status'],
  requirements: '',
  notes: '',
};

export function ClientCrmModule({
  clients,
  leads,
  orders,
  payments,
  currency,
  onNotify,
}: CrmModuleProps) {
  const [activeTab, setActiveTab] = useState<'clients' | 'leads'>('clients');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [clientForm, setClientForm] = useState(INITIAL_CLIENT_FORM);

  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadRecord | null>(null);
  const [leadForm, setLeadForm] = useState(INITIAL_LEAD_FORM);

  const [selectedHistoryClient, setSelectedHistoryClient] = useState<ClientRecord | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (statusFilter !== 'ALL' && c.leadStatus !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.clientName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q) ||
          c.requiredNiche.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [clients, searchQuery, statusFilter]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          l.prospectName.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          l.company.toLowerCase().includes(q) ||
          l.requiredNiche.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [leads, searchQuery, statusFilter]);

  const openAddClient = () => {
    setEditingClient(null);
    setClientForm(INITIAL_CLIENT_FORM);
    setIsClientModalOpen(true);
  };

  const openEditClient = (c: ClientRecord) => {
    setEditingClient(c);
    setClientForm({
      clientName: c.clientName,
      email: c.email,
      company: c.company,
      country: c.country,
      website: c.website,
      requiredNiche: c.requiredNiche,
      budget: String(c.budget),
      requirements: c.requirements,
      leadStatus: c.leadStatus,
      notes: c.notes,
    });
    setIsClientModalOpen(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = getActiveAdminUser();

    if (!clientForm.clientName.trim() || !clientForm.email.trim()) {
      onNotify('Client name and email are required.', 'error');
      return;
    }

    const payload = {
      ownerId: user.uid,
      clientName: clientForm.clientName.trim().slice(0, 150),
      email: clientForm.email.trim().slice(0, 254),
      company: clientForm.company.trim().slice(0, 150),
      country: (clientForm.country.trim() || 'Unknown').slice(0, 100),
      website: clientForm.website.trim().slice(0, 500),
      requiredNiche: (clientForm.requiredNiche.trim() || 'General').slice(0, 150),
      budget: Math.min(10000000, Math.max(0, Number(clientForm.budget) || 0)),
      requirements: clientForm.requirements.trim().slice(0, 2000),
      leadStatus: clientForm.leadStatus,
      notes: clientForm.notes.trim().slice(0, 2000),
    };

    setIsSaving(true);
    const targetId = editingClient ? editingClient.id : generateSafeId('cli');

    // 1. Immediately update local storage
    const currentList = getStoredCollection<ClientRecord>('clients', []);
    const updatedRecord: ClientRecord = {
      id: targetId,
      ...payload,
    };
    const updatedList = editingClient
      ? currentList.map((c) => (c.id === targetId ? { ...c, ...payload } : c))
      : [updatedRecord, ...currentList];
    saveStoredCollection('clients', updatedList);
    window.dispatchEvent(new Event('guestpilot-db-update'));

    try {
      if (editingClient) {
        await updateDoc(doc(db, 'clients', targetId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        await recordActivityLog(
          'Clients',
          'Updated Client',
          targetId,
          `Updated client ${payload.clientName}`
        );
        onNotify(`Updated client ${payload.clientName}.`, 'success');
      } else {
        await setDoc(doc(collection(db, 'clients'), targetId), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await recordActivityLog(
          'Clients',
          'Created Client',
          targetId,
          `Added client ${payload.clientName}`
        );
        onNotify(`Added client ${payload.clientName}.`, 'success');
      }
      setIsClientModalOpen(false);
    } catch (error) {
      handleFirestoreError(
        error,
        editingClient ? OperationType.UPDATE : OperationType.CREATE,
        'clients'
      );
      setIsClientModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = getActiveAdminUser();

    if (!leadForm.prospectName.trim()) {
      onNotify('Prospect name is required.', 'error');
      return;
    }

    const payload = {
      ownerId: user.uid,
      prospectName: leadForm.prospectName.trim().slice(0, 150),
      email: leadForm.email.trim().slice(0, 254),
      company: leadForm.company.trim().slice(0, 150),
      country: (leadForm.country.trim() || 'Unknown').slice(0, 100),
      website: leadForm.website.trim().slice(0, 500),
      requiredNiche: (leadForm.requiredNiche.trim() || 'General').slice(0, 150),
      estimatedBudget: Math.min(
        10000000,
        Math.max(0, Number(leadForm.estimatedBudget) || 0)
      ),
      source: (leadForm.source.trim() || 'Direct').slice(0, 100),
      status: leadForm.status,
      requirements: leadForm.requirements.trim().slice(0, 2000),
      notes: leadForm.notes.trim().slice(0, 2000),
    };

    setIsSaving(true);
    const targetId = editingLead ? editingLead.id : generateSafeId('lead');

    // 1. Immediately update local storage
    const currentList = getStoredCollection<LeadRecord>('leads', []);
    const updatedRecord: LeadRecord = {
      id: targetId,
      ...payload,
    };
    const updatedList = editingLead
      ? currentList.map((l) => (l.id === targetId ? { ...l, ...payload } : l))
      : [updatedRecord, ...currentList];
    saveStoredCollection('leads', updatedList);
    window.dispatchEvent(new Event('guestpilot-db-update'));

    try {
      if (editingLead) {
        await updateDoc(doc(db, 'leads', targetId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        await recordActivityLog(
          'Leads',
          'Updated Lead',
          targetId,
          `Updated lead ${payload.prospectName}`
        );
        onNotify(`Updated lead ${payload.prospectName}.`, 'success');
      } else {
        await setDoc(doc(collection(db, 'leads'), targetId), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await recordActivityLog(
          'Leads',
          'Created Lead',
          targetId,
          `Added new lead ${payload.prospectName}`
        );
        onNotify(`Added lead ${payload.prospectName}.`, 'success');
      }
      setIsLeadModalOpen(false);
    } catch (error) {
      handleFirestoreError(
        error,
        editingLead ? OperationType.UPDATE : OperationType.CREATE,
        'leads'
      );
      setIsLeadModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConvertLeadToClient = async (lead: LeadRecord) => {
    const user = getActiveAdminUser();
    const newClientId = generateSafeId('cli');

    const newClient: ClientRecord = {
      id: newClientId,
      ownerId: user.uid,
      clientName: lead.prospectName,
      email: lead.email || 'pending@client.com',
      company: lead.company,
      country: lead.country,
      website: lead.website,
      requiredNiche: lead.requiredNiche,
      budget: lead.estimatedBudget,
      requirements: lead.requirements,
      leadStatus: 'Active Client',
      notes: `Converted from Lead (${lead.source}). ${lead.notes}`.slice(0, 2000),
    };

    // 1. Immediately update local storage
    const clientsList = getStoredCollection<ClientRecord>('clients', []);
    saveStoredCollection('clients', [newClient, ...clientsList]);

    const leadsList = getStoredCollection<LeadRecord>('leads', []);
    saveStoredCollection(
      'leads',
      leadsList.map((l) => (l.id === lead.id ? { ...l, status: 'Converted' } : l))
    );
    window.dispatchEvent(new Event('guestpilot-db-update'));

    try {
      await setDoc(doc(collection(db, 'clients'), newClientId), {
        ...newClient,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'leads', lead.id), {
        status: 'Converted',
        updatedAt: serverTimestamp(),
      });
      await recordActivityLog(
        'Clients',
        'Converted Lead to Client',
        newClientId,
        `Converted prospect ${lead.prospectName} to active client`
      );
      onNotify(`Converted ${lead.prospectName} to an Active Client.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'clients');
    }
  };

  const handleDeleteRecord = async (collectionName: 'clients' | 'leads', id: string) => {
    // 1. Immediately update local storage
    if (collectionName === 'clients') {
      const list = getStoredCollection<ClientRecord>('clients', []);
      saveStoredCollection('clients', list.filter((c) => c.id !== id));
    } else {
      const list = getStoredCollection<LeadRecord>('leads', []);
      saveStoredCollection('leads', list.filter((l) => l.id !== id));
    }
    window.dispatchEvent(new Event('guestpilot-db-update'));

    try {
      await deleteDoc(doc(db, collectionName, id));
      await recordActivityLog(
        collectionName === 'clients' ? 'Clients' : 'Leads',
        `Deleted ${collectionName === 'clients' ? 'Client' : 'Lead'}`,
        id,
        `Deleted record ${id}`
      );
      setDeleteConfirmId(null);
      onNotify('Record deleted.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${collectionName}/${id}`);
      setDeleteConfirmId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
            Client CRM & Lead Pipeline
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Manage active agency/SEO clients, inbound prospects, link requirements, and complete order history.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setActiveTab('clients');
                setStatusFilter('ALL');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'clients'
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              Clients ({clients.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('leads');
                setStatusFilter('ALL');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'leads'
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
            >
              Leads ({leads.length})
            </button>
          </div>

          {activeTab === 'clients' ? (
            <button
              type="button"
              onClick={openAddClient}
              className="px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add Client
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingLead(null);
                setLeadForm(INITIAL_LEAD_FORM);
                setIsLeadModalOpen(true);
              }}
              className="px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add Lead
            </button>
          )}
        </div>
      </div>

      {/* Search & Status Filter */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, company, email, or required niche..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200"
        >
          <option value="ALL">All Statuses</option>
          {activeTab === 'clients' ? (
            <>
              <option value="New Lead">New Lead</option>
              <option value="Contacted">Contacted</option>
              <option value="Quotation Sent">Quotation Sent</option>
              <option value="Negotiating">Negotiating</option>
              <option value="Active Client">Active Client</option>
              <option value="Inactive">Inactive</option>
            </>
          ) : (
            <>
              <option value="New">New</option>
              <option value="Contacted">Contacted</option>
              <option value="Qualified">Qualified</option>
              <option value="Quotation Sent">Quotation Sent</option>
              <option value="Converted">Converted</option>
              <option value="Lost">Lost</option>
            </>
          )}
        </select>
      </div>

      {/* Clients Table */}
      {activeTab === 'clients' ? (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
          {filteredClients.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-zinc-300">No clients recorded yet</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                Add your guest posting clients to track their target websites, niche requirements, budgets, and historical orders.
              </p>
              <button
                type="button"
                onClick={openAddClient}
                className="mt-4 px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add First Client
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-[11px] font-medium text-zinc-400 bg-zinc-950/60">
                    <th className="py-3 px-4">Client & Company</th>
                    <th className="py-3 px-3">Website · Required Niche</th>
                    <th className="py-3 px-3 text-right">Monthly Budget</th>
                    <th className="py-3 px-3">Requirements</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Orders</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70 text-xs">
                  {filteredClients.map((client) => {
                    const clientOrders = orders.filter(
                      (o) =>
                        o.clientId === client.id ||
                        o.clientName.toLowerCase() === client.clientName.toLowerCase()
                    );
                    return (
                      <tr key={client.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-medium text-zinc-100">{client.clientName}</div>
                          <div className="text-[11px] text-zinc-500">
                            {client.company ? `${client.company} · ` : ''}
                            {client.email} · {client.country}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-zinc-300">
                          <div>{client.website || '—'}</div>
                          <div className="text-[11px] text-zinc-500">{client.requiredNiche}</div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-400 font-medium">
                          {formatCurrency(client.budget, currency)}
                        </td>
                        <td className="py-3 px-3 text-zinc-400 max-w-xs truncate">
                          {client.requirements || 'Standard Dofollow'}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={
                              client.leadStatus === 'Active Client'
                                ? 'text-emerald-400 font-medium'
                                : 'text-zinc-300'
                            }
                          >
                            {client.leadStatus}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          <button
                            type="button"
                            onClick={() => setSelectedHistoryClient(client)}
                            className="text-emerald-400 hover:underline inline-flex items-center gap-1"
                          >
                            <History className="w-3.5 h-3.5" />
                            {clientOrders.length} orders
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {deleteConfirmId === client.id ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleDeleteRecord('clients', client.id)}
                                className="px-2 py-1 text-[11px] font-medium bg-red-600 text-white rounded"
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
                                onClick={() => setSelectedHistoryClient(client)}
                                className="p-1.5 text-zinc-400 hover:text-emerald-400 rounded-lg hover:bg-zinc-800"
                                title="View Client History"
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditClient(client)}
                                className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800"
                                title="Edit Client"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(client.id)}
                                className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-zinc-800"
                                title="Delete Client"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Leads Table */
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
          {filteredLeads.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-zinc-300">No leads in pipeline</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                Log prospective guest post buyers and convert qualified leads into active clients with one click.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-[11px] font-medium text-zinc-400 bg-zinc-950/60">
                    <th className="py-3 px-4">Prospect & Company</th>
                    <th className="py-3 px-3">Target Site · Niche</th>
                    <th className="py-3 px-3 text-right">Est. Budget</th>
                    <th className="py-3 px-3">Source</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70 text-xs">
                  {filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-zinc-100">{lead.prospectName}</div>
                        <div className="text-[11px] text-zinc-500">
                          {lead.company ? `${lead.company} · ` : ''}
                          {lead.email || 'No email'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-zinc-300">
                        <div>{lead.website || '—'}</div>
                        <div className="text-[11px] text-zinc-500">{lead.requiredNiche}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-400">
                        {formatCurrency(lead.estimatedBudget, currency)}
                      </td>
                      <td className="py-3 px-3 text-zinc-400">{lead.source}</td>
                      <td className="py-3 px-3">
                        <span
                          className={
                            lead.status === 'Converted'
                              ? 'text-emerald-400 font-medium'
                              : lead.status === 'New'
                              ? 'text-amber-400 font-medium'
                              : 'text-zinc-300'
                          }
                        >
                          {lead.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {lead.status !== 'Converted' && (
                            <button
                              type="button"
                              onClick={() => handleConvertLeadToClient(lead)}
                              className="px-2.5 py-1 text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/25 inline-flex items-center gap-1"
                              title="Convert Lead to Active Client"
                            >
                              <UserCheck className="w-3 h-3" />
                              Convert
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingLead(lead);
                              setLeadForm({
                                prospectName: lead.prospectName,
                                email: lead.email,
                                company: lead.company,
                                country: lead.country,
                                website: lead.website,
                                requiredNiche: lead.requiredNiche,
                                estimatedBudget: String(lead.estimatedBudget),
                                source: lead.source,
                                status: lead.status,
                                requirements: lead.requirements,
                                notes: lead.notes,
                              });
                              setIsLeadModalOpen(true);
                            }}
                            className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRecord('leads', lead.id)}
                            className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-zinc-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Client History Modal */}
      {selectedHistoryClient && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-3xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-100">
                  Complete Client History — {selectedHistoryClient.clientName}
                </h3>
                <p className="text-xs text-zinc-400">
                  {selectedHistoryClient.company} · {selectedHistoryClient.email} · Target Niche:{' '}
                  {selectedHistoryClient.requiredNiche}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoryClient(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const clientOrders = orders.filter(
                (o) =>
                  o.clientId === selectedHistoryClient.id ||
                  o.clientName.toLowerCase() ===
                    selectedHistoryClient.clientName.toLowerCase()
              );
              const clientPayments = payments.filter(
                (p) =>
                  p.clientId === selectedHistoryClient.id ||
                  p.clientName.toLowerCase() ===
                    selectedHistoryClient.clientName.toLowerCase()
              );
              const totalClientSpend = clientOrders
                .filter((o) => o.paymentStatus === 'Paid')
                .reduce((acc, o) => acc + o.clientPrice, 0);

              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 bg-zinc-950 p-3.5 rounded-lg border border-zinc-800">
                    <div>
                      <div className="text-[11px] text-zinc-500">Total Orders</div>
                      <div className="text-base font-semibold font-mono tabular-nums text-zinc-100">
                        {clientOrders.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-zinc-500">Paid Spend</div>
                      <div className="text-base font-semibold font-mono tabular-nums text-emerald-400">
                        {formatCurrency(totalClientSpend, currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-zinc-500">Quotations / Invoices</div>
                      <div className="text-base font-semibold font-mono tabular-nums text-zinc-100">
                        {clientPayments.length}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-zinc-300 mb-2">
                      Orders ({clientOrders.length})
                    </h4>
                    {clientOrders.length === 0 ? (
                      <p className="text-xs text-zinc-500">No orders placed for this client yet.</p>
                    ) : (
                      <div className="border border-zinc-800 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-zinc-950 text-zinc-400 text-[11px]">
                            <tr>
                              <th className="py-2 px-3">Order #</th>
                              <th className="py-2 px-3">Publisher Domain</th>
                              <th className="py-2 px-3">Workflow Stage</th>
                              <th className="py-2 px-3 text-right">Price</th>
                              <th className="py-2 px-3">Payment</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800">
                            {clientOrders.map((ord) => (
                              <tr key={ord.id}>
                                <td className="py-2 px-3 font-mono">{ord.orderNumber}</td>
                                <td className="py-2 px-3">{ord.websiteDomain}</td>
                                <td className="py-2 px-3 text-emerald-400">{ord.status}</td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums">
                                  {formatCurrency(ord.clientPrice, currency)}
                                </td>
                                <td className="py-2 px-3">{ord.paymentStatus}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Add/Edit Client Modal */}
      {isClientModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-xl w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-semibold text-zinc-100">
                {editingClient ? 'Edit Client' : 'Add New Client'}
              </h3>
              <button
                type="button"
                onClick={() => setIsClientModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveClient} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={clientForm.clientName}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, clientName: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={clientForm.email}
                    onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Company / Agency
                  </label>
                  <input
                    type="text"
                    value={clientForm.company}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, company: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    value={clientForm.country}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, country: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Client Target Website
                  </label>
                  <input
                    type="text"
                    value={clientForm.website}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, website: e.target.value })
                    }
                    placeholder="https://clientbrand.com"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Required Niche
                  </label>
                  <input
                    type="text"
                    value={clientForm.requiredNiche}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, requiredNiche: e.target.value })
                    }
                    placeholder="SaaS, FinTech, Crypto..."
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Budget ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={clientForm.budget}
                    onChange={(e) =>
                      setClientForm({ ...clientForm, budget: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Status
                  </label>
                  <select
                    value={clientForm.leadStatus}
                    onChange={(e) =>
                      setClientForm({
                        ...clientForm,
                        leadStatus: e.target.value as ClientRecord['leadStatus'],
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  >
                    <option value="New Lead">New Lead</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Quotation Sent">Quotation Sent</option>
                    <option value="Negotiating">Negotiating</option>
                    <option value="Active Client">Active Client</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  SEO & Link Requirements
                </label>
                <input
                  type="text"
                  value={clientForm.requirements}
                  onChange={(e) =>
                    setClientForm({ ...clientForm, requirements: e.target.value })
                  }
                  placeholder="e.g. DR 50+, Dofollow only, min 1,000 organic traffic"
                  className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={clientForm.notes}
                  onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsClientModalOpen(false)}
                  className="px-4 py-2 text-xs text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg"
                >
                  {isSaving ? 'Saving...' : 'Save Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Lead Modal */}
      {isLeadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-xl w-full p-6 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-semibold text-zinc-100">
                {editingLead ? 'Edit Lead' : 'Log New Lead'}
              </h3>
              <button
                type="button"
                onClick={() => setIsLeadModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveLead} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Prospect Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={leadForm.prospectName}
                    onChange={(e) =>
                      setLeadForm({ ...leadForm, prospectName: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={leadForm.email}
                    onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Company
                  </label>
                  <input
                    type="text"
                    value={leadForm.company}
                    onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Lead Source
                  </label>
                  <input
                    type="text"
                    value={leadForm.source}
                    onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })}
                    placeholder="LinkedIn, Cold Outreach, Referral..."
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Required Niche
                  </label>
                  <input
                    type="text"
                    value={leadForm.requiredNiche}
                    onChange={(e) =>
                      setLeadForm({ ...leadForm, requiredNiche: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Estimated Budget ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={leadForm.estimatedBudget}
                    onChange={(e) =>
                      setLeadForm({ ...leadForm, estimatedBudget: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsLeadModalOpen(false)}
                  className="px-4 py-2 text-xs text-zinc-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg"
                >
                  {isSaving ? 'Saving...' : 'Save Lead'}
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
 * AUTOMATIC PRICING & PROFIT CALCULATOR + QUOTATIONS / INVOICES (SECTION 9)
 * ============================================================================ */

interface PricingModuleProps {
  payments: PaymentRecord[];
  websites: WebsiteRecord[];
  suppliers: SupplierRecord[];
  clients: ClientRecord[];
  orders: OrderRecord[];
  settings: SettingRecord | null;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function PricingAndProfitModule({
  payments,
  websites,
  suppliers,
  clients,
  orders,
  settings,
  onNotify,
}: PricingModuleProps) {
  const currency = settings?.defaultCurrency || 'USD';

  const [selectedClientId, setSelectedClientId] = useState('');
  const [customClientName, setCustomClientName] = useState('');
  const [customClientEmail, setCustomClientEmail] = useState('');
  const [selectedWebsiteId, setSelectedWebsiteId] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [sellingPrice, setSellingPrice] = useState('250');
  const [wholesaleCost, setWholesaleCost] = useState('90');
  const [additionalExpenses, setAdditionalExpenses] = useState('15');
  const [dueDate, setDueDate] = useState(() =>
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const liveCalc = useMemo(() => {
    return calculatePricingMetrics(
      Number(sellingPrice) || 0,
      Number(wholesaleCost) || 0,
      Number(additionalExpenses) || 0
    );
  }, [sellingPrice, wholesaleCost, additionalExpenses]);

  // Separate Estimated Profit vs Actual Realized Profit
  const financialSummary = useMemo(() => {
    const paidInvoices = payments.filter(
      (p) => p.docType === 'Invoice' && p.status === 'Paid'
    );
    const unpaidAndQuotes = payments.filter(
      (p) =>
        (p.docType === 'Quotation' || p.docType === 'Invoice') &&
        p.status !== 'Paid' &&
        p.status !== 'Cancelled'
    );

    const actualRevenue = paidInvoices.reduce((acc, p) => acc + p.sellingPrice, 0);
    const actualProfit = paidInvoices.reduce((acc, p) => acc + p.estimatedProfit, 0);
    const estimatedPipelineRevenue = unpaidAndQuotes.reduce(
      (acc, p) => acc + p.sellingPrice,
      0
    );
    const estimatedPipelineProfit = unpaidAndQuotes.reduce(
      (acc, p) => acc + p.estimatedProfit,
      0
    );

    return {
      actualRevenue,
      actualProfit,
      estimatedPipelineRevenue,
      estimatedPipelineProfit,
      unpaidInvoicesCount: payments.filter(
        (p) => p.docType === 'Invoice' && p.status === 'Unpaid'
      ).length,
    };
  }, [payments]);

  const handleSelectWebsitePreset = (websiteId: string) => {
    setSelectedWebsiteId(websiteId);
    const found = websites.find((w) => w.id === websiteId);
    if (found) {
      setCustomDomain(found.domain);
      if (found.guestPostPrice > 0) {
        setWholesaleCost(String(found.guestPostPrice));
        setSellingPrice(String(Math.round(found.guestPostPrice * 1.8)));
      }
    }
  };

  const handleSelectClientPreset = (clientId: string) => {
    setSelectedClientId(clientId);
    const found = clients.find((c) => c.id === clientId);
    if (found) {
      setCustomClientName(found.clientName);
      setCustomClientEmail(found.email);
    }
  };

  const handleCreateDocument = async (docType: 'Quotation' | 'Invoice') => {
    const user = getActiveAdminUser();

    const clientName = customClientName.trim();
    if (!clientName) {
      onNotify('Please select or enter a Client Name before generating a document.', 'error');
      return;
    }

    const prefix = docType === 'Quotation' ? 'QT' : 'INV';
    const refNumber = `${prefix}-${Date.now().toString().slice(-6)}`;
    const newId = generateSafeId('pay');

    // IMPORTANT: Never mark an unpaid invoice as paid automatically!
    const initialStatus: PaymentRecord['status'] =
      docType === 'Quotation' ? 'Sent' : 'Unpaid';

    const payload = {
      ownerId: user.uid,
      referenceNumber: refNumber,
      docType,
      orderId: '',
      clientId: selectedClientId || '',
      clientName: clientName.slice(0, 150),
      clientEmail: customClientEmail.trim().slice(0, 254),
      websiteDomain: customDomain.trim().slice(0, 253),
      sellingPrice: Math.min(1000000, Math.max(0, Number(sellingPrice) || 0)),
      wholesaleCost: Math.min(1000000, Math.max(0, Number(wholesaleCost) || 0)),
      additionalExpenses: Math.min(1000000, Math.max(0, Number(additionalExpenses) || 0)),
      estimatedProfit: liveCalc.netProfit,
      profitMargin: liveCalc.profitMargin,
      status: initialStatus,
      dueDate: dueDate || '',
      paidAt: '',
      notes: notes.trim().slice(0, 2000),
    };

    setIsGenerating(true);

    // 1. Immediately update local storage
    const currentList = getStoredCollection<PaymentRecord>('payments', []);
    const newRecord: PaymentRecord = {
      id: newId,
      ...payload,
    };
    saveStoredCollection('payments', [newRecord, ...currentList]);
    window.dispatchEvent(new Event('guestpilot-db-update'));

    try {
      await setDoc(doc(collection(db, 'payments'), newId), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordActivityLog(
        'Pricing & Billing',
        `Generated ${docType}`,
        newId,
        `Created ${docType} ${refNumber} for ${payload.clientName} (${formatCurrency(
          payload.sellingPrice,
          currency
        )})`
      );
      onNotify(
        `${docType} ${refNumber} saved as ${initialStatus}. Download PDF from the ledger below.`,
        'success'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'payments');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdatePaymentStatus = async (
    payment: PaymentRecord,
    newStatus: PaymentRecord['status']
  ) => {
    // 1. Immediately update local storage
    const currentList = getStoredCollection<PaymentRecord>('payments', []);
    const updated = currentList.map((p) =>
      p.id === payment.id
        ? {
            ...p,
            status: newStatus,
            paidAt: newStatus === 'Paid' ? new Date().toISOString().slice(0, 10) : p.paidAt,
          }
        : p
    );
    saveStoredCollection('payments', updated);
    window.dispatchEvent(new Event('guestpilot-db-update'));

    try {
      await updateDoc(doc(db, 'payments', payment.id), {
        status: newStatus,
        paidAt: newStatus === 'Paid' ? new Date().toISOString().slice(0, 10) : payment.paidAt,
        updatedAt: serverTimestamp(),
      });
      await recordActivityLog(
        'Pricing & Billing',
        'Updated Payment Status',
        payment.id,
        `Marked ${payment.referenceNumber} as ${newStatus}`
      );
      onNotify(`Updated ${payment.referenceNumber} status to ${newStatus}.`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `payments/${payment.id}`);
    }
  };

  const handleDeletePayment = async (id: string) => {
    // 1. Immediately update local storage
    const currentList = getStoredCollection<PaymentRecord>('payments', []);
    saveStoredCollection('payments', currentList.filter((p) => p.id !== id));
    window.dispatchEvent(new Event('guestpilot-db-update'));

    try {
      await deleteDoc(doc(db, 'payments', id));
      setDeleteConfirmId(null);
      onNotify('Deleted billing record.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `payments/${id}`);
      setDeleteConfirmId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-5">
        <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
          Live Pricing Calculator, Quotations & Invoice Ledger
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Calculate net reseller margins automatically and generate client quotations or invoices. Unpaid invoices remain unpaid until explicitly confirmed.
        </p>
      </div>

      {/* Estimated vs Actual Profit Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl">
          <div className="text-xs text-zinc-400">Actual Realized Profit (Paid Invoices)</div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-emerald-400 mt-1">
            {formatCurrency(financialSummary.actualProfit, currency)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 font-mono tabular-nums">
            From {formatCurrency(financialSummary.actualRevenue, currency)} collected revenue
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl">
          <div className="text-xs text-zinc-400">
            Estimated Pipeline Profit (Quotes & Unpaid)
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-zinc-100 mt-1">
            {formatCurrency(financialSummary.estimatedPipelineProfit, currency)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 font-mono tabular-nums">
            From {formatCurrency(financialSummary.estimatedPipelineRevenue, currency)} pending value
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl">
          <div className="text-xs text-zinc-400">Calculator Net Profit</div>
          <div
            className={`text-2xl font-semibold font-mono tabular-nums mt-1 ${
              liveCalc.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {formatCurrency(liveCalc.netProfit, currency)}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Client Price − Supplier Cost − Expenses
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl">
          <div className="text-xs text-zinc-400">Calculator Profit Margin</div>
          <div
            className={`text-2xl font-semibold font-mono tabular-nums mt-1 ${
              liveCalc.profitMargin >= 25
                ? 'text-emerald-400'
                : liveCalc.profitMargin >= 0
                ? 'text-amber-400'
                : 'text-red-400'
            }`}
          >
            {liveCalc.profitMargin.toFixed(2)}%
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            (Net Profit / Client Price) × 100
          </div>
        </div>
      </div>

      {/* Interactive Calculator & Document Builder */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Calculator className="w-4 h-4 text-emerald-400" />
          <span>Reseller Margin Calculator & Quotation / Invoice Generator</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Load Client from CRM (Optional)
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => handleSelectClientPreset(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200"
            >
              <option value="">-- Custom / Select Client --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.clientName} ({c.company || c.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Client Name *
            </label>
            <input
              type="text"
              value={customClientName}
              onChange={(e) => setCustomClientName(e.target.value)}
              placeholder="Enter client name"
              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Client Email
            </label>
            <input
              type="email"
              value={customClientEmail}
              onChange={(e) => setCustomClientEmail(e.target.value)}
              placeholder="billing@client.com"
              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Load Website from Inventory (Optional)
            </label>
            <select
              value={selectedWebsiteId}
              onChange={(e) => handleSelectWebsitePreset(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200"
            >
              <option value="">-- Custom / Select Website --</option>
              {websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.domain} (GP: {formatCurrency(w.guestPostPrice, currency)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Placement Domain
            </label>
            <input
              type="text"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="publisher.com"
              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Due / Validity Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg">
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Client Selling Price ($)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-zinc-900 border border-zinc-800 rounded text-zinc-100"
            />
          </div>

          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg">
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Supplier Wholesale Cost ($)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={wholesaleCost}
              onChange={(e) => setWholesaleCost(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-zinc-900 border border-zinc-800 rounded text-zinc-100"
            />
          </div>

          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-lg">
            <label className="block text-xs font-medium text-zinc-300 mb-1">
              Additional Expenses (Copywriting / Fees $)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={additionalExpenses}
              onChange={(e) => setAdditionalExpenses(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-zinc-900 border border-zinc-800 rounded text-zinc-100"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-zinc-800">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional quotation/invoice notes (e.g., Includes 1,000-word SEO article + permanent Dofollow link)"
            className="flex-1 px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
          />
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => handleCreateDocument('Quotation')}
              className="px-4 py-2 text-xs font-medium text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors whitespace-nowrap"
            >
              Generate Quotation
            </button>
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => handleCreateDocument('Invoice')}
              className="px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors whitespace-nowrap"
            >
              Generate Unpaid Invoice
            </button>
          </div>
        </div>
      </div>

      {/* Quotations & Invoices Ledger Table */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">
            Quotations & Invoices Ledger ({payments.length})
          </h3>
          <span className="text-xs text-zinc-500">
            Click PDF to download client-ready document
          </span>
        </div>

        {payments.length === 0 ? (
          <div className="p-10 text-center text-xs text-zinc-500">
            No quotations or invoices generated yet. Use the calculator above to create your first quotation or invoice.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-medium text-zinc-400 bg-zinc-950/60">
                  <th className="py-3 px-4">Ref # · Type</th>
                  <th className="py-3 px-3">Client & Domain</th>
                  <th className="py-3 px-3 text-right">Client Price</th>
                  <th className="py-3 px-3 text-right">Costs</th>
                  <th className="py-3 px-3 text-right">Net Profit · Margin</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 text-xs">
                {payments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-mono font-medium text-zinc-100">
                        {pay.referenceNumber}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {pay.docType} · Due: {pay.dueDate || '—'}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-zinc-200 font-medium">{pay.clientName}</div>
                      <div className="text-[11px] text-zinc-500">
                        {pay.websiteDomain || 'General Placement'}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-zinc-100">
                      {formatCurrency(pay.sellingPrice, currency)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-zinc-400">
                      {formatCurrency(pay.wholesaleCost + pay.additionalExpenses, currency)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      <div
                        className={
                          pay.estimatedProfit >= 0
                            ? 'text-emerald-400 font-medium'
                            : 'text-red-400 font-medium'
                        }
                      >
                        {formatCurrency(pay.estimatedProfit, currency)}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {pay.profitMargin.toFixed(1)}%
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={pay.status}
                        onChange={(e) =>
                          handleUpdatePaymentStatus(
                            pay,
                            e.target.value as PaymentRecord['status']
                          )
                        }
                        className="px-2 py-1 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200"
                      >
                        <option value="Draft">Draft</option>
                        <option value="Sent">Sent</option>
                        <option value="Approved">Approved</option>
                        <option value="Unpaid">Unpaid</option>
                        <option value="Paid">Paid</option>
                        <option value="Overdue">Overdue</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            generateFinancialDocumentPdf(
                              pay,
                              settings?.businessName || 'GuestPilot AI',
                              currency,
                              settings?.defaultPaymentTerms || 'Due upon receipt',
                              settings?.invoiceFooterNotes || 'Thank you for your business.'
                            )
                          }
                          className="px-2.5 py-1 text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded inline-flex items-center gap-1"
                        >
                          <Download className="w-3 h-3 text-emerald-400" />
                          PDF
                        </button>
                        {deleteConfirmId === pay.id ? (
                          <button
                            type="button"
                            onClick={() => handleDeletePayment(pay.id)}
                            className="px-2 py-1 text-[11px] bg-red-600 text-white rounded"
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(pay.id)}
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
