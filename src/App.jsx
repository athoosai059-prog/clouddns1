import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
  Globe,
  Trash2,
  ShieldCheck,
  Mail,
  Activity,
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
  ChevronDown,
  Rows
} from 'lucide-react';

const API_BASE = 'http://localhost:3001/api';
const CACHE_TTL = 3600 * 1000; // 1 hour
const INITIAL_RECORD = { type: 'A', name: '@', content: '', priority: 1, ttl: 1 };

function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('cf_api_key') || '');
  const [dmarcEmail, setDmarcEmail] = useState(localStorage.getItem('cf_dmarc_email') || 'reports@{{DOMAIN}}');

  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, domains, setup
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  // Data State
  const [allZones, setAllZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedZoneIds, setSelectedZoneIds] = useState([]);
  const [records, setRecords] = useState([]);

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
  const [searchMode, setSearchMode] = useState('simple'); // simple, bulk
  const [searchTerm, setSearchTerm] = useState('');
  const [bulkSearchTerm, setBulkSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Single Form State
  const [newRecord, setNewRecord] = useState(INITIAL_RECORD);

  // Toast Helper
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
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
      const res = await axios.get(`${API_BASE}/zones`, {
        headers: { Authorization: apiKey }
      });
      const zones = res.data.result || [];
      setAllZones(zones);
      localStorage.setItem('cf_zones_cache', JSON.stringify(zones));
      localStorage.setItem('cf_zones_timestamp', Date.now().toString());
      if (force) showToast('Sync complete');
    } catch (err) {
      setError(err.response?.data?.error || 'Sync failed');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecords = async (zoneId) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/zones/${zoneId}/dns_records`, {
        headers: { Authorization: apiKey }
      });
      setRecords(res.data.result || []);
    } catch {
      showToast('Failed to load records', 'error');
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
    if (!window.confirm('Confirm deletion?')) return;
    setLoading(true);
    try {
      await axios.delete(`${API_BASE}/zones/${selectedZone.id}/dns_records/${recordId}`, {
        headers: { Authorization: apiKey }
      });
      setRecords(prev => prev.filter(r => r.id !== recordId));
      showToast('Record deleted');
    } catch { showToast('Delete failed', 'error'); }
    finally { setLoading(false); }
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
    showToast('Process complete');
  };

  const handleBulkDNS = () => {
    setShowBulkDNSModal(false);
    bulkExecutor('/dns', (zone) => ({
      url: `/zones/${zone.id}/dns_records/bulk`,
      body: {
        records: bulkRows.map(r => ({
          ...r,
          name: r.name.replace(/\{\{DOMAIN\}\}/g, zone.name),
          content: r.content.replace(/\{\{DOMAIN\}\}/g, zone.name)
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
      await axios.post(`${API_BASE}/zones/${selectedZone.id}/dns_records`, newRecord, { headers: { Authorization: apiKey } });
      await fetchRecords(selectedZone.id);
      setNewRecord(INITIAL_RECORD);
      showToast('Record added');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add record', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-logo">Cloudflow</div>
        <div className="nav-links">
          <div className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveTab('dashboard'); setSelectedZone(null); }}>
            <LayoutDashboard size={18} /> <span>Dashboard</span>
          </div>
          <div className={`nav-item ${activeTab === 'domains' ? 'active' : ''}`} onClick={() => { setActiveTab('domains'); setSelectedZone(null); }}>
            <PlusCircle size={18} /> <span>Add Domains</span>
          </div>
          <div className={`nav-item ${activeTab === 'setup' ? 'active' : ''}`} onClick={() => { setActiveTab('setup'); setSelectedZone(null); }}>
            <Settings size={18} /> <span>Settings</span>
          </div>
        </div>
        <div className="sidebar-footer">
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Last sync: {localStorage.getItem('cf_zones_timestamp') ? new Date(parseInt(localStorage.getItem('cf_zones_timestamp'))).toLocaleTimeString() : 'Never'}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-wrapper">
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem' }}>{activeTab.toUpperCase()}</h2>
            {selectedZone && <div className="badge badge-active" style={{ marginLeft: '1rem' }}>{selectedZone.name}</div>}
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {selectedZoneIds.length > 0 && <div className="badge badge-pending">Selected: {selectedZoneIds.length}</div>}
            <button className="secondary" onClick={() => fetchZones(true)} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'loader' : ''} />
              Sync API
            </button>
          </div>
        </header>

        <main className="content-area">
          {error && <div className="card text-error" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'center' }}><ShieldAlert size={18} /> {error}</div>}

          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && !selectedZone && (
            <>
              <div className="stats-grid">
                <div className="card stat-card">
                  <div className="stat-label">Total Zones</div>
                  <div className="stat-value">{allZones.length}</div>
                </div>
                <div className="card stat-card">
                  <div className="stat-label">Active Domains</div>
                  <div className="stat-value text-success">{allZones.filter(z => z.status === 'active').length}</div>
                </div>
                <div className="card stat-card">
                  <div className="stat-label">Action Required</div>
                  <div className="stat-value" style={{ color: 'var(--warning)' }}>{allZones.filter(z => z.status !== 'active').length}</div>
                </div>
              </div>

              <div className="card" style={{ position: 'relative' }}>
                <div className="filter-bar">
                  <div className="search-toggle">
                    <button className={searchMode === 'simple' ? 'active' : ''} onClick={() => setSearchMode('simple')}>Simple</button>
                    <button className={searchMode === 'bulk' ? 'active' : ''} onClick={() => setSearchMode('bulk')}>Bulk Match</button>
                  </div>

                  {searchMode === 'simple' ? (
                    <div className="search-input-wrapper">
                      <Search className="search-icon" size={16} />
                      <input type="text" placeholder="Search domains..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
                    </div>
                  ) : (
                    <div style={{ flex: 1, color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Info size={14} /> Paste your domain list below to filter instantly
                    </div>
                  )}

                  <button className="secondary" onClick={selectAllFiltered}>
                    {selectedZoneIds.length === filteredZones.length ? 'Deselect All' : 'Select All Match'}
                  </button>
                </div>

                {searchMode === 'bulk' && (
                  <div className="bulk-search-area">
                    <textarea
                      rows="4"
                      placeholder="domain1.com&#10;domain2.com"
                      value={bulkSearchTerm}
                      onChange={e => { setBulkSearchTerm(e.target.value); setCurrentPage(1); }}
                      style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)' }}
                    />
                  </div>
                )}

                <table className="domain-table">
                  <thead>
                    <tr>
                      <th width="40"></th>
                      <th>Domain Name</th>
                      <th>Status</th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedZones.map(zone => (
                      <tr key={zone.id}>
                        <td><input type="checkbox" checked={selectedZoneIds.includes(zone.id)} onChange={() => toggleZoneSelection(zone.id)} /></td>
                        <td style={{ fontWeight: 600 }}>{zone.name}</td>
                        <td><span className={`badge badge-${zone.status === 'active' ? 'active' : 'pending'}`}>{zone.status}</span></td>
                        <td className="text-muted" style={{ fontSize: '0.8rem' }}>Full Setup</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="secondary" style={{ padding: '0.4rem 0.8rem' }} onClick={() => { setSelectedZone(zone); fetchRecords(zone.id); }}>Records</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="pagination" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem' }}>
                  <button className="secondary" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft size={16} /></button>
                  <span style={{ fontSize: '0.9rem' }}>Page {currentPage} of {totalPages || 1}</span>
                  <button className="secondary" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight size={16} /></button>
                </div>
              </div>

              {selectedZoneIds.length > 0 && (
                <div className="selected-actions-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ fontWeight: 700 }}>{selectedZoneIds.length} Domains Selected</div>
                    <button className="secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem' }} onClick={() => setSelectedZoneIds([])}>Clear</button>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="primary" onClick={() => setShowBulkDNSModal(true)}><ShieldCheck size={18} /> Bulk DNS</button>
                    <button className="primary" onClick={() => setShowForwardingModal(true)}><LinkIcon size={18} /> URL Forwarding</button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* INDIVIDUAL DOMAIN RECORDS */}
          {selectedZone && (
            <div className="card">
              <div className="modal-header" style={{ border: 'none', padding: '0 0 1.5rem 0' }}>
                <div>
                  <h3 style={{ fontSize: '1.25rem' }}>{selectedZone.name}</h3>
                  <p className="text-muted">Direct DNS Records</p>
                </div>
                <button className="secondary" onClick={() => setSelectedZone(null)}>Back to Dashboard</button>
              </div>

              <div className="card" style={{ background: 'rgba(0,0,0,0.1)', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto', gap: '1rem', alignItems: 'flex-end' }}>
                <div className="form-col">
                  <label className="stat-label">Type</label>
                  <select value={newRecord.type} onChange={e => setNewRecord({ ...newRecord, type: e.target.value })}>
                    <option>A</option><option>CNAME</option><option>MX</option><option>TXT</option>
                  </select>
                </div>
                <div className="form-col">
                  <label className="stat-label">Name</label>
                  <input type="text" placeholder="@" value={newRecord.name} onChange={e => setNewRecord({ ...newRecord, name: e.target.value })} />
                </div>
                <div className="form-col">
                  <label className="stat-label">Priority</label>
                  <input type="number" value={newRecord.priority} disabled={newRecord.type !== 'MX'} onChange={e => setNewRecord({ ...newRecord, priority: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="form-col" style={{ gridColumn: 'span 2' }}>
                  <label className="stat-label">Content</label>
                  <input type="text" placeholder="Value" value={newRecord.content} onChange={e => setNewRecord({ ...newRecord, content: e.target.value })} />
                </div>
                <button className="primary" style={{ height: '40px' }} onClick={handleSingleSubmit} disabled={loading}>
                  {loading ? <Loader2 className="loader" size={16} /> : <Plus size={16} />} Add
                </button>
              </div>

              <table className="domain-table">
                <thead><tr><th>Type</th><th>Name</th><th>Content</th><th>Priority</th><th>TTL</th><th style={{ textAlign: 'right' }}></th></tr></thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      <td><span className="badge badge-active" style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#a5b4fc', fontSize: '0.65rem' }}>{r.type}</span></td>
                      <td className="font-mono">{r.name}</td>
                      <td className="font-mono text-muted" style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.content}</td>
                      <td>{r.type === 'MX' ? r.priority : '-'}</td>
                      <td>Auto</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="secondary" style={{ padding: '0.4rem', border: 'none', color: 'var(--error)' }} onClick={() => deleteRecord(r.id)}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ADD DOMAINS TAB */}
          {activeTab === 'domains' && (
            <div className="card">
              <h3>Mass Account Import</h3>
              <p className="text-muted" style={{ marginBottom: '1.5rem' }}>Add multiple domains to your Cloudflare account and retrieve nameservers.</p>

              <textarea rows="10" placeholder="domain1.com&#10;domain2.com&#10;domain3.com" value={domainsToAdd} onChange={e => setDomainsToAdd(e.target.value)} style={{ marginBottom: '1.5rem', fontFamily: 'monospace' }} />

              <button className="primary" onClick={handleCreateZones} disabled={isBulkProcessing || !domainsToAdd.trim()} style={{ marginBottom: '2rem' }}>
                {isBulkProcessing ? <Loader2 className="loader" /> : 'Create Zones'}
              </button>

              {addedResults.length > 0 && (
                <div className="card" style={{ background: 'rgba(0,0,0,0.2)' }}>
                  <h4 style={{ marginBottom: '1rem' }}>Import Results</h4>
                  <table className="domain-table">
                    <thead><tr><th>Domain</th><th>Status</th><th>Nameservers</th></tr></thead>
                    <tbody>
                      {addedResults.map((r, i) => (
                        <tr key={i}>
                          <td>{r.name}</td>
                          <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                          <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#a5b4fc' }}>{r.ns?.join(' / ') || r.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SETUP TAB */}
          {activeTab === 'setup' && (
            <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
              <h3>System Configuration</h3>
              <div className="form-col" style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                <label className="stat-label">Cloudflare Global API Token</label>
                <div style={{ position: 'relative' }}>
                  <Key size={16} className="search-icon" />
                  <input type="password" style={{ paddingLeft: '2.5rem' }} value={apiKey} onChange={e => setApiKey(e.target.value)} />
                </div>
              </div>
              <div className="form-col" style={{ marginBottom: '2rem' }}>
                <label className="stat-label">Default DMARC Report Email</label>
                <input type="text" value={dmarcEmail} onChange={e => setDmarcEmail(e.target.value)} />
              </div>
              <button className="primary" onClick={() => { localStorage.setItem('cf_api_key', apiKey); localStorage.setItem('cf_dmarc_email', dmarcEmail); showToast('Settings saved'); }}><Save size={16} /> Save Changes</button>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: BULK DNS */}
      {showBulkDNSModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Bulk DNS Updates</h3>
              <button className="secondary" onClick={() => setShowBulkDNSModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p className="text-muted" style={{ marginBottom: '1.5rem' }}>Applying to {selectedZoneIds.length} domains.</p>
              <div className="template-bar" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <button className="secondary" onClick={() => setBulkRows([...bulkRows, { type: 'TXT', name: '@', content: 'v=spf1 include:_spf.google.com ~all', ttl: 1 }])}>+ Google SPF</button>
                <button className="secondary" onClick={() => setBulkRows([...bulkRows, { type: 'MX', name: '@', content: 'SMTP.GOOGLE.COM', priority: 1, ttl: 1 }])}>+ Google MX (P1)</button>
                <button className="secondary" onClick={() => setBulkRows([...bulkRows, { type: 'TXT', name: '_dmarc', content: `v=DMARC1; p=quarantine; rua=mailto:${dmarcEmail}`, ttl: 1 }])}>+ DMARC</button>
              </div>
              <table className="domain-table">
                <thead style={{ background: 'rgba(0,0,0,0.1)' }}><tr><th>Type</th><th>Name</th><th>Priority</th><th>Value</th><th></th></tr></thead>
                <tbody>
                  {bulkRows.map((row, idx) => (
                    <tr key={idx}>
                      <td><select value={row.type} onChange={e => { const r = [...bulkRows]; r[idx].type = e.target.value; setBulkRows(r); }}><option>A</option><option>CNAME</option><option>TXT</option><option>MX</option></select></td>
                      <td><input type="text" value={row.name} onChange={e => { const r = [...bulkRows]; r[idx].name = e.target.value; setBulkRows(r); }} /></td>
                      <td><input type="number" value={row.priority} disabled={row.type !== 'MX'} onChange={e => { const r = [...bulkRows]; r[idx].priority = parseInt(e.target.value) || 0; setBulkRows(r); }} /></td>
                      <td><input type="text" value={row.content} onChange={e => { const r = [...bulkRows]; r[idx].content = e.target.value; setBulkRows(r); }} /></td>
                      <td><button className="secondary" onClick={() => setBulkRows(bulkRows.filter((_, i) => i !== idx))}><MinusCircle size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="secondary" style={{ marginTop: '1rem' }} onClick={() => setBulkRows([...bulkRows, { ...INITIAL_RECORD }])}><Plus size={16} /> Add Row</button>
            </div>
            <div className="modal-footer">
              <button className="primary" onClick={handleBulkDNS} disabled={bulkRows.length === 0}>Execute Bulk Run</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: URL FORWARDING */}
      {showForwardingModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>Bulk URL Forwarding</h3>
              <button className="secondary" onClick={() => setShowForwardingModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-col" style={{ marginBottom: '1rem' }}>
                <label className="stat-label">Source URL</label>
                <input type="text" placeholder="{{DOMAIN}}/*" value={redirectSource} onChange={e => setRedirectSource(e.target.value)} />
              </div>
              <div className="form-col">
                <label className="stat-label">Target URL</label>
                <input type="text" placeholder="https://external.com/" value={redirectTarget} onChange={e => setRedirectTarget(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="primary" onClick={handleBulkRedirect} disabled={!redirectSource}>Apply Forwarding Rules</button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL TOAST */}
      {toast && (
        <div className={`toast ${toast.type === 'error' ? 'text-error' : 'text-success'}`}>
          {toast.type === 'error' ? <ShieldAlert size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* PROCESSING PROGRESS MODAL */}
      {isBulkProcessing && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '450px' }}>
            <div className="modal-body" style={{ textAlign: 'center', padding: '3rem' }}>
              <Loader2 className="loader" size={48} color="var(--primary)" style={{ marginBottom: '1.5rem' }} />
              <h3>Processing Request</h3>
              <p className="text-muted" style={{ margin: '1rem 0' }}>{bulkProgress.current} of {bulkProgress.total} operations complete.</p>
              <div className="progress-bar-container"><div className="progress-bar-fill" style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}></div></div>
            </div>
          </div>
        </div>
      )}

      {/* RESULTS REPORTING MODAL */}
      {!isBulkProcessing && bulkProgress.total > 0 && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '600px' }}>
            <div className="modal-header"><h3>Execution Report</h3><button className="secondary" onClick={() => setBulkProgress({ ...bulkProgress, total: 0 })}><X size={18} /></button></div>
            <div className="modal-body">
              <div className="summary-grid" style={{ marginBottom: '1.5rem' }}>
                <div className={`stat-card card ${viewingStatusList === 'success' ? 'active' : ''}`} onClick={() => setViewingStatusList('success')} style={{ cursor: 'pointer', borderColor: 'var(--success)' }}>
                  <div className="stat-label text-success">Applied</div>
                  <div className="stat-value">{bulkProgress.success.length}</div>
                </div>
                <div className="stat-card card" onClick={() => setViewingStatusList('error')} style={{ cursor: 'pointer', borderColor: 'var(--error)' }}>
                  <div className="stat-label text-error">Failed</div>
                  <div className="stat-value">{bulkProgress.error.length}</div>
                </div>
                <div className="stat-card card" onClick={() => setViewingStatusList('partial')} style={{ cursor: 'pointer', borderColor: 'var(--warning)' }}>
                  <div className="stat-label" style={{ color: 'var(--warning)' }}>Partial</div>
                  <div className="stat-value">{bulkProgress.partial.length}</div>
                </div>
              </div>

              {viewingStatusList && (
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  <table className="domain-table">
                    <thead><tr><th>Domain</th><th>Context</th></tr></thead>
                    <tbody>
                      {bulkProgress[viewingStatusList].map((item, idx) => (
                        <tr key={idx}>
                          <td>{item.name}</td>
                          <td className="text-error">{item.error || (item.errors ? `${item.errors.length} errors` : 'OK')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer"><button className="primary" onClick={() => setBulkProgress({ ...bulkProgress, total: 0 })}>Dismiss</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
