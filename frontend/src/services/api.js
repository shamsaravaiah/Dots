/** API service for backend communication. */

const API_BASE_URL = 'https://dots-backend-v4wb.onrender.com/api';

/**
 * Make an API request.
 * @param {string} endpoint - API endpoint (without /api prefix)
 * @param {object} options - Fetch options
 * @returns {Promise<Response>}
 */
export async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add auth token if available
  const token = localStorage.getItem('auth_token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: response.statusText }));
      
      // Handle structured error responses with upgrade information
      const errorObj = new Error(
        error.message || error.detail || `HTTP error! status: ${response.status}`
      );
      errorObj.response = { data: error, status: response.status };
      
      // Add upgrade information if present
      if (error.upgrade_required) {
        errorObj.upgrade_required = true;
        errorObj.upgrade_url = error.upgrade_url || '/pricing';
        errorObj.limit_type = error.limit_type;
        errorObj.current_usage = error.current_usage;
        errorObj.limit = error.limit;
      }
      
      throw errorObj;
    }

    return response.json();
  } catch (err) {
    // If it's already our error object, re-throw it
    if (err.response) {
      throw err;
    }
    // Network error or other fetch errors
    const networkError = new Error(
      'Network error. Please check your connection.'
    );
    networkError.isNetworkError = true;
    throw networkError;
  }
}

/**
 * Authentication API methods.
 */
export const authAPI = {
  /**
   * Sign up with email and password.
   * @param {string} email
   * @param {string} password
   * @param {string} name - Optional name
   * @returns {Promise<object>}
   */
  async signup(email, password, name = null) {
    return apiRequest('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  },

  /**
   * Login with email and password.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<object>}
   */
  async login(email, password) {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  /**
   * Get current user info.
   * @returns {Promise<object>}
   */
  async getMe() {
    return apiRequest('/auth/me');
  },

  /**
   * Logout - calls backend and clears local storage.
   * @returns {Promise<void>}
   */
  async logout() {
    try {
      // Call backend logout endpoint
      await apiRequest('/auth/logout', {
        method: 'POST',
      });
    } catch (error) {
      // Even if backend call fails, continue with client-side logout
      console.error('Logout API call failed:', error);
    }
    // Clear local storage
    this.signout();
  },

  /**
   * Sign out (client-side only - removes token).
   */
  signout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
  },

  /**
   * Save auth token and user data.
   * @param {string} token
   * @param {object} user
   */
  saveAuth(token, user) {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },

  /**
   * Get stored auth token.
   * @returns {string|null}
   */
  getToken() {
    return localStorage.getItem('auth_token');
  },

  /**
   * Get stored user data.
   * @returns {object|null}
   */
  getUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },
};

/**
 * Get OAuth URL for provider.
 * @param {string} provider - 'google' or 'github'
 * @returns {string}
 */
export function getOAuthUrl(provider) {
  return `${API_BASE_URL}/auth/${provider}`;
}

