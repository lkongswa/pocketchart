import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // App Info
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },

  // Practice
  practice: {
    get: () => ipcRenderer.invoke('practice:get'),
    save: (data: any) => ipcRenderer.invoke('practice:save', data),
  },

  // Clients
  clients: {
    list: (filters?: any) => ipcRenderer.invoke('clients:list', filters),
    get: (id: number) => ipcRenderer.invoke('clients:get', id),
    create: (data: any) => ipcRenderer.invoke('clients:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('clients:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('clients:delete', id),
  },

  // Goals
  goals: {
    listByClient: (clientId: number) => ipcRenderer.invoke('goals:listByClient', clientId),
    create: (data: any) => ipcRenderer.invoke('goals:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('goals:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('goals:delete', id),
  },

  // Notes
  notes: {
    listByClient: (clientId: number) => ipcRenderer.invoke('notes:listByClient', clientId),
    get: (id: number) => ipcRenderer.invoke('notes:get', id),
    create: (data: any) => ipcRenderer.invoke('notes:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('notes:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('notes:delete', id),
  },

  // Evaluations
  evaluations: {
    listByClient: (clientId: number) => ipcRenderer.invoke('evaluations:listByClient', clientId),
    get: (id: number) => ipcRenderer.invoke('evaluations:get', id),
    create: (data: any) => ipcRenderer.invoke('evaluations:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('evaluations:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('evaluations:delete', id),
  },

  // Appointments
  appointments: {
    list: (filters?: any) => ipcRenderer.invoke('appointments:list', filters),
    create: (data: any) => ipcRenderer.invoke('appointments:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('appointments:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('appointments:delete', id),
  },

  // Note Bank
  noteBank: {
    list: (filters?: any) => ipcRenderer.invoke('noteBank:list', filters),
    create: (data: any) => ipcRenderer.invoke('noteBank:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('noteBank:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('noteBank:delete', id),
    toggleFavorite: (id: number) => ipcRenderer.invoke('noteBank:toggleFavorite', id),
  },

  // Goals Bank
  goalsBank: {
    list: (filters?: any) => ipcRenderer.invoke('goalsBank:list', filters),
    create: (data: any) => ipcRenderer.invoke('goalsBank:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('goalsBank:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('goalsBank:delete', id),
  },

  // Settings
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  },

  // Superbill
  superbill: {
    generate: (data: any) => ipcRenderer.invoke('superbill:generate', data),
    save: (data: any) => ipcRenderer.invoke('superbill:save', data),
    generateBulk: (data: any) => ipcRenderer.invoke('superbill:generateBulk', data),
  },

  // Backup & Export
  backup: {
    exportManual: () => ipcRenderer.invoke('backup:exportManual'),
    getDbPath: () => ipcRenderer.invoke('backup:getDbPath'),
    exportClientPdf: (data: { clientId: number }) => ipcRenderer.invoke('backup:exportClientPdf', data),
    savePdf: (data: { base64Pdf: string; defaultFilename: string }) => ipcRenderer.invoke('backup:savePdf', data),
    exportCsv: () => ipcRenderer.invoke('backup:exportCsv'),
    exportAllChartsPdf: () => ipcRenderer.invoke('backup:exportAllChartsPdf'),
  },

  // Storage Location
  storage: {
    getDataPath: () => ipcRenderer.invoke('storage:getDataPath'),
    setDataPath: () => ipcRenderer.invoke('storage:setDataPath'),
    getDefaultPath: () => ipcRenderer.invoke('storage:getDefaultPath'),
    resetDataPath: () => ipcRenderer.invoke('storage:resetDataPath'),
  },

  // Practice Logo
  logo: {
    upload: () => ipcRenderer.invoke('logo:upload'),
    get: () => ipcRenderer.invoke('logo:get'),
    getBase64: () => ipcRenderer.invoke('logo:getBase64'),
    remove: () => ipcRenderer.invoke('logo:remove'),
  },

  // Security
  security: {
    isPinEnabled: () => ipcRenderer.invoke('security:isPinEnabled'),
    setPin: (newPin: string, currentPin?: string) => ipcRenderer.invoke('security:setPin', newPin, currentPin),
    verifyPin: (pin: string) => ipcRenderer.invoke('security:verifyPin', pin),
    removePin: (currentPin: string) => ipcRenderer.invoke('security:removePin', currentPin),
    requestPinReset: () => ipcRenderer.invoke('security:requestPinReset'),
    verifyRecoveryToken: (token: string) => ipcRenderer.invoke('security:verifyRecoveryToken', token),
    getTimeoutMinutes: () => ipcRenderer.invoke('security:getTimeoutMinutes'),
    setTimeoutMinutes: (minutes: number) => ipcRenderer.invoke('security:setTimeoutMinutes', minutes),
  },

  // Client Documents
  documents: {
    upload: (data: { clientId: number; category?: string }) => ipcRenderer.invoke('documents:upload', data),
    list: (data: { clientId: number }) => ipcRenderer.invoke('documents:list', data),
    open: (data: { documentId: number }) => ipcRenderer.invoke('documents:open', data),
    delete: (data: { documentId: number }) => ipcRenderer.invoke('documents:delete', data),
    getPath: (data: { documentId: number }) => ipcRenderer.invoke('documents:getPath', data),
  },
  // License
  license: {
    getStatus: () => ipcRenderer.invoke('license:getStatus'),
    activate: (licenseKey: string) => ipcRenderer.invoke('license:activate', licenseKey),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
  },

  // Secure Storage (OS-level encryption for API keys, etc.)
  secureStorage: {
    isAvailable: () => ipcRenderer.invoke('secureStorage:isAvailable'),
    set: (key: string, value: string) => ipcRenderer.invoke('secureStorage:set', key, value),
    get: (key: string) => ipcRenderer.invoke('secureStorage:get', key),
    getMasked: (key: string) => ipcRenderer.invoke('secureStorage:getMasked', key),
    delete: (key: string) => ipcRenderer.invoke('secureStorage:delete', key),
    exists: (key: string) => ipcRenderer.invoke('secureStorage:exists', key),
  },

  // V2 Billing - Fee Schedule
  feeSchedule: {
    list: () => ipcRenderer.invoke('feeSchedule:list'),
    get: (id: number) => ipcRenderer.invoke('feeSchedule:get', id),
    create: (data: any) => ipcRenderer.invoke('feeSchedule:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('feeSchedule:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('feeSchedule:delete', id),
  },

  // V2 Billing - Invoices
  invoices: {
    list: (filters?: any) => ipcRenderer.invoke('invoices:list', filters),
    get: (id: number) => ipcRenderer.invoke('invoices:get', id),
    create: (data: any, items: any[]) => ipcRenderer.invoke('invoices:create', data, items),
    update: (id: number, data: any) => ipcRenderer.invoke('invoices:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('invoices:delete', id),
    generateFromNotes: (clientId: number, noteIds: number[]) => ipcRenderer.invoke('invoices:generateFromNotes', clientId, noteIds),
    generatePdf: (invoiceId: number) => ipcRenderer.invoke('invoices:generatePdf', invoiceId),
    savePdf: (data: { base64Pdf: string; filename: string }) => ipcRenderer.invoke('invoices:savePdf', data),
  },

  // V2 Billing - Payments
  payments: {
    list: (filters?: any) => ipcRenderer.invoke('payments:list', filters),
    create: (data: any) => ipcRenderer.invoke('payments:create', data),
    delete: (id: number) => ipcRenderer.invoke('payments:delete', id),
  },

  // V3 Insurance Billing - Authorizations
  authorizations: {
    listByClient: (clientId: number) => ipcRenderer.invoke('authorizations:listByClient', clientId),
    create: (data: any) => ipcRenderer.invoke('authorizations:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('authorizations:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('authorizations:delete', id),
  },

  // V3 Insurance Billing - Claims
  claims: {
    list: (filters?: any) => ipcRenderer.invoke('claims:list', filters),
    get: (id: number) => ipcRenderer.invoke('claims:get', id),
    create: (data: any, lines: any[]) => ipcRenderer.invoke('claims:create', data, lines),
    update: (id: number, data: any) => ipcRenderer.invoke('claims:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('claims:delete', id),
  },

  // V3 Insurance Billing - Payers
  payers: {
    list: () => ipcRenderer.invoke('payers:list'),
    create: (data: any) => ipcRenderer.invoke('payers:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('payers:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('payers:delete', id),
  },

  // Audit Log
  auditLog: {
    list: (filters?: any) => ipcRenderer.invoke('auditLog:list', filters),
    create: (data: any) => ipcRenderer.invoke('auditLog:create', data),
  },

  // Auto-Update
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onAvailable: (callback: (info: any) => void) => {
      ipcRenderer.on('update:available', (_event, info) => callback(info));
    },
    onNotAvailable: (callback: () => void) => {
      ipcRenderer.on('update:not-available', () => callback());
    },
    onProgress: (callback: (progress: any) => void) => {
      ipcRenderer.on('update:download-progress', (_event, progress) => callback(progress));
    },
    onDownloaded: (callback: (info: any) => void) => {
      ipcRenderer.on('update:downloaded', (_event, info) => callback(info));
    },
  },

  // Shell (open external links in default browser)
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },

  // Stripe Payment Integration
  stripe: {
    /** Get or create a Stripe customer for a client */
    getOrCreateCustomer: (clientId: number) =>
      ipcRenderer.invoke('stripe:getOrCreateCustomer', clientId),
    /** Create a payment link for an invoice (opens in browser for client to pay) */
    createPaymentLink: (invoiceId: number) =>
      ipcRenderer.invoke('stripe:createPaymentLink', invoiceId),
    /** Check if an invoice's payment link has been paid (polling-based) */
    checkPaymentStatus: (invoiceId: number) =>
      ipcRenderer.invoke('stripe:checkPaymentStatus', invoiceId),
  },
};

contextBridge.exposeInMainWorld('api', api);
