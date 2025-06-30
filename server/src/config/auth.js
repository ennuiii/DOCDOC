export const authConfig = {
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    expiresIn: '7d',
    refreshExpiresIn: '30d'
  },
  bcrypt: {
    saltRounds: 10
  },
  roles: {
    DOCTOR: 'doctor',
    PHARMA: 'pharma',
    STAFF: 'staff',
    ADMIN: 'admin'
  },
  permissions: {
    doctor: [
      'timeslot:create',
      'timeslot:read',
      'timeslot:update',
      'timeslot:delete',
      'appointment:read',
      'appointment:update',
      'research:read',
      'staff:manage',
      'profile:update'
    ],
    pharma: [
      'timeslot:read',
      'appointment:create',
      'appointment:read',
      'appointment:update',
      'appointment:delete',
      'research:create',
      'research:read',
      'research:update',
      'research:delete',
      'research:share',
      'profile:update'
    ],
    staff: [
      'timeslot:read',
      'appointment:read',
      'research:read',
      'profile:update'
    ],
    admin: ['*'] // All permissions
  }
}; 