import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection (Optimized for Serverless)
const MONGODB_URI = process.env.MONGODB_URI;
let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;
    try {
        await mongoose.connect(MONGODB_URI);
        isConnected = true;
        console.log('Connected to MongoDB Atlas');
    } catch (err) {
        console.error('MongoDB connection error:', err);
    }
};

// Middleware to ensure DB connection
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// Complaint Schema
const complaintSchema = new mongoose.Schema({
    complaint_id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    serial_number: { type: String, required: true },
    issue: { type: String, required: true },
    current_status: { type: String, default: 'Investigating' },
    created_at: { type: Date, default: Date.now },
    estimated_resolution: { 
        type: Date, 
        default: () => new Date(Date.now() + 86400000 * 3) // 3 days later
    }
});

const Complaint = mongoose.models.Complaint || mongoose.model('Complaint', complaintSchema);

app.post('/api/device', (req, res) => {
    const data = req.body;
    if (data.action === 'test_started') {
        const testId = 'TEST-' + Math.floor(100000 + Math.random() * 900000);
        return res.json({ 
            status: 'success', 
            message: 'Test started logged successfully',
            test_id: testId 
        });
    }
    res.json({ status: 'success', message: 'Data logged successfully' });
});

app.post('/api/complaint', async (req, res) => {
    try {
        const { name, email, serial_number, issue } = req.body;
        const complaintId = 'CMP-' + Math.floor(10000 + Math.random() * 90000);
        
        const newComplaint = new Complaint({
            complaint_id: complaintId,
            name,
            email,
            serial_number,
            issue
        });

        await newComplaint.save();

        res.json({ 
            status: 'success', 
            message: 'Complaint lodged successfully',
            complaint_id: complaintId
        });
    } catch (err) {
        console.error('Error saving complaint:', err);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});

app.get('/api/complaint/status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const complaint = await Complaint.findOne({ complaint_id: id });

        if (!complaint) {
            return res.status(404).json({ status: 'error', message: 'Complaint not found' });
        }

        res.json({
            status: 'success',
            data: complaint
        });
    } catch (err) {
        console.error('Error fetching status:', err);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});

export default app;
