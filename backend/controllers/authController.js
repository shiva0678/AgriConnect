import bcrypt from 'bcrypt';
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
