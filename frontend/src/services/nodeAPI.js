/** Node API service for backend communication. */

import { apiRequest } from './api';

const API_BASE_URL = 'https://dots-backend-v4wb.onrender.com/api';

/**
 * Node API methods.
 */
export const nodeAPI = {
  /**
   * Create a new node.
   * @param {object} node - NodePayload object
   * @returns {Promise<object>}
   */
  async createNode(node) {
    return apiRequest('/node', {
      method: 'POST',
      body: JSON.stringify(node),
    });
  },

  /**
   * Get a single node by ID.
   * @param {string} nodeId
   * @returns {Promise<object>}
   */
  async getNode(nodeId) {
    return apiRequest(`/node/${nodeId}`);
  },

  /**
   * Get all nodes for a canvas.
   * @param {string} canvasId
   * @returns {Promise<Array>}
   */
  async getCanvasNodes(canvasId) {
    return apiRequest(`/canvas/${canvasId}/nodes`);
  },

  /**
   * Get children of a parent node.
   * @param {string} canvasId
   * @param {string} parentId
   * @returns {Promise<Array>}
   */
  async getNodeChildren(canvasId, parentId) {
    return apiRequest(`/canvas/${canvasId}/node/${parentId}/children`);
  },

  /**
   * Patch a node (autosave - only changed fields).
   * @param {string} nodeId
   * @param {object} patch - NodePatch object
   * @returns {Promise<object>}
   */
  async patchNode(nodeId, patch) {
    return apiRequest(`/node/${nodeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...patch, id: nodeId }),
    });
  },

  /**
   * Update a node (full update).
   * @param {string} nodeId
   * @param {object} node - NodePayload object
   * @returns {Promise<object>}
   */
  async updateNode(nodeId, node) {
    return apiRequest(`/node/${nodeId}`, {
      method: 'PUT',
      body: JSON.stringify({ ...node, id: nodeId }),
    });
  },

  /**
   * Delete a node (soft delete).
   * @param {string} nodeId
   * @returns {Promise<object>}
   */
  async deleteNode(nodeId) {
    return apiRequest(`/node/${nodeId}`, {
      method: 'DELETE',
    });
  },
};

