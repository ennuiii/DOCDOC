/**
 * Webhook Queue Service
 * Manages asynchronous processing of webhook events using a priority queue system
 */

const { createClient } = require('@supabase/supabase-js');
const EventEmitter = require('events');

class WebhookQueueService extends EventEmitter {
  constructor() {
    super();
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Queue configuration
    this.queues = {
      high: [],
      medium: [],
      low: []
    };
    
    this.processing = false;
    this.maxConcurrency = 5;
    this.currentJobs = new Map();
    
    // Processing intervals
    this.processingInterval = 5000; // 5 seconds
    this.retryInterval = 30000; // 30 seconds
    this.cleanupInterval = 3600000; // 1 hour
    
    // Initialize queue processing
    this.initializeQueueProcessing();
  }

  /**
   * Initialize queue processing intervals
   */
  initializeQueueProcessing() {
    setInterval(() => {
      this.processQueue();
    }, this.processingInterval);
    
    setInterval(() => {
      this.retryFailedJobs();
    }, this.retryInterval);
    
    setInterval(() => {
      this.cleanupCompletedJobs();
    }, this.cleanupInterval);
  }

  /**
   * Queue a sync operation
   */
  async queueSync(options) {
    const job = {
      id: this.generateJobId(),
      type: 'sync',
      provider: options.provider,
      integrationId: options.integrationId,
      userId: options.userId,
      eventType: options.eventType,
      priority: options.priority || 'medium',
      webhookId: options.webhookId,
      metadata: {
        resourceId: options.resourceId,
        resourceUri: options.resourceUri,
        subscriptionId: options.subscriptionId,
        resource: options.resource,
        changeType: options.changeType,
        calendarUrl: options.calendarUrl,
        eventUid: options.eventUid,
        etag: options.etag
      },
      status: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0,
      maxAttempts: 3
    };
    
    // Store in database
    await this.storeJob(job);
    
    // Add to in-memory queue
    this.addJobToQueue(job);
    
    console.log(`[Queue] Sync job queued: ${job.id} (${job.provider}, priority: ${job.priority})`);
    
    return job;
  }

  /**
   * Queue a meeting event
   */
  async queueMeetingEvent(options) {
    const job = {
      id: this.generateJobId(),
      type: 'meeting_event',
      provider: options.provider,
      appointmentId: options.appointmentId,
      meetingId: options.meetingId,
      eventType: options.eventType,
      priority: options.priority || 'high',
      webhookId: options.webhookId,
      metadata: {
        eventData: options.eventData
      },
      status: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0,
      maxAttempts: 3
    };
    
    // Store in database
    await this.storeJob(job);
    
    // Add to in-memory queue
    this.addJobToQueue(job);
    
    console.log(`[Queue] Meeting event job queued: ${job.id} (${job.eventType}, priority: ${job.priority})`);
    
    return job;
  }

  /**
   * Add job to appropriate priority queue
   */
  addJobToQueue(job) {
    const priority = job.priority || 'medium';
    if (!this.queues[priority]) {
      this.queues[priority] = [];
    }
    
    this.queues[priority].push(job);
    
    // Sort by creation time (oldest first)
    this.queues[priority].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  /**
   * Process the queue
   */
  async processQueue() {
    if (this.processing || this.currentJobs.size >= this.maxConcurrency) {
      return;
    }
    
    this.processing = true;
    
    try {
      // Process high priority first, then medium, then low
      const priorities = ['high', 'medium', 'low'];
      
      for (const priority of priorities) {
        if (this.currentJobs.size >= this.maxConcurrency) {
          break;
        }
        
        const queue = this.queues[priority];
        while (queue.length > 0 && this.currentJobs.size < this.maxConcurrency) {
          const job = queue.shift();
          this.processJob(job);
        }
      }
      
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process individual job
   */
  async processJob(job) {
    this.currentJobs.set(job.id, job);
    
    try {
      console.log(`[Queue] Processing job: ${job.id} (${job.type})`);
      
      // Update job status to processing
      await this.updateJobStatus(job.id, 'processing');
      
      // Process based on job type
      let result;
      switch (job.type) {
        case 'sync':
          result = await this.processSyncJob(job);
          break;
        case 'meeting_event':
          result = await this.processMeetingEventJob(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }
      
      // Mark as completed
      await this.updateJobStatus(job.id, 'completed', result);
      
      console.log(`[Queue] Job completed: ${job.id}`);
      
      // Emit success event
      this.emit('job_completed', { job, result });
      
    } catch (error) {
      console.error(`[Queue] Job failed: ${job.id}`, error);
      
      job.attempts++;
      
      if (job.attempts >= job.maxAttempts) {
        // Max attempts reached, mark as failed
        await this.updateJobStatus(job.id, 'failed', { error: error.message });
        this.emit('job_failed', { job, error });
      } else {
        // Retry later
        await this.updateJobStatus(job.id, 'retry', { error: error.message, nextRetry: new Date(Date.now() + 60000).toISOString() });
        this.emit('job_retry', { job, error });
      }
      
    } finally {
      this.currentJobs.delete(job.id);
    }
  }

  /**
   * Process sync job
   */
  async processSyncJob(job) {
    const { provider, integrationId, eventType } = job;
    
    // Import services dynamically to avoid circular dependencies
    const { GoogleCalendarSyncService } = require('./GoogleCalendarSyncService');
    const { OutlookCalendarSyncService } = require('./OutlookCalendarSyncService');
    const { CalDAVSyncService } = require('./CalDAVSyncService');
    
    let syncService;
    
    switch (provider) {
      case 'google_calendar':
        syncService = new GoogleCalendarSyncService();
        break;
      case 'microsoft_graph':
        syncService = new OutlookCalendarSyncService();
        break;
      case 'caldav':
        syncService = new CalDAVSyncService();
        break;
      default:
        throw new Error(`Unsupported sync provider: ${provider}`);
    }
    
    // Get integration details
    const integration = await this.getIntegration(integrationId);
    if (!integration) {
      throw new Error(`Integration not found: ${integrationId}`);
    }
    
    // Perform sync
    const syncResult = await syncService.performIncrementalSync(integration);
    
    return {
      provider,
      integrationId,
      eventType,
      syncResult
    };
  }

  /**
   * Process meeting event job
   */
  async processMeetingEventJob(job) {
    const { provider, appointmentId, meetingId, eventType, metadata } = job;
    
    // Update appointment based on meeting event
    const updateData = this.getMeetingEventUpdateData(eventType, metadata.eventData);
    
    if (updateData) {
      const { error } = await this.supabase
        .from('appointments')
        .update(updateData)
        .eq('id', appointmentId);
      
      if (error) {
        throw error;
      }
    }
    
    // Log the event
    await this.logMeetingEvent(appointmentId, eventType, metadata.eventData);
    
    return {
      provider,
      appointmentId,
      meetingId,
      eventType,
      updated: !!updateData
    };
  }

  /**
   * Get meeting event update data
   */
  getMeetingEventUpdateData(eventType, eventData) {
    const now = new Date().toISOString();
    
    switch (eventType) {
      case 'zoom.meeting.started':
        return {
          status: 'in_progress',
          started_at: now,
          integration_data: { meeting_started: true, event_data: eventData }
        };
      
      case 'zoom.meeting.ended':
        return {
          status: 'completed',
          ended_at: now,
          integration_data: { meeting_ended: true, event_data: eventData }
        };
      
      case 'zoom.participant.joined':
        return {
          integration_data: { 
            last_participant_joined: now,
            participant_count: eventData.participant?.user_name ? 1 : 0,
            event_data: eventData
          }
        };
      
      case 'zoom.participant.left':
        return {
          integration_data: {
            last_participant_left: now,
            event_data: eventData
          }
        };
      
      default:
        return null;
    }
  }

  /**
   * Log meeting event
   */
  async logMeetingEvent(appointmentId, eventType, eventData) {
    const { error } = await this.supabase
      .from('appointment_logs')
      .insert({
        appointment_id: appointmentId,
        event_type: eventType,
        event_data: eventData,
        created_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Error logging meeting event:', error);
    }
  }

  /**
   * Store job in database
   */
  async storeJob(job) {
    const { error } = await this.supabase
      .from('webhook_jobs')
      .insert({
        id: job.id,
        type: job.type,
        provider: job.provider,
        integration_id: job.integrationId,
        appointment_id: job.appointmentId,
        meeting_id: job.meetingId,
        event_type: job.eventType,
        priority: job.priority,
        webhook_id: job.webhookId,
        metadata: job.metadata,
        status: job.status,
        attempts: job.attempts,
        max_attempts: job.maxAttempts,
        created_at: job.createdAt
      });
    
    if (error) {
      console.error('Error storing job:', error);
      throw error;
    }
  }

  /**
   * Update job status
   */
  async updateJobStatus(jobId, status, result = null) {
    const updateData = {
      status,
      updated_at: new Date().toISOString()
    };
    
    if (result) {
      updateData.result = result;
    }
    
    const { error } = await this.supabase
      .from('webhook_jobs')
      .update(updateData)
      .eq('id', jobId);
    
    if (error) {
      console.error('Error updating job status:', error);
      throw error;
    }
  }

  /**
   * Get integration details
   */
  async getIntegration(integrationId) {
    const { data, error } = await this.supabase
      .from('calendar_integrations')
      .select('*')
      .eq('id', integrationId)
      .single();
    
    if (error) {
      console.error('Error fetching integration:', error);
      return null;
    }
    
    return data;
  }

  /**
   * Retry failed jobs
   */
  async retryFailedJobs() {
    const { data: failedJobs, error } = await this.supabase
      .from('webhook_jobs')
      .select('*')
      .eq('status', 'retry')
      .lte('next_retry', new Date().toISOString())
      .limit(10);
    
    if (error) {
      console.error('Error fetching failed jobs for retry:', error);
      return;
    }
    
    for (const job of failedJobs || []) {
      // Add back to queue
      this.addJobToQueue(job);
      console.log(`[Queue] Retrying job: ${job.id} (attempt ${job.attempts + 1})`);
    }
  }

  /**
   * Cleanup completed jobs
   */
  async cleanupCompletedJobs() {
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24 hours ago
    
    const { error } = await this.supabase
      .from('webhook_jobs')
      .delete()
      .in('status', ['completed', 'failed'])
      .lt('updated_at', cutoffDate);
    
    if (error) {
      console.error('Error cleaning up completed jobs:', error);
    } else {
      console.log('[Queue] Cleaned up old completed jobs');
    }
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    return {
      queues: {
        high: this.queues.high.length,
        medium: this.queues.medium.length,
        low: this.queues.low.length
      },
      processing: this.currentJobs.size,
      maxConcurrency: this.maxConcurrency
    };
  }

  /**
   * Get health status
   */
  async getHealthStatus() {
    try {
      const stats = this.getQueueStats();
      const totalQueued = stats.queues.high + stats.queues.medium + stats.queues.low;
      
      // Check if queue is overwhelmed
      const isOverwhelmed = totalQueued > 100 || stats.processing >= this.maxConcurrency;
      
      return {
        healthy: !isOverwhelmed,
        stats,
        message: isOverwhelmed ? 'Queue is overwhelmed' : 'Queue is healthy'
      };
    } catch (error) {
      return {
        healthy: false,
        message: error.message
      };
    }
  }

  /**
   * Generate unique job ID
   */
  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Shutdown queue service
   */
  async shutdown() {
    console.log('Shutting down webhook queue service...');
    
    // Wait for current jobs to complete (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.currentJobs.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (this.currentJobs.size > 0) {
      console.warn(`[Queue] Shutdown timeout reached, ${this.currentJobs.size} jobs still processing`);
    }
    
    console.log('Webhook queue service shutdown complete');
  }
}

module.exports = { WebhookQueueService }; 