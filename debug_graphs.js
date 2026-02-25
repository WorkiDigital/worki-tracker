require('dotenv').config();
const TrackingService = require('./src/services/tracking');

async function test() {
    try {
        console.log('Testing getDashboardGraphs with NO filters...');
        const result = await TrackingService.getDashboardGraphs({});
        console.log('Success:', Object.keys(result));
    } catch (e) {
        console.error('FAILED:', e);
    }
}

test();
