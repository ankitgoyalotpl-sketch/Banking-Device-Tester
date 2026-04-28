import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { Home, Compass, FileText, Search, User, Info, Crosshair, Download, Sun, Moon } from 'lucide-react';
import HomePage from './pages/Home';
import TesterPage from './pages/Tester';
import ComplaintPage from './pages/Complaint';
import StatusPage from './pages/Status';
import AdminPage from './pages/Admin';
import React, { useState, useEffect } from 'react';

const SmartLogo = ({ src }) => {
  const [imageSrc, setImageSrc] = useState('');

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      // Crop the bottom 22% of the image to perfectly shave off the "OXYMORA" text
      canvas.height = img.height * 0.78; 
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        const intensity = (r + g + b) / 3;
        // Make bright white pixels transparent (soft threshold)
        if (intensity > 240) {
            data[i+3] = 0;
        } else if (intensity > 210) {
            data[i+3] = 255 - ((intensity - 210) * 5.6);
        }
      }
      ctx.putImageData(imageData, 0, 0);
      setImageSrc(canvas.toDataURL());
    };
    img.onerror = () => setImageSrc('');
    img.src = src;
  }, [src]);

  if (!imageSrc) {
     return <Crosshair color="var(--primary)" size={32} />;
  }

  // Enlarged the logo to 72px for a bolder look
  return <img src={imageSrc} style={{ height: '72px', width: 'auto', objectFit: 'contain' }} alt="Oxymora Logo" />;
};

function App() {
  const location = useLocation();
  const [showContact, setShowContact] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <>
      <header style={{
        background: 'var(--bg-panel)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-subtle)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '1rem 0',
        transition: 'background-color 0.3s ease'
      }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none' }}>
            <SmartLogo src="/logo.png" />
          </Link>
          
          <nav style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            {[
              { path: '/', label: 'Home', icon: Home },
              { path: '/complaint', label: 'Create Complaint', icon: FileText },
              { path: '/status', label: 'Check Status', icon: Search },
            ].map(link => {
              const Icon = link.icon;
              const isActive = location.pathname === link.path || (link.path === '/tester' && location.pathname.startsWith('/tester'));
              return (
                <Link 
                  key={link.path} 
                  to={link.path}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem', 
                    textDecoration: 'none',
                    color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: isActive ? 700 : 600,
                    transition: 'color 0.2s',
                    fontSize: '0.9rem'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.color = 'var(--text-light)'}
                  onMouseOut={(e) => e.currentTarget.style.color = isActive ? 'var(--primary)' : 'var(--text-muted)'}
                >
                  <Icon size={18} />
                  {link.label}
                </Link>
              )
            })}
            
            <a 
              href="/Driver-for-USB-GPS-8.0.zip" 
              download="Driver-for-USB-GPS-8.0.zip" 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--text-muted)',
                fontWeight: 600,
                textDecoration: 'none',
                fontSize: '0.9rem',
                transition: 'color 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.color = 'var(--text-light)'}
              onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <Download size={18} />
              Driver Download
            </a>

            <button 
              onClick={() => setShowContact(true)}
              style={{
                background: 'transparent',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--text-muted)',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.9rem',
                transition: 'color 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.color = 'var(--text-light)'}
              onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <Info size={18} />
              Contact
            </button>

            <div style={{ width: '1px', height: '24px', background: 'var(--border-strong)', margin: '0 0.5rem' }}></div>

            <button 
              onClick={toggleTheme}
              style={{
                background: 'transparent',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.4rem',
                borderRadius: '50%',
                transition: 'color 0.2s, background-color 0.2s',
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = 'var(--text-light)'; e.currentTarget.style.backgroundColor = 'var(--border-subtle)'; }}
              onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </nav>
        </div>
      </header>

      <main style={{ flex: 1, padding: '3rem 0' }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tester/:bank?" element={<TesterPage />} />
          <Route path="/complaint" element={<ComplaintPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>

      <footer style={{
        marginTop: 'auto',
        borderTop: '1px solid var(--border-subtle)',
        padding: '2rem 0',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.875rem'
      }}>
        <div className="container">
          <p>© 2026 Oxymora Technology. All rights reserved.</p>
        </div>
      </footer>

      {/* Contact Modal */}
      {showContact && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div className="glass-panel" style={{ width: '400px', maxWidth: '90%', animation: 'pulse 0.3s' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}><User size={20} color="var(--primary)"/> Contact Information</h3>
              <button 
                onClick={() => setShowContact(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-light)', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
              >&times;</button>
            </div>
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Phone</p>
                <p>+91-9024146923</p>
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Email</p>
                <p>goyalankit9646@gmail.com</p>
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Business Hours</p>
                <p>Mon - Sat: 10:00 AM - 6:00 PM</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default App;
