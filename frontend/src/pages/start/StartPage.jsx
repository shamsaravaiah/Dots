import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../../services/api';
import Particles from '../../components/common/Particles/Particles';
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
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Sidebar collapsed by default
  const [inputValue, setInputValue] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % prompts.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Verify JWT token with backend
  useEffect(() => {
    const checkAuthentication = async () => {
      const token = authAPI.getToken();
      
      if (!token) {
        setIsAuthenticated(false);
        setUser(null);
        setIsCheckingAuth(false);
        return;
      }

      try {
        // Verify token with backend
        const userData = await authAPI.getMe();
        setIsAuthenticated(true);
        setUser(userData);
        setAvatarError(false); // Reset avatar error on new user
        // Update localStorage with fresh user data
        authAPI.saveAuth(token, userData);
      } catch (error) {
        // Token is invalid or expired
        authAPI.signout();
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuthentication();
  }, []);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    setShowUserMenu(false);

    try {
      // Call backend logout with delay for better UX
      await authAPI.logout();
      // Intentional delay to make logout feel more secure and intentional
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Logout error:', error);
      // Even if there's an error, clear local storage
      authAPI.signout();
    } finally {
      // Clear state regardless of backend call result
      setIsAuthenticated(false);
      setUser(null);
      setIsLoggingOut(false);
    }
  };

  const handleMenuOption = (option) => {
    setShowUserMenu(false);
    switch (option) {
      case 'email':
        // Display email - could show in a toast or modal
        alert(`Email: ${user?.email || 'Not available'}`);
        break;
      case 'upgrade':
        navigate('/pricing');
        break;
      case 'settings':
        // Navigate to settings page (if exists)
        console.log('Settings clicked');
        break;
      case 'help':
        // Navigate to help page (if exists)
        console.log('Help clicked');
        break;
      case 'community':
        // Navigate to community page (if exists)
        console.log('Community clicked');
        break;
      case 'logout':
        handleSignOut();
        break;
      default:
        break;
    }
  };

  return (
    <div className={`startpage-root ${isMenuOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
      <div className="top-right-actions">
        {isAuthenticated ? (
          <Link to="/pricing" className="action-btn">Upgrade</Link>
        ) : (
          <Link to="/pricing" className="action-btn">Pricing</Link>
        )}
        {!isCheckingAuth && !isAuthenticated && (
          <Link to="/signin" className="action-btn action-primary">
            Sign in
          </Link>
        )}
      </div>
      {/* Sidebar - always visible */}
      <aside className={`side-menu ${isMenuOpen ? 'active' : ''}`}>
        {/* Close button - only visible when expanded, top right */}
        {isMenuOpen && (
          <button
            className="side-menu-close"
            onClick={() => {
              setIsMenuOpen(false);
              setShowUserMenu(false);
            }}
            aria-label="Close menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Toggle button - only visible when collapsed */}
        {!isMenuOpen && (
          <button
            className="side-menu-toggle"
            onClick={() => {
              setIsMenuOpen(true);
              setShowUserMenu(false);
            }}
            aria-label="Expand menu"
          >
            <img 
              src="/logo_blue.svg" 
              alt="Dots Logo" 
              className="side-menu-toggle-logo"
            />
          </button>
        )}

        {/* Sidebar icons */}
        <div className="side-menu-icons">
          <button
            className="side-menu-icon"
            title={isMenuOpen ? "" : "Create new graph"}
            onClick={() => console.log('Edit clicked')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            {isMenuOpen && (
              <span className="side-menu-icon-label">Create new graph</span>
            )}
          </button>
          <button
            className="side-menu-icon"
            title={isMenuOpen ? "" : "Search Dots"}
            onClick={() => console.log('Search clicked')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            {isMenuOpen && (
              <span className="side-menu-icon-label">Search Dots</span>
            )}
          </button>
          <button
            className="side-menu-icon"
            title={isMenuOpen ? "" : "Images"}
            onClick={() => console.log('Images clicked')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            {isMenuOpen && (
              <span className="side-menu-icon-label">Images</span>
            )}
          </button>
        </div>

        {/* User menu bubble - only clickable when sidebar is open */}
        {isAuthenticated && user && (
        <div className={`user-menu-bubble ${isMenuOpen ? 'expanded' : ''}`}>
          <button
            className="user-menu-bubble-trigger"
            onClick={() => {
              if (isMenuOpen) {
                setShowUserMenu(!showUserMenu);
              }
            }}
            disabled={!isMenuOpen}
          >
            <div className="user-menu-bubble-avatar">
              {!avatarError && user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name || user.email}
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <div className="user-menu-bubble-avatar-fallback">
                  {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            {isMenuOpen && (
              <span className="user-menu-bubble-name">
                {user.name || user.email}
              </span>
            )}
          </button>
            
          {/* User menu popup */}
          {showUserMenu && (
            <>
              <div
                className="user-menu-overlay"
                onClick={() => setShowUserMenu(false)}
              />
              <div className="user-menu-popup">
                <div className="user-menu-header">
                  <div className="user-menu-avatar-large">
                    {!avatarError && user.picture ? (
                      <img
                        src={user.picture}
                        alt={user.name || user.email}
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <div className="user-menu-avatar-fallback">
                        {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="user-menu-info">
                    <div className="user-menu-name">{user.name || 'User'}</div>
                    <div className="user-menu-email">{user.email}</div>
                  </div>
                </div>
                <div className="user-menu-divider" />
                <div className="user-menu-options">
                  <button
                    className="user-menu-option"
                    onClick={() => handleMenuOption('email')}
                  >
                    Display email
                  </button>
                  <button
                    className="user-menu-option"
                    onClick={() => handleMenuOption('upgrade')}
                  >
                    Upgrade plan
                  </button>
                  <button
                    className="user-menu-option"
                    onClick={() => handleMenuOption('settings')}
                  >
                    Settings
                  </button>
                  <button
                    className="user-menu-option"
                    onClick={() => handleMenuOption('help')}
                  >
                    Help
                  </button>
                  <button
                    className="user-menu-option"
                    onClick={() => handleMenuOption('community')}
                  >
                    Community
                  </button>
                    <div className="user-menu-divider" />
                    <button
                      className="user-menu-option user-menu-option--danger"
                      onClick={() => handleMenuOption('logout')}
                      disabled={isLoggingOut}
                    >
                      {isLoggingOut ? 'Logging out...' : 'Log out'}
                    </button>
                </div>
              </div>
            </>
          )}
        </div>
        )}
      </aside>

      {/* Main content */}
      <div className="startpage-content-wrapper">
        <div className="startpage-particles-container">
          <Particles
            particleColors={['#ffffff', '#ffffff']}
            particleCount={800}
            particleSpread={10}
            speed={0.1}
            particleBaseSize={100}
            moveParticlesOnHover={true}
            alphaParticles={false}
            disableRotation={false}
          />
        </div>
        <div className="startpage-content">
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
      </div>
    </div>
  );
}

