import React, { useState, useEffect } from 'react';
import { Shield, Lock, Table, RefreshCw, Trash2, Calendar, User, FileText } from 'lucide-react';

const AdminPage = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const ADMIN_PASSWORD = 'admin789'; // You can change this secret password

    const handleLogin = (e) => {
        e.preventDefault();
        if (password === ADMIN_PASSWORD) {
            setIsAuthenticated(true);
            fetchComplaints();
        } else {
            setError('Invalid Admin Passcode');
        }
    };

    const fetchComplaints = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/complaints', {
                headers: { 'x-admin-key': ADMIN_PASSWORD }
            });
            const data = await res.json();
            if (data.status === 'success') {
                setComplaints(data.data);
            }
        } catch (err) {
            setError('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="container" style={{ maxWidth: '450px', marginTop: '5rem' }}>
                <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                    <div style={{ background: 'rgba(59, 130, 246, 0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                        <Lock color="var(--primary)" size={32} />
                    </div>
                    <h2 style={{ marginBottom: '0.5rem' }}>Admin Access</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Please enter the master passcode to view dashboard.</p>
                    
                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <input 
                            type="password" 
                            className="input-glass" 
                            placeholder="Enter Passcode" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoFocus
                        />
                        {error && <p style={{ color: '#fca5a5', fontSize: '0.85rem' }}>{error}</p>}
                        <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Verify & Enter</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="container-fluid" style={{ padding: '0 2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 className="text-gradient" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Shield/> Admin Dashboard</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Manage and track all customer complaints in real-time.</p>
                </div>
                <button className="btn btn-primary" onClick={fetchComplaints} disabled={loading}>
                    <RefreshCw className={loading ? 'animate-spin' : ''} size={18} /> Refresh Data
                </button>
            </div>

            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--border-subtle)' }}>
                                <th style={{ padding: '1.25rem' }}>ID</th>
                                <th style={{ padding: '1.25rem' }}>Customer</th>
                                <th style={{ padding: '1.25rem' }}>Serial No.</th>
                                <th style={{ padding: '1.25rem' }}>Issue Description</th>
                                <th style={{ padding: '1.25rem' }}>Date</th>
                                <th style={{ padding: '1.25rem' }}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {complaints.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        No complaints found in database.
                                    </td>
                                </tr>
                            ) : complaints.map((item) => (
                                <tr key={item._id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}>
                                    <td style={{ padding: '1.25rem', fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 600 }}>{item.complaint_id}</td>
                                    <td style={{ padding: '1.25rem' }}>
                                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.email}</div>
                                    </td>
                                    <td style={{ padding: '1.25rem' }}>{item.serial_number}</td>
                                    <td style={{ padding: '1.25rem', maxWidth: '300px' }}>
                                        <div style={{ fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.issue}>
                                            {item.issue}
                                        </div>
                                    </td>
                                    <td style={{ padding: '1.25rem', fontSize: '0.85rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Calendar size={14} /> {new Date(item.created_at).toLocaleDateString()}
                                        </div>
                                    </td>
                                    <td style={{ padding: '1.25rem' }}>
                                        <span className="status-badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.3)', fontSize: '0.75rem' }}>
                                            {item.current_status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminPage;
