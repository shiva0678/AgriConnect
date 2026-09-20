import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';
import { validateRegistrationInput } from '../utils/validation.js';
import { createUser, findUserByEmail } from '../models/userModel.js';

export async function registerUser(request, response, next) {
  try {
    const { name, email, phone, password, role } = request.body ?? {};

    const validationError = validateRegistrationInput({ name, email, phone, password, role });
    if (validationError) {
      throw new AppError(400, validationError);
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      throw new AppError(409, 'User with this email already exists.');
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);

    const user = await createUser({
      name: String(name).trim(),
      email: normalizedEmail,
      phone: String(phone).trim(),
      password: hashedPassword,
      role: String(role).trim().toLowerCase(),
    });

    response.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function loginUser(request, response, next) {
  try {
    const { email, password } = request.body ?? {};

    if (!email || !String(email).trim()) {
      throw new AppError(400, 'Email is required.');
    }

    if (!password || !String(password).trim()) {
      throw new AppError(400, 'Password is required.');
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      throw new AppError(401, 'Invalid email or password.');
    }

    const passwordMatches = await bcrypt.compare(String(password), user.password);
    if (!passwordMatches) {
      throw new AppError(401, 'Invalid email or password.');
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new AppError(500, 'JWT secret is not configured.');
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      secret,
      { expiresIn: '1d' }
    );

    response.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
}

export function getAuthenticatedUser(request, response) {
  response.status(200).json({
    success: true,
    user: {
      id: request.user.id,
      name: request.user.name,
      email: request.user.email,
      role: request.user.role,
    },
  });
}

