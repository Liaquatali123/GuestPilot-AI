/**
 * Phase 0 TDD Security Specification Runner
 * Verifies that all "Dirty Dozen" adversarial payloads defined in security_spec.md
 * are rejected with PERMISSION_DENIED by the GuestPilot AI Firestore Security Rules.
 */

export interface AdversarialTestPayload {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: {
    uid: string;
    email: string;
    email_verified: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: AdversarialTestPayload[] = [
  {
    id: 1,
    name: 'Unauthenticated Read/Write Attempt',
    collection: 'websites',
    docId: 'web_1',
    operation: 'get',
    auth: null,
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Spoofing Attack',
    collection: 'websites',
    docId: 'web_1',
    operation: 'create',
    auth: {
      uid: 'spoof_admin',
      email: 'appbuilder078@gmail.com',
      email_verified: false,
    },
    payload: { ownerId: 'spoof_admin', domain: 'example.com' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unauthorized Signed-In User Read Attempt',
    collection: 'clients',
    docId: 'client_1',
    operation: 'get',
    auth: {
      uid: 'intruder_1',
      email: 'intruder@example.com',
      email_verified: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow Field Injection on User Profile',
    collection: 'users',
    docId: 'admin_1',
    operation: 'create',
    auth: {
      uid: 'admin_1',
      email: 'appbuilder078@gmail.com',
      email_verified: true,
    },
    payload: {
      ownerId: 'admin_1',
      email: 'appbuilder078@gmail.com',
      displayName: 'Admin',
      role: 'superadmin', // Unauthorized shadow field
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Cross-Owner Identity Spoofing on Order Creation',
    collection: 'orders',
    docId: 'ord_1',
    operation: 'create',
    auth: {
      uid: 'admin_1',
      email: 'appbuilder078@gmail.com',
      email_verified: true,
    },
    payload: {
      ownerId: 'victim_uid',
      orderNumber: 'ORD-1001',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Document ID Poisoning with Illegal Characters',
    collection: 'websites',
    docId: 'bad id $#@!',
    operation: 'create',
    auth: {
      uid: 'admin_1',
      email: 'appbuilder078@gmail.com',
      email_verified: true,
    },
    payload: { ownerId: 'admin_1', domain: 'example.com' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Value Type Poisoning on Website Update',
    collection: 'websites',
    docId: 'web_1',
    operation: 'update',
    auth: {
      uid: 'admin_1',
      email: 'appbuilder078@gmail.com',
      email_verified: true,
    },
    payload: {
      ownerId: 'admin_1',
      da: 'invalid_string_da',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Client-Forged Timestamp on Supplier Creation',
    collection: 'suppliers',
    docId: 'sup_1',
    operation: 'create',
    auth: {
      uid: 'admin_1',
      email: 'appbuilder078@gmail.com',
      email_verified: true,
    },
    payload: {
      ownerId: 'admin_1',
      supplierName: 'Forged Time Supplier',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Immortal Field Mutation (ownerId / createdAt) on Update',
    collection: 'clients',
    docId: 'cli_1',
    operation: 'update',
    auth: {
      uid: 'admin_1',
      email: 'appbuilder078@gmail.com',
      email_verified: true,
    },
    payload: {
      ownerId: 'mutated_owner_id',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Invalid Order Status Enum Transition',
    collection: 'orders',
    docId: 'ord_1',
    operation: 'update',
    auth: {
      uid: 'admin_1',
      email: 'appbuilder078@gmail.com',
      email_verified: true,
    },
    payload: {
      status: 'BYPASSED_VERIFICATION',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Audit Log Tampering via Update',
    collection: 'activityLogs',
    docId: 'log_1',
    operation: 'update',
    auth: {
      uid: 'admin_1',
      email: 'appbuilder078@gmail.com',
      email_verified: true,
    },
    payload: {
      details: 'Tampered log entry',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unconstrained List Query Scraping by Non-Owner',
    collection: 'websites',
    docId: '*',
    operation: 'list',
    auth: {
      uid: 'other_user',
      email: 'other@example.com',
      email_verified: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
