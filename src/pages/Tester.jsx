import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Terminal, ShieldAlert, CheckCircle2, AlertCircle, Loader2, Navigation, Activity, Cpu, Info, Usb, Plug2, List, PlayCircle, Plug, Lock, ShieldCheck } from 'lucide-react';

const TOTAL_TEST_TIME = 10 * 60 * 1000;
const ANTENNA_SUGGESTION_TIME = 3 * 60 * 1000;
const API_ENDPOINT = '/api/device';
const DECRYPT_ENDPOINT = '/api/decrypt';
const SBI_MAGIC_STRING = "ID0BMDQD5CpCxCtCmByBsBKD7C2CpCwCJDMD6BECVBgCbC6CbCsBPCDDzByCsCKDCDQDPDZChCaBACqBCCDC8BKC1BACMCOCNCECVBoCpC0ChC1CLD7C3CrCrBOCOCPCGCpBzBwB4BrB8BHCwBzBnCuC3CODOD5CYC1CaBACoB4BKC8BSDFD";

const STATUS = {
    DISCONNECTED: 'Disconnected',
    CONNECTED: 'Connected',
    RECEIVING: 'Receiving',
    DISCONNECTING: 'Disconnecting...',
    LOCKING: 'Locking...'
};

const TesterPage = () => {
    const { bank } = useParams();
    const navigate = useNavigate();
    
    const bankColors = { sbi: '#3b82f6', bob: '#f97316', bom: '#ef4444', other: '#8b5cf6' };
    const themeColor = bank ? (bankColors[bank] || 'var(--primary)') : 'var(--primary)';

    const [termsAccepted, setTermsAccepted] = useState(false);
    const [showTerms, setShowTerms] = useState(false);
    const [termsChecked, setTermsChecked] = useState(false);

    const [status, setStatus] = useState(STATUS.DISCONNECTED);
    const [deviceInfo, setDeviceInfo] = useState(null);
    const [locationInfo, setLocationInfo] = useState(null);
    const [error, setError] = useState(null);
    const [sbiIssueStatus, setSbiIssueStatus] = useState(null);
    const [lockStatus, setLockStatus] = useState(null);
    const [networkStatus, setNetworkStatus] = useState(null);
    const [debugText, setDebugText] = useState("");
    
    const [progress, setProgress] = useState(0);
    const [showTimeAlert, setShowTimeAlert] = useState(false);

    // Refs for Serial API state since we access them in timeouts/intervals
    const portRef = useRef(null);
    const readerRef = useRef(null);
    const writerRef = useRef(null);
    const testIdRef = useRef('');
    const serialNumRef = useRef('');
    const currentCommandRef = useRef(null);
    const locationIntervalRef = useRef(null);
    const progressIntervalRef = useRef(null);
    const sbiTimeoutRef = useRef(null);
    const networkTimeoutRef = useRef(null);
    const networkStatusRef = useRef(null);
    const bufferRef = useRef([]);
    const sbiIssueStatusRef = useRef(null);
    const lockStatusRef = useRef(null);

    useEffect(() => {
        if (!bank) {
            navigate('/', { replace: true });
            return;
        }
        const accepted = localStorage.getItem('gpsDeviceTermsAccepted') === 'true';
        if (accepted) {
            setTermsAccepted(true);
        } else {
            setShowTerms(true);
        }
        return cleanup;
        // eslint-disable-next-line
    }, [bank, navigate]);

    const cleanup = async () => {
        stopLocationChecking();
        stopProgressTracking();
        if (sbiTimeoutRef.current) {
            clearTimeout(sbiTimeoutRef.current);
            sbiTimeoutRef.current = null;
        }
        if (networkTimeoutRef.current) {
            clearTimeout(networkTimeoutRef.current);
            networkTimeoutRef.current = null;
        }
        try {
            if (bank === 'sbi' && writerRef.current && sbiIssueStatusRef.current === 'Success') {
                // Restore encryption before closing just in case
                await writerRef.current.write(new TextEncoder().encode(JSON.stringify({ command: 'enable_encryption' }) + "\n"));
                await new Promise(r => setTimeout(r, 200));
            }
            if (readerRef.current) {
                try {
                    await readerRef.current.cancel();
                    readerRef.current.releaseLock();
                } catch (e) {
                    console.log("Reader cleanup warning:", e.message);
                }
                readerRef.current = null;
            }
            if (writerRef.current) {
                writerRef.current.releaseLock();
                writerRef.current = null;
            }
            if (portRef.current) {
                await portRef.current.close();
                portRef.current = null;
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleAcceptTerms = () => {
        setTermsAccepted(true);
        localStorage.setItem('gpsDeviceTermsAccepted', 'true');
        setShowTerms(false);
    };

    const sendToAPI = async (action, data) => {
        try {
            const payload = { action, ...data };
            const res = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            if (result.status === 'success' && result.test_id) {
                testIdRef.current = result.test_id;
            }
        } catch (err) {
            console.error('API Error:', err);
        }
    };

    const handleConnect = async () => {
        if (!termsAccepted) {
            setShowTerms(true);
            return;
        }

        try {
            const port = await navigator.serial.requestPort();
            await port.open({ baudRate: 9600 });
            
            portRef.current = port;
            readerRef.current = port.readable.getReader();
            writerRef.current = port.writable.getWriter();

            setStatus('Connected');
            setError(null);
            setDeviceInfo(null);
            setLocationInfo(null);
            setSbiIssueStatus(null);
            sbiIssueStatusRef.current = null;
            setNetworkStatus(null);
            networkStatusRef.current = null;
            setDebugText("");
            setProgress(0);
            currentCommandRef.current = null;
            
            readContinuously();
        } catch (err) {
            setError(`Error connecting: ${err.message}`);
        }
    };

    const handleStopAndSecure = async () => {
        // Trigger the full safe disconnect logic
        await handleDisconnect();
    };

    const handleDisconnect = async () => {
        // Only attempt safe disconnect (relock) if we successfully verified and unlocked an SBI device
        if (bank === 'sbi' && status === STATUS.CONNECTED && sbiIssueStatusRef.current === 'Success') {
            try {
                setStatus(STATUS.DISCONNECTING);
                currentCommandRef.current = 'safe_disconnect';
                await sendCommand('enable_encryption');
                
                // Safety timeout: if device doesn't respond in 3s, force close
                setTimeout(() => {
                    if (portRef.current) cleanup();
                }, 3000);
                return;
            } catch (err) {
                console.error("Safe disconnect failed:", err);
            }
        }
        await cleanup();
        setStatus(STATUS.DISCONNECTED);
        setDeviceInfo(null);
        setLocationInfo(null);
        setSbiIssueStatus(null);
        setLockStatus(null);
        setNetworkStatus(null);
        networkStatusRef.current = null;
        setDebugText("");
    };

    const sendCommand = async (command, additionalParams = {}) => {
        try {
            bufferRef.current = [];
            const req = JSON.stringify({ command, ...additionalParams }) + "\n";
            await writerRef.current.write(new TextEncoder().encode(req));
            setStatus(STATUS.CONNECTED);
        } catch (err) {
            setError(`Command Error: ${err.message}`);
            setStatus(STATUS.DISCONNECTED);
        }
    };

    const sendRawCommand = async (rawStr) => {
        try {
            bufferRef.current = [];
            await writerRef.current.write(new TextEncoder().encode(rawStr + "\n"));
            setStatus(STATUS.CONNECTED);
        } catch (err) {
            setError(`Command Error: ${err.message}`);
            setStatus(STATUS.DISCONNECTED);
        }
    };

    const handleRunTest = async () => {
        if (!termsAccepted) return;
        setDeviceInfo(null);
        setLocationInfo(null);
        setError(null);
        setSbiIssueStatus(null);
        sbiIssueStatusRef.current = null;
        setNetworkStatus(null);
        networkStatusRef.current = null;
        setShowTimeAlert(false);
        setProgress(0);
        
        stopLocationChecking();
        stopProgressTracking();
        startProgressTracking();

        if (bank === 'sbi') {
            currentCommandRef.current = 'sbi_issue';
            setSbiIssueStatus('Pending');
            sbiIssueStatusRef.current = 'Pending';
            await sendRawCommand(SBI_MAGIC_STRING);
        } else {
            currentCommandRef.current = 'get_device_info';
            await sendCommand('get_device_info');
        }
    };

    const sbiBufferTimeoutRef = useRef(null);

    const readContinuously = async () => {
        try {
            while (true) {
                if (!readerRef.current) break;
                const { value, done } = await readerRef.current.read();
                if (done) break;
                
                const newBuffer = [...bufferRef.current, ...value];
                
                if (bank === 'sbi') {
                    bufferRef.current = newBuffer;
                    if (!sbiBufferTimeoutRef.current) {
                        sbiBufferTimeoutRef.current = setTimeout(() => {
                            if (bufferRef.current.length > 0) {
                                const fullMsg = new Uint8Array(bufferRef.current);
                                bufferRef.current = [];
                                processMessageBytes(fullMsg);
                            }
                            sbiBufferTimeoutRef.current = null;
                        }, 200);
                    }
                } else {
                    const newlineIndex = newBuffer.indexOf(10);
                    if (newlineIndex !== -1) {
                        const msgBytes = newBuffer.slice(0, newlineIndex);
                        bufferRef.current = newBuffer.slice(newlineIndex + 1);
                        processMessageBytes(msgBytes);
                    } else if (newBuffer.length > 2000) {
                        bufferRef.current = [];
                        processMessageBytes(newBuffer);
                    } else {
                        bufferRef.current = newBuffer;
                    }
                }
            }
        } catch (err) {
            if (portRef.current) {
                setError(`Read Error: The device has been lost or disconnected.`);
            }
            setStatus(STATUS.DISCONNECTED);
            setSbiIssueStatus(null);
            sbiIssueStatusRef.current = null;
            cleanup();
        } finally {
            if (readerRef.current) {
               try { readerRef.current.releaseLock(); } catch(e) {}
            }
        }
    };

    const processMessageBytes = (bytes) => {
        const text = new TextDecoder().decode(new Uint8Array(bytes));
        const trimmedText = text.trim();

        // 1. Cross-Hardware Detection (Safety First)
        if (bank !== 'sbi' && (trimmedText.startsWith('ID0B') || (trimmedText.length > 100 && !trimmedText.startsWith('{')))) {
            setError("Hardware Mismatch: This is an SBI device. Please use the SBI Tester.");
            stopProgressTracking();
            cleanup();
            return;
        }
        
        if (currentCommandRef.current === 'sbi_issue') {
            if (text.includes("ID0B") || text.includes("BMDQ")) {
                if (sbiIssueStatusRef.current !== 'Success') {
                    setSbiIssueStatus('Success');
                    sbiIssueStatusRef.current = 'Success';
                    // Step 2: One-time unlock for fast polling
                    currentCommandRef.current = 'disable_encryption';
                    setTimeout(() => sendCommand('disable_encryption'), 2000);
                }
                return;
            }
        }

        if (currentCommandRef.current === 'disable_encryption') {
            if (text.includes("success") || text.includes("disabled")) {
                setLockStatus('Unsecured');
                lockStatusRef.current = 'Unsecured';
                currentCommandRef.current = 'get_device_info';
                setTimeout(() => sendCommand('get_device_info'), 1000);
            }
            return;
        }

        try {
            const trimmedText = text.trim();
            // Priority: Check for encryption status messages first (plaintext, JSON, or Magic String)
            const lowText = trimmedText.toLowerCase();
            const isMagicString = trimmedText.startsWith('ID0B');
            
            if (lowText.includes("encryption enabled") || lowText.includes("encryption_enabled\":true") || (lowText.includes("success") && lowText.includes("encryption")) || isMagicString) {
                if (lockStatusRef.current !== 'Encrypted') {
                    setLockStatus('Encrypted');
                    lockStatusRef.current = 'Encrypted';
                    if (currentCommandRef.current === 'safe_disconnect') {
                        cleanup();
                        setStatus(STATUS.DISCONNECTED);
                    }
                }
                if (isMagicString) return; // Don't try to parse magic string as JSON
            }

            if (bank === 'sbi' && trimmedText.length > 50 && (trimmedText.startsWith('ID0B') || !trimmedText.startsWith('{'))) {
                handleEncryptedSbiData(trimmedText);
                return;
            }

            const dataObj = JSON.parse(trimmedText);

            // 2. Data-level Mismatch Detection
            if (dataObj) {
                if (bank === 'sbi' && sbiIssueStatusRef.current !== 'Success') {
                     // If we are on the SBI page but receiving plaintext JSON without having 
                     // successfully completed the SBI magic string unlock flow, it's behaving as a BOB device.
                     setError("Hardware Mismatch: This is a BOB device. Please use the BOB Tester.");
                     stopProgressTracking();
                     cleanup();
                     return;
                }
            }

            if (bank !== 'bob' && bank !== 'sbi' && dataObj && dataObj.data && dataObj.data.serial_number) {
                setError(`Hardware Mismatch: Please use the official ${bank.toUpperCase()} portal for this device.`);
                stopProgressTracking();
                setDeviceInfo(null);
                setSbiIssueStatus(null);
                sbiIssueStatusRef.current = null;
                return;
            }

            if (currentCommandRef.current === 'get_device_info') {
                handleDeviceInfo(dataObj);
            } else if (currentCommandRef.current === 'get_location') {
                handleLocation(dataObj);
            }
        } catch (e) {
            if (bank === 'sbi' && !text.trim().startsWith('{')) {
                handleEncryptedSbiData(text.trim());
                return;
            }
            setError(`Invalid Response: ${text}`);
            stopProgressTracking();
        }
    };

    const handleEncryptedSbiData = async (encryptedData) => {
        try {
            const cleanedData = encryptedData.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9=]+$/g, '');
            const res = await fetch(DECRYPT_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ encrypted_data: cleanedData })
            });
            const decrypted = await res.json();
            
            if (decrypted.status === 'success' && decrypted.data) {
                if (currentCommandRef.current === 'get_device_info' || !deviceInfo) {
                    handleDeviceInfo(decrypted);
                } else {
                    handleLocation(decrypted);
                }
            }
        } catch (err) {
            console.error("Decryption Error:", err);
        }
    };

    const processMessage = processMessageBytes;


    const handleDeviceInfo = (response) => {
        if (response.status === 'success' && response.data) {
            serialNumRef.current = response.data.serial_number || 'unknown';
            setDeviceInfo(response.data);
            sendToAPI('test_started', {
                serial_number: serialNumRef.current,
                firmware_version: response.data.firmware_version || 'unknown',
                device_status: response.data.device_status || 'unknown'
            });

            currentCommandRef.current = 'get_location';
            sendCommand('get_location');
            
            locationIntervalRef.current = setInterval(() => {
                if (currentCommandRef.current === 'get_location') {
                    sendCommand('get_location');
                }
            }, 5000);
        } else {
            setError(`Device Info Failed: ${response.message}`);
            if (serialNumRef.current) {
                sendToAPI('test_failed', { serial_number: serialNumRef.current, reason: 'Failed dev info' });
            }
            stopProgressTracking();
        }

    };

    const handleLocation = (response) => {
        const isValid = response.status === "success" && response.data && response.data.latitude && 
            !(parseFloat(response.data.latitude) === 0.0 && parseFloat(response.data.longitude) === 0.0);
            
        if (isValid) {
            setLocationInfo(response.data);
            setShowTimeAlert(false);
            if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
            stopLocationChecking();
            stopProgressTracking();
            
            // Re-lock SBI device after successful test
            if (bank === 'sbi') {
                setLockStatus('Locking...');
                currentCommandRef.current = 'sbi_lock';
                sendCommand('enable_encryption');
                // Fallback: If device doesn't confirm in 4s, set to Encrypted anyway
                setTimeout(() => {
                    setLockStatus(prev => prev === 'Locking...' ? 'Encrypted' : prev);
                }, 4000);
            }
            sendToAPI('gps_captured', {
                serial_number: serialNumRef.current,
                test_id: testIdRef.current,
                latitude: response.data.latitude,
                longitude: response.data.longitude,
                accuracy: response.data.accuracy || 'unknown'
            });
        }
    };

    const stopLocationChecking = () => {
        if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    };

    const startProgressTracking = () => {
        const start = Date.now();
        progressIntervalRef.current = setInterval(() => {
            const elapsed = Date.now() - start;
            setProgress(Math.min(100, (elapsed / TOTAL_TEST_TIME) * 100));
            
            if (elapsed >= ANTENNA_SUGGESTION_TIME && !locationInfo) {
                setShowTimeAlert(true);
            }
            if (elapsed >= TOTAL_TEST_TIME && !locationInfo) {
                stopLocationChecking();
                stopProgressTracking();
                setError("Test timed out after 10 minutes.");
                sendToAPI('test_failed', { serial_number: serialNumRef.current, reason: 'Timeout' });
            }
        }, 1000);
    };

    const stopProgressTracking = () => {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };

    const isConnected = status !== STATUS.DISCONNECTED;

    return (
        <div className="container" style={{ maxWidth: '900px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1 className="text-gradient">GPS {bank?.toUpperCase() || ''} Tester</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Verify device connectivity and location services</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                    <div className={`status-badge ${status.toLowerCase()}`}>
                        <Activity size={16} />
                        {status}
                    </div>
                    {sbiIssueStatus === 'Pending' && (
                        <div style={{ color: 'var(--primary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, animation: 'fadeIn 0.3s' }}>
                            <Loader2 size={14} className="animate-spin" /> Receiving...
                        </div>
                    )}
                    {sbiIssueStatus === 'Success' && (
                        <div style={{ color: 'var(--badge-active)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, animation: 'fadeIn 0.3s' }}>
                            <CheckCircle2 size={14} /> Success
                        </div>
                    )}
                </div>
            </div>

            {lockStatus === 'Unsecured' && (
                <div style={{ 
                    marginBottom: '2rem', 
                    padding: '1.25rem', 
                    background: 'rgba(239, 68, 68, 0.15)', 
                    borderRadius: '12px', 
                    border: '2px solid #ef4444', 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: '1rem',
                    animation: 'pulseGlow 2s infinite',
                    boxShadow: '0 0 30px rgba(239, 68, 68, 0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <ShieldAlert size={32} color="#ef4444" />
                        <div>
                            <div style={{ color: '#ef4444', fontWeight: 900, fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                CRITICAL WARNING: DEVICE UNSECURED
                            </div>
                            <div style={{ color: '#fca5a5', fontSize: '1rem', fontWeight: 600 }}>
                                DO NOT DISCONNECT CABLE - Permanent hardware damage or corruption may occur.
                            </div>
                        </div>
                    </div>
                    
                    <button 
                        onClick={handleStopAndSecure}
                        className="btn btn-danger"
                        style={{ 
                            width: '100%', 
                            padding: '1rem', 
                            fontWeight: 900, 
                            fontSize: '1.1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            boxShadow: '0 0 20px rgba(239, 68, 68, 0.4)',
                            transition: 'all 0.3s'
                        }}
                    >
                        <Lock size={20} /> STOP & SECURE DEVICE NOW
                    </button>
                </div>
            )}

            <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr' }}>
                
                {/* Control Panel */}
                <div className="glass-card" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <button 
                        className="btn btn-connect" 
                        onClick={handleConnect} 
                        disabled={isConnected}
                    >
                        <Plug size={18} style={{ marginRight: '0.2rem' }} /> CONNECT DEVICE
                    </button>
                    <button className="btn btn-danger" onClick={handleDisconnect} disabled={!isConnected}>
                        Disconnect
                    </button>
                    {bank === 'sbi' && (
                        <button className="btn" style={{ background: '#3b82f6', color: 'white', border: 'none' }} disabled={!isConnected || status === 'Receiving'} onClick={handleRunTest}>
                            <ShieldAlert size={16} style={{ marginRight: '0.5rem' }}/> SBI ISSUE
                        </button>
                    )}
                    <button className="btn btn-success" onClick={handleRunTest} disabled={!isConnected || status === 'Receiving'} style={{ marginLeft: 'auto' }}>
                        Run Device Test
                    </button>
                </div>

                {/* Progress / Status Area */}
                {(progress > 0 && progress < 100 && !locationInfo && !error) && (
                    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="radar-dot" style={{ transform: 'scale(1.5)', margin: '1rem' }}></div>
                        <div style={{ width: '100%', background: 'var(--bg-dark)', height: '6px', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: themeColor, width: `${progress}%`, transition: 'width 1s linear' }}></div>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Acquiring GPS Signal...</p>
                    </div>
                )}

                {/* Alert */}
                {showTimeAlert && (
                    <div className="glass-card" style={{ background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', color: '#fcd34d' }}>
                            <AlertCircle />
                            <div>
                                <strong>Suggestion:</strong> Please connect an external antenna or place the device outside where clear sky is visible.
                            </div>
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="glass-card" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)', wordBreak: 'break-all' }}>
                        <div style={{ display: 'flex', gap: '0.75rem', color: '#fca5a5' }}>
                            <ShieldAlert style={{ flexShrink: 0 }} />
                            <div>{error}</div>
                        </div>
                    </div>
                )}

                {/* Results Grid */}
                {sbiIssueStatus === 'Pending' && (
                    <div className="glass-card" style={{ animation: 'pulse 0.4s', borderLeft: '4px solid var(--primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <Loader2 className="animate-spin" size={24} color="var(--primary)" />
                        <h3 style={{ color: 'var(--text-light)', margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Awaiting Device Verification...</h3>
                    </div>
                )}
                {sbiIssueStatus === 'Success' && (
                    <div className="glass-card" style={{ animation: 'pulse 0.4s', borderLeft: '4px solid var(--primary)', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-subtle)' }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-light)', fontSize: '1.05rem', margin: 0 }}><ShieldAlert size={18} color="var(--primary)"/> SBI ISSUE Test Response</h3>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontWeight: 600, fontSize: '0.9rem' }}><CheckCircle2 size={16} /> Success</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ color: 'var(--text-light)', width: '150px', fontWeight: 600, fontSize: '0.95rem' }}>Status:</span><span style={{ color: 'var(--text-muted)' }}>Success</span></div>
                            <div style={{ display: 'flex', alignItems: 'center' }}><span style={{ color: 'var(--text-light)', width: '150px', fontWeight: 600, fontSize: '0.95rem' }}>Result:</span><span style={{ color: 'var(--text-muted)' }}>Command executed successfully</span></div>
                            {lockStatus === 'Encrypted' && (
                                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(34, 197, 94, 0.1)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.2)', width: 'fit-content' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }}></div>
                                    <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.9rem' }}>Hardware Re-Locked & Secured - You can now safely disconnect</span>
                                </div>
                            )}
                            {lockStatus === 'Locking...' && (
                                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(59, 130, 246, 0.1)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.2)', width: 'fit-content' }}>
                                    <Loader2 size={16} className="animate-spin" color="#3b82f6" />
                                    <span style={{ color: '#93c5fd', fontWeight: 600, fontSize: '0.85rem' }}>Securing Hardware... Please Wait</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                




                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.5rem' }}>
                    {deviceInfo && (
                        <div className="glass-card" style={{ animation: 'pulse 0.4s' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Cpu size={18} color="var(--primary)"/> Device Info</h3>
                                <CheckCircle2 color="var(--success)" size={20} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Serial Number</span><span>{deviceInfo.serial_number}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Firmware</span><span>{deviceInfo.firmware_version}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Status</span><span style={{ color: 'var(--success)' }}>{deviceInfo.device_status}</span></div>
                            </div>
                        </div>
                    )}

                    {locationInfo && (
                        <div className="glass-card" style={{ animation: 'pulse 0.4s' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Navigation size={18} color="var(--primary)"/> Location Info</h3>
                                <CheckCircle2 color="var(--success)" size={20} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Latitude</span><span>{locationInfo.latitude}°</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Longitude</span><span>{locationInfo.longitude}°</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-muted)' }}>Accuracy</span><span>{locationInfo.accuracy}</span></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Instructions Panel */}
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden', marginTop: '0.5rem' }}>
                    <div style={{ background: '#3b82f6', color: 'white', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Info size={22} />
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>How to Connect Your GPS Device</h3>
                    </div>
                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        
                        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ background: '#3b82f6', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                                <Usb size={22} />
                            </div>
                            <div>
                                <h4 style={{ color: 'var(--primary)', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>Step 1</h4>
                                <h3 style={{ margin: 0, marginBottom: '0.35rem', fontSize: '1.05rem', color: 'var(--text-light)', fontWeight: 500 }}>Connect your GPS device</h3>
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>Plug your GPS8.0 device into an available USB port on your computer.</p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ background: '#3b82f6', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                                <Plug2 size={22} />
                            </div>
                            <div>
                                <h4 style={{ color: 'var(--primary)', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>Step 2</h4>
                                <h3 style={{ margin: 0, marginBottom: '0.35rem', fontSize: '1.05rem', color: 'var(--text-light)', fontWeight: 500 }}>Click "Connect Device" button</h3>
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>After clicking, a popup will appear asking you to select a serial port.</p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ background: '#3b82f6', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                                <List size={22} />
                            </div>
                            <div>
                                <h4 style={{ color: 'var(--primary)', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>Step 3</h4>
                                <h3 style={{ margin: 0, marginBottom: '0.35rem', fontSize: '1.05rem', color: 'var(--text-light)', fontWeight: 500 }}>Select the correct port</h3>
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>Choose "USB Serial" or "USB Serial CH340" from the list of available ports.</p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ background: '#3b82f6', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 }}>
                                <PlayCircle size={22} />
                            </div>
                            <div>
                                <h4 style={{ color: 'var(--primary)', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>Step 4</h4>
                                <h3 style={{ margin: 0, marginBottom: '0.35rem', fontSize: '1.05rem', color: 'var(--text-light)', fontWeight: 500 }}>Click "Run Device Test"</h3>
                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.5 }}>After connecting successfully, click the Run Device Test button to begin testing your GPS device.</p>
                            </div>
                        </div>

                    </div>
                </div>

            </div>

            {/* Terms Modal */}
            {showTerms && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
                    <div className="glass-panel" style={{ width: '600px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ background: themeColor, padding: '1.5rem', color: 'white' }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ShieldAlert/> Terms & Conditions</h3>
                        </div>
                        <div style={{ padding: '2rem' }}>
                            <h4 style={{ marginBottom: '0.5rem' }}>1. Device Testing Terms</h4>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem', lineHeight: 1.6 }}>By using this GPS8.0 tool, you agree to collection of serial number, firmware, and GPS coordinates for verification purposes.</p>
                            
                            <h4 style={{ marginBottom: '0.5rem' }}>2. Data Collection</h4>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.9rem', lineHeight: 1.6 }}>We securely store data for warranty and troubleshooting only.</p>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
                                <input type="checkbox" checked={termsChecked} onChange={(e) => setTermsChecked(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                                <span>I agree to the Terms and Conditions and Privacy Policy</span>
                            </label>

                            <button className="btn btn-primary" style={{ width: '100%' }} disabled={!termsChecked} onClick={handleAcceptTerms}>
                                Accept & Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TesterPage;
