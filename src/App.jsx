import { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
  Globe,
  Trash2,
  ShieldCheck,
  Mail,
  Key,
  AlertCircle,
  X,
  Search,
  Check,
  Loader2,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  MinusCircle,
  RefreshCw,
  Settings,
  Link as LinkIcon,
  Plus,
  LayoutDashboard,
  ShieldAlert,
  Save,
  Info,
  Edit3,
  Server,
  ArrowRight,
  Zap,
  Eye,
  EyeOff
} from 'lucide-react';

const API_BASE = 'http://localhost:3001/api';
const CACHE_TTL = 3600 * 1000;

// All Cloudflare-supported DNS record types
const DNS_TYPES = [
  'A', 'AAAA', 'CAA', 'CERT', 'CNAME', 'DNSKEY', 'DS', 'HTTPS', 'LOC',
  'MX', 'NAPTR', 'NS', 'PTR', 'SMIMEA', 'SRV', 'SSHFP', 'SVCB', 'TLSA', 'TXT', 'URI'
];



const INITIAL_RECORD = { type: 'A', name: '@', content: '', priority: 10, ttl: 1, proxied: false };

// Record type metadata for smart forms
const RECORD_META = {
  A: { label: 'A – IPv4 Address', placeholder: '192.0.2.1', canProxy: true, hasPriority: false, description: 'Points to an IPv4 address' },
  AAAA: { label: 'AAAA – IPv6 Address', placeholder: '2001:0db8::1', canProxy: true, hasPriority: false, description: 'Points to an IPv6 address' },
  CAA: { label: 'CAA – CA Authorization', placeholder: '0 issue "letsencrypt.org"', canProxy: false, hasPriority: false, description: 'Controls certificate issuance' },
  CERT: { label: 'CERT – Certificate', placeholder: 'Certificate data', canProxy: false, hasPriority: false, description: 'Stores certificates' },
  CNAME: { label: 'CNAME – Canonical Name', placeholder: 'target.example.com', canProxy: true, hasPriority: false, description: 'Alias to another domain' },
  DNSKEY: { label: 'DNSKEY – DNS Key', placeholder: 'DNSKEY data', canProxy: false, hasPriority: false, description: 'DNSSEC public key' },
  DS: { label: 'DS – Delegation Signer', placeholder: 'DS record data', canProxy: false, hasPriority: false, description: 'DNSSEC delegation' },
  HTTPS: { label: 'HTTPS – HTTPS Binding', placeholder: '1 . alpn="h2"', canProxy: false, hasPriority: true, description: 'HTTPS service binding' },
  LOC: { label: 'LOC – Location', placeholder: '51 30 12.748 N 0 7 39.611 W 0.00m', canProxy: false, hasPriority: false, description: 'Geographic location' },
  MX: { label: 'MX – Mail Exchange', placeholder: 'mail.example.com', canProxy: false, hasPriority: true, description: 'Mail server routing' },
  NAPTR: { label: 'NAPTR – Name Authority', placeholder: 'NAPTR data', canProxy: false, hasPriority: false, description: 'Name authority pointer' },
  NS: { label: 'NS – Name Server', placeholder: 'ns1.example.com', canProxy: false, hasPriority: false, description: 'Delegates a subdomain' },
  PTR: { label: 'PTR – Pointer', placeholder: 'host.example.com', canProxy: false, hasPriority: false, description: 'Reverse DNS lookup' },
  SMIMEA: { label: 'SMIMEA – S/MIME', placeholder: 'S/MIME cert data', canProxy: false, hasPriority: false, description: 'S/MIME certificate association' },
  SRV: { label: 'SRV – Service Locator', placeholder: '0 5 5060 sipserver.example.com', canProxy: false, hasPriority: true, description: 'Service location (weight port target)' },
  SSHFP: { label: 'SSHFP – SSH Fingerprint', placeholder: '1 1 <fingerprint>', canProxy: false, hasPriority: false, description: 'SSH public key fingerprint' },
  SVCB: { label: 'SVCB – Service Binding', placeholder: '1 . alpn="h2"', canProxy: false, hasPriority: true, description: 'General service binding' },
  TLSA: { label: 'TLSA – TLS Auth', placeholder: '3 1 1 <hash>', canProxy: false, hasPriority: false, description: 'TLS certificate association' },
  TXT: { label: 'TXT – Text Record', placeholder: 'v=spf1 include:_spf.google.com ~all', canProxy: false, hasPriority: false, description: 'Arbitrary text data (SPF, DKIM, etc.)' },
  URI: { label: 'URI – Uniform Resource', placeholder: 'https://example.com', canProxy: false, hasPriority: true, description: 'URI resource record' },
};

const getMeta = (type) => RECORD_META[type] || { label: type, placeholder: '', canProxy: false, hasPriority: false, description: '' };

// Color coding for record type badges
const TYPE_COLORS = {
  A: { bg: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa' },
  AAAA: { bg: 'rgba(99, 102, 241, 0.12)', color: '#818cf8' },
  CNAME: { bg: 'rgba(168, 85, 247, 0.12)', color: '#c084fc' },
  MX: { bg: 'rgba(236, 72, 153, 0.12)', color: '#f472b6' },
  TXT: { bg: 'rgba(34, 197, 94, 0.12)', color: '#4ade80' },
  NS: { bg: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24' },
  SRV: { bg: 'rgba(14, 165, 233, 0.12)', color: '#38bdf8' },
  CAA: { bg: 'rgba(244, 63, 94, 0.12)', color: '#fb7185' },
  DS: { bg: 'rgba(251, 146, 60, 0.12)', color: '#fb923c' },
  default: { bg: 'rgba(148, 163, 184, 0.12)', color: '#94a3b8' },
};

const getTypeColor = (type) => TYPE_COLORS[type] || TYPE_COLORS.default;

function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('cf_api_key') || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [dmarcEmail, setDmarcEmail] = useState(localStorage.getItem('cf_dmarc_email') || 'reports@{{DOMAIN}}');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  // Data State
  const [allZones, setAllZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedZoneIds, setSelectedZoneIds] = useState([]);
  const [records, setRecords] = useState([]);

  // Record Filtering
  const [recordTypeFilter, setRecordTypeFilter] = useState('ALL');
  const [recordSearchTerm, setRecordSearchTerm] = useState('');

  // Edit Record
  const [editingRecord, setEditingRecord] = useState(null);

  // Modals Visibility
  const [showBulkDNSModal, setShowBulkDNSModal] = useState(false);
  const [showForwardingModal, setShowForwardingModal] = useState(false);

  // Bulk DNS State
  const [bulkRows, setBulkRows] = useState([]);

  // URL Forwarding State
  const [redirectSource, setRedirectSource] = useState('');
  const [redirectTarget, setRedirectTarget] = useState('');

  // Processing State
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, success: [], partial: [], error: [] });
  const [viewingStatusList, setViewingStatusList] = useState(null);

  // Add Domains State
  const [domainsToAdd, setDomainsToAdd] = useState('');
  const [addedResults, setAddedResults] = useState([]);

  // Search & Pagination
  const [searchMode, setSearchMode] = useState('simple');
  const [searchTerm, setSearchTerm] = useState('');
  const [bulkSearchTerm, setBulkSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Single Form State
  const [newRecord, setNewRecord] = useState(INITIAL_RECORD);

  // Toast Helper
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Initialization & Caching logic
  useEffect(() => {
    const cachedData = localStorage.getItem('cf_zones_cache');
    const cacheTime = localStorage.getItem('cf_zones_timestamp');
    if (cachedData && cacheTime && Date.now() - parseInt(cacheTime) < CACHE_TTL) {
      setAllZones(JSON.parse(cachedData));
    } else if (apiKey) {
      fetchZones();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const fetchZones = async (force = false) => {
    if (!apiKey) return;
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE}/zones`, { headers: { Authorization: apiKey } });
      const zones = res.data.result || [];
      setAllZones(zones);
      localStorage.setItem('cf_zones_cache', JSON.stringify(zones));
      localStorage.setItem('cf_zones_timestamp', Date.now().toString());
      if (force) showToast('Zones synced successfully');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to sync zones');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecords = async (zoneId) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/zones/${zoneId}/dns_records`, { headers: { Authorization: apiKey } });
      setRecords(res.data.result || []);
    } catch {
      showToast('Failed to load DNS records', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Domain Filtering & Bulk Matching
  const filteredZones = useMemo(() => {
    if (searchMode === 'simple') {
      if (!searchTerm.trim()) return allZones;
      const term = searchTerm.toLowerCase().trim();
      return allZones.filter(z => z.name.toLowerCase().includes(term));
    } else {
      if (!bulkSearchTerm.trim()) return allZones;
      const terms = bulkSearchTerm.split(/[\n, ]+/).filter(t => t.trim()).map(t => t.toLowerCase());
      return allZones.filter(z => terms.some(t => z.name.toLowerCase().includes(t)));
    }
  }, [allZones, searchTerm, bulkSearchTerm, searchMode]);

  const paginatedZones = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredZones.slice(start, start + pageSize);
  }, [filteredZones, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredZones.length / pageSize);

  // Filtered records by type + search
  const filteredRecords = useMemo(() => {
    let recs = records;
    if (recordTypeFilter !== 'ALL') {
      recs = recs.filter(r => r.type === recordTypeFilter);
    }
    if (recordSearchTerm.trim()) {
      const term = recordSearchTerm.toLowerCase();
      recs = recs.filter(r =>
        (r.name || '').toLowerCase().includes(term) ||
        (r.content || '').toLowerCase().includes(term)
      );
    }
    return recs;
  }, [records, recordTypeFilter, recordSearchTerm]);

  // Record type summary for filter chips
  const recordTypeCounts = useMemo(() => {
    const counts = {};
    records.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
    return counts;
  }, [records]);

  const toggleZoneSelection = (id) => {
    setSelectedZoneIds(prev =>
      prev.includes(id) ? prev.filter(zid => zid !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    if (selectedZoneIds.length === filteredZones.length) {
      setSelectedZoneIds([]);
    } else {
      setSelectedZoneIds(filteredZones.map(z => z.id));
    }
  };

  // Record Actions
  const deleteRecord = async (recordId) => {
    if (!window.confirm('Are you sure you want to delete this DNS record?')) return;
    setLoading(true);
    try {
      await axios.delete(`${API_BASE}/zones/${selectedZone.id}/dns_records/${recordId}`, {
        headers: { Authorization: apiKey }
      });
      setRecords(prev => prev.filter(r => r.id !== recordId));
      showToast('Record deleted successfully');
    } catch { showToast('Delete failed', 'error'); }
    finally { setLoading(false); }
  };

  const updateRecord = async (record) => {
    setLoading(true);
    try {
      await axios.put(`${API_BASE}/zones/${selectedZone.id}/dns_records/${record.id}`, {
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: record.ttl,
        proxied: record.proxied || false,
        ...(getMeta(record.type).hasPriority ? { priority: record.priority } : {}),
      }, { headers: { Authorization: apiKey } });
      await fetchRecords(selectedZone.id);
      setEditingRecord(null);
      showToast('Record updated successfully');
    } catch (err) {
      showToast(err.response?.data?.error || 'Update failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const bulkExecutor = async (type, payloadFn) => {
    const targetIds = selectedZone ? [selectedZone.id] : selectedZoneIds;
    if (targetIds.length === 0) return;

    setIsBulkProcessing(true);
    setBulkProgress({ current: 0, total: targetIds.length, success: [], partial: [], error: [] });

    for (let i = 0; i < targetIds.length; i++) {
      const zoneId = targetIds[i];
      const zone = allZones.find(z => z.id === zoneId);
      try {
        const data = payloadFn(zone);
        const res = await axios.post(`${API_BASE}${data.url}`, data.body, { headers: { Authorization: apiKey } });
        const status = (res.data.errors && res.data.errors.length > 0) ? 'partial' : 'success';
        setBulkProgress(prev => ({ ...prev, current: i + 1, [status]: [...prev[status], { name: zone.name, errors: res.data.errors }] }));
      } catch (err) {
        setBulkProgress(prev => ({ ...prev, current: i + 1, error: [...prev.error, { name: zone.name, error: err.message }] }));
      }
    }
    setIsBulkProcessing(false);
    showToast('Bulk operation complete');
  };

  const handleBulkDNS = () => {
    setShowBulkDNSModal(false);
    bulkExecutor('/dns', (zone) => ({
      url: `/zones/${zone.id}/dns_records/bulk`,
      body: {
        records: bulkRows.map(r => ({
          ...r,
          name: r.name.replace(/\{\{DOMAIN\}\}/g, zone.name),
          content: r.content.replace(/\{\{DOMAIN\}\}/g, zone.name),
          proxied: r.proxied || false
        }))
      }
    }));
  };

  const handleBulkRedirect = () => {
    setShowForwardingModal(false);
    bulkExecutor('/redirect', (zone) => ({
      url: `/zones/${zone.id}/redirect_rules`,
      body: {
        source_url: redirectSource.replace(/\{\{DOMAIN\}\}/g, zone.name),
        target_url: redirectTarget.replace(/\{\{DOMAIN\}\}/g, zone.name)
      }
    }));
  };

  const handleCreateZones = async () => {
    const list = domainsToAdd.split(/[\n, ]+/).filter(d => d.trim());
    if (list.length === 0) return;
    setIsBulkProcessing(true);
    const results = [];
    for (const d of list) {
      try {
        const res = await axios.post(`${API_BASE}/zones/bulk`, { domains: [d.trim()] }, { headers: { Authorization: apiKey } });
        const zone = res.data.results[0];
        results.push({ name: d.trim(), status: 'success', ns: zone?.name_servers });
      } catch (err) {
        results.push({ name: d.trim(), status: 'error', error: err.response?.data?.error || err.message });
      }
    }
    setAddedResults(results);
    setIsBulkProcessing(false);
    fetchZones(true);
  };

  const handleSingleSubmit = async () => {
    if (!newRecord.content || !selectedZone) return;
    setLoading(true);
    try {
      const payload = {
        type: newRecord.type,
        name: newRecord.name,
        content: newRecord.content,
        ttl: newRecord.ttl,
        ...(getMeta(newRecord.type).canProxy ? { proxied: newRecord.proxied } : {}),
        ...(getMeta(newRecord.type).hasPriority ? { priority: newRecord.priority } : {}),
      };
      await axios.post(`${API_BASE}/zones/${selectedZone.id}/dns_records`, payload, { headers: { Authorization: apiKey } });
      await fetchRecords(selectedZone.id);
      setNewRecord(INITIAL_RECORD);
      showToast('DNS record added');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add record', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── RENDER ──────────────────────────────────────────────────────
  return (
    <div className="app-container">
      {/* ─── Sidebar ─── */}
      <div className="sidebar">
        <div className="sidebar-logo">
          <Zap size={20} />
          <span>Cloudflow</span>
        </div>
        <div className="nav-links">
          {[
            { id: 'dashboard', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
            { id: 'domains', icon: <PlusCircle size={18} />, label: 'Add Domains' },
            { id: 'setup', icon: <Settings size={18} />, label: 'Settings' },
          ].map(nav => (
            <div
              key={nav.id}
              className={`nav-item ${activeTab === nav.id ? 'active' : ''}`}
              onClick={() => { setActiveTab(nav.id); setSelectedZone(null); }}
            >
              {nav.icon} <span>{nav.label}</span>
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-stat">
            <Globe size={14} />
            <span>{allZones.length} zones</span>
          </div>
          <div className="sidebar-sync-time">
            Last sync: {localStorage.getItem('cf_zones_timestamp')
              ? new Date(parseInt(localStorage.getItem('cf_zones_timestamp'))).toLocaleTimeString()
              : 'Never'}
          </div>
        </div>
      </div>

      {/* ─── Main Content ─── */}
      <div className="main-wrapper">
        <header className="top-bar">
          <div className="top-bar-left">
            <h2>{selectedZone ? selectedZone.name : activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'domains' ? 'Add Domains' : 'Settings'}</h2>
            {selectedZone && <span className="breadcrumb">DNS Management</span>}
          </div>
          <div className="top-bar-right">
            {selectedZoneIds.length > 0 && (
              <div className="badge badge-info">{selectedZoneIds.length} selected</div>
            )}
            <button className="btn-secondary" onClick={() => fetchZones(true)} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'loader' : ''} />
              Sync
            </button>
          </div>
        </header>

        <main className="content-area">
          {error && (
            <div className="alert-error">
              <ShieldAlert size={18} />
              <span>{error}</span>
              <button className="btn-ghost" onClick={() => setError('')}><X size={14} /></button>
            </div>
          )}

          {/* ══════════════ DASHBOARD TAB ══════════════ */}
          {activeTab === 'dashboard' && !selectedZone && (
            <>
              {/* Stats */}
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8' }}><Globe size={22} /></div>
                  <div>
                    <div className="stat-label">Total Zones</div>
                    <div className="stat-value">{allZones.length}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80' }}><Check size={22} /></div>
                  <div>
                    <div className="stat-label">Active</div>
                    <div className="stat-value text-success">{allZones.filter(z => z.status === 'active').length}</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24' }}><AlertCircle size={22} /></div>
                  <div>
                    <div className="stat-label">Pending</div>
                    <div className="stat-value" style={{ color: 'var(--warning)' }}>{allZones.filter(z => z.status !== 'active').length}</div>
                  </div>
                </div>
              </div>

              {/* Domain List */}
              <div className="card">
                <div className="card-toolbar">
                  <div className="search-toggle">
                    <button className={searchMode === 'simple' ? 'active' : ''} onClick={() => setSearchMode('simple')}>Search</button>
                    <button className={searchMode === 'bulk' ? 'active' : ''} onClick={() => setSearchMode('bulk')}>Bulk Match</button>
                  </div>

                  {searchMode === 'simple' ? (
                    <div className="search-input-wrapper">
                      <Search className="search-icon" size={15} />
                      <input
                        type="text"
                        placeholder="Filter domains..."
                        value={searchTerm}
                        onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                      />
                    </div>
                  ) : (
                    <div className="bulk-hint">
                      <Info size={13} /> Paste domain list below to filter
                    </div>
                  )}

                  <button className="btn-secondary" onClick={selectAllFiltered}>
                    {selectedZoneIds.length === filteredZones.length && filteredZones.length > 0 ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                {searchMode === 'bulk' && (
                  <div className="bulk-search-area">
                    <textarea
                      rows="4"
                      placeholder={"domain1.com\ndomain2.com\ndomain3.com"}
                      value={bulkSearchTerm}
                      onChange={e => { setBulkSearchTerm(e.target.value); setCurrentPage(1); }}
                    />
                  </div>
                )}

                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}></th>
                        <th>Domain</th>
                        <th>Status</th>
                        <th>Plan</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedZones.length === 0 && (
                        <tr><td colSpan="5" className="empty-state">
                          {allZones.length === 0 ? 'No zones found. Add your API key in Settings.' : 'No matching domains.'}
                        </td></tr>
                      )}
                      {paginatedZones.map(zone => (
                        <tr key={zone.id} className={selectedZoneIds.includes(zone.id) ? 'row-selected' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedZoneIds.includes(zone.id)}
                              onChange={() => toggleZoneSelection(zone.id)}
                            />
                          </td>
                          <td className="domain-name">{zone.name}</td>
                          <td>
                            <span className={`badge badge-${zone.status === 'active' ? 'active' : 'pending'}`}>
                              {zone.status}
                            </span>
                          </td>
                          <td className="text-muted">{zone.plan?.name || 'Free'}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn-action"
                              onClick={() => {
                                setSelectedZone(zone);
                                fetchRecords(zone.id);
                                setRecordTypeFilter('ALL');
                                setRecordSearchTerm('');
                                setEditingRecord(null);
                              }}
                            >
                              <Server size={14} /> Manage DNS
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="pagination">
                    <button className="btn-secondary btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft size={15} /></button>
                    <span className="page-info">Page {currentPage} of {totalPages}</span>
                    <button className="btn-secondary btn-sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight size={15} /></button>
                  </div>
                )}
              </div>

              {/* Bulk Action Bar */}
              {selectedZoneIds.length > 0 && (
                <div className="action-bar">
                  <div className="action-bar-left">
                    <strong>{selectedZoneIds.length} domains selected</strong>
                    <button className="btn-ghost" onClick={() => setSelectedZoneIds([])}>Clear</button>
                  </div>
                  <div className="action-bar-right">
                    <button className="btn-primary" onClick={() => setShowBulkDNSModal(true)}>
                      <ShieldCheck size={16} /> Bulk DNS
                    </button>
                    <button className="btn-primary btn-purple" onClick={() => setShowForwardingModal(true)}>
                      <LinkIcon size={16} /> URL Forwarding
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══════════════ INDIVIDUAL DOMAIN RECORDS ══════════════ */}
          {selectedZone && (
            <div className="dns-management">
              {/* Header */}
              <div className="dns-header">
                <div>
                  <button className="btn-back" onClick={() => { setSelectedZone(null); setEditingRecord(null); }}>
                    <ChevronLeft size={16} /> Back
                  </button>
                </div>
                <div className="dns-header-actions">
                  <button className="btn-secondary" onClick={() => fetchRecords(selectedZone.id)} disabled={loading}>
                    <RefreshCw size={14} className={loading ? 'loader' : ''} /> Refresh
                  </button>
                </div>
              </div>

              {/* Add Record Form */}
              <div className="card dns-add-form">
                <h4 className="form-title"><Plus size={16} /> Add New Record</h4>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Type</label>
                    <select
                      value={newRecord.type}
                      onChange={e => setNewRecord({ ...INITIAL_RECORD, type: e.target.value })}
                    >
                      {DNS_TYPES.map(t => (
                        <option key={t} value={t}>{getMeta(t).label}</option>
                      ))}
                    </select>
                    <span className="form-hint">{getMeta(newRecord.type).description}</span>
                  </div>

                  <div className="form-group">
                    <label>Name</label>
                    <input
                      type="text"
                      placeholder="@ or subdomain"
                      value={newRecord.name}
                      onChange={e => setNewRecord({ ...newRecord, name: e.target.value })}
                    />
                    <span className="form-hint">Use @ for root domain</span>
                  </div>

                  <div className="form-group form-group-wide">
                    <label>Content / Value</label>
                    <input
                      type="text"
                      placeholder={getMeta(newRecord.type).placeholder}
                      value={newRecord.content}
                      onChange={e => setNewRecord({ ...newRecord, content: e.target.value })}
                    />
                  </div>

                  {getMeta(newRecord.type).hasPriority && (
                    <div className="form-group form-group-sm">
                      <label>Priority</label>
                      <input
                        type="number"
                        min="0"
                        max="65535"
                        value={newRecord.priority}
                        onChange={e => setNewRecord({ ...newRecord, priority: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  )}

                  <div className="form-group form-group-sm">
                    <label>TTL</label>
                    <select value={newRecord.ttl} onChange={e => setNewRecord({ ...newRecord, ttl: parseInt(e.target.value) })}>
                      <option value={1}>Auto</option>
                      <option value={60}>1 min</option>
                      <option value={120}>2 min</option>
                      <option value={300}>5 min</option>
                      <option value={600}>10 min</option>
                      <option value={1800}>30 min</option>
                      <option value={3600}>1 hour</option>
                      <option value={7200}>2 hours</option>
                      <option value={18000}>5 hours</option>
                      <option value={43200}>12 hours</option>
                      <option value={86400}>1 day</option>
                    </select>
                  </div>

                  {getMeta(newRecord.type).canProxy && (
                    <div className="form-group form-group-sm">
                      <label>Proxy</label>
                      <button
                        type="button"
                        className={`proxy-button ${newRecord.proxied ? 'proxied' : ''}`}
                        onClick={() => setNewRecord({ ...newRecord, proxied: !newRecord.proxied })}
                      >
                        <ShieldCheck size={16} />
                        {newRecord.proxied ? 'Proxied' : 'DNS Only'}
                      </button>
                    </div>
                  )}

                  <div className="form-group form-group-action">
                    <button className="btn-primary btn-add" onClick={handleSingleSubmit} disabled={loading || !newRecord.content}>
                      {loading ? <Loader2 className="loader" size={16} /> : <Plus size={16} />}
                      Add Record
                    </button>
                  </div>
                </div>
              </div>

              {/* Records Filter Bar */}
              <div className="record-filter-bar">
                <div className="type-chips">
                  <button
                    className={`chip ${recordTypeFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setRecordTypeFilter('ALL')}
                  >
                    All ({records.length})
                  </button>
                  {Object.entries(recordTypeCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <button
                        key={type}
                        className={`chip ${recordTypeFilter === type ? 'active' : ''}`}
                        onClick={() => setRecordTypeFilter(recordTypeFilter === type ? 'ALL' : type)}
                        style={recordTypeFilter === type ? { background: getTypeColor(type).bg, color: getTypeColor(type).color, borderColor: getTypeColor(type).color } : {}}
                      >
                        {type} ({count})
                      </button>
                    ))}
                </div>
                <div className="search-input-wrapper search-sm">
                  <Search className="search-icon" size={14} />
                  <input
                    type="text"
                    placeholder="Search records..."
                    value={recordSearchTerm}
                    onChange={e => setRecordSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {/* Records Table */}
              <div className="card records-card">
                <div className="table-wrapper">
                  <table className="data-table records-table">
                    <thead>
                      <tr>
                        <th style={{ width: '90px' }}>Type</th>
                        <th>Name</th>
                        <th>Content</th>
                        <th style={{ width: '70px' }}>Priority</th>
                        <th style={{ width: '70px' }}>TTL</th>
                        <th style={{ width: '60px' }}>Proxy</th>
                        <th style={{ width: '90px', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.length === 0 && (
                        <tr><td colSpan="7" className="empty-state">
                          {records.length === 0 ? 'No DNS records found for this zone.' : 'No records match your filter.'}
                        </td></tr>
                      )}
                      {filteredRecords.map(r => (
                        <tr key={r.id} className={editingRecord?.id === r.id ? 'row-editing' : ''}>
                          {editingRecord?.id === r.id ? (
                            // ─── Edit Mode ───
                            <>
                              <td>
                                <span className="type-badge" style={{ background: getTypeColor(r.type).bg, color: getTypeColor(r.type).color }}>
                                  {r.type}
                                </span>
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="inline-edit"
                                  value={editingRecord.name}
                                  onChange={e => setEditingRecord({ ...editingRecord, name: e.target.value })}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="inline-edit"
                                  value={editingRecord.content}
                                  onChange={e => setEditingRecord({ ...editingRecord, content: e.target.value })}
                                />
                              </td>
                              <td>
                                {getMeta(r.type).hasPriority ? (
                                  <input
                                    type="number"
                                    className="inline-edit inline-edit-sm"
                                    value={editingRecord.priority}
                                    onChange={e => setEditingRecord({ ...editingRecord, priority: parseInt(e.target.value) || 0 })}
                                  />
                                ) : <span className="text-muted">–</span>}
                              </td>
                              <td>
                                <select
                                  className="inline-edit inline-edit-sm"
                                  value={editingRecord.ttl}
                                  onChange={e => setEditingRecord({ ...editingRecord, ttl: parseInt(e.target.value) })}
                                >
                                  <option value={1}>Auto</option>
                                  <option value={60}>1m</option>
                                  <option value={300}>5m</option>
                                  <option value={3600}>1h</option>
                                  <option value={86400}>1d</option>
                                </select>
                              </td>
                              <td>
                                {getMeta(r.type).canProxy && (
                                  <button
                                    className={`proxy-icon-btn ${editingRecord.proxied ? 'proxied' : ''}`}
                                    onClick={() => setEditingRecord({ ...editingRecord, proxied: !editingRecord.proxied })}
                                    title={editingRecord.proxied ? 'Proxied' : 'DNS Only'}
                                  >
                                    <ShieldCheck size={16} />
                                  </button>
                                )}
                              </td>
                              <td className="actions-cell">
                                <button className="btn-icon btn-save" onClick={() => updateRecord(editingRecord)} title="Save"><Check size={15} /></button>
                                <button className="btn-icon btn-cancel" onClick={() => setEditingRecord(null)} title="Cancel"><X size={15} /></button>
                              </td>
                            </>
                          ) : (
                            // ─── View Mode ───
                            <>
                              <td>
                                <span className="type-badge" style={{ background: getTypeColor(r.type).bg, color: getTypeColor(r.type).color }}>
                                  {r.type}
                                </span>
                              </td>
                              <td className="cell-name">{r.name}</td>
                              <td className="cell-content" title={r.content || ''}>{r.content || '—'}</td>
                              <td className="text-muted">{r.priority ?? '–'}</td>
                              <td className="text-muted">{r.ttl === 1 ? 'Auto' : r.ttl >= 3600 ? `${r.ttl / 3600}h` : r.ttl >= 60 ? `${r.ttl / 60}m` : `${r.ttl}s`}</td>
                              <td>
                                {getMeta(r.type).canProxy && (
                                  <span className={`proxy-indicator ${r.proxied ? 'proxied' : ''}`} title={r.proxied ? 'Proxied' : 'DNS Only'}>
                                    <ShieldCheck size={14} />
                                  </span>
                                )}
                              </td>
                              <td className="actions-cell">
                                <button className="btn-icon" onClick={() => setEditingRecord({ ...r })} title="Edit"><Edit3 size={14} /></button>
                                <button className="btn-icon btn-danger" onClick={() => deleteRecord(r.id)} title="Delete"><Trash2 size={14} /></button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════ ADD DOMAINS TAB ══════════════ */}
          {activeTab === 'domains' && (
            <div className="card" style={{ maxWidth: '800px' }}>
              <h3 className="card-title"><PlusCircle size={20} /> Bulk Domain Import</h3>
              <p className="text-muted" style={{ marginBottom: '1.5rem' }}>Add multiple domains to your Cloudflare account. Nameservers will be returned after creation.</p>

              <textarea
                rows="10"
                placeholder={"domain1.com\ndomain2.com\ndomain3.com"}
                value={domainsToAdd}
                onChange={e => setDomainsToAdd(e.target.value)}
                className="mono-textarea"
              />

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1.5rem' }}>
                <button className="btn-primary" onClick={handleCreateZones} disabled={isBulkProcessing || !domainsToAdd.trim()}>
                  {isBulkProcessing ? <Loader2 className="loader" size={16} /> : <PlusCircle size={16} />}
                  Create Zones
                </button>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  {domainsToAdd.split(/[\n, ]+/).filter(d => d.trim()).length} domains ready
                </span>
              </div>

              {addedResults.length > 0 && (
                <div className="results-section">
                  <h4>Import Results</h4>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead><tr><th>Domain</th><th>Status</th><th>Nameservers</th></tr></thead>
                      <tbody>
                        {addedResults.map((r, i) => (
                          <tr key={i}>
                            <td className="domain-name">{r.name}</td>
                            <td><span className={`badge badge-${r.status === 'success' ? 'active' : 'error'}`}>{r.status}</span></td>
                            <td className="cell-ns">{r.ns?.join(' / ') || <span className="text-error">{r.error}</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════════ SETTINGS TAB ══════════════ */}
          {activeTab === 'setup' && (
            <div className="card settings-card">
              <h3 className="card-title"><Settings size={20} /> Configuration</h3>

              <div className="settings-group">
                <div className="form-group">
                  <label>Cloudflare API Token</label>
                  <div className="input-with-action">
                    <Key size={16} className="input-icon" />
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="Enter your Cloudflare API token"
                      style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                    />
                    <button className="btn-ghost input-action" onClick={() => setShowApiKey(!showApiKey)}>
                      {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <span className="form-hint">Your API token is stored locally in your browser.</span>
                </div>

                <div className="form-group">
                  <label>Default DMARC Report Email</label>
                  <div className="input-with-action">
                    <Mail size={16} className="input-icon" />
                    <input
                      type="text"
                      value={dmarcEmail}
                      onChange={e => setDmarcEmail(e.target.value)}
                      style={{ paddingLeft: '2.5rem' }}
                    />
                  </div>
                  <span className="form-hint">{'Use {{DOMAIN}} as a placeholder for the domain name.'}</span>
                </div>
              </div>

              <button
                className="btn-primary"
                onClick={() => {
                  localStorage.setItem('cf_api_key', apiKey);
                  localStorage.setItem('cf_dmarc_email', dmarcEmail);
                  showToast('Settings saved');
                }}
              >
                <Save size={16} /> Save Changes
              </button>
            </div>
          )}
        </main>
      </div>

      {/* ══════════════ MODAL: BULK DNS ══════════════ */}
      {showBulkDNSModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowBulkDNSModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3><ShieldCheck size={20} /> Bulk DNS Updates</h3>
              <button className="btn-ghost" onClick={() => setShowBulkDNSModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="text-muted" style={{ marginBottom: '1rem' }}>
                Applying records to <strong>{selectedZoneIds.length}</strong> selected domains. Use <code>{'{{DOMAIN}}'}</code> as a placeholder.
              </p>

              {/* Template Buttons */}
              <div className="template-chips">
                <span className="template-label">Quick Add:</span>
                <button className="chip" onClick={() => setBulkRows([...bulkRows, { type: 'A', name: '@', content: '', ttl: 1, proxied: true }])}>A Record</button>
                <button className="chip" onClick={() => setBulkRows([...bulkRows, { type: 'AAAA', name: '@', content: '', ttl: 1, proxied: true }])}>AAAA Record</button>
                <button className="chip" onClick={() => setBulkRows([...bulkRows, { type: 'CNAME', name: 'www', content: '{{DOMAIN}}', ttl: 1, proxied: true }])}>WWW CNAME</button>
                <button className="chip" onClick={() => setBulkRows([...bulkRows, { type: 'MX', name: '@', content: 'SMTP.GOOGLE.COM', priority: 1, ttl: 1 }])}>Google MX</button>
                <button className="chip" onClick={() => setBulkRows([...bulkRows, { type: 'TXT', name: '@', content: 'v=spf1 include:_spf.google.com ~all', ttl: 1 }])}>Google SPF</button>
                <button className="chip" onClick={() => setBulkRows([...bulkRows, { type: 'TXT', name: '_dmarc', content: `v=DMARC1; p=quarantine; rua=mailto:${dmarcEmail}`, ttl: 1 }])}>DMARC</button>
                <button className="chip" onClick={() => setBulkRows([...bulkRows, { type: 'NS', name: '', content: '', ttl: 1 }])}>NS Record</button>
                <button className="chip" onClick={() => setBulkRows([...bulkRows, { type: 'CAA', name: '@', content: '0 issue "letsencrypt.org"', ttl: 1 }])}>CAA Let's Encrypt</button>
                <button className="chip" onClick={() => setBulkRows([...bulkRows, { type: 'SRV', name: '', content: '', priority: 10, ttl: 1 }])}>SRV Record</button>
              </div>

              {/* Bulk Rows Table */}
              <div className="table-wrapper" style={{ marginTop: '1rem' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '130px' }}>Type</th>
                      <th>Name</th>
                      <th style={{ width: '80px' }}>Priority</th>
                      <th>Content</th>
                      <th style={{ width: '60px' }}>Proxy</th>
                      <th style={{ width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.length === 0 && (
                      <tr><td colSpan="6" className="empty-state">Click a quick-add button or add a row below.</td></tr>
                    )}
                    {bulkRows.map((row, idx) => (
                      <tr key={idx}>
                        <td>
                          <select value={row.type} onChange={e => { const r = [...bulkRows]; r[idx] = { ...r[idx], type: e.target.value }; setBulkRows(r); }}>
                            {DNS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td><input type="text" value={row.name} onChange={e => { const r = [...bulkRows]; r[idx].name = e.target.value; setBulkRows(r); }} placeholder="@" /></td>
                        <td>
                          <input
                            type="number"
                            value={row.priority ?? ''}
                            disabled={!getMeta(row.type).hasPriority}
                            onChange={e => { const r = [...bulkRows]; r[idx].priority = parseInt(e.target.value) || 0; setBulkRows(r); }}
                            placeholder="—"
                          />
                        </td>
                        <td><input type="text" value={row.content} onChange={e => { const r = [...bulkRows]; r[idx].content = e.target.value; setBulkRows(r); }} placeholder={getMeta(row.type).placeholder} /></td>
                        <td style={{ textAlign: 'center' }}>
                          {getMeta(row.type).canProxy ? (
                            <button
                              className={`proxy-icon-btn ${row.proxied ? 'proxied' : ''}`}
                              onClick={() => { const r = [...bulkRows]; r[idx].proxied = !r[idx].proxied; setBulkRows(r); }}
                            >
                              <ShieldCheck size={14} />
                            </button>
                          ) : <span className="text-muted">–</span>}
                        </td>
                        <td>
                          <button className="btn-icon btn-danger" onClick={() => setBulkRows(bulkRows.filter((_, i) => i !== idx))}>
                            <MinusCircle size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button className="btn-secondary" style={{ marginTop: '0.75rem' }} onClick={() => setBulkRows([...bulkRows, { ...INITIAL_RECORD }])}>
                <Plus size={14} /> Add Custom Row
              </button>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowBulkDNSModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleBulkDNS} disabled={bulkRows.length === 0}>
                <Zap size={16} /> Execute on {selectedZoneIds.length} Domains
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ MODAL: URL FORWARDING ══════════════ */}
      {showForwardingModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowForwardingModal(false)}>
          <div className="modal" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3><LinkIcon size={20} /> Bulk URL Forwarding</h3>
              <button className="btn-ghost" onClick={() => setShowForwardingModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                Redirect traffic for <strong>{selectedZoneIds.length}</strong> domains. Use <code>{'{{DOMAIN}}'}</code> as a placeholder.
              </p>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Source URL</label>
                <input type="text" placeholder="{{DOMAIN}}/*" value={redirectSource} onChange={e => setRedirectSource(e.target.value)} />
              </div>
              <div className="redirect-arrow"><ArrowRight size={20} /></div>
              <div className="form-group">
                <label>Target URL</label>
                <input type="text" placeholder="https://example.com/" value={redirectTarget} onChange={e => setRedirectTarget(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowForwardingModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleBulkRedirect} disabled={!redirectSource}>Apply Forwarding</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ TOAST ══════════════ */}
      {toast && (
        <div className={`toast ${toast.type === 'error' ? 'toast-error' : 'toast-success'}`}>
          {toast.type === 'error' ? <ShieldAlert size={16} /> : <Check size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* ══════════════ PROCESSING MODAL ══════════════ */}
      {isBulkProcessing && (
        <div className="modal-backdrop">
          <div className="modal modal-sm">
            <div className="modal-body" style={{ textAlign: 'center', padding: '3rem' }}>
              <Loader2 className="loader" size={48} style={{ color: 'var(--primary)', marginBottom: '1.5rem' }} />
              <h3>Processing...</h3>
              <p className="text-muted" style={{ margin: '1rem 0' }}>{bulkProgress.current} of {bulkProgress.total} complete</p>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ RESULTS MODAL ══════════════ */}
      {!isBulkProcessing && bulkProgress.total > 0 && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '620px' }}>
            <div className="modal-header">
              <h3>Execution Report</h3>
              <button className="btn-ghost" onClick={() => setBulkProgress({ ...bulkProgress, total: 0 })}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="report-stats">
                {[
                  { key: 'success', label: 'Applied', color: 'var(--success)' },
                  { key: 'error', label: 'Failed', color: 'var(--error)' },
                  { key: 'partial', label: 'Partial', color: 'var(--warning)' },
                ].map(s => (
                  <div
                    key={s.key}
                    className={`report-stat ${viewingStatusList === s.key ? 'active' : ''}`}
                    onClick={() => setViewingStatusList(viewingStatusList === s.key ? null : s.key)}
                    style={{ borderColor: s.color, cursor: 'pointer' }}
                  >
                    <div className="stat-label" style={{ color: s.color }}>{s.label}</div>
                    <div className="stat-value">{bulkProgress[s.key].length}</div>
                  </div>
                ))}
              </div>

              {viewingStatusList && bulkProgress[viewingStatusList].length > 0 && (
                <div className="table-wrapper" style={{ maxHeight: '250px', marginTop: '1rem' }}>
                  <table className="data-table">
                    <thead><tr><th>Domain</th><th>Details</th></tr></thead>
                    <tbody>
                      {bulkProgress[viewingStatusList].map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.name}</td>
                          <td className={viewingStatusList === 'success' ? 'text-success' : 'text-error'}>
                            {item.error || (item.errors?.length ? `${item.errors.length} errors` : 'OK')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setBulkProgress({ ...bulkProgress, total: 0 })}>Dismiss</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
