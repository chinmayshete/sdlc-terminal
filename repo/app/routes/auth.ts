import { Router, Request, Response } from 'express';

const router = Router();

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Basic validation
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  // Dummy user for demonstration
  const dummyPass = 'mockpass123';
  const demoUser = {
    email: 'user@example.com',
    passwordHash: dummyPass, // In real apps, use hashed passwords!
    id: 1,
    name: 'Demo User',
  };

  // Check credentials
  if (email === demoUser.email && password === demoUser.passwordHash) {
    // In real apps, generate a JWT or session here
    return res.json({
      message: 'Login successful',
      user: {
        id: demoUser.id,
        name: demoUser.name,
        email: demoUser.email,
      },
      token: 'dummy-jwt-token',
    });
  }

  return res.status(401).json({ message: 'Invalid email or password.' });
});

// POST /auth/logout
router.post('/logout', (req: Request, res: Response) => {
  // In real apps, invalidate session or token here
  return res.json({ message: 'Logout successful' });
});

export default router;
