import { supabaseAdmin } from '../config/supabase.js';
import User from '../models/User.js';
import Appointment from '../models/Appointment.js';
import Timeslot from '../models/Timeslot.js';
import Research from '../models/Research.js';
import Notification from '../models/Notification.js';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

// Mock users to migrate (from authController.js)
const MOCK_USERS = [
  {
    id: '507f1f77-bcf8-6cd7-9943-9011',
    email: 'doctor@test.com',
    password: 'doctor123',
    firstName: 'Dr. John',
    lastName: 'Smith',
    role: 'doctor',
    phone: '+1234567890',
    address: {
      street: '123 Medical St',
      city: 'Healthcare City',
      state: 'Medical State',
      zipCode: '12345',
      country: 'USA'
    },
    specialization: 'Cardiology',
    licenseNumber: 'DOC123456',
    clinicName: 'Heart Care Clinic',
    isActive: true,
    isEmailVerified: true
  },
  {
    id: '507f1f77-bcf8-6cd7-9943-9012',
    email: 'pharma@test.com',
    password: 'pharma123',
    firstName: 'Jane',
    lastName: 'Wilson',
    role: 'pharma',
    address: {
      street: '456 Pharma Avenue',
      city: 'Business District',
      state: 'Commerce State',
      zipCode: '67890',
      country: 'USA'
    },
    companyName: 'PharmaCorp International',
    companyRegistration: 'PC123456789',
    isActive: true,
    isEmailVerified: true
  },
  {
    id: '507f1f77-bcf8-6cd7-9943-9013',
    email: 'admin@test.com',
    password: 'admin123',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    address: {
      street: '789 Admin Plaza',
      city: 'Administrative Center',
      state: 'Admin State',
      zipCode: '54321',
      country: 'USA'
    },
    isActive: true,
    isEmailVerified: true
  },
  {
    id: '507f1f77-bcf8-6cd7-9943-9014',
    email: 'staff@test.com',
    password: 'staff123',
    firstName: 'Sarah',
    lastName: 'Staff',
    role: 'staff',
    phone: '+1234567891',
    address: {
      street: '321 Support Street',
      city: 'Helper City',
      state: 'Service State',
      zipCode: '98765',
      country: 'USA'
    },
    assignedDoctorId: '507f1f77-bcf8-6cd7-9943-9011',
    isActive: true,
    isEmailVerified: true
  }
];

// Sample timeslots for testing
const SAMPLE_TIMESLOTS = [
  {
    id: '607f1f77-bcf8-6cd7-9943-1001',
    doctorId: '507f1f77-bcf8-6cd7-9943-9011',
    date: new Date('2024-02-15'),
    startTime: '09:00',
    endTime: '09:30',
    duration: 30,
    status: 'available',
    type: 'pharma',
    maxBookings: 1,
    currentBookings: 0,
    notes: 'Morning consultation slot'
  },
  {
    id: '607f1f77-bcf8-6cd7-9943-1002',
    doctorId: '507f1f77-bcf8-6cd7-9943-9011',
    date: new Date('2024-02-15'),
    startTime: '10:00',
    endTime: '10:30',
    duration: 30,
    status: 'available',
    type: 'pharma',
    maxBookings: 1,
    currentBookings: 0,
    notes: 'Mid-morning consultation slot'
  },
  {
    id: '607f1f77-bcf8-6cd7-9943-1003',
    doctorId: '507f1f77-bcf8-6cd7-9943-9011',
    date: new Date('2024-02-16'),
    startTime: '14:00',
    endTime: '14:30',
    duration: 30,
    status: 'available',
    type: 'pharma',
    maxBookings: 1,
    currentBookings: 0,
    notes: 'Afternoon consultation slot'
  },
  {
    id: '607f1f77-bcf8-6cd7-9943-1004',
    doctorId: '507f1f77-bcf8-6cd7-9943-9011',
    date: new Date('2024-02-17'),
    startTime: '11:00',
    endTime: '11:30',
    duration: 30,
    status: 'booked',
    type: 'pharma',
    maxBookings: 1,
    currentBookings: 1,
    notes: 'Booked consultation slot'
  }
];

// Sample appointments for testing
const SAMPLE_APPOINTMENTS = [
  {
    id: '707f1f77-bcf8-6cd7-9943-2001',
    timeslotId: '607f1f77-bcf8-6cd7-9943-1004',
    doctorId: '507f1f77-bcf8-6cd7-9943-9011',
    pharmaRepId: '507f1f77-bcf8-6cd7-9943-9012',
    status: 'scheduled',
    purpose: 'Discuss new cardiovascular medication lineup',
    notes: 'Interested in learning about latest ACE inhibitors and their clinical benefits',
    meetingType: 'in-person',
    duration: 30
  }
];

class SupabaseMigration {
  constructor() {
    this.stats = {
      users: { created: 0, skipped: 0, errors: 0 },
      timeslots: { created: 0, skipped: 0, errors: 0 },
      appointments: { created: 0, skipped: 0, errors: 0 },
      research: { created: 0, skipped: 0, errors: 0 },
      notifications: { created: 0, skipped: 0, errors: 0 }
    };
  }

  async run() {
    console.log('🚀 Starting Supabase migration...\n');

    try {
      await this.migrateMockUsers();
      await this.migrateSampleTimeslots();
      await this.migrateSampleAppointments();
      await this.generateSampleResearch();
      await this.generateSampleNotifications();

      this.printStats();
      console.log('✅ Migration completed successfully!');
      console.log('\n🚀 FUTURE ENHANCEMENTS READY:');
      console.log('• Run supabase-schema-extensions.sql for analytics, audit trails, and payments');
      console.log('• Check FUTURE_ENHANCEMENTS_GUIDE.md for implementation instructions');
      console.log('• Use env-template-future.txt for environment variable reference');
      console.log('• Analytics, audit logging, and compliance features are pre-configured');

    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  async migrateMockUsers() {
    console.log('📊 Migrating mock users...');

    for (const mockUser of MOCK_USERS) {
      try {
        const { data: existingUser } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', mockUser.email)
          .single();

        if (existingUser) {
          console.log(`   ⏭️  User ${mockUser.email} already exists, skipping`);
          this.stats.users.skipped++;
          continue;
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(mockUser.password, salt);

        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          id: mockUser.id,
          email: mockUser.email,
          password: mockUser.password,
          email_confirm: true,
          user_metadata: {
            firstName: mockUser.firstName,
            lastName: mockUser.lastName,
            role: mockUser.role
          }
        });

        if (authError) {
          console.error(`   ❌ Auth creation failed for ${mockUser.email}:`, authError.message);
          this.stats.users.errors++;
          continue;
        }

        const { error: profileError } = await supabaseAdmin
          .from('users')
          .insert({
            id: authUser.user.id,
            email: mockUser.email,
            password_hash: passwordHash,
            role: mockUser.role,
            first_name: mockUser.firstName,
            last_name: mockUser.lastName,
            phone: mockUser.phone || null,
            address: mockUser.address || {},
            specialization: mockUser.specialization || null,
            license_number: mockUser.licenseNumber || null,
            clinic_name: mockUser.clinicName || null,
            company_name: mockUser.companyName || null,
            company_registration: mockUser.companyRegistration || null,
            assigned_doctor_id: mockUser.assignedDoctorId || null,
            is_active: mockUser.isActive,
            is_email_verified: mockUser.isEmailVerified
          });

        if (profileError) {
          console.error(`   ❌ Profile creation failed for ${mockUser.email}:`, profileError.message);
          await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
          this.stats.users.errors++;
          continue;
        }

        console.log(`   ✅ Created user: ${mockUser.email} (${mockUser.role})`);
        this.stats.users.created++;

      } catch (error) {
        console.error(`   ❌ Error creating user ${mockUser.email}:`, error.message);
        this.stats.users.errors++;
      }
    }
  }

  async migrateSampleTimeslots() {
    console.log('📅 Creating sample timeslots...');

    for (const slot of SAMPLE_TIMESLOTS) {
      try {
        const { data: existingSlot } = await supabaseAdmin
          .from('timeslots')
          .select('id')
          .eq('id', slot.id)
          .single();

        if (existingSlot) {
          console.log(`   ⏭️  Timeslot ${slot.id} already exists, skipping`);
          this.stats.timeslots.skipped++;
          continue;
        }

        const { error } = await supabaseAdmin
          .from('timeslots')
          .insert({
            id: slot.id,
            doctor_id: slot.doctorId,
            date: slot.date.toISOString().split('T')[0],
            start_time: slot.startTime,
            end_time: slot.endTime,
            duration: slot.duration,
            status: slot.status,
            type: slot.type,
            max_bookings: slot.maxBookings,
            current_bookings: slot.currentBookings,
            notes: slot.notes
          });

        if (error) {
          console.error(`   ❌ Error creating timeslot ${slot.id}:`, error.message);
          this.stats.timeslots.errors++;
          continue;
        }

        console.log(`   ✅ Created timeslot: ${slot.date.toDateString()} ${slot.startTime}-${slot.endTime}`);
        this.stats.timeslots.created++;

      } catch (error) {
        console.error(`   ❌ Error creating timeslot ${slot.id}:`, error.message);
        this.stats.timeslots.errors++;
      }
    }
  }

  async migrateSampleAppointments() {
    console.log('📋 Creating sample appointments...');

    for (const appointment of SAMPLE_APPOINTMENTS) {
      try {
        const { data: existingAppointment } = await supabaseAdmin
          .from('appointments')
          .select('id')
          .eq('id', appointment.id)
          .single();

        if (existingAppointment) {
          console.log(`   ⏭️  Appointment ${appointment.id} already exists, skipping`);
          this.stats.appointments.skipped++;
          continue;
        }

        const { error } = await supabaseAdmin
          .from('appointments')
          .insert({
            id: appointment.id,
            timeslot_id: appointment.timeslotId,
            doctor_id: appointment.doctorId,
            pharma_rep_id: appointment.pharmaRepId,
            status: appointment.status,
            purpose: appointment.purpose,
            notes: appointment.notes,
            meeting_type: appointment.meetingType,
            duration: appointment.duration
          });

        if (error) {
          console.error(`   ❌ Error creating appointment ${appointment.id}:`, error.message);
          this.stats.appointments.errors++;
          continue;
        }

        console.log(`   ✅ Created appointment: ${appointment.purpose}`);
        this.stats.appointments.created++;

      } catch (error) {
        console.error(`   ❌ Error creating appointment ${appointment.id}:`, error.message);
        this.stats.appointments.errors++;
      }
    }
  }

  async generateSampleResearch() {
    console.log('📚 Generating sample research documents...');

    const sampleResearch = [
      {
        title: 'Latest Cardiovascular Drug Interactions Study',
        description: 'Comprehensive analysis of drug interactions in cardiovascular medications',
        category: 'clinical-trial',
        tags: ['cardiovascular', 'drug-interactions', 'clinical-trial'],
        uploadedByEmail: 'pharma@test.com',
        isPublic: true
      },
      {
        title: 'ACE Inhibitors Clinical Guidelines 2024',
        description: 'Updated clinical guidelines for ACE inhibitor prescriptions',
        category: 'product-info',
        tags: ['ace-inhibitors', 'guidelines', 'cardiology'],
        uploadedByEmail: 'pharma@test.com',
        isPublic: true
      }
    ];

    for (const research of sampleResearch) {
      try {
        const { data: uploader } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', research.uploadedByEmail)
          .single();

        if (!uploader) {
          console.log(`   ⚠️  Uploader ${research.uploadedByEmail} not found, skipping research document`);
          continue;
        }

        const { error } = await supabaseAdmin
          .from('research_documents')
          .insert({
            title: research.title,
            description: research.description,
            category: research.category,
            tags: research.tags,
            uploaded_by_id: uploader.id,
            company_name: 'PharmaCorp International',
            file_url: 'https://example.com/sample.pdf',
            file_name: research.title + '.pdf',
            file_size: 1024000,
            file_type: 'application/pdf',
            is_public: research.isPublic,
            views: 0,
            downloads: 0,
            metadata: {
              pages: 50,
              language: 'English'
            }
          });

        if (error) {
          console.error(`   ❌ Error creating research document:`, error.message);
          this.stats.research.errors++;
          continue;
        }

        console.log(`   ✅ Created research document: ${research.title}`);
        this.stats.research.created++;

      } catch (error) {
        console.error(`   ❌ Error creating research document:`, error.message);
        this.stats.research.errors++;
      }
    }
  }

  async generateSampleNotifications() {
    console.log('🔔 Generating sample notifications...');

    const sampleNotifications = [
      {
        recipientEmail: 'doctor@test.com',
        type: 'appointment-scheduled',
        title: 'New Appointment Scheduled',
        message: 'Jane Wilson from PharmaCorp International has scheduled an appointment with you',
        priority: 'high'
      },
      {
        recipientEmail: 'pharma@test.com',
        type: 'appointment-confirmed',
        title: 'Appointment Confirmed',
        message: 'Dr. John Smith has confirmed your appointment',
        priority: 'medium'
      }
    ];

    for (const notification of sampleNotifications) {
      try {
        const { data: recipient } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', notification.recipientEmail)
          .single();

        if (!recipient) {
          console.log(`   ⚠️  Recipient ${notification.recipientEmail} not found, skipping notification`);
          continue;
        }

        const { error } = await supabaseAdmin
          .from('notifications')
          .insert({
            recipient_id: recipient.id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: {},
            priority: notification.priority,
            read: false
          });

        if (error) {
          console.error(`   ❌ Error creating notification:`, error.message);
          this.stats.notifications.errors++;
          continue;
        }

        console.log(`   ✅ Created notification: ${notification.title}`);
        this.stats.notifications.created++;

      } catch (error) {
        console.error(`   ❌ Error creating notification:`, error.message);
        this.stats.notifications.errors++;
      }
    }
  }

  printStats() {
    console.log('\n📊 Migration Statistics:');
    console.log('========================');
    console.log(`👥 Users:          Created: ${this.stats.users.created}, Skipped: ${this.stats.users.skipped}, Errors: ${this.stats.users.errors}`);
    console.log(`📅 Timeslots:      Created: ${this.stats.timeslots.created}, Skipped: ${this.stats.timeslots.skipped}, Errors: ${this.stats.timeslots.errors}`);
    console.log(`📋 Appointments:   Created: ${this.stats.appointments.created}, Skipped: ${this.stats.appointments.skipped}, Errors: ${this.stats.appointments.errors}`);
    console.log(`📚 Research:       Created: ${this.stats.research.created}, Skipped: ${this.stats.research.skipped}, Errors: ${this.stats.research.errors}`);
    console.log(`🔔 Notifications:  Created: ${this.stats.notifications.created}, Skipped: ${this.stats.notifications.skipped}, Errors: ${this.stats.notifications.errors}`);
    console.log('========================\n');
  }
}

async function runMigration() {
  const migration = new SupabaseMigration();
  
  try {
    await migration.run();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration();
}

export default SupabaseMigration; 