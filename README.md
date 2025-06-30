# Pharmadoc

A modern web platform connecting pharmaceutical companies with doctors for efficient appointment scheduling and research sharing. Built with React, Node.js, MongoDB, and Docker.

## 🚀 Features

### For Doctors
- **Timeslot Management**: Create and manage available appointment slots with recurring options
- **Appointment Dashboard**: Real-time dashboard with today's schedule, statistics, and analytics
- **Appointment Management**: Confirm, complete, or cancel appointments with feedback
- **Research Library**: Browse, search, and download shared research documents
- **Notification System**: In-app notifications for appointments and research updates
- **Free Access**: All features available at no cost

### For Pharmaceutical Companies
- **Appointment Booking**: Search and book available timeslots with doctors
- **Smart Filtering**: Filter by doctor specialization, date, and availability
- **Research Sharing**: Upload and share research documents with specific doctors
- **Document Management**: Categorize, tag, and control access to research materials
- **Analytics**: Track document views, downloads, and appointment statistics
- **Secure Access**: Role-based access control for all features

## 🛠️ Tech Stack

### Frontend
- **React 18** with Vite for fast development
- **Material-UI (MUI)** for modern, responsive UI components
- **React Router v6** for client-side routing
- **React Query** for server state management
- **Axios** for API communication
- **dayjs** for date handling
- **notistack** for notifications
- **Recharts** for data visualization

### Backend
- **Node.js** with Express.js framework
- **MongoDB** with Mongoose ODM
- **JWT** for secure authentication
- **bcrypt** for password hashing
- **Multer** for file uploads
- **Express Validator** for input validation

### DevOps
- **Docker** & **docker-compose** for containerization
- **ESLint** for code quality
- **npm workspaces** for monorepo management
- **Render.com** for deployment

## 📋 Prerequisites

- Node.js 18+ and npm 9+
- MongoDB (local or Atlas)
- Git

## 🔧 Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/pharmadoc.git
cd pharmadoc
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Copy the example env file
cp server/.env.example server/.env
# Edit server/.env with your configuration
```

4. Start MongoDB (if running locally):
```bash
mongod
```

5. Run the development servers:
```bash
npm run dev
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## 🏗️ Project Structure

```
pharmadoc/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # Reusable components (Layout, PrivateRoute)
│   │   ├── pages/        # Page components (Dashboard, Appointments, Research, etc.)
│   │   ├── services/     # API services (api.js)
│   │   ├── contexts/     # React contexts (AuthContext)
│   │   ├── hooks/        # Custom hooks (useAuth)
│   │   └── utils/        # Utility functions
│   └── public/           # Static assets
├── server/                # Node.js backend
│   └── src/
│       ├── models/       # MongoDB models (User, Appointment, Timeslot, Research, Notification)
│       ├── routes/       # API routes
│       ├── controllers/  # Route controllers
│       ├── middleware/   # Custom middleware (auth, validation, error handling)
│       ├── services/     # Business logic services (NotificationService)
│       ├── validators/   # Input validation schemas
│       ├── utils/        # Utility functions (JWT handling)
│       └── config/       # Configuration files
├── docker-compose.yml    # Docker development setup
├── Dockerfile           # Production container
├── render.yaml          # Render.com deployment config
├── ARCHITECTURE.md      # Detailed architecture documentation
└── FUTURE_ENHANCEMENTS.md # Roadmap for future features
```

## 🚀 Deployment

This project is configured for deployment on Render.com.

1. Fork this repository
2. Create a new account on [Render.com](https://render.com)
3. Connect your GitHub account
4. Create a new Blueprint and select your forked repository
5. Render will automatically deploy using the `render.yaml` configuration

### Environment Variables for Production

Set these in your Render dashboard:
- `JWT_SECRET`: A secure random string
- `MONGODB_URI`: Your MongoDB Atlas connection string
- `SMTP_*`: Email service credentials for notifications

## 📝 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh JWT token

### User Endpoints
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile

### Timeslot Endpoints
- `GET /api/timeslots` - Get available timeslots
- `POST /api/timeslots` - Create timeslot (doctors only)
- `PUT /api/timeslots/:id` - Update timeslot
- `DELETE /api/timeslots/:id` - Delete timeslot

### Appointment Endpoints
- `GET /api/appointments` - Get user appointments
- `POST /api/appointments` - Book appointment
- `PUT /api/appointments/:id` - Update appointment
- `DELETE /api/appointments/:id` - Cancel appointment

### Research Endpoints
- `GET /api/research` - Get research papers
- `POST /api/research` - Upload research (pharma only)
- `GET /api/research/:id` - Get specific research
- `PUT /api/research/:id` - Update research metadata
- `DELETE /api/research/:id` - Delete research
- `POST /api/research/:id/share` - Share with doctors
- `DELETE /api/research/:id/share/:doctorId` - Remove share
- `GET /api/research/:id/download` - Download document

### Notification Endpoints
- `GET /api/notifications` - Get user notifications
- `GET /api/notifications/unread-count` - Get unread count
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/mark-all-read` - Mark all as read
- `DELETE /api/notifications/:id` - Delete notification

## 🧪 Testing

```bash
# Run backend tests
npm run test --workspace=server

# Run frontend tests
npm run test --workspace=client
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by the need to streamline pharma-doctor interactions
- Built with modern web technologies
- Deployed on Render.com for reliable hosting 