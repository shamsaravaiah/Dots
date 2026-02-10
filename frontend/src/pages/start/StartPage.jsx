import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import Sidebar from '../../components/layout/Sidebar/Sidebar';
import DotGrid from '../../components/common/DotGrid/DotGrid';
import { canvasAPI } from '../../services/canvasAPI';
import { authAPI } from '../../services/api';
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
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Track sidebar state for page padding
  const [inputValue, setInputValue] = useState('');
  const [isCreatingCanvas, setIsCreatingCanvas] = useState(false);
  const [user, setUser] = useState(null); // User authentication state
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % prompts.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      const token = authAPI.getToken();
      if (!token) {
        setUser(null);
        return;
      }
      try {
        const userData = await authAPI.getMe();
        setUser(userData);
      } catch (error) {
        setUser(null);
      }
    };
    checkAuth();
  }, []);

  // Track sidebar state for page padding
  useEffect(() => {
    const handleSidebarToggle = () => {
      const sidebar = document.querySelector('.side-menu');
      if (sidebar) {
        setIsMenuOpen(sidebar.classList.contains('active'));
      }
    };
    
    // Use MutationObserver to watch for sidebar class changes
    const observer = new MutationObserver(handleSidebarToggle);
    const sidebar = document.querySelector('.side-menu');
    if (sidebar) {
      observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
      handleSidebarToggle(); // Initial check
    }
    
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`startpage-root ${isMenuOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
      <div className="top-right-actions">
        {user ? (
          <Link to="/pricing" className="action-btn">
            Upgrade
          </Link>
        ) : (
          <>
            <Link to="/signin" className="action-btn action-primary">
              Sign in
            </Link>
            <Link to="/pricing" className="action-btn">Pricing</Link>
          </>
        )}
      </div>
      <Sidebar 
        onCanvasSelect={(canvas) => {
          navigate('/flow', { state: { canvasId: canvas.id } });
        }}
        onCreateCanvas={() => {
          // Just navigate to start page - no canvas created yet
          // Canvas will be created when user asks a question
          navigate('/start', { replace: true });
        }}
        currentCanvasId={location.state?.canvasId}
      />

      {/* Main content */}
      <div className="startpage-content-wrapper">
        <div className="startpage-particles-container">
          <DotGrid
            dotSize={4}
            gap={10}
            baseColor="#000000"  // Fix: Remove one # (was ##000000)
            activeColor="#4f86f7"  // Change to your desired color
            proximity={120}
            shockRadius={250}
            shockStrength={5}
            resistance={750}
            returnDuration={1.5}
          />
        </div>
        <div className="startpage-content">
          <img src="/logo_blue.svg" alt="Logo" className="startpage-logo" />
          <h2 className="startpage-heading">Start Connecting Your Dots</h2>
          <input
            type="text"
            className="startpage-input"
            placeholder={isCreatingCanvas ? 'Creating canvas...' : prompts[placeholderIdx]}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isCreatingCanvas}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') {
                const prompt = inputValue.trim() || prompts[placeholderIdx];
                
                // Always create a new canvas with the question as the title
                // Canvas is only created in database when a question is asked
                setIsCreatingCanvas(true);
                try {
                  const canvas = await canvasAPI.createCanvas({
                    title: prompt,  // Use the question directly as the title
                    description: '',
                    status: 'active',
                    node_count: 0,
                  });
                  
                  // Dispatch event to refresh sidebar
                  window.dispatchEvent(new CustomEvent('canvasCreated', { 
                    detail: { canvasId: canvas.id } 
                  }));
                  
                  navigate('/flow', { state: { prompt, canvasId: canvas.id } });
                } catch (error) {
                  console.error('Failed to create canvas:', error);
                  
                  // Extract error message from response
                  let errorMessage = 'Failed to create canvas. Please try again.';
                  
                  if (error.response?.data) {
                    // Handle structured error responses
                    const errorData = error.response.data;
                    if (errorData.detail) {
                      if (typeof errorData.detail === 'string') {
                        errorMessage = errorData.detail;
                      } else if (errorData.detail.message) {
                        errorMessage = errorData.detail.message;
                        
                        // Handle upgrade-required errors
                        if (errorData.detail.upgrade_required) {
                          if (confirm(errorMessage + '\n\nWould you like to upgrade?')) {
                            navigate('/pricing');
                          }
                          return;
                        }
                      }
                    }
                  } else if (error.message) {
                    errorMessage = error.message;
                  }
                  
                  alert(errorMessage);
                } finally {
                  setIsCreatingCanvas(false);
                }
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

