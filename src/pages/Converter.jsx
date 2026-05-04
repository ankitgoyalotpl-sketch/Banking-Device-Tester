import React, { useState, useEffect, useRef } from 'react';
import { Shield, Lock, Usb, ArrowRightLeft, AlertCircle, CheckCircle2, Loader2, Plug } from 'lucide-react';

const SBI_MAGIC_STRING = "ID0BMDQD5CpCxCtCmByBsBKD7C2CpCwCJDMD6BECVBgCbC6CbCsBPCDDnByCsCKDCDQDPDZChCaBACqBCCDC8BKC1BACMCOCNCECVBoCpC0ChC1CLD7C3CrCrBOCOCPCGCpBzBwB4BrB8BHCwBzBnCuC3CODOD5CYC1CaBACoB4BKC8BSDFD";

const ConverterPage = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    
    const [isConnected, setIsConnected] = useState(false);
    const [deviceType, setDeviceType] = useState('Unknown');
    const [status, setStatus] = useState('Waiting for connection...');
    const [loading, setLoading] = useState(false);
    
    const portRef = useRef(null);
    const readerRef = useRef(null);
    const writerRef = useRef(null);
    const bufferRef = useRef([]);
    const deviceTypeRef = useRef('Unknown');
    const detectionTimeoutRef = useRef(null);
    const readThrottleRef = useRef(null);

    const ADMIN_PASSWORD = 'admin789';

    const handleLogin = (e) => {
        e.preventDefault();
        if (password === ADMIN_PASSWORD) {
            setIsAuthenticated(true);
        } else {
            setError('Invalid Admin Passcode');
        }
    };

    const cleanup = async () => {
        if (readerRef.current) {
            try { await readerRef.current.cancel(); } catch(e) {}
            readerRef.current = null;
        }
        if (writerRef.current) {
            try { await writerRef.current.close(); } catch(e) {}
            writerRef.current = null;
        }
        if (portRef.current) {
            try { await portRef.current.close(); } catch(e) {}
            portRef.current = null;
        }
        setIsConnected(false);
        setDeviceType('Unknown');
        deviceTypeRef.current = 'Unknown';
        setStatus('Disconnected');
        bufferRef.current = [];
        if (detectionTimeoutRef.current) clearTimeout(detectionTimeoutRef.current);
    };

    const handleConnect = async () => {
        try {
            const port = await navigator.serial.requestPort();
            await port.open({ baudRate: 9600 });
            
            portRef.current = port;
            readerRef.current = port.readable.getReader();
            writerRef.current = port.writable.getWriter();

            setIsConnected(true);
            setStatus('Detecting device type...');
            setError(null);
            
            readContinuously();

            // Try to detect device
            await sendCommand('get_device_info');
            
            // Wait a bit to see if we get a response
            detectionTimeoutRef.current = setTimeout(() => {
                if (deviceTypeRef.current === 'Unknown') {
                    setStatus('Device detected (Encrypted / SBI Mode presumed)');
                    setDeviceType('SBI');
                    deviceTypeRef.current = 'SBI';
                }
            }, 2000);

        } catch (err) {
            setError(`Error connecting: ${err.message}`);
        }
    };

    const readContinuously = async () => {
        try {
            while (true) {
                if (!readerRef.current) break;
                const { value, done } = await readerRef.current.read();
                if (done) break;
                
                const newBuffer = [...bufferRef.current, ...value];
                bufferRef.current = newBuffer;

                if (!readThrottleRef.current) {
                    readThrottleRef.current = setTimeout(() => {
                        const text = new TextDecoder().decode(new Uint8Array(bufferRef.current));
                        bufferRef.current = [];
                        
                        if (text.includes('\n')) {
                            const lines = text.split('\n');
                            const lastLine = lines.pop();
                            if (lastLine) {
                                bufferRef.current = Array.from(new TextEncoder().encode(lastLine));
                            }
                            for (const line of lines) {
                                if (line.trim()) processMessage(line);
                            }
                        } else {
                            processMessage(text);
                        }
                        
                        readThrottleRef.current = null;
                    }, 200);
                }
            }
        } catch (e) {
            console.error("Reader error", e);
        }
    };

    const processMessage = (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;

        const lower = trimmed.toLowerCase();

        // Detect BOB
        if (trimmed.startsWith('{') && trimmed.includes('serial_number')) {
            if (detectionTimeoutRef.current) clearTimeout(detectionTimeoutRef.current);
            setDeviceType('BOB');
            deviceTypeRef.current = 'BOB';
            if (loading) {
                setLoading(false);
                setStatus('Conversion to BOB Complete! Device is now in Plaintext mode.');
            } else {
                setStatus('Connected (BOB Plaintext Mode)');
            }
        }
        
        // Detect SBI or Encrypted
        if (trimmed.startsWith('ID0B')) {
            if (detectionTimeoutRef.current) clearTimeout(detectionTimeoutRef.current);
            setDeviceType('SBI');
            deviceTypeRef.current = 'SBI';
            if (loading) {
                setLoading(false);
                setStatus('Conversion to SBI Complete! Device is now Encrypted.');
            } else {
                setStatus('Connected (SBI Encrypted Mode)');
            }
        }

        // Confirmation of BOB conversion
        if (lower.includes("encryption disabled") || lower.includes("disabled and saved")) {
            setDeviceType('BOB');
            deviceTypeRef.current = 'BOB';
            if (loading) {
                setLoading(false);
                setStatus('Conversion to BOB Complete! Device is now in Plaintext mode.');
            }
        }
    };

    const sendCommand = async (command) => {
        if (!writerRef.current) return;
        const req = JSON.stringify({ command }) + "\n";
        await writerRef.current.write(new TextEncoder().encode(req));
    };

    const sendRawCommand = async (rawStr) => {
        if (!writerRef.current) return;
        await writerRef.current.write(new TextEncoder().encode(rawStr + "\n"));
    };

    const convertToSBI = async () => {
        if (!isConnected) return;
        setLoading(true);
        setStatus('Converting to SBI (Enabling Encryption)...');
        await sendCommand('enable_encryption');
        
        // Timeout fallback
        setTimeout(() => {
            setLoading(false);
            if (deviceTypeRef.current !== 'SBI') {
                setDeviceType('SBI');
                deviceTypeRef.current = 'SBI';
                setStatus('Converted to SBI Mode (Fallback)');
            }
        }, 3000);
    };

    const convertToBOB = async () => {
        if (!isConnected) return;
        setLoading(true);
        setStatus('Unlocking device...');
        
        // Step 1: Send magic string to unlock (in case it's SBI)
        await sendRawCommand(SBI_MAGIC_STRING);
        
        // Step 2: Wait for unlock, then send disable_encryption
        setTimeout(async () => {
            // Only update status if we haven't already finished via processMessage
            setStatus(prev => prev.includes('Complete') ? prev : 'Converting to BOB (Disabling Encryption)...');
            await sendCommand('disable_encryption');
            
            // Timeout fallback
            setTimeout(() => {
                setLoading(false);
                if (deviceTypeRef.current !== 'BOB') {
                    setDeviceType('BOB');
                    deviceTypeRef.current = 'BOB';
                }
                setStatus(prev => prev.includes('Complete') ? prev : 'Conversion to BOB Complete! Device is now in Plaintext mode.');
            }, 3000);
        }, 2000);
    };

    // --- RENDER LOGIN ---
    if (!isAuthenticated) {
        return (
            <div className="container" style={{ maxWidth: '450px', marginTop: '5rem' }}>
                <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
                    <div style={{ background: 'rgba(59, 130, 246, 0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                        <Lock color="var(--primary)" size={32} />
                    </div>
                    <h2 style={{ marginBottom: '0.5rem' }}>Hardware Converter Portal</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Restricted Access. Please enter the admin passcode.</p>
                    
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

    // --- RENDER CONVERTER ---
    return (
        <div className="container" style={{ maxWidth: '800px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 className="text-gradient" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <ArrowRightLeft /> Hardware Converter
                    </h1>
                    <p style={{ color: 'var(--text-muted)' }}>Safely transition devices between BOB and SBI operational modes.</p>
                </div>
            </div>

            <div className="glass-card" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ 
                            width: '48px', height: '48px', borderRadius: '12px', 
                            background: isConnected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Usb color={isConnected ? "var(--success)" : "var(--text-muted)"} size={24} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0 }}>Device Connection</h3>
                            <p style={{ color: isConnected ? 'var(--success)' : 'var(--text-muted)', fontSize: '0.9rem', margin: '0.25rem 0 0 0' }}>
                                {isConnected ? 'Device Connected' : 'No device connected'}
                            </p>
                        </div>
                    </div>
                    {!isConnected ? (
                        <button className="btn btn-primary" onClick={handleConnect} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Plug size={18} /> Connect Device
                        </button>
                    ) : (
                        <button className="btn btn-danger" onClick={cleanup}>Disconnect</button>
                    )}
                </div>

                <div style={{ display: 'grid', gap: '1rem' }}>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Current Status</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '0.25rem', color: loading ? 'var(--primary)' : 'var(--text-light)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {loading && <Loader2 size={18} className="animate-spin" />}
                            {status}
                        </div>
                    </div>
                    
                    {isConnected && (
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Detected Mode</span>
                                <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '0.25rem', color: deviceType === 'SBI' ? '#3b82f6' : deviceType === 'BOB' ? '#f59e0b' : 'var(--text-light)' }}>
                                    {deviceType === 'Unknown' ? 'Identifying...' : `${deviceType} Hardware`}
                                </div>
                            </div>
                            {deviceType === 'SBI' && <Shield color="#3b82f6" size={32} />}
                            {deviceType === 'BOB' && <CheckCircle2 color="#f59e0b" size={32} />}
                        </div>
                    )}
                </div>
            </div>

            {isConnected && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    {/* Convert to SBI Box */}
                    <div className="glass-card" style={{ border: deviceType === 'SBI' ? '2px solid rgba(59, 130, 246, 0.5)' : '1px solid var(--border-subtle)' }}>
                        <h3 style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                            <Shield size={20} /> Convert to SBI
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            Enables device encryption. The device will be locked and output secured data starting with ID0B.
                        </p>
                        <button 
                            className="btn btn-primary" 
                            style={{ width: '100%', padding: '0.75rem', fontWeight: 600 }}
                            onClick={convertToSBI}
                            disabled={loading || deviceType === 'SBI'}
                        >
                            {deviceType === 'SBI' ? 'Already in SBI Mode' : 'Apply SBI Mode'}
                        </button>
                    </div>

                    {/* Convert to BOB Box */}
                    <div className="glass-card" style={{ border: deviceType === 'BOB' ? '2px solid rgba(245, 158, 11, 0.5)' : '1px solid var(--border-subtle)' }}>
                        <h3 style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                            <CheckCircle2 size={20} /> Convert to BOB
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            Disables encryption permanently. The device will output standard plaintext JSON data.
                        </p>
                        <button 
                            className="btn" 
                            style={{ 
                                width: '100%', 
                                padding: '0.75rem', 
                                fontWeight: 600,
                                background: deviceType === 'BOB' ? 'transparent' : 'rgba(245, 158, 11, 0.1)',
                                color: deviceType === 'BOB' ? 'var(--text-muted)' : '#fcd34d',
                                border: deviceType === 'BOB' ? '1px solid var(--border-subtle)' : '1px solid rgba(245, 158, 11, 0.3)'
                            }}
                            onClick={convertToBOB}
                            disabled={loading || deviceType === 'BOB'}
                        >
                            {deviceType === 'BOB' ? 'Already in BOB Mode' : 'Apply BOB Mode'}
                        </button>
                    </div>
                </div>
            )}
            
            {isConnected && deviceType !== 'Unknown' && (
                <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <AlertCircle size={20} color="#60a5fa" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#93c5fd' }}>
                        Conversion commands are sent sequentially. Please do not disconnect the device while the <Loader2 size={12} className="inline animate-spin" /> loading indicator is active.
                    </p>
                </div>
            )}
        </div>
    );
};

export default ConverterPage;
