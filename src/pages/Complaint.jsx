import React, { useState } from 'react';
import { FileText, Send, CheckCircle2, AlertCircle } from 'lucide-react';

const ComplaintPage = () => {
    const [submitting, setSubmitting] = useState(false);
    const [successId, setSuccessId] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        
        const form = e.target;
        const data = {
            name: form.name.value,
            email: form.email.value,
            serial_number: form.serial.value,
            issue: form.issue.value
        };

        try {
            const res = await fetch('/api/complaint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            
            if (result.status === 'success') {
                setSuccessId(result.complaint_id);
                form.reset();
            } else {
                setError('Failed to lodge complaint.');
            }
        } catch (err) {
            setError('Server error while submitting complaint.');
        } finally {
            setSubmitting(false);
        }
    };

    if (successId) {
        return (
            <div className="container" style={{ maxWidth: '600px', textAlign: 'center', marginTop: '4rem' }}>
                <div className="glass-card" style={{ padding: '3rem 2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                        <CheckCircle2 color="var(--success)" size={64} />
                    </div>
                    <h2 style={{ marginBottom: '1rem', color: 'var(--success)' }}>Complaint Lodged Successfully</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Your support request has been generated.</p>
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', fontSize: '1.25rem', fontFamily: 'monospace', letterSpacing: '2px', color: 'var(--text-light)', marginBottom: '2rem' }}>
                        {successId}
                    </div>
                    <button className="btn btn-primary" onClick={() => setSuccessId('')}>Submit Another Document</button>
                </div>
            </div>
        );
    }

    return (
        <div className="container" style={{ maxWidth: '700px' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h1 className="text-gradient" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><FileText/> Create Complaint</h1>
                <p style={{ color: 'var(--text-muted)' }}>Found a problem with your device? Let us know below.</p>
            </div>

            <div className="glass-card">
                {error && (
                    <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <AlertCircle size={18} /> {error}
                    </div>
                )}
                
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Full Name</label>
                            <input type="text" name="name" required className="input-glass" placeholder="John Doe" />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Email Address</label>
                            <input type="email" name="email" required className="input-glass" placeholder="john@example.com" />
                        </div>
                    </div>
                    
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Device Serial Number</label>
                        <input type="text" name="serial" required className="input-glass" placeholder="e.g. GPS-80-XXXX" />
                    </div>
                    
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Detailed Issue Description</label>
                        <textarea name="issue" required className="input-glass" rows="4" placeholder="Please describe the issue you are facing..."></textarea>
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }} disabled={submitting}>
                        {submitting ? 'Submitting...' : <><Send size={18} /> Submit Complaint</>}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ComplaintPage;
