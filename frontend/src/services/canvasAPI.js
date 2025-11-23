/** Canvas API service for backend communication. */

import { apiRequest } from './api';

/**
 * Canvas API methods.
 */
export const canvasAPI = {
  /**
   * Create a new canvas.
   * @param {object} canvas - CanvasPayload object
   * @returns {Promise<object>}
   */
  async createCanvas(canvas) {
    return apiRequest('/canvas', {
      method: 'POST',
      body: JSON.stringify(canvas),
    });
  },

  /**
   * Get a canvas by ID.
   * @param {string} canvasId
   * @returns {Promise<object>}
   */
  async getCanvas(canvasId) {
    return apiRequest(`/canvas/${canvasId}`);
  },

  /**
   * Save a canvas (full update).
   * @param {string} canvasId
   * @param {object} canvas - CanvasPayload object
   * @returns {Promise<object>}
   */
  async saveCanvas(canvasId, canvas) {
    return apiRequest(`/canvas/${canvasId}`, {
      method: 'PUT',
      body: JSON.stringify({ ...canvas, id: canvasId }),
    });
  },

  /**
   * Patch a canvas (autosave - only changed fields).
   * @param {string} canvasId
   * @param {object} patch - CanvasPatch object
   * @returns {Promise<object>}
   */
  async patchCanvas(canvasId, patch) {
    return apiRequest(`/canvas/${canvasId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...patch, id: canvasId }),
    });
  },

  /**
   * Get all canvases for the current user.
   * @returns {Promise<Array<object>>}
   */
  async getUserCanvases() {
    return apiRequest('/user/canvases');
  },
};

