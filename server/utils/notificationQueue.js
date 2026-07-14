const whatsappService = require('./whatsapp');

class NotificationQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  /**
   * Enqueues a notification to be sent.
   * @param {string} to - Recipient number
   * @param {string} message - Message body
   * @param {string} type - 'whatsapp' or 'sms'
   */
  enqueue(to, message, type = 'whatsapp') {
    this.queue.push({
      to,
      message,
      type,
      attempts: 0,
      nextAttemptTime: Date.now()
    });
    
    // Start processing in background if not already processing
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    console.log('[NOTIFICATION QUEUE] Started processing background tasks.');

    while (this.queue.length > 0) {
      const now = Date.now();
      const currentItemIndex = this.queue.findIndex(item => item.nextAttemptTime <= now);

      if (currentItemIndex === -1) {
        // Find the next time we need to wait until
        const nextTime = Math.min(...this.queue.map(item => item.nextAttemptTime));
        const waitMs = Math.max(1000, nextTime - now);
        
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }

      const item = this.queue[currentItemIndex];
      this.queue.splice(currentItemIndex, 1);

      try {
        item.attempts++;
        console.log(`[NOTIFICATION QUEUE] Attempt ${item.attempts} for ${item.to}`);
        
        await whatsappService.sendMessage(item.to, item.message);
        console.log(`[NOTIFICATION QUEUE] Sent notification successfully to ${item.to}`);
      } catch (err) {
        console.error(`[NOTIFICATION QUEUE] Attempt ${item.attempts} failed for ${item.to}: ${err.message}`);
        
        if (item.attempts < 3) {
          item.nextAttemptTime = Date.now() + 30000; // 30s delay
          this.queue.push(item);
          console.log(`[NOTIFICATION QUEUE] Re-queued task for retry in 30s. Target: ${item.to}`);
        } else {
          console.error(`[NOTIFICATION QUEUE] Permanent notification failure to ${item.to} after 3 attempts.`);
        }
      }
    }

    this.isProcessing = false;
    console.log('[NOTIFICATION QUEUE] Finished processing background tasks.');
  }
}

module.exports = new NotificationQueue();
