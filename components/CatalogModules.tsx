'use client';

import React, { useState, useMemo, useRef } from 'react';
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
  WebsiteRecord,
  SupplierRecord,
  BacklinkType,
  WebsiteStatus,
  normalizeDomain,
  formatMetricOrUnknown,
  formatCurrency,
} from '@/lib/types';
import {
  Plus,
  Search,
  Download,
  Upload,
  Edit3,
  Trash2,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  X,
} from 'lucide-react';

interface WebsiteModuleProps {
  websites: WebsiteRecord[];
  currency: string;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const INITIAL_WEBSITE_FORM = {
  domain: '',
  websiteUrl: '',
  niche: '',
  country: 'United States',
  language: 'English',
  da: '',
  dr: '',
  organicTraffic: '',
  spamScore: '',
  metricsSource: 'Manual Publisher Entry',
  backlinkType: 'Dofollow' as BacklinkType,
  guestPostPrice: '',
  sponsoredPostPrice: '',
  contactEmail: '',
  publisherName: '',
  websiteStatus: 'Verified' as WebsiteStatus,
  verificationDate: new Date().toISOString().slice(0, 10),
  notes: '',
};

export function WebsiteManagementModule({
  websites,
  currency,
  onNotify,
}: WebsiteModuleProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [nicheFilter, setNicheFilter] = useState('ALL');
  const [linkTypeFilter, setLinkTypeFilter] = useState('ALL');
  const [maxPriceFilter, setMaxPriceFilter] = useState('');
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWebsite, setEditingWebsite] = useState<WebsiteRecord | null>(null);
  const [formData, setFormData] = useState(INITIAL_WEBSITE_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Compute duplicate domains map
  const domainCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const w of websites) {
      const norm = normalizeDomain(w.domain || w.websiteUrl);
      if (norm) counts[norm] = (counts[norm] || 0) + 1;
    }
    return counts;
  }, [websites]);

  const duplicateDomainsCount = useMemo(
    () => Object.values(domainCounts).filter((c) => c > 1).length,
    [domainCounts]
  );

  const uniqueCountries = useMemo(
    () => Array.from(new Set(websites.map((w) => w.country).filter(Boolean))).sort(),
    [websites]
  );

  const uniqueNiches = useMemo(
    () => Array.from(new Set(websites.map((w) => w.niche).filter(Boolean))).sort(),
    [websites]
  );

  const filteredWebsites = useMemo(() => {
    return websites.filter((w) => {
      const normDomain = normalizeDomain(w.domain || w.websiteUrl);
      if (showDuplicatesOnly && (domainCounts[normDomain] || 0) <= 1) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDomain = w.domain.toLowerCase().includes(q);
        const matchPublisher = w.publisherName.toLowerCase().includes(q);
        const matchNiche = w.niche.toLowerCase().includes(q);
        if (!matchDomain && !matchPublisher && !matchNiche) return false;
      }
      if (countryFilter !== 'ALL' && w.country !== countryFilter) return false;
      if (nicheFilter !== 'ALL' && w.niche !== nicheFilter) return false;
      if (linkTypeFilter !== 'ALL' && w.backlinkType !== linkTypeFilter) return false;
      if (maxPriceFilter.trim()) {
        const maxP = parseFloat(maxPriceFilter);
        if (!Number.isNaN(maxP) && w.guestPostPrice > maxP) return false;
      }
      return true;
    });
  }, [
    websites,
    searchQuery,
    countryFilter,
    nicheFilter,
    linkTypeFilter,
    maxPriceFilter,
    showDuplicatesOnly,
    domainCounts,
  ]);

  const liveFormDuplicateWarning = useMemo(() => {
    const candidate = normalizeDomain(formData.domain || formData.websiteUrl);
    if (!candidate) return null;
    const match = websites.find(
      (w) =>
        normalizeDomain(w.domain || w.websiteUrl) === candidate &&
        w.id !== editingWebsite?.id
    );
    return match ? `Domain "${candidate}" already exists in your inventory.` : null;
  }, [formData.domain, formData.websiteUrl, websites, editingWebsite]);

  const openAddModal = () => {
    setEditingWebsite(null);
    setFormData({
      ...INITIAL_WEBSITE_FORM,
      verificationDate: new Date().toISOString().slice(0, 10),
    });
    setIsModalOpen(true);
  };

  const openEditModal = (site: WebsiteRecord) => {
    setEditingWebsite(site);
    setFormData({
      domain: site.domain,
      websiteUrl: site.websiteUrl,
      niche: site.niche,
      country: site.country,
      language: site.language,
      da: site.da >= 0 ? String(site.da) : '',
      dr: site.dr >= 0 ? String(site.dr) : '',
      organicTraffic: site.organicTraffic >= 0 ? String(site.organicTraffic) : '',
      spamScore: site.spamScore >= 0 ? String(site.spamScore) : '',
      metricsSource: site.metricsSource || 'Unknown',
      backlinkType: site.backlinkType,
      guestPostPrice: String(site.guestPostPrice),
      sponsoredPostPrice: String(site.sponsoredPostPrice),
      contactEmail: site.contactEmail,
      publisherName: site.publisherName,
      websiteStatus: site.websiteStatus,
      verificationDate: site.verificationDate || 'Unverified',
      notes: site.notes,
    });
    setIsModalOpen(true);
  };

  const parseOptionalMetric = (val: string, maxVal: number): number => {
    const trimmed = val.trim();
    if (!trimmed || trimmed.toLowerCase() === 'unknown') return -1;
    const num = Number(trimmed);
    if (Number.isNaN(num) || num < 0) return -1;
    return Math.min(maxVal, Math.round(num));
  };

  const handleSaveWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = getActiveAdminUser();

    const normalizedDom = normalizeDomain(formData.domain || formData.websiteUrl);
    if (!normalizedDom || normalizedDom.length < 3) {
      onNotify('Please enter a valid domain name (e.g., example.com).', 'error');
      return;
    }

    const fullUrl =
      formData.websiteUrl.trim() ||
      `https://${normalizedDom}`;

    const payload = {
      ownerId: user.uid,
      domain: normalizedDom.slice(0, 253),
      websiteUrl: fullUrl.slice(0, 500),
      niche: (formData.niche.trim() || 'General').slice(0, 100),
      country: (formData.country.trim() || 'Unknown').slice(0, 100),
      language: (formData.language.trim() || 'English').slice(0, 100),
      da: parseOptionalMetric(formData.da, 100),
      dr: parseOptionalMetric(formData.dr, 100),
      organicTraffic: parseOptionalMetric(formData.organicTraffic, 1000000000),
      spamScore: parseOptionalMetric(formData.spamScore, 100),
      metricsSource: (formData.metricsSource.trim() || 'Unknown').slice(0, 120),
      backlinkType: formData.backlinkType,
      guestPostPrice: Math.min(1000000, Math.max(0, Number(formData.guestPostPrice) || 0)),
      sponsoredPostPrice: Math.min(
        1000000,
        Math.max(0, Number(formData.sponsoredPostPrice) || 0)
      ),
      contactEmail: formData.contactEmail.trim().slice(0, 254),
      publisherName: formData.publisherName.trim().slice(0, 150),
      websiteStatus: formData.websiteStatus,
      verificationDate: (formData.verificationDate.trim() || 'Unverified').slice(0, 40),
      notes: formData.notes.trim().slice(0, 2000),
    };

    setIsSaving(true);
    const targetId = editingWebsite ? editingWebsite.id : generateSafeId('web');

    // 1. Immediately update local storage for 0ms UI update
    const currentList = getStoredCollection<WebsiteRecord>('websites', []);
    const updatedRecord: WebsiteRecord = {
      id: targetId,
      ...payload,
    };
    const updatedList = editingWebsite
      ? currentList.map((w) => (w.id === targetId ? { ...w, ...payload } : w))
      : [updatedRecord, ...currentList];
    saveStoredCollection('websites', updatedList);
    window.dispatchEvent(new Event('guestpilot-db-update'));

    try {
      if (editingWebsite) {
        const docRef = doc(db, 'websites', targetId);
        await updateDoc(docRef, {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        await recordActivityLog(
          'Websites',
          'Updated Website',
          targetId,
          `Updated publisher domain ${payload.domain}`
        );
        onNotify(`Updated ${payload.domain} in inventory.`, 'success');
      } else {
        const docRef = doc(collection(db, 'websites'), targetId);
        await setDoc(docRef, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await recordActivityLog(
          'Websites',
          'Added Website',
          targetId,
          `Added publisher domain ${payload.domain}`
        );
        onNotify(`Added ${payload.domain} to inventory.`, 'success');
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(
        error,
        editingWebsite ? OperationType.UPDATE : OperationType.CREATE,
        'websites'
      );
      // Even if Firestore throws, local storage saved it successfully
      setIsModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async (id: string) => {
    const target = websites.find((w) => w.id === id);

    // 1. Update local storage immediately
    const currentList = getStoredCollection<WebsiteRecord>('websites', []);
    saveStoredCollection('websites', currentList.filter((w) => w.id !== id));
    window.dispatchEvent(new Event('guestpilot-db-update'));

    try {
      await deleteDoc(doc(db, 'websites', id));
      await recordActivityLog(
        'Websites',
        'Deleted Website',
        id,
        `Removed domain ${target?.domain || id}`
      );
      setDeleteConfirmId(null);
      onNotify(`Deleted ${target?.domain || 'website'}.`, 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `websites/${id}`);
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Domain',
      'Website URL',
      'Niche',
      'Country',
      'Language',
      'DA',
      'DR',
      'Organic Traffic',
      'Spam Score',
      'Metrics Source',
      'Backlink Type',
      'Guest Post Price',
      'Sponsored Post Price',
      'Contact Email',
      'Publisher Name',
      'Status',
      'Verification Date',
      'Notes',
    ];
    const rows = filteredWebsites.map((w) => [
      w.domain,
      w.websiteUrl,
      w.niche,
      w.country,
      w.language,
      w.da >= 0 ? String(w.da) : 'Unknown',
      w.dr >= 0 ? String(w.dr) : 'Unknown',
      w.organicTraffic >= 0 ? String(w.organicTraffic) : 'Unknown',
      w.spamScore >= 0 ? String(w.spamScore) : 'Unknown',
      w.metricsSource,
      w.backlinkType,
      String(w.guestPostPrice),
      String(w.sponsoredPostPrice),
      w.contactEmail,
      w.publisherName,
      w.websiteStatus,
      w.verificationDate,
      w.notes.replace(/"/g, '""'),
    ]);

    const csvContent =
      headers.join(',') +
      '\n' +
      rows.map((r) => r.map((cell) => `"${cell ?? ''}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `guestpilot_websites_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify(`Exported ${filteredWebsites.length} website records to CSV.`, 'success');
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const user = getActiveAdminUser();

    const text = await file.text();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      onNotify('CSV file must include a header row and at least one data row.', 'error');
      return;
    }

    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const idx = (names: string[]) => headers.findIndex((h) => names.some((n) => h.includes(n)));

    const domIdx = idx(['domain', 'site']);
    const urlIdx = idx(['url', 'website']);
    const nicheIdx = idx(['niche', 'category']);
    const countryIdx = idx(['country', 'geo']);
    const langIdx = idx(['language', 'lang']);
    const daIdx = idx(['da', 'domain authority']);
    const drIdx = idx(['dr', 'domain rating']);
    const trafficIdx = idx(['traffic']);
    const spamIdx = idx(['spam']);
    const sourceIdx = idx(['source']);
    const typeIdx = idx(['type', 'backlink', 'rel']);
    const gpPriceIdx = idx(['guest', 'price', 'cost']);
    const spPriceIdx = idx(['sponsored']);
    const emailIdx = idx(['email', 'contact']);
    const pubIdx = idx(['publisher', 'owner', 'name']);

    let importedCount = 0;
    let skippedDuplicates = 0;
    const existingSet = new Set(websites.map((w) => normalizeDomain(w.domain || w.websiteUrl)));

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const rawDom = (domIdx >= 0 ? cols[domIdx] : '') || (urlIdx >= 0 ? cols[urlIdx] : '');
      const normDom = normalizeDomain(rawDom);
      if (!normDom || normDom.length < 3) continue;

      if (existingSet.has(normDom)) {
        skippedDuplicates++;
        continue;
      }
      existingSet.add(normDom);

      const rawType = (typeIdx >= 0 ? cols[typeIdx] : '') || 'Unknown';
      const normalizedType: BacklinkType =
        (['Dofollow', 'Nofollow', 'Sponsored', 'Mixed', 'Unknown'].find(
          (t) => t.toLowerCase() === rawType.toLowerCase()
        ) as BacklinkType) || 'Unknown';

      const newId = generateSafeId('web');
      try {
        await setDoc(doc(collection(db, 'websites'), newId), {
          ownerId: user.uid,
          domain: normDom.slice(0, 253),
          websiteUrl: ((urlIdx >= 0 ? cols[urlIdx] : '') || `https://${normDom}`).slice(0, 500),
          niche: ((nicheIdx >= 0 ? cols[nicheIdx] : '') || 'General').slice(0, 100),
          country: ((countryIdx >= 0 ? cols[countryIdx] : '') || 'Unknown').slice(0, 100),
          language: ((langIdx >= 0 ? cols[langIdx] : '') || 'English').slice(0, 100),
          da: daIdx >= 0 ? parseOptionalMetric(cols[daIdx] || '', 100) : -1,
          dr: drIdx >= 0 ? parseOptionalMetric(cols[drIdx] || '', 100) : -1,
          organicTraffic:
            trafficIdx >= 0 ? parseOptionalMetric(cols[trafficIdx] || '', 1000000000) : -1,
          spamScore: spamIdx >= 0 ? parseOptionalMetric(cols[spamIdx] || '', 100) : -1,
          metricsSource: ((sourceIdx >= 0 ? cols[sourceIdx] : '') || 'CSV Import').slice(0, 120),
          backlinkType: normalizedType,
          guestPostPrice: Math.min(
            1000000,
            Math.max(0, Number(gpPriceIdx >= 0 ? cols[gpPriceIdx] : 0) || 0)
          ),
          sponsoredPostPrice: Math.min(
            1000000,
            Math.max(0, Number(spPriceIdx >= 0 ? cols[spPriceIdx] : 0) || 0)
          ),
          contactEmail: ((emailIdx >= 0 ? cols[emailIdx] : '') || '').slice(0, 254),
          publisherName: ((pubIdx >= 0 ? cols[pubIdx] : '') || '').slice(0, 150),
          websiteStatus: 'Verified' as WebsiteStatus,
          verificationDate: new Date().toISOString().slice(0, 10),
          notes: 'Imported via CSV',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        importedCount++;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'websites');
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
    await recordActivityLog(
      'Websites',
      'CSV Import',
      'batch',
      `Imported ${importedCount} websites (${skippedDuplicates} duplicate domains skipped)`
    );
    onNotify(
      `Imported ${importedCount} websites (${skippedDuplicates} duplicate domains skipped).`,
      'success'
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
            Publisher Website Database
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Real publisher inventory with transparent SEO metric provenance and duplicate domain detection.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportCsv}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Website
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl">
        <div className="lg:col-span-2 relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search domain, publisher, or niche..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={nicheFilter}
          onChange={(e) => setNicheFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-emerald-500"
        >
          <option value="ALL">All Niches</option>
          {uniqueNiches.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-emerald-500"
        >
          <option value="ALL">All Countries</option>
          {uniqueCountries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={linkTypeFilter}
          onChange={(e) => setLinkTypeFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:outline-none focus:border-emerald-500"
        >
          <option value="ALL">All Link Types</option>
          <option value="Dofollow">Dofollow</option>
          <option value="Nofollow">Nofollow</option>
          <option value="Sponsored">Sponsored</option>
          <option value="Mixed">Mixed</option>
          <option value="Unknown">Unknown</option>
        </select>

        <input
          type="number"
          min="0"
          value={maxPriceFilter}
          onChange={(e) => setMaxPriceFilter(e.target.value)}
          placeholder="Max GP Price ($)"
          className="px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono tabular-nums"
        />
      </div>

      {duplicateDomainsCount > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-amber-950/30 border border-amber-800/60 rounded-lg text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Detected <strong>{duplicateDomainsCount}</strong> duplicate domain(s) in your catalog.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowDuplicatesOnly((prev) => !prev)}
            className="underline font-medium hover:text-amber-200 whitespace-nowrap"
          >
            {showDuplicatesOnly ? 'Show All Websites' : 'Filter Duplicates Only'}
          </button>
        </div>
      )}

      {/* Websites Table */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
        {filteredWebsites.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-zinc-300">No publisher websites recorded yet</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
              Add publisher websites manually or import a CSV spreadsheet. Unavailable SEO metrics are stored transparently as Unknown.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add First Website
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-medium text-zinc-400 bg-zinc-950/60">
                  <th className="py-3 px-4">Domain & Publisher</th>
                  <th className="py-3 px-3">Niche · Geo</th>
                  <th className="py-3 px-3 text-right">DA / DR</th>
                  <th className="py-3 px-3 text-right">Traffic / Spam</th>
                  <th className="py-3 px-3">Metrics Provenance</th>
                  <th className="py-3 px-3">Link Type</th>
                  <th className="py-3 px-3 text-right">GP / Sponsored</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 text-xs">
                {filteredWebsites.map((site) => {
                  const isDup =
                    (domainCounts[normalizeDomain(site.domain || site.websiteUrl)] || 0) > 1;
                  return (
                    <tr
                      key={site.id}
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <a
                            href={site.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-zinc-100 hover:text-emerald-400 inline-flex items-center gap-1"
                          >
                            {site.domain}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                          {isDup && (
                            <span className="text-[11px] text-amber-400 font-medium">
                              · Duplicate
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5">
                          {site.publisherName || 'Publisher N/A'}{' '}
                          {site.contactEmail ? `· ${site.contactEmail}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-zinc-300">
                        <div>{site.niche}</div>
                        <div className="text-[11px] text-zinc-500">
                          {site.country} · {site.language}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-zinc-200">
                        <div>DA: {formatMetricOrUnknown(site.da)}</div>
                        <div className="text-[11px] text-zinc-400">
                          DR: {formatMetricOrUnknown(site.dr)}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-zinc-200">
                        <div>{formatMetricOrUnknown(site.organicTraffic)}</div>
                        <div className="text-[11px] text-zinc-400">
                          Spam: {formatMetricOrUnknown(site.spamScore, '%')}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-zinc-400">
                        <div className="text-zinc-300">{site.metricsSource || 'Unknown'}</div>
                        <div className="text-[11px] text-zinc-500 font-mono tabular-nums">
                          Verified: {site.verificationDate || 'Unverified'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-zinc-300">{site.backlinkType}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        <div className="text-emerald-400 font-medium">
                          {formatCurrency(site.guestPostPrice, currency)}
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          Sp: {formatCurrency(site.sponsoredPostPrice, currency)}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={
                            site.websiteStatus === 'Verified'
                              ? 'text-emerald-400 font-medium'
                              : site.websiteStatus === 'Blacklisted'
                              ? 'text-red-400 font-medium'
                              : 'text-amber-400 font-medium'
                          }
                        >
                          {site.websiteStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {deleteConfirmId === site.id ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleConfirmDelete(site.id)}
                              className="px-2 py-1 text-[11px] font-medium bg-red-600 text-white rounded hover:bg-red-500"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(null)}
                              className="px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(site)}
                              className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800"
                              title="Edit Website"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(site.id)}
                              className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-zinc-800"
                              title="Delete Website"
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

      {/* Add / Edit Website Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-semibold text-zinc-100">
                {editingWebsite ? `Edit Website — ${editingWebsite.domain}` : 'Add Publisher Website'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {liveFormDuplicateWarning && (
              <div className="p-3 bg-amber-950/40 border border-amber-800 rounded-lg text-xs text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{liveFormDuplicateWarning}</span>
              </div>
            )}

            <form onSubmit={handleSaveWebsite} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Domain *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.domain}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                    placeholder="e.g. techcrunch.com"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Website URL
                  </label>
                  <input
                    type="url"
                    value={formData.websiteUrl}
                    onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                    placeholder="https://techcrunch.com"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Niche *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.niche}
                    onChange={(e) => setFormData({ ...formData, niche: e.target.value })}
                    placeholder="SaaS, FinTech, Health..."
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Country
                    </label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Language
                    </label>
                    <input
                      type="text"
                      value={formData.language}
                      onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                    />
                  </div>
                </div>
              </div>

              {/* SEO Metrics with Explicit Unknown Support */}
              <div className="p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-300">
                    SEO Metrics (Leave blank if unavailable — stored as Unknown)
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">DA (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.da}
                      onChange={(e) => setFormData({ ...formData, da: e.target.value })}
                      placeholder="Unknown"
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">DR (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.dr}
                      onChange={(e) => setFormData({ ...formData, dr: e.target.value })}
                      placeholder="Unknown"
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Organic Traffic</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.organicTraffic}
                      onChange={(e) =>
                        setFormData({ ...formData, organicTraffic: e.target.value })
                      }
                      placeholder="Unknown"
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Spam Score (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.spamScore}
                      onChange={(e) => setFormData({ ...formData, spamScore: e.target.value })}
                      placeholder="Unknown"
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-100 font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      Metrics Source *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.metricsSource}
                      onChange={(e) =>
                        setFormData({ ...formData, metricsSource: e.target.value })
                      }
                      placeholder="e.g. Publisher Media Kit, Manual Check, Unknown"
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      Verification Date
                    </label>
                    <input
                      type="date"
                      value={formData.verificationDate}
                      onChange={(e) =>
                        setFormData({ ...formData, verificationDate: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-100 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Guest Post Price ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.guestPostPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, guestPostPrice: e.target.value })
                    }
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Sponsored Post Price ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.sponsoredPostPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, sponsoredPostPrice: e.target.value })
                    }
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Backlink Type
                  </label>
                  <select
                    value={formData.backlinkType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        backlinkType: e.target.value as BacklinkType,
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  >
                    <option value="Dofollow">Dofollow</option>
                    <option value="Nofollow">Nofollow</option>
                    <option value="Sponsored">Sponsored</option>
                    <option value="Mixed">Mixed</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Publisher Name
                  </label>
                  <input
                    type="text"
                    value={formData.publisherName}
                    onChange={(e) =>
                      setFormData({ ...formData, publisherName: e.target.value })
                    }
                    placeholder="Editorial Contact"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, contactEmail: e.target.value })
                    }
                    placeholder="editor@domain.com"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Website Status
                  </label>
                  <select
                    value={formData.websiteStatus}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        websiteStatus: e.target.value as WebsiteStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  >
                    <option value="Verified">Verified</option>
                    <option value="Pending Review">Pending Review</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Blacklisted">Blacklisted</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Editorial Guidelines & Notes
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Turnaround time, topic restrictions, link insertion rules..."
                  className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : editingWebsite ? 'Update Website' : 'Save Website'}
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
 * SUPPLIER MANAGEMENT MODULE (SECTION 7)
 * ============================================================================ */

interface SupplierModuleProps {
  suppliers: SupplierRecord[];
  currency: string;
  onNotify: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const INITIAL_SUPPLIER_FORM = {
  supplierName: '',
  email: '',
  website: '',
  country: 'United States',
  niche: 'General',
  wholesalePrice: '',
  quotedPrice: '',
  quotationNotes: '',
  acceptedLinkTypes: 'Dofollow',
  articleWordLimits: '800 - 1500 words',
  publishingTime: '2-3 business days',
  permanentLinkAvailability: 'Yes' as SupplierRecord['permanentLinkAvailability'],
  homepageLinkAvailability: 'No' as SupplierRecord['homepageLinkAvailability'],
  paymentStatus: 'No Active Balance' as SupplierRecord['paymentStatus'],
  notes: '',
};

export function SupplierManagementModule({
  suppliers,
  currency,
  onNotify,
}: SupplierModuleProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(null);
  const [formData, setFormData] = useState(INITIAL_SUPPLIER_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      if (paymentFilter !== 'ALL' && s.paymentStatus !== paymentFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          s.supplierName.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          s.website.toLowerCase().includes(q) ||
          s.niche.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [suppliers, searchQuery, paymentFilter]);

  const openAddModal = () => {
    setEditingSupplier(null);
    setFormData(INITIAL_SUPPLIER_FORM);
    setIsModalOpen(true);
  };

  const openEditModal = (sup: SupplierRecord) => {
    setEditingSupplier(sup);
    setFormData({
      supplierName: sup.supplierName,
      email: sup.email,
      website: sup.website,
      country: sup.country,
      niche: sup.niche,
      wholesalePrice: String(sup.wholesalePrice),
      quotedPrice: String(sup.quotedPrice),
      quotationNotes: sup.quotationNotes,
      acceptedLinkTypes: sup.acceptedLinkTypes,
      articleWordLimits: sup.articleWordLimits,
      publishingTime: sup.publishingTime,
      permanentLinkAvailability: sup.permanentLinkAvailability,
      homepageLinkAvailability: sup.homepageLinkAvailability,
      paymentStatus: sup.paymentStatus,
      notes: sup.notes,
    });
    setIsModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = getActiveAdminUser();

    if (!formData.supplierName.trim() || !formData.email.trim()) {
      onNotify('Supplier name and contact email are required.', 'error');
      return;
    }

    const payload = {
      ownerId: user.uid,
      supplierName: formData.supplierName.trim().slice(0, 150),
      email: formData.email.trim().slice(0, 254),
      website: formData.website.trim().slice(0, 500),
      country: (formData.country.trim() || 'Unknown').slice(0, 100),
      niche: (formData.niche.trim() || 'General').slice(0, 100),
      wholesalePrice: Math.min(1000000, Math.max(0, Number(formData.wholesalePrice) || 0)),
      quotedPrice: Math.min(1000000, Math.max(0, Number(formData.quotedPrice) || 0)),
      quotationNotes: formData.quotationNotes.trim().slice(0, 1000),
      acceptedLinkTypes: (formData.acceptedLinkTypes.trim() || 'Dofollow').slice(0, 120),
      articleWordLimits: (formData.articleWordLimits.trim() || '800+ words').slice(0, 120),
      publishingTime: (formData.publishingTime.trim() || '3 days').slice(0, 100),
      permanentLinkAvailability: formData.permanentLinkAvailability,
      homepageLinkAvailability: formData.homepageLinkAvailability,
      paymentStatus: formData.paymentStatus,
      notes: formData.notes.trim().slice(0, 2000),
    };

    setIsSaving(true);
    const targetId = editingSupplier ? editingSupplier.id : generateSafeId('sup');

    // 1. Immediately update local storage
    const currentList = getStoredCollection<SupplierRecord>('suppliers', []);
    const updatedRecord: SupplierRecord = {
      id: targetId,
      ...payload,
    };
    const updatedList = editingSupplier
      ? currentList.map((s) => (s.id === targetId ? { ...s, ...payload } : s))
      : [updatedRecord, ...currentList];
    saveStoredCollection('suppliers', updatedList);
    window.dispatchEvent(new Event('guestpilot-db-update'));

    try {
      if (editingSupplier) {
        await updateDoc(doc(db, 'suppliers', targetId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        await recordActivityLog(
          'Suppliers',
          'Updated Supplier',
          targetId,
          `Updated supplier ${payload.supplierName}`
        );
        onNotify(`Updated supplier ${payload.supplierName}.`, 'success');
      } else {
        await setDoc(doc(collection(db, 'suppliers'), targetId), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await recordActivityLog(
          'Suppliers',
          'Added Supplier',
          targetId,
          `Added supplier ${payload.supplierName}`
        );
        onNotify(`Added supplier ${payload.supplierName}.`, 'success');
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(
        error,
        editingSupplier ? OperationType.UPDATE : OperationType.CREATE,
        'suppliers'
      );
      setIsModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    const target = suppliers.find((s) => s.id === id);

    // 1. Immediately update local storage
    const currentList = getStoredCollection<SupplierRecord>('suppliers', []);
    saveStoredCollection('suppliers', currentList.filter((s) => s.id !== id));
    window.dispatchEvent(new Event('guestpilot-db-update'));

    try {
      await deleteDoc(doc(db, 'suppliers', id));
      await recordActivityLog(
        'Suppliers',
        'Deleted Supplier',
        id,
        `Deleted supplier ${target?.supplierName || id}`
      );
      setDeleteConfirmId(null);
      onNotify(`Removed supplier ${target?.supplierName || ''}.`, 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `suppliers/${id}`);
      setDeleteConfirmId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
            Publisher & Supplier Directory
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Manage direct publishers, wholesale rates, publishing SLAs, and recorded supplier quotations.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors inline-flex items-center gap-2 self-start sm:self-auto whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Supplier
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-900/60 border border-zinc-800/80 p-4 rounded-xl">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search supplier name, email, website, or niche..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200"
        >
          <option value="ALL">All Payment Statuses</option>
          <option value="No Active Balance">No Active Balance</option>
          <option value="Unpaid">Unpaid</option>
          <option value="Partial">Partial</option>
          <option value="Paid">Paid</option>
        </select>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
        {filteredSuppliers.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-zinc-300">No suppliers recorded yet</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
              Add website owners and media agencies to track wholesale rates, turnaround times, and negotiated quotations.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add First Supplier
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-medium text-zinc-400 bg-zinc-950/60">
                  <th className="py-3 px-4">Supplier & Contact</th>
                  <th className="py-3 px-3">Website · Niche</th>
                  <th className="py-3 px-3 text-right">Wholesale / Quoted</th>
                  <th className="py-3 px-3">Publishing Specs</th>
                  <th className="py-3 px-3">Permanent / Homepage</th>
                  <th className="py-3 px-3">Payment Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 text-xs">
                {filteredSuppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-zinc-100">{sup.supplierName}</div>
                      <div className="text-[11px] text-zinc-500">
                        {sup.email} · {sup.country}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-zinc-300">
                      <div>{sup.website || '—'}</div>
                      <div className="text-[11px] text-zinc-500">{sup.niche}</div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      <div className="text-emerald-400 font-medium">
                        {formatCurrency(sup.wholesalePrice, currency)}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Quote: {formatCurrency(sup.quotedPrice, currency)}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-zinc-300">
                      <div>
                        {sup.acceptedLinkTypes} · {sup.publishingTime}
                      </div>
                      <div className="text-[11px] text-zinc-500">{sup.articleWordLimits}</div>
                    </td>
                    <td className="py-3 px-3 text-zinc-300">
                      <div>Perm: {sup.permanentLinkAvailability}</div>
                      <div className="text-[11px] text-zinc-500">
                        Home: {sup.homepageLinkAvailability}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={
                          sup.paymentStatus === 'Paid'
                            ? 'text-emerald-400 font-medium'
                            : sup.paymentStatus === 'Unpaid'
                            ? 'text-amber-400 font-medium'
                            : 'text-zinc-400'
                        }
                      >
                        {sup.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {deleteConfirmId === sup.id ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteSupplier(sup.id)}
                            className="px-2 py-1 text-[11px] font-medium bg-red-600 text-white rounded hover:bg-red-500"
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
                            onClick={() => openEditModal(sup)}
                            className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(sup.id)}
                            className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-zinc-800"
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

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full p-6 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-semibold text-zinc-100">
                {editingSupplier ? `Edit Supplier — ${editingSupplier.supplierName}` : 'Add Publisher / Supplier'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Supplier / Publisher Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.supplierName}
                    onChange={(e) =>
                      setFormData({ ...formData, supplierName: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Contact Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Primary Website / Portfolio URL
                  </label>
                  <input
                    type="text"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://publisher.com"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Country
                    </label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Niche
                    </label>
                    <input
                      type="text"
                      value={formData.niche}
                      onChange={(e) => setFormData({ ...formData, niche: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                    />
                  </div>
                </div>
              </div>

              {/* Wholesale & Quotation Recording */}
              <div className="p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-lg space-y-3">
                <div className="text-xs font-medium text-zinc-300">
                  Wholesale Pricing & Recorded Supplier Quotation
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      Standard Wholesale Price ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.wholesalePrice}
                      onChange={(e) =>
                        setFormData({ ...formData, wholesalePrice: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      Latest Quoted Price ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.quotedPrice}
                      onChange={(e) =>
                        setFormData({ ...formData, quotedPrice: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      Payment Status
                    </label>
                    <select
                      value={formData.paymentStatus}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          paymentStatus: e.target.value as SupplierRecord['paymentStatus'],
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-100"
                    >
                      <option value="No Active Balance">No Active Balance</option>
                      <option value="Unpaid">Unpaid</option>
                      <option value="Partial">Partial</option>
                      <option value="Paid">Paid</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Recorded Quotation Details (Bulk discounts, package terms, validity)
                  </label>
                  <input
                    type="text"
                    value={formData.quotationNotes}
                    onChange={(e) =>
                      setFormData({ ...formData, quotationNotes: e.target.value })
                    }
                    placeholder="e.g. Quoted $65/post for 5+ posts/month via email on Nov 10"
                    className="w-full px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Accepted Link Types
                  </label>
                  <input
                    type="text"
                    value={formData.acceptedLinkTypes}
                    onChange={(e) =>
                      setFormData({ ...formData, acceptedLinkTypes: e.target.value })
                    }
                    placeholder="Dofollow, Sponsored"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Article Word Limits
                  </label>
                  <input
                    type="text"
                    value={formData.articleWordLimits}
                    onChange={(e) =>
                      setFormData({ ...formData, articleWordLimits: e.target.value })
                    }
                    placeholder="800 - 1500 words"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Publishing Turnaround Time
                  </label>
                  <input
                    type="text"
                    value={formData.publishingTime}
                    onChange={(e) =>
                      setFormData({ ...formData, publishingTime: e.target.value })
                    }
                    placeholder="2-3 business days"
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Permanent Link Availability
                  </label>
                  <select
                    value={formData.permanentLinkAvailability}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        permanentLinkAvailability: e.target
                          .value as SupplierRecord['permanentLinkAvailability'],
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  >
                    <option value="Yes">Yes (Permanent)</option>
                    <option value="12 Months">12 Months Guaranteed</option>
                    <option value="No">No</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Homepage Link Availability
                  </label>
                  <select
                    value={formData.homepageLinkAvailability}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        homepageLinkAvailability: e.target
                          .value as SupplierRecord['homepageLinkAvailability'],
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                    <option value="Extra Fee">Available for Extra Fee</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Supplier Notes & Payment Details
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="PayPal / Wise details, editorial preferences..."
                  className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
