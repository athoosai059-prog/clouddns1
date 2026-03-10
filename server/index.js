import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4';

// Helper to create Cloudflare API client headers
const getHeaders = (req) => {
    const token = req.headers.authorization;
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
};

// Error handler helper
const handleError = (res, error) => {
    console.error(error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
        error: error.response?.data?.errors?.[0]?.message || error.message,
        details: error.response?.data || null
    });
};

// List Zones (Domains) with pagination and search support
app.get('/api/zones', async (req, res) => {
    try {
        const { search, page = 1, per_page = 50 } = req.query;
        console.log(`--- Fetching Zones (Page: ${page}, Search: "${search || 'None'}") ---`);

        const params = {
            page: page,
            per_page: per_page,
            direction: 'asc',
            status: 'active'
        };

        // Cloudflare's name filter typically expects an exact match for the zone name.
        // If a search term is provided, we pass it as is.
        if (search) {
            params.name = search;
        }

        const response = await axios.get(`${CLOUDFLARE_API_URL}/zones`, {
            headers: getHeaders(req),
            params
        });

        if (response.data.success) {
            res.json(response.data);
        } else {
            console.error('Cloudflare Error Body:', JSON.stringify(response.data, null, 2));
            throw new Error('Cloudflare API returned success: false');
        }
    } catch (error) {
        if (error.response) {
            console.error('Cloudflare Error Details (400):', JSON.stringify(error.response.data, null, 2));
        }
        console.error('Zone fetch error:', error.message);
        handleError(res, error);
    }
});

// List DNS Records for a Zone
app.get('/api/zones/:id/dns_records', async (req, res) => {
    try {
        const response = await axios.get(`${CLOUDFLARE_API_URL}/zones/${req.params.id}/dns_records`, {
            headers: getHeaders(req)
        });
        res.json(response.data);
    } catch (error) {
        handleError(res, error);
    }
});

// Create DNS Record
app.post('/api/zones/:id/dns_records', async (req, res) => {
    try {
        const response = await axios.post(`${CLOUDFLARE_API_URL}/zones/${req.params.id}/dns_records`, req.body, {
            headers: getHeaders(req)
        });
        res.json(response.data);
    } catch (error) {
        handleError(res, error);
    }
});

// Delete DNS Record
app.delete('/api/zones/:zoneId/dns_records/:recordId', async (req, res) => {
    try {
        const response = await axios.delete(`${CLOUDFLARE_API_URL}/zones/${req.params.zoneId}/dns_records/${req.params.recordId}`, {
            headers: getHeaders(req)
        });
        res.json(response.data);
    } catch (error) {
        handleError(res, error);
    }
});

// Update DNS Record
app.put('/api/zones/:zoneId/dns_records/:recordId', async (req, res) => {
    try {
        const response = await axios.put(`${CLOUDFLARE_API_URL}/zones/${req.params.zoneId}/dns_records/${req.params.recordId}`, req.body, {
            headers: getHeaders(req)
        });
        res.json(response.data);
    } catch (error) {
        handleError(res, error);
    }
});

// Bulk Create DNS Records
app.post('/api/zones/:id/dns_records/bulk', async (req, res) => {
    const { records } = req.body;
    const results = [];
    const errors = [];

    for (const record of records) {
        try {
            const response = await axios.post(`${CLOUDFLARE_API_URL}/zones/${req.params.id}/dns_records`, record, {
                headers: getHeaders(req)
            });
            results.push(response.data.result);
        } catch (error) {
            errors.push({
                record,
                error: error.response?.data?.errors?.[0]?.message || error.message
            });
        }
    }

    res.json({ success: true, results, errors });
});

// Bulk Create Zones (Domains)
app.post('/api/zones/bulk', async (req, res) => {
    const { domains } = req.body;
    const results = [];
    const errors = [];

    for (const domainName of domains) {
        try {
            const response = await axios.post(`${CLOUDFLARE_API_URL}/zones`, {
                name: domainName,
                account: req.body.account, // Optional: if token has multiple accounts
                jump_start: true
            }, {
                headers: getHeaders(req)
            });
            results.push(response.data.result);
        } catch (error) {
            errors.push({
                domain: domainName,
                error: error.response?.data?.errors?.[0]?.message || error.message
            });
        }
    }

    res.json({ success: true, results, errors });
});

// Create Redirect Rule (URL Forwarding) via Page Rules
// Page Rules API works on all plans and only requires Zone > Page Rules: Edit permission.
app.post('/api/zones/:id/redirect_rules', async (req, res) => {
    try {
        const zoneId = req.params.id;
        const { source_url, target_url, status_code = 301 } = req.body;

        console.log('--- Creating Page Rule ---');
        console.log('Zone ID:', zoneId);
        console.log('Source:', source_url, '→ Target:', target_url, '| Status:', status_code);

        const payload = {
            targets: [
                {
                    target: 'url',
                    constraint: {
                        operator: 'matches',
                        value: source_url
                    }
                }
            ],
            actions: [
                {
                    id: 'forwarding_url',
                    value: {
                        url: target_url,
                        status_code: status_code
                    }
                }
            ],
            status: 'active'
        };

        console.log('Payload:', JSON.stringify(payload, null, 2));

        const response = await axios.post(
            `${CLOUDFLARE_API_URL}/zones/${zoneId}/pagerules`,
            payload,
            { headers: getHeaders(req) }
        );

        console.log('Response success:', response.data.success);
        console.log('Response:', JSON.stringify(response.data, null, 2));

        res.json(response.data);
    } catch (error) {
        console.error('Page Rule Error:', error.response?.data || error.message);
        handleError(res, error);
    }
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

export default app;
