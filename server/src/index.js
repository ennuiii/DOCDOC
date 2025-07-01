// Load environment variables FIRST
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure dotenv before any other imports
dotenv.config({ path: join(__dirname, '../.env') });

// Now import everything else
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import mongoose from 'mongoose';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import timeslotRoutes from './routes/timeslots.js';
import appointmentRoutes from './routes/appointments.js';
import researchRoutes from './routes/research.js';
import notificationRoutes from './routes/notifications.js';
import integrationRoutes from './routes/integrations.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';

// Create Express app
const app = express();

// Database connection with error handling
const connectDB = async () => {
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log('MongoDB connected successfully');
    } else {
      console.log('⚠️  No MongoDB URI provided - running in mock data mode');
      console.log('📝 Test credentials:');
      console.log('   - Doctor: doctor@test.com / doctor123');
      console.log('   - Pharma: pharma@test.com / pharma123');
      console.log('   - Admin: admin@test.com / admin123');
    }
  } catch (err) {
    console.error('MongoDB connection error:', err);
    console.log('⚠️  Failed to connect to MongoDB - running in mock data mode');
    console.log('📝 Test credentials:');
    console.log('   - Doctor: doctor@test.com / doctor123');
    console.log('   - Pharma: pharma@test.com / pharma123');
    console.log('   - Admin: admin@test.com / admin123');
  }
};

// Connect to database
connectDB();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(join(__dirname, '../../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/timeslots', timeslotRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/integrations', integrationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../../client/dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../../client/dist/index.html'));
  });
}

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
}); 