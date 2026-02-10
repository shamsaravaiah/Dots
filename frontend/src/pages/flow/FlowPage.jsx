import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import ReactMarkdown from 'react-markdown';
import Button from "../../components/common/Button/Button";
import Sidebar from "../../components/layout/Sidebar/Sidebar";
import { authAPI } from "../../services/api";
import { nodeAPI } from "../../services/nodeAPI";
import { canvasAPI } from "../../services/canvasAPI";
import { useAutosave } from "../../hooks/useAutosave";
import {
  reactFlowNodeToNodePayload,
  nodePayloadToReactFlowNode,
  createNodePatch,
} from "../../utils/nodeConverter";
import "./FlowPage.css";

const BLUE = "#4F86F7";
const API_URL = "http://localhost:8000/api/ask";
const VERTICAL_SPACING = 150;
const COLUMN_X_THRESHOLD = 140;
const RELAXED_VERTICAL_STEP = 60;
const NODE_HEIGHT_COLLAPSED = 90;
const NODE_HEIGHT_EXPANDED = 240;
const NODE_VERTICAL_GAP = 40;

// Module-level Set to track initialized prompts (persists across React Strict Mode unmounts/remounts)
// This prevents duplicate node creation when Strict Mode runs effects twice
const initializedPrompts = new Set();

// Custom node renderer supporting: loading, answer, and suggestion states
function QaNode({ data, id }) {
  const { question, answer, state, onAskFollowUp, images } = data;
  
  // Handle mouse down to allow text selection without interfering with node dragging
  const handleMouseDown = (e) => {
    // Only interfere if user is actively selecting text (has a selection)
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      // User is selecting text - don't let ReactFlow interfere
      e.stopPropagation();
    }
    // Otherwise, let ReactFlow handle the event normally for dragging
  };
  
  return (
    <div 
      style={{
        border: `1px solid ${BLUE}`,
        background: state === 'suggestion' ? '#2a2a2a' : '#141414',
        color: BLUE,
        borderRadius: 16,
        padding: 12,
        minWidth: 220,
        maxWidth: 320,
        boxShadow: '0 14px 40px rgba(0,0,0,0.35)',
        userSelect: 'text',
        WebkitUserSelect: 'text',
        MozUserSelect: 'text',
        msUserSelect: 'text'
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Hidden handle on the right (source - for outgoing edges) */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ opacity: 0, pointerEvents: "none" }}
      />
      {/* Hidden handle on the left (target - for incoming edges) */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ opacity: 0, pointerEvents: "none" }}
      />
      
      <div style={{ 
        fontWeight: 700, 
        marginBottom: 8, 
        color: BLUE,
        userSelect: 'text',
        WebkitUserSelect: 'text',
        MozUserSelect: 'text',
        msUserSelect: 'text'
      }}>
        {question}
      </div>
      {state === 'loading' && (
        <div style={{ marginTop: 8, width: '100%' }}>
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line" style={{ width: '70%' }} />
        </div>
      )}
      {state === 'answer' && (
        <>
          <div className="qa-node-answer" style={{ 
            lineHeight: 1.5, 
            marginBottom: 12,
            animation: 'fadeIn 0.3s ease-in',
            width: '100%'
          }}>
            <ReactMarkdown
              components={{
                p: ({node, ...props}) => <p style={{userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text'}} {...props} />,
                h1: ({node, ...props}) => <h1 style={{fontSize: '1.5em', margin: '12px 0', userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text'}} {...props} />,
                h2: ({node, ...props}) => <h2 style={{fontSize: '1.3em', margin: '10px 0', userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text'}} {...props} />,
                h3: ({node, ...props}) => <h3 style={{fontSize: '1.1em', margin: '8px 0', userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text'}} {...props} />,
                ul: ({node, ...props}) => <ul style={{margin: '8px 0', paddingLeft: '20px', userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text'}} {...props} />,
                ol: ({node, ...props}) => <ol style={{margin: '8px 0', paddingLeft: '20px', userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text'}} {...props} />,
                li: ({node, ...props}) => <li style={{margin: '4px 0', userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text'}} {...props} />,
                strong: ({node, ...props}) => <strong style={{userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text'}} {...props} />,
                em: ({node, ...props}) => <em style={{userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text'}} {...props} />,
                code: ({node, ...props}) => <code style={{background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '3px', userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text'}} {...props} />,
                blockquote: ({node, ...props}) => <blockquote style={{borderLeft: '3px solid rgba(255,255,255,0.3)', paddingLeft: '10px', margin: '8px 0', userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text'}} {...props} />,
              }}
            >
              {answer}
            </ReactMarkdown>
          </div>
          
          {/* Display images if available */}
          {images && images.length > 0 && (
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '12px',
              flexWrap: 'wrap'
            }}>
              {images.map((img, idx) => (
                <img
                  key={idx}
                  src={img.thumbnail || img.url}
                  alt={img.title || 'Educational image'}
                  style={{
                    width: '90px',
                    height: '90px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    border: '1px solid rgba(79, 134, 247, 0.3)',
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    if (img.url) {
                      window.open(img.url, '_blank');
                    }
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              ))}
            </div>
          )}
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onAskFollowUp) onAskFollowUp(id);
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: `1.5px solid ${BLUE}`,
              borderRadius: 8,
              color: BLUE,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(79, 134, 247, 0.1)'}
            onMouseLeave={(e) => e.target.style.background = 'transparent'}
          >
            Ask follow up
          </button>
        </>
      )}
      {state === 'suggestion' && (
        <div style={{ fontSize: 12, opacity: 0.7,color: '#ffffff' }}>Click to ask</div>
      )}
    </div>
  );
}

export default function FlowPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Track sidebar state for page padding
  const [rfInstance, setRfInstance] = useState(null);
  const rfInstanceRef = useRef(null);
  const initializedPromptRef = useRef(null);
  const isInitializingRef = useRef(false); // Track if initialization is in progress to prevent duplicates
  const currentRootNodeIdRef = React.useRef(null); // Track current root node to prevent accidental clearing
  const [user, setUser] = useState(null); // Keep user state for ownerId
  
  // Canvas and node management state
  const [canvasId, setCanvasId] = useState(null);
  const [canvasLoaded, setCanvasLoaded] = useState(false);
  const savedNodeIdsRef = useRef(new Set()); // Track which nodes have been saved
  
  // Refs to store current state for synchronous access
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  
  // Keep refs in sync with state
  React.useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  
  React.useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // Minimal auth check for ownerId (needed for saving nodes)
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

  // Get owner ID
  const ownerId = user?.id || 'anonymous';

  // Canvas should be provided via navigation state - no auto-creation

  // Save node immediately (for creation, LLM responses, etc.)
  const saveNodeImmediate = useCallback(async (rfNode, isNew = false, canvasIdOverride = null) => {
    if (!rfNode) {
      console.warn('Cannot save node: node is null');
      return;
    }
    
    // Use override if provided, otherwise use state
    const currentCanvasId = canvasIdOverride || canvasId;
    
    if (!currentCanvasId) {
      console.error('Cannot save node: canvasId is required', { nodeId: rfNode.id });
      return;
    }
    
    try {
      console.log('Saving node:', { nodeId: rfNode.id, isNew, canvasId: currentCanvasId });
      const nodePayload = reactFlowNodeToNodePayload(rfNode, currentCanvasId, ownerId);
      console.log('Node payload created:', { id: nodePayload.id, canvas_id: nodePayload.canvas_id });
      
      if (isNew || !savedNodeIdsRef.current.has(rfNode.id)) {
        // Create new node
        console.log('Creating new node via API...');
        const result = await nodeAPI.createNode(nodePayload);
        savedNodeIdsRef.current.add(rfNode.id);
        console.log('Node created successfully:', result.id);
      } else {
        // Update existing node
        console.log('Updating existing node via API...');
        const patch = createNodePatch(rfNode, currentCanvasId);
        await nodeAPI.patchNode(rfNode.id, patch);
        console.log('Node updated successfully:', rfNode.id);
      }
    } catch (error) {
      console.error('Failed to save node:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response,
        nodeId: rfNode.id,
        canvasId: currentCanvasId,
      });
    }
  }, [canvasId, ownerId]);

  // Autosave function for node position changes
  const saveNodePosition = useCallback(async (data) => {
    const { nodeId, position, size } = data;
    if (!canvasId || !nodeId || !position) return;
    
    try {
      const patch = {
        id: nodeId,
        canvas_id: canvasId,
        position: { x: position.x, y: position.y },
      };
      if (size) {
        patch.size = { width: size.width, height: size.height };
      }
      await nodeAPI.patchNode(nodeId, patch);
    } catch (error) {
      console.error('Failed to save node position:', error);
    }
  }, [canvasId]);

  // Autosave hook for node positions (debounced)
  const autosaveNodePosition = useAutosave(saveNodePosition, 400, false);

  const getNodeHeight = useCallback(
    (node, { treatAsExpanded = false } = {}) => {
      if (!node) return NODE_HEIGHT_COLLAPSED;

      const state = treatAsExpanded ? "answer" : node.data?.state;
      return state === "answer" ? NODE_HEIGHT_EXPANDED : NODE_HEIGHT_COLLAPSED;
    },
    []
  );

  const getNonOverlappingY = useCallback(
    (targetX, desiredY, nodeHeight, staged = [], enforceSpacing = true) => {
      const allNodes = [...nodesRef.current, ...staged];
      const gap = enforceSpacing ? NODE_VERTICAL_GAP : RELAXED_VERTICAL_STEP;

      const isOccupied = (y) => {
        const candidateTop = y;
        const candidateBottom = y + nodeHeight;

        return allNodes.some((node) => {
          if (Math.abs(node.position.x - targetX) >= COLUMN_X_THRESHOLD) {
            return false;
          }

          const nodeTop = node.position.y;
          const nodeBottom = nodeTop + getNodeHeight(node);

          const separatedAbove = candidateBottom + gap <= nodeTop;
          const separatedBelow = candidateTop >= nodeBottom + gap;
          return !(separatedAbove || separatedBelow);
        });
      };

      if (!isOccupied(desiredY)) return desiredY;

      const stepSize = enforceSpacing ? VERTICAL_SPACING : RELAXED_VERTICAL_STEP;

      for (let step = 1; step <= 30; step++) {
        const up = desiredY - step * stepSize;
        if (!isOccupied(up)) return up;

        const down = desiredY + step * stepSize;
        if (!isOccupied(down)) return down;
      }

      return desiredY;
    },
    [getNodeHeight]
  );

  const nodeTypes = useMemo(() => ({ 
    qa: QaNode
  }), []);

  // Wrapper for onNodesChange to trigger autosave on position changes
  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes);
    
    // Detect position changes and trigger autosave
    changes.forEach((change) => {
      if (change.type === 'position' && change.position && change.id) {
        const node = nodesRef.current.find(n => n.id === change.id);
        if (node) {
          autosaveNodePosition({
            nodeId: change.id,
            position: change.position,
            size: node.width && node.height ? { width: node.width, height: node.height } : null,
          });
        }
      }
    });
  }, [onNodesChange, autosaveNodePosition]);

  const askApi = useCallback(async (question) => {
    const token = authAPI.getToken();
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        detail: response.statusText 
      }));
      
      // Handle upgrade-required errors gracefully
      // Check if upgrade_required is in detail object or top level
      const upgradeRequired = errorData.upgrade_required || 
                             (errorData.detail && errorData.detail.upgrade_required);
      
      if (upgradeRequired) {
        // Extract message from detail object or top level
        const upgradeMessage = errorData.message || 
                              (errorData.detail && errorData.detail.message) ||
                              'Upgrade required to continue';
        const upgradeUrl = errorData.upgrade_url ||
                          (errorData.detail && errorData.detail.upgrade_url) ||
                          '/pricing';
        
        // Show user-friendly message
        alert(upgradeMessage);
        // Redirect to pricing page
        navigate(upgradeUrl);
        throw new Error(upgradeMessage);
      }
      
      // Surface status/text to console for debugging
      console.error('Ask API failed', response.status, errorData);
      
      // Handle detail as object or string
      let errorMessage = errorData.message;
      if (!errorMessage && errorData.detail) {
        if (typeof errorData.detail === 'object') {
          errorMessage = errorData.detail.message || JSON.stringify(errorData.detail);
        } else {
          errorMessage = errorData.detail;
        }
      }
      throw new Error(errorMessage || 'Failed to fetch answer');
    }
    return response.json();
  }, [navigate]);

  // Refs for handlers to avoid circular dependencies
  const askApiRef = useRef(askApi);
  const addSuggestionChildrenRef = useRef(null);
  const handleAskFollowUpRef = useRef(null);
  askApiRef.current = askApi;

  // Helper function to create a dotted edge consistently
  // MUST be defined before functions that use it
  const createDottedEdge = useCallback((sourceId, targetId) => ({
    id: `edge_${sourceId}_${targetId}`,
    source: sourceId,
    target: targetId,
    type: 'default',
    animated: true,
    style: { 
      stroke: BLUE, 
      strokeWidth: 1.5,
      strokeDasharray: '6 3' // Always dotted
    }
  }), []);

  // Handler to redirect to start page when "Ask follow up" is clicked
  // All entry points must go through the start page
  const handleAskFollowUp = useCallback((parentId) => {
    // Navigate to start page - all entry points go through start page
    navigate('/start', { 
      state: { 
        followUpParentId: parentId,
        canvasId: canvasId 
      } 
    });
  }, [navigate, canvasId]);
      
  
  handleAskFollowUpRef.current = handleAskFollowUp;

  // Track which parents already have children being created to prevent duplicates
  const creatingChildrenRef = useRef(new Set());
  const parentsWithChildrenRef = useRef(new Set());
  
  const addSuggestionChildren = useCallback(async (parentId, parentPos, followUps, { relaxSpacing = false } = {}) => {
    // Ensure exactly 3 child nodes are always created
    const limitedFollowUps = followUps.slice(0, 3);
    
    // Check if already creating children for this parent
    if (creatingChildrenRef.current.has(parentId)) {
      return;
    }
    
    // Mark that we're creating children for this parent IMMEDIATELY
    creatingChildrenRef.current.add(parentId);
    
    // CRITICAL: Get parent node to calculate depth - use functional state to get latest
    // First try nodesRef, but if parent not found, we'll get it from state update
    let parentNode = nodesRef.current.find(n => n.id === parentId);
    
    // If parent not found in ref, it might be stale - we'll get it in the state update
    if (!parentNode) {
      console.warn(`Parent node ${parentId} not found in nodesRef, will check in state update`);
    }
    
    const parentDepth = parentNode?.data?.depth || 0;
    const childDepth = parentDepth + 1;
    
    // Calculate depth level based on parent's X position (root starts at x: 200)
    const rootX = 200;
    const baseOffsetX = 350;
    const depth = Math.round((parentPos.x - rootX) / baseOffsetX);
    
    // Position children progressively further to the right for each level
    const spacingY = NODE_HEIGHT_COLLAPSED + NODE_VERTICAL_GAP; // Vertical spacing between child nodes
    const offsetX = baseOffsetX + (depth * 50); // Increase offset by 50px per level
    const offsetIndex = Math.floor(limitedFollowUps.length / 2);
    
    const timestamp = Date.now();
    const stagedNodes = [];
    const newNodes = limitedFollowUps.map((q, idx) => {
      const order = idx - offsetIndex; // -1,0,1 for three nodes; works for 1 or 2 nodes as well
      const desiredY = parentPos.y + order * spacingY;
      const positionY = getNonOverlappingY(
        parentPos.x + offsetX,
        desiredY,
        NODE_HEIGHT_COLLAPSED,
        stagedNodes,
        limitedFollowUps.length > 2
      );
      const node = {
        id: `node_${timestamp}_${idx}_${Math.random().toString(36).slice(2,7)}`,
        position: { x: parentPos.x + offsetX, y: positionY },
        data: { 
          question: q, 
          state: 'suggestion', 
          onAskFollowUp: handleAskFollowUpRef.current,
          parentId,
          depth: childDepth,
          generationType: 'auto_suggestion',
          questionSource: 'llm_suggested',
        },
        type: 'qa'
      };
      stagedNodes.push(node);
      return node;
    });
    
    // Create edges connecting parent to each child - ALL edges are dotted
    // CRITICAL: Edges MUST be created for every node
    const newEdges = newNodes.map((n) => createDottedEdge(parentId, n.id));
    
    // CRITICAL: Check if children already exist by checking edges FIRST
    // Edges are the source of truth for parent-child relationships
    setEdges((prevEdges) => {
      // Check if edges already exist for this parent
      const existingChildEdges = prevEdges.filter(e => e.source === parentId);
      
      // If any child edges exist, don't create new ones
      if (existingChildEdges.length > 0) {
        console.log(`Children already exist for parent ${parentId}, skipping creation`);
        parentsWithChildrenRef.current.add(parentId);
        creatingChildrenRef.current.delete(parentId);
        return prevEdges;
      }
      
      // Filter out any duplicate edges (safety check)
      const existingEdgeIds = new Set(prevEdges.map(e => e.id));
      const edgesToAdd = newEdges.filter(e => !existingEdgeIds.has(e.id));
      
      // ALWAYS return edges - this is CRITICAL for edge creation
      // Every child node MUST have an edge to its parent
      return [...prevEdges, ...edgesToAdd];
    });
    
    // CRITICAL: Add nodes in a separate but batched update
    // React 18+ will automatically batch these with the setEdges call above
    setNodes((prevNodes) => {
      // CRITICAL: Verify parent node exists before creating children
      const parentNodeInState = prevNodes.find(n => n.id === parentId);
      if (!parentNodeInState) {
        console.error(`Cannot create children: Parent node ${parentId} not found in nodes array`);
        creatingChildrenRef.current.delete(parentId);
        return prevNodes; // Don't add children if parent doesn't exist
      }
      
      // CRITICAL: Check if children already exist by checking for nodes with same parentId
      // This prevents duplicates from React Strict Mode or multiple calls
      const existingChildren = prevNodes.filter(n => 
        n.data?.parentId === parentId && 
        n.data?.generationType === 'auto_suggestion'
      );
      
      if (existingChildren.length > 0) {
        console.log(`Children already exist for parent ${parentId} (${existingChildren.length} found), skipping creation`);
        parentsWithChildrenRef.current.add(parentId);
        creatingChildrenRef.current.delete(parentId);
        return prevNodes;
      }
      
      // Check if nodes already exist by ID (prevent duplicates)
      const existingNodeIds = newNodes.map(n => n.id);
      const duplicateNodes = prevNodes.filter(n => existingNodeIds.includes(n.id));
      
      // If duplicates exist, nodes already exist so edges should too
      if (duplicateNodes.length > 0) {
        console.log(`Duplicate node IDs found, skipping creation`);
        creatingChildrenRef.current.delete(parentId);
        return prevNodes;
      }
      
      // Mark parent as having children
      parentsWithChildrenRef.current.add(parentId);
      
      // CRITICAL: Maintain node order - parent nodes first, then children
      // Sort to ensure parent is always before its children
      const allNodes = [...prevNodes, ...newNodes];
      const sortedAllNodes = allNodes.sort((a, b) => {
        // Root nodes (parentId === null) always come first
        if (a.data.parentId === null && b.data.parentId !== null) return -1;
        if (a.data.parentId !== null && b.data.parentId === null) return 1;
        
        // Sort by depth (shallow to deep)
        const depthA = a.data.depth || 0;
        const depthB = b.data.depth || 0;
        if (depthA !== depthB) return depthA - depthB;
        
        // Same depth: sort by Y position (top to bottom)
        return (a.position.y || 0) - (b.position.y || 0);
      });
      
      // Add nodes - edges are already being added in the setEdges call above
      return sortedAllNodes;
    });
    
    // Save all suggestion nodes immediately
    if (canvasId) {
      for (const node of newNodes) {
        await saveNodeImmediate(node, true);
      }
    }
    
    // Clean up creating flag after state settles
    setTimeout(() => {
      creatingChildrenRef.current.delete(parentId);
    }, 500);
  }, [setNodes, setEdges, createDottedEdge, canvasId, saveNodeImmediate]);
  
  addSuggestionChildrenRef.current = addSuggestionChildren;

  // Find sibling nodes (nodes that share the same parent) and reposition them
  const getMeasuredHeight = useCallback(
    (nodeId, fallbackHeight) => {
      const instance = rfInstanceRef.current;
      if (!instance) return fallbackHeight;

      const flowNode = instance.getNode(nodeId);
      if (!flowNode) return fallbackHeight;

      if (typeof flowNode.measured?.height === "number") {
        return flowNode.measured.height;
      }

      if (typeof flowNode.height === "number") {
        return flowNode.height;
      }

      return fallbackHeight;
    },
    []
  );

  const moveSiblingsOutOfWay = useCallback((clickedNodeId, clickedNodePosition, { expanding = false } = {}) => {
    const clickedNode = nodesRef.current.find((n) => n.id === clickedNodeId);
    if (!clickedNode) return;

    const currentEdges = edgesRef.current;
    const parentEdge = currentEdges.find((edge) => edge.target === clickedNodeId);
    if (!parentEdge) return;

    const siblingIds = currentEdges
      .filter((edge) => edge.source === parentEdge.source && edge.target !== clickedNodeId)
      .map((edge) => edge.target);

    if (siblingIds.length === 0) return;

    const baseHeight = getNodeHeight(clickedNode, { treatAsExpanded: expanding });
    const measuredHeight = getMeasuredHeight(clickedNodeId, baseHeight);
    const expandedHeight = Math.max(measuredHeight, NODE_HEIGHT_EXPANDED);
    const startingY = clickedNodePosition.y + expandedHeight + NODE_VERTICAL_GAP;
    const descendantsCache = new Map();

    const collectDescendants = (nodeId) => {
      if (descendantsCache.has(nodeId)) {
        return descendantsCache.get(nodeId);
      }
      const collected = [];
      const queue = [nodeId];

      while (queue.length > 0) {
        const currentId = queue.shift();
        currentEdges
          .filter((edge) => edge.source === currentId)
          .forEach((edge) => {
            collected.push(edge.target);
            queue.push(edge.target);
          });
      }

      descendantsCache.set(nodeId, collected);
      return collected;
    };

    setNodes((prevNodes) => {
      const nodeMap = new Map(prevNodes.map((node) => [node.id, node]));
      const siblings = siblingIds
        .map((id) => nodeMap.get(id))
        .filter(Boolean)
        .sort((a, b) => a.position.y - b.position.y);

      if (siblings.length === 0) {
        return prevNodes;
      }

      let nextAvailableY = startingY;
      const updatedPositions = new Map();
      const plannedShifts = new Map();
      const shiftThreshold = clickedNodePosition.y;
      const siblingsToShift = siblings.filter(
        (sibling) => sibling.position.y >= shiftThreshold
      );

      if (siblingsToShift.length === 0) {
        return prevNodes;
      }

      siblingsToShift.forEach((sibling) => {
        const siblingHeight = Math.max(
          getMeasuredHeight(sibling.id, getNodeHeight(sibling)),
          NODE_HEIGHT_EXPANDED
        );
        const proposedY = sibling.position.y < nextAvailableY ? nextAvailableY : sibling.position.y;
        const deltaY = proposedY - sibling.position.y;

        if (deltaY !== 0) {
          plannedShifts.set(sibling.id, proposedY);
          const descendantIds = collectDescendants(sibling.id);
          descendantIds.forEach((descendantId) => {
            const descendantNode = nodeMap.get(descendantId);
            if (!descendantNode) return;

            const currentPlannedY = plannedShifts.get(descendantId) ?? descendantNode.position.y;
            plannedShifts.set(descendantId, currentPlannedY + deltaY);
          });
        }

        updatedPositions.set(sibling.id, proposedY);
        nextAvailableY = proposedY + siblingHeight + NODE_VERTICAL_GAP;
      });

      if (updatedPositions.size === 0) {
        return prevNodes;
      }

      return prevNodes.map((node) => {
        if (plannedShifts.has(node.id)) {
          return {
            ...node,
            position: {
              ...node.position,
              y: plannedShifts.get(node.id),
            },
          };
        }

        if (updatedPositions.has(node.id)) {
          return {
            ...node,
            position: {
              ...node.position,
              y: updatedPositions.get(node.id),
            },
          };
        }

        return node;
      });
    });
  }, [setNodes, getNodeHeight, getMeasuredHeight]);

  const handleFlowInit = useCallback((instance) => {
    setRfInstance(instance);
    rfInstanceRef.current = instance;
  }, []);

  // Initialize with the prompt from navigation state and ask the backend
  React.useEffect(() => {
    const prompt = location.state?.prompt;
    const canvasIdFromState = location.state?.canvasId;
    
    console.log('FlowPage useEffect triggered', { prompt, canvasIdFromState, locationState: location.state });
    
    // Prevent duplicate initialization for the same prompt (React Strict Mode)
    const initKey = prompt ?? canvasIdFromState ?? "__default__";
    
    // CRITICAL: Use module-level Set to track initialization (persists across Strict Mode unmounts/remounts)
    const promptKey = prompt ? `prompt:${prompt}:${canvasIdFromState}` : null;
    if (promptKey && initializedPrompts.has(promptKey)) {
      console.log('Skipping initialization - prompt already initialized (module-level check)', promptKey);
      return;
    }
    
    // CRITICAL: Prevent duplicate initialization
    // Check if we're already initializing OR already initialized with this key
    if (isInitializingRef.current) {
      console.log('Skipping initialization - already in progress');
      return;
    }
    
    // Don't block if we're switching to a different canvas
    if (initializedPromptRef.current === initKey && canvasLoaded) {
      // Only skip if we're loading the SAME canvas AND it's already loaded
      // But allow reloading if canvasId changed
      const isSameCanvas = canvasIdFromState && 
                           initializedPromptRef.current === canvasIdFromState;
      if (isSameCanvas) {
        console.log('Skipping initialization - already loaded', { initKey, canvasLoaded });
        return;
      }
      // If canvasId changed, we need to reload
      console.log('Canvas changed, reloading...', { 
        previous: initializedPromptRef.current, 
        current: canvasIdFromState 
      });
    }
    
    // Check if root node already exists (prevent duplicates from Strict Mode)
    // CRITICAL: Check both nodes state and ref to catch duplicates early
    if (prompt && canvasIdFromState) {
      // First check nodes state (most up-to-date)
      const existingInState = nodes.find(n => 
        n.data?.parentId === null && 
        n.data?.question === prompt &&
        n.data?.generationType === 'root'
      );
      
      // Also check ref as fallback
      const existingInRef = nodesRef.current.find(n => 
        n.data?.parentId === null && 
        n.data?.question === prompt &&
        n.data?.generationType === 'root'
      );
      
      const existingRootNode = existingInState || existingInRef;
      
      if (existingRootNode) {
        console.log('Skipping initialization - root node already exists', existingRootNode.id);
        initializedPromptRef.current = initKey;
        if (promptKey) initializedPrompts.add(promptKey);
        setCanvasLoaded(true);
        isInitializingRef.current = false; // Reset flag since we're skipping
        return;
      }
    }
    
    console.log('Starting initialization', { initKey, canvasLoaded, previousInitKey: initializedPromptRef.current });
    const previousInitKey = initializedPromptRef.current;
    initializedPromptRef.current = initKey;
    if (promptKey) initializedPrompts.add(promptKey); // Mark as initialized immediately
    isInitializingRef.current = true; // Mark as initializing
    
    // Only reset and clear if this is a NEW initialization (different key)
    // This prevents clearing nodes that are already rendered
    if (previousInitKey !== initKey) {
      console.log('New initialization detected, clearing state', { previousInitKey, initKey });
      // CRITICAL: Don't set canvasLoaded here - set it when nodes are actually set
      // Setting it too early causes ReactFlow to render before nodes exist
      setCanvasLoaded(false);
      // Clear existing edges for new initialization
      setEdges([]);
      
      // CRITICAL: Always clear nodes when switching canvases
      // Compare canvas IDs properly - previousInitKey could be a prompt or canvasId
      const previousCanvasId = previousInitKey && 
                              previousInitKey !== "__default__" &&
                              !previousInitKey.startsWith('prompt:')
                              ? previousInitKey 
                              : null;
      
      if (canvasIdFromState) {
        // Always clear when switching to a different canvas
        if (previousCanvasId !== canvasIdFromState) {
          console.log('Switching canvases - clearing old nodes', { 
            previous: previousCanvasId, 
            current: canvasIdFromState 
          });
          setNodes([]);
        } else {
          // Same canvas but different init (e.g., prompt vs no prompt) - still clear
          console.log('Same canvas but different init - clearing nodes');
          setNodes([]);
        }
      } else if (!prompt && !canvasIdFromState) {
        // Only clear if we're showing input node (no prompt/canvas)
        setNodes([]);
      }
      
      // Clear tracking refs for new initialization
      creatingChildrenRef.current.clear();
      parentsWithChildrenRef.current.clear();
      savedNodeIdsRef.current.clear();
      currentRootNodeIdRef.current = null; // Clear previous root node ref
      isInitializingRef.current = false; // Reset initialization flag for new init
      // Note: We keep initializedPrompts Set entries to prevent duplicates across navigations
    }
    
    const rootPos = { x: 200, y: 200 };

    // Redirect to start page if no prompt and no canvas (all entry points go through start page)
    if (!prompt && !canvasIdFromState) {
      console.log('No prompt or canvasId - redirecting to start page');
      navigate('/start', { replace: true });
      return; // Exit early
    }

    // CRITICAL: If we have a prompt, set the node synchronously BEFORE async operations
    // This ensures the node is visible immediately with the question and loading state
    let rootId = null;
    let initialNode = null;
    if (prompt && canvasIdFromState) {
      console.log('Setting initial node synchronously for prompt', prompt);
      
      // CRITICAL: Check if root node already exists by question text BEFORE generating new ID
      // This prevents duplicates when React Strict Mode runs the effect twice
      // Check both nodes state and ref to catch duplicates
      const existingInState = nodes.find(n => 
        n.data?.parentId === null && 
        n.data?.question === prompt &&
        n.data?.generationType === 'root'
      );
      const existingInRef = nodesRef.current.find(n => 
        n.data?.parentId === null && 
        n.data?.question === prompt &&
        n.data?.generationType === 'root'
      );
      const existingRootByQuestion = existingInState || existingInRef;
      
      if (existingRootByQuestion) {
        console.log('Root node with this question already exists, reusing:', existingRootByQuestion.id);
        rootId = existingRootByQuestion.id;
        initialNode = existingRootByQuestion;
        currentRootNodeIdRef.current = rootId;
        setCanvasId(canvasIdFromState);
        setCanvasLoaded(true);
        
        // If node already has an answer, skip API call
        if (existingRootByQuestion.data?.state === 'answer') {
          console.log('Root node already has answer, skipping API call');
          isInitializingRef.current = false;
          return; // Exit early, don't proceed with async initialization
        }
        // If node is still loading, proceed with API call to update it
        console.log('Root node exists but is loading, proceeding with API call');
      } else {
        // CRITICAL: Set canvasId state before creating nodes
        setCanvasId(canvasIdFromState);
        console.log('Canvas ID set', canvasIdFromState);

        rootId = `node_${Date.now()}`;
        initialNode = {
          id: rootId,
          position: rootPos,
          data: { 
            question: prompt, 
            state: 'loading',
            parentId: null,
            depth: 0,
            generationType: 'root',
            questionSource: 'user',
            // Add onAskFollowUp handler even for loading state (will be updated later)
            onAskFollowUp: handleAskFollowUpRef.current,
          },
          type: 'qa',
          draggable: true
        };
        
        console.log('Setting initial node', initialNode);
        // CRITICAL: Set nodes synchronously BEFORE any async operations
        // This ensures the node is visible immediately with the question and loading state
        // Use a ref to track if we found a duplicate (so async block can use correct node)
        const duplicateFoundRef = { found: false, existingNode: null };
        
        setNodes((prev) => {
          // CRITICAL: Double-check node doesn't exist in prev state by question text
          // This prevents duplicates when React Strict Mode runs setNodes twice
          const duplicate = prev.find(n => 
            n.data?.parentId === null && 
            n.data?.question === prompt &&
            n.data?.generationType === 'root'
          );
          if (duplicate) {
            console.log('Node with this question already exists in state, skipping add. Existing node ID:', duplicate.id);
            // Store the existing node's ID in ref for use in async block
            duplicateFoundRef.found = true;
            duplicateFoundRef.existingNode = duplicate;
            currentRootNodeIdRef.current = duplicate.id;
            return prev;
          }
          console.log('Adding new root node to state:', rootId);
          return [...prev, initialNode];
        });
        
        // CRITICAL: If duplicate was found, update rootId and initialNode to match existing node
        if (duplicateFoundRef.found && duplicateFoundRef.existingNode) {
          console.log('Updating rootId and initialNode to match existing node:', duplicateFoundRef.existingNode.id);
          rootId = duplicateFoundRef.existingNode.id;
          initialNode = duplicateFoundRef.existingNode;
          currentRootNodeIdRef.current = rootId;
        }
        // CRITICAL: Ensure canvasLoaded is true so ReactFlow renders immediately
        setCanvasLoaded(true);
        console.log('Node set with question and loading state, canvas marked as loaded');
        
        // CRITICAL: Store the rootId in a ref to prevent accidental clearing
        currentRootNodeIdRef.current = rootId;
        
        // CRITICAL: Mark node as saved in ref immediately to prevent duplicate saves
        // This ensures the node persists in state
        savedNodeIdsRef.current.add(rootId);
      }
    }

    // Then do async initialization (non-blocking)
    (async () => {
      try {
        console.log('Async initialization started', { prompt, canvasIdFromState, currentCanvasId: canvasId });
        
        // CRITICAL: If we have a prompt, we're creating a NEW node, so DON'T load from canvas
        // Only load from canvas if we DON'T have a prompt (viewing existing canvas)
        if (canvasIdFromState && !prompt) {
          console.log('Loading existing canvas (no prompt provided)', canvasIdFromState);
          try {
            // CRITICAL: Clear nodes BEFORE loading to prevent showing old nodes
            // This ensures clean state when switching canvases
            setNodes([]);
            setEdges([]);
            setCanvasLoaded(false);
            
            setCanvasId(canvasIdFromState);
            const nodesData = await nodeAPI.getCanvasNodes(canvasIdFromState);
            console.log('Loaded nodes from canvas', nodesData.length);
            
            // Verify we're still loading the same canvas (prevent race conditions)
            // Check both the state and the ref to catch any updates
            const currentCanvasId = canvasId || canvasIdFromState;
            if (currentCanvasId !== canvasIdFromState) {
              console.log('Canvas changed during load, aborting', { 
                expected: canvasIdFromState, 
                current: currentCanvasId 
              });
              isInitializingRef.current = false;
              return;
            }
            
            if (!nodesData || nodesData.length === 0) {
              console.log('No nodes found for canvas, redirecting to start page');
              navigate('/start', { replace: true });
              isInitializingRef.current = false;
              return;
            }
            
            console.log('Raw node parent_ids:', nodesData.map(n => ({ 
              id: n.id, 
              parent_id: n.parent_id,
              parent_id_type: typeof n.parent_id,
              node_kind: n.node_kind,
              answer_status: n.answer?.status
            })));
            
            const rfNodes = nodesData.map(nodePayloadToReactFlowNode);
            console.log('Converted to ReactFlow nodes:', rfNodes.length);
            console.log('Node states:', rfNodes.map(n => ({
              id: n.id,
              state: n.data.state,
              parentId: n.data.parentId,
              hasAnswer: !!n.data.answer
            })));
            
            // CRITICAL: Defensive normalization - ensure parentId is null for root nodes
            // This handles edge cases where the converter might have missed something
            const normalizedNodes = rfNodes.map(node => {
              // Normalize parentId: undefined, null, or empty string should all be null
              const parentId = (node.data.parentId === undefined || 
                               node.data.parentId === null || 
                               node.data.parentId === '') 
                               ? null 
                               : node.data.parentId;
              
              return {
                ...node,
                data: {
                  ...node.data,
                  parentId: parentId,
                }
              };
            });
            
            console.log('Normalized nodes - root nodes:', normalizedNodes
              .filter(n => n.data.parentId === null)
              .map(n => ({ id: n.id, question: n.data.question?.substring(0, 50) })));
            
            // Add onAskFollowUp handler to all nodes that need it
            // CRITICAL: Add handler to ALL nodes with answers OR are root nodes
            // This ensures all nodes can show their content properly
            const rfNodesWithHandlers = normalizedNodes.map(node => {
              // Add handler to ALL nodes that have answers OR are root nodes
              // This ensures all nodes can show their content properly
              const needsHandler = (
                // Nodes with answers (regardless of state)
                (node.data.answer && node.data.answer.trim().length > 0) ||
                // Nodes in answer state
                node.data.state === 'answer' ||
                // Nodes in loading state (might have answers loading)
                node.data.state === 'loading' ||
                // Root nodes (always need handler)
                node.data.parentId === null
              ) && !node.data.onAskFollowUp;
              
              if (needsHandler) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    onAskFollowUp: handleAskFollowUpRef.current,
                  }
                };
              }
              return node;
            });
            
            // CRITICAL: Sort nodes to ensure parent nodes render first
            // Order: root nodes (parentId === null) first, then by depth, then by Y position
            const sortedNodes = rfNodesWithHandlers.sort((a, b) => {
              // Root nodes (parentId === null) always come first
              if (a.data.parentId === null && b.data.parentId !== null) return -1;
              if (a.data.parentId !== null && b.data.parentId === null) return 1;
              
              // If both are root nodes or both have parents, sort by depth
              const depthA = a.data.depth || 0;
              const depthB = b.data.depth || 0;
              if (depthA !== depthB) return depthA - depthB;
              
              // Same depth: sort by Y position (top to bottom)
              return (a.position.y || 0) - (b.position.y || 0);
            });
            
            console.log('Sorted nodes for rendering:', sortedNodes.map(n => ({
              id: n.id,
              parentId: n.data.parentId,
              depth: n.data.depth,
              state: n.data.state,
              hasAnswer: !!n.data.answer,
              question: n.data.question?.substring(0, 30)
            })));
            const rootNodes = sortedNodes.filter(n => n.data.parentId === null);
            console.log('Root nodes count:', rootNodes.length);
            console.log('Root nodes:', rootNodes.map(n => ({ id: n.id, question: n.data.question?.substring(0, 50) })));
            
            if (sortedNodes.length === 0) {
              console.error('No nodes to render after processing!');
              isInitializingRef.current = false;
              setCanvasLoaded(true);
              return;
            }
            
            console.log('Setting nodes in state:', sortedNodes.length);
            setNodes(sortedNodes);
            // Create edges for loaded nodes
            // CRITICAL: Only create edges where parent node exists in loaded nodes
            const nodeIds = new Set(sortedNodes.map(n => n.id));
            const loadedEdges = [];
            sortedNodes.forEach(node => {
              if (node.data.parentId) {
                // Verify parent node exists before creating edge
                if (nodeIds.has(node.data.parentId)) {
                  loadedEdges.push(createDottedEdge(node.data.parentId, node.id));
                } else {
                  console.warn(
                    `Skipping edge creation: Parent node ${node.data.parentId} ` +
                    `not found for child node ${node.id}`
                  );
                }
              }
            });
            console.log(`Created ${loadedEdges.length} edges for ${sortedNodes.length} nodes`);
            setEdges(loadedEdges);
            // Mark all loaded nodes as saved
            sortedNodes.forEach(node => savedNodeIdsRef.current.add(node.id));
            
            // Verify nodes are actually set
            setTimeout(() => {
              const currentNodes = nodesRef.current;
              console.log('Nodes in state after setNodes:', currentNodes.length);
              if (currentNodes.length === 0) {
                console.error('WARNING: Nodes were not set in state! Retrying...');
                setNodes([...sortedNodes]);
              }
            }, 100);
            
            setCanvasLoaded(true);
            isInitializingRef.current = false; // Mark initialization complete
            console.log('Canvas loading complete');
            return;
            } catch (error) {
              console.error('Failed to load canvas:', error);
              console.error('Error details:', error.message, error.stack);
              isInitializingRef.current = false; // Mark initialization complete even on error
              // Redirect to start page on error - all entry points go through start page
              navigate('/start', { replace: true });
            }
        }

        // CRITICAL: Process prompt - parent node is already set synchronously above
        // This ensures the parent node stays visible throughout the API call
        if (prompt && initialNode && rootId) {
          console.log('Processing prompt - node already set, proceeding with API call', prompt);
          
          // CRITICAL: Verify the node actually exists in state before proceeding
          // If setNodes found a duplicate, we need to use the existing node
          const actualNodeInState = nodesRef.current.find(n => 
            n.data?.parentId === null && 
            n.data?.question === prompt &&
            n.data?.generationType === 'root'
          );
          
          if (actualNodeInState && actualNodeInState.id !== rootId) {
            console.log('Found existing node with different ID, using it instead:', actualNodeInState.id);
            rootId = actualNodeInState.id;
            initialNode = actualNodeInState;
            currentRootNodeIdRef.current = rootId;
          }
          
          // Node is already set synchronously above, now do async operations
          
          // Save root node in background (non-blocking) only if it's new
          // If node already exists, it's already saved
          if (!savedNodeIdsRef.current.has(rootId)) {
            saveNodeImmediate(initialNode, true, canvasIdFromState).catch(err => {
              console.error('Failed to save initial node:', err);
              // Continue anyway - node is visible in state
            });
          } else {
            console.log('Node already saved, skipping save');
          }

          // Immediately proceed to API call - node is already visible with skeleton
          try {
            console.log('Calling askApi with prompt:', prompt);
            const result = await askApi(prompt);
            console.log('AskApi result received', result);
            const rootNodeWithAnswer = {
              ...initialNode,
              data: { 
                ...initialNode.data,
                question: result.question, 
                answer: result.answer, 
                state: 'answer', 
                onAskFollowUp: handleAskFollowUpRef.current, 
                images: result.image_results || [],
                llm: {
                  model: result.model || null,
                  latencyMs: result.latency_ms || null,
                },
              }
            };
            console.log('Updating node with answer');
            // CRITICAL: Update node in place - it should already exist in state
            // This is just updating the state from 'loading' to 'answer'
            setNodes((prev) => {
              const nodeIndex = prev.findIndex((n) => n.id === rootId);
              if (nodeIndex === -1) {
                // Node doesn't exist - this shouldn't happen, but add it
                console.warn('Root node not found in prev nodes, adding it:', rootNodeWithAnswer);
                return [rootNodeWithAnswer, ...prev];
              }
              
              // Node exists - update it in place
              // This just changes state from 'loading' to 'answer', keeping everything else
              const updated = [...prev];
              updated[nodeIndex] = rootNodeWithAnswer;
              console.log('Updated node state from loading to answer');
              return updated;
            });
            
            // Save root node with answer immediately (non-blocking)
            saveNodeImmediate(rootNodeWithAnswer, false).catch(err => {
              console.error('Failed to save root node with answer:', err);
            });
            
            // CRITICAL: Wait for parent node to render before adding children
            // This ensures smooth rendering - parent first, then children
            // Wait for both state update and ReactFlow to render the parent
            await new Promise(resolve => setTimeout(resolve, 100));
            
            console.log('Adding suggestion children');
            // Use the ref to ensure we have the latest version
            addSuggestionChildrenRef.current(rootId, rootPos, result.follow_ups || []);
            isInitializingRef.current = false; // Mark initialization complete
          } catch (e) {
            console.error('Ask API error:', e);
            // Don't show error message if it's an upgrade redirect
            if (e.isUpgradeRequired) {
              isInitializingRef.current = false; // Mark initialization complete
              return; // Let the redirect happen
            }
            const errorNode = {
              ...initialNode,
              data: { 
                ...initialNode.data,
                question: prompt, 
                answer: `Error: ${e.message || 'Failed to fetch answer.'}`, 
                state: 'answer', 
                onAskFollowUp: handleAskFollowUpRef.current 
              }
            };
            // CRITICAL: Use defensive update - ensure root node always exists
            setNodes((prev) => {
              const existingNode = prev.find((n) => n.id === rootId);
              if (existingNode) {
                // Node exists, update it
                const updated = prev.map((n) => n.id === rootId ? errorNode : n);
                console.log('Updated nodes array with error (node found):', updated);
                return updated;
              } else {
                // Node doesn't exist (shouldn't happen, but be defensive)
                console.warn('Root node not found in prev nodes, adding error node:', errorNode);
                return [errorNode, ...prev];
              }
            });
            saveNodeImmediate(errorNode, false).catch(err => {
              console.error('Failed to save error node:', err);
            });
            isInitializingRef.current = false; // Mark initialization complete
          }
          
          return; // Exit early, don't set canvasLoaded again at the end
        }
        
        setCanvasLoaded(true);
        isInitializingRef.current = false; // Mark initialization complete
      } catch (error) {
        console.error('Initialization error:', error);
        isInitializingRef.current = false; // Mark initialization complete even on error
        // Redirect to start page if initialization fails and no prompt/canvas
        if (!prompt && !canvasIdFromState) {
          navigate('/start', { replace: true });
        }
        setCanvasLoaded(true);
      }
    })();
  }, [location.state?.prompt, location.state?.canvasId, createDottedEdge, saveNodeImmediate, navigate, setNodes, setEdges]); // Dependencies needed for initialization


  const onNodeClick = useCallback(async (_evt, node) => {
    if (node?.data?.state !== 'suggestion') return;
    const nodeId = node.id;
    const question = node.data.question;
    const nodePosition = node.position; // Store position before any state changes

    // Canvas must be provided via navigation state
    if (!canvasId) {
      console.error('Cannot create node: canvasId is required');
      return;
    }

    // Clear this node from tracking refs to ensure it can create children
    // (it was a child, but now it's becoming a parent)
    creatingChildrenRef.current.delete(nodeId);
    parentsWithChildrenRef.current.delete(nodeId);

    // Move sibling nodes out of the way before expanding
    moveSiblingsOutOfWay(nodeId, nodePosition, { expanding: true });

    // Ensure all existing edges maintain dotted style
    setEdges((prevEdges) => 
      prevEdges.map((edge) => ({
        ...edge,
        style: {
          ...edge.style,
          stroke: BLUE,
          strokeWidth: 1.5,
          strokeDasharray: edge.style?.strokeDasharray || '6 3', // Preserve or set dotted
        },
        animated: true,
      }))
    );

    // CRITICAL: Turn suggestion into a loading QA node - node stays visible with skeleton
    const loadingNode = {
      ...node,
      data: { 
        ...node.data,
        question, 
        state: 'loading', // Show skeleton loading animation
        node_kind: 'turn',
        // Preserve all existing data to ensure node stays visible
        parentId: node.data.parentId,
        depth: node.data.depth,
        generationType: node.data.generationType || 'auto_suggestion',
        questionSource: node.data.questionSource || 'llm_suggested',
      },
      type: 'qa'
    };
    
    // CRITICAL: Update node in place - it should already exist, just change state
    // This ensures the node stays visible with skeleton loading
    setNodes((prev) => {
      const existingIndex = prev.findIndex((n) => n.id === nodeId);
      if (existingIndex === -1) {
        // Node doesn't exist (shouldn't happen), add it
        console.warn('Node not found in prev nodes, adding loading node:', loadingNode);
        return [...prev, loadingNode];
      }
      // Node exists - update it in place to show skeleton
      return prev.map((n) => n.id === nodeId ? loadingNode : n);
    });
    
    // Save node immediately (converting from suggestion to turn)
    await saveNodeImmediate(loadingNode, false);

    try {
      const result = await askApi(question);
      
      // CRITICAL: Update node state to answer - node stays visible, just updates content
      const answerNode = {
        ...loadingNode,
        data: { 
          ...loadingNode.data,
          question: result.question, 
          answer: result.answer, 
          state: 'answer', // Change from 'loading' to 'answer' - skeleton disappears, answer appears
          onAskFollowUp: handleAskFollowUpRef.current, 
          images: result.image_results || [],
          llm: {
            model: result.model || null,
            latencyMs: result.latency_ms || null,
          },
          // Preserve all existing data
          parentId: loadingNode.data.parentId,
          depth: loadingNode.data.depth,
          generationType: loadingNode.data.generationType,
          questionSource: loadingNode.data.questionSource,
        }
      };
      
      // CRITICAL: Update node in place - it should already exist with loading state
      // This ensures smooth transition from skeleton to answer
      setNodes((prev) => {
        const existingIndex = prev.findIndex((n) => n.id === nodeId);
        if (existingIndex === -1) {
          // Node doesn't exist (shouldn't happen), add it
          console.warn('Node not found when updating with answer, adding:', answerNode);
          return [...prev, answerNode];
        }
        // Node exists - update it in place
        return prev.map((n) => n.id === nodeId ? answerNode : n);
      });
      
      // Save node with answer immediately
      await saveNodeImmediate(answerNode, false);
      
      setTimeout(() => {
        const updatedNode = nodesRef.current.find((n) => n.id === nodeId);
        if (updatedNode) {
          moveSiblingsOutOfWay(nodeId, updatedNode.position, { expanding: false });
        }
      }, 50);
      
      // Ensure all edges remain dotted after node update
      setEdges((prevEdges) => 
        prevEdges.map((edge) => ({
          ...edge,
          style: {
            ...edge.style,
            stroke: BLUE,
            strokeWidth: 1.5,
            strokeDasharray: '6 3', // Force dotted style
          },
          animated: true,
        }))
      );
      
      // CRITICAL: Create children for this node - MUST create edges
      // Use the stored position to ensure accuracy
      addSuggestionChildren(nodeId, nodePosition, result.follow_ups || []);
    } catch (e) {
      // Don't show error message if it's an upgrade redirect
      if (e.isUpgradeRequired) {
        return; // Let the redirect happen
      }
      console.error('Ask API error:', e);
      // CRITICAL: Create error node that stays visible
      const errorNode = {
        ...loadingNode,
        data: { 
          ...loadingNode.data,
          question, 
          answer: `Error: ${e.message || 'Failed to fetch answer.'}`, 
          state: 'answer', // Show error as answer so node stays visible
          onAskFollowUp: handleAskFollowUpRef.current,
          // Preserve all existing data
          parentId: loadingNode.data.parentId,
          depth: loadingNode.data.depth,
          generationType: loadingNode.data.generationType,
          questionSource: loadingNode.data.questionSource,
        }
      };
      // CRITICAL: Update node in place - it should already exist with loading state
      setNodes((prev) => {
        const existingIndex = prev.findIndex((n) => n.id === nodeId);
        if (existingIndex === -1) {
          // Node doesn't exist (shouldn't happen), add it
          console.warn('Node not found when updating with error, adding:', errorNode);
          return [...prev, errorNode];
        }
        // Node exists - update it in place
        return prev.map((n) => n.id === nodeId ? errorNode : n);
      });
      await saveNodeImmediate(errorNode, false);
      
      setTimeout(() => {
        const updatedNode = nodesRef.current.find((n) => n.id === nodeId);
        if (updatedNode) {
          moveSiblingsOutOfWay(nodeId, updatedNode.position, { expanding: false });
        }
      }, 50);
      
      // Ensure all edges remain dotted even on error
      setEdges((prevEdges) => 
        prevEdges.map((edge) => ({
          ...edge,
          style: {
            ...edge.style,
            stroke: BLUE,
            strokeWidth: 1.5,
            strokeDasharray: '6 3', // Force dotted style
          },
          animated: true,
        }))
      );
    }
  }, [askApi, addSuggestionChildren, setNodes, setEdges, moveSiblingsOutOfWay, canvasId, saveNodeImmediate]);

  useEffect(() => {
    if (!location.state?.prompt && rfInstance && nodes.length === 1) {
      const node = nodes[0];
      const targetX = node.position.x + 200;
      const targetY = node.position.y + 120;
      rfInstance.setCenter(targetX, targetY, {
        zoom: 0.75,
        duration: 300,
      });
    }
  }, [location.state?.prompt, nodes, rfInstance]);

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
    <div className={`flow-page ${isMenuOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
      <Sidebar 
        onCanvasSelect={(canvas) => {
          navigate('/flow', { state: { canvasId: canvas.id } });
        }}
        onCreateCanvas={() => {
          // Navigate to start page - no canvas created yet
          // Canvas will be created when user asks a question
          navigate('/start');
        }}
        currentCanvasId={location.state?.canvasId}
      />

      {/* Top-right actions */}
      <div className="flow-page__actions">
        {user ? (
          <Link to="/pricing" className="action-btn">
            Upgrade
          </Link>
        ) : (
          <Link to="/signin" className="action-btn action-primary">
            Sign in
          </Link>
        )}
      </div>

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        onInit={handleFlowInit}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        selectNodesOnDrag={false}
        panOnDrag={true}
        panOnScroll={true}
        zoomOnScroll={true}
      >
        <MiniMap
          style={{
            width: 175,
            height: 150,
            backgroundColor: "#1a1a1a",
            borderRadius: 8,
            border: "1px solid #333",
          }}
          nodeColor={() => BLUE}
          maskColor="rgba(10,10,10,0.6)"
        />
        <Controls
          position="bottom-left"
          showInteractive={false}
          style={{
            backgroundColor: "#1f1f1f",
            borderRadius: 12,
            padding: 4,
            boxShadow: "0 0 6px rgba(0,0,0,0.35)",
          }}
        />
        <Background variant="dots" gap={16} size={1} color="#333" />
      </ReactFlow>
    </div>
  );
}
