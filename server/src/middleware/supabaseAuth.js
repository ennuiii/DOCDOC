import { supabaseAdmin } from '../config/supabase.js';

/**
 * Middleware to authenticate requests using Supabase Auth
 * Verifies JWT token and fetches user data with role information
 */
export const authenticateSupabase = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the JWT token with Supabase
    const { data: { user }, error } = await supabaseAdmin().auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Fetch user profile data from our users table
    const { data: userProfile, error: profileError } = await supabaseAdmin()
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !userProfile) {
      return res.status(401).json({
        success: false,
        message: 'User profile not found'
      });
    }

    // Check if user is active
    if (!userProfile.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Attach user info to request object
    req.user = {
      id: user.id,
      email: user.email,
      role: userProfile.role,
      profile: {
        firstName: userProfile.first_name,
        lastName: userProfile.last_name,
        phone: userProfile.phone,
        address: userProfile.address,
        specialization: userProfile.specialization,
        licenseNumber: userProfile.license_number,
        clinicName: userProfile.clinic_name,
        companyName: userProfile.company_name,
        companyRegistration: userProfile.company_registration,
        assignedDoctorId: userProfile.assigned_doctor_id
      },
      isActive: userProfile.is_active,
      isEmailVerified: userProfile.is_email_verified,
      lastLogin: userProfile.last_login,
      createdAt: userProfile.created_at,
      updatedAt: userProfile.updated_at
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication'
    });
  }
};

/**
 * Middleware to check if user has required role(s)
 * @param {string|string[]} roles - Required role(s)
 */
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

/**
 * Middleware to check if user can access specific doctor's data
 * For staff users, they can only access their assigned doctor's data
 */
export const requireDoctorAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const { role, profile } = req.user;
  const doctorId = req.params.doctorId || req.body.doctorId || req.query.doctorId;

  // Admins can access all data
  if (role === 'admin') {
    return next();
  }

  // Doctors can access their own data
  if (role === 'doctor' && req.user.id === doctorId) {
    return next();
  }

  // Staff can only access their assigned doctor's data
  if (role === 'staff' && profile.assignedDoctorId === doctorId) {
    return next();
  }

  // Pharma reps need specific appointment access (handled in appointment routes)
  if (role === 'pharma') {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied for this doctor\'s data'
  });
};

/**
 * Optional authentication middleware
 * Adds user info if token is present but doesn't fail if absent
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without user info
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin().auth.getUser(token);

    if (!error && user) {
      const { data: userProfile } = await supabaseAdmin()
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (userProfile && userProfile.is_active) {
        req.user = {
          id: user.id,
          email: user.email,
          role: userProfile.role,
          profile: {
            firstName: userProfile.first_name,
            lastName: userProfile.last_name,
            // ... other profile fields
          }
        };
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    next(); // Continue without user info
  }
}; 