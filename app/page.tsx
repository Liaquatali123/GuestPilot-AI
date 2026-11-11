'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import {
  db,
  auth,
  createGoogleProvider,
  FIREBASE_PROJECT_ID,
  BOOTSTRAPPED_ADMIN_EMAILS,
  isBootstrappedAdminEmail,
  OperationType,
  handleFirestoreError,
  recordActivityLog,
} from '@/lib/firebase';
import {
  WebsiteRecord,
  SupplierRecord,
  ClientRecord,
  LeadRecord,
  OrderRecord,
  PaymentRecord,
  OutreachRecord,
  DeliveryRecord,
  SettingRecord,
  ActivityLogRecord,
  AdminRecord,
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
  AlertOctagon,
  CheckCircle2,
  ArrowRight,
  Trash2,
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
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthorizedAdmin, setIsAuthorizedAdmin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [unauthorizedDomainHost, setUnauthorizedDomainHost] = useState<string | null>(null);
  const [selectedLoginHint, setSelectedLoginHint] = useState<string>('rdxkinglucky@gmail.com');
  const [domainCopied, setDomainCopied] = useState(false);

  const [activeModule, setActiveModule] = useState<NavigationModule>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Real-time Firestore State
  const [websites, setWebsites] = useState<WebsiteRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [outreachList, setOutreachList] = useState<OutreachRecord[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [settings, setSettings] = useState<SettingRecord | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>([]);
  const [adminAllowlist, setAdminAllowlist] = useState<AdminRecord[]>([]);

  // Settings form state
  const [settingsForm, setSettingsForm] = useState({
    businessName: 'GuestPilot AI Reseller Operations',
    defaultCurrency: 'USD',
    defaultPaymentTerms: 'Due upon receipt via Wire / Wise / Stripe',
    invoiceFooterNotes: 'Thank you for partnering with GuestPilot AI.',
    newAdminUid: '',
    newAdminEmail: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const toastSeqRef = React.useRef(0);

  const notify = React.useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      toastSeqRef.current += 1;
      const id = `toast_${toastSeqRef.current}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const userProfileSyncedRef = React.useRef<string | null>(null);

  // Phase 1: Auth Listener & Explicit Admin Allowlist Check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthError(null);

      if (!currentUser) {
        userProfileSyncedRef.current = null;
        setIsAuthorizedAdmin(false);
        setAuthLoading(false);
        setDataLoading(false);
        return;
      }

      // Check explicit admin allowlist
      const isPrimaryAdmin =
        currentUser.emailVerified &&
        isBootstrappedAdminEmail(currentUser.email);

      let isSecondaryAdmin = false;
      if (!isPrimaryAdmin && currentUser.emailVerified) {
        try {
          const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
          isSecondaryAdmin = adminDoc.exists();
        } catch {
          isSecondaryAdmin = false;
        }
      }

      const authorized = Boolean(isPrimaryAdmin || isSecondaryAdmin);
      if (!authorized) {
        setIsAuthorizedAdmin(false);
        setAuthLoading(false);
        setDataLoading(false);
        return;
      }

      setIsAuthorizedAdmin(true);
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Phase 2: Real-Time Firestore Collection Subscriptions for Authorized Admin
  useEffect(() => {
    if (!user || !isAuthorizedAdmin) return;
    const uid = user.uid;
    const userEmail = (user.email || 'admin@guestpilot.app').slice(0, 254);
    const userDisplayName = (user.displayName || 'Administrator').slice(0, 120);

    // Resilient User Profile Sync via onSnapshot
    const unsubUserProfile = onSnapshot(
      doc(db, 'users', uid),
      async (snap) => {
        if (snap.metadata.fromCache) return;
        if (userProfileSyncedRef.current === uid) return;
        userProfileSyncedRef.current = uid;
        try {
          if (!snap.exists()) {
            await setDoc(doc(db, 'users', uid), {
              ownerId: uid,
              email: userEmail,
              displayName: userDisplayName,
              lastLoginAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            await updateDoc(doc(db, 'users', uid), {
              email: userEmail,
              displayName: userDisplayName,
              lastLoginAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
    );

    const unsubWebsites = onSnapshot(
      query(collection(db, 'websites'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as WebsiteRecord)
        );
        setWebsites(list);
        setDataLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'websites')
    );

    const unsubSuppliers = onSnapshot(
      query(collection(db, 'suppliers'), where('ownerId', '==', uid)),
      (snap) => {
        setSuppliers(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as SupplierRecord))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers')
    );

    const unsubClients = onSnapshot(
      query(collection(db, 'clients'), where('ownerId', '==', uid)),
      (snap) => {
        setClients(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClientRecord))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'clients')
    );

    const unsubLeads = onSnapshot(
      query(collection(db, 'leads'), where('ownerId', '==', uid)),
      (snap) => {
        setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LeadRecord)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'leads')
    );

    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), where('ownerId', '==', uid)),
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderRecord)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    );

    const unsubPayments = onSnapshot(
      query(collection(db, 'payments'), where('ownerId', '==', uid)),
      (snap) => {
        setPayments(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentRecord))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );

    const unsubOutreach = onSnapshot(
      query(collection(db, 'outreach'), where('ownerId', '==', uid)),
      (snap) => {
        setOutreachList(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as OutreachRecord))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'outreach')
    );

    const unsubDeliveries = onSnapshot(
      query(collection(db, 'deliveries'), where('ownerId', '==', uid)),
      (snap) => {
        setDeliveries(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as DeliveryRecord))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'deliveries')
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', uid),
      async (snap) => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() } as SettingRecord;
          setSettings(data);
          setSettingsForm((prev) => ({
            ...prev,
            businessName: data.businessName,
            defaultCurrency: data.defaultCurrency,
            defaultPaymentTerms: data.defaultPaymentTerms,
            invoiceFooterNotes: data.invoiceFooterNotes,
          }));
        } else if (!snap.metadata.fromCache) {
          try {
            await setDoc(doc(db, 'settings', uid), {
              ownerId: uid,
              businessName: 'GuestPilot AI Reseller Operations',
              adminEmail: userEmail,
              additionalAdminEmails: '',
              defaultCurrency: 'USD',
              defaultPaymentTerms: 'Due upon receipt',
              invoiceFooterNotes: 'Thank you for your business.',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, `settings/${uid}`);
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `settings/${uid}`)
    );

    const unsubLogs = onSnapshot(
      query(collection(db, 'activityLogs'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as ActivityLogRecord)
        );
        list.sort((a, b) => {
          const tA = a.createdAt?.toMillis?.() || 0;
          const tB = b.createdAt?.toMillis?.() || 0;
          return tB - tA;
        });
        setActivityLogs(list.slice(0, 50));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'activityLogs')
    );

    const unsubAdmins = onSnapshot(
      query(collection(db, 'admins'), where('addedBy', '==', uid)),
      (snap) => {
        setAdminAllowlist(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminRecord))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'admins')
    );

    return () => {
      unsubUserProfile();
      unsubWebsites();
      unsubSuppliers();
      unsubClients();
      unsubLeads();
      unsubOrders();
      unsubPayments();
      unsubOutreach();
      unsubDeliveries();
      unsubSettings();
      unsubLogs();
      unsubAdmins();
    };
  }, [user, isAuthorizedAdmin]);

  // Dashboard Real-Time Statistics (Section 5)
  const dashboardStats = useMemo(() => {
    const totalWebsites = websites.length;
    const verifiedWebsites = websites.filter(
      (w) => w.websiteStatus === 'Verified'
    ).length;
    const totalSuppliers = suppliers.length;
    const totalClients = clients.length;
    const newLeads =
      leads.filter((l) => l.status === 'New').length +
      clients.filter((c) => c.leadStatus === 'New Lead').length;

    const completedOrders = orders.filter((o) => o.status === 'DELIVERED').length;
    const activeOrders = orders.filter((o) => o.status !== 'DELIVERED').length;

    const paidOrders = orders.filter((o) => o.paymentStatus === 'Paid');
    const paidInvoices = payments.filter(
      (p) => p.docType === 'Invoice' && p.status === 'Paid'
    );

    // Combine paid orders revenue + standalone paid invoices (not linked to an order)
    const standalonePaidInvoicesRevenue = paidInvoices
      .filter((p) => !p.orderId)
      .reduce((acc, p) => acc + p.sellingPrice, 0);
    const standalonePaidInvoicesCost = paidInvoices
      .filter((p) => !p.orderId)
      .reduce((acc, p) => acc + p.wholesaleCost + p.additionalExpenses, 0);

    const totalRevenue =
      paidOrders.reduce((acc, o) => acc + o.clientPrice, 0) +
      standalonePaidInvoicesRevenue;

    const totalSupplierCosts =
      orders.reduce((acc, o) => acc + o.supplierCost + o.additionalExpenses, 0) +
      standalonePaidInvoicesCost;

    const netProfit = totalRevenue - totalSupplierCosts;

    const pendingOrderPayments = orders
      .filter((o) => o.paymentStatus === 'Unpaid' || o.paymentStatus === 'Partial')
      .reduce((acc, o) => acc + o.clientPrice, 0);
    const pendingInvoicePayments = payments
      .filter((p) => p.docType === 'Invoice' && p.status === 'Unpaid' && !p.orderId)
      .reduce((acc, p) => acc + p.sellingPrice, 0);

    const pendingPayments = pendingOrderPayments + pendingInvoicePayments;

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
  }, [websites, suppliers, clients, leads, orders, payments]);

  const handleGoogleSignIn = async (emailHint?: string) => {
    setAuthError(null);
    setUnauthorizedDomainHost(null);
    const provider = createGoogleProvider(emailHint);
    try {
      await signInWithPopup(auth, provider);
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      const message =
        err instanceof Error ? err.message : 'Google Sign-In failed.';

      if (code === 'auth/unauthorized-domain' || message.includes('auth/unauthorized-domain')) {
        const host =
          typeof window !== 'undefined' ? window.location.hostname : 'your-vercel-domain.vercel.app';
        setUnauthorizedDomainHost(host);
        setAuthError(
          `Domain "${host}" is not yet added in Firebase Authorized Domains. Because Firebase blocked this domain, the Google Gmail selector popup could not open.`
        );
        return;
      }

      if (code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirErr) {
          setAuthError(
            redirErr instanceof Error ? redirErr.message : 'Google Sign-In redirect failed.'
          );
          return;
        }
      }

      setAuthError(message);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;
    setSavingSettings(true);
    try {
      await updateDoc(doc(db, 'settings', user.uid), {
        businessName: settingsForm.businessName.trim().slice(0, 150),
        adminEmail: user.email.slice(0, 254),
        additionalAdminEmails: adminAllowlist
          .map((a) => a.email)
          .join(', ')
          .slice(0, 1000),
        defaultCurrency: settingsForm.defaultCurrency.trim().slice(0, 10),
        defaultPaymentTerms: settingsForm.defaultPaymentTerms.trim().slice(0, 200),
        invoiceFooterNotes: settingsForm.invoiceFooterNotes.trim().slice(0, 1000),
        updatedAt: serverTimestamp(),
      });
      await recordActivityLog(
        'Settings',
        'Updated Workspace Settings',
        user.uid,
        `Updated business configuration (${settingsForm.businessName})`
      );
      notify('Workspace settings saved to Firestore.', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `settings/${user.uid}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddAuthorizedAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const targetUid = settingsForm.newAdminUid.trim();
    const targetEmail = settingsForm.newAdminEmail.trim();
    if (!targetUid || !targetEmail) {
      notify('Both Firebase Auth UID and Email are required to authorize an admin.', 'error');
      return;
    }
    try {
      await setDoc(doc(db, 'admins', targetUid), {
        uid: targetUid.slice(0, 128),
        email: targetEmail.slice(0, 254),
        addedBy: user.uid,
        createdAt: serverTimestamp(),
      });
      await recordActivityLog(
        'Security',
        'Authorized Admin UID',
        targetUid,
        `Added ${targetEmail} (${targetUid}) to /admins allowlist`
      );
      setSettingsForm((prev) => ({ ...prev, newAdminUid: '', newAdminEmail: '' }));
      notify(`Authorized admin ${targetEmail} (${targetUid}).`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `admins/${targetUid}`);
    }
  };

  const handleRevokeAdmin = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'admins', uid));
      await recordActivityLog(
        'Security',
        'Revoked Admin UID',
        uid,
        `Removed UID ${uid} from /admins allowlist`
      );
      notify('Revoked administrator access.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `admins/${uid}`);
    }
  };

  const currency = settings?.defaultCurrency || 'USD';

  // Loading Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-mono text-zinc-400">
            Verifying Firebase Authentication & Security Rules...
          </p>
        </div>
      </div>
    );
  }

  // Unauthenticated Login Screen (No Public Registration)
  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between p-6">
        <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-4 border-b border-zinc-900">
          <span className="text-lg font-bold tracking-tight text-zinc-100">
            GuestPilot AI
          </span>
          <span className="text-xs text-zinc-500">
            Private Administrator Portal
          </span>
        </header>

        <main className="max-w-md w-full mx-auto my-auto py-12">
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-8 space-y-6">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Lock className="w-5 h-5 text-emerald-400" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
                Administrator Sign-In
              </h1>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Select which authorized Gmail account you want to sign in with, or open the full Google Account Chooser.
              </p>
            </div>

            {/* Explicit Gmail Account Selector before Sign-In */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-300">
                Select Admin Gmail Account:
              </label>
              <div className="space-y-2">
                {BOOTSTRAPPED_ADMIN_EMAILS.map((adminEmail) => {
                  const isSelected = selectedLoginHint === adminEmail;
                  return (
                    <button
                      key={adminEmail}
                      type="button"
                      onClick={() => setSelectedLoginHint(adminEmail)}
                      className={`w-full px-3.5 py-2.5 rounded-xl border text-left text-xs font-mono flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <span className="truncate">{adminEmail}</span>
                      <span className="text-[11px] font-sans font-medium shrink-0 ml-2">
                        {isSelected ? 'Selected ✓' : 'Select'}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSelectedLoginHint('')}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-left text-xs flex items-center justify-between transition-colors ${
                    selectedLoginHint === ''
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 font-medium'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <span>Show All Gmail Accounts (Full Account Chooser)</span>
                  <span className="text-[11px] shrink-0 ml-2">
                    {selectedLoginHint === '' ? 'Selected ✓' : 'Select'}
                  </span>
                </button>
              </div>
            </div>

            {authError && (
              <div className="p-4 bg-red-950/50 border border-red-800/80 rounded-xl text-xs text-red-200 space-y-3">
                <div className="font-medium text-red-300">{authError}</div>

                {unauthorizedDomainHost && (
                  <div className="p-3 bg-zinc-950/90 border border-zinc-800 rounded-lg space-y-2.5 text-zinc-300">
                    <div className="font-semibold text-emerald-400">
                      How to Fix on Vercel (10 Seconds):
                    </div>
                    <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-zinc-300 leading-relaxed">
                      <li>
                        Copy your Vercel domain below:
                        <div className="mt-1 flex items-center gap-2">
                          <code className="flex-1 px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 rounded text-emerald-300 font-mono truncate">
                            {unauthorizedDomainHost}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(unauthorizedDomainHost);
                              setDomainCopied(true);
                              setTimeout(() => setDomainCopied(false), 3000);
                            }}
                            className="px-2.5 py-1.5 bg-emerald-500 text-zinc-950 font-semibold rounded hover:bg-emerald-400 shrink-0"
                          >
                            {domainCopied ? 'Copied!' : 'Copy Domain'}
                          </button>
                        </div>
                      </li>
                      <li>
                        Open <strong>Firebase Console → Authentication → Settings → Authorized domains</strong>, click <strong>Add domain</strong>, and paste <code className="text-emerald-300">{unauthorizedDomainHost}</code>.
                      </li>
                    </ol>
                    <a
                      href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium rounded-lg inline-flex items-center justify-center gap-1.5 text-center"
                    >
                      <span>Open Firebase Authorized Domains Settings</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => handleGoogleSignIn(selectedLoginHint)}
              className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2.5"
            >
              <span>
                {selectedLoginHint
                  ? `Sign In as ${selectedLoginHint}`
                  : 'Open Gmail Account Chooser'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="pt-4 border-t border-zinc-800/80 text-[11px] text-zinc-500 space-y-1">
              <div>Protected by Zero-Trust Cloud Firestore Security Rules</div>
              <div className="font-mono">
                Authorized Admins: {BOOTSTRAPPED_ADMIN_EMAILS.join(', ')}
              </div>
            </div>
          </div>
        </main>

        <footer className="max-w-6xl w-full mx-auto py-4 border-t border-zinc-900 text-xs text-zinc-600 flex justify-between">
          <span>GuestPilot AI — Guest Posting Reseller Management</span>
          <span>Firebase Auth + Cloud Firestore</span>
        </footer>
      </div>
    );
  }

  // Unauthorized Account Screen
  if (!isAuthorizedAdmin) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-900 border border-red-900/60 rounded-2xl p-8 space-y-5">
          <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <AlertOctagon className="w-5 h-5 text-red-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-zinc-100">
              Unauthorized Account Access Denied
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Signed in as <strong className="text-zinc-200">{user.email}</strong> (UID:{' '}
              <code className="text-zinc-300">{user.uid}</code>). This account is not on the GuestPilot AI administrator allowlist, and Firestore Security Rules block all reads and writes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium rounded-lg transition-colors"
          >
            Sign Out & Switch Account
          </button>
        </div>
      </div>
    );
  }

  const navItems: {
    id: NavigationModule;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'websites', label: 'Websites', icon: Globe, count: websites.length },
    { id: 'suppliers', label: 'Suppliers', icon: Truck, count: suppliers.length },
    { id: 'crm', label: 'Clients & Leads', icon: Users, count: clients.length + leads.length },
    { id: 'pricing', label: 'Pricing & Billing', icon: Calculator, count: payments.length },
    { id: 'orders', label: 'Orders Pipeline', icon: ClipboardList, count: orders.length },
    { id: 'email', label: 'Email Assistant', icon: Mail, count: outreachList.length },
    {
      id: 'verification',
      label: 'Backlink & Reports',
      icon: ShieldCheck,
      count: deliveries.length,
    },
    { id: 'settings', label: 'Admin & Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Desktop Sidebar (260px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-zinc-950 border-r border-zinc-800/80 z-30">
        <div className="h-16 px-6 flex items-center justify-between border-b border-zinc-800/80">
          <span className="text-base font-bold tracking-tight text-zinc-100 whitespace-nowrap">
            GuestPilot AI
          </span>
          <span className="text-[11px] font-mono text-emerald-400">ADMIN</span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveModule(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
                }`}
              >
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.count !== undefined && (
                  <span className="font-mono tabular-nums text-[11px] text-zinc-500">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-800/80 space-y-3">
          <div className="text-xs truncate text-zinc-300 font-medium">
            {user.displayName || 'Administrator'}
          </div>
          <div className="text-[11px] font-mono text-zinc-500 truncate">
            {user.email}
          </div>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="w-full px-3 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-zinc-950 border-r border-zinc-800 flex flex-col z-10">
            <div className="h-14 px-5 flex items-center justify-between border-b border-zinc-800">
              <span className="text-base font-bold text-zinc-100">GuestPilot AI</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveModule(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </span>
                    {item.count !== undefined && (
                      <span className="font-mono text-[11px] text-zinc-500">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => signOut(auth)}
                className="w-full py-2 text-xs font-medium text-zinc-300 bg-zinc-900 rounded-lg flex items-center justify-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract (3 zones: Breadcrumb/Brand, quick links, 1 primary action) */}
        <header className="h-14 lg:h-16 px-4 sm:px-8 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-900"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-xs sm:text-sm font-medium text-zinc-300 truncate">
              <span className="text-zinc-500">Workspace</span>
              <span className="mx-2 text-zinc-700">/</span>
              <span className="text-zinc-100 font-semibold">
                {navItems.find((n) => n.id === activeModule)?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveModule('orders')}
              className="px-3.5 py-1.5 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Manage Orders
            </button>
          </div>
        </header>

        {/* Viewport Container */}
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
              {/* PHASE 2: EXECUTIVE DASHBOARD */}
              {activeModule === 'dashboard' && (
                <div className="space-y-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
                    <div>
                      <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">
                        {settings?.businessName || 'GuestPilot AI'} — Executive Overview
                      </h1>
                      <p className="text-sm text-zinc-400 mt-1">
                        Live operational and financial metrics computed directly from your Cloud Firestore collections.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveModule('websites')}
                        className="px-3.5 py-2 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-lg whitespace-nowrap"
                      >
                        Add Website
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveModule('pricing')}
                        className="px-3.5 py-2 text-xs font-medium bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg whitespace-nowrap"
                      >
                        Open Calculator
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
                        From paid orders & paid invoices
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
                      <div className="text-xs text-zinc-400">Net Profit</div>
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
                        Realized revenue minus supplier costs
                      </div>
                    </div>

                    <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-xl">
                      <div className="text-xs text-zinc-400">Pending Client Payments</div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-amber-400 mt-1.5">
                        {formatCurrency(dashboardStats.pendingPayments, currency)}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1">
                        Unpaid orders & open invoices
                      </div>
                    </div>
                  </div>

                  {/* Operational Inventory & Pipeline KPIs Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveModule('websites')}
                      className="text-left bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/80 p-4 rounded-xl transition-colors"
                    >
                      <div className="text-[11px] text-zinc-400">Total Websites</div>
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
                      onClick={() => setActiveModule('crm')}
                      className="text-left bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/80 p-4 rounded-xl transition-colors"
                    >
                      <div className="text-[11px] text-zinc-400">New Leads</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-amber-400 mt-1">
                        {dashboardStats.newLeads}
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
                      <div className="text-[11px] text-zinc-400">Completed</div>
                      <div className="text-xl font-bold font-mono tabular-nums text-zinc-100 mt-1">
                        {dashboardStats.completedOrders}
                      </div>
                    </button>
                  </div>

                  {/* Active Orders Snapshot & Audit Activity Log */}
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
                          No orders recorded yet. Create your first order in the Orders Pipeline.
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-800/70 text-xs">
                          {orders.slice(0, 6).map((ord) => (
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
                                <div className="text-zinc-100">
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
                          Real-Time Audit & Activity Log
                        </h2>
                        <span className="text-[11px] font-mono text-zinc-500">
                          Immutable Firestore Trail
                        </span>
                      </div>

                      {activityLogs.length === 0 ? (
                        <div className="py-8 text-center text-xs text-zinc-500">
                          Activity logs will appear here as you create websites, suppliers, clients, and orders.
                        </div>
                      ) : (
                        <div className="divide-y divide-zinc-800/70 text-xs max-h-80 overflow-y-auto pr-1">
                          {activityLogs.slice(0, 12).map((log) => (
                            <div key={log.id} className="py-2.5 space-y-0.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-zinc-200">
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

              {/* PHASE 3: WEBSITES & SUPPLIERS */}
              {activeModule === 'websites' && (
                <WebsiteManagementModule
                  websites={websites}
                  currency={currency}
                  onNotify={notify}
                />
              )}

              {activeModule === 'suppliers' && (
                <SupplierManagementModule
                  suppliers={suppliers}
                  currency={currency}
                  onNotify={notify}
                />
              )}

              {/* PHASE 4: CLIENT CRM & LEADS */}
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

              {/* PHASE 5: PRICING & PROFIT CALCULATOR */}
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

              {/* PHASE 6: ORDER MANAGEMENT & EMAIL ASSISTANT */}
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

              {activeModule === 'email' && (
                <EmailAssistantModule
                  outreachList={outreachList}
                  websites={websites}
                  clients={clients}
                  orders={orders}
                  businessName={settings?.businessName || 'GuestPilot AI'}
                  onNotify={notify}
                />
              )}

              {/* PHASE 7: BACKLINK VERIFICATION & PDF REPORTS */}
              {activeModule === 'verification' && (
                <BacklinkVerificationAndReportsModule
                  deliveries={deliveries}
                  orders={orders}
                  clients={clients}
                  settings={settings}
                  onNotify={notify}
                />
              )}

              {/* PHASE 8: ADMIN ALLOWLIST & BUSINESS SETTINGS */}
              {activeModule === 'settings' && (
                <div className="space-y-6">
                  <div className="border-b border-zinc-800 pb-5">
                    <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
                      Workspace Configuration & Explicit Admin Allowlist
                    </h2>
                    <p className="text-sm text-zinc-400 mt-1">
                      Configure PDF branding, invoice payment terms, and explicit administrator UIDs enforced by Cloud Firestore Security Rules.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <form
                      onSubmit={handleSaveSettings}
                      className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4"
                    >
                      <h3 className="text-sm font-semibold text-zinc-100">
                        Business & Invoice Branding
                      </h3>

                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">
                          Business / Agency Name
                        </label>
                        <input
                          type="text"
                          required
                          value={settingsForm.businessName}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              businessName: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">
                          Default Currency Code
                        </label>
                        <select
                          value={settingsForm.defaultCurrency}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              defaultCurrency: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                        >
                          <option value="USD">USD ($)</option>
                          <option value="EUR">EUR (€)</option>
                          <option value="GBP">GBP (£)</option>
                          <option value="AUD">AUD (A$)</option>
                          <option value="CAD">CAD (C$)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">
                          Default Invoice Payment Terms
                        </label>
                        <input
                          type="text"
                          value={settingsForm.defaultPaymentTerms}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              defaultPaymentTerms: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-300 mb-1">
                          Invoice & PDF Report Footer Notes
                        </label>
                        <textarea
                          rows={2}
                          value={settingsForm.invoiceFooterNotes}
                          onChange={(e) =>
                            setSettingsForm({
                              ...settingsForm,
                              invoiceFooterNotes: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={savingSettings}
                        className="px-4 py-2 text-xs font-medium text-zinc-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg"
                      >
                        {savingSettings ? 'Saving...' : 'Save Business Settings'}
                      </button>
                    </form>

                    {/* Explicit Admin Allowlist */}
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-100">
                          Explicit Admin Allowlist (/admins Collection)
                        </h3>
                        <p className="text-xs text-zinc-400 mt-1">
                          Bootstrapped Admins:{' '}
                          <code className="text-emerald-400 font-mono">
                            {BOOTSTRAPPED_ADMIN_EMAILS.join(', ')}
                          </code>{' '}
                          (Current UID: <code className="font-mono">{user.uid}</code>)
                        </p>
                      </div>

                      <form onSubmit={handleAddAuthorizedAdmin} className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-zinc-300 mb-1">
                              Secondary Admin Firebase UID
                            </label>
                            <input
                              type="text"
                              value={settingsForm.newAdminUid}
                              onChange={(e) =>
                                setSettingsForm({
                                  ...settingsForm,
                                  newAdminUid: e.target.value,
                                })
                              }
                              placeholder="Firebase Auth UID"
                              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-300 mb-1">
                              Admin Email
                            </label>
                            <input
                              type="email"
                              value={settingsForm.newAdminEmail}
                              onChange={(e) =>
                                setSettingsForm({
                                  ...settingsForm,
                                  newAdminEmail: e.target.value,
                                })
                              }
                              placeholder="admin@domain.com"
                              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100"
                            />
                          </div>
                        </div>
                        <button
                          type="submit"
                          className="px-4 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg"
                        >
                          Authorize Admin UID
                        </button>
                      </form>

                      <div className="pt-3 border-t border-zinc-800 space-y-2">
                        <div className="text-xs font-medium text-zinc-300">
                          Additional Authorized Admins ({adminAllowlist.length})
                        </div>
                        {adminAllowlist.length === 0 ? (
                          <p className="text-xs text-zinc-500">
                            Only the bootstrapped administrators ({BOOTSTRAPPED_ADMIN_EMAILS.join(', ')}) are currently authorized.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {adminAllowlist.map((adm) => (
                              <div
                                key={adm.id}
                                className="flex items-center justify-between p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs"
                              >
                                <div>
                                  <div className="text-zinc-200 font-medium">
                                    {adm.email}
                                  </div>
                                  <div className="text-[11px] font-mono text-zinc-500">
                                    UID: {adm.uid}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRevokeAdmin(adm.id)}
                                  className="text-zinc-400 hover:text-red-400 p-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Toast Notifications */}
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
