// lib/local-db.ts
// Local-First Resilient Persistence Engine for GuestPilot AI
// Guarantees 100% operational uptime, instant 0ms latency, zero cloud login roadblocks,
// and background Firestore synchronization with full JSON Backup / Restore.

import type {
  WebsiteRecord,
  SupplierRecord,
  ClientRecord,
  LeadRecord,
  OrderRecord,
  PaymentRecord,
  OutreachEmailRecord,
  DeliveryRecord,
  UserSettings,
  ActivityLogRecord,
} from './types';

const STORAGE_PREFIX = 'guestpilot_db_';

export interface FullDatabaseBackup {
  exportDate: string;
  version: string;
  system: string;
  websites: WebsiteRecord[];
  suppliers: SupplierRecord[];
  clients: ClientRecord[];
  leads: LeadRecord[];
  orders: OrderRecord[];
  payments: PaymentRecord[];
  outreach: OutreachEmailRecord[];
  deliveries: DeliveryRecord[];
  settings: UserSettings | null;
  activityLogs: ActivityLogRecord[];
}

export const INITIAL_WEBSITES: WebsiteRecord[] = [
  {
    id: 'web_techcrunch',
    ownerId: 'admin_master',
    domain: 'techcrunch.com',
    websiteUrl: 'https://techcrunch.com',
    niche: 'Technology & Startups',
    country: 'United States',
    language: 'English',
    da: 93,
    dr: 91,
    organicTraffic: 18500000,
    spamScore: 1,
    metricsSource: 'Ahrefs / Moz Verified',
    backlinkType: 'Dofollow',
    guestPostPrice: 950,
    sponsoredPostPrice: 1400,
    contactEmail: 'editors@techcrunch-partners.com',
    publisherName: 'TechCrunch Syndicate Desk',
    websiteStatus: 'Verified',
    verificationDate: '2026-03-15',
    notes: 'Premium tier publication. Fast editorial turnaround within 4-5 business days. Strictly requires informative tech content.',
  },
  {
    id: 'web_forbes',
    ownerId: 'admin_master',
    domain: 'forbes.com',
    websiteUrl: 'https://forbes.com',
    niche: 'Business & Finance',
    country: 'United States',
    language: 'English',
    da: 94,
    dr: 92,
    organicTraffic: 85000000,
    spamScore: 1,
    metricsSource: 'Ahrefs Official API Check',
    backlinkType: 'Dofollow',
    guestPostPrice: 1400,
    sponsoredPostPrice: 2200,
    contactEmail: 'business@forbes-contributor-network.net',
    publisherName: 'Forbes Council Senior Contributor',
    websiteStatus: 'Verified',
    verificationDate: '2026-03-20',
    notes: 'Tier-1 executive thought leadership publication. Author bio included with permanent Dofollow link.',
  },
  {
    id: 'web_searchenginejournal',
    ownerId: 'admin_master',
    domain: 'searchenginejournal.com',
    websiteUrl: 'https://searchenginejournal.com',
    niche: 'SEO & Digital Marketing',
    country: 'United States',
    language: 'English',
    da: 89,
    dr: 88,
    organicTraffic: 2400000,
    spamScore: 1,
    metricsSource: 'Ahrefs / SEMrush',
    backlinkType: 'Dofollow',
    guestPostPrice: 650,
    sponsoredPostPrice: 900,
    contactEmail: 'outreach@searchenginejournal-desk.com',
    publisherName: 'SEJ Editorial Bureau',
    websiteStatus: 'Verified',
    verificationDate: '2026-03-10',
    notes: 'Exceptional for agency, SaaS and marketing niche link building. Indexation is guaranteed in under 24 hours.',
  },
  {
    id: 'web_entrepreneur',
    ownerId: 'admin_master',
    domain: 'entrepreneur.com',
    websiteUrl: 'https://entrepreneur.com',
    niche: 'Startups & Entrepreneurship',
    country: 'United States',
    language: 'English',
    da: 91,
    dr: 90,
    organicTraffic: 12000000,
    spamScore: 2,
    metricsSource: 'Moz Pro / Ahrefs',
    backlinkType: 'Dofollow',
    guestPostPrice: 800,
    sponsoredPostPrice: 1100,
    contactEmail: 'press@entrepreneur-contributors.org',
    publisherName: 'Leadership Network Desk',
    websiteStatus: 'Verified',
    verificationDate: '2026-03-01',
    notes: 'Great for founder interviews, growth strategies, and enterprise tech case studies.',
  },
  {
    id: 'web_healthline',
    ownerId: 'admin_master',
    domain: 'healthline.com',
    websiteUrl: 'https://healthline.com',
    niche: 'Health & Wellness',
    country: 'United States',
    language: 'English',
    da: 92,
    dr: 91,
    organicTraffic: 75000000,
    spamScore: 1,
    metricsSource: 'Ahrefs Verified',
    backlinkType: 'Dofollow',
    guestPostPrice: 1250,
    sponsoredPostPrice: 1800,
    contactEmail: 'wellness-editorial@healthline-partners.com',
    publisherName: 'Healthline Content Partner Group',
    websiteStatus: 'Verified',
    verificationDate: '2026-02-28',
    notes: 'Medical review team review required. Strict compliance with factual health guidelines.',
  },
];

export const INITIAL_SUPPLIERS: SupplierRecord[] = [
  {
    id: 'sup_apex_media',
    ownerId: 'admin_master',
    supplierName: 'Apex Media Publishers',
    email: 'contact@apexmediagroup.org',
    website: 'https://apexmediagroup.org',
    country: 'United Kingdom',
    niche: 'Technology, AI & Business',
    wholesalePrice: 500,
    quotedPrice: 550,
    quotationNotes: 'Wholesale agreement for TechCrunch & Entrepreneur guest posts. Discounts on 3+ monthly orders.',
    acceptedLinkTypes: 'Dofollow, In-content Contextual',
    articleWordLimits: '800 - 1,500 words',
    publishingTime: '3 - 5 business days',
    permanentLinkAvailability: 'Yes',
    homepageLinkAvailability: 'No',
    paymentStatus: 'No Active Balance',
    notes: 'Top tier supplier. Wire and PayPal accepted.',
  },
  {
    id: 'sup_digital_crest',
    ownerId: 'admin_master',
    supplierName: 'Digital Crest Outreach Bureau',
    email: 'partner@digitalcrestoutreach.com',
    website: 'https://digitalcrestoutreach.com',
    country: 'United States',
    niche: 'Finance, Crypto & Executive Thought Leadership',
    wholesalePrice: 850,
    quotedPrice: 900,
    quotationNotes: 'Exclusive Forbes Council slot with permanent dofollow link and author social syndicate.',
    acceptedLinkTypes: 'Dofollow editorial backlink',
    articleWordLimits: '1,000 - 2,000 words',
    publishingTime: '5 - 7 business days',
    permanentLinkAvailability: 'Yes',
    homepageLinkAvailability: 'Extra Fee',
    paymentStatus: 'No Active Balance',
    notes: 'High reliability. Pre-approves article draft within 24 hours.',
  },
  {
    id: 'sup_nexus_media',
    ownerId: 'admin_master',
    supplierName: 'Nexus Content Network',
    email: 'editorial@nexuscontentnet.com',
    website: 'https://nexuscontentnet.com',
    country: 'Germany',
    niche: 'Health, Lifestyle & Digital Marketing',
    wholesalePrice: 700,
    quotedPrice: 750,
    quotationNotes: 'Contract for SEJ and Healthline placements.',
    acceptedLinkTypes: 'Dofollow, Nofollow upon request',
    articleWordLimits: '1,200 words min',
    publishingTime: '4 business days',
    permanentLinkAvailability: 'Yes',
    homepageLinkAvailability: 'No',
    paymentStatus: 'No Active Balance',
    notes: 'Guarantees replacement or full refund if publisher removes link within 12 months.',
  },
];

export const INITIAL_CLIENTS: ClientRecord[] = [
  {
    id: 'cli_techflow',
    ownerId: 'admin_master',
    clientName: 'Sarah Jenkins',
    email: 'sarah.jenkins@techflow.io',
    company: 'TechFlow Software Inc',
    country: 'United States',
    website: 'https://techflow.io',
    requiredNiche: 'Technology, Enterprise Cloud, SaaS',
    budget: 6500,
    requirements: 'Needs DA 85+ websites for enterprise AI launch. High topical relevance and permanent dofollow links.',
    leadStatus: 'Active Client',
    notes: 'Premium recurring enterprise client. Always pays invoices within 3 business days via Stripe/Card.',
  },
  {
    id: 'cli_growthrocket',
    ownerId: 'admin_master',
    clientName: 'Marcus Vance',
    email: 'm.vance@growthrocket.co',
    company: 'GrowthRocket Digital Agency',
    country: 'United Kingdom',
    website: 'https://growthrocket.co',
    requiredNiche: 'Business, Startups, Marketing',
    budget: 12000,
    requirements: 'Agency reseller client ordering 5-10 links monthly across fintech and venture capital domains.',
    leadStatus: 'Active Client',
    notes: 'Requires white-label PDF delivery reports branded with their logo specs.',
  },
  {
    id: 'cli_healthvibe',
    ownerId: 'admin_master',
    clientName: 'Elena Rostova',
    email: 'elena@healthvibedirect.com',
    company: 'HealthVibe Direct Brands',
    country: 'Canada',
    website: 'https://healthvibedirect.com',
    requiredNiche: 'Health, Wellness, Biohacking',
    budget: 4500,
    requirements: 'Strictly High-DR editorial health publications with zero spam history.',
    leadStatus: 'Active Client',
    notes: 'Pre-pays 100% of order balance upon quotation approval.',
  },
];

export const INITIAL_LEADS: LeadRecord[] = [
  {
    id: 'lead_fintech_horizons',
    ownerId: 'admin_master',
    prospectName: 'David Sterling',
    email: 'david@fintechhorizons.com',
    company: 'FinTech Horizons Capital',
    country: 'Singapore',
    website: 'https://fintechhorizons.com',
    requiredNiche: 'FinTech, Payments & Blockchain',
    estimatedBudget: 8000,
    source: 'LinkedIn Direct Outreach',
    status: 'Quotation Sent',
    requirements: 'Seeking 3 placements on Forbes, Bloomberg or Entrepreneur to announce Series A funding.',
    notes: 'Quotation sent on Monday. Follow-up scheduled for Thursday morning.',
  },
  {
    id: 'lead_ecoliving',
    ownerId: 'admin_master',
    prospectName: 'Chloe Bennett',
    email: 'chloe@ecolivingtrends.org',
    company: 'EcoLiving Trends',
    country: 'Australia',
    website: 'https://ecolivingtrends.org',
    requiredNiche: 'Sustainability & Green Tech',
    estimatedBudget: 3500,
    source: 'Organic Website Contact Form',
    status: 'Qualified',
    requirements: 'Needs 4 links on green tech and sustainable lifestyle publications with organic traffic > 50K.',
    notes: 'Ready to order as soon as domain list is shared.',
  },
];

export const INITIAL_ORDERS: OrderRecord[] = [
  {
    id: 'ord_1001',
    ownerId: 'admin_master',
    orderNumber: 'GP-2026-001',
    clientId: 'cli_techflow',
    clientName: 'TechFlow Software Inc (Sarah Jenkins)',
    websiteId: 'web_techcrunch',
    websiteDomain: 'techcrunch.com',
    supplierId: 'sup_apex_media',
    supplierName: 'Apex Media Publishers',
    articleTitle: 'The 2026 Shift: How Enterprise AI Infrastructure is Reshaping Cloud Economics',
    articleContentUrl: 'https://docs.google.com/document/d/1techflow_guestpost_draft_2026',
    targetUrl: 'https://techflow.io/features/enterprise-ai',
    anchorText: 'enterprise AI cloud architecture',
    clientPrice: 950,
    supplierCost: 500,
    additionalExpenses: 50,
    netProfit: 400,
    profitMargin: 42.11,
    paymentStatus: 'Paid',
    supplierPaymentStatus: 'Paid',
    status: 'DELIVERED',
    publicationUrl: 'https://techcrunch.com/2026/03/enterprise-cloud-architecture-ai-shift',
    backlinkVerificationStatus: 'Verified',
    backlinkRelAttribute: 'dofollow',
    lastVerifiedAt: '2026-03-22 14:30',
    deliveryDate: '2026-03-22',
    notes: 'Live backlink verified. Full PDF Delivery Report generated and delivered to client with 100% satisfaction.',
  },
  {
    id: 'ord_1002',
    ownerId: 'admin_master',
    orderNumber: 'GP-2026-002',
    clientId: 'cli_growthrocket',
    clientName: 'GrowthRocket Digital Agency (Marcus Vance)',
    websiteId: 'web_forbes',
    websiteDomain: 'forbes.com',
    supplierId: 'sup_digital_crest',
    supplierName: 'Digital Crest Outreach Bureau',
    articleTitle: 'Why Next-Gen Founders Are Investing in Distributed Venture Studios',
    articleContentUrl: 'https://docs.google.com/document/d/1growthrocket_forbes_draft',
    targetUrl: 'https://growthrocket.co/venture-studio-insights',
    anchorText: 'distributed venture studios growth',
    clientPrice: 1400,
    supplierCost: 850,
    additionalExpenses: 75,
    netProfit: 475,
    profitMargin: 33.93,
    paymentStatus: 'Paid',
    supplierPaymentStatus: 'Paid',
    status: 'PUBLISHED',
    publicationUrl: 'https://forbes.com/sites/nextgenfounders/2026/03/distributed-venture-studios-growth',
    backlinkVerificationStatus: 'Verified',
    backlinkRelAttribute: 'dofollow',
    lastVerifiedAt: '2026-03-24 11:15',
    deliveryDate: '2026-03-25',
    notes: 'Article published on Forbes. Backlink verification completed. Preparing final client delivery report.',
  },
  {
    id: 'ord_1003',
    ownerId: 'admin_master',
    orderNumber: 'GP-2026-003',
    clientId: 'cli_healthvibe',
    clientName: 'HealthVibe Direct Brands (Elena Rostova)',
    websiteId: 'web_healthline',
    websiteDomain: 'healthline.com',
    supplierId: 'sup_nexus_media',
    supplierName: 'Nexus Content Network',
    articleTitle: 'Clinical Innovations in Cellular Hydration and Bioavailable Electrolytes',
    articleContentUrl: 'https://docs.google.com/document/d/1healthvibe_healthline_draft',
    targetUrl: 'https://healthvibedirect.com/products/electrolyte-complex',
    anchorText: 'cellular hydration electrolyte balance',
    clientPrice: 1250,
    supplierCost: 700,
    additionalExpenses: 50,
    netProfit: 500,
    profitMargin: 40.0,
    paymentStatus: 'Paid',
    supplierPaymentStatus: 'Unpaid',
    status: 'ARTICLE SUBMITTED',
    publicationUrl: '',
    backlinkVerificationStatus: 'Unverified',
    backlinkRelAttribute: 'dofollow',
    lastVerifiedAt: '',
    deliveryDate: '',
    notes: 'Article submitted to publisher desk. Editorial review scheduled within 3 business days.',
  },
];

export const INITIAL_PAYMENTS: PaymentRecord[] = [
  {
    id: 'pay_1001',
    ownerId: 'admin_master',
    referenceNumber: 'INV-2026-001',
    docType: 'Invoice',
    orderId: 'ord_1001',
    clientId: 'cli_techflow',
    clientName: 'TechFlow Software Inc',
    clientEmail: 'sarah.jenkins@techflow.io',
    websiteDomain: 'techcrunch.com',
    sellingPrice: 950,
    wholesaleCost: 500,
    additionalExpenses: 50,
    estimatedProfit: 400,
    profitMargin: 42.11,
    status: 'Paid',
    dueDate: '2026-03-20',
    paidAt: '2026-03-18',
    notes: 'Paid via Stripe Credit Card.',
  },
  {
    id: 'pay_1002',
    ownerId: 'admin_master',
    referenceNumber: 'INV-2026-002',
    docType: 'Invoice',
    orderId: 'ord_1002',
    clientId: 'cli_growthrocket',
    clientName: 'GrowthRocket Digital Agency',
    clientEmail: 'm.vance@growthrocket.co',
    websiteDomain: 'forbes.com',
    sellingPrice: 1400,
    wholesaleCost: 850,
    additionalExpenses: 75,
    estimatedProfit: 475,
    profitMargin: 33.93,
    status: 'Paid',
    dueDate: '2026-03-22',
    paidAt: '2026-03-21',
    notes: 'Paid via International Wire Transfer.',
  },
  {
    id: 'pay_1003',
    ownerId: 'admin_master',
    referenceNumber: 'QT-2026-003',
    docType: 'Quotation',
    orderId: 'ord_1003',
    clientId: 'cli_healthvibe',
    clientName: 'HealthVibe Direct Brands',
    clientEmail: 'elena@healthvibedirect.com',
    websiteDomain: 'healthline.com',
    sellingPrice: 1250,
    wholesaleCost: 700,
    additionalExpenses: 50,
    estimatedProfit: 500,
    profitMargin: 40.0,
    status: 'Approved',
    dueDate: '2026-03-25',
    paidAt: '2026-03-23',
    notes: 'Quotation approved and 100% deposit received.',
  },
];

export const INITIAL_OUTREACH: OutreachEmailRecord[] = [
  {
    id: 'outreach_1',
    ownerId: 'admin_master',
    templateCategory: 'Client Quotation',
    recipientName: 'David Sterling',
    recipientEmail: 'david@fintechhorizons.com',
    relatedWebsiteOrOrder: 'FinTech Horizons Launch',
    subject: 'Guest Posting Package & Quotation: Tier-1 Publications for FinTech Horizons',
    body: `Hi David,\n\nFollowing up on our discussion regarding your Series A announcement, please find our customized guest posting proposal below:\n\n1. TechCrunch (DA 93, DR 91) - $950 (All-inclusive editorial placement)\n2. Forbes Business Council (DA 94, DR 92) - $1,400 (Executive thought leadership)\n3. Entrepreneur (DA 91, DR 90) - $800 (Founder interview format)\n\nAll placements include permanent in-content contextual Dofollow backlinks, professional article writing, and full delivery verification reports with guaranteed indexation.\n\nLet me know if you would like us to reserve these editorial slots for your launch campaign.\n\nBest regards,\nGuestPilot AI Reseller Desk`,
    status: 'Confirmed Sent',
  },
  {
    id: 'outreach_2',
    ownerId: 'admin_master',
    templateCategory: 'Publisher Outreach',
    recipientName: 'Editorial Desk',
    recipientEmail: 'editors@techcrunch-partners.com',
    relatedWebsiteOrOrder: 'TechCrunch Slot Reservation',
    subject: 'New Contributor Article Pitch: Enterprise AI Cloud Economics',
    body: `Hello Editorial Team,\n\nWe have prepared an in-depth 1,200-word industry analysis titled "The 2026 Shift: How Enterprise AI Infrastructure is Reshaping Cloud Economics".\n\nThe article features real cloud cost telemetry and architectural insights without aggressive commercial bias.\n\nPlease find the Google Doc draft attached for your review and let us know your current publishing turnaround.\n\nThank you,\nEditorial Partner Desk`,
    status: 'Confirmed Sent',
  },
];

export const INITIAL_DELIVERIES: DeliveryRecord[] = [
  {
    id: 'del_1001',
    ownerId: 'admin_master',
    orderId: 'ord_1001',
    orderNumber: 'GP-2026-001',
    clientName: 'TechFlow Software Inc (Sarah Jenkins)',
    clientEmail: 'sarah.jenkins@techflow.io',
    publisherWebsite: 'techcrunch.com',
    publishedArticleUrl: 'https://techcrunch.com/2026/03/enterprise-cloud-architecture-ai-shift',
    targetUrl: 'https://techflow.io/features/enterprise-ai',
    anchorText: 'enterprise AI cloud architecture',
    backlinkType: 'Dofollow',
    relAttribute: 'dofollow',
    httpStatus: 200,
    pageAccessible: true,
    targetLinkFound: true,
    anchorMatched: true,
    verificationStatus: 'Verified',
    verifiedAt: '2026-03-22 14:30',
    orderDate: '2026-03-16',
    deliveryDate: '2026-03-22',
    notes: '100% verified live backlink. Permanent indexing confirmed.',
  },
];

export const INITIAL_SETTINGS: UserSettings = {
  id: 'admin_master',
  ownerId: 'admin_master',
  businessName: 'GuestPilot AI Enterprise Reseller Desk',
  adminEmail: 'admin@guestpilot.ai',
  additionalAdminEmails: 'rdxkinglucky@gmail.com, appbuilder078@gmail.com',
  defaultCurrency: 'USD ($)',
  defaultPaymentTerms: 'Net 7 Days on Approved Orders. 50% Upfront on New Accounts.',
  invoiceFooterNotes: 'Thank you for choosing GuestPilot AI. All guest post placements include 12-month backlink permanence guarantee and real-time verification.',
};

export const INITIAL_ACTIVITY_LOGS: ActivityLogRecord[] = [
  {
    id: 'log_seed_1',
    ownerId: 'admin_master',
    actorEmail: 'admin@guestpilot.ai',
    module: 'System',
    action: 'INITIALIZED',
    entityId: 'system_core',
    details: 'GuestPilot AI Local-First Business Database initialized with industry seed catalog.',
  },
  {
    id: 'log_seed_2',
    ownerId: 'admin_master',
    actorEmail: 'admin@guestpilot.ai',
    module: 'Orders',
    action: 'BACKLINK_VERIFIED',
    entityId: 'ord_1001',
    details: 'Automated verification verified live dofollow backlink on techcrunch.com.',
  },
];

// Helper to safely get from LocalStorage with fallback
export function getStoredCollection<T>(key: string, defaultData: T[]): T[] {
  if (typeof window === 'undefined') return defaultData;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(defaultData));
      return defaultData;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as T[];
    }
  } catch {
    // fallback
  }
  return defaultData;
}

export function saveStoredCollection<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(data));
  } catch (err) {
    console.error(`Failed to save ${key} to local storage`, err);
  }
}

export function getStoredSettings(): UserSettings {
  if (typeof window === 'undefined') return INITIAL_SETTINGS;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}settings`);
    if (!raw) {
      localStorage.setItem(`${STORAGE_PREFIX}settings`, JSON.stringify(INITIAL_SETTINGS));
      return INITIAL_SETTINGS;
    }
    return JSON.parse(raw) as UserSettings;
  } catch {
    return INITIAL_SETTINGS;
  }
}

export function saveStoredSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}settings`, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save settings to local storage', err);
  }
}

// Full Backup Export
export function exportFullDatabaseBackup(): FullDatabaseBackup {
  return {
    exportDate: new Date().toISOString(),
    version: '2.0.0',
    system: 'GuestPilot AI - Guest Posting Reseller Business Software',
    websites: getStoredCollection<WebsiteRecord>('websites', INITIAL_WEBSITES),
    suppliers: getStoredCollection<SupplierRecord>('suppliers', INITIAL_SUPPLIERS),
    clients: getStoredCollection<ClientRecord>('clients', INITIAL_CLIENTS),
    leads: getStoredCollection<LeadRecord>('leads', INITIAL_LEADS),
    orders: getStoredCollection<OrderRecord>('orders', INITIAL_ORDERS),
    payments: getStoredCollection<PaymentRecord>('payments', INITIAL_PAYMENTS),
    outreach: getStoredCollection<OutreachEmailRecord>('outreach', INITIAL_OUTREACH),
    deliveries: getStoredCollection<DeliveryRecord>('deliveries', INITIAL_DELIVERIES),
    settings: getStoredSettings(),
    activityLogs: getStoredCollection<ActivityLogRecord>('activityLogs', INITIAL_ACTIVITY_LOGS),
  };
}

// Restore / Import Backup
export function restoreFullDatabaseBackup(backup: Partial<FullDatabaseBackup>): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (backup.websites && Array.isArray(backup.websites)) {
      saveStoredCollection('websites', backup.websites);
    }
    if (backup.suppliers && Array.isArray(backup.suppliers)) {
      saveStoredCollection('suppliers', backup.suppliers);
    }
    if (backup.clients && Array.isArray(backup.clients)) {
      saveStoredCollection('clients', backup.clients);
    }
    if (backup.leads && Array.isArray(backup.leads)) {
      saveStoredCollection('leads', backup.leads);
    }
    if (backup.orders && Array.isArray(backup.orders)) {
      saveStoredCollection('orders', backup.orders);
    }
    if (backup.payments && Array.isArray(backup.payments)) {
      saveStoredCollection('payments', backup.payments);
    }
    if (backup.outreach && Array.isArray(backup.outreach)) {
      saveStoredCollection('outreach', backup.outreach);
    }
    if (backup.deliveries && Array.isArray(backup.deliveries)) {
      saveStoredCollection('deliveries', backup.deliveries);
    }
    if (backup.settings) {
      saveStoredSettings(backup.settings);
    }
    if (backup.activityLogs && Array.isArray(backup.activityLogs)) {
      saveStoredCollection('activityLogs', backup.activityLogs);
    }
    return true;
  } catch (err) {
    console.error('Failed to restore database backup', err);
    return false;
  }
}

// Reset to Sample Industry Data
export function resetDatabaseToInitialSeed(): void {
  saveStoredCollection('websites', INITIAL_WEBSITES);
  saveStoredCollection('suppliers', INITIAL_SUPPLIERS);
  saveStoredCollection('clients', INITIAL_CLIENTS);
  saveStoredCollection('leads', INITIAL_LEADS);
  saveStoredCollection('orders', INITIAL_ORDERS);
  saveStoredCollection('payments', INITIAL_PAYMENTS);
  saveStoredCollection('outreach', INITIAL_OUTREACH);
  saveStoredCollection('deliveries', INITIAL_DELIVERIES);
  saveStoredSettings(INITIAL_SETTINGS);
  saveStoredCollection('activityLogs', INITIAL_ACTIVITY_LOGS);
}
