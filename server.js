import app from './api/index.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`Backend API Server running on http://localhost:${PORT}`);
});
