import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
          setLoading(false);
          return;
        }

        if (session) {
          setSession(session);
          await fetchUserProfile(session.user.id);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error in getInitialSession:', error);
        setLoading(false);
      }
    };

    getInitialSession();

    // Function to create user profile from auth metadata (used after email confirmation)
    const createProfileFromAuthMetadata = async (user) => {
      try {
        const metadata = user.user_metadata;
        
        if (!metadata.first_name || !metadata.role) {
          console.log('No profile metadata found, skipping profile creation');
          return null;
        }

        const profileData = {
          id: user.id,
          email: user.email,
          first_name: metadata.first_name,
          last_name: metadata.last_name,
          role: metadata.role,
          phone: metadata.phone,
          address: metadata.address ? JSON.parse(metadata.address) : null
        };

        // Add role-specific fields
        if (metadata.role === 'doctor') {
          profileData.specialization = metadata.specialization;
          profileData.license_number = metadata.license_number;
          profileData.clinic_name = metadata.clinic_name;
        } else if (metadata.role === 'pharma') {
          profileData.company_name = metadata.company_name;
          profileData.company_registration = metadata.company_registration;
        }

        console.log('🚀 Creating profile from metadata:', profileData);

        const { data: profileResult, error: profileError } = await supabase
          .from('users')
          .insert([profileData])
          .select()
          .single();

        if (profileError) {
          // If user already exists, that's okay - just return the existing data
          if (profileError.code === '23505') { // Unique constraint violation
            console.log('✅ User profile already exists, fetching existing record...');
            const { data: existingProfile, error: fetchError } = await supabase
              .from('users')
              .select('*')
              .eq('id', user.id)
              .single();
            
            if (!fetchError && existingProfile) {
              console.log('✅ Found existing profile:', existingProfile);
              return existingProfile;
            }
          }
          
          console.error('❌ Profile creation from metadata error:', profileError);
          console.error('Error details:', {
            message: profileError.message,
            details: profileError.details,
            hint: profileError.hint,
            code: profileError.code
          });
          return null;
        }

        console.log('Profile created successfully from metadata:', profileResult);
        return profileResult;
      } catch (error) {
        console.error('Error creating profile from metadata:', error);
        return null;
      }
    };

    // Auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user || null);
        
        setLoading(true);
        
        // Add a safety timeout to ensure loading doesn't stay true indefinitely
        const loadingTimeout = setTimeout(() => {
          console.warn('⚠️ Auth loading timeout reached, forcing loading to false');
          setLoading(false);
        }, 10000); // 10 second timeout
        
        try {
          if (event === 'SIGNED_IN' && session?.user) {
            console.log('User signed in, looking for profile...');
            console.log('User metadata:', session.user.user_metadata);
            
            // TEMPORARY FIX: Use metadata directly if database queries are hanging
            if (session.user.user_metadata && session.user.user_metadata.first_name) {
              console.log('🚀 Using metadata directly due to database connectivity issues');
              const userFromMetadata = {
                id: session.user.id,
                email: session.user.email,
                first_name: session.user.user_metadata.first_name,
                last_name: session.user.user_metadata.last_name,
                role: session.user.user_metadata.role,
                phone: session.user.user_metadata.phone,
                specialization: session.user.user_metadata.specialization,
                license_number: session.user.user_metadata.license_number,
                clinic_name: session.user.user_metadata.clinic_name,
                company_name: session.user.user_metadata.company_name,
                company_registration: session.user.user_metadata.company_registration,
                address: session.user.user_metadata.address ? JSON.parse(session.user.user_metadata.address) : null
              };
              
              console.log('✅ User profile from metadata:', userFromMetadata);
              setUser(userFromMetadata);
              setSession(session);
              
              // Ensure database record exists in the background
              console.log('🔄 Ensuring database record exists for user...');
              createProfileFromAuthMetadata(session.user).catch(error => {
                console.warn('Background profile creation failed (this is expected if record already exists):', error);
              });
            } else {
              // Try database fetch as fallback
              console.log('No metadata available, trying database...');
              
              // User signed in, fetch their profile
              const profile = await fetchUserProfile(session.user.id);
              
              // If no profile exists but user has metadata, create profile
              if (!profile && session.user.user_metadata.first_name) {
                console.log('No profile found, creating from metadata...');
                const newProfile = await createProfileFromAuthMetadata(session.user);
                if (newProfile) {
                  console.log('Profile created successfully:', newProfile);
                  setUser(newProfile);
                } else {
                  console.error('Failed to create profile from metadata');
                }
              } else if (profile) {
                // Profile exists, user is already set by fetchUserProfile
                console.log('User profile loaded:', profile);
              } else {
                // No profile and no metadata to create one
                console.error('No profile found for user and no metadata to create one');
                console.error('User metadata:', session.user.user_metadata);
              }
              
              setSession(session);
            }
          } else if (event === 'SIGNED_OUT') {
            // User signed out
            setUser(null);
            setSession(null);
          }
        } catch (error) {
          console.error('Error in auth state change handler:', error);
        } finally {
          // Clear the timeout and set loading to false
          clearTimeout(loadingTimeout);
          setLoading(false);
          console.log('🔄 Loading state set to false');
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const fetchUserProfile = async (userId) => {
    try {
      console.log('🔍 Fetching user profile for ID:', userId);
      console.log('🔄 About to query supabase users table...');
      
      // First, let's test basic Supabase connectivity
      console.log('🧪 Testing Supabase connectivity...');
      try {
        const { data: testData, error: testError } = await Promise.race([
          supabase.from('users').select('count', { count: 'exact', head: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Query timeout')), 5000))
        ]);
        console.log('🧪 Connectivity test result:', { testData, testError });
      } catch (connectError) {
        console.error('🧪 Connectivity test failed:', connectError);
      }
      
      // Now try the actual profile query with timeout
      const queryPromise = supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile query timeout after 8 seconds')), 8000)
      );
      
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
      
      console.log('📊 Supabase query completed. Data:', data, 'Error:', error);
      
      if (error) {
        console.error('❌ Error fetching user profile:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        return null;
      }
      
      if (data) {
        console.log('✅ User profile found:', data);
        setUser(data);
        return data;
      }
      
      console.log('⚠️ No user profile data returned');
      return null;
    } catch (error) {
      console.error('💥 Exception in fetchUserProfile:', error);
      
      // If it's a timeout, let's try a simpler approach
      if (error.message.includes('timeout')) {
        console.log('🔄 Query timed out, trying alternative approach...');
        try {
          // Try without the .single() constraint first
          const { data: allData, error: allError } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .limit(1);
          
          console.log('🔍 Alternative query result:', { allData, allError });
          
          if (allData && allData.length > 0) {
            console.log('✅ Found user via alternative query:', allData[0]);
            setUser(allData[0]);
            return allData[0];
          }
        } catch (altError) {
          console.error('Alternative query also failed:', altError);
        }
      }
      
      return null;
    }
  };

  const signUp = async (userData) => {
    try {
      setLoading(true);
      
      // Sign up with Supabase Auth with email confirmation enabled
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            // Store profile data in auth metadata for later use
            first_name: userData.firstName,
            last_name: userData.lastName,
            role: userData.role,
            phone: userData.phone,
            address: JSON.stringify(userData.address),
            // Role-specific data
            ...(userData.role === 'doctor' && {
              specialization: userData.specialization,
              license_number: userData.licenseNumber,
              clinic_name: userData.clinicName
            }),
            ...(userData.role === 'pharma' && {
              company_name: userData.companyName,
              company_registration: userData.companyRegistration
            })
          }
        }
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error('Registration failed - no user created');
      }

      // Check if email confirmation is required
      if (authData.session) {
        // User is immediately signed in (email confirmation disabled)
        // Create profile immediately
        const profileData = {
          id: authData.user.id,
          email: userData.email,
          first_name: userData.firstName,
          last_name: userData.lastName,
          role: userData.role,
          phone: userData.phone,
          address: userData.address
        };

        // Add role-specific fields
        if (userData.role === 'doctor') {
          profileData.specialization = userData.specialization;
          profileData.license_number = userData.licenseNumber;
          profileData.clinic_name = userData.clinicName;
        } else if (userData.role === 'pharma') {
          profileData.company_name = userData.companyName;
          profileData.company_registration = userData.companyRegistration;
        }

        const { data: profileResult, error: profileError } = await supabase
          .from('users')
          .insert([profileData])
          .select()
          .single();

        if (profileError) {
          console.error('Profile creation error:', profileError);
          throw new Error('Failed to create user profile: ' + profileError.message);
        }

        return {
          success: true,
          message: 'Registration successful! Welcome to Pharmadoc.',
          user: profileResult,
          emailConfirmationRequired: false
        };
      } else {
        // Email confirmation required - profile will be created when user confirms email
        return {
          success: true,
          message: 'Registration successful! Please check your email to verify your account before signing in.',
          user: authData.user,
          emailConfirmationRequired: true
        };
      }
    } catch (error) {
      console.error('Registration error:', error);
      throw new Error(error.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email, password) => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.user) {
        throw new Error('Login failed - no user found');
      }

      // The auth state change listener will handle fetching the user profile
      // and setting the session state
      
      return {
        success: true,
        message: 'Login successful',
        user: data.user,
        session: data.session
      };
    } catch (error) {
      console.error('Login error:', error);
      throw new Error(error.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);
      
      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('Supabase sign out error:', error);
        throw new Error(error.message);
      }
      
      // Clear state (this will also be handled by the auth state change listener)
      setUser(null);
      setSession(null);
      
      return { success: true };
    } catch (error) {
      console.error('Sign out error:', error);
      
      // Force cleanup even on error
      setUser(null);
      setSession(null);
      
      throw new Error('Sign out failed');
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (profileData) => {
    try {
      setLoading(true);
      
      if (!user?.id) {
        throw new Error('No user logged in');
      }
      
      const { data, error } = await supabase
        .from('users')
        .update({
          ...profileData,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id)
        .select()
        .single();
      
      if (error) {
        throw new Error(error.message);
      }
      
      setUser(data);
      
      return {
        success: true,
        message: 'Profile updated successfully',
        user: data
      };
    } catch (error) {
      console.error('Profile update error:', error);
      throw new Error(error.message || 'Profile update failed');
    } finally {
      setLoading(false);
    }
  };

  const requestPasswordReset = async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (error) {
        throw new Error(error.message);
      }
      
      return {
        success: true,
        message: 'Password reset email sent! Please check your inbox.'
      };
    } catch (error) {
      console.error('Password reset request error:', error);
      throw new Error(error.message || 'Password reset request failed');
    }
  };

  const resetPassword = async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      
      if (error) {
        throw new Error(error.message);
      }
      
      return {
        success: true,
        message: 'Password updated successfully'
      };
    } catch (error) {
      console.error('Password reset error:', error);
      throw new Error(error.message || 'Password reset failed');
    }
  };

  const isAuthenticated = () => {
    return !!(session && user && session.access_token);
  };

  const hasRole = (role) => {
    if (!user) return false;
    if (Array.isArray(role)) {
      return role.includes(user.role);
    }
    return user.role === role;
  };

  const canAccessDoctor = (doctorId) => {
    if (!user) return false;
    
    switch (user.role) {
      case 'admin':
        return true;
      case 'doctor':
        return user.id === doctorId;
      case 'staff':
        return user.assigned_doctor_id === doctorId;
      case 'pharma':
        // Pharma reps need specific appointment access
        return true;
      default:
        return false;
    }
  };

  // Add updateUser alias for updateProfile to match expected API
  const updateUser = async () => {
    if (!user?.id) return;
    return await fetchUserProfile(user.id);
  };

  const value = {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile,
    updateUser,
    requestPasswordReset,
    resetPassword,
    isAuthenticated,
    hasRole,
    canAccessDoctor
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 