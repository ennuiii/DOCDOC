import User from '../models/User.js';
import { generateAuthTokens, verifyToken } from '../utils/jwt.js';
import { authConfig } from '../config/auth.js';
import bcrypt from 'bcryptjs';

// Mock users data for testing without database
const MOCK_USERS = [
  {
    _id: '507f1f77bcf86cd799439011',
    email: 'doctor@test.com',
    password: '$2a$10$YKtH1J5Jw8Xo5zV5JQZQK.VhUQlJz5cB5yXHpBKnKm3mDpWqGqOHO', // password: doctor123
    name: 'Dr. John Smith',
    role: 'doctor',
    isActive: true,
    isEmailVerified: true,
    specialization: 'Cardiology',
    licenseNumber: 'DOC123456',
    clinicName: 'Heart Care Clinic',
    clinicAddress: '123 Medical St, Healthcare City',
    phone: '+1234567890',
    createdAt: new Date('2024-01-01'),
    permissions: ['manage_timeslots', 'view_appointments', 'manage_staff']
  },
  {
    _id: '507f1f77bcf86cd799439012',
    email: 'pharma@test.com',
    password: '$2a$10$YKtH1J5Jw8Xo5zV5JQZQK.VhUQlJz5cB5yXHpBKnKm3mDpWqGqOHO', // password: pharma123
    name: 'Jane Wilson',
    role: 'pharma',
    isActive: true,
    isEmailVerified: true,
    companyName: 'PharmaCorp International',
    companyRegistration: 'PC123456789',
    companyAddress: '456 Pharma Avenue, Business District',
    createdAt: new Date('2024-01-01'),
    permissions: ['book_appointments', 'upload_research', 'share_research']
  },
  {
    _id: '507f1f77bcf86cd799439013',
    email: 'admin@test.com',
    password: '$2a$10$YKtH1J5Jw8Xo5zV5JQZQK.VhUQlJz5cB5yXHpBKnKm3mDpWqGqOHO', // password: admin123
    name: 'Admin User',
    role: 'admin',
    isActive: true,
    isEmailVerified: true,
    createdAt: new Date('2024-01-01'),
    permissions: ['all']
  }
];

// Helper function to check if we're in mock mode
const isMockMode = () => {
  return process.env.USE_MOCK_DATA === 'true' || !process.env.MONGODB_URI;
};

// Mock user methods
const mockFindByCredentials = async (email, password) => {
  const user = MOCK_USERS.find(u => u.email === email);
  if (!user) {
    throw new Error('Invalid credentials');
  }
  
  // For mock data, we'll use simple password comparison
  const validPasswords = {
    'doctor@test.com': 'doctor123',
    'pharma@test.com': 'pharma123',
    'admin@test.com': 'admin123'
  };
  
  if (validPasswords[email] !== password) {
    throw new Error('Invalid credentials');
  }
  
  return user;
};

// Register new user
export const register = async (req, res) => {
  try {
    const { email, password, role, name, ...roleSpecificData } = req.body;
    
    // Check if we're in mock mode
    if (isMockMode()) {
      // Check if user already exists in mock data
      const existingUser = MOCK_USERS.find(u => u.email === email);
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      
      // Create mock user
      const newUser = {
        _id: Date.now().toString(),
        email,
        password: await bcrypt.hash(password, 10),
        name,
        role,
        isActive: true,
        isEmailVerified: true,
        createdAt: new Date(),
        ...roleSpecificData,
        permissions: role === 'doctor' ? ['manage_timeslots', 'view_appointments', 'manage_staff'] :
                     role === 'pharma' ? ['book_appointments', 'upload_research', 'share_research'] :
                     []
      };
      
      // Add to mock users
      MOCK_USERS.push(newUser);
      
      // Generate tokens
      const tokens = generateAuthTokens(newUser);
      
      return res.status(201).json({
        message: 'Registration successful (mock mode)',
        user: newUser,
        tokens
      });
    }
    
    // Original database logic
    const { profile } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Validate role-specific fields
    if (role === 'doctor' && (!profile.specialization || !profile.licenseNumber || !profile.clinicName)) {
      return res.status(400).json({ 
        error: 'Specialization, license number, and clinic name are required for doctors' 
      });
    }
    
    if (role === 'pharma' && (!profile.companyName || !profile.companyRegistration)) {
      return res.status(400).json({ 
        error: 'Company name and registration are required for pharma users' 
      });
    }
    
    if (role === 'staff' && !profile.assignedDoctor) {
      return res.status(400).json({ 
        error: 'Assigned doctor is required for staff members' 
      });
    }
    
    // Create new user
    const user = new User({
      email,
      password,
      role,
      profile
    });
    
    await user.save();
    
    // Generate tokens
    const tokens = generateAuthTokens(user);
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    res.status(201).json({
      message: 'Registration successful',
      user,
      tokens
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Registration failed', 
      details: error.message 
    });
  }
};

// Login user
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    let user;
    
    // Use mock data if in mock mode
    if (isMockMode()) {
      user = await mockFindByCredentials(email, password);
    } else {
      // Find user and verify credentials from database
      user = await User.findByCredentials(email, password);
      
      // Check if account is active
      if (!user.isActive) {
        return res.status(401).json({ error: 'Account is deactivated' });
      }
      
      // Update last login
      user.lastLogin = new Date();
      await user.save();
    }
    
    // Generate tokens
    const tokens = generateAuthTokens(user);
    
    res.json({
      message: 'Login successful',
      user,
      tokens
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({ 
      error: 'Invalid login credentials' 
    });
  }
};

// Refresh token
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }
    
    // Verify refresh token
    const decoded = verifyToken(refreshToken);
    
    let user;
    
    if (isMockMode()) {
      // Get user from mock data
      user = MOCK_USERS.find(u => u._id === decoded.id);
      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }
    } else {
      // Get user from database
      user = await User.findById(decoded.id);
      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }
    }
    
    // Generate new tokens
    const tokens = generateAuthTokens(user);
    
    res.json({
      message: 'Token refreshed successfully',
      tokens
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ 
      error: 'Invalid or expired refresh token' 
    });
  }
};

// Logout (optional - for token blacklisting if implemented)
export const logout = async (req, res) => {
  try {
    // In a production app, you might want to blacklist the token here
    // For now, we'll just return success and let the client remove the token
    res.json({
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      error: 'Logout failed' 
    });
  }
};

// Get current user
export const getMe = async (req, res) => {
  try {
    let user;
    
    if (isMockMode()) {
      // Find user in mock data
      user = MOCK_USERS.find(u => u._id === req.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
    } else {
      // Find user in database
      user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
    }
    
    res.json({
      user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      error: 'Failed to get user information' 
    });
  }
};

// Verify email (optional implementation)
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }
    
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();
    
    res.json({
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ 
      error: 'Email verification failed' 
    });
  }
}; 