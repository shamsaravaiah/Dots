import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './StartPage.css';

const prompts = [
  'Explain the theory of relativity.',
  'Who discovered penicillin?',
  'How do black holes form?',
  'What causes earthquakes?',
  'Summarize the French Revolution.'
];

export default function StartPage() {
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % prompts.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="startpage-root">
      <div className="top-right-actions">
        <a href="/pricing" className="action-btn">Pricing</a>
        <a href="/signin" className="action-btn action-primary">Sign in</a>
      </div>
      {/* Burger icon (top-left) — hides when sidebar is open */}
      {!isMenuOpen && (
        <button
          type="button"
          className="burger"
          aria-label="Open menu"
          onClick={() => setIsMenuOpen(true)}
        >
          <span></span><span></span><span></span>
        </button>
      )}

      {/* Overlay */}
      <div
        className={`menu-overlay ${isMenuOpen ? 'show' : ''}`}
        onClick={() => setIsMenuOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`side-menu ${isMenuOpen ? 'active' : ''}`}>
        <button
          className="close-btn"
          onClick={() => setIsMenuOpen(false)}
          aria-label="Close menu"
        >
          <span></span><span></span>
        </button>
        <h3 className="side-menu-title">History</h3>
      </aside>

      {/* Main content */}
      <img src="/logo_blue.svg" alt="Logo" className="startpage-logo" />
      <h2 className="startpage-heading">Start Connecting Your Dots</h2>
      <input
        type="text"
        className="startpage-input"
        placeholder={prompts[placeholderIdx]}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const prompt = inputValue.trim() || prompts[placeholderIdx];
            navigate('/flow', { state: { prompt } });
          }
        }}
      />
    </div>
  );
}

