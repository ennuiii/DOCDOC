const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        // Basic email validation
        match: [/.+@.+\..+/, 'Please fill a valid email address']
    },
    password: {
        type: String,
        required: true,
        minlength: 6 // Consider adding more robust password policies
    },
    role: {
        type: String,
        required: true,
        enum: ['doctor', 'pharma_concern', 'clinic_staff', 'admin'], // Added admin role
    },
    isActive: { // To allow deactivating users instead of deleting
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware to update `updatedAt` field before saving
userSchema.pre('save', function(next) {
    if (this.isModified()) {
        this.updatedAt = Date.now();
    }
    next();
});

// Consider adding methods for password hashing and comparison here later
// For example, using bcrypt:
// userSchema.pre('save', async function(next) {
//   if (this.isModified('password')) {
//     this.password = await bcrypt.hash(this.password, 10);
//   }
//   next();
// });
//
// userSchema.methods.comparePassword = function(candidatePassword) {
//   return bcrypt.compare(candidatePassword, this.password);
// };

// Password hashing middleware and comparison method
const bcrypt = require('bcryptjs');

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        try {
            const salt = await bcrypt.genSalt(10);
            this.password = await bcrypt.hash(this.password, salt);
        } catch (error) {
            return next(error); // Pass error to the next middleware/error handler
        }
    }
    // Ensure updatedAt is also updated during password change or any modification
    if (this.isModified()) {
        this.updatedAt = Date.now();
    }
    next();
});

// Method to compare candidate password with the hashed password
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error; // Or return false, depending on how you want to handle comparison errors
    }
};


const User = mongoose.model('User', userSchema);

module.exports = User;
