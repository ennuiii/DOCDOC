const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // Will be useful for frontend-backend communication

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5001; // Backend port

// Environment variable for MongoDB URI (best practice)
// Fallback to local MongoDB instance if not set
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/pharma_doctor_app';

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(express.json()); // To parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // To parse URL-encoded request bodies

// Database Connection
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected successfully.'))
    .catch(err => {
        console.error('MongoDB Connection Error:', err.message);
        // Exit process with failure in case of DB connection error during startup
        process.exit(1);
    });

// Basic Route for testing
app.get('/', (req, res) => {
    res.send('Pharma-Doctor App Backend is running!');
});

// API Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const pharmaRoutes = require('./routes/pharmaRoutes');
// const staffRoutes = require('./routes/staffRoutes');   // Placeholder for future

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes); // Mount user routes
app.use('/api/doctors', doctorRoutes); // Mount doctor routes
app.use('/api/pharma', pharmaRoutes); // Mount pharma routes
// app.use('/api/staff', staffRoutes);


// Global error handler (basic example)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({ message: 'Something broke!', error: err.message });
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app; // Export for potential testing
