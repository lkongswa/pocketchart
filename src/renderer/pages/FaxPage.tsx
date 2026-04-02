import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Send, ArrowUpRight, Wifi, WifiOff } from 'lucide-react';
import { useFax } from '../hooks/useFax';
import FaxInbox from '../components/FaxInbox';
import FaxOutbox from '../components/FaxOutbox';
import FaxSendModal from '../components/FaxSendModal';
import FaxComposePanel from '../components/FaxComposePanel';
import ProFeatureGate from '../components/ProFeatureGate';

type FaxTab = 'inbox' | 'outbox' | 'send';

export default function FaxPage() {
  const navigate = useNavigate();
  const { inbox, outbox, loading, refreshInbox, refreshOutbox, sendFax, matchToClient, saveToChart } = useFax();
  const [activeTab, setActiveTab] = useState<FaxTab>('inbox');
  const [showSendModal, setShowSendModal] = useState(false);
  const [faxConfigured, setFaxConfigured] = useState<boolean | null>(null);
  const [faxProviderName, setFaxProviderName] = useState<string>('');

  // Check if fax provider is configured
  useEffect(() => {
    window.api.fax.getProviderStatus().then((status) => {
      setFaxConfigured(status.configured);
      const providerNames: Record<string, string> = { srfax: 'SRFax', faxage: 'Faxage', phaxio: 'Phaxio' };
      setFaxProviderName(status.provider ? (providerNames[status.provider] || status.provider) : '');
    }).catch(() => setFaxConfigured(false));
  }, []);

  const tabs: Array<{ id: FaxTab; label: string; icon: React.ReactNode; count?: number }> = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={16} />, count: inbox.length },
    { id: 'outbox', label: 'Outbox', icon: <ArrowUpRight size={16} />, count: outbox.length },
    { id: 'send', label: 'Send', icon: <Send size={16} /> },
  ];

  return (
    <ProFeatureGate feature="fax" lockedMessage="Upgrade to Pro to send and receive faxes, manage your fax inbox, and fax documents directly from patient charts.">
    <div className="page-container">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="page-title">Fax Center</h1>
          <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full">
            {faxConfigured ? (
              <><Wifi size={12} className="text-green-500" /><span className="text-green-600">{faxProviderName} Connected</span></>
            ) : faxConfigured === false ? (
              <><WifiOff size={12} className="text-gray-400" /><span className="text-gray-500">Not Configured</span></>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="btn-primary flex items-center gap-2"
          onClick={() => setShowSendModal(true)}
        >
          <Send size={16} />
          Send Fax
        </button>
      </div>

      {/* Not configured banner — clickable, navigates to Settings > Fax */}
      {faxConfigured === false && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 cursor-pointer hover:bg-amber-100 transition-colors"
          onClick={() => navigate('/settings?section=fax')}
        >
          <p className="text-sm text-amber-800">
            Fax service is not configured. Set up your credentials in{' '}
            <span className="font-medium underline">Settings &gt; Fax Service</span> to start sending and receiving faxes.
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-[var(--color-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="text-[10px] bg-gray-200 rounded-full px-1.5 py-0.5 font-medium">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="card p-4">
        {activeTab === 'inbox' && (
          <FaxInbox
            inbox={inbox}
            onRefresh={() => refreshInbox(true)}
            onMatchToClient={matchToClient}
            onSaveToChart={async (faxLogId, clientId, category, linkToOutboundFaxId) => {
              await saveToChart({ faxLogId, clientId, category, linkToOutboundFaxId });
            }}
            loading={loading}
          />
        )}
        {activeTab === 'outbox' && (
          <FaxOutbox
            outbox={outbox}
            onRefresh={() => refreshOutbox(true)}
            loading={loading}
          />
        )}
        {activeTab === 'send' && (
          <FaxComposePanel onSent={refreshOutbox} />
        )}
      </div>

      {/* Send modal */}
      <FaxSendModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        onSent={refreshOutbox}
      />
    </div>
    </ProFeatureGate>
  );
}
