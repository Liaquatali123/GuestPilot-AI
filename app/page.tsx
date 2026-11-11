'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import {
  db,
  OperationType,
  handleFirestoreError,
  recordActivityLog,
} from '@/lib/firebase';
import {
  getAdminSession,
  verifyAdminKey,
  logoutAdmin,
  getCustomMasterKey,
  setCustomMasterKey,
  generateRandomSecureToken,
  resetToDefaultKey,
  DEFAULT_MASTER_KEY,
  AdminSession,
} from '@/lib/auth-service';
import {
  getStoredCollection,
  saveStoredCollection,
  getStoredSettings,
  saveStoredSettings,
  exportFullDatabaseBackup,
  restoreFullDatabaseBackup,
  resetDatabaseToInitialSeed,
  INITIAL_WEBSITES,
  INITIAL_SUPPLIERS,
  INITIAL_CLIENTS,
  INITIAL_LEADS,
  INITIAL_ORDERS,
  INITIAL_PAYMENTS,
  INITIAL_OUTREACH,
  INITIAL_DELIVERIES,
  INITIAL_ACTIVITY_LOGS,
} from '@/lib/local-db';
import {
  WebsiteRecord,
  SupplierRecord,
  ClientRecord,
  LeadRecord,
  OrderRecord,
  PaymentRecord,
  OutreachRecord,
  DeliveryRecord,
  UserSettings,
  ActivityLogRecord,
  formatCurrency,
  formatTimestamp,
} from '@/lib/types';
import {
  WebsiteManagementModule,
  SupplierManagementModule,
} from '@/components/CatalogModules';
import {
  ClientCrmModule,
  PricingAndProfitModule,
} from '@/components/CrmAndPricingModules';
import {
  OrderManagementModule,
  EmailAssistantModule,
  BacklinkVerificationAndReportsModule,
} from '@/components/OperationsModules';
import {
  LayoutDashboard,
  Globe,
  Truck,
  Users,
  Calculator,
  ClipboardList,
  Mail,
  ShieldCheck,
  Settings,
  LogOut,
  Menu,
  X,
  Lock,
  CheckCircle2,
  ArrowRight,
  Key,
  Download,
  Upload,
  RefreshCw,
  Eye,
  EyeOff,
  Database,
  Sparkles,
} from 'lucide-react';

type NavigationModule =
  | 'dashboard'
  | 'websites'
  | 'suppliers'
  | 'crm'
  | 'pricing'
  | 'orders'
  | 'email'
  | 'verification'
  | 'settings';

interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function GuestPilotApp() {
  // Session & Authentication State
  const [adminSession, setAdminSession] = useState<AdminSession | null>(() => {
    if (typeof window !== 'undefined') {
      return getAdminSession();
    }
    return null;
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [inputKey, setInputKey] = useState('');
  const [showKeyPassword, setShowKeyPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Navigation & UI State
  const [activeModule, setActiveModule] = useState<NavigationModule>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Business Database State (Local-first with Cloud Firestore Sync)
  const [websites, setWebsites] = useState<WebsiteRecord[]>(() =>
    typeof window !== 'undefined'
      ? getStoredCollection<WebsiteRecord>('websites', INITIAL_WEBSITES)
      : INITIAL_WEBSITES
  );
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>(() =>
    typeof window !== 'undefined'
      ? getStoredCollection<SupplierRecord>('suppliers', INITIAL_SUPPLIERS)
      : INITIAL_SUPPLIERS
  );
  const [clients, setClients] = useState<ClientRecord[]>(() =>
    typeof window !== 'undefined'
      ? getStoredCollection<ClientRecord>('clients', INITIAL_CLIENTS)
      : INITIAL_CLIENTS
  );
  const [leads, setLeads] = useState<LeadRecord[]>(() =>
    typeof window !== 'undefined'
      ? getStoredCollection<LeadRecord>('leads', INITIAL_LEADS)
      : INITIAL_LEADS
  );
  const [orders, setOrders] = useState<OrderRecord[]>(() =>
    typeof window !== 'undefined'
      ? getStoredCollection<OrderRecord>('orders', INITIAL_ORDERS)
      : INITIAL_ORDERS
  );
  const [payments, setPayments] = useState<PaymentRecord[]>(() =>
    typeof window !== 'undefined'
      ? getStoredCollection<PaymentRecord>('payments', INITIAL_PAYMENTS)
      : INITIAL_PAYMENTS
  );
  const [outreachList, setOutreachList] = useState<OutreachRecord[]>(() =>
    typeof window !== 'undefined'
      ? getStoredCollection<OutreachRecord>('outreach', INITIAL_OUTREACH)
      : INITIAL_OUTREACH
  );
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>(() =>
    typeof window !== 'undefined'
      ? getStoredCollection<DeliveryRecord>('deliveries', INITIAL_DELIVERIES)
      : INITIAL_DELIVERIES
  );
  const [settings, setSettings] = useState<UserSettings>(() =>
    typeof window !== 'undefined' ? getStoredSettings() : getStoredSettings()
  );
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>(() =>
    typeof window !== 'undefined'
      ? getStoredCollection<ActivityLogRecord>('activityLogs', INITIAL_ACTIVITY_LOGS)
      : INITIAL_ACTIVITY_LOGS
  );

  // Key & Settings Management State
  const [customKeyDisplay, setCustomKeyDisplay] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getCustomMasterKey();
    }
    return DEFAULT_MASTER_KEY;
  });
  const [newKeyInput, setNewKeyInput] = useState('');
  const [settingsBusinessName, setSettingsBusinessName] = useState(
    settings.businessName
  );
  const [settingsCurrency, setSettingsCurrency] = useState(
    settings.defaultCurrency
  );
  const [settingsPaymentTerms, setSettingsPaymentTerms] = useState(
    settings.defaultPaymentTerms
  );
  const [settingsInvoiceNotes, setSettingsInvoiceNotes] = useState(
    settings.invoiceFooterNotes
  );
  const [savingSettings, setSavingSettings] = useState(false);

  const backupInputRef = useRef<HTMLInputElement>(null);
  const toastSeqRef = useRef(0);

  const notify = React.useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = `toast_${Date.now()}_${++toastSeqRef.current}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  // Function to reload local collections into React state
  const refreshLocalDatabaseState = React.useCallback(() => {
    if (typeof window === 'undefined') return;
    setWebsites(getStoredCollection<WebsiteRecord>('websites', INITIAL_WEBSITES));
    setSuppliers(getStoredCollection<SupplierRecord>('suppliers', INITIAL_SUPPLIERS));
    setClients(getStoredCollection<ClientRecord>('clients', INITIAL_CLIENTS));
    setLeads(getStoredCollection<LeadRecord>('leads', INITIAL_LEADS));
    setOrders(getStoredCollection<OrderRecord>('orders', INITIAL_ORDERS));
    setPayments(getStoredCollection<PaymentRecord>('payments', INITIAL_PAYMENTS));
    setOutreachList(getStoredCollection<OutreachRecord>('outreach', INITIAL_OUTREACH));
    setDeliveries(getStoredCollection<DeliveryRecord>('deliveries', INITIAL_DELIVERIES));
    setSettings(getStoredSettings());
    setActivityLogs(
      getStoredCollection<ActivityLogRecord>('activityLogs', INITIAL_ACTIVITY_LOGS)
    );
  }, []);

  // Listen to local database updates
  useEffect(() => {
    const handleStorageEvent = () => refreshLocalDatabaseState();
    window.addEventListener('guestpilot-db-update', handleStorageEvent);
    window.addEventListener('storage', handleStorageEvent);
    return () => {
      window.removeEventListener('guestpilot-db-update', handleStorageEvent);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [refreshLocalDatabaseState]);

  // Background Cloud Firestore Listeners (sync if online)
  useEffect(() => {
    if (!adminSession?.authenticated) return;

    try {
      const unsubWebsites = onSnapshot(
        collection(db, 'websites'),
        (snap) => {
          if (!snap.empty) {
            const list = snap.docs.map(
              (d) => ({ id: d.id, ...d.data() } as WebsiteRecord)
            );
            setWebsites(list);
            saveStoredCollection('websites', list);
          }
        },
        () => {
          // resilient fallback
        }
      );

      const unsubOrders = onSnapshot(
        collection(db, 'orders'),
        (snap) => {
          if (!snap.empty) {
            const list = snap.docs.map(
              (d) => ({ id: d.id, ...d.data() } as OrderRecord)
            );
            setOrders(list);
            saveStoredCollection('orders', list);
          }
        },
        () => {}
      );

      return () => {
        unsubWebsites();
        unsubOrders();
      };
    } catch {
      // offline mode
    }
  }, [adminSession]);

  // Executive Dashboard Metrics
  const dashboardStats = useMemo(() => {
    const totalWebsites = websites.length;
    const verifiedWebsites = websites.filter(
      (w) => w.websiteStatus === 'Verified'
    ).length;
    const totalSuppliers = suppliers.length;
    const totalClients = clients.length;
    const newLeads = leads.filter(
      (l) => l.status === 'New' || l.status === 'Qualified'
    ).length;

    const activeOrders = orders.filter(
      (o) => o.status !== 'DELIVERED'
    ).length;
    const completedOrders = orders.filter(
      (o) => o.status === 'DELIVERED'
    ).length;

    const totalRevenue = orders.reduce(
      (sum, o) => (o.paymentStatus === 'Paid' ? sum + o.clientPrice : sum),
      0
    );

    const totalSupplierCosts = orders.reduce(
      (sum, o) =>
        o.paymentStatus === 'Paid'
          ? sum + o.supplierCost + o.additionalExpenses
          : sum,
      0
    );

    const netProfit = totalRevenue - totalSupplierCosts;

    const pendingPayments = orders.reduce(
      (sum, o) =>
        o.paymentStatus === 'Unpaid' || o.paymentStatus === 'Partial'
          ? sum + o.clientPrice
          : sum,
      0
    );

    return {
      totalWebsites,
      verifiedWebsites,
      totalSuppliers,
      totalClients,
      newLeads,
      activeOrders,
      completedOrders,
      totalRevenue,
      totalSupplierCosts,
      netProfit,
      pendingPayments,
    };
  }, [websites, suppliers, clients, leads, orders]);

  // Handle Key Verification & Sign-In
  const handleKeySignIn = (keyToTest?: string) => {
    const key = (keyToTest || inputKey).trim();
    const result = verifyAdminKey(key, rememberDevice);
    if (result.success && result.session) {
      setAdminSession(result.session);
      setAuthError(null);
      notify('Master Admin Key verified. Welcome to GuestPilot AI.', 'success');
      recordActivityLog(
        'Authentication',
        'ADMIN_LOGIN',
        'key_auth',
        `Authenticated via Admin Access Token`
      );
    } else {
      setAuthError(
        result.error ||
          'Invalid Admin Key. Please check the master key or click "Use Default Master Key".'
      );
    }
  };

  const handleSignOut = () => {
    logoutAdmin();
    setAdminSession(null);
    setInputKey('');
    notify('Administrator portal locked successfully.', 'info');
  };

  // Change Master Passkey
  const handleUpdateMasterKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyInput.trim() || newKeyInput.trim().length < 6) {
      notify('New Master Key must be at least 6 characters long.', 'error');
      return;
    }
    const res = setCustomMasterKey(newKeyInput.trim());
    if (res.success) {
      setCustomKeyDisplay(newKeyInput.trim());
      setNewKeyInput('');
      notify('Master Key updated successfully. Remember your new key!', 'success');
    } else {
      notify(res.error || 'Failed to update key.', 'error');
    }
  };

  const handleResetToDefaultKey = () => {
    resetToDefaultKey();
    setCustomKeyDisplay(DEFAULT_MASTER_KEY);
    notify('Reset to default system master key.', 'info');
  };

  const handleGenerateKey = () => {
    const token = generateRandomSecureToken();
    setNewKeyInput(token);
    notify('Generated high-security 256-bit style access token.', 'info');
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    const updatedSettings: UserSettings = {
      ...settings,
      businessName: settingsBusinessName.trim() || 'GuestPilot AI',
      defaultCurrency: settingsCurrency,
      defaultPaymentTerms: settingsPaymentTerms.trim(),
      invoiceFooterNotes: settingsInvoiceNotes.trim(),
    };
    saveStoredSettings(updatedSettings);
    setSettings(updatedSettings);

    try {
      await setDoc(doc(db, 'settings', 'admin_master'), {
        ...updatedSettings,
        updatedAt: serverTimestamp(),
      });
      await recordActivityLog(
        'Settings',
        'SAVED_SETTINGS',
        'admin_master',
        'Updated business name and billing preferences'
      );
    } catch {
      // local save already completed
    }
    setSavingSettings(false);
    notify('Business configuration saved successfully.', 'success');
  };

  // Export Full JSON Backup
  const handleExportBackup = () => {
    const backup = exportFullDatabaseBackup();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `guestpilot_ai_database_backup_${new Date().toISOString().slice(0, 10)}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    notify('Full JSON Database Backup downloaded successfully.', 'success');
  };

  // Restore JSON Backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const ok = restoreFullDatabaseBackup(json);
        if (ok) {
          refreshLocalDatabaseState();
          notify('Database restored from backup successfully!', 'success');
        } else {
          notify('Invalid backup file format.', 'error');
        }
      } catch {
        notify('Failed to parse JSON backup file.', 'error');
      }
    };
    reader.readAsText(file);
    if (backupInputRef.current) backupInputRef.current.value = '';
  };

  // Reset to Sample Catalog
  const handleResetSampleData = () => {
    if (
      window.confirm(
        'Reset database to initial industry seed catalog (Forbes, TechCrunch, SEJ, sample orders & clients)?'
      )
    ) {
      resetDatabaseToInitialSeed();
      refreshLocalDatabaseState();
      notify('Database reset to initial verified industry catalog.', 'success');
    }
  };

  // Loading Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono">Initializing GuestPilot AI...</span>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ADMIN PASSKEY & SECURITY TOKEN AUTHENTICATION SCREEN
  // =========================================================================
  if (!adminSession?.authenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between p-4 sm:p-6">
        <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-4 border-b border-zinc-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Key className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-lg font-bold tracking-tight text-zinc-100">
              GuestPilot AI
            </span>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            Private Administrator Portal
          </span>
        </header>

        <main className="max-w-md w-full mx-auto my-auto py-8">
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <Lock className="w-6 h-6 text-emerald-400" />
              </div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                Key-Protected
              </span>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                Administrator Access
              </h1>
              <p className="text-xs text-zinc-400 leading-relaxed">
                GuestPilot AI is a private guest posting reseller software. Authenticate
                using your Admin Master Key or Access Token to enter.
              </p>
            </div>

            {/* 1-CLICK QUICK UNLOCK BANNER */}
            <div className="p-3.5 bg-gradient-to-r from-emerald-950/60 to-zinc-900 border border-emerald-500/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  Quick Unlock (Default Key):
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">1-Tap Login</span>
              </div>
              <button
                type="button"
                onClick={() => handleKeySignIn(DEFAULT_MASTER_KEY)}
                className="w-full py-2.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <span>⚡ Use Master Key: {DEFAULT_MASTER_KEY}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* QUICK PASSKEY CHIPS */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-zinc-400">
                Or quick-sign with allowed passkey email:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleKeySignIn('rdxkinglucky@gmail.com')}
                  className="px-2.5 py-2 text-[11px] font-mono bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg text-zinc-300 truncate text-left transition-colors"
                >
                  rdxkinglucky@...
                </button>
                <button
                  type="button"
                  onClick={() => handleKeySignIn('appbuilder078@gmail.com')}
                  className="px-2.5 py-2 text-[11px] font-mono bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg text-zinc-300 truncate text-left transition-colors"
                >
                  appbuilder078@...
                </button>
              </div>
            </div>

            {/* CUSTOM KEY / TOKEN INPUT FORM */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleKeySignIn();
              }}
              className="space-y-4 pt-2 border-t border-zinc-800/80"
            >
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center justify-between">
                  <span>Enter Custom Admin Key or Token:</span>
                  <button
                    type="button"
                    onClick={() => setInputKey(generateRandomSecureToken())}
                    className="text-[11px] text-emerald-400 hover:underline"
                  >
                    Generate Token
                  </button>
                </label>
                <div className="relative">
                  <input
                    type={showKeyPassword ? 'text' : 'password'}
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    placeholder="Enter Admin Master Key or Access Token"
                    className="w-full pl-3.5 pr-10 py-2.5 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeyPassword(!showKeyPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showKeyPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-zinc-400">
                  <input
                    type="checkbox"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                  />
                  <span>Remember on this device</span>
                </label>
              </div>

              {authError && (
                <div className="p-3 bg-red-950/70 border border-red-800 rounded-xl text-xs text-red-200">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-4 bg-zinc-100 hover:bg-white text-zinc-950 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Unlock Administrator Portal</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="pt-3 border-t border-zinc-800/80 text-[11px] text-zinc-500 flex items-center justify-between">
              <span>Zero external OAuth dependencies</span>
              <span>100% Vercel & Mobile Ready</span>
            </div>
          </div>
        </main>

        <footer className="max-w-6xl w-full mx-auto py-4 border-t border-zinc-900 text-xs text-zinc-600 flex justify-between">
          <span>GuestPilot AI — Guest Posting Reseller Software</span>
          <span>Local Key Authenticated • Cloud Synced</span>
        </footer>
      </div>
    );
  }

  // =========================================================================
  // AUTHENTICATED ADMINISTRATOR APPLICATION WORKSPACE
  // =========================================================================
  const currency = settings.defaultCurrency || 'USD';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased">
      {/* Top Application Bar */}
      <nav className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>
              <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveModule('dashboard')}>
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <span className="font-bold tracking-tight text-sm text-zinc-100">
                  GuestPilot AI
                </span>
                <span className="hidden sm:inline-block text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  Reseller OS
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-zinc-400 px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Admin Active</span>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                className="px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-red-300 bg-zinc-900 hover:bg-red-950/50 border border-zinc-800 hover:border-red-800/80 rounded-lg transition-colors flex items-center gap-1.5"
                title="Lock Administrator Portal"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lock Portal</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden lg:block w-64 border-r border-zinc-800/80 p-4 shrink-0 space-y-6">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-3 pb-2">
              Management Modules
            </div>

            <button
              type="button"
              onClick={() => setActiveModule('dashboard')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeModule === 'dashboard'
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Executive Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('websites')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeModule === 'websites'
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4" />
                <span>Websites Catalog</span>
              </div>
              <span className="font-mono text-[11px] opacity-80">
                {websites.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('suppliers')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeModule === 'suppliers'
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Truck className="w-4 h-4" />
                <span>Suppliers & Desk</span>
              </div>
              <span className="font-mono text-[11px] opacity-80">
                {suppliers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('crm')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeModule === 'crm'
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4" />
                <span>Client CRM & Leads</span>
              </div>
              <span className="font-mono text-[11px] opacity-80">
                {clients.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('pricing')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeModule === 'pricing'
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
              }`}
            >
              <Calculator className="w-4 h-4" />
              <span>Pricing & Quotations</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('orders')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeModule === 'orders'
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ClipboardList className="w-4 h-4" />
                <span>Order Pipeline (11)</span>
              </div>
              <span className="font-mono text-[11px] opacity-80">
                {orders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('email')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeModule === 'email'
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
              }`}
            >
              <Mail className="w-4 h-4" />
              <span>Email Assistant</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('verification')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeModule === 'verification'
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Backlink Verifier & PDF</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveModule('settings')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeModule === 'settings'
                  ? 'bg-emerald-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Settings & Key Manager</span>
            </button>
          </div>

          {/* Quick Database Backup Widget */}
          <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>Local Persistence</span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Instant 0ms latency. All changes save directly to your browser device storage.
            </p>
            <button
              type="button"
              onClick={handleExportBackup}
              className="w-full py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px] font-medium flex items-center justify-center gap-1.5"
            >
              <Download className="w-3 h-3" />
              <span>Export Backup</span>
            </button>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden bg-zinc-950/80 backdrop-blur">
            <div className="bg-zinc-900 w-72 h-full p-5 space-y-4 border-r border-zinc-800">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <span className="font-bold text-sm text-zinc-100">
                  GuestPilot AI
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-1">
                {(
                  [
                    ['dashboard', 'Executive Overview', LayoutDashboard],
                    ['websites', 'Websites Catalog', Globe],
                    ['suppliers', 'Suppliers Directory', Truck],
                    ['crm', 'Client CRM & Leads', Users],
                    ['pricing', 'Pricing & Calculator', Calculator],
                    ['orders', 'Order Pipeline', ClipboardList],
                    ['email', 'Email Assistant', Mail],
                    ['verification', 'Backlink Verification', ShieldCheck],
                    ['settings', 'Settings & Master Key', Settings],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setActiveModule(key);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium ${
                      activeModule === key
                        ? 'bg-emerald-500 text-zinc-950 font-bold'
                        : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full py-2 px-3 text-xs bg-red-950/40 border border-red-800/60 text-red-200 rounded-lg flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Lock Administrator Portal</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Viewport Main Container */}
        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-8">
          {dataLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 bg-zinc-900/50 border border-zinc-800 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <>
              {/* MODULE 1: EXECUTIVE DASHBOARD */}
              {activeModule === 'dashboard' && (
                <div className="space-y-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
                    <div>
                      <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">
                        {settings?.businessName || 'GuestPilot AI'} — Executive Overview
                      </h1>
                      <p className="text-xs text-zinc-400 mt-1">
                        Operational and financial metrics from your verified reseller database.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveModule('websites')}
                        className="px-3 py-2 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-lg"
                      >
                        Add Website
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveModule('pricing')}
                        className="px-3.5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg"
                      >
                        Pricing Calculator
                      </button>
                    </div>
                  </div>

                  {/* Financial KPIs Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-xl">
                      <div className="text-xs text-zinc-400">Total Collected Revenue</div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-zinc-100 mt-1.5">
                        {formatCurrency(dashboardStats.totalRevenue, currency)}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1">
                        From paid orders & invoices
                      </div>
                    </div>

                    <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-xl">
                      <div className="text-xs text-zinc-400">Total Supplier Costs</div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-zinc-300 mt-1.5">
                        {formatCurrency(dashboardStats.totalSupplierCosts, currency)}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1">
                        Wholesale publisher fees + expenses
                      </div>
                    </div>

                    <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-xl">
                      <div className="text-xs text-zinc-400">Net Business Profit</div>
                      <div
                        className={`text-2xl font-bold font-mono tabular-nums mt-1.5 ${
                          dashboardStats.netProfit >= 0
                            ? 'text-emerald-400'
                            : 'text-red-400'
                        }`}
                      >
                        {formatCurrency(dashboardStats.netProfit, currency)}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1">
                        Client Price - Supplier Cost
                      </div>
                    </div>

                    <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-xl">
                      <div className="text-xs text-zinc-400">Pending Receivables</div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-amber-400 mt-1.5">
                        {formatCurrency(dashboardStats.pendingPayments, currency)}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1">
                        Unpaid client balance
                      </div>
                    </div>
                  </div>

                  {/* Operational Counts Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveModule('websites')}
                      className="text-left bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/80 p-4 rounded-xl transition-colors"
                    >
                      <div className="text-[11px] text-zinc-400">Websites Catalog</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-zinc-100 mt-1">
                        {dashboardStats.totalWebsites}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveModule('websites')}
                      className="text-left bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/80 p-4 rounded-xl transition-colors"
                    >
                      <div className="text-[11px] text-zinc-400">Verified Sites</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-emerald-400 mt-1">
                        {dashboardStats.verifiedWebsites}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveModule('suppliers')}
                      className="text-left bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/80 p-4 rounded-xl transition-colors"
                    >
                      <div className="text-[11px] text-zinc-400">Total Suppliers</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-zinc-100 mt-1">
                        {dashboardStats.totalSuppliers}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveModule('crm')}
                      className="text-left bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/80 p-4 rounded-xl transition-colors"
                    >
                      <div className="text-[11px] text-zinc-400">Total Clients</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-zinc-100 mt-1">
                        {dashboardStats.totalClients}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveModule('orders')}
                      className="text-left bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/80 p-4 rounded-xl transition-colors"
                    >
                      <div className="text-[11px] text-zinc-400">Active Orders</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-emerald-400 mt-1">
                        {dashboardStats.activeOrders}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveModule('orders')}
                      className="text-left bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/80 p-4 rounded-xl transition-colors"
                    >
                      <div className="text-[11px] text-zinc-400">Delivered Orders</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-zinc-100 mt-1">
                        {dashboardStats.completedOrders}
                      </div>
                    </button>
                  </div>

                  {/* Active Orders & Audit Trail */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                        <h2 className="text-sm font-semibold text-zinc-100">
                          Recent Orders in Pipeline
                        </h2>
                        <button
                          type="button"
                          onClick={() => setActiveModule('orders')}
                          className="text-xs text-emerald-400 hover:underline"
                        >
                          View All ({orders.length})
                        </button>
                      </div>

                      {orders.length === 0 ? (
                        <div className="py-8 text-center text-xs text-zinc-500">
                          No orders recorded yet.
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-800/70 text-xs">
                          {orders.slice(0, 5).map((ord) => (
                            <div
                              key={ord.id}
                              className="py-2.5 flex items-center justify-between gap-3"
                            >
                              <div>
                                <div className="font-medium text-zinc-200">
                                  <span className="font-mono">{ord.orderNumber}</span> ·{' '}
                                  {ord.clientName}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                  Publisher: {ord.websiteDomain} · Stage:{' '}
                                  <span className="text-emerald-400">{ord.status}</span>
                                </div>
                              </div>
                              <div className="text-right font-mono tabular-nums">
                                <div className="text-zinc-100 font-semibold">
                                  {formatCurrency(ord.clientPrice, currency)}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                  {ord.paymentStatus}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                        <h2 className="text-sm font-semibold text-zinc-100">
                          Audit Trail & Activity Log
                        </h2>
                        <span className="text-xs font-mono text-zinc-500">
                          {activityLogs.length} events recorded
                        </span>
                      </div>

                      {activityLogs.length === 0 ? (
                        <div className="py-8 text-center text-xs text-zinc-500">
                          No activity recorded yet.
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-800/70 text-xs space-y-0 max-h-[300px] overflow-y-auto pr-1">
                          {activityLogs.slice(0, 6).map((log) => (
                            <div key={log.id} className="py-2.5 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-zinc-300">
                                  [{log.module}] {log.action}
                                </span>
                                <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                                  {formatTimestamp(log.createdAt)}
                                </span>
                              </div>
                              <div className="text-[11px] text-zinc-400">{log.details}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* MODULE 2: WEBSITES CATALOG */}
              {activeModule === 'websites' && (
                <WebsiteManagementModule
                  websites={websites}
                  currency={currency}
                  onNotify={notify}
                />
              )}

              {/* MODULE 3: SUPPLIERS DIRECTORY */}
              {activeModule === 'suppliers' && (
                <SupplierManagementModule
                  suppliers={suppliers}
                  currency={currency}
                  onNotify={notify}
                />
              )}

              {/* MODULE 4: CLIENT CRM & LEADS */}
              {activeModule === 'crm' && (
                <ClientCrmModule
                  clients={clients}
                  leads={leads}
                  orders={orders}
                  payments={payments}
                  currency={currency}
                  onNotify={notify}
                />
              )}

              {/* MODULE 5: PRICING & QUOTATIONS */}
              {activeModule === 'pricing' && (
                <PricingAndProfitModule
                  payments={payments}
                  websites={websites}
                  suppliers={suppliers}
                  clients={clients}
                  orders={orders}
                  settings={settings}
                  onNotify={notify}
                />
              )}

              {/* MODULE 6: ORDER PIPELINE (11 STAGES) */}
              {activeModule === 'orders' && (
                <OrderManagementModule
                  orders={orders}
                  clients={clients}
                  websites={websites}
                  suppliers={suppliers}
                  currency={currency}
                  onNotify={notify}
                />
              )}

              {/* MODULE 7: EMAIL ASSISTANT */}
              {activeModule === 'email' && (
                <EmailAssistantModule
                  outreachList={outreachList}
                  orders={orders}
                  websites={websites}
                  clients={clients}
                  businessName={settings?.businessName || 'GuestPilot AI'}
                  onNotify={notify}
                />
              )}

              {/* MODULE 8: BACKLINK VERIFICATION & PDF DELIVERY REPORTS */}
              {activeModule === 'verification' && (
                <BacklinkVerificationAndReportsModule
                  deliveries={deliveries}
                  orders={orders}
                  clients={clients}
                  settings={settings}
                  onNotify={notify}
                />
              )}

              {/* MODULE 9: SETTINGS & MASTER KEY MANAGER */}
              {activeModule === 'settings' && (
                <div className="space-y-8">
                  <div className="border-b border-zinc-800 pb-5">
                    <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
                      System Settings & Security Management
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1">
                      Manage your custom Admin Master Key, local persistence backup, and business invoice defaults.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* MASTER KEY & SECURITY TOKEN MANAGEMENT */}
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-5">
                      <div className="border-b border-zinc-800 pb-3">
                        <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                          <Key className="w-4 h-4" />
                          <span>Admin Master Key & Security Token</span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">
                          You can change your secret admin passkey or generate a 256-bit style access token anytime.
                        </p>
                      </div>

                      <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-1.5">
                        <div className="text-[11px] text-zinc-400">Current Active Master Passkey:</div>
                        <div className="font-mono text-emerald-300 text-xs font-semibold select-all break-all">
                          {customKeyDisplay}
                        </div>
                      </div>

                      <form onSubmit={handleUpdateMasterKey} className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-zinc-300 mb-1">
                            Set New Master Passkey or Access Token:
                          </label>
                          <input
                            type="text"
                            value={newKeyInput}
                            onChange={(e) => setNewKeyInput(e.target.value)}
                            placeholder="Enter new master key (min 6 chars)"
                            className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono"
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="submit"
                            className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg"
                          >
                            Save New Key
                          </button>
                          <button
                            type="button"
                            onClick={handleGenerateKey}
                            className="px-3 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg"
                          >
                            Generate Token
                          </button>
                          <button
                            type="button"
                            onClick={handleResetToDefaultKey}
                            className="px-3 py-2 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-400 rounded-lg"
                          >
                            Reset Default
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* DATABASE & BACKUP MANAGER */}
                    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-5">
                      <div className="border-b border-zinc-800 pb-3">
                        <div className="flex items-center gap-2 text-zinc-200 font-semibold text-sm">
                          <Database className="w-4 h-4 text-emerald-400" />
                          <span>Local Persistence & JSON Backup</span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-1">
                          Export complete snapshots or restore from previously saved JSON backups.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
                          <div className="text-[10px] text-zinc-500">Websites</div>
                          <div className="text-zinc-200 font-bold">{websites.length} records</div>
                        </div>
                        <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
                          <div className="text-[10px] text-zinc-500">Orders</div>
                          <div className="text-zinc-200 font-bold">{orders.length} records</div>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2">
                        <button
                          type="button"
                          onClick={handleExportBackup}
                          className="w-full py-2.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium text-xs rounded-lg flex items-center justify-center gap-2"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Download Full Database Backup (.JSON)</span>
                        </button>

                        <label className="w-full py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium text-xs rounded-lg flex items-center justify-center gap-2 cursor-pointer">
                          <Upload className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Restore Database from File (.JSON)</span>
                          <input
                            ref={backupInputRef}
                            type="file"
                            accept=".json"
                            onChange={handleImportBackup}
                            className="hidden"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={handleResetSampleData}
                          className="w-full py-2 px-3 text-zinc-500 hover:text-amber-400 text-[11px] flex items-center justify-center gap-1.5"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Reset to Verified Industry Catalog</span>
                        </button>
                      </div>
                    </div>

                    {/* BUSINESS & INVOICE PREFERENCES */}
                    <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4">
                      <div className="border-b border-zinc-800 pb-3">
                        <h3 className="text-sm font-semibold text-zinc-100">
                          Reseller Business & Billing Defaults
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1">
                          These details are automatically embedded into your generated Quotation and Delivery PDFs.
                        </p>
                      </div>

                      <form onSubmit={handleSaveSettings} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-zinc-300 mb-1">
                              Agency / Reseller Business Name
                            </label>
                            <input
                              type="text"
                              value={settingsBusinessName}
                              onChange={(e) => setSettingsBusinessName(e.target.value)}
                              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-medium"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-zinc-300 mb-1">
                              Default Currency Display
                            </label>
                            <input
                              type="text"
                              value={settingsCurrency}
                              onChange={(e) => setSettingsCurrency(e.target.value)}
                              placeholder="USD ($)"
                              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-zinc-300 mb-1">
                              Standard Payment Terms
                            </label>
                            <input
                              type="text"
                              value={settingsPaymentTerms}
                              onChange={(e) => setSettingsPaymentTerms(e.target.value)}
                              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-zinc-300 mb-1">
                              Invoice & Quotation Footer Notes
                            </label>
                            <textarea
                              rows={2}
                              value={settingsInvoiceNotes}
                              onChange={(e) => setSettingsInvoiceNotes(e.target.value)}
                              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={savingSettings}
                          className="px-4 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg"
                        >
                          {savingSettings ? 'Saving...' : 'Save Business Settings'}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Floating Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-3.5 rounded-xl border shadow-lg text-xs font-medium flex items-center justify-between gap-3 ${
              t.type === 'error'
                ? 'bg-red-950/95 border-red-800 text-red-200'
                : t.type === 'success'
                ? 'bg-zinc-900/95 border-emerald-500/40 text-emerald-300'
                : 'bg-zinc-900/95 border-zinc-700 text-zinc-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() =>
                setToasts((prev) => prev.filter((item) => item.id !== t.id))
              }
              className="text-zinc-400 hover:text-zinc-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
