import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json());

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

app.post('/api/complaint', (req, res) => {
    const complaintId = 'CMP-' + Math.floor(10000 + Math.random() * 90000);
    res.json({ 
        status: 'success', 
        message: 'Complaint lodged successfully',
        complaint_id: complaintId
    });
});

app.get('/api/complaint/status/:id', (req, res) => {
    const { id } = req.params;
    res.json({
        status: 'success',
        data: {
            complaint_id: id,
            current_status: 'Investigating',
            created_at: new Date(Date.now() - 86400000).toISOString(),
            estimated_resolution: new Date(Date.now() + 86400000 * 2).toISOString()
        }
    });
});

export default app;
