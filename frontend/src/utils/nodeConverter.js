/** Utilities for converting between ReactFlow nodes and NodePayload format. */

/**
 * Convert ReactFlow node to NodePayload format.
 * @param {object} rfNode - ReactFlow node
 * @param {string} canvasId - Canvas ID
 * @param {string} ownerId - Owner ID
 * @returns {object} NodePayload
 */
export function reactFlowNodeToNodePayload(rfNode, canvasId, ownerId) {
  const data = rfNode.data || {};
  
  return {
    id: rfNode.id,
    canvas_id: canvasId,
    owner_id: ownerId,
    parent_id: data.parentId || null,
    depth: data.depth || 0,
    // CRITICAL: Explicitly set node_kind based on generationType and state
    // Root nodes (generationType === 'root') should always be 'turn'
    node_kind: data.generationType === 'root' ? 'turn' :
               data.state === 'suggestion' ? 'suggestion' : 'turn',
    generation_type: data.generationType || 'manual_followup',
    question: {
      text: data.question || '',
      language: 'en',
      source: data.questionSource || 'user',
    },
    answer: {
      text: data.answer || null,
      status: data.state === 'loading' ? 'pending' : 
              data.state === 'answer' ? 'ready' : 'idle',
      error_message: data.errorMessage || null,
    },
    position: {
      x: rfNode.position.x,
      y: rfNode.position.y,
    },
    size: {
      width: rfNode.width || 320,
      height: rfNode.height || 200,
    },
    llm: data.llm ? {
      model: data.llm.model || null,
      temperature: data.llm.temperature || null,
      max_tokens: data.llm.maxTokens || null,
      prompt_tokens: data.llm.promptTokens || null,
      completion_tokens: data.llm.completionTokens || null,
      total_tokens: data.llm.totalTokens || null,
      latency_ms: data.llm.latencyMs || null,
    } : null,
    evaluation: {
      user_rating: data.userRating || null,
      flags: data.flags || [],
    },
    status: 'final',
    revision: data.revision || 1,
    meta: data.meta || {},
    custom: data.custom || {},
  };
}

/**
 * Convert NodePayload to ReactFlow node format.
 * @param {object} nodePayload - NodePayload from backend
 * @returns {object} ReactFlow node
 */
export function nodePayloadToReactFlowNode(nodePayload) {
  const answer = nodePayload.answer || {};
  const question = nodePayload.question || {};
  
  // Determine state based on node_kind and answer status
  let state = 'suggestion';
  if (nodePayload.node_kind === 'turn') {
    if (answer.status === 'pending' || answer.status === 'idle') {
      state = 'loading';
    } else if (answer.status === 'ready' && answer.text) {
      state = 'answer';
    } else if (answer.status === 'error') {
      state = 'error';
    }
  }
  
  return {
    id: nodePayload.id,
    type: nodePayload.node_kind === 'suggestion' ? 'qa' : 'qa',
    position: {
      x: nodePayload.position?.x || 0,
      y: nodePayload.position?.y || 0,
    },
    data: {
      question: question.text || '',
      answer: answer.text || '',
      state: state,
      parentId: nodePayload.parent_id,
      depth: nodePayload.depth || 0,
      generationType: nodePayload.generation_type,
      questionSource: question.source || 'user',
      errorMessage: answer.error_message,
      images: nodePayload.images || [],
      llm: nodePayload.llm ? {
        model: nodePayload.llm.model,
        temperature: nodePayload.llm.temperature,
        maxTokens: nodePayload.llm.max_tokens,
        promptTokens: nodePayload.llm.prompt_tokens,
        completionTokens: nodePayload.llm.completion_tokens,
        totalTokens: nodePayload.llm.total_tokens,
        latencyMs: nodePayload.llm.latency_ms,
      } : null,
      userRating: nodePayload.evaluation?.user_rating,
      flags: nodePayload.evaluation?.flags || [],
      revision: nodePayload.revision || 1,
      meta: nodePayload.meta || {},
      custom: nodePayload.custom || {},
    },
    width: nodePayload.size?.width || 320,
    height: nodePayload.size?.height || 200,
  };
}

/**
 * Create a NodePatch from ReactFlow node changes.
 * @param {object} rfNode - ReactFlow node with changes
 * @param {string} canvasId - Canvas ID
 * @returns {object} NodePatch
 */
export function createNodePatch(rfNode, canvasId) {
  const data = rfNode.data || {};
  const patch = {
    id: rfNode.id,
    canvas_id: canvasId,
  };
  
  // Only include changed fields
  if (rfNode.position) {
    patch.position = {
      x: rfNode.position.x,
      y: rfNode.position.y,
    };
  }
  
  if (rfNode.width || rfNode.height) {
    patch.size = {
      width: rfNode.width || 320,
      height: rfNode.height || 200,
    };
  }
  
  if (data.question !== undefined) {
    patch.question = {
      text: data.question,
      language: 'en',
      source: data.questionSource || 'user',
    };
  }
  
  if (data.answer !== undefined || data.state !== undefined) {
    const status = data.state === 'loading' ? 'pending' : 
                   data.state === 'answer' ? 'ready' : 'idle';
    patch.answer = {
      text: data.answer || null,
      status: status,
      error_message: data.errorMessage || null,
    };
  }
  
  if (data.revision !== undefined) {
    patch.revision = data.revision;
  }
  
  if (data.meta !== undefined) {
    patch.meta = data.meta;
  }
  
  if (data.custom !== undefined) {
    patch.custom = data.custom;
  }
  
  return patch;
}

