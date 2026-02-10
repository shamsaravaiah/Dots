import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import { authAPI, getOAuthUrl } from '../../services/api';
import './AuthPage.css';

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState({
    email: '',
    password: '',
    name: '',
    general: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Handle OAuth callback
  useEffect(() => {
    const token = searchParams.get('token');
    const userParam = searchParams.get('user');
    
    if (token && userParam) {
      try {
        const user = JSON.parse(decodeURIComponent(userParam));
        authAPI.saveAuth(token, user);
        // Clean URL
        navigate('/start', { replace: true });
      } catch (err) {
        setErrors({
          email: '',
          password: '',
          name: '',
          general: 'Failed to process OAuth callback',
        });
      }
    }
  }, [searchParams, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({ email: '', password: '', name: '', general: '' });
    setLoading(true);

    // Basic validation
    if (!email.trim()) {
      setErrors((prev) => ({
        ...prev,
        email: 'Email is required',
      }));
      setLoading(false);
      return;
    }

    if (!password) {
      setErrors((prev) => ({
        ...prev,
        password: 'Password is required',
      }));
      setLoading(false);
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setErrors((prev) => ({
        ...prev,
        email: 'Please enter a valid email address',
      }));
      setLoading(false);
      return;
    }

    try {
      let result;
      if (isSignUp) {
        result = await authAPI.signup(email, password, name || null);
      } else {
        result = await authAPI.login(email, password);
      }

      // Save auth data
      authAPI.saveAuth(result.access_token, result.user);

      // Redirect to start page
      navigate('/start');
    } catch (err) {
      // Parse error response
      let errorMessage = 'An error occurred';
      if (err.message) {
        errorMessage = err.message;
      } else if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      }

      // Set appropriate error field based on error message
      const lowerMessage = errorMessage.toLowerCase();
      if (lowerMessage.includes('email') || lowerMessage.includes('user')) {
        setErrors((prev) => ({
          ...prev,
          email: errorMessage,
        }));
      } else if (lowerMessage.includes('password')) {
        setErrors((prev) => ({
          ...prev,
          password: errorMessage,
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          general: errorMessage,
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider) => {
    // Redirect to OAuth provider
    window.location.href = getOAuthUrl(provider);
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <img src="/logo_blue.svg" alt="Dots" className="auth-logo" />
        <h1 className="auth-title">
          {isSignUp ? 'Create Account' : 'Welcome Back'}
        </h1>
        <p className="auth-subtitle">
          {isSignUp
            ? 'Sign up to start connecting your dots'
            : 'Sign in to continue'}
        </p>

        {errors.general && (
          <div className="auth-error">{errors.general}</div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {isSignUp && (
            <Input
              type="text"
              value={name}
              onChange={setName}
              placeholder="Name (optional)"
              className="auth-input"
            />
          )}
          <div>
            <Input
              type="email"
              value={email}
              onChange={(value) => {
                setEmail(value);
                if (errors.email) {
                  setErrors((prev) => ({ ...prev, email: '' }));
                }
              }}
              placeholder="Email"
              className="auth-input"
              required
            />
            {errors.email && (
              <div className="auth-field-error">{errors.email}</div>
            )}
          </div>
          <div className="auth-password-wrapper">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(value) => {
                setPassword(value);
                if (errors.password) {
                  setErrors((prev) => ({ ...prev, password: '' }));
                }
              }}
              placeholder="Password"
              className="auth-input"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="auth-password-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
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
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
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
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
            {errors.password && (
              <div className="auth-field-error">{errors.password}</div>
            )}
          </div>
          <Button
            type="submit"
            variant="primary"
            className="auth-submit-button"
            disabled={loading}
          >
            {loading
              ? 'Loading...'
              : isSignUp
              ? 'Sign Up'
              : 'Sign In'}
          </Button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <div className="auth-oauth">
          <Button
            onClick={() => handleOAuth('google')}
            variant="secondary"
            className="auth-oauth-button"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.845H13.8436C13.635 11.97 13.0009 12.9232 12.0477 13.5614V15.8195H15.9564C17.1882 14.6882 17.64 13.0864 17.64 9.20454Z"
                fill="#4285F4"
              />
              <path
                d="M9 18C11.43 18 13.467 17.1941 14.9564 15.8195L12.0477 13.5614C11.2418 14.1014 10.2109 14.4204 9 14.4204C6.65454 14.4204 4.67182 12.8373 3.96409 10.71H0.957275V13.0418C2.43818 15.9832 5.48182 18 9 18Z"
                fill="#34A853"
              />
              <path
                d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z"
                fill="#FBBC05"
              />
              <path
                d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01636 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65454 3.57955 9 3.57955Z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>
          <Button
            onClick={() => handleOAuth('github')}
            variant="secondary"
            className="auth-oauth-button"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            Continue with GitHub
          </Button>
        </div>

        <div className="auth-toggle">
          <span>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          </span>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrors({ email: '', password: '', name: '', general: '' });
            }}
            className="auth-toggle-link"
          >
            {isSignUp ? 'Log in' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
}


