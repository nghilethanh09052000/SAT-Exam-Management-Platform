import { QueueClient } from '@vercel/queue'

export const queueClient = new QueueClient({
  region: process.env.VERCEL_REGION || 'iad1',
})

export const sendQueueMessage = queueClient.send
export const handleQueueCallback = queueClient.handleCallback

