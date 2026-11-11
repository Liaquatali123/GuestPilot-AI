// lib/firebase.ts
// Firebase and Local Persistence Integration Engine for GuestPilot AI

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { getAdminSession } from './auth-service';
import { getStoredCollection, saveStoredCollection } from './local-db';
import type { ActivityLogRecord } from './types';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function initFirestoreDb() {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = initFirestoreDb();
export const auth = getAuth(app);
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;

export const BOOTSTRAPPED_ADMIN_EMAIL = 'appbuilder078@gmail.com';
export const BOOTSTRAPPED_ADMIN_EMAILS = [
  'appbuilder078@gmail.com',
  'rdxkinglucky@gmail.com',
] as const;

export function getActiveAdminUser() {
  const session = getAdminSession();
  if (session && session.authenticated) {
    return {
      uid: 'admin_master',
      email: session.adminEmail || 'admin@guestpilot.ai',
      displayName: session.adminName || 'Master Administrator',
      emailVerified: true,
      isAnonymous: false,
    };
  }
  return (
    auth.currentUser || {
      uid: 'admin_master',
      email: 'admin@guestpilot.ai',
      displayName: 'Master Administrator',
      emailVerified: true,
      isAnonymous: false,
    }
  );
}

let connectionTested = false;

export async function testFirestoreConnection(): Promise<void> {
  if (connectionTested || typeof window === 'undefined') return;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore connection: operating in resilient local-first mode.');
    }
  }
}

if (typeof window !== 'undefined') {
  setTimeout(() => {
    testFirestoreConnection();
  }, 1500);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const currentAdmin = getActiveAdminUser();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentAdmin.uid,
      email: currentAdmin.email,
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerInfo: [],
    },
    operationType,
    path,
  };
  console.warn('Firestore Operation Info (resilient mode):', JSON.stringify(errInfo));
}

export function generateSafeId(prefix: string): string {
  const randomPart = Math.random().toString(36).substring(2, 10);
  const timePart = Date.now().toString(36);
  return `${prefix}_${timePart}_${randomPart}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export async function recordActivityLog(
  moduleName: string,
  action: string,
  entityId: string,
  details: string
): Promise<void> {
  const currentAdmin = getActiveAdminUser();
  const logId = generateSafeId('log');

  const newLogEntry: ActivityLogRecord = {
    id: logId,
    ownerId: currentAdmin.uid,
    actorEmail: (currentAdmin.email || 'admin@guestpilot.ai').slice(0, 254),
    module: moduleName.slice(0, 60),
    action: action.slice(0, 120),
    entityId: entityId.slice(0, 128),
    details: details.slice(0, 1000),
  };

  // 1. Save to local storage
  if (typeof window !== 'undefined') {
    const existingLogs = getStoredCollection<ActivityLogRecord>('activityLogs', []);
    saveStoredCollection('activityLogs', [newLogEntry, ...existingLogs.slice(0, 99)]);
  }

  // 2. Background sync to Firestore if available
  try {
    await setDoc(doc(collection(db, 'activityLogs'), logId), {
      ...newLogEntry,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `activityLogs/${logId}`);
  }
}
