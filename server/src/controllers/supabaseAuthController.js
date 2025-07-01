import { supabaseAdmin, supabaseClient } from '../config/supabase.js';
import bcrypt from 'bcryptjs';

/**
 * Register a new user
 */
export const register = async (req, res) => {
  try {
    const {
      email,
      password,
      role,
      firstName,
      lastName,
      phone,
      address,
      // Role-specific fields
      specialization,
      licenseNumber,
      clinicName,
      companyName,
      companyRegistration,
      assignedDoctorId
    } = req.body;

    // Validate required fields based on role
    const requiredValidation = validateRoleRequiredFields(role, req.body);
    if (!requiredValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: requiredValidation.message
      });
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // We'll handle email verification separately
      user_metadata: {
        firstName,
        lastName,
        role
      }
    });

    if (authError) {
      console.error('Supabase auth error:', authError);
      return res.status(400).json({
        success: false,
        message: authError.message || 'Failed to create user account'
      });
    }

    // Hash password for our users table (additional security layer)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user profile in our users table
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .insert([
        {
          id: authData.user.id,
          email: email.toLowerCase(),
          password_hash: passwordHash,
          role,
          first_name: firstName,
          last_name: lastName,
          phone,
          address: address || {},
          specialization: role === 'doctor' ? specialization : null,
          license_number: role === 'doctor' ? licenseNumber : null,
          clinic_name: role === 'doctor' ? clinicName : null,
          company_name: role === 'pharma' ? companyName : null,
          company_registration: role === 'pharma' ? companyRegistration : null,
          assigned_doctor_id: role === 'staff' ? assignedDoctorId : null,
          is_active: true,
          is_email_verified: false
        }
      ])
      .select()
      .single();

    if (profileError) {
      console.error('Profile creation error:', profileError);
      
      // Clean up auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      
      return res.status(400).json({
        success: false,
        message: 'Failed to create user profile'
      });
    }

    // Generate email verification token
    const { error: emailError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email for verification.',
      data: {
        user: {
          id: userProfile.id,
          email: userProfile.email,
          role: userProfile.role,
          profile: {
            firstName: userProfile.first_name,
            lastName: userProfile.last_name,
            phone: userProfile.phone,
            address: userProfile.address
          },
          isEmailVerified: userProfile.is_email_verified,
          createdAt: userProfile.created_at
        }
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration'
    });
  }
};

/**
 * Login user
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Authenticate with Supabase
    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
      email: email.toLowerCase(),
      password
    });

    if (authError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid login credentials'
      });
    }

    // Get user profile
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', authData.user.id)
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

    // Update last login
    await supabaseAdmin
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', authData.user.id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: userProfile.id,
          email: userProfile.email,
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
          lastLogin: userProfile.last_login
        },
        session: authData.session,
        accessToken: authData.session.access_token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login'
    });
  }
};

/**
 * Logout user
 */
export const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // Sign out from Supabase
      await supabaseAdmin.auth.admin.signOut(token);
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during logout'
    });
  }
};

/**
 * Get current user profile
 */
export const getProfile = async (req, res) => {
  try {
    const user = req.user; // Set by authentication middleware

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Update user profile
 */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      firstName,
      lastName,
      phone,
      address,
      specialization,
      licenseNumber,
      clinicName,
      companyName,
      companyRegistration
    } = req.body;

    const updateData = {
      first_name: firstName,
      last_name: lastName,
      phone,
      address,
      updated_at: new Date().toISOString()
    };

    // Add role-specific fields based on user's role
    const { role } = req.user;
    if (role === 'doctor') {
      updateData.specialization = specialization;
      updateData.license_number = licenseNumber;
      updateData.clinic_name = clinicName;
    } else if (role === 'pharma') {
      updateData.company_name = companyName;
      updateData.company_registration = companyRegistration;
    }

    const { data: updatedProfile, error } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Profile update error:', error);
      return res.status(400).json({
        success: false,
        message: 'Failed to update profile'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: updatedProfile.id,
          email: updatedProfile.email,
          role: updatedProfile.role,
          profile: {
            firstName: updatedProfile.first_name,
            lastName: updatedProfile.last_name,
            phone: updatedProfile.phone,
            address: updatedProfile.address,
            specialization: updatedProfile.specialization,
            licenseNumber: updatedProfile.license_number,
            clinicName: updatedProfile.clinic_name,
            companyName: updatedProfile.company_name,
            companyRegistration: updatedProfile.company_registration
          },
          updatedAt: updatedProfile.updated_at
        }
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Request password reset
 */
export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.CLIENT_URL}/reset-password`
    });

    if (error) {
      console.error('Password reset error:', error);
      return res.status(400).json({
        success: false,
        message: 'Failed to send password reset email'
      });
    }

    res.json({
      success: true,
      message: 'Password reset email sent successfully'
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Reset password
 */
export const resetPassword = async (req, res) => {
  try {
    const { password, accessToken } = req.body;

    if (!password || !accessToken) {
      return res.status(400).json({
        success: false,
        message: 'Password and access token are required'
      });
    }

    // Update password in Supabase
    const { data, error } = await supabaseAdmin.auth.updateUser(accessToken, {
      password
    });

    if (error) {
      console.error('Password reset error:', error);
      return res.status(400).json({
        success: false,
        message: 'Failed to reset password'
      });
    }

    // Update password hash in our users table
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await supabaseAdmin
      .from('users')
      .update({ 
        password_hash: passwordHash,
        updated_at: new Date().toISOString()
      })
      .eq('id', data.user.id);

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Validate role-specific required fields
 */
function validateRoleRequiredFields(role, data) {
  const { firstName, lastName, email, password } = data;

  if (!firstName || !lastName || !email || !password) {
    return {
      isValid: false,
      message: 'First name, last name, email, and password are required'
    };
  }

  switch (role) {
    case 'doctor':
      if (!data.specialization || !data.licenseNumber || !data.clinicName) {
        return {
          isValid: false,
          message: 'Specialization, license number, and clinic name are required for doctors'
        };
      }
      break;
    case 'pharma':
      if (!data.companyName || !data.companyRegistration) {
        return {
          isValid: false,
          message: 'Company name and registration are required for pharma representatives'
        };
      }
      break;
    case 'staff':
      if (!data.assignedDoctorId) {
        return {
          isValid: false,
          message: 'Assigned doctor is required for staff members'
        };
      }
      break;
  }

  return { isValid: true };
} 