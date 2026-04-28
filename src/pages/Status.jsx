import React, { useState } from 'react';
import { Search, Loader2, AlertCircle, Clock, CheckCircle2, FileText } from 'lucide-react';

const StatusPage = () => {
    const [searchId, setSearchId] = useState('');
    const [searching, setSearching] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchId.trim()) return;
        
        setSearching(true);
        setError('');
        setResult(null);

        try {
            const res = await fetch(`/api/complaint/status/${searchId}`);
            const data = await res.json();
            
            if (data.status === 'success' && data.data) {
                setResult(data.data);
            } else {
                setError('Complaint ID not found.');
            }
        } catch (err) {
            setError('Server error checking status.');
        } finally {
            setSearching(false);
        }
    };

    return (
        <div className="container" style={{ maxWidth: '600px' }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <h1 className="text-gradient">Check Complaint Status</h1>
                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Track the progress of your technical support requests.</p>
            </div>

            <div className="glass-card" style={{ marginBottom: '2rem' }}>
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                        <input 
                            type="text" 
                            className="input-glass" 
                            placeholder="Enter Complaint ID (e.g., CMP-12345)" 
                            value={searchId}
                            onChange={(e) => setSearchId(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={searching || !searchId}>
                        {searching ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                        Track
                    </button>
                </form>
            </div>

            {error && (
                <div className="glass-card" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', display: 'flex', gap: '0.75rem', color: '#fca5a5' }}>
                    <AlertCircle />
                    <div>{error}</div>
                </div>
            )}

            {result && (
                <div className="glass-card" style={{ animation: 'pulse 0.3s' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
                        <FileText size={20} color="var(--primary)" /> 
                        Ticket Reference: {result.complaint_id}
                    </h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Current Status</span>
                            <span className="status-badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                                <Clock size={14} /> {result.current_status}
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Date Created</span>
                            <span>{new Date(result.created_at).toLocaleDateString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Estimated Resolution</span>
                            <span>{new Date(result.estimated_resolution).toLocaleDateString()}</span>
                        </div>

                        {result.resolution_message && (
                            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', borderLeft: '4px solid var(--success)', borderRadius: '4px' }}>
                                <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: 'var(--success)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Owner's Response:</div>
                                <div style={{ color: 'var(--text-light)', fontStyle: 'italic' }}>"{result.resolution_message}"</div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StatusPage;
