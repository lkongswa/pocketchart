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
    tagSource: (goalId: number, docId: number, docType: string) => ipcRenderer.invoke('goals:tagSource', goalId, docId, docType),
  },

  // Staged Goals
  stagedGoals: {
    listByClient: (clientId: number) => ipcRenderer.invoke('stagedGoals:listByClient', clientId),
    listAllByClient: (clientId: number) => ipcRenderer.invoke('stagedGoals:listAllByClient', clientId),
    create: (data: any) => ipcRenderer.invoke('stagedGoals:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('stagedGoals:update', id, data),
    promote: (id: number, noteId: number) => ipcRenderer.invoke('stagedGoals:promote', id, noteId),
    dismiss: (id: number, reason: string) => ipcRenderer.invoke('stagedGoals:dismiss', id, reason),
  },

  // Progress Report Goals
  progressReportGoals: {
    listByNote: (noteId: number) => ipcRenderer.invoke('progressReportGoals:listByNote', noteId),
    upsert: (noteId: number, goals: any[]) => ipcRenderer.invoke('progressReportGoals:upsert', noteId, goals),
    getLastForGoal: (goalId: number) => ipcRenderer.invoke('progressReportGoals:getLastForGoal', goalId),
  },

  // Notes
  notes: {
    list: (filters?: any) => ipcRenderer.invoke('notes:list', filters),
    listByClient: (clientId: number) => ipcRenderer.invoke('notes:listByClient', clientId),
    get: (id: number) => ipcRenderer.invoke('notes:get', id),
    create: (data: any) => ipcRenderer.invoke('notes:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('notes:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('notes:delete', id),
    getEpisodeSummary: (clientId: number) => ipcRenderer.invoke('notes:getEpisodeSummary', clientId),
    getUnbilledForClient: (clientId: number) => ipcRenderer.invoke('notes:getUnbilledForClient', clientId),
  },

  // Evaluations
  evaluations: {
    listByClient: (clientId: number) => ipcRenderer.invoke('evaluations:listByClient', clientId),
    get: (id: number) => ipcRenderer.invoke('evaluations:get', id),
    create: (data: any) => ipcRenderer.invoke('evaluations:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('evaluations:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('evaluations:delete', id),
    createReassessment: (clientId: number) => ipcRenderer.invoke('evaluations:createReassessment', clientId),
    countIncomplete: () => ipcRenderer.invoke('evaluations:countIncomplete'),
    listIncomplete: () => ipcRenderer.invoke('evaluations:listIncomplete'),
    listAll: () => ipcRenderer.invoke('evaluations:listAll'),
  },

  // Appointments
  appointments: {
    list: (filters?: any) => ipcRenderer.invoke('appointments:list', filters),
    create: (data: any) => ipcRenderer.invoke('appointments:create', data),
    createBatch: (items: any[]) => ipcRenderer.invoke('appointments:createBatch', items),
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
    getCategories: (discipline: string) => ipcRenderer.invoke('noteBank:getCategories', discipline),
  },

  // Pattern Overrides
  patternOverrides: {
    list: () => ipcRenderer.invoke('patternOverrides:list'),
    upsert: (patternId: string, componentKey: string, customOptions: string[], removedOptions: string[]) =>
      ipcRenderer.invoke('patternOverrides:upsert', patternId, componentKey, customOptions, removedOptions),
    delete: (patternId: string, componentKey: string) =>
      ipcRenderer.invoke('patternOverrides:delete', patternId, componentKey),
    deleteAll: (patternId: string) =>
      ipcRenderer.invoke('patternOverrides:deleteAll', patternId),
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

  // CMS-1500 Claim Form
  cms1500: {
    generate: (data: { clientId: number; noteIds: number[] }) => ipcRenderer.invoke('cms1500:generate', data),
    save: (data: { base64Pdf: string; filename: string }) => ipcRenderer.invoke('cms1500:save', data),
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
    detectCloud: (folderPath: string) => ipcRenderer.invoke('storage:detectCloud', folderPath),
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
    upload: (data: {
      clientId: number;
      category?: string;
      certification_period_start?: string;
      certification_period_end?: string;
      received_date?: string;
      sent_date?: string;
      physician_name?: string;
    }) => ipcRenderer.invoke('documents:upload', data),
    updateMeta: (data: {
      documentId: number;
      certification_period_start?: string;
      certification_period_end?: string;
      received_date?: string;
      sent_date?: string;
      physician_name?: string;
      category?: string;
    }) => ipcRenderer.invoke('documents:updateMeta', data),
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
    getActivationInfo: () => ipcRenderer.invoke('license:getActivationInfo'),
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
    reset: (discipline: string) => ipcRenderer.invoke('feeSchedule:reset', discipline),
  },

  // V2 Billing - Invoices
  invoices: {
    list: (filters?: any) => ipcRenderer.invoke('invoices:list', filters),
    get: (id: number) => ipcRenderer.invoke('invoices:get', id),
    create: (data: any, items: any[]) => ipcRenderer.invoke('invoices:create', data, items),
    update: (id: number, data: any) => ipcRenderer.invoke('invoices:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('invoices:delete', id),
    generateFromNotes: (clientId: number, noteIds: number[], entityId?: number) => ipcRenderer.invoke('invoices:generateFromNotes', clientId, noteIds, entityId),
    generatePdf: (invoiceId: number) => ipcRenderer.invoke('invoices:generatePdf', invoiceId),
    savePdf: (data: { base64Pdf: string; filename: string }) => ipcRenderer.invoke('invoices:savePdf', data),
    noteStatuses: () => ipcRenderer.invoke('invoices:noteStatuses'),
    createFeeInvoice: (data: { client_id?: number; entity_id?: number; description: string; amount: number; service_date: string }) => ipcRenderer.invoke('invoices:createFeeInvoice', data),
  },

  // V2 Billing - Payments
  payments: {
    list: (filters?: any) => ipcRenderer.invoke('payments:list', filters),
    create: (data: any) => ipcRenderer.invoke('payments:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('payments:update', id, data),
    refund: (id: number) => ipcRenderer.invoke('payments:refund', id),
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
      const handler = (_event: any, info: any) => callback(info);
      ipcRenderer.on('update:available', handler);
      return () => { ipcRenderer.removeListener('update:available', handler); };
    },
    onNotAvailable: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('update:not-available', handler);
      return () => { ipcRenderer.removeListener('update:not-available', handler); };
    },
    onProgress: (callback: (progress: any) => void) => {
      const handler = (_event: any, progress: any) => callback(progress);
      ipcRenderer.on('update:download-progress', handler);
      return () => { ipcRenderer.removeListener('update:download-progress', handler); };
    },
    onDownloaded: (callback: (info: any) => void) => {
      const handler = (_event: any, info: any) => callback(info);
      ipcRenderer.on('update:downloaded', handler);
      return () => { ipcRenderer.removeListener('update:downloaded', handler); };
    },
    onBackupComplete: (callback: (info: any) => void) => {
      const handler = (_event: any, info: any) => callback(info);
      ipcRenderer.on('update:backup-complete', handler);
      return () => { ipcRenderer.removeListener('update:backup-complete', handler); };
    },
    onBackupFailed: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('update:backup-failed', handler);
      return () => { ipcRenderer.removeListener('update:backup-failed', handler); };
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

  // ── Contracted Entities (Pro) ──
  contractedEntities: {
    list: () => ipcRenderer.invoke('contractedEntities:list'),
    get: (id: number) => ipcRenderer.invoke('contractedEntities:get', id),
    create: (data: any) => ipcRenderer.invoke('contractedEntities:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('contractedEntities:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('contractedEntities:delete', id),
    listFeeSchedule: (entityId: number) => ipcRenderer.invoke('contractedEntities:listFeeSchedule', entityId),
    createFeeScheduleEntry: (data: any) => ipcRenderer.invoke('contractedEntities:createFeeScheduleEntry', data),
    updateFeeScheduleEntry: (id: number, data: any) => ipcRenderer.invoke('contractedEntities:updateFeeScheduleEntry', id, data),
    deleteFeeScheduleEntry: (id: number) => ipcRenderer.invoke('contractedEntities:deleteFeeScheduleEntry', id),
  },

  // ── Entity Documents (Pro) ──
  entityDocuments: {
    list: (entityId: number) => ipcRenderer.invoke('entityDocuments:list', entityId),
    upload: (data: { entityId: number; category?: string }) => ipcRenderer.invoke('entityDocuments:upload', data),
    open: (documentId: number) => ipcRenderer.invoke('entityDocuments:open', documentId),
    delete: (documentId: number) => ipcRenderer.invoke('entityDocuments:delete', documentId),
  },

  // ── Professional Vault (Pro) ──
  vault: {
    list: () => ipcRenderer.invoke('vault:list'),
    upload: (data: any) => ipcRenderer.invoke('vault:upload', data),
    update: (id: number, data: any) => ipcRenderer.invoke('vault:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('vault:delete', id),
    open: (id: number) => ipcRenderer.invoke('vault:open', id),
    getExpiringDocuments: () => ipcRenderer.invoke('vault:getExpiringDocuments'),
    exportCredentialingPacket: (documentIds: number[]) => ipcRenderer.invoke('vault:exportCredentialingPacket', documentIds),
  },

  // ── Compliance Tracking (Pro) ──
  compliance: {
    getByClient: (clientId: number) => ipcRenderer.invoke('compliance:getByClient', clientId),
    updateSettings: (clientId: number, data: any) => ipcRenderer.invoke('compliance:updateSettings', clientId, data),
    incrementVisit: (clientId: number) => ipcRenderer.invoke('compliance:incrementVisit', clientId),
    resetProgressCounter: (clientId: number) => ipcRenderer.invoke('compliance:resetProgressCounter', clientId),
    resetRecertCounter: (clientId: number) => ipcRenderer.invoke('compliance:resetRecertCounter', clientId),
    getAlerts: () => ipcRenderer.invoke('compliance:getAlerts'),
    getDueItems: (clientId: number) => ipcRenderer.invoke('compliance:getDueItems', clientId),
  },

  // ── Mileage Tracking (Pro) ──
  mileage: {
    list: (filters?: any) => ipcRenderer.invoke('mileage:list', filters),
    create: (data: any) => ipcRenderer.invoke('mileage:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('mileage:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('mileage:delete', id),
    getSummary: (startDate: string, endDate: string) => ipcRenderer.invoke('mileage:getSummary', startDate, endDate),
    exportCsv: (startDate: string, endDate: string) => ipcRenderer.invoke('mileage:exportCsv', startDate, endDate),
  },

  // ── Communication Log (Pro) ──
  communicationLog: {
    list: (clientId: number) => ipcRenderer.invoke('communicationLog:list', clientId),
    create: (data: any) => ipcRenderer.invoke('communicationLog:create', data),
    delete: (id: number) => ipcRenderer.invoke('communicationLog:delete', id),
  },

  // ── Dashboard ──
  dashboard: {
    getBasicAlerts: () => ipcRenderer.invoke('dashboard:getBasicAlerts'),
    getOverview: () => ipcRenderer.invoke('dashboard:getOverview'),
    getAnalytics: (filters?: { startDate?: string; endDate?: string; monthsBack?: number }) => ipcRenderer.invoke('dashboard:getAnalytics', filters),
  },

  // ── Data Integrity ──
  integrity: {
    runCheck: () => ipcRenderer.invoke('integrity:runCheck'),
    verifyAuditChain: () => ipcRenderer.invoke('integrity:verifyAuditChain'),
  },

  // ── Reports (Pro) ──
  reports: {
    yearEndSummary: (year: number) => ipcRenderer.invoke('reports:yearEndSummary', year),
    exportYearEnd: (year: number, format: string) => ipcRenderer.invoke('reports:exportYearEnd', year, format),
  },

  // ── Direct Access Rules ──
  directAccess: {
    requiresReferral: (state: string, discipline: string) => ipcRenderer.invoke('directAccess:requiresReferral', state, discipline),
    getRules: () => ipcRenderer.invoke('directAccess:getRules'),
  },

  // Client Discounts & Packages
  clientDiscounts: {
    listByClient: (clientId: number) => ipcRenderer.invoke('clientDiscounts:listByClient', clientId),
    getActive: (clientId: number) => ipcRenderer.invoke('clientDiscounts:getActive', clientId),
    create: (data: any) => ipcRenderer.invoke('clientDiscounts:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('clientDiscounts:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('clientDiscounts:delete', id),
    incrementUsage: (id: number, count?: number) => ipcRenderer.invoke('clientDiscounts:incrementUsage', id, count),
    decrementUsage: (id: number, count?: number) => ipcRenderer.invoke('clientDiscounts:decrementUsage', id, count),
  },
  discountTemplates: {
    list: () => ipcRenderer.invoke('discountTemplates:list'),
    create: (data: any) => ipcRenderer.invoke('discountTemplates:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('discountTemplates:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('discountTemplates:delete', id),
  },

  // ── Dashboard Scratchpad ──
  scratchpad: {
    get: () => ipcRenderer.invoke('scratchpad:get'),
    save: (content: string) => ipcRenderer.invoke('scratchpad:save', content),
  },

  // ── Dashboard Todos ──
  dashboardTodos: {
    list: () => ipcRenderer.invoke('dashboardTodos:list'),
    create: (text: string) => ipcRenderer.invoke('dashboardTodos:create', text),
    update: (id: number, data: any) => ipcRenderer.invoke('dashboardTodos:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('dashboardTodos:delete', id),
    search: (query: string) => ipcRenderer.invoke('dashboardTodos:search', query),
    reorder: (items: Array<{ id: number; position: number }>) => ipcRenderer.invoke('dashboardTodos:reorder', items),
    listIncomplete: () => ipcRenderer.invoke('dashboardTodos:listIncomplete'),
  },

  // ── Calendar Blocks (admin time blocks) ──
  calendarBlocks: {
    list: (filters?: { startDate?: string; endDate?: string }) => ipcRenderer.invoke('calendarBlocks:list', filters),
    create: (data: any) => ipcRenderer.invoke('calendarBlocks:create', data),
    delete: (id: number) => ipcRenderer.invoke('calendarBlocks:delete', id),
    update: (id: number, data: any) => ipcRenderer.invoke('calendarBlocks:update', id, data),
    deleteAndRestore: (id: number) => ipcRenderer.invoke('calendarBlocks:deleteAndRestore', id),
  },

  // ── Quick Links ──
  quickLinks: {
    list: () => ipcRenderer.invoke('quickLinks:list'),
    create: (data: any) => ipcRenderer.invoke('quickLinks:create', data),
    update: (id: number, data: any) => ipcRenderer.invoke('quickLinks:update', id, data),
    delete: (id: number) => ipcRenderer.invoke('quickLinks:delete', id),
  },
};

contextBridge.exposeInMainWorld('api', api);
