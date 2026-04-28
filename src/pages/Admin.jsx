import React, { useEffect, useState } from 'react';
import { List, CheckCircle, Clock, AlertCircle, MessageSquare, Send } from 'lucide-react';

const AdminPage = () => {
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(null);

    const fetchComplaints = async () => {
        try {
            const res = await fetch('/api/admin/complaints');
            const result = await res.json();
            if (result.status === 'success') {
                setComplaints(result.data);
            }
        } catch (err) {
            console.error('Failed to fetch:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchComplaints();
    }, []);

    const handleUpdate = async (id, currentStatus, currentMsg) => {
        const newStatus = prompt('Enter new status (Investigating, In Progress, Resolved):', currentStatus);
        const newMessage = prompt('Enter resolution message / reply:', currentMsg);
        
        if (!newStatus) return;

        setUpdating(id);
        try {
            const res = await fetch(`/api/admin/complaint/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus, message: newMessage })
            });
            const result = await res.json();
            if (result.status === 'success') {
                fetchComplaints();
            }
        } catch (err) {
            alert('Update failed');
        } finally {
            setUpdating(null);
        }
    };

    if (loading) return <div className="container" style={{ textAlign: 'center', marginTop: '5rem' }}>Loading Admin Dashboard...</div>;

    return (
        <div className="container">
            <div style={{ marginBottom: '2rem' }}>
                <h1 className="text-gradient">Admin Dashboard</h1>
                <p style={{ color: 'var(--text-muted)' }}>Manage and respond to hardware complaints.</p>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
                {complaints.length === 0 ? (
                    <div className="glass-card" style={{ textAlign: 'center', padding: '3rem' }}>
                        <List size={48} color="var(--text-muted)" style={{ opacity: 0.3, marginBottom: '1rem' }} />
                        <p style={{ color: 'var(--text-muted)' }}>No complaints found in database.</p>
                    </div>
                ) : (
                    complaints.map(c => (
                        <div key={c._id} className="glass-card" style={{ borderLeft: `4px solid ${c.current_status === 'Resolved' ? 'var(--success)' : 'var(--primary)'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>ID: {c.complaint_id}</div>
                                    <h3 style={{ margin: 0 }}>{c.name} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>({c.email})</span></h3>
                                </div>
                                <div className="status-badge" style={{ 
                                    background: c.current_status === 'Resolved' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                                    color: c.current_status === 'Resolved' ? '#4ade80' : '#60a5fa'
                                }}>
                                    {c.current_status === 'Resolved' ? <CheckCircle size={14}/> : <Clock size={14}/>} {c.current_status}
                                </div>
                            </div>

                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 'bold', marginBottom: '0.25rem' }}>SERIAL: {c.serial_number}</div>
                                <div style={{ color: 'var(--text-light)' }}>{c.issue}</div>
                            </div>

                            {c.resolution_message && (
                                <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--success)', display: 'flex', gap: '0.5rem' }}>
                                    <MessageSquare size={16}/> <strong>Reply:</strong> {c.resolution_message}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button 
                                    className="btn btn-primary" 
                                    style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                                    onClick={() => handleUpdate(c.complaint_id, c.current_status, c.resolution_message)}
                                    disabled={updating === c.complaint_id}
                                >
                                    {updating === c.complaint_id ? 'Updating...' : <><Send size={14}/> Update Status / Reply</>}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AdminPage;
