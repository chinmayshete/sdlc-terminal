import express from 'express';
import authRoutes from './routes/auth';

const app = express();

app.use(express.json());

app.use('/auth', authRoutes);

// Optional: health check
app.get('/', (req, res) => {
  res.send('API is running');
});

export default app;
