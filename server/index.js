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

// List Zones (Domains) with pagination support
app.get('/api/zones', async (req, res) => {
    try {
        console.log('--- Fetching Zones ---');
        let allZones = [];
        let page = 1;
        let totalPages = 1;

        do {
            console.log(`Requesting page ${page}...`);
            const response = await axios.get(`${CLOUDFLARE_API_URL}/zones`, {
                headers: getHeaders(req),
                params: {
                    page: page,
                    per_page: 50,
                    direction: 'asc'
                }
            });

            if (response.data.success) {
                const { result, result_info } = response.data;
                allZones = [...allZones, ...result];
                totalPages = result_info.total_pages;
                console.log(`Received ${result.length} zones. Total so far: ${allZones.length} / ${result_info.total_count}`);
                page++;
            } else {
                throw new Error('Cloudflare API returned success: false');
            }
        } while (page <= totalPages);

        console.log(`Fetch complete. Sending ${allZones.length} zones to frontend.`);
        res.json({ result: allZones });
    } catch (error) {
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

// Create Redirect Rule (URL Forwarding)
// Cloudflare uses Rulesets for Redirect Rules now.
app.post('/api/zones/:id/redirect_rules', async (req, res) => {
    try {
        const zoneId = req.params.id;
        const { source_url, target_url, status_code = 301 } = req.body;

        // 1. Get current ruleset for dynamic redirects
        const rulesetsRes = await axios.get(`${CLOUDFLARE_API_URL}/zones/${zoneId}/rulesets`, {
            headers: getHeaders(req)
        });

        const redirectRuleset = rulesetsRes.data.result.find(r => r.phase === 'http_request_dynamic_redirect');

        let rulesetId;
        let existingRules = [];

        if (redirectRuleset) {
            rulesetId = redirectRuleset.id;
            const fullRuleset = await axios.get(`${CLOUDFLARE_API_URL}/zones/${zoneId}/rulesets/${rulesetId}`, {
                headers: getHeaders(req)
            });
            existingRules = fullRuleset.data.result.rules || [];
        } else {
            // Create ruleset if it doesn't exist
            const newRuleset = await axios.post(`${CLOUDFLARE_API_URL}/zones/${zoneId}/rulesets`, {
                name: 'Default Redirect Ruleset',
                phase: 'http_request_dynamic_redirect',
                kind: 'zone'
            }, { headers: getHeaders(req) });
            rulesetId = newRuleset.data.result.id;
        }

        // 2. Add new rule
        const newRule = {
            action: 'redirect',
            action_parameters: {
                from_value: {
                    status_code,
                    target_url: { value: target_url },
                    preserve_query_string: true
                }
            },
            expression: `(http.request.full_uri eq "${source_url}") or (http.host eq "${source_url}")`,
            description: `Redirect from ${source_url}`
        };

        const updatedRules = [...existingRules, newRule];

        const response = await axios.put(`${CLOUDFLARE_API_URL}/zones/${zoneId}/rulesets/${rulesetId}`, {
            rules: updatedRules
        }, { headers: getHeaders(req) });

        res.json(response.data);
    } catch (error) {
        handleError(res, error);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
