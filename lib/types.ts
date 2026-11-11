import { Timestamp } from 'firebase/firestore';

export const ORDER_WORKFLOW_STAGES = [
  'NEW LEAD',
  'REQUIREMENTS CONFIRMED',
  'QUOTATION SENT',
  'CLIENT APPROVED',
  'PAYMENT RECEIVED',
  'SUPPLIER CONTACTED',
  'ARTICLE SUBMITTED',
  'PUBLISHER APPROVED',
  'PUBLISHED',
  'BACKLINK VERIFIED',
  'DELIVERED',
] as const;

export type OrderWorkflowStatus = (typeof ORDER_WORKFLOW_STAGES)[number];

export type BacklinkType = 'Dofollow' | 'Nofollow' | 'Sponsored' | 'Mixed' | 'Unknown';
export type WebsiteStatus = 'Verified' | 'Pending Review' | 'Inactive' | 'Blacklisted';

export interface WebsiteRecord {
  id: string;
  ownerId: string;
  domain: string;
  websiteUrl: string;
  niche: string;
  country: string;
  language: string;
  da: number; // -1 represents Unknown
  dr: number; // -1 represents Unknown
  organicTraffic: number; // -1 represents Unknown
  spamScore: number; // -1 represents Unknown
  metricsSource: string;
  backlinkType: BacklinkType;
  guestPostPrice: number;
  sponsoredPostPrice: number;
  contactEmail: string;
  publisherName: string;
  websiteStatus: WebsiteStatus;
  verificationDate: string;
  notes: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface SupplierRecord {
  id: string;
  ownerId: string;
  supplierName: string;
  email: string;
  website: string;
  country: string;
  niche: string;
  wholesalePrice: number;
  quotedPrice: number;
  quotationNotes: string;
  acceptedLinkTypes: string;
  articleWordLimits: string;
  publishingTime: string;
  permanentLinkAvailability: 'Yes' | 'No' | '12 Months' | 'Unknown';
  homepageLinkAvailability: 'Yes' | 'No' | 'Extra Fee' | 'Unknown';
  paymentStatus: 'Paid' | 'Unpaid' | 'Partial' | 'No Active Balance';
  notes: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ClientRecord {
  id: string;
  ownerId: string;
  clientName: string;
  email: string;
  company: string;
  country: string;
  website: string;
  requiredNiche: string;
  budget: number;
  requirements: string;
  leadStatus: 'New Lead' | 'Contacted' | 'Quotation Sent' | 'Negotiating' | 'Active Client' | 'Inactive';
  notes: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface LeadRecord {
  id: string;
  ownerId: string;
  prospectName: string;
  email: string;
  company: string;
  country: string;
  website: string;
  requiredNiche: string;
  estimatedBudget: number;
  source: string;
  status: 'New' | 'Contacted' | 'Qualified' | 'Quotation Sent' | 'Converted' | 'Lost';
  requirements: string;
  notes: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface OrderRecord {
  id: string;
  ownerId: string;
  orderNumber: string;
  clientId: string;
  clientName: string;
  websiteId: string;
  websiteDomain: string;
  supplierId: string;
  supplierName: string;
  articleTitle: string;
  articleContentUrl: string;
  targetUrl: string;
  anchorText: string;
  clientPrice: number;
  supplierCost: number;
  additionalExpenses: number;
  netProfit: number;
  profitMargin: number;
  paymentStatus: 'Unpaid' | 'Partial' | 'Paid' | 'Refunded';
  supplierPaymentStatus: 'Unpaid' | 'Paid';
  status: OrderWorkflowStatus;
  publicationUrl: string;
  backlinkVerificationStatus:
    | 'Unverified'
    | 'Verified'
    | 'Link Missing'
    | 'Wrong Rel Attribute'
    | 'Verification Inconclusive';
  backlinkRelAttribute: string;
  lastVerifiedAt: string;
  deliveryDate: string;
  notes: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface PaymentRecord {
  id: string;
  ownerId: string;
  referenceNumber: string;
  docType: 'Quotation' | 'Invoice' | 'Supplier Payment';
  orderId: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  websiteDomain: string;
  sellingPrice: number;
  wholesaleCost: number;
  additionalExpenses: number;
  estimatedProfit: number;
  profitMargin: number;
  status: 'Draft' | 'Sent' | 'Approved' | 'Unpaid' | 'Paid' | 'Overdue' | 'Cancelled';
  dueDate: string;
  paidAt: string;
  notes: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export type OutreachTemplateCategory =
  | 'Publisher Outreach'
  | 'Price Negotiation'
  | 'Guest Post Request'
  | 'Client Quotation'
  | 'Payment Confirmation'
  | 'Follow-up Email'
  | 'Delivery Notification';

export interface OutreachRecord {
  id: string;
  ownerId: string;
  templateCategory: OutreachTemplateCategory;
  recipientName: string;
  recipientEmail: string;
  relatedWebsiteOrOrder: string;
  subject: string;
  body: string;
  status: 'Draft Saved' | 'Opened in Mail Client' | 'Confirmed Sent';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface DeliveryRecord {
  id: string;
  ownerId: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  clientEmail: string;
  publisherWebsite: string;
  publishedArticleUrl: string;
  targetUrl: string;
  anchorText: string;
  backlinkType: string;
  relAttribute: string;
  httpStatus: number;
  pageAccessible: boolean;
  targetLinkFound: boolean;
  anchorMatched: boolean;
  verificationStatus: 'Verified' | 'Link Missing' | 'Anchor Mismatch' | 'Verification Inconclusive';
  verifiedAt: string;
  orderDate: string;
  deliveryDate: string;
  notes: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface SettingRecord {
  id: string;
  ownerId: string;
  businessName: string;
  adminEmail: string;
  additionalAdminEmails: string;
  defaultCurrency: string;
  defaultPaymentTerms: string;
  invoiceFooterNotes: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface AdminRecord {
  id: string;
  uid: string;
  email: string;
  addedBy: string;
  createdAt?: Timestamp | null;
}

export interface ActivityLogRecord {
  id: string;
  ownerId: string;
  actorEmail: string;
  module: string;
  action: string;
  entityId: string;
  details: string;
  createdAt?: Timestamp | null;
}

export function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    return url.hostname.replace(/^www\./, '').slice(0, 253);
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .slice(0, 253);
  }
}

export function formatMetricOrUnknown(val: number, suffix = ''): string {
  if (val === undefined || val === null || Number.isNaN(val) || val < 0) {
    return 'Unknown';
  }
  return `${val.toLocaleString()}${suffix}`;
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `$${safe.toFixed(2)}`;
  }
}

export function formatTimestamp(ts?: Timestamp | null): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  try {
    return ts.toDate().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
}

export function calculatePricingMetrics(
  clientPrice: number,
  supplierCost: number,
  additionalExpenses: number
): { netProfit: number; profitMargin: number } {
  const safeClient = Number.isFinite(clientPrice) ? Math.max(0, clientPrice) : 0;
  const safeSupplier = Number.isFinite(supplierCost) ? Math.max(0, supplierCost) : 0;
  const safeExpenses = Number.isFinite(additionalExpenses) ? Math.max(0, additionalExpenses) : 0;
  const netProfit = Number((safeClient - safeSupplier - safeExpenses).toFixed(2));
  const profitMargin =
    safeClient > 0 ? Number(((netProfit / safeClient) * 100).toFixed(2)) : 0;
  return { netProfit, profitMargin };
}
