/**
 * AI Orchestrator Service
 * The BRAIN of the MCP Orchestration system
 * Analyzes input, selects MCPs, generates execution plans, and coordinates workflows
 */

import { recognizeIntent, describeIntent } from '../utils/intentRecognition';
import { generateExecutionPrompt, generateWorkflowMetadata } from '../utils/promptGenerator';
import mcpRouter from './MCPRouter';
import { MCP_TOOLS } from '../constants/mcpTools';

class AIOrchestrator {
  constructor() {
    this.activeWorkflows = new Map();
    this.workflowCallbacks = new Map();
  }

  /**
   * Main orchestration function
   * Processes user input and returns complete workflow response
   */
  async processUserInput(input, conversationHistory = [], callbacks = {}) {
    try {
      console.log('AI Orchestrator: Processing input:', input);

      // Step 1: Analyze intent
      const intent = await this.analyzeIntent(input, conversationHistory);
      console.log('AI Orchestrator: Intent recognized:', intent);

      // Step 2: Select MCPs
      const mcpSelection = this.selectMCPs(intent);
      console.log('AI Orchestrator: MCPs selected:', mcpSelection);

      // Step 3: Generate execution plan
      const executionPlan = this.generateExecutionPlan(intent, mcpSelection);
      console.log('AI Orchestrator: Execution plan generated');

      // Step 4: Execute workflow
      const result = await this.executeWorkflow(executionPlan, callbacks);
      console.log('AI Orchestrator: Workflow executed');

      // Step 5: Return formatted response
      return {
        success: true,
        response: result.message,
        workflow: executionPlan,
        mcpResults: result.data,
        intent,
        routing: mcpSelection,
      };
    } catch (error) {
      console.error('AI Orchestrator: Error processing input', error);

      return {
        success: false,
        error: error.message,
        response: `I encountered an error: ${error.message}. Please try rephrasing your request.`,
      };
    }
  }

  /**
   * Analyze user intent using intent recognition
   */
  async analyzeIntent(input, conversationHistory = []) {
    try {
      const intent = recognizeIntent(input, conversationHistory);

      // Enhance with conversation context if available
      if (conversationHistory.length > 0) {
        intent.conversationContext = this.extractConversationContext(conversationHistory);
      }

      return intent;
    } catch (error) {
      console.error('AI Orchestrator: Intent analysis failed', error);
      throw new Error('Failed to understand the request');
    }
  }

  /**
   * Extract relevant context from conversation history
   */
  extractConversationContext(conversationHistory) {
    const recentMessages = conversationHistory.slice(-5);

    return {
      previousIntents: recentMessages
        .filter(msg => msg.type === 'user')
        .map(msg => msg.content),
      previousActions: recentMessages
        .filter(msg => msg.mcpWorkflow)
        .map(msg => msg.mcpWorkflow.primaryMCP),
      hasOngoingConversation: conversationHistory.length > 0,
    };
  }

  /**
   * Select appropriate MCPs based on intent
   */
  selectMCPs(intent) {
    try {
      const routing = mcpRouter.route(intent);

      return {
        primary: routing.primary,
        secondary: routing.secondary,
        pattern: routing.pattern,
        confidence: routing.confidence,
        reasoning: routing.reasoning,
        metadata: routing.metadata,
      };
    } catch (error) {
      console.error('AI Orchestrator: MCP selection failed', error);
      throw new Error('Failed to select appropriate tools');
    }
  }

  /**
   * Generate execution plan following the framework
   */
  generateExecutionPlan(intent, mcpSelection) {
    try {
      const workflowId = this.generateWorkflowId();

      // Generate execution prompt
      const executionPrompt = generateExecutionPrompt(intent, mcpSelection);

      // Generate workflow metadata
      const metadata = generateWorkflowMetadata(intent, mcpSelection);

      // Create execution steps
      const steps = this.createExecutionSteps(intent, mcpSelection);

      // Build complete plan
      const plan = {
        id: workflowId,
        intent: describeIntent(intent),
        primaryMCP: mcpSelection.primary,
        secondaryMCPs: mcpSelection.secondary,
        pattern: mcpSelection.pattern,
        steps,
        parameters: this.extractParameters(intent),
        expectedOutput: this.generateExpectedOutput(intent, mcpSelection),
        fallbackStrategy: this.generateFallbackStrategy(intent, mcpSelection),
        status: 'pending',
        confidence: mcpSelection.confidence,
        metadata,
        executionPrompt,
        createdAt: new Date().toISOString(),
      };

      return plan;
    } catch (error) {
      console.error('AI Orchestrator: Plan generation failed', error);
      throw new Error('Failed to generate execution plan');
    }
  }

  /**
   * Create detailed execution steps
   */
  createExecutionSteps(intent, mcpSelection) {
    const steps = [];
    const { primary, secondary, pattern } = mcpSelection;

    // Add primary MCP steps
    const primarySteps = this.generateMCPSteps(primary, intent);
    steps.push(...primarySteps);

    // Add secondary MCP steps based on pattern
    if (secondary && secondary.length > 0) {
      if (pattern === 'sequential') {
        secondary.forEach(mcpId => {
          const secondarySteps = this.generateMCPSteps(mcpId, intent);
          steps.push(...secondarySteps);
        });
      } else if (pattern === 'parallel') {
        steps.push({
          id: this.generateStepId(),
          description: `Execute in parallel: ${secondary.join(', ')}`,
          mcps: secondary,
          status: 'pending',
          type: 'parallel',
        });
      }
    }

    // Add verification step
    steps.push({
      id: this.generateStepId(),
      description: 'Verify execution and confirm results',
      mcp: primary,
      status: 'pending',
      type: 'verification',
    });

    return steps;
  }

  /**
   * Generate specific steps for an MCP
   */
  generateMCPSteps(mcpId, intent) {
    const steps = [];
    const mcp = Object.values(MCP_TOOLS).find(t => t.id === mcpId);
    const mcpName = mcp ? mcp.name : mcpId;

    // Generic steps based on action type
    const { actionType, targetObject } = intent;

    if (actionType === 'send') {
      steps.push({
        id: this.generateStepId(),
        description: `Use ${mcpName} to compose ${targetObject}`,
        mcp: mcpId,
        status: 'pending',
        type: 'compose',
      });
      steps.push({
        id: this.generateStepId(),
        description: `Send ${targetObject} via ${mcpName}`,
        mcp: mcpId,
        status: 'pending',
        type: 'send',
      });
    } else if (actionType === 'schedule') {
      steps.push({
        id: this.generateStepId(),
        description: `Check availability in ${mcpName}`,
        mcp: mcpId,
        status: 'pending',
        type: 'check',
      });
      steps.push({
        id: this.generateStepId(),
        description: `Create event in ${mcpName}`,
        mcp: mcpId,
        status: 'pending',
        type: 'create',
      });
      steps.push({
        id: this.generateStepId(),
        description: `Send invites via ${mcpName}`,
        mcp: mcpId,
        status: 'pending',
        type: 'notify',
      });
    } else if (actionType === 'create') {
      steps.push({
        id: this.generateStepId(),
        description: `Create ${targetObject} in ${mcpName}`,
        mcp: mcpId,
        status: 'pending',
        type: 'create',
      });
      steps.push({
        id: this.generateStepId(),
        description: `Save and finalize ${targetObject}`,
        mcp: mcpId,
        status: 'pending',
        type: 'finalize',
      });
    } else {
      // Generic steps
      steps.push({
        id: this.generateStepId(),
        description: `Use ${mcpName} to ${actionType} ${targetObject}`,
        mcp: mcpId,
        status: 'pending',
        type: 'execute',
      });
    }

    return steps;
  }

  /**
   * Extract parameters from intent
   */
  extractParameters(intent) {
    const parameters = {};

    if (intent.context.people && intent.context.people.length > 0) {
      parameters.recipients = intent.context.people;
    }

    if (intent.context.dates && intent.context.dates.length > 0) {
      parameters.date = intent.context.dates[0].value;
    }

    if (intent.context.times && intent.context.times.length > 0) {
      parameters.time = intent.context.times[0].value;
    }

    if (intent.context.topics && intent.context.topics.length > 0) {
      parameters.subject = intent.context.topics[0];
    }

    parameters.userInput = intent.raw;

    return parameters;
  }

  /**
   * Generate expected output
   */
  generateExpectedOutput(intent, mcpSelection) {
    const { actionType } = intent;

    const outputs = {
      send: 'Message/email sent successfully with confirmation',
      schedule: 'Event created and invites sent',
      create: 'Item created and saved successfully',
      search: 'Relevant results found and compiled',
      order: 'Order placed with tracking information',
      control: 'Device state changed successfully',
      read: 'Information retrieved and formatted',
    };

    return outputs[actionType] || 'Operation completed successfully';
  }

  /**
   * Generate fallback strategy
   */
  generateFallbackStrategy(intent, mcpSelection) {
    const { primary, secondary } = mcpSelection;

    const strategies = [];

    if (secondary && secondary.length > 0) {
      strategies.push(`Try ${secondary[0]} if ${primary} fails`);
    }

    strategies.push('Prompt user for manual intervention if automated attempts fail');
    strategies.push('Save task for retry later if persistent failures occur');

    return strategies.join('; ');
  }

  /**
   * Execute workflow with progress tracking
   */
  async executeWorkflow(plan, callbacks = {}) {
    const workflowId = plan.id;
    this.activeWorkflows.set(workflowId, plan);
    this.workflowCallbacks.set(workflowId, callbacks);

    try {
      // Update workflow status
      plan.status = 'in_progress';
      this.notifyWorkflowUpdate(workflowId, plan, callbacks);

      // Execute steps
      const results = [];

      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];

        // Update step status
        step.status = 'in_progress';
        this.notifyStepUpdate(workflowId, i, step, callbacks);

        // Simulate execution (replace with actual MCP API calls)
        const stepResult = await this.executeStep(step, plan);

        // Update step status
        step.status = stepResult.success ? 'completed' : 'failed';
        step.result = stepResult.data;
        step.completedAt = new Date().toISOString();

        this.notifyStepUpdate(workflowId, i, step, callbacks);

        results.push(stepResult);

        // If step failed and no fallback, stop execution
        if (!stepResult.success && !plan.fallbackStrategy) {
          throw new Error(`Step ${i + 1} failed: ${stepResult.error}`);
        }
      }

      // Mark workflow as completed
      plan.status = 'completed';
      plan.completedAt = new Date().toISOString();
      this.notifyWorkflowUpdate(workflowId, plan, callbacks);

      // Generate response message
      const message = this.generateResponseMessage(plan, results);

      return {
        success: true,
        message,
        data: results,
      };
    } catch (error) {
      console.error('AI Orchestrator: Workflow execution failed', error);

      plan.status = 'failed';
      plan.error = error.message;
      plan.completedAt = new Date().toISOString();

      this.notifyWorkflowUpdate(workflowId, plan, callbacks);

      return {
        success: false,
        message: `Workflow failed: ${error.message}`,
        error: error.message,
      };
    } finally {
      // Cleanup
      this.activeWorkflows.delete(workflowId);
      this.workflowCallbacks.delete(workflowId);
    }
  }

  /**
   * Execute a single step
   * This is where actual MCP API calls would be made
   * For now, it's simulated
   */
  async executeStep(step, plan) {
    // Simulate execution time
    await this.delay(1000);

    // TODO: Replace with actual MCP API calls
    // This is where you would call the specific MCP based on step.mcp

    // Simulate success (90% success rate)
    const success = Math.random() > 0.1;

    if (success) {
      return {
        success: true,
        data: {
          stepId: step.id,
          description: step.description,
          result: `${step.description} - completed successfully`,
          timestamp: new Date().toISOString(),
        },
      };
    } else {
      return {
        success: false,
        error: 'Simulated failure',
      };
    }
  }

  /**
   * Generate human-readable response message
   */
  generateResponseMessage(plan, results) {
    const { intent, primaryMCP, status } = plan;

    if (status === 'completed') {
      const mcpName = Object.values(MCP_TOOLS).find(t => t.id === primaryMCP)?.name || primaryMCP;

      return `✓ I've ${intent} using ${mcpName}. ${plan.expectedOutput}`;
    } else {
      return `I encountered an issue while trying to ${intent}.`;
    }
  }

  /**
   * Notify workflow update
   */
  notifyWorkflowUpdate(workflowId, plan, callbacks) {
    if (callbacks.onWorkflowUpdate) {
      callbacks.onWorkflowUpdate(plan);
    }
  }

  /**
   * Notify step update
   */
  notifyStepUpdate(workflowId, stepIndex, step, callbacks) {
    if (callbacks.onStepUpdate) {
      callbacks.onStepUpdate(stepIndex, step);
    }
  }

  /**
   * Generate unique workflow ID
   */
  generateWorkflowId() {
    return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique step ID
   */
  generateStepId() {
    return `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Utility: delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get active workflows
   */
  getActiveWorkflows() {
    return Array.from(this.activeWorkflows.values());
  }

  /**
   * Get workflow by ID
   */
  getWorkflow(workflowId) {
    return this.activeWorkflows.get(workflowId);
  }

  /**
   * Cancel workflow
   */
  async cancelWorkflow(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);

    if (workflow) {
      workflow.status = 'cancelled';
      workflow.completedAt = new Date().toISOString();

      this.activeWorkflows.delete(workflowId);
      this.workflowCallbacks.delete(workflowId);

      return true;
    }

    return false;
  }
}

// Export singleton instance
const aiOrchestrator = new AIOrchestrator();
export default aiOrchestrator;
