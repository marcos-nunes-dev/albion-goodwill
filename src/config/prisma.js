const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' }
  ],
});

prisma.$on('warn', (e) => {
  console.warn('Database warning:', e.message);
});

prisma.$on('error', (e) => {
  console.error('Database error:', e.message);
});

async function connectWithRetry(maxRetries = 5, delay = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await prisma.$connect();
      console.log('Database connected');
      return;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

connectWithRetry()
  .catch((error) => {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  });

module.exports = prisma; 