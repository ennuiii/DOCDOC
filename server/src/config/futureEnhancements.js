/**
 * Future Enhancements Configuration
 * 
 * This file defines configuration and placeholders for upcoming features
 * as outlined in the Future Enhancements roadmap.
 */

// Analytics Configuration
const ANALYTICS_CONFIG = {
  enabled: process.env.ANALYTICS_ENABLED === 'true',
  providers: {
    supabase: {
      enabled: true,
      tables: ['user_analytics', 'appointment_analytics', 'research_analytics']
    },
    googleAnalytics: {
      enabled: process.env.GA_TRACKING_ID !== undefined,
      trackingId: process.env.GA_TRACKING_ID
    },
    mixpanel: {
      enabled: process.env.MIXPANEL_TOKEN !== undefined,
      token: process.env.MIXPANEL_TOKEN
    }
  },
  events: {
    userRegistration: 'user_registered',
    appointmentBooked: 'appointment_booked',
    appointmentCompleted: 'appointment_completed',
    researchShared: 'research_shared',
    loginSuccess: 'login_success',
    profileUpdated: 'profile_updated'
  }
};

// Messaging System Configuration
const MESSAGING_CONFIG = {
  enabled: process.env.MESSAGING_ENABLED === 'true',
  providers: {
    supabaseRealtime: {
      enabled: true,
      channels: ['notifications', 'chat', 'appointments']
    },
    socketio: {
      enabled: process.env.SOCKETIO_ENABLED === 'true',
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    },
    twilio: {
      enabled: process.env.TWILIO_SID !== undefined,
      accountSid: process.env.TWILIO_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SID
    }
  },
  features: {
    realTimeChat: true,
    pushNotifications: true,
    emailNotifications: true,
    smsNotifications: false // Enable when Twilio is configured
  }
};

// Payment Processing Configuration
const PAYMENT_CONFIG = {
  enabled: process.env.PAYMENTS_ENABLED === 'true',
  providers: {
    stripe: {
      enabled: process.env.STRIPE_SECRET_KEY !== undefined,
      secretKey: process.env.STRIPE_SECRET_KEY,
      publicKey: process.env.STRIPE_PUBLIC_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      currency: 'usd',
      features: {
        subscriptions: true,
        oneTimePayments: true,
        invoicing: true
      }
    }
  },
  plans: {
    pharmaBasic: {
      id: 'pharma_basic',
      name: 'Pharma Basic',
      price: 9900, // $99.00 in cents
      interval: 'month',
      features: ['appointments', 'research_sharing', 'basic_analytics']
    },
    pharmaPro: {
      id: 'pharma_pro',
      name: 'Pharma Professional',
      price: 19900, // $199.00 in cents
      interval: 'month',
      features: ['appointments', 'research_sharing', 'advanced_analytics', 'priority_support']
    }
  }
};

// Video Consultation Configuration
const VIDEO_CONFIG = {
  enabled: process.env.VIDEO_ENABLED === 'true',
  providers: {
    twilio: {
      enabled: process.env.TWILIO_VIDEO_SID !== undefined,
      accountSid: process.env.TWILIO_VIDEO_SID,
      apiKey: process.env.TWILIO_VIDEO_API_KEY,
      apiSecret: process.env.TWILIO_VIDEO_API_SECRET
    },
    zoom: {
      enabled: process.env.ZOOM_API_KEY !== undefined,
      apiKey: process.env.ZOOM_API_KEY,
      apiSecret: process.env.ZOOM_API_SECRET
    },
    webrtc: {
      enabled: true, // Default WebRTC fallback
      stunServers: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302'
      ]
    }
  },
  features: {
    recording: process.env.VIDEO_RECORDING_ENABLED === 'true',
    screenSharing: true,
    waitingRoom: true,
    maxDuration: 60 // minutes
  }
};

// Compliance and Security Configuration
const COMPLIANCE_CONFIG = {
  hipaa: {
    enabled: process.env.HIPAA_COMPLIANCE === 'true',
    features: {
      auditLogging: true,
      dataEncryption: true,
      accessControls: true,
      baAgreements: true
    }
  },
  gdpr: {
    enabled: process.env.GDPR_COMPLIANCE === 'true',
    features: {
      dataExport: true,
      rightToBeForgotten: true,
      consentManagement: true,
      privacyPolicyVersioning: true
    }
  },
  security: {
    twoFactorAuth: process.env.TWO_FACTOR_ENABLED === 'true',
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 86400, // 24 hours default
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true
    }
  }
};

// Email Service Configuration
const EMAIL_CONFIG = {
  enabled: process.env.EMAIL_ENABLED === 'true',
  provider: process.env.EMAIL_PROVIDER || 'sendgrid',
  providers: {
    sendgrid: {
      enabled: process.env.SENDGRID_API_KEY !== undefined,
      apiKey: process.env.SENDGRID_API_KEY,
      fromEmail: process.env.FROM_EMAIL || 'noreply@pharmadoc.com',
      fromName: process.env.FROM_NAME || 'Pharmadoc'
    },
    ses: {
      enabled: process.env.AWS_SES_REGION !== undefined,
      region: process.env.AWS_SES_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  },
  templates: {
    appointmentConfirmation: 'appointment_confirmation',
    appointmentReminder: 'appointment_reminder',
    researchShared: 'research_shared',
    welcomeEmail: 'welcome_email',
    passwordReset: 'password_reset',
    weeklyDigest: 'weekly_digest'
  }
};

// Storage Configuration
const STORAGE_CONFIG = {
  providers: {
    supabase: {
      enabled: true,
      buckets: {
        research: 'research-documents',
        avatars: 'user-avatars',
        recordings: 'video-recordings',
        attachments: 'appointment-attachments'
      },
      maxFileSize: 50 * 1024 * 1024, // 50MB
      allowedTypes: {
        research: ['.pdf', '.doc', '.docx', '.ppt', '.pptx'],
        avatars: ['.jpg', '.jpeg', '.png', '.gif'],
        recordings: ['.mp4', '.webm', '.mov'],
        attachments: ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png']
      }
    },
    aws: {
      enabled: process.env.AWS_S3_BUCKET !== undefined,
      bucket: process.env.AWS_S3_BUCKET,
      region: process.env.AWS_S3_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  }
};

// Mobile App Configuration
const MOBILE_CONFIG = {
  pushNotifications: {
    enabled: process.env.PUSH_NOTIFICATIONS_ENABLED === 'true',
    firebase: {
      enabled: process.env.FIREBASE_PROJECT_ID !== undefined,
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL
    },
    apns: {
      enabled: process.env.APNS_KEY_ID !== undefined,
      keyId: process.env.APNS_KEY_ID,
      teamId: process.env.APNS_TEAM_ID,
      bundleId: process.env.APNS_BUNDLE_ID
    }
  },
  deepLinking: {
    enabled: true,
    baseUrl: process.env.DEEP_LINK_BASE_URL || 'pharmadoc://',
    schemes: {
      appointment: 'appointment',
      research: 'research',
      profile: 'profile'
    }
  }
};

// Performance Monitoring Configuration
const MONITORING_CONFIG = {
  enabled: process.env.MONITORING_ENABLED === 'true',
  providers: {
    sentry: {
      enabled: process.env.SENTRY_DSN !== undefined,
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development'
    },
    newrelic: {
      enabled: process.env.NEW_RELIC_LICENSE_KEY !== undefined,
      licenseKey: process.env.NEW_RELIC_LICENSE_KEY,
      appName: process.env.NEW_RELIC_APP_NAME || 'Pharmadoc'
    }
  },
  metrics: {
    apiResponseTime: true,
    databaseQueries: true,
    memoryUsage: true,
    errorRates: true
  }
};

module.exports = {
  ANALYTICS_CONFIG,
  MESSAGING_CONFIG,
  PAYMENT_CONFIG,
  VIDEO_CONFIG,
  COMPLIANCE_CONFIG,
  EMAIL_CONFIG,
  STORAGE_CONFIG,
  MOBILE_CONFIG,
  MONITORING_CONFIG
}; 