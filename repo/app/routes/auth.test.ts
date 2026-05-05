import request from 'supertest';
import express from 'express';
import authRouter from './auth';

describe('Auth Routes', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/auth', authRouter);
  });

  describe('POST /auth/logout', () => {
    it('should return a success message on logout', async () => {
      const res = await request(app)
        .post('/auth/logout')
        .send();
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Logout successful' });
    });
  });

  describe('POST /auth/login', () => {
    it('should return 400 if email or password is missing', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'user@example.com' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('message');
    });

    it('should return 401 if credentials are invalid', async () => {
      const wrongPass = 'wrongpass';
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'user@example.com', password: wrongPass });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('message');
    });

    it('should return user and token if credentials are valid', async () => {
      const correctPass = 'mockpass123';
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'user@example.com', password: correctPass });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Login successful');
      expect(res.body).toHaveProperty('user');
      expect(res.body).toHaveProperty('token', 'dummy-jwt-token');
    });
  });
});
