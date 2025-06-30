import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth.js';

export const generateToken = (payload, type = 'access') => {
  const expiresIn = type === 'refresh' 
    ? authConfig.jwt.refreshExpiresIn 
    : authConfig.jwt.expiresIn;
    
  return jwt.sign(
    payload,
    authConfig.jwt.secret,
    { expiresIn }
  );
};

export const generateAuthTokens = (user) => {
  const payload = {
    id: user._id,
    email: user.email,
    role: user.role
  };
  
  const accessToken = generateToken(payload, 'access');
  const refreshToken = generateToken(payload, 'refresh');
  
  return {
    accessToken,
    refreshToken
  };
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, authConfig.jwt.secret);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

export const decodeToken = (token) => {
  return jwt.decode(token);
}; 