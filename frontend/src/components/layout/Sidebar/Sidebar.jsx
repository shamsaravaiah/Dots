import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../../../services/api';
import { canvasAPI } from '../../../services/canvasAPI';
import './Sidebar.css';

export default function Sidebar({ 
  onCanvasSelect, // Optional callback when canvas is selected
  onCreateCanvas, // Optional callback for create canvas action
  currentCanvasId // Optional current canvas ID for highlighting
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userCanvases, setUserCanvases] = useState([]);
  const [loadingCanvases, setLoadingCanvases] = useState(false);
  const navigate = useNavigate();

  // Check authentication
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
        const userData = await authAPI.getMe();
        console.log('User authenticated:', userData);
        setIsAuthenticated(true);
        setUser(userData);
        setAvatarError(false);
        authAPI.saveAuth(token, userData);
      } catch (error) {
        console.error('Authentication check failed:', error);
        authAPI.signout();
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuthentication();
  }, []);

  // Fetch user canvases when menu is open (for both authenticated and anonymous users)
  useEffect(() => {
    const fetchUserCanvases = async () => {
      if (!isMenuOpen) {
        return;
      }
      
      setLoadingCanvases(true);
      try {
        const canvases = await canvasAPI.getUserCanvases();
        console.log('Fetched user canvases:', canvases);
        setUserCanvases(canvases || []);
      } catch (error) {
        console.error('Failed to fetch user canvases:', error);
        console.error('Error details:', error.response || error.message);
        setUserCanvases([]);
      } finally {
        setLoadingCanvases(false);
      }
    };

    fetchUserCanvases();
  }, [isMenuOpen]);

  // Listen for canvas creation events to refresh the list
  useEffect(() => {
    const handleCanvasCreated = () => {
      // Refresh canvases if menu is open (for both authenticated and anonymous users)
      if (isMenuOpen) {
        const refreshCanvases = async () => {
          setLoadingCanvases(true);
          try {
            const canvases = await canvasAPI.getUserCanvases();
            console.log('Refreshed user canvases after creation:', canvases);
            setUserCanvases(canvases || []);
          } catch (error) {
            console.error('Failed to refresh user canvases:', error);
            console.error('Error details:', error.response || error.message);
          } finally {
            setLoadingCanvases(false);
          }
        };
        refreshCanvases();
      }
    };

    // Listen for custom event
    window.addEventListener('canvasCreated', handleCanvasCreated);
    
    return () => {
      window.removeEventListener('canvasCreated', handleCanvasCreated);
    };
  }, [isMenuOpen]);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    setShowUserMenu(false);

    try {
      await authAPI.logout();
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Logout error:', error);
      authAPI.signout();
    } finally {
      setIsAuthenticated(false);
      setUser(null);
      setIsLoggingOut(false);
    }
  };

  const handleMenuOption = (option) => {
    setShowUserMenu(false);
    switch (option) {
      case 'email':
        alert(`Email: ${user?.email || 'Not available'}`);
        break;
      case 'upgrade':
        navigate('/pricing');
        break;
      case 'settings':
        console.log('Settings clicked');
        break;
      case 'help':
        console.log('Help clicked');
        break;
      case 'community':
        console.log('Community clicked');
        break;
      case 'logout':
        handleSignOut();
        break;
      default:
        break;
    }
  };

  const handleCreateCanvas = () => {
    // Don't create canvas in database - just navigate to start page
    // Canvas will only be created when user asks a question
    if (onCreateCanvas) {
      // If callback is provided, call it (no canvas yet)
      onCreateCanvas();
    } else {
      // Default behavior: navigate to start page
      navigate('/start', { replace: true });
    }
  };

  const handleCanvasClick = (canvas) => {
    if (onCanvasSelect) {
      onCanvasSelect(canvas);
    } else {
      // Default behavior: navigate to flow page
      navigate('/flow', { state: { canvasId: canvas.id } });
    }
  };

  return (
    <aside className={`side-menu ${isMenuOpen ? 'active' : ''}`}>
      {/* Logo - always visible on the left */}
      <button
        className="side-menu-toggle"
        onClick={() => {
          setIsMenuOpen(!isMenuOpen);
          setShowUserMenu(false);
        }}
        aria-label={isMenuOpen ? "Collapse menu" : "Expand menu"}
      >
        <img 
          src="/logo_blue.svg" 
          alt="Dots Logo" 
          className="side-menu-toggle-logo"
        />
      </button>

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

      {/* Sidebar icons */}
      <div className="side-menu-icons">
        <button
          className="side-menu-icon"
          title={isMenuOpen ? "" : "Create new graph"}
          onClick={handleCreateCanvas}
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
        
        {/* Your Dots section - only visible when sidebar is open */}
        {isMenuOpen && (
          <>
            <div className="side-menu-canvases-heading-wrapper">
              <h3 className="side-menu-canvases-heading">Your Dots</h3>
            </div>
            {loadingCanvases ? (
              <div className="side-menu-canvases-loading">Loading...</div>
            ) : userCanvases.length > 0 ? (
              <ul className="side-menu-canvases-list">
                {userCanvases.map((canvas) => (
                  <li key={canvas.id} className="side-menu-canvas-item">
                    <button
                      className={`side-menu-canvas-button ${
                        currentCanvasId === canvas.id ? 'active' : ''
                      }`}
                      onClick={() => handleCanvasClick(canvas)}
                    >
                      {canvas.title || canvas.id}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="side-menu-canvases-empty">
                No canvases yet
              </div>
            )}
          </>
        )}
      </div>

      {/* User menu bubble - only clickable when sidebar is open */}
      {isAuthenticated && user && (
        <div className={`user-menu-bubble ${isMenuOpen ? 'expanded' : ''}`}>
          <button
            className="user-menu-bubble-trigger"
            onClick={() => {
              // Allow opening menu whether sidebar is open or closed
              setShowUserMenu(!showUserMenu);
            }}
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
            
          {/* User menu popup - rendered via portal to escape sidebar overflow */}
          {showUserMenu && createPortal(
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
            </>,
            document.body
          )}
        </div>
      )}
    </aside>
  );
}

