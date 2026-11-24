import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';
import {
  validateProfileUpdateInput,
  validateRegistrationInput,
} from '../utils/validation.js';
import {
  createUser,
  findUserByEmail,
  findUserById,
  isAuthorizedAdminUser,
  changeUserPassword,
  updateUserProfile,
} from '../models/userModel.js';

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

export function createLoginUserController({
  findUser = findUserByEmail,
  authorizeAdmin = isAuthorizedAdminUser,
  comparePassword = bcrypt.compare,
  environment = process.env,
} = {}) {
  return async function loginUser(request, response, next) {
    try {
      const { email, password } = request.body ?? {};

      if (!email || !String(email).trim()) {
        throw new AppError(400, 'Email is required.');
      }

      if (!password || !String(password).trim()) {
        throw new AppError(400, 'Password is required.');
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const user = await findUser(normalizedEmail);
      if (!user) {
        throw new AppError(401, 'Invalid email or password.');
      }

      const passwordMatches = await comparePassword(String(password), user.password);
      if (!passwordMatches) {
        throw new AppError(401, 'Invalid email or password.');
      }
      if (user.status !== 'active') {
        throw new AppError(403, 'This account has been suspended.');
      }
      if (user.role === 'admin') {
        const authorized = await authorizeAdmin(user.id, user.email);
        if (!authorized) {
          throw new AppError(403, 'This administrator account is not authorized.');
        }
      }

      const secret = environment.JWT_SECRET;
      if (!secret) {
        throw new AppError(500, 'JWT secret is not configured.');
      }

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
          passwordVersion: user.password_version,
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
          requiresPasswordChange: Boolean(user.password_change_required),
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const loginUser = createLoginUserController();

export async function getAuthenticatedUser(request, response, next) {
  try {
    const user = await findUserById(request.user.id);

    if (!user) {
      throw new AppError(404, 'Authenticated user not found.');
    }

    response.status(200).json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        farm: user.farm_name,
        company: user.company_name,
        location: user.location,
        created_at: user.created_at,
        requiresPasswordChange: Boolean(user.password_change_required),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAuthenticatedUser(request, response, next) {
  try {
    if (request.user.role === 'admin') {
      throw new AppError(403, 'Administrator profile changes are not available.');
    }

    const validationError = validateProfileUpdateInput(
      request.body,
      request.user.role,
    );
    if (validationError) {
      throw new AppError(400, validationError);
    }

    const email = String(request.body.email).trim().toLowerCase();
    const existingUser = await findUserByEmail(email);
    if (existingUser && existingUser.id !== request.user.id) {
      throw new AppError(409, 'User with this email already exists.');
    }

    const user = await updateUserProfile(request.user.id, {
      name: String(request.body.name).trim(),
      email,
      phone: String(request.body.phone).trim(),
      farm: request.user.role === 'farmer'
        ? String(request.body.farm).trim()
        : null,
      company: request.user.role === 'buyer'
        ? String(request.body.company).trim()
        : null,
      location: String(request.body.location).trim(),
    });

    if (!user) {
      throw new AppError(404, 'Authenticated user not found.');
    }

    response.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        farm: user.farm_name,
        company: user.company_name,
        location: user.location,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    if (error.code === '23505') {
      return next(new AppError(409, 'User with this email already exists.'));
    }
    next(error);
  }
}

export function createChangeAuthenticatedPasswordController({
  findUserById: findUser = findUserById,
  findUserByEmail: findByEmail = findUserByEmail,
  changePassword = changeUserPassword,
  comparePassword = bcrypt.compare,
  hashPassword = bcrypt.hash,
  environment = process.env,
} = {}) {
  return async function changeAuthenticatedPassword(request, response, next) {
    try {
      if (request.user.role !== 'admin') {
        throw new AppError(403, 'Only administrator accounts can use this password setup endpoint.');
      }

      const currentPassword = request.body?.currentPassword;
      const newPassword = request.body?.newPassword;
      if (typeof currentPassword !== 'string' || !currentPassword) {
        throw new AppError(400, 'The current password is required.');
      }
      if (
        typeof newPassword !== 'string'
        || newPassword.length < 12
        || Buffer.byteLength(newPassword, 'utf8') > 72
      ) {
        throw new AppError(
          400,
          'The new password must be at least 12 characters and no more than 72 UTF-8 bytes.',
        );
      }

      const user = await findUser(request.user.id);
      if (!user) {
        throw new AppError(404, 'Authenticated user not found.');
      }

      const fullUser = await findByEmail(user.email);
      if (!fullUser) {
        throw new AppError(404, 'Authenticated user not found.');
      }

      const passwordMatches = await comparePassword(currentPassword, fullUser.password);
      if (!passwordMatches) {
        throw new AppError(401, 'The current password is incorrect.');
      }
      if (await comparePassword(newPassword, fullUser.password)) {
        throw new AppError(400, 'The new password must be different from the temporary password.');
      }
      if (fullUser.password_change_required !== true) {
        throw new AppError(409, 'Password setup has already been completed.');
      }

      const passwordHash = await hashPassword(newPassword, 12);
      const updatedUser = await changePassword(request.user.id, passwordHash);
      if (!updatedUser) {
        throw new AppError(409, 'Password setup has already been completed.');
      }
      const secret = environment.JWT_SECRET;
      if (!secret) {
        throw new AppError(500, 'JWT secret is not configured.');
      }
      const token = jwt.sign(
        {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          name: updatedUser.name,
          passwordVersion: updatedUser.password_version,
        },
        secret,
        { expiresIn: '1d' },
      );

      response.status(200).json({
        success: true,
        message: 'Password changed successfully.',
        requiresPasswordChange: false,
        token,
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          requiresPasswordChange: false,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const changeAuthenticatedPassword = createChangeAuthenticatedPasswordController();

