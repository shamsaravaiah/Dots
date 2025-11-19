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
import Button from "../../components/common/Button/Button";
import { authAPI } from "../../services/api";
import "./FlowPage.css";

const BLUE = "#4F86F7";
const API_URL = "http://localhost:8000/api/ask";
const VERTICAL_SPACING = 150;
const COLUMN_X_THRESHOLD = 140;
const RELAXED_VERTICAL_STEP = 60;
const NODE_HEIGHT_COLLAPSED = 90;
const NODE_HEIGHT_EXPANDED = 240;
const INPUT_NODE_HEIGHT = 130;
const NODE_VERTICAL_GAP = 40;

// Custom node renderer supporting: loading, answer, and suggestion states
function QaNode({ data, id }) {
  const { question, answer, state, onAskFollowUp } = data;
  return (
    <div style={{
      border: `1px solid ${BLUE}`,
      background: state === 'suggestion' ? '#2a2a2a' : '#141414',
      color: BLUE,
      borderRadius: 16,
      padding: 12,
      minWidth: 220,
      maxWidth: 320,
      boxShadow: '0 14px 40px rgba(0,0,0,0.35)'
    }}>
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
      
      <div style={{ fontWeight: 700, marginBottom: 8, color: BLUE }}>{question}</div>
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
          <div style={{ 
            whiteSpace: 'pre-wrap', 
            lineHeight: 1.35, 
            marginBottom: 12,
            animation: 'fadeIn 0.3s ease-in',
            width: '100%'
          }}>{answer}</div>
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

// Input node for asking custom follow-up questions
function InputNode({ data, id }) {
  const [inputValue, setInputValue] = React.useState('');
  const textareaRef = React.useRef(null);
  const { onAsk, onCancel, isRoot = false, showCancel = true } = data;

  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  const handleSubmit = () => {
    if (inputValue.trim() && onAsk) {
      onAsk(id, inputValue.trim());
    }
  };

  return (
    <div className={`input-node-wrapper${isRoot ? ' input-node-wrapper--root' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        style={{ opacity: 0, pointerEvents: "none" }}
      />

      {isRoot && (
        <div className="input-node-hero">
          <img src="/logo_blue.svg" alt="Dots" className="input-node-icon" />
          <h3 className="input-node-title">Start Connecting Your Dots</h3>
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Type your question..."
        rows={1}
        className="input-node-textarea"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey && inputValue.trim()) {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <div className={`input-node-actions${isRoot ? ' input-node-actions--root' : ''}`}>
        {showCancel && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onCancel) onCancel(id);
            }}
            className="input-node-button input-node-button--cancel"
          >
            Cancel
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleSubmit();
          }}
          disabled={!inputValue.trim()}
          className={`input-node-button input-node-button--ask${inputValue.trim() ? '' : ' is-disabled'}`}
        >
          Ask
        </button>
      </div>
    </div>
  );
}

export default function FlowPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false); // Sidebar collapsed by default
  const [rfInstance, setRfInstance] = useState(null);
  const rfInstanceRef = useRef(null);
  const initializedPromptRef = useRef(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
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

  const getNodeHeight = useCallback(
    (node, { treatAsExpanded = false } = {}) => {
      if (!node) return NODE_HEIGHT_COLLAPSED;
      if (node.type === "input") return INPUT_NODE_HEIGHT;

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
    qa: QaNode,
    input: InputNode
  }), []);

  const askApi = useCallback(async (question) => {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      // Surface status/text to console for debugging
      console.error('Ask API failed', response.status, text);
      throw new Error('Failed to fetch answer');
    }
    return response.json();
  }, []);

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

  // Handler to cancel input node
  const handleInputCancel = useCallback((inputNodeId) => {
    setNodes((prev) => prev.filter(n => n.id !== inputNodeId));
    setEdges((prev) => prev.filter(e => 
      e.source !== inputNodeId && e.target !== inputNodeId
    ));
  }, [setNodes, setEdges]);

  // Handler for when user asks from input node  
  const handleInputAsk = useCallback(async (inputNodeId, question) => {
    // Get current nodes synchronously using ref
    const currentNodes = nodesRef.current;
    const inputNode = currentNodes.find(n => n.id === inputNodeId);
    
    if (!inputNode) return;
    
    const parentId = inputNode.data.parentId ?? null;
    
    const inputPosition = inputNode.position;
    
    // Remove input node and its edges
    setNodes((prevNodes) => prevNodes.filter(n => n.id !== inputNodeId));
    setEdges((prevEdges) => prevEdges.filter(e => 
      e.source !== inputNodeId && e.target !== inputNodeId
    ));
    
    // Create new QA node at input node's position
    const newNodeId = `node_${Date.now()}`;
    const newNode = {
      id: newNodeId,
      position: inputPosition,
      data: { question, state: 'loading' },
      type: 'qa',
      draggable: true
    };
    
    // CRITICAL: Add node FIRST, then edge
    setNodes((prevNodes) => {
      // Check if node already exists
      if (prevNodes.some(n => n.id === newNodeId)) {
        return prevNodes;
      }
      return [...prevNodes, newNode];
    });
    
    // CRITICAL: Create edge from parent to new node (dotted) - MUST be created
    if (parentId) {
      const newEdge = createDottedEdge(parentId, newNodeId);
      setEdges((prevEdges) => {
        if (prevEdges.some(e => e.id === newEdge.id)) {
          return prevEdges;
        }
        return [...prevEdges, newEdge];
      });
    }
    
    // Ask API and update node
    try {
        const result = await askApiRef.current(question);
      setNodes((prev) => {
        return prev.map((n) => n.id === newNodeId ? {
          ...n,
          data: { 
            question: result.question, 
            answer: result.answer, 
            state: 'answer',
            onAskFollowUp: handleAskFollowUpRef.current
          }
        } : n);
      });
      addSuggestionChildrenRef.current(newNodeId, inputPosition, result.follow_ups || []);
    } catch (e) {
      setNodes((prev) => prev.map((n) => n.id === newNodeId ? {
        ...n,
        data: { 
          question, 
          answer: 'Failed to fetch answer.', 
          state: 'answer',
          onAskFollowUp: handleAskFollowUpRef.current
        }
      } : n));
    }
  }, [setNodes, setEdges, createDottedEdge]);

  // Handler to create an input node when "Ask follow up" is clicked
  const handleAskFollowUp = useCallback((parentId) => {
    // Get current state synchronously using refs
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    
    const parentNode = currentNodes.find(n => n.id === parentId);
    if (!parentNode) return;
    
    // Check if input node already exists for this parent
    const existingInputNode = currentNodes.find(n => 
      n.type === 'input' && n.data.parentId === parentId
    );
    if (existingInputNode) return;
    
    // Find all child nodes of this parent
    const childEdges = currentEdges.filter(e => e.source === parentId);
    const childNodeIds = childEdges.map(e => e.target);
    const childNodes = currentNodes.filter(n => childNodeIds.includes(n.id) && n.type === 'qa');
    
    // Calculate input node position
    const rootX = 200;
    const baseOffsetX = 350;
    const depth = Math.round((parentNode.position.x - rootX) / baseOffsetX);
    const offsetX = baseOffsetX + (depth * 50);
    
    // Find the lowest Y position among child nodes
    let lowestY = parentNode.position.y;
    if (childNodes.length > 0) {
      lowestY = Math.max(...childNodes.map(n => n.position.y));
    }
    
    // Position input node below the lowest child (same X as children, Y below)
    const spacingY = INPUT_NODE_HEIGHT + NODE_VERTICAL_GAP * 0.5;
    const targetX = parentNode.position.x + offsetX;
    const desiredY = lowestY + spacingY;
    const positionY = getNonOverlappingY(
      targetX,
      desiredY,
      INPUT_NODE_HEIGHT,
      [],
      false
    );
    const inputNodeId = `input_${parentId}_${Date.now()}`;
    const inputNode = {
      id: inputNodeId,
      position: {
        x: targetX, // Same X as child nodes (to the right of parent)
        y: positionY // Below the lowest child node
      },
      type: 'input',
      data: {
        parentId,
        onAsk: handleInputAsk,
          onCancel: handleInputCancel,
          isRoot: false,
          showCancel: true
      }
    };
    
    // CRITICAL: Add node FIRST, then edge
    setNodes((prevNodes) => {
      // Check if node already exists
      if (prevNodes.some(n => n.id === inputNodeId)) {
        return prevNodes;
      }
      return [...prevNodes, inputNode];
    });
    
    // CRITICAL: Create edge from parent to input node (dotted) - MUST be created
    const newEdge = createDottedEdge(parentId, inputNodeId);
    setEdges((prevEdges) => {
      // Check if edge already exists
      if (prevEdges.some(e => e.id === newEdge.id)) {
        return prevEdges;
      }
      return [...prevEdges, newEdge];
    });
  }, [setNodes, setEdges, handleInputCancel, handleInputAsk, createDottedEdge]);
      
  
  handleAskFollowUpRef.current = handleAskFollowUp;

  // Track which parents already have children being created to prevent duplicates
  const creatingChildrenRef = useRef(new Set());
  const parentsWithChildrenRef = useRef(new Set());
  
  const addSuggestionChildren = useCallback((parentId, parentPos, followUps, { relaxSpacing = false } = {}) => {
    // Ensure exactly 3 child nodes are always created
    const limitedFollowUps = followUps.slice(0, 3);
    
    // Check if already creating children for this parent
    if (creatingChildrenRef.current.has(parentId)) {
      return;
    }
    
    // Mark that we're creating children for this parent IMMEDIATELY
    creatingChildrenRef.current.add(parentId);
    
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
        data: { question: q, state: 'suggestion', onAskFollowUp: handleAskFollowUpRef.current },
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
      // Check if nodes already exist (prevent duplicates)
      const existingNodeIds = newNodes.map(n => n.id);
      const duplicateNodes = prevNodes.filter(n => existingNodeIds.includes(n.id));
      
      // If duplicates exist, nodes already exist so edges should too
      if (duplicateNodes.length > 0) {
        creatingChildrenRef.current.delete(parentId);
        return prevNodes;
      }
      
      // Mark parent as having children
      parentsWithChildrenRef.current.add(parentId);
      
      // Add nodes - edges are already being added in the setEdges call above
      return [...prevNodes, ...newNodes];
    });
    
    // Clean up creating flag after state settles
    setTimeout(() => {
      creatingChildrenRef.current.delete(parentId);
    }, 500);
  }, [setNodes, setEdges, createDottedEdge]);
  
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
    
    // Prevent duplicate initialization for the same prompt (React Strict Mode)
    const initKey = prompt ?? "__default__";
    if (initializedPromptRef.current === initKey) return;
    
    initializedPromptRef.current = initKey;
    
    // Clear existing edges for new initialization
    setEdges([]);
    // Clear tracking refs for new initialization
    creatingChildrenRef.current.clear();
    parentsWithChildrenRef.current.clear();
    
    const rootPos = { x: 200, y: 200 };

    if (prompt) {
      const rootId = `node_${Date.now()}`;
      const initialNode = {
        id: rootId,
        position: rootPos,
        data: { question: prompt, state: 'loading' },
        type: 'qa',
        draggable: true
      };
      setNodes([initialNode]);

      (async () => {
        try {
          const result = await askApi(prompt);
          setNodes((prev) => prev.map((n) => n.id === rootId ? {
            ...n,
            data: { question: result.question, answer: result.answer, state: 'answer', onAskFollowUp: handleAskFollowUpRef.current }
          } : n));
          addSuggestionChildren(rootId, rootPos, result.follow_ups || []);
        } catch (e) {
          setNodes((prev) => prev.map((n) => n.id === rootId ? {
            ...n,
            data: { question: prompt, answer: 'Failed to fetch answer.', state: 'answer', onAskFollowUp: handleAskFollowUpRef.current }
          } : n));
        }
      })();
    } else {
      const inputNodeId = `input_root_${Date.now()}`;
      const inputNode = {
        id: inputNodeId,
        position: rootPos,
        type: 'input',
        data: {
          parentId: null,
          onAsk: handleInputAsk,
          onCancel: handleInputCancel,
          isRoot: true,
          showCancel: false
        },
        draggable: false
      };
      setNodes([inputNode]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

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
        setAvatarError(false);
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

  const onNodeClick = useCallback(async (_evt, node) => {
    if (node?.data?.state !== 'suggestion') return;
    const nodeId = node.id;
    const question = node.data.question;
    const nodePosition = node.position; // Store position before any state changes

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

    // Turn suggestion into a loading QA node
    setNodes((prev) => prev.map((n) => n.id === nodeId ? {
      ...n,
      data: { question, state: 'loading' },
      type: 'qa'
    } : n));

    try {
      const result = await askApi(question);
      
      // Update node state to answer
      setNodes((prev) => prev.map((n) => n.id === nodeId ? {
        ...n,
        data: { question: result.question, answer: result.answer, state: 'answer', onAskFollowUp: handleAskFollowUpRef.current }
      } : n));
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
      setNodes((prev) => prev.map((n) => n.id === nodeId ? {
        ...n,
        data: { question, answer: 'Failed to fetch answer.', state: 'answer', onAskFollowUp: handleAskFollowUpRef.current }
      } : n));
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
  }, [askApi, addSuggestionChildren, setNodes, setEdges, moveSiblingsOutOfWay]);

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

  return (
    <div className={`flow-page ${isMenuOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
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

      {/* Top-right actions */}
      <div className="flow-page__actions">
        {isAuthenticated ? (
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
        onNodesChange={onNodesChange}
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
