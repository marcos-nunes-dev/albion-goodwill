const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Test database connection
prisma.$connect()
  .then(() => console.log('Database connected successfully!'))
  .catch((error) => {
    console.error('Database connection failed:', error);
    process.exit(1);
  });

module.exports = prisma; 